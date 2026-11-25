import re
from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, object_session

from app.api.deps import get_current_user, require_villa_context
from app.core.date_utils import get_kolkata_now, get_kolkata_today
from app.db.session import get_db
from app.models import (
    ServiceRequest,
    Staff,
    StayBooking,
    StayStatus,
    SeasonalRate,
    Unit,
    UnitBlock,
    UnitCategory,
    User,
    Villa,
    VillaBookingStatusHistory,
    VillaGuest,
    VillaInvoice,
    VillaInvoiceItem,
    VillaPayment,
    VillaPaymentReversal,
    VillaPropertySettings,
    VillaService,
)
from app.services.entity_image_service import (
    build_image_response,
    delete_entity_image,
    get_entity_image,
    save_or_replace_entity_image,
    validate_image_file,
)
from app.services.villas_service import (
    ACTIVE_STAY_STATUSES,
    HHMM_PATTERN,
    acquire_unit_locks,
    build_checkout_summary,
    compute_booking_schedule,
    compute_invoice_financials,
    format_date_with_time,
    format_time_12h,
    generate_villa_invoice_pdf,
    get_or_create_villa_settings,
    money,
    normalize_time_override,
    normalize_villa_context,
    record_booking_status_history,
    record_villa_payment,
    record_villa_refund,
    resolve_stay_policy,
    sync_villa_invoice,
    to_kolkata_aware,
    transition_villa_booking_status,
)

router = APIRouter(tags=["Villas & Units"], dependencies=[Depends(require_villa_context)])


class VillaInput(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str | None = None
    address: str | None = None
    check_in_time: str | None = None
    check_out_time: str | None = None
    late_checkout_fee: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    is_active: bool = True

    @field_validator("check_in_time", "check_out_time")
    @classmethod
    def valid_optional_time(cls, value: str | None) -> str | None:
        return normalize_time_override(value)


class CategoryInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str | None = None
    is_active: bool = True


class UnitInput(BaseModel):
    villa_id: int
    category_id: int
    name: str = Field(min_length=1, max_length=100)
    capacity: int = Field(ge=1, le=100)
    bedrooms: int = Field(default=1, ge=0, le=100)
    base_rate: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    description: str | None = None
    check_in_time: str | None = None
    check_out_time: str | None = None
    late_checkout_fee: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    is_active: bool = True

    @field_validator("check_in_time", "check_out_time")
    @classmethod
    def valid_optional_time(cls, value: str | None) -> str | None:
        return normalize_time_override(value)


class VillaSettingsUpdate(BaseModel):
    default_check_in_time: str = Field(min_length=4, max_length=5)
    default_check_out_time: str = Field(min_length=4, max_length=5)
    late_checkout_grace_minutes: int = Field(ge=0, le=720)
    default_late_checkout_fee: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)

    @field_validator("default_check_in_time", "default_check_out_time")
    @classmethod
    def valid_required_time(cls, value: str) -> str:
        cleaned = (value or "").strip()
        if not HHMM_PATTERN.fullmatch(cleaned):
            raise ValueError("Time must be in 24-hour HH:MM format (e.g. 14:00).")
        return cleaned


class DateRangeInput(BaseModel):
    unit_id: int
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def ordered_dates(self):
        if self.end_date <= self.start_date:
            raise ValueError("End date must be after start date.")
        return self


class RateInput(DateRangeInput):
    name: str = Field(min_length=2, max_length=100)
    nightly_rate: Decimal = Field(gt=0, max_digits=12, decimal_places=2)


class BlockInput(DateRangeInput):
    block_type: str = Field(default="Maintenance", max_length=30)
    reason: str = Field(min_length=2, max_length=255)
    description: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def valid_block_type(self):
        allowed = {"Maintenance", "Owner", "Renovation", "Other"}
        if self.block_type not in allowed:
            raise ValueError(f"Block type must be one of {sorted(allowed)}.")
        return self


class GuestInput(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    phone: str = Field(min_length=7, max_length=20)
    email: str | None = Field(default=None, max_length=150)
    address: str | None = None
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    country: str | None = Field(default="India", max_length=100)
    notes: str | None = Field(default=None, max_length=1000)
    preferences: str | None = Field(default=None, max_length=1000)
    is_active: bool = True

    @field_validator("full_name")
    @classmethod
    def clean_full_name(cls, value: str) -> str:
        trimmed = value.strip()
        if len(trimmed) < 2:
            raise ValueError("Guest name must contain at least 2 characters.")
        return trimmed

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, value: str) -> str:
        trimmed = value.strip()
        digits = re.sub(r"\D", "", trimmed)
        if len(digits) < 7 or len(digits) > 15:
            raise ValueError("Phone number must contain between 7 and 15 digits.")
        return trimmed

    @field_validator("email")
    @classmethod
    def clean_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip().lower()
        if not trimmed:
            return None
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", trimmed):
            raise ValueError("Enter a valid email address.")
        return trimmed


class GuestUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    phone: str | None = Field(default=None, min_length=7, max_length=20)
    email: str | None = Field(default=None, max_length=150)
    address: str | None = None
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    country: str | None = Field(default=None, max_length=100)
    notes: str | None = Field(default=None, max_length=1000)
    preferences: str | None = Field(default=None, max_length=1000)
    is_active: bool | None = None

    @field_validator("full_name")
    @classmethod
    def clean_opt_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if len(trimmed) < 2:
            raise ValueError("Guest name must contain at least 2 characters.")
        return trimmed

    @field_validator("phone")
    @classmethod
    def clean_opt_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        digits = re.sub(r"\D", "", trimmed)
        if len(digits) < 7 or len(digits) > 15:
            raise ValueError("Phone number must contain between 7 and 15 digits.")
        return trimmed

    @field_validator("email")
    @classmethod
    def clean_opt_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip().lower()
        if not trimmed:
            return None
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", trimmed):
            raise ValueError("Enter a valid email address.")
        return trimmed


class BookingInput(BaseModel):
    unit_id: int
    guest_id: int | None = None
    guest: GuestInput | None = None
    customer_id: int | None = None
    customer: GuestInput | None = None
    check_in: date
    check_out: date
    guests: int = Field(ge=1, le=100)
    notes: str | None = None

    @model_validator(mode="after")
    def valid_dates_and_guest(self):
        if self.check_out <= self.check_in:
            raise ValueError("Check-out must be after check-in.")
        selected_id = self.guest_id or self.customer_id
        new_guest = self.guest or self.customer
        if bool(selected_id) == bool(new_guest):
            raise ValueError("Choose an existing guest or enter new guest details.")
        return self


class BookingUpdate(BaseModel):
    unit_id: int | None = None
    guest_id: int | None = None
    customer_id: int | None = None
    check_in: date | None = None
    check_out: date | None = None
    guests: int | None = Field(default=None, ge=1, le=100)
    notes: str | None = None

    @model_validator(mode="after")
    def require_update(self):
        if not self.model_fields_set:
            raise ValueError("Provide at least one booking field to update.")
        return self


class HousekeepingUpdate(BaseModel):
    status: str

    @model_validator(mode="after")
    def valid_status(self):
        if self.status not in {"Ready", "Inspected", "Needs Cleaning", "Cleaning", "Out of Order"}:
            raise ValueError("Invalid housekeeping status.")
        return self


class ServiceInput(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str | None = None
    price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    is_active: bool = True


class RequestInput(BaseModel):
    service_id: int
    staff_id: int | None = None
    quantity: int = Field(default=1, ge=1, le=100)
    scheduled_for: datetime | None = None
    notes: str | None = None


class BookingStatusInput(BaseModel):
    status: str | None = None
    reason: str | None = Field(default=None, max_length=500)


class RefundInput(BaseModel):
    payment_id: int | None = None
    refund_amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    refund_method: str | None = Field(default=None, pattern="^(UPI|Card|Net Banking|Cash)$")
    refund_reference: str | None = Field(default=None, max_length=100)
    reason: str = Field(min_length=2, max_length=500)


def as_dict(obj, *, exclude=None):
    excluded = set(exclude or ())
    return {column.name: getattr(obj, column.name) for column in obj.__table__.columns if column.name not in excluded}


def unit_or_404(db, unit_id):
    item = db.get(Unit, unit_id)
    if not item:
        raise HTTPException(404, "Unit not found.")
    return item


def _settings_view(row: VillaPropertySettings) -> dict:
    return {
        "id": row.id,
        "default_check_in_time": row.default_check_in_time,
        "default_check_in_time_display": format_time_12h(row.default_check_in_time),
        "default_check_out_time": row.default_check_out_time,
        "default_check_out_time_display": format_time_12h(row.default_check_out_time),
        "late_checkout_grace_minutes": int(row.late_checkout_grace_minutes),
        "default_late_checkout_fee": money(row.default_late_checkout_fee) if row.default_late_checkout_fee is not None else None,
        "timezone": "Asia/Kolkata",
    }


@router.get("/settings")
def get_villas_settings(db: Session = Depends(get_db)):
    row = get_or_create_villa_settings(db)
    return _settings_view(row)


@router.put("/settings")
@router.patch("/settings")
def update_villas_settings(data: VillaSettingsUpdate, db: Session = Depends(get_db)):
    row = get_or_create_villa_settings(db)
    row.default_check_in_time = data.default_check_in_time
    row.default_check_out_time = data.default_check_out_time
    row.late_checkout_grace_minutes = data.late_checkout_grace_minutes
    row.default_late_checkout_fee = (
        money(data.default_late_checkout_fee) if data.default_late_checkout_fee is not None else None
    )
    db.commit()
    db.refresh(row)
    return _settings_view(row)


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    today = get_kolkata_today()
    bookings = db.query(StayBooking).filter(StayBooking.status.in_(ACTIVE_STAY_STATUSES)).all()
    checked_in = sum(b.status == "Checked In" for b in bookings)
    occupied = {b.unit_id for b in bookings if b.status == "Checked In" and b.check_in <= today < b.check_out}
    active_unit_rows = db.query(Unit).filter(Unit.is_active.is_(True)).all()
    active_units = len(active_unit_rows)
    available_units = sum(
        unit.villa.is_active and unit_can_be_booked(unit, today) and unit_availability(db, unit.id, today, today + timedelta(days=1))
        for unit in active_unit_rows
    )
    out_of_order_units = sum(unit.housekeeping_status == "Out of Order" for unit in active_unit_rows)
    needs_housekeeping_units = sum(unit.housekeeping_status in {"Needs Cleaning", "Cleaning"} for unit in active_unit_rows)
    occupancy_rate = round((len(occupied) / active_units) * 100, 1) if active_units else 0.0
    departures_today = db.query(StayBooking).filter(
        StayBooking.check_out == today,
        StayBooking.status.in_([StayStatus.CHECKED_IN.value, StayStatus.CHECKED_OUT.value]),
    ).count()

    gross_revenue = money(db.query(func.coalesce(func.sum(VillaPayment.amount), 0)).scalar())
    refunded_total = money(db.query(func.coalesce(func.sum(VillaPaymentReversal.refund_amount), 0)).scalar())
    revenue = max(Decimal("0.00"), money(gross_revenue - refunded_total))

    non_void_invoices = db.query(VillaInvoice).filter(VillaInvoice.payment_status != "Void").all()
    outstanding_balance = money(
        sum((compute_invoice_financials(db, inv)["balance_due"] for inv in non_void_invoices), Decimal("0.00"))
    )

    return {
        "villas": db.query(Villa).filter(Villa.is_active.is_(True)).count(),
        "units": active_units,
        "occupied_units": len(occupied),
        "available_units": available_units,
        "out_of_order_units": out_of_order_units,
        "needs_housekeeping_units": needs_housekeeping_units,
        "occupancy_rate": occupancy_rate,
        "arrivals_today": sum(b.check_in == today for b in bookings),
        "departures_today": departures_today,
        "checked_in": checked_in,
        "revenue_received": revenue,
        "outstanding_balance": outstanding_balance,
        "upcoming_bookings": [booking_view(b, db=db) for b in sorted(bookings, key=lambda x: (x.check_in, x.id))[:8]],
    }


@router.get("/reports")
def villas_reports(
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
):
    today = get_kolkata_today()
    period_start = start_date or (today - timedelta(days=30))
    period_end = end_date or (today + timedelta(days=30))
    if period_end < period_start:
        raise HTTPException(422, "End date must be on or after start date.")

    all_bookings = db.query(StayBooking).order_by(StayBooking.check_in.desc(), StayBooking.id.desc()).all()
    if start_date or end_date:
        bookings = [b for b in all_bookings if b.check_in <= period_end and b.check_out >= period_start]
    else:
        bookings = all_bookings

    active_units = db.query(Unit).filter(Unit.is_active.is_(True)).all()
    period_days = max(1, (period_end - period_start).days + 1)
    available_unit_nights = len(active_units) * period_days

    status_counts = {s.value: 0 for s in StayStatus}
    nights_sold = 0
    accommodation_revenue = Decimal("0.00")
    unit_stats: dict[int, dict] = {
        u.id: {
            "unit_id": u.id,
            "unit_name": u.name,
            "villa_name": u.villa.name if u.villa else "",
            "stays": 0,
            "nights_sold": 0,
            "accommodation_revenue": Decimal("0.00"),
        }
        for u in db.query(Unit).all()
    }

    for b in bookings:
        status_counts[b.status] = status_counts.get(b.status, 0) + 1
        if b.status not in {StayStatus.CANCELLED.value, StayStatus.NO_SHOW.value}:
            nights = max(1, (b.check_out - b.check_in).days)
            nights_sold += nights
            accommodation_revenue = money(accommodation_revenue + money(b.total_amount))
            if b.unit_id in unit_stats:
                unit_stats[b.unit_id]["stays"] += 1
                unit_stats[b.unit_id]["nights_sold"] += nights
                unit_stats[b.unit_id]["accommodation_revenue"] = money(
                    unit_stats[b.unit_id]["accommodation_revenue"] + money(b.total_amount)
                )

    booking_ids = {b.id for b in bookings}
    invoices = (
        db.query(VillaInvoice).filter(VillaInvoice.booking_id.in_(booking_ids)).all()
        if booking_ids
        else []
    )
    service_requests = (
        db.query(ServiceRequest)
        .filter(ServiceRequest.booking_id.in_(booking_ids), ServiceRequest.status == "Completed")
        .all()
        if booking_ids
        else []
    )
    service_revenue = money(sum((money(r.unit_price * r.quantity) for r in service_requests), Decimal("0.00")))

    total_invoiced = Decimal("0.00")
    tax_collected = Decimal("0.00")
    net_revenue_received = Decimal("0.00")
    total_refunded = Decimal("0.00")
    outstanding_balance = Decimal("0.00")
    late_checkout_revenue = Decimal("0.00")
    for inv in invoices:
        fin = compute_invoice_financials(db, inv)
        net_revenue_received = money(net_revenue_received + fin["paid_amount"])
        total_refunded = money(total_refunded + fin["refunded_amount"])
        if inv.payment_status != "Void":
            total_invoiced = money(total_invoiced + money(inv.total_amount))
            tax_collected = money(tax_collected + money(inv.tax_amount))
            outstanding_balance = money(outstanding_balance + fin["balance_due"])
            for it in inv.items:
                if it.item_type == "LATE_CHECKOUT":
                    late_checkout_revenue = money(late_checkout_revenue + money(it.total_amount))

    total_stays = len(bookings)
    cancelled_or_noshow = status_counts.get(StayStatus.CANCELLED.value, 0) + status_counts.get(StayStatus.NO_SHOW.value, 0)
    adr = money(accommodation_revenue / Decimal(nights_sold)) if nights_sold > 0 else Decimal("0.00")
    occupancy_rate = round(min(100.0, (nights_sold / available_unit_nights) * 100), 1) if available_unit_nights > 0 else 0.0
    cancellation_rate = round((cancelled_or_noshow / total_stays) * 100, 1) if total_stays > 0 else 0.0

    guests = db.query(VillaGuest).all()
    guest_rows = []
    repeat_guests = 0
    for g in guests:
        g_bookings = [b for b in g.bookings if b.status not in {StayStatus.CANCELLED.value, StayStatus.NO_SHOW.value}]
        if len(g_bookings) >= 2:
            repeat_guests += 1
        g_spend = Decimal("0.00")
        for b in g.bookings:
            if b.invoice and b.invoice.payment_status != "Void":
                g_spend = money(g_spend + money(b.invoice.total_amount))
        if g.bookings:
            guest_rows.append(
                {
                    "id": g.id,
                    "guest_reference": g.guest_reference,
                    "full_name": g.full_name,
                    "phone": g.phone,
                    "stays": len(g.bookings),
                    "total_spending": g_spend,
                }
            )
    guest_rows.sort(key=lambda item: (-float(item["total_spending"]), -item["stays"]))

    return {
        "period": {"start_date": period_start, "end_date": period_end},
        "summary": {
            "total_villas": db.query(Villa).filter(Villa.is_active.is_(True)).count(),
            "total_units": len(active_units),
            "total_stays": total_stays,
            "active_stays": sum(status_counts.get(s, 0) for s in ACTIVE_STAY_STATUSES),
            "checked_in_stays": status_counts.get(StayStatus.CHECKED_IN.value, 0),
            "checked_out_stays": status_counts.get(StayStatus.CHECKED_OUT.value, 0),
            "cancelled_stays": status_counts.get(StayStatus.CANCELLED.value, 0),
            "no_show_stays": status_counts.get(StayStatus.NO_SHOW.value, 0),
            "cancellation_no_show_rate": cancellation_rate,
            "nights_sold": nights_sold,
            "available_unit_nights": available_unit_nights,
            "occupancy_rate": occupancy_rate,
            "adr": adr,
            "accommodation_revenue": accommodation_revenue,
            "service_revenue": service_revenue,
            "late_checkout_revenue": late_checkout_revenue,
            "tax_collected": tax_collected,
            "total_invoiced": total_invoiced,
            "net_revenue_received": net_revenue_received,
            "total_refunded": total_refunded,
            "outstanding_balance": outstanding_balance,
        },
        "status_breakdown": status_counts,
        "unit_performance": sorted(unit_stats.values(), key=lambda x: (-x["nights_sold"], x["unit_name"])),
        "guest_summary": {
            "total_guests": len(guests),
            "active_guests": sum(1 for g in guests if g.is_active),
            "repeat_guests": repeat_guests,
            "top_guests": guest_rows[:10],
        },
    }


@router.get("/villas")
def list_villas(db: Session = Depends(get_db)):
    today = get_kolkata_today()
    settings_row = get_or_create_villa_settings(db)
    occupied_unit_ids = {
        b.unit_id
        for b in db.query(StayBooking)
        .filter(
            StayBooking.status == StayStatus.CHECKED_IN.value,
            StayBooking.check_in <= today,
            StayBooking.check_out > today,
        )
        .all()
    }
    rows = []
    for v in db.query(Villa).order_by(Villa.name).all():
        policy = resolve_stay_policy(db, villa=v, settings_row=settings_row)
        rows.append(
            {
                **as_dict(v),
                "unit_count": len(v.units),
                "active_unit_count": sum(1 for u in v.units if u.is_active),
                "occupied_units_today": sum(1 for u in v.units if u.id in occupied_unit_ids),
                "effective_check_in_time": policy["check_in_time"],
                "effective_check_in_time_display": policy["check_in_time_display"],
                "effective_check_out_time": policy["check_out_time"],
                "effective_check_out_time_display": policy["check_out_time_display"],
                "effective_late_checkout_fee": policy["late_checkout_fee"],
                "late_checkout_grace_minutes": policy["late_checkout_grace_minutes"],
            }
        )
    return rows


@router.post("/villas", status_code=201)
def create_villa(data: VillaInput, db: Session = Depends(get_db)):
    return save_record(db, Villa(**data.model_dump()))


@router.patch("/villas/{villa_id}")
def update_villa(villa_id: int, data: VillaInput, db: Session = Depends(get_db)):
    row = db.get(Villa, villa_id)
    if not row: raise HTTPException(404, "Villa not found.")
    for key, value in data.model_dump().items(): setattr(row, key, value)
    return save_record(db, row)


@router.delete("/villas/{villa_id}")
def delete_villa(villa_id: int, db: Session = Depends(get_db)):
    row = db.get(Villa, villa_id)
    if not row: raise HTTPException(404, "Villa not found.")
    if row.units: raise HTTPException(409, "Move or remove its units before deleting this villa.")
    delete_entity_image(db, "villa_property", villa_id, business_context="villas")
    db.delete(row); db.commit(); return {"message": "Villa deleted."}


@router.post("/villas/{villa_id}/image")
async def upload_villa_image(
    villa_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    row = db.get(Villa, villa_id)
    if not row:
        raise HTTPException(404, "Villa not found.")
    image_bytes, mime_type, file_size, checksum = await validate_image_file(file)
    img_record = save_or_replace_entity_image(
        db=db,
        entity_type="villa_property",
        business_context="villas",
        entity_id=row.id,
        image_data=image_bytes,
        mime_type=mime_type,
        file_size=file_size,
        checksum=checksum,
    )
    version = int(img_record.updated_at.timestamp())
    row.image_url = f"/api/villas/villas/{row.id}/image?v={version}"
    db.commit()
    db.refresh(row)
    return {
        **as_dict(row),
        "unit_count": len(row.units),
        "active_unit_count": sum(1 for u in row.units if u.is_active),
    }


@router.get("/villas/{villa_id}/image")
def get_villa_image(villa_id: int, request: Request, db: Session = Depends(get_db)):
    row = db.get(Villa, villa_id)
    if not row:
        raise HTTPException(404, "Villa not found.")
    img_record = get_entity_image(db, "villa_property", row.id, business_context="villas")
    if not img_record:
        raise HTTPException(404, "Villa cover image not found.")
    return build_image_response(img_record, request.headers.get("if-none-match"))


@router.delete("/villas/{villa_id}/image")
def remove_villa_image(villa_id: int, db: Session = Depends(get_db)):
    row = db.get(Villa, villa_id)
    if not row:
        raise HTTPException(404, "Villa not found.")
    delete_entity_image(db, "villa_property", row.id, business_context="villas")
    row.image_url = None
    db.commit()
    db.refresh(row)
    return {
        **as_dict(row),
        "unit_count": len(row.units),
        "active_unit_count": sum(1 for u in row.units if u.is_active),
    }


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    rows = db.query(UnitCategory).order_by(UnitCategory.name).all()
    counts = dict(db.query(Unit.category_id, func.count(Unit.id)).group_by(Unit.category_id).all())
    return [{**as_dict(row), "unit_count": int(counts.get(row.id, 0))} for row in rows]


@router.post("/categories", status_code=201)
def create_category(data: CategoryInput, db: Session = Depends(get_db)):
    return save_record(db, UnitCategory(**data.model_dump()))


@router.patch("/categories/{category_id}")
def update_category(category_id: int, data: CategoryInput, db: Session = Depends(get_db)):
    row = db.get(UnitCategory, category_id)
    if not row: raise HTTPException(404, "Unit category not found.")
    for key, value in data.model_dump().items(): setattr(row, key, value)
    return save_record(db, row)


@router.delete("/categories/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db)):
    row = db.get(UnitCategory, category_id)
    if not row: raise HTTPException(404, "Unit category not found.")
    if db.query(Unit).filter(Unit.category_id == category_id).first(): raise HTTPException(409, "Category is assigned to a unit; deactivate it instead.")
    db.delete(row); db.commit(); return {"message": "Unit category deleted."}


@router.get("/units")
def list_units(db: Session = Depends(get_db), villa_id: int | None = None, active: bool | None = None):
    query = db.query(Unit).order_by(Unit.name)
    if villa_id: query = query.filter(Unit.villa_id == villa_id)
    if active is not None: query = query.filter(Unit.is_active.is_(active))
    today = get_kolkata_today()
    tomorrow = today + timedelta(days=1)
    settings_row = get_or_create_villa_settings(db)
    results = []
    for u in query.all():
        policy = resolve_stay_policy(db, unit=u, settings_row=settings_row)
        results.append(
            {
                **as_dict(u),
                "villa_name": u.villa.name,
                "category_name": u.category.name,
                "availability": (
                    u.is_active
                    and bool(u.villa and u.villa.is_active)
                    and unit_can_be_booked(u, today)
                    and unit_availability(db, u.id, today, tomorrow)
                ),
                "effective_check_in_time": policy["check_in_time"],
                "effective_check_in_time_display": policy["check_in_time_display"],
                "effective_check_out_time": policy["check_out_time"],
                "effective_check_out_time_display": policy["check_out_time_display"],
                "effective_late_checkout_fee": policy["late_checkout_fee"],
                "late_checkout_grace_minutes": policy["late_checkout_grace_minutes"],
            }
        )
    return results


@router.post("/units", status_code=201)
def create_unit(data: UnitInput, db: Session = Depends(get_db)):
    if not db.get(Villa, data.villa_id) or not db.get(UnitCategory, data.category_id): raise HTTPException(404, "Villa or unit category not found.")
    return save_record(db, Unit(**data.model_dump()))


@router.patch("/units/{unit_id}")
def update_unit(unit_id: int, data: UnitInput, db: Session = Depends(get_db)):
    row = unit_or_404(db, unit_id)
    if not db.get(Villa, data.villa_id) or not db.get(UnitCategory, data.category_id):
        raise HTTPException(404, "Villa or unit category not found.")
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    return save_record(db, row)


@router.patch("/units/{unit_id}/housekeeping")
def update_housekeeping(unit_id: int, data: HousekeepingUpdate, db: Session = Depends(get_db)):
    row = unit_or_404(db, unit_id)
    row.housekeeping_status = data.status
    return save_record(db, row)


@router.delete("/units/{unit_id}")
def delete_unit(unit_id: int, db: Session = Depends(get_db)):
    row = unit_or_404(db, unit_id)
    if db.query(StayBooking).filter(StayBooking.unit_id == unit_id).first():
        raise HTTPException(409, "Unit has booking history; deactivate it instead.")
    delete_entity_image(db, "villa_unit", unit_id, business_context="villas")
    db.query(SeasonalRate).filter(SeasonalRate.unit_id == unit_id).delete(synchronize_session=False)
    db.query(UnitBlock).filter(UnitBlock.unit_id == unit_id).delete(synchronize_session=False)
    db.delete(row)
    db.commit()
    return {"message": "Unit deleted."}


@router.post("/units/{unit_id}/image")
async def upload_unit_image(
    unit_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    row = unit_or_404(db, unit_id)
    image_bytes, mime_type, file_size, checksum = await validate_image_file(file)
    img_record = save_or_replace_entity_image(
        db=db,
        entity_type="villa_unit",
        business_context="villas",
        entity_id=row.id,
        image_data=image_bytes,
        mime_type=mime_type,
        file_size=file_size,
        checksum=checksum,
    )
    version = int(img_record.updated_at.timestamp())
    row.image_url = f"/api/villas/units/{row.id}/image?v={version}"
    db.commit()
    db.refresh(row)
    today = get_kolkata_today()
    tomorrow = today + timedelta(days=1)
    return {
        **as_dict(row),
        "villa_name": row.villa.name,
        "category_name": row.category.name,
        "availability": row.is_active and unit_can_be_booked(row, today) and unit_availability(db, row.id, today, tomorrow),
    }


@router.get("/units/{unit_id}/image")
def get_unit_image(unit_id: int, request: Request, db: Session = Depends(get_db)):
    row = unit_or_404(db, unit_id)
    img_record = get_entity_image(db, "villa_unit", row.id, business_context="villas")
    if not img_record:
        raise HTTPException(404, "Unit cover image not found.")
    return build_image_response(img_record, request.headers.get("if-none-match"))


@router.delete("/units/{unit_id}/image")
def remove_unit_image(unit_id: int, db: Session = Depends(get_db)):
    row = unit_or_404(db, unit_id)
    delete_entity_image(db, "villa_unit", row.id, business_context="villas")
    row.image_url = None
    db.commit()
    db.refresh(row)
    today = get_kolkata_today()
    tomorrow = today + timedelta(days=1)
    return {
        **as_dict(row),
        "villa_name": row.villa.name,
        "category_name": row.category.name,
        "availability": row.is_active and unit_can_be_booked(row, today) and unit_availability(db, row.id, today, tomorrow),
    }


@router.get("/rates")
def list_rates(db: Session = Depends(get_db)):
    return [{**as_dict(r), "unit_name": r.unit.name} for r in db.query(SeasonalRate).join(Unit).order_by(SeasonalRate.start_date).all()]


@router.post("/rates", status_code=201)
def create_rate(data: RateInput, db: Session = Depends(get_db)):
    unit_or_404(db, data.unit_id)
    if db.query(SeasonalRate).filter(SeasonalRate.unit_id == data.unit_id, SeasonalRate.start_date < data.end_date, SeasonalRate.end_date > data.start_date).first(): raise HTTPException(409, "Seasonal rate dates overlap an existing rate for this unit.")
    return save_record(db, SeasonalRate(**data.model_dump()))


@router.patch("/rates/{rate_id}")
def update_rate(rate_id: int, data: RateInput, db: Session = Depends(get_db)):
    row = db.get(SeasonalRate, rate_id)
    if not row:
        raise HTTPException(404, "Seasonal rate not found.")
    unit_or_404(db, data.unit_id)
    overlap = (
        db.query(SeasonalRate)
        .filter(
            SeasonalRate.id != rate_id,
            SeasonalRate.unit_id == data.unit_id,
            SeasonalRate.start_date < data.end_date,
            SeasonalRate.end_date > data.start_date,
        )
        .first()
    )
    if overlap:
        raise HTTPException(409, "Seasonal rate dates overlap an existing rate for this unit.")
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    return save_record(db, row)


@router.delete("/rates/{rate_id}")
def delete_rate(rate_id: int, db: Session = Depends(get_db)):
    row = db.get(SeasonalRate, rate_id)
    if not row: raise HTTPException(404, "Seasonal rate not found.")
    db.delete(row); db.commit(); return {"message": "Seasonal rate deleted."}


@router.get("/blocks")
def list_blocks(db: Session = Depends(get_db)):
    return [{**as_dict(b), "unit_name": b.unit.name, "villa_name": b.unit.villa.name if b.unit and b.unit.villa else ""} for b in db.query(UnitBlock).join(Unit).order_by(UnitBlock.start_date).all()]


@router.post("/blocks", status_code=201)
def create_block(data: BlockInput, db: Session = Depends(get_db)):
    with acquire_unit_locks(db, [data.unit_id]):
        unit = db.get(Unit, data.unit_id)
        if not unit:
            raise HTTPException(404, "Unit not found.")
        conflict = (
            db.query(StayBooking)
            .filter(
                StayBooking.unit_id == data.unit_id,
                StayBooking.status.in_(ACTIVE_STAY_STATUSES),
                StayBooking.check_in < data.end_date,
                StayBooking.check_out > data.start_date,
            )
            .first()
        )
        if conflict:
            raise HTTPException(409, "This date range overlaps an active or confirmed stay.")
        return save_record(db, UnitBlock(**data.model_dump()))


@router.patch("/blocks/{block_id}")
def update_block(block_id: int, data: BlockInput, db: Session = Depends(get_db)):
    existing = db.get(UnitBlock, block_id)
    if not existing:
        raise HTTPException(404, "Block not found.")
    with acquire_unit_locks(db, [existing.unit_id, data.unit_id]):
        row = db.get(UnitBlock, block_id)
        if not row:
            raise HTTPException(404, "Block not found.")
        unit = db.get(Unit, data.unit_id)
        if not unit:
            raise HTTPException(404, "Unit not found.")
        conflict = (
            db.query(StayBooking)
            .filter(
                StayBooking.unit_id == data.unit_id,
                StayBooking.status.in_(ACTIVE_STAY_STATUSES),
                StayBooking.check_in < data.end_date,
                StayBooking.check_out > data.start_date,
            )
            .first()
        )
        if conflict:
            raise HTTPException(409, "This date range overlaps an active or confirmed stay.")
        for key, value in data.model_dump().items():
            setattr(row, key, value)
        return save_record(db, row)


@router.delete("/blocks/{block_id}")
def delete_block(block_id: int, db: Session = Depends(get_db)):
    row = db.get(UnitBlock, block_id)
    if not row: raise HTTPException(404, "Block not found.")
    db.delete(row); db.commit(); return {"message": "Availability block removed."}


@router.get("/availability")
def availability(start_date: date, end_date: date, guests: int = Query(default=1, ge=1), db: Session = Depends(get_db)):
    if start_date < get_kolkata_today():
        raise HTTPException(422, "Check-in date cannot be in the past.")
    if end_date <= start_date:
        raise HTTPException(422, "Check-out must be after check-in.")
    settings_row = get_or_create_villa_settings(db)
    units = db.query(Unit).filter(Unit.is_active.is_(True), Unit.capacity >= guests).order_by(Unit.name).all()
    results = []
    for u in units:
        nights = (end_date - start_date).days
        total = sum((effective_rate(db, u, date.fromordinal(start_date.toordinal() + n)) for n in range(nights)), Decimal("0.00"))
        policy = resolve_stay_policy(db, unit=u, settings_row=settings_row)
        results.append({
            **as_dict(u),
            "villa_name": u.villa.name,
            "category_name": u.category.name,
            "nightly_rate": str((total / nights).quantize(Decimal("0.01"))),
            "total": str(total),
            "effective_check_in_time": policy["check_in_time"],
            "effective_check_in_time_display": policy["check_in_time_display"],
            "effective_check_out_time": policy["check_out_time"],
            "effective_check_out_time_display": policy["check_out_time_display"],
            "effective_late_checkout_fee": policy["late_checkout_fee"],
            "available": (
                u.is_active
                and bool(u.villa and u.villa.is_active)
                and unit_can_be_booked(u, start_date)
                and unit_availability(db, u.id, start_date, end_date)
            ),
        })
    return results


@router.get("/bookings")
def list_bookings(
    db: Session = Depends(get_db),
    status: str | None = None,
    search: str | None = None,
    villa_id: int | None = None,
    unit_id: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
):
    q = db.query(StayBooking)
    if status:
        q = q.filter(StayBooking.status == status)
    if unit_id:
        q = q.filter(StayBooking.unit_id == unit_id)
    if villa_id:
        q = q.join(Unit, StayBooking.unit_id == Unit.id).filter(Unit.villa_id == villa_id)
    if start_date:
        q = q.filter(StayBooking.check_out >= start_date)
    if end_date:
        q = q.filter(StayBooking.check_in <= end_date)
    rows = q.order_by(StayBooking.check_in.desc(), StayBooking.id.desc()).all()
    if search and search.strip():
        needle = search.strip().lower()
        filtered = []
        for b in rows:
            guest_obj = b.guest or b.customer
            haystack = " ".join(
                filter(
                    None,
                    [
                        b.booking_number,
                        guest_obj.full_name if guest_obj else "",
                        guest_obj.phone if guest_obj else "",
                        getattr(b.guest, "guest_reference", None) or "",
                        b.unit.name if b.unit else "",
                        b.unit.villa.name if b.unit and b.unit.villa else "",
                    ],
                )
            ).lower()
            if needle in haystack:
                filtered.append(b)
        rows = filtered
    return [booking_view(b, db=db) for b in rows]


def _normalize_phone_digits(phone: str | None) -> str:
    return re.sub(r"\D", "", phone or "")


def _canonical_indian_digits(digits: str) -> str:
    if len(digits) == 12 and digits.startswith("91"):
        return digits[2:]
    if len(digits) == 11 and digits.startswith("0"):
        return digits[1:]
    return digits


def _ensure_unique_guest_contact(
    db: Session,
    phone: str | None,
    email: str | None,
    exclude_guest_id: int | None = None,
    from_booking: bool = False,
):
    if phone:
        norm_phone = _normalize_phone_digits(phone)
        canon_phone = _canonical_indian_digits(norm_phone)
        existing_guests = db.query(VillaGuest)
        if exclude_guest_id is not None:
            existing_guests = existing_guests.filter(VillaGuest.id != exclude_guest_id)
        for existing in existing_guests.all():
            existing_digits = _normalize_phone_digits(existing.phone)
            if (
                existing.phone == phone
                or (norm_phone and existing_digits == norm_phone)
                or (canon_phone and len(canon_phone) == 10 and _canonical_indian_digits(existing_digits) == canon_phone)
            ):
                suffix = " Select the existing guest instead." if from_booking else ""
                raise HTTPException(409, f"A guest with this phone number already exists.{suffix}")
    if email:
        q = db.query(VillaGuest).filter(func.lower(VillaGuest.email) == email.strip().lower())
        if exclude_guest_id is not None:
            q = q.filter(VillaGuest.id != exclude_guest_id)
        if q.first():
            suffix = " Select the existing guest instead." if from_booking else ""
            raise HTTPException(409, f"A guest with this email address already exists.{suffix}")


@router.post("/bookings", status_code=201)
def create_booking(data: BookingInput, db: Session = Depends(get_db), user=Depends(get_current_user)):
    actor_id = user.id
    today = get_kolkata_today()
    if data.check_in < today:
        raise HTTPException(422, "Check-in date cannot be in the past.")

    with acquire_unit_locks(db, [data.unit_id]):
        unit = db.get(Unit, data.unit_id)
        if not unit:
            raise HTTPException(404, "Unit not found.")
        if not unit.is_active or not unit.villa.is_active:
            raise HTTPException(409, "Unit or parent villa is inactive.")
        if not unit_can_be_booked(unit, data.check_in):
            raise HTTPException(409, "Unit is unavailable for bookings until housekeeping is complete.")
        if data.guests > unit.capacity:
            raise HTTPException(422, "Guest count exceeds unit capacity.")
        if not unit_availability(db, unit.id, data.check_in, data.check_out):
            raise HTTPException(409, "Unit is unavailable for those dates.")
        if data.check_in <= today and unit.housekeeping_status not in {"Ready", "Inspected"}:
            raise HTTPException(409, "Unit needs housekeeping before guest check-in.")

        selected_guest_id = data.guest_id or data.customer_id
        inline_guest_data = data.guest or data.customer
        if selected_guest_id:
            guest = db.get(VillaGuest, selected_guest_id)
            if not guest:
                raise HTTPException(404, "Guest not found.")
            if not guest.is_active:
                raise HTTPException(409, "Selected guest profile is inactive.")
        else:
            _ensure_unique_guest_contact(
                db,
                inline_guest_data.phone,
                inline_guest_data.email,
                from_booking=True,
            )
            guest = VillaGuest(**inline_guest_data.model_dump())
            db.add(guest)
            db.flush()

        nights = (data.check_out - data.check_in).days
        total = sum(
            (effective_rate(db, unit, date.fromordinal(data.check_in.toordinal() + n)) for n in range(nights)),
            Decimal("0.00"),
        )
        rate = (total / nights).quantize(Decimal("0.01"))
        row = StayBooking(
            unit_id=unit.id,
            guest_id=guest.id,
            customer_id=None,
            created_by=actor_id,
            check_in=data.check_in,
            check_out=data.check_out,
            guests=data.guests,
            nightly_rate=rate,
            total_amount=total,
            notes=data.notes,
        )
        db.add(row)
        db.flush()
        record_booking_status_history(
            db,
            booking_id=row.id,
            previous_status=None,
            new_status=row.status,
            changed_by=actor_id,
            reason="Booking created.",
        )
        sync_villa_invoice(db, row, finalize=False)
        db.commit()
        db.refresh(row)
        return booking_view(row, db=db)


@router.patch("/bookings/{booking_id}")
def update_booking(booking_id: int, data: BookingUpdate, db: Session = Depends(get_db)):
    existing = db.get(StayBooking, booking_id)
    if not existing:
        raise HTTPException(404, "Booking not found.")
    updates = data.model_dump(exclude_unset=True)
    target_unit_id = updates.get("unit_id", existing.unit_id)

    with acquire_unit_locks(db, [existing.unit_id, target_unit_id]):
        row = db.query(StayBooking).filter(StayBooking.id == booking_id).with_for_update().first()
        if not row:
            raise HTTPException(404, "Booking not found.")
        if row.status not in {"Reserved", "Confirmed"}:
            raise HTTPException(409, "Only reserved or confirmed stays can be edited.")
        unit_id = updates.get("unit_id", row.unit_id)
        start = updates.get("check_in", row.check_in)
        end = updates.get("check_out", row.check_out)
        guests = updates.get("guests", row.guests)
        today = get_kolkata_today()

        if end <= start:
            raise HTTPException(422, "Check-out must be after check-in.")
        if start < today:
            raise HTTPException(422, "Check-in date cannot be in the past.")

        unit = db.get(Unit, unit_id)
        if not unit or not unit.is_active or not unit.villa.is_active:
            raise HTTPException(404, "Active unit not found.")
        if not unit_can_be_booked(unit, start):
            raise HTTPException(409, "Unit is unavailable for bookings until housekeeping is complete.")

        requested_guest_id = updates.get("guest_id", updates.get("customer_id", row.guest_id))
        if requested_guest_id is not None:
            guest = db.get(VillaGuest, requested_guest_id)
            if not guest:
                raise HTTPException(404, "Guest not found.")
            if requested_guest_id != row.guest_id and not guest.is_active:
                raise HTTPException(409, "Selected guest profile is inactive.")
            row.guest_id = guest.id
        elif row.customer_id is None:
            raise HTTPException(404, "Guest not found.")

        if guests > unit.capacity:
            raise HTTPException(422, "Guest count exceeds unit capacity.")
        if not unit_availability(db, unit_id, start, end, exclude_booking_id=row.id):
            raise HTTPException(409, "Unit is unavailable for those dates.")
        if start <= today and unit.housekeeping_status not in {"Ready", "Inspected"}:
            raise HTTPException(409, "Unit needs housekeeping before guest check-in.")
        nights = (end - start).days
        total = sum(
            (effective_rate(db, unit, date.fromordinal(start.toordinal() + n)) for n in range(nights)),
            Decimal("0.00"),
        )
        row.unit_id = unit_id
        row.check_in = start
        row.check_out = end
        row.guests = guests
        row.nightly_rate = (total / nights).quantize(Decimal("0.01"))
        row.total_amount = total
        if "notes" in updates:
            row.notes = updates["notes"]
        sync_villa_invoice(db, row, finalize=False)
        db.commit()
        db.refresh(row)
        return booking_view(row, db=db)


@router.get("/bookings/{booking_id}/checkout-summary")
def get_booking_checkout_summary(booking_id: int, db: Session = Depends(get_db)):
    booking = db.get(StayBooking, booking_id)
    if not booking:
        raise HTTPException(404, "Booking not found.")
    return build_checkout_summary(db, booking)


@router.patch("/bookings/{booking_id}/status")
def change_booking_status(
    booking_id: int,
    status: str | None = None,
    reason: str | None = None,
    payload: BookingStatusInput | None = Body(default=None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    target_status = (payload.status if payload and payload.status else status) or ""
    if not target_status:
        raise HTTPException(422, "Target booking status is required.")
    target_reason = payload.reason if payload and payload.reason is not None else reason
    row = transition_villa_booking_status(
        db,
        booking_id=booking_id,
        target_status_raw=target_status,
        changed_by_user_id=user.id,
        reason=target_reason,
    )
    return booking_view(row, db=db)


@router.get("/bookings/{booking_id}/history")
def get_booking_history(booking_id: int, db: Session = Depends(get_db)):
    booking = db.get(StayBooking, booking_id)
    if not booking:
        raise HTTPException(404, "Booking not found.")
    rows = (
        db.query(VillaBookingStatusHistory)
        .filter(VillaBookingStatusHistory.booking_id == booking_id)
        .order_by(VillaBookingStatusHistory.changed_at.desc(), VillaBookingStatusHistory.id.desc())
        .all()
    )
    return [
        {
            "id": h.id,
            "booking_id": h.booking_id,
            "previous_status": h.previous_status,
            "new_status": h.new_status,
            "changed_by": h.changed_by,
            "changed_by_name": h.changed_by_user.full_name if h.changed_by_user else None,
            "reason": h.reason,
            "changed_at": h.changed_at,
        }
        for h in rows
    ]


def _guest_summary_view(guest: VillaGuest, db: Session) -> dict:
    bookings = sorted(
        guest.bookings or [],
        key=lambda b: (b.check_in, b.id),
        reverse=True,
    )
    valid_stays = [b for b in bookings if b.status not in {"Cancelled", "No Show"}]
    completed_stays = [b for b in bookings if b.status == "Checked Out"]
    active_stays = [b for b in bookings if b.status in {"Reserved", "Confirmed", "Checked In"}]
    cancelled_stays = [b for b in bookings if b.status in {"Cancelled", "No Show"}]

    total_billed = Decimal("0.00")
    total_paid = Decimal("0.00")
    total_refunded = Decimal("0.00")
    outstanding_balance = Decimal("0.00")
    service_spending = Decimal("0.00")

    for booking in bookings:
        inv = getattr(booking, "invoice", None)
        if inv:
            fin = compute_invoice_financials(db, inv)
            total_paid += fin["gross_paid_amount"]
            total_refunded += fin["refunded_amount"]
            if booking.status not in {"Cancelled", "No Show"}:
                total_billed += money(inv.total_amount)
                outstanding_balance += fin["balance_due"]
            else:
                outstanding_balance += fin["balance_due"]
        if booking.status not in {"Cancelled", "No Show"}:
            for req in db.query(ServiceRequest).filter(
                ServiceRequest.booking_id == booking.id,
                ServiceRequest.status != "Cancelled",
            ).all():
                service_spending += money(money(req.unit_price) * req.quantity)

    net_spending = max(Decimal("0.00"), money(total_paid - total_refunded))
    last_stay = valid_stays[0] if valid_stays else (bookings[0] if bookings else None)
    return {
        **as_dict(guest),
        "total_bookings": len(bookings),
        "total_stays": len(valid_stays),
        "completed_stays": len(completed_stays),
        "active_stays": len(active_stays),
        "cancelled_stays": len(cancelled_stays),
        "last_stay_date": last_stay.check_in.isoformat() if last_stay else None,
        "last_stay_checkout": last_stay.check_out.isoformat() if last_stay else None,
        "last_stay_number": last_stay.booking_number if last_stay else None,
        "last_stay_unit": last_stay.unit.name if last_stay and last_stay.unit else None,
        "total_billed": money(total_billed),
        "total_paid": money(total_paid),
        "total_refunded": money(total_refunded),
        "total_spending": net_spending,
        "outstanding_balance": money(outstanding_balance),
        "service_spending": money(service_spending),
    }


@router.get("/guests")
def list_guests(
    db: Session = Depends(get_db),
    search: str = "",
    status: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=100),
):
    q = db.query(VillaGuest)
    if status == "active":
        q = q.filter(VillaGuest.is_active.is_(True))
    elif status == "inactive":
        q = q.filter(VillaGuest.is_active.is_(False))

    if search and search.strip():
        pattern = f"%{search.strip()}%"
        q = q.filter(
            or_(
                VillaGuest.full_name.ilike(pattern),
                VillaGuest.phone.ilike(pattern),
                VillaGuest.email.ilike(pattern),
                VillaGuest.guest_reference.ilike(pattern),
                VillaGuest.city.ilike(pattern),
            )
        )

    total = q.count()
    total_pages = max(1, (total + page_size - 1) // page_size)
    current_page = min(page, total_pages)
    guests = (
        q.order_by(VillaGuest.created_at.desc(), VillaGuest.id.desc())
        .offset((current_page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    all_guests = db.query(VillaGuest).all()
    summaries = [_guest_summary_view(g, db) for g in guests]
    repeat_guests = (
        db.query(StayBooking.guest_id)
        .filter(StayBooking.guest_id.isnot(None), StayBooking.status.notin_(["Cancelled", "No Show"]))
        .group_by(StayBooking.guest_id)
        .having(func.count(StayBooking.id) > 1)
        .count()
    )
    active_guests = sum(1 for g in all_guests if g.is_active)
    outstanding_total = sum(
        (compute_invoice_financials(db, inv)["balance_due"] for inv in db.query(VillaInvoice).all()),
        Decimal("0.00"),
    )

    return {
        "items": summaries,
        "total": total,
        "page": current_page,
        "page_size": page_size,
        "total_pages": total_pages,
        "summary": {
            "total_guests": len(all_guests),
            "active_guests": active_guests,
            "repeat_guests": repeat_guests,
            "outstanding_balance_total": money(outstanding_total),
        },
    }


@router.post("/guests", status_code=201)
def create_guest(data: GuestInput, db: Session = Depends(get_db)):
    _ensure_unique_guest_contact(db, data.phone, data.email)
    row = VillaGuest(**data.model_dump())
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A guest with this phone number or reference already exists.")
    db.refresh(row)
    return _guest_summary_view(row, db)


@router.get("/guests/{guest_id}")
def get_guest_profile(guest_id: int, db: Session = Depends(get_db)):
    guest = db.get(VillaGuest, guest_id)
    if not guest:
        raise HTTPException(404, "Guest not found.")
    summary = _guest_summary_view(guest, db)
    stays = sorted(guest.bookings or [], key=lambda b: (b.check_in, b.id), reverse=True)
    booking_ids = [b.id for b in stays]
    service_rows = []
    if booking_ids:
        reqs = (
            db.query(ServiceRequest)
            .filter(ServiceRequest.booking_id.in_(booking_ids))
            .order_by(ServiceRequest.created_at.desc())
            .all()
        )
        service_rows = [
            {
                **as_dict(r),
                "service_name": r.service.name if r.service else "Service",
                "booking_number": r.booking.booking_number if r.booking else None,
                "unit_name": r.booking.unit.name if r.booking and r.booking.unit else None,
                "staff_name": r.staff.user.full_name if r.staff and r.staff.user else None,
                "line_total": money(money(r.unit_price) * r.quantity),
            }
            for r in reqs
        ]
    return {
        **summary,
        "stays": [booking_view(b, db=db) for b in stays],
        "services": service_rows,
    }


@router.patch("/guests/{guest_id}")
def update_guest(guest_id: int, data: GuestUpdate, db: Session = Depends(get_db)):
    row = db.get(VillaGuest, guest_id)
    if not row:
        raise HTTPException(404, "Guest not found.")
    updates = data.model_dump(exclude_unset=True)
    if "phone" in updates or "email" in updates:
        _ensure_unique_guest_contact(
            db,
            updates.get("phone"),
            updates.get("email"),
            exclude_guest_id=row.id,
        )
    for key, value in updates.items():
        setattr(row, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A guest with this phone number already exists.")
    db.refresh(row)
    return _guest_summary_view(row, db)


@router.delete("/guests/{guest_id}")
def delete_guest(guest_id: int, db: Session = Depends(get_db)):
    row = db.get(VillaGuest, guest_id)
    if not row:
        raise HTTPException(404, "Guest not found.")
    has_bookings = db.query(StayBooking).filter(StayBooking.guest_id == guest_id).first()
    if has_bookings:
        raise HTTPException(
            409,
            "Cannot delete a guest who has stay history. Deactivate the guest profile instead.",
        )
    db.delete(row)
    db.commit()
    return {"message": "Guest removed."}


@router.get("/customers")
def list_customers(db: Session = Depends(get_db), search: str = ""):
    q = db.query(VillaGuest)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        q = q.filter(
            or_(
                VillaGuest.full_name.ilike(pattern),
                VillaGuest.phone.ilike(pattern),
                VillaGuest.email.ilike(pattern),
                VillaGuest.guest_reference.ilike(pattern),
            )
        )
    return [as_dict(g) for g in q.order_by(VillaGuest.full_name).limit(300).all()]


@router.get("/staff")
def list_shared_staff(db: Session = Depends(get_db)):
    rows = (
        db.query(Staff)
        .join(User, Staff.user_id == User.id)
        .filter(
            User.is_active.is_(True),
            func.upper(User.business_context) == "VILLA",
        )
        .order_by(Staff.employee_code)
        .all()
    )
    return [{"id": s.id, "name": s.user.full_name, "designation": s.designation, "phone": s.phone} for s in rows]


@router.get("/services")
def list_services(db: Session = Depends(get_db)):
    return [as_dict(s) for s in db.query(VillaService).order_by(VillaService.name).all()]


@router.post("/services", status_code=201)
def create_service(data: ServiceInput, db: Session = Depends(get_db)):
    return save_record(db, VillaService(**data.model_dump()))


@router.patch("/services/{service_id}")
def update_service(service_id: int, data: ServiceInput, db: Session = Depends(get_db)):
    row = db.get(VillaService, service_id)
    if not row:
        raise HTTPException(404, "Service not found.")
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    return save_record(db, row)


@router.delete("/services/{service_id}")
def delete_service(service_id: int, db: Session = Depends(get_db)):
    row = db.get(VillaService, service_id)
    if not row:
        raise HTTPException(404, "Service not found.")
    in_use = db.query(ServiceRequest).filter(ServiceRequest.service_id == service_id).first()
    if in_use:
        raise HTTPException(409, "Cannot delete a service with existing guest requests. Deactivate it instead.")
    db.delete(row)
    db.commit()
    return {"message": "Service removed."}


@router.get("/bookings/{booking_id}/services")
def list_service_requests(booking_id: int, db: Session = Depends(get_db)):
    if not db.get(StayBooking, booking_id):
        raise HTTPException(404, "Booking not found.")
    rows = db.query(ServiceRequest).filter(ServiceRequest.booking_id == booking_id).all()
    return [
        {
            **as_dict(r),
            "service_name": r.service.name,
            "staff_name": r.staff.user.full_name if r.staff and r.staff.user else None,
            "line_total": money(money(r.unit_price) * r.quantity),
        }
        for r in rows
    ]


@router.get("/service-requests")
def list_all_service_requests(db: Session = Depends(get_db)):
    rows = db.query(ServiceRequest).order_by(ServiceRequest.created_at.desc()).all()
    results = []
    for r in rows:
        guest_obj = r.booking.guest or r.booking.customer
        results.append(
            {
                **as_dict(r),
                "service_name": r.service.name,
                "booking_number": r.booking.booking_number,
                "booking_status": r.booking.status,
                "unit_name": r.booking.unit.name if r.booking and r.booking.unit else None,
                "villa_name": r.booking.unit.villa.name if r.booking and r.booking.unit and r.booking.unit.villa else None,
                "guest_id": r.booking.guest_id,
                "guest_reference": getattr(r.booking.guest, "guest_reference", None) if r.booking.guest else None,
                "guest_name": guest_obj.full_name if guest_obj else "Guest",
                "staff_name": r.staff.user.full_name if r.staff and r.staff.user else None,
                "line_total": money(money(r.unit_price) * r.quantity),
            }
        )
    return results


@router.post("/bookings/{booking_id}/services", status_code=201)
def add_service_request(booking_id: int, data: RequestInput, db: Session = Depends(get_db)):
    booking = db.get(StayBooking, booking_id)
    service = db.get(VillaService, data.service_id)
    if not booking or not service:
        raise HTTPException(404, "Booking or service not found.")
    if booking.status != StayStatus.CHECKED_IN.value:
        raise HTTPException(409, "Services can be requested during an active stay.")
    if booking.invoice and booking.invoice.is_finalized:
        raise HTTPException(409, "Cannot add services after invoice finalization.")
    if not service.is_active:
        raise HTTPException(409, "Inactive guest services cannot be requested.")
    if data.staff_id is not None:
        staff = db.get(Staff, data.staff_id)
        if not staff:
            raise HTTPException(404, "Staff member not found.")
        if not staff.user or not staff.user.is_active or normalize_villa_context(staff.user.business_context) != "VILLA":
            raise HTTPException(422, "Assigned staff member must be an active Villas staff account.")
    return save_record(db, ServiceRequest(booking_id=booking_id, unit_price=service.price, **data.model_dump()))


@router.patch("/service-requests/{request_id}/status")
def update_service_request(request_id: int, status: str, db: Session = Depends(get_db)):
    if status not in {"Requested", "Scheduled", "In Progress", "Completed", "Cancelled"}:
        raise HTTPException(422, "Invalid service request status.")
    row = db.get(ServiceRequest, request_id)
    if not row:
        raise HTTPException(404, "Service request not found.")
    booking = row.booking
    if not booking or booking.status != StayStatus.CHECKED_IN.value:
        raise HTTPException(409, "Service requests cannot be modified for a closed stay.")
    if booking.invoice and booking.invoice.is_finalized:
        raise HTTPException(409, "Service requests cannot be modified after invoice finalization.")
    row.status = status
    db.flush()
    sync_villa_invoice(db, booking, finalize=False)
    db.commit()
    db.refresh(row)
    return as_dict(row)


@router.delete("/service-requests/{request_id}")
def delete_service_request(request_id: int, db: Session = Depends(get_db)):
    row = db.get(ServiceRequest, request_id)
    if not row:
        raise HTTPException(404, "Service request not found.")
    booking = row.booking
    if not booking or booking.status != StayStatus.CHECKED_IN.value:
        raise HTTPException(409, "Service requests on closed or inactive stays cannot be removed.")
    if booking.invoice and booking.invoice.is_finalized:
        raise HTTPException(409, "Service requests cannot be deleted after invoice finalization.")
    if row.status in {"Completed", "In Progress"}:
        raise HTTPException(
            409,
            "Completed or in-progress service requests cannot be deleted. Preserve completed service history for billing integrity.",
        )
    billed_item = (
        db.query(VillaInvoiceItem)
        .filter(VillaInvoiceItem.service_request_id == request_id)
        .first()
    )
    if billed_item:
        raise HTTPException(409, "Billed service requests cannot be deleted from invoice history.")
    db.delete(row)
    db.commit()
    return {"message": "Service request removed."}


@router.get("/invoices")
def list_invoices(db: Session = Depends(get_db)):
    invoices = db.query(VillaInvoice).join(StayBooking).order_by(VillaInvoice.id.desc()).all()
    return [invoice_view(db, inv) for inv in invoices]


@router.get("/invoices/{invoice_id}")
def get_invoice_detail(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.get(VillaInvoice, invoice_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found.")
    return invoice_view(db, invoice)


@router.get("/invoices/{invoice_id}/payments")
def get_invoice_payments(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.get(VillaInvoice, invoice_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found.")
    return payment_history_view(db, invoice)


@router.post("/invoices/{invoice_id}/payments", status_code=201)
def receive_payment(
    invoice_id: int,
    amount: Decimal = Query(gt=0),
    method: str = Query(pattern="^(UPI|Card|Net Banking|Cash)$"),
    reference: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    invoice = record_villa_payment(
        db,
        invoice_id=invoice_id,
        amount=amount,
        method=method,
        reference=reference,
        received_by_user_id=user.id,
    )
    return invoice_view(db, invoice)


@router.post("/invoices/{invoice_id}/refunds", status_code=201)
def issue_refund(
    invoice_id: int,
    data: RefundInput,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    invoice, reversals = record_villa_refund(
        db,
        invoice_id=invoice_id,
        payment_id=data.payment_id,
        refund_amount=data.refund_amount,
        refund_method=data.refund_method,
        refund_reference=data.refund_reference,
        reason=data.reason,
        recorded_by_user_id=user.id,
    )
    return {
        "invoice": invoice_view(db, invoice),
        "reversals": [reversal_view(r) for r in reversals],
    }


@router.get("/invoices/{invoice_id}/pdf")
def download_invoice_pdf(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.get(VillaInvoice, invoice_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found.")
    pdf_path = generate_villa_invoice_pdf(db, invoice)
    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=f"Villa-Invoice-{invoice.invoice_number}.pdf",
    )


def save_record(db, row):
    try:
        db.add(row); db.commit(); db.refresh(row); return as_dict(row)
    except IntegrityError:
        db.rollback(); raise HTTPException(409, "A record with this information already exists.")


def effective_rate(db, unit, stay_date):
    seasonal = db.query(SeasonalRate).filter(SeasonalRate.unit_id == unit.id, SeasonalRate.start_date <= stay_date, SeasonalRate.end_date > stay_date).order_by(SeasonalRate.nightly_rate.desc()).first()
    return seasonal.nightly_rate if seasonal else unit.base_rate


def unit_availability(db, unit_id, check_in, check_out, exclude_booking_id=None):
    blocked = db.query(UnitBlock).filter(UnitBlock.unit_id == unit_id, UnitBlock.start_date < check_out, UnitBlock.end_date > check_in).first()
    query = db.query(StayBooking).filter(StayBooking.unit_id == unit_id, StayBooking.status.in_(ACTIVE_STAY_STATUSES), StayBooking.check_in < check_out, StayBooking.check_out > check_in)
    if exclude_booking_id is not None: query = query.filter(StayBooking.id != exclude_booking_id)
    booked = query.first()
    return not blocked and not booked


def unit_can_be_booked(unit, check_in):
    if unit.housekeeping_status == "Out of Order": return False
    return check_in > get_kolkata_today() or unit.housekeeping_status in {"Ready", "Inspected"}


def booking_view(b, db: Session | None = None):
    session = db or object_session(b)
    inv = getattr(b, "invoice", None)
    gross_paid = sum((money(p.amount) for p in inv.payments), Decimal("0.00")) if inv else Decimal("0.00")
    refunded = sum((money(r.refund_amount) for r in inv.reversals), Decimal("0.00")) if inv else Decimal("0.00")
    net_paid = max(Decimal("0.00"), money(gross_paid - refunded))
    balance_due = (
        Decimal("0.00")
        if (not inv or inv.payment_status == "Void")
        else max(Decimal("0.00"), money(money(inv.total_amount) - net_paid))
    )
    guest_obj = b.guest or b.customer
    policy = resolve_stay_policy(session, b.unit) if session is not None else {
        "check_in_time": "14:00",
        "check_in_time_display": "2:00 PM",
        "check_out_time": "11:00",
        "check_out_time_display": "11:00 AM",
        "late_checkout_grace_minutes": 30,
        "late_checkout_fee": None,
    }
    sched = compute_booking_schedule(b, policy)
    now_ist = to_kolkata_aware(get_kolkata_now())
    can_check_in = b.status == StayStatus.CONFIRMED.value and now_ist >= sched["scheduled_check_in_at"]
    can_check_out = b.status == StayStatus.CHECKED_IN.value and now_ist >= sched["scheduled_check_in_at"]
    can_mark_no_show = (
        b.status in {StayStatus.RESERVED.value, StayStatus.CONFIRMED.value}
        and now_ist > sched["scheduled_check_in_at"]
    )
    late_checkout_fee_total = (
        money(sum((money(it.total_amount) for it in inv.items if it.item_type == "LATE_CHECKOUT"), Decimal("0.00")))
        if inv
        else Decimal("0.00")
    )
    return {
        "id": b.id,
        "booking_number": b.booking_number,
        "unit_id": b.unit_id,
        "unit_name": b.unit.name,
        "villa_id": b.unit.villa_id,
        "villa_name": b.unit.villa.name,
        "guest_id": b.guest_id,
        "guest_reference": getattr(b.guest, "guest_reference", None) if b.guest else None,
        "guest_name": guest_obj.full_name if guest_obj else "Guest",
        "guest_phone": guest_obj.phone if guest_obj else None,
        "guest_email": guest_obj.email if guest_obj else None,
        "customer_id": b.guest_id or b.customer_id,
        "customer_name": guest_obj.full_name if guest_obj else "Guest",
        "customer_phone": guest_obj.phone if guest_obj else None,
        "check_in": b.check_in,
        "check_out": b.check_out,
        "check_in_time": policy["check_in_time"],
        "check_in_time_display": policy["check_in_time_display"],
        "check_out_time": policy["check_out_time"],
        "check_out_time_display": policy["check_out_time_display"],
        "check_in_display": format_date_with_time(b.check_in, policy["check_in_time"]),
        "check_out_display": format_date_with_time(b.check_out, policy["check_out_time"]),
        "late_checkout_grace_minutes": policy["late_checkout_grace_minutes"],
        "late_checkout_fee": policy["late_checkout_fee"],
        "scheduled_check_in_at": sched["scheduled_check_in_at"].isoformat(),
        "scheduled_check_out_at": sched["scheduled_check_out_at"].isoformat(),
        "grace_deadline_at": sched["grace_deadline_at"].isoformat(),
        "actual_check_in_at": b.actual_check_in_at,
        "actual_check_out_at": b.actual_check_out_at,
        "can_check_in": can_check_in,
        "can_check_out": can_check_out,
        "can_mark_no_show": can_mark_no_show,
        "guests": b.guests,
        "nightly_rate": b.nightly_rate,
        "total_amount": b.total_amount,
        "status": b.status,
        "notes": b.notes,
        "invoice_id": inv.id if inv else None,
        "invoice_number": inv.invoice_number if inv else None,
        "invoice_total": inv.total_amount if inv else None,
        "invoice_paid": net_paid if inv else Decimal("0.00"),
        "invoice_refunded": refunded if inv else Decimal("0.00"),
        "invoice_balance_due": balance_due if inv else Decimal("0.00"),
        "invoice_payment_status": inv.payment_status if inv else None,
        "late_checkout_fee_total": late_checkout_fee_total,
    }


def payment_view(p: VillaPayment, db: Session):
    refunded = money(
        db.query(func.coalesce(func.sum(VillaPaymentReversal.refund_amount), 0))
        .filter(VillaPaymentReversal.payment_id == p.id)
        .scalar()
    )
    refundable = max(Decimal("0.00"), money(money(p.amount) - refunded))
    return {
        **as_dict(p),
        "receiver_name": p.receiver.full_name if p.receiver else None,
        "status": "Refunded" if refundable == Decimal("0.00") else "Partially Refunded" if refunded > Decimal("0.00") else "Paid",
        "refunded_amount": refunded,
        "refundable_amount": refundable,
    }


def reversal_view(r: VillaPaymentReversal):
    return {
        **as_dict(r),
        "recorded_by_name": r.recorder.full_name if r.recorder else None,
    }


def payment_history_view(db: Session, invoice: VillaInvoice):
    fin = compute_invoice_financials(db, invoice)
    return {
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "total_amount": money(invoice.total_amount),
        "gross_paid_amount": fin["gross_paid_amount"],
        "refunded_amount": fin["refunded_amount"],
        "paid_amount": fin["paid_amount"],
        "balance_due": fin["balance_due"],
        "payment_status": invoice.payment_status,
        "payments": [payment_view(p, db) for p in invoice.payments],
        "reversals": [reversal_view(r) for r in invoice.reversals],
    }


def invoice_view(db: Session, invoice: VillaInvoice):
    fin = compute_invoice_financials(db, invoice)
    booking = invoice.booking
    policy = resolve_stay_policy(db, booking.unit)
    late_checkout_fee_total = money(
        sum((money(it.total_amount) for it in invoice.items if it.item_type == "LATE_CHECKOUT"), Decimal("0.00"))
    )
    return {
        **as_dict(invoice),
        "booking_number": booking.booking_number,
        "booking_status": booking.status,
        "check_in": booking.check_in,
        "check_out": booking.check_out,
        "check_in_time": policy["check_in_time"],
        "check_out_time": policy["check_out_time"],
        "check_in_time_display": policy["check_in_time_display"],
        "check_out_time_display": policy["check_out_time_display"],
        "check_in_display": format_date_with_time(booking.check_in, policy["check_in_time"]),
        "check_out_display": format_date_with_time(booking.check_out, policy["check_out_time"]),
        "actual_check_in_at": booking.actual_check_in_at,
        "actual_check_out_at": booking.actual_check_out_at,
        "late_checkout_fee_total": late_checkout_fee_total,
        "unit_name": booking.unit.name if booking.unit else None,
        "villa_name": booking.unit.villa.name if booking.unit and booking.unit.villa else None,
        "guest_id": booking.guest_id,
        "guest_reference": getattr(booking.guest, "guest_reference", None) if booking.guest else None,
        "guest_name": (booking.guest or booking.customer).full_name if (booking.guest or booking.customer) else "Guest",
        "customer_name": (booking.guest or booking.customer).full_name if (booking.guest or booking.customer) else "Guest",
        "customer_phone": (booking.guest or booking.customer).phone if (booking.guest or booking.customer) else None,
        "customer_email": (booking.guest or booking.customer).email if (booking.guest or booking.customer) else None,
        "gross_paid_amount": fin["gross_paid_amount"],
        "refunded_amount": fin["refunded_amount"],
        "paid_amount": fin["paid_amount"],
        "balance_due": fin["balance_due"],
        "items": [as_dict(it) for it in invoice.items],
        "payments": [payment_view(p, db) for p in invoice.payments],
        "reversals": [reversal_view(r) for r in invoice.reversals],
    }
