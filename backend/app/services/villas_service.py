from __future__ import annotations

import re
import threading
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from xml.sax.saxutils import escape

from fastapi import HTTPException
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.core.branding import APP_NAME, MODULE_NAMES
from app.core.date_utils import KOLKATA_TZ, get_kolkata_now, get_kolkata_today
from app.models import (
    BusinessProfile,
    ServiceRequest,
    StayBooking,
    StayStatus,
    Unit,
    UnitBlock,
    User,
    Villa,
    VillaBookingStatusHistory,
    VillaInvoice,
    VillaInvoiceItem,
    VillaPayment,
    VillaPaymentReversal,
    VillaPropertySettings,
)

VILLA_DEFAULT_TAX_RATE = Decimal("18.00")
DEFAULT_CHECK_IN_TIME = "14:00"
DEFAULT_CHECK_OUT_TIME = "11:00"
DEFAULT_LATE_CHECKOUT_GRACE_MINUTES = 30
HHMM_PATTERN = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_SQLITE_BOOKING_LOCK = threading.RLock()
ACTIVE_STAY_STATUSES = (
    StayStatus.RESERVED.value,
    StayStatus.CONFIRMED.value,
    StayStatus.CHECKED_IN.value,
)
ALLOWED_BOOKING_TRANSITIONS: dict[str, set[str]] = {
    StayStatus.RESERVED.value: {
        StayStatus.CONFIRMED.value,
        StayStatus.CANCELLED.value,
        StayStatus.NO_SHOW.value,
    },
    StayStatus.CONFIRMED.value: {
        StayStatus.CHECKED_IN.value,
        StayStatus.CANCELLED.value,
        StayStatus.NO_SHOW.value,
    },
    StayStatus.CHECKED_IN.value: {
        StayStatus.CHECKED_OUT.value,
    },
    StayStatus.CHECKED_OUT.value: set(),
    StayStatus.CANCELLED.value: set(),
    StayStatus.NO_SHOW.value: set(),
}

BACKEND_ROOT = Path(__file__).resolve().parents[2]
VILLA_INVOICE_PDF_DIR = BACKEND_ROOT / "private" / "villa-invoices"


def money(value: Decimal | float | int | str | None) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def format_inr(value: Decimal | float | int | str | None) -> str:
    return f"INR {money(value):,.2f}"


def normalize_villa_context(raw_context: object) -> str:
    val = str(getattr(raw_context, "value", raw_context) or "").strip().upper()
    return {"VILLAS": "VILLA", "NIWARAAI": "VILLA"}.get(val, val)


def parse_hhmm(raw: str | None, fallback: str = DEFAULT_CHECK_IN_TIME) -> time:
    val = (raw or fallback or DEFAULT_CHECK_IN_TIME).strip()
    if not HHMM_PATTERN.fullmatch(val):
        val = fallback
    hours, minutes = map(int, val.split(":"))
    return time(hour=hours, minute=minutes)


def format_time_12h(hhmm: str | None) -> str:
    if not hhmm or not HHMM_PATTERN.fullmatch(hhmm.strip()):
        return ""
    h, m = map(int, hhmm.strip().split(":"))
    period = "PM" if h >= 12 else "AM"
    h12 = 12 if h % 12 == 0 else h % 12
    return f"{h12}:{m:02d} {period}"


def format_date_long(d: date | None) -> str:
    if not d:
        return "—"
    return f"{d.day} {d.strftime('%B %Y')}"


def format_date_with_time(d: date | None, hhmm: str | None) -> str:
    if not d:
        return "—"
    t_str = format_time_12h(hhmm)
    return f"{format_date_long(d)} · {t_str}" if t_str else format_date_long(d)


def normalize_time_override(raw: str | None) -> str | None:
    if raw is None:
        return None
    cleaned = raw.strip()
    if not cleaned:
        return None
    if not HHMM_PATTERN.fullmatch(cleaned):
        raise ValueError("Time must be in 24-hour HH:MM format (e.g. 14:00).")
    return cleaned


@contextmanager
def acquire_unit_locks(db: Session, unit_ids: list[int] | set[int]):
    unique_ids = sorted({int(uid) for uid in unit_ids if uid is not None})
    dialect = db.bind.dialect.name if db.bind is not None else ""
    if dialect == "sqlite":
        with _SQLITE_BOOKING_LOCK:
            if db.in_transaction():
                db.rollback()
            db.expire_all()
            db.execute(text("BEGIN IMMEDIATE"))
            try:
                yield
            except Exception:
                if db.in_transaction():
                    db.rollback()
                raise
    else:
        if unique_ids:
            db.query(Unit).filter(Unit.id.in_(unique_ids)).order_by(Unit.id.asc()).with_for_update().all()
        yield


def get_or_create_villa_settings(db: Session) -> VillaPropertySettings:
    row = db.query(VillaPropertySettings).order_by(VillaPropertySettings.id.asc()).first()
    if not row:
        row = VillaPropertySettings(
            default_check_in_time=DEFAULT_CHECK_IN_TIME,
            default_check_out_time=DEFAULT_CHECK_OUT_TIME,
            late_checkout_grace_minutes=DEFAULT_LATE_CHECKOUT_GRACE_MINUTES,
            default_late_checkout_fee=None,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def resolve_stay_policy(
    db: Session,
    unit: Unit | None = None,
    villa: Villa | None = None,
    settings_row: VillaPropertySettings | None = None,
) -> dict:
    s = settings_row or get_or_create_villa_settings(db)
    v = villa or (unit.villa if unit else None)

    if unit and unit.check_in_time:
        check_in_time, check_in_source = unit.check_in_time, "unit"
    elif v and v.check_in_time:
        check_in_time, check_in_source = v.check_in_time, "villa"
    else:
        check_in_time, check_in_source = s.default_check_in_time, "property"

    if unit and unit.check_out_time:
        check_out_time, check_out_source = unit.check_out_time, "unit"
    elif v and v.check_out_time:
        check_out_time, check_out_source = v.check_out_time, "villa"
    else:
        check_out_time, check_out_source = s.default_check_out_time, "property"

    if unit and unit.late_checkout_fee is not None:
        late_fee = money(unit.late_checkout_fee)
        late_fee_source = "unit"
    elif v and v.late_checkout_fee is not None:
        late_fee = money(v.late_checkout_fee)
        late_fee_source = "villa"
    elif s.default_late_checkout_fee is not None:
        late_fee = money(s.default_late_checkout_fee)
        late_fee_source = "property"
    else:
        late_fee = None
        late_fee_source = None

    return {
        "check_in_time": check_in_time,
        "check_in_time_display": format_time_12h(check_in_time),
        "check_in_source": check_in_source,
        "check_out_time": check_out_time,
        "check_out_time_display": format_time_12h(check_out_time),
        "check_out_source": check_out_source,
        "late_checkout_grace_minutes": int(s.late_checkout_grace_minutes),
        "late_checkout_fee": late_fee,
        "late_checkout_fee_source": late_fee_source,
    }


def compute_booking_schedule(booking: StayBooking, policy: dict) -> dict[str, datetime]:
    scheduled_check_in_at = datetime.combine(
        booking.check_in,
        parse_hhmm(policy["check_in_time"], DEFAULT_CHECK_IN_TIME),
    ).replace(tzinfo=KOLKATA_TZ)
    scheduled_check_out_at = datetime.combine(
        booking.check_out,
        parse_hhmm(policy["check_out_time"], DEFAULT_CHECK_OUT_TIME),
    ).replace(tzinfo=KOLKATA_TZ)
    grace_minutes = int(policy["late_checkout_grace_minutes"])
    grace_deadline_at = scheduled_check_out_at + timedelta(minutes=grace_minutes)
    return {
        "scheduled_check_in_at": scheduled_check_in_at,
        "scheduled_check_out_at": scheduled_check_out_at,
        "grace_deadline_at": grace_deadline_at,
    }


def to_kolkata_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=KOLKATA_TZ)
    return dt.astimezone(KOLKATA_TZ)


def evaluate_late_checkout(booking: StayBooking, policy: dict, actual_now: datetime | None = None) -> dict:
    now_ist = to_kolkata_aware(actual_now or get_kolkata_now())
    sched = compute_booking_schedule(booking, policy)
    is_late = now_ist > sched["grace_deadline_at"]
    minutes_past_checkout = (
        max(0, int((now_ist - sched["scheduled_check_out_at"]).total_seconds() // 60))
        if now_ist > sched["scheduled_check_out_at"]
        else 0
    )
    configured_fee = policy.get("late_checkout_fee")
    fee_configured = configured_fee is not None
    applicable_fee = (
        money(configured_fee)
        if (is_late and configured_fee is not None and money(configured_fee) > Decimal("0.00"))
        else Decimal("0.00")
    )
    return {
        "server_now": now_ist,
        "scheduled_check_in_at": sched["scheduled_check_in_at"],
        "scheduled_check_out_at": sched["scheduled_check_out_at"],
        "grace_deadline_at": sched["grace_deadline_at"],
        "is_late_checkout": is_late,
        "minutes_past_checkout": minutes_past_checkout,
        "fee_configured": fee_configured,
        "configured_late_checkout_fee": money(configured_fee) if fee_configured else None,
        "applicable_fee": applicable_fee,
    }


def compute_invoice_financials(db: Session, invoice: VillaInvoice) -> dict[str, Decimal]:
    gross_paid = money(
        db.query(func.coalesce(func.sum(VillaPayment.amount), 0))
        .filter(VillaPayment.invoice_id == invoice.id)
        .scalar()
    )
    refunded = money(
        db.query(func.coalesce(func.sum(VillaPaymentReversal.refund_amount), 0))
        .filter(VillaPaymentReversal.invoice_id == invoice.id)
        .scalar()
    )
    net_paid = max(Decimal("0.00"), money(gross_paid - refunded))
    total = money(invoice.total_amount)
    if invoice.payment_status == "Void":
        balance_due = Decimal("0.00")
    else:
        balance_due = max(Decimal("0.00"), money(total - net_paid))
    return {
        "gross_paid_amount": gross_paid,
        "refunded_amount": refunded,
        "paid_amount": net_paid,
        "balance_due": balance_due,
    }


def derive_invoice_payment_status(
    total_amount: Decimal,
    net_paid: Decimal,
    refunded_amount: Decimal,
    current_status: str | None = None,
) -> str:
    if current_status == "Void":
        return "Void"
    if net_paid <= Decimal("0.00"):
        return "Refunded" if refunded_amount > Decimal("0.00") else "Pending"
    if net_paid >= total_amount:
        return "Paid"
    return "Partially Paid"


def sync_villa_invoice(
    db: Session,
    booking: StayBooking,
    *,
    finalize: bool = False,
    late_checkout_fee: Decimal | None = None,
) -> VillaInvoice:
    invoice = (
        db.query(VillaInvoice)
        .filter(VillaInvoice.booking_id == booking.id)
        .with_for_update()
        .first()
    )
    if invoice and invoice.is_finalized:
        return invoice

    completed_services = (
        db.query(ServiceRequest)
        .filter(
            ServiceRequest.booking_id == booking.id,
            ServiceRequest.status == "Completed",
        )
        .order_by(ServiceRequest.id.asc())
        .all()
    )

    accommodation_total = money(booking.total_amount)
    service_total = sum(
        (money(req.unit_price * req.quantity) for req in completed_services),
        Decimal("0.00"),
    )
    existing_late_item = (
        db.query(VillaInvoiceItem)
        .filter(
            VillaInvoiceItem.invoice_id == invoice.id,
            VillaInvoiceItem.item_type == "LATE_CHECKOUT",
        )
        .first()
        if invoice
        else None
    )
    if late_checkout_fee is not None and money(late_checkout_fee) > Decimal("0.00"):
        late_fee_total = money(late_checkout_fee)
    elif existing_late_item is not None:
        late_fee_total = money(existing_late_item.total_amount)
    else:
        late_fee_total = Decimal("0.00")

    subtotal = money(accommodation_total + service_total + late_fee_total)
    tax_rate = invoice.tax_rate if invoice else VILLA_DEFAULT_TAX_RATE
    tax_amount = money(subtotal * tax_rate / Decimal("100"))
    total_amount = money(subtotal + tax_amount)

    if invoice:
        fin = compute_invoice_financials(db, invoice)
        net_paid = fin["paid_amount"]
        refunded_amount = fin["refunded_amount"]
        if total_amount < net_paid:
            raise HTTPException(
                409,
                "Final invoice total cannot be less than net payments already received.",
            )
        invoice.subtotal = subtotal
        invoice.tax_rate = tax_rate
        invoice.tax_amount = tax_amount
        invoice.total_amount = total_amount
        invoice.paid_amount = net_paid
        invoice.is_finalized = bool(finalize)
        invoice.payment_status = derive_invoice_payment_status(
            total_amount,
            net_paid,
            refunded_amount,
            current_status=invoice.payment_status,
        )
    else:
        invoice = VillaInvoice(
            booking_id=booking.id,
            subtotal=subtotal,
            tax_rate=tax_rate,
            tax_amount=tax_amount,
            total_amount=total_amount,
            paid_amount=Decimal("0.00"),
            payment_status="Pending",
            is_finalized=bool(finalize),
        )
        db.add(invoice)
        db.flush()

    # Rebuild draft line items deterministically; once finalized above, never mutated again.
    db.query(VillaInvoiceItem).filter(VillaInvoiceItem.invoice_id == invoice.id).delete(
        synchronize_session=False
    )
    db.flush()

    nights = max(1, (booking.check_out - booking.check_in).days)
    unit_label = (
        f"{booking.unit.villa.name} · {booking.unit.name}"
        if booking.unit and booking.unit.villa
        else f"Unit #{booking.unit_id}"
    )
    db.add(
        VillaInvoiceItem(
            invoice_id=invoice.id,
            item_type="ACCOMMODATION",
            description=f"{unit_label} ({booking.check_in} to {booking.check_out}, {nights} night{'s' if nights != 1 else ''})",
            quantity=nights,
            unit_price=money(booking.nightly_rate),
            total_amount=accommodation_total,
            booking_id=booking.id,
            service_request_id=None,
        )
    )

    seen_service_req_ids: set[int] = set()
    for req in completed_services:
        if req.id in seen_service_req_ids:
            continue
        seen_service_req_ids.add(req.id)
        svc_name = req.service.name if req.service else f"Service #{req.service_id}"
        db.add(
            VillaInvoiceItem(
                invoice_id=invoice.id,
                item_type="SERVICE",
                description=svc_name,
                quantity=req.quantity,
                unit_price=money(req.unit_price),
                total_amount=money(req.unit_price * req.quantity),
                booking_id=booking.id,
                service_request_id=req.id,
            )
        )

    if late_fee_total > Decimal("0.00"):
        db.add(
            VillaInvoiceItem(
                invoice_id=invoice.id,
                item_type="LATE_CHECKOUT",
                description=f"Late Checkout Penalty ({booking.booking_number})",
                quantity=1,
                unit_price=late_fee_total,
                total_amount=late_fee_total,
                booking_id=booking.id,
                service_request_id=None,
            )
        )

    db.add(
        VillaInvoiceItem(
            invoice_id=invoice.id,
            item_type="TAX",
            description=f"GST ({tax_rate}%)",
            quantity=1,
            unit_price=tax_amount,
            total_amount=tax_amount,
            booking_id=booking.id,
            service_request_id=None,
        )
    )
    db.flush()
    return invoice


def build_checkout_summary(db: Session, booking: StayBooking) -> dict:
    policy = resolve_stay_policy(db, booking.unit)
    now_ist = get_kolkata_now()
    late_eval = evaluate_late_checkout(booking, policy, now_ist)

    invoice = booking.invoice
    completed_services = (
        db.query(ServiceRequest)
        .filter(
            ServiceRequest.booking_id == booking.id,
            ServiceRequest.status == "Completed",
        )
        .all()
    )
    accommodation_total = money(booking.total_amount)
    service_total = money(
        sum((money(req.unit_price * req.quantity) for req in completed_services), Decimal("0.00"))
    )

    if invoice and invoice.is_finalized:
        late_items = [it for it in invoice.items if it.item_type == "LATE_CHECKOUT"]
        late_fee_amount = money(sum((money(it.total_amount) for it in late_items), Decimal("0.00")))
        subtotal = money(invoice.subtotal)
        tax_rate = money(invoice.tax_rate)
        tax_amount = money(invoice.tax_amount)
        total_amount = money(invoice.total_amount)
        fin = compute_invoice_financials(db, invoice)
        is_late = late_fee_amount > Decimal("0.00")
    else:
        late_fee_amount = late_eval["applicable_fee"]
        subtotal = money(accommodation_total + service_total + late_fee_amount)
        tax_rate = money(invoice.tax_rate) if invoice else VILLA_DEFAULT_TAX_RATE
        tax_amount = money(subtotal * tax_rate / Decimal("100"))
        total_amount = money(subtotal + tax_amount)
        fin = (
            compute_invoice_financials(db, invoice)
            if invoice
            else {
                "gross_paid_amount": Decimal("0.00"),
                "refunded_amount": Decimal("0.00"),
                "paid_amount": Decimal("0.00"),
                "balance_due": total_amount,
            }
        )
        is_late = late_eval["is_late_checkout"]

    balance_due = (
        Decimal("0.00")
        if (invoice and invoice.payment_status == "Void")
        else max(Decimal("0.00"), money(total_amount - fin["paid_amount"]))
    )

    return {
        "booking_id": booking.id,
        "booking_number": booking.booking_number,
        "status": booking.status,
        "check_in": booking.check_in,
        "check_out": booking.check_out,
        "check_in_time": policy["check_in_time"],
        "check_out_time": policy["check_out_time"],
        "check_in_display": format_date_with_time(booking.check_in, policy["check_in_time"]),
        "check_out_display": format_date_with_time(booking.check_out, policy["check_out_time"]),
        "scheduled_check_out_at": late_eval["scheduled_check_out_at"].isoformat(),
        "grace_deadline_at": late_eval["grace_deadline_at"].isoformat(),
        "late_checkout_grace_minutes": policy["late_checkout_grace_minutes"],
        "server_now": late_eval["server_now"].isoformat(),
        "is_late_checkout": is_late,
        "minutes_past_checkout": late_eval["minutes_past_checkout"],
        "late_fee_configured": late_eval["fee_configured"],
        "configured_late_checkout_fee": late_eval["configured_late_checkout_fee"],
        "accommodation_total": accommodation_total,
        "service_total": service_total,
        "late_checkout_fee": late_fee_amount,
        "subtotal": subtotal,
        "tax_rate": tax_rate,
        "tax_amount": tax_amount,
        "total_amount": total_amount,
        "advance_payments": fin["gross_paid_amount"],
        "refunded_amount": fin["refunded_amount"],
        "net_paid": fin["paid_amount"],
        "remaining_balance": balance_due,
    }


def record_booking_status_history(
    db: Session,
    *,
    booking_id: int,
    previous_status: str | None,
    new_status: str,
    changed_by: int | None,
    reason: str | None = None,
) -> VillaBookingStatusHistory:
    entry = VillaBookingStatusHistory(
        booking_id=booking_id,
        previous_status=previous_status,
        new_status=new_status,
        changed_by=changed_by,
        reason=reason.strip() if reason else None,
    )
    db.add(entry)
    return entry


def normalize_target_stay_status(raw_status: str) -> str:
    cleaned = (raw_status or "").strip().lower()
    for st in StayStatus:
        if st.value.lower() == cleaned:
            return st.value
    raise HTTPException(
        422,
        f"Invalid booking status '{raw_status}'. Allowed values: {[s.value for s in StayStatus]}.",
    )


def transition_villa_booking_status(
    db: Session,
    *,
    booking_id: int,
    target_status_raw: str,
    changed_by_user_id: int | None,
    reason: str | None = None,
) -> StayBooking:
    row = db.query(StayBooking).filter(StayBooking.id == booking_id).with_for_update().first()
    if not row:
        raise HTTPException(404, "Booking not found.")

    target_status = normalize_target_stay_status(target_status_raw)
    previous_status = row.status
    allowed = ALLOWED_BOOKING_TRANSITIONS.get(previous_status, set())
    if target_status not in allowed:
        raise HTTPException(409, f"Cannot change {previous_status} booking to {target_status}.")

    now_ist = to_kolkata_aware(get_kolkata_now())
    policy = resolve_stay_policy(db, row.unit)
    sched = compute_booking_schedule(row, policy)
    clean_reason = reason.strip() if reason else None
    late_eval = None

    if target_status == StayStatus.CHECKED_IN.value:
        if now_ist < sched["scheduled_check_in_at"]:
            raise HTTPException(
                409,
                f"Check-in is available on or after {format_date_with_time(row.check_in, policy['check_in_time'])}.",
            )
        unit = row.unit
        if not unit or not unit.villa:
            raise HTTPException(409, "Booking unit or villa relationship is invalid.")
        if not unit.villa.is_active:
            raise HTTPException(409, "Cannot check in while the parent villa is inactive.")
        if not unit.is_active:
            raise HTTPException(409, "Cannot check in while the unit is inactive.")
        if unit.housekeeping_status not in {"Ready", "Inspected"}:
            raise HTTPException(409, "Unit needs housekeeping before guest check-in.")
        overlapping_block = (
            db.query(UnitBlock)
            .filter(
                UnitBlock.unit_id == unit.id,
                UnitBlock.start_date < row.check_out,
                UnitBlock.end_date > row.check_in,
            )
            .first()
        )
        if overlapping_block:
            raise HTTPException(409, "Unit has an overlapping maintenance or availability block.")
        row.actual_check_in_at = now_ist

    elif target_status == StayStatus.NO_SHOW.value:
        if now_ist <= sched["scheduled_check_in_at"]:
            raise HTTPException(
                409,
                f"No-show can only be marked after {format_date_with_time(row.check_in, policy['check_in_time'])}.",
            )

    elif target_status == StayStatus.CHECKED_OUT.value:
        if now_ist < sched["scheduled_check_in_at"]:
            raise HTTPException(409, "A future booking cannot be checked out.")
        late_eval = evaluate_late_checkout(row, policy, now_ist)
        row.actual_check_out_at = now_ist

    elif target_status == StayStatus.CANCELLED.value:
        if not clean_reason:
            raise HTTPException(422, "Cancellation reason is required.")

    invoice = (
        db.query(VillaInvoice)
        .filter(VillaInvoice.booking_id == row.id)
        .with_for_update()
        .first()
    )

    if target_status in {StayStatus.CANCELLED.value, StayStatus.NO_SHOW.value}:
        if invoice:
            fin = compute_invoice_financials(db, invoice)
            if fin["paid_amount"] > Decimal("0.00"):
                raise HTTPException(
                    409,
                    "Refund or resolve the advance payment before closing this booking.",
                )
            invoice.paid_amount = Decimal("0.00")
            invoice.payment_status = "Void"

    row.status = target_status
    if target_status == StayStatus.CHECKED_OUT.value:
        row.unit.housekeeping_status = "Needs Cleaning"
        applicable_late_fee = late_eval["applicable_fee"] if late_eval else Decimal("0.00")
        sync_villa_invoice(db, row, finalize=True, late_checkout_fee=applicable_late_fee)

    history_reason = clean_reason or f"Booking transitioned from {previous_status} to {target_status}."
    if target_status == StayStatus.CHECKED_OUT.value and late_eval and late_eval["applicable_fee"] > Decimal("0.00"):
        history_reason = f"{history_reason} Late checkout penalty applied ({format_inr(late_eval['applicable_fee'])})."

    record_booking_status_history(
        db,
        booking_id=row.id,
        previous_status=previous_status,
        new_status=target_status,
        changed_by=changed_by_user_id,
        reason=history_reason,
    )
    db.commit()
    db.refresh(row)
    return row


def record_villa_payment(
    db: Session,
    *,
    invoice_id: int,
    amount: Decimal,
    method: str,
    reference: str | None,
    received_by_user_id: int | None,
) -> VillaInvoice:
    invoice = db.query(VillaInvoice).filter(VillaInvoice.id == invoice_id).with_for_update().first()
    if not invoice:
        raise HTTPException(404, "Invoice not found.")
    if invoice.payment_status == "Void" or (
        invoice.booking and invoice.booking.status in {StayStatus.CANCELLED.value, StayStatus.NO_SHOW.value}
    ):
        raise HTTPException(409, "Payment cannot be recorded on a void or closed booking invoice.")

    fin = compute_invoice_financials(db, invoice)
    payment_amount = money(amount)
    if payment_amount <= Decimal("0.00"):
        raise HTTPException(422, "Payment amount must be greater than zero.")
    if payment_amount > fin["balance_due"]:
        raise HTTPException(422, "Payment exceeds the remaining balance.")

    db.add(
        VillaPayment(
            invoice_id=invoice.id,
            amount=payment_amount,
            method=method,
            reference=reference.strip() if reference else None,
            received_by=received_by_user_id,
        )
    )
    db.flush()

    updated_fin = compute_invoice_financials(db, invoice)
    invoice.paid_amount = updated_fin["paid_amount"]
    invoice.payment_status = derive_invoice_payment_status(
        money(invoice.total_amount),
        updated_fin["paid_amount"],
        updated_fin["refunded_amount"],
    )
    db.commit()
    db.refresh(invoice)
    return invoice


def record_villa_refund(
    db: Session,
    *,
    invoice_id: int,
    payment_id: int | None,
    refund_amount: Decimal | None,
    refund_method: str | None,
    refund_reference: str | None,
    reason: str,
    recorded_by_user_id: int | None,
) -> tuple[VillaInvoice, list[VillaPaymentReversal]]:
    clean_reason = (reason or "").strip()
    if len(clean_reason) < 2:
        raise HTTPException(422, "Refund reason is required.")

    clean_ref = refund_reference.strip() if refund_reference else None
    invoice = db.query(VillaInvoice).filter(VillaInvoice.id == invoice_id).with_for_update().first()
    if not invoice:
        raise HTTPException(404, "Invoice not found.")

    if clean_ref:
        dup_ref = (
            db.query(VillaPaymentReversal)
            .filter(
                VillaPaymentReversal.invoice_id == invoice.id,
                VillaPaymentReversal.refund_reference == clean_ref,
            )
            .first()
        )
        if dup_ref:
            raise HTTPException(409, "A refund with this reference has already been recorded for this invoice.")

    payments = (
        db.query(VillaPayment)
        .filter(VillaPayment.invoice_id == invoice.id)
        .order_by(VillaPayment.id.asc())
        .with_for_update()
        .all()
    )
    if not payments:
        raise HTTPException(409, "No recorded payments exist on this invoice to refund.")

    payment_refundable: list[tuple[VillaPayment, Decimal]] = []
    for p in payments:
        already_refunded = money(
            db.query(func.coalesce(func.sum(VillaPaymentReversal.refund_amount), 0))
            .filter(VillaPaymentReversal.payment_id == p.id)
            .scalar()
        )
        refundable = money(money(p.amount) - already_refunded)
        payment_refundable.append((p, refundable))

    created_reversals: list[VillaPaymentReversal] = []

    if payment_id is not None:
        target_pair = next((pair for pair in payment_refundable if pair[0].id == payment_id), None)
        if not target_pair:
            raise HTTPException(404, "Payment record not found on this invoice.")
        payment, refundable = target_pair
        if refundable <= Decimal("0.00"):
            raise HTTPException(409, "This payment has already been fully refunded.")
        requested_amount = money(refund_amount) if refund_amount is not None else refundable
        if requested_amount <= Decimal("0.00"):
            raise HTTPException(422, "Refund amount must be greater than zero.")
        if requested_amount > refundable:
            raise HTTPException(422, "Refund amount exceeds the remaining refundable amount for this payment.")
        rev = VillaPaymentReversal(
            payment_id=payment.id,
            invoice_id=invoice.id,
            refund_amount=requested_amount,
            refund_method=refund_method or payment.method,
            refund_reference=clean_ref,
            reason=clean_reason,
            reversal_status="Refunded",
            recorded_by=recorded_by_user_id,
        )
        db.add(rev)
        created_reversals.append(rev)
    else:
        refundable_pairs = [(p, rem) for p, rem in payment_refundable if rem > Decimal("0.00")]
        if not refundable_pairs:
            raise HTTPException(409, "All payments on this invoice have already been fully refunded.")
        total_refundable = money(sum((rem for _, rem in refundable_pairs), Decimal("0.00")))
        remaining_to_refund = money(refund_amount) if refund_amount is not None else total_refundable
        if remaining_to_refund <= Decimal("0.00"):
            raise HTTPException(422, "Refund amount must be greater than zero.")
        if remaining_to_refund > total_refundable:
            raise HTTPException(422, "Refund amount exceeds net collected payments.")

        for p, rem in refundable_pairs:
            if remaining_to_refund <= Decimal("0.00"):
                break
            chunk = min(rem, remaining_to_refund)
            rev = VillaPaymentReversal(
                payment_id=p.id,
                invoice_id=invoice.id,
                refund_amount=chunk,
                refund_method=refund_method or p.method,
                refund_reference=clean_ref,
                reason=clean_reason,
                reversal_status="Refunded",
                recorded_by=recorded_by_user_id,
            )
            db.add(rev)
            created_reversals.append(rev)
            remaining_to_refund = money(remaining_to_refund - chunk)

    db.flush()
    updated_fin = compute_invoice_financials(db, invoice)
    invoice.paid_amount = updated_fin["paid_amount"]
    invoice.payment_status = derive_invoice_payment_status(
        money(invoice.total_amount),
        updated_fin["paid_amount"],
        updated_fin["refunded_amount"],
        current_status=invoice.payment_status,
    )
    db.commit()
    db.refresh(invoice)
    for rev in created_reversals:
        db.refresh(rev)
    return invoice, created_reversals


def generate_villa_invoice_pdf(
    db: Session,
    invoice: VillaInvoice,
    *,
    output_dir: Path | None = None,
) -> Path:
    target_dir = output_dir or VILLA_INVOICE_PDF_DIR
    target_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = target_dir / f"villa-invoice-{invoice.id}-{invoice.invoice_number}.pdf"

    booking = invoice.booking
    guest = booking.guest or booking.customer
    unit = booking.unit
    villa = unit.villa if unit else None
    profile = db.query(BusinessProfile).filter(BusinessProfile.business_context == "VILLA").first()
    fin = compute_invoice_financials(db, invoice)

    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        rightMargin=15 * mm,
        leftMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
    )

    styles = getSampleStyleSheet()
    header_style = ParagraphStyle(
        "VillaHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#101722"),
    )
    sub_style = ParagraphStyle(
        "VillaSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#57534E"),
    )
    meta_title = ParagraphStyle(
        "VillaMetaTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#101722"),
    )
    meta_val = ParagraphStyle(
        "VillaMetaVal",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#292524"),
    )
    right_text = ParagraphStyle(
        "VillaRightText",
        parent=meta_val,
        alignment=TA_RIGHT,
    )
    right_bold = ParagraphStyle(
        "VillaRightBold",
        parent=meta_title,
        fontSize=10,
        alignment=TA_RIGHT,
    )

    story = []

    property_lines = []
    if profile and profile.business_name:
        property_lines.append(escape(profile.business_name))
    else:
        property_lines.append(f"{APP_NAME} {MODULE_NAMES['VILLA']}")
    contact_bits = [bit for bit in [profile.address_line if profile else None, profile.city if profile else None] if bit]
    if contact_bits:
        property_lines.append(escape(", ".join(contact_bits)))
    phone_email = [bit for bit in [profile.business_phone if profile else None, profile.business_email if profile else None] if bit]
    if phone_email:
        property_lines.append(escape(" · ".join(phone_email)))

    invoice_date_str = invoice.created_at.strftime("%d-%b-%Y") if invoice.created_at else str(date.today())
    state_label = "Finalized Tax Invoice" if invoice.is_finalized else "Proforma / Draft Invoice"

    brand_table = Table(
        [
            [
                Paragraph(f"<b>{escape(APP_NAME)} — {escape(MODULE_NAMES['VILLA'].upper())}</b>", header_style),
                Paragraph(f"<b>{escape(state_label.upper())}</b><br/><font color='#D97706'>{escape(invoice.invoice_number)}</font>", right_bold),
            ],
            [
                Paragraph("<br/>".join(property_lines), sub_style),
                Paragraph(f"Date: {escape(invoice_date_str)}<br/>Status: <b>{escape(invoice.payment_status)}</b>", right_text),
            ],
        ],
        colWidths=[105 * mm, 75 * mm],
    )
    brand_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(brand_table)
    story.append(Spacer(1, 4 * mm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#F59E0B")))
    story.append(Spacer(1, 6 * mm))

    guest_lines = [
        f"<b>{escape(guest.full_name if guest else 'Guest')}</b>",
        f"Phone: {escape(guest.phone if guest else 'N/A')}",
    ]
    if guest and guest.email:
        guest_lines.append(f"Email: {escape(guest.email)}")
    if guest and guest.address:
        guest_lines.append(f"Address: {escape(guest.address)}")

    policy = resolve_stay_policy(db, unit, villa)
    stay_lines = [
        f"Booking #: <b>{escape(booking.booking_number)}</b> ({escape(booking.status)})",
        f"Property: {escape(villa.name if villa else 'Villa')} · {escape(unit.name if unit else 'Unit')}",
        f"Check-in: {escape(format_date_with_time(booking.check_in, policy['check_in_time']))}",
        f"Check-out: {escape(format_date_with_time(booking.check_out, policy['check_out_time']))} · Guests: {booking.guests}",
    ]

    info_table = Table(
        [
            [Paragraph("<b>BILLED TO</b>", meta_title), Paragraph("<b>STAY DETAILS</b>", meta_title)],
            [Paragraph("<br/>".join(guest_lines), meta_val), Paragraph("<br/>".join(stay_lines), meta_val)],
        ],
        colWidths=[90 * mm, 90 * mm],
    )
    info_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E9F0")),
                ("PADDING", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(info_table)
    story.append(Spacer(1, 6 * mm))

    item_rows = [
        [
            Paragraph("<b>Type</b>", meta_title),
            Paragraph("<b>Description</b>", meta_title),
            Paragraph("<b>Qty</b>", right_bold),
            Paragraph("<b>Unit Price</b>", right_bold),
            Paragraph("<b>Total</b>", right_bold),
        ]
    ]
    charge_items = [it for it in invoice.items if it.item_type != "TAX"]
    if not charge_items:
        nights = max(1, (booking.check_out - booking.check_in).days)
        item_rows.append(
            [
                Paragraph("ACCOMMODATION", meta_val),
                Paragraph(escape(f"{villa.name if villa else 'Villa'} · {unit.name if unit else 'Unit'}"), meta_val),
                Paragraph(str(nights), right_text),
                Paragraph(format_inr(booking.nightly_rate), right_text),
                Paragraph(format_inr(booking.total_amount), right_bold),
            ]
        )
    else:
        for it in charge_items:
            item_rows.append(
                [
                    Paragraph(escape(it.item_type), meta_val),
                    Paragraph(escape(it.description), meta_val),
                    Paragraph(str(it.quantity), right_text),
                    Paragraph(format_inr(it.unit_price), right_text),
                    Paragraph(format_inr(it.total_amount), right_bold),
                ]
            )

    items_table = Table(item_rows, colWidths=[30 * mm, 75 * mm, 15 * mm, 30 * mm, 30 * mm], repeatRows=1)
    items_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#101722")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("LINEBELOW", (0, 1), (-1, -1), 0.5, colors.HexColor("#E5E9F0")),
                ("PADDING", (0, 0), (-1, -1), 6),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    story.append(items_table)
    story.append(Spacer(1, 6 * mm))

    summary_rows = [
        [Paragraph("Subtotal:", right_text), Paragraph(format_inr(invoice.subtotal), right_text)],
        [Paragraph(f"GST ({invoice.tax_rate}%):", right_text), Paragraph(format_inr(invoice.tax_amount), right_text)],
        [Paragraph("<b>Grand Total:</b>", right_bold), Paragraph(f"<b>{format_inr(invoice.total_amount)}</b>", right_bold)],
        [Paragraph("Payments Received:", right_text), Paragraph(format_inr(fin["gross_paid_amount"]), right_text)],
    ]
    if fin["refunded_amount"] > Decimal("0.00"):
        summary_rows.append(
            [Paragraph("Refunds Issued:", right_text), Paragraph(f"- {format_inr(fin['refunded_amount'])}", right_text)]
        )
    summary_rows.extend(
        [
            [Paragraph("Net Paid:", right_text), Paragraph(format_inr(fin["paid_amount"]), right_text)],
            [Paragraph("<b>Remaining Balance:</b>", right_bold), Paragraph(f"<b>{format_inr(fin['balance_due'])}</b>", right_bold)],
            [Paragraph("Payment Status:", right_text), Paragraph(f"<b>{escape(invoice.payment_status)}</b>", right_text)],
        ]
    )

    summary_table = Table(summary_rows, colWidths=[130 * mm, 50 * mm])
    summary_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("PADDING", (0, 0), (-1, -1), 4),
                ("LINEABOVE", (0, 2), (-1, 2), 0.8, colors.HexColor("#101722")),
            ]
        )
    )
    story.append(summary_table)
    story.append(Spacer(1, 10 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#E5E9F0")))
    story.append(Spacer(1, 4 * mm))
    story.append(
        Paragraph(
            f"Thank you for staying with {escape(APP_NAME)} {escape(MODULE_NAMES['VILLA'])}.",
            ParagraphStyle(
                "VillaFooter",
                parent=styles["Normal"],
                alignment=TA_CENTER,
                fontName="Helvetica",
                fontSize=8,
                textColor=colors.HexColor("#78716C"),
            ),
        )
    )

    doc.build(story)
    return pdf_path
