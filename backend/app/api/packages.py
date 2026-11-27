from __future__ import annotations

import csv
import io
from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import get_current_user, require_package_context
from app.core.date_utils import get_kolkata_now, get_kolkata_today
from app.db.session import get_db
from app.models.entities import Customer, Invoice, Order, Payment, PaymentStatus, User
from app.models.packages import (
    Package,
    PackageBlackout,
    PackageBooking,
    PackageBookingHistory,
    PackageBookingItem,
    PackageBookingStatus,
    PackageItem,
    PackageMedia,
    PackageStatus,
)
from app.schemas.customer import CustomerCreate, CustomerResponse, CustomerUpdate
from app.schemas.packages import (
    PackageBlackoutInput,
    PackageBlackoutUpdate,
    PackageBookingCreate,
    PackageBookingStatusUpdate,
    PackageCreate,
    PackageInvoiceCreate,
    PackageItemInput,
    PackageItemUpdate,
    PackageMediaUpdate,
    PackagePaymentCreate,
    PackageStatusUpdate,
    PackageUpdate,
)
from app.services.entity_image_service import validate_image_file
from app.services.packages_service import (
    ALLOWED_PACKAGE_BOOKING_TRANSITIONS,
    PACKAGE_CATEGORY_CONFIG,
    calculate_package_price,
    create_package_invoice_for_booking,
    evaluate_package_availability,
    find_overlapping_blackouts,
    generate_package_booking_number,
    generate_package_invoice_pdf,
    generate_unique_package_code,
    get_supported_inclusion_references,
    money,
    record_package_booking_history,
    record_package_payment,
    sync_expired_packages,
    sync_package_invoice_financials,
    validate_inclusion_reference,
    validate_package_for_activation,
)

router = APIRouter(
    tags=["Packages Module"],
    dependencies=[Depends(require_package_context)],
)


# ==========================================
# SERIALIZATION HELPERS
# ==========================================

def _serialize_item(item: PackageItem) -> dict:
    return {
        "id": item.id,
        "package_id": item.package_id,
        "inclusion_type": item.inclusion_type,
        "description": item.description,
        "quantity": item.quantity,
        "is_optional": item.is_optional,
        "reference_module": item.reference_module,
        "reference_id": item.reference_id,
        "reference_label": item.reference_label,
        "notes": item.notes,
        "sort_order": item.sort_order,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def _serialize_media(media: PackageMedia) -> dict:
    version = int(media.updated_at.timestamp()) if media.updated_at else 1
    return {
        "id": media.id,
        "package_id": media.package_id,
        "media_type": media.media_type,
        "mime_type": media.mime_type,
        "file_size": media.file_size,
        "file_name": media.file_name,
        "caption": media.caption,
        "sort_order": media.sort_order,
        "url": f"/api/packages/media/{media.id}?v={version}",
        "created_at": media.created_at,
    }


def _serialize_blackout(b: PackageBlackout) -> dict:
    return {
        "id": b.id,
        "package_id": b.package_id,
        "package_name": b.package.name if b.package else None,
        "package_code": b.package.package_code if b.package else None,
        "start_date": b.start_date,
        "end_date": b.end_date,
        "reason": b.reason,
        "notes": b.notes,
        "is_active": b.is_active,
        "created_at": b.created_at,
    }


def _serialize_package(pkg: Package, *, include_children: bool = False) -> dict:
    booking_count = sum(1 for b in pkg.bookings if not b.is_deleted) if pkg.bookings is not None else 0
    cover_url = pkg.cover_image_url
    if not cover_url and pkg.media:
        cover_item = next((m for m in pkg.media if m.media_type == "cover"), None) or pkg.media[0]
        version = int(cover_item.updated_at.timestamp()) if cover_item.updated_at else 1
        cover_url = f"/api/packages/media/{cover_item.id}?v={version}"

    payload = {
        "id": pkg.id,
        "business_context": pkg.business_context,
        "package_code": pkg.package_code,
        "name": pkg.name,
        "category": pkg.category,
        "description": pkg.description,
        "duration_nights": pkg.duration_nights,
        "min_guests": pkg.min_guests,
        "max_guests": pkg.max_guests,
        "pricing_type": pkg.pricing_type,
        "price": money(pkg.price),
        "valid_from": pkg.valid_from,
        "valid_to": pkg.valid_to,
        "applicable_accommodation_types": pkg.applicable_accommodation_types,
        "is_customizable": pkg.is_customizable,
        "is_seasonal_offer": pkg.is_seasonal_offer,
        "offer_badge": pkg.offer_badge,
        "terms_and_conditions": pkg.terms_and_conditions,
        "exclusions": pkg.exclusions,
        "status": pkg.status,
        "cover_image_url": cover_url,
        "inclusions_count": len(pkg.items) if pkg.items is not None else 0,
        "media_count": len(pkg.media) if pkg.media is not None else 0,
        "blackouts_count": sum(1 for blk in pkg.blackouts if blk.is_active) if pkg.blackouts is not None else 0,
        "booking_count": booking_count,
        "created_at": pkg.created_at,
        "updated_at": pkg.updated_at,
    }
    if include_children:
        payload["items"] = [_serialize_item(it) for it in pkg.items]
        payload["media"] = [_serialize_media(m) for m in pkg.media]
        payload["blackouts"] = [_serialize_blackout(blk) for blk in pkg.blackouts]
    return payload


def _serialize_payment(p: Payment) -> dict:
    return {
        "id": p.id,
        "invoice_id": p.invoice_id,
        "payment_method": getattr(p.payment_method, "value", str(p.payment_method)),
        "payment_type": p.payment_type,
        "amount": money(p.amount),
        "status": getattr(p.status, "value", str(p.status)),
        "reference_number": p.reference_number,
        "paid_at": p.paid_at,
        "received_by": p.received_by,
        "receiver_name": p.receiver.full_name if p.receiver else None,
        "source_module": p.source_module,
        "created_at": p.created_at,
    }


def _serialize_invoice(inv: Invoice, booking: PackageBooking | None = None) -> dict:
    b = booking
    cust = inv.customer or (b.customer if b else None)
    pkg_payments = [p for p in inv.payments if p.source_module == "PACKAGE"] if inv.payments else []
    pay_status = getattr(inv.payment_status, "value", str(inv.payment_status))
    return {
        "id": inv.id,
        "invoice_number": inv.invoice_number,
        "source_module": inv.source_module,
        "source_reference_id": inv.source_reference_id,
        "source_reference_number": inv.source_reference_number,
        "package_booking_id": inv.package_booking_id,
        "booking_number": b.booking_number if b else inv.source_reference_number,
        "booking_status": b.status if b else None,
        "package_name": b.package_name_snapshot if b else None,
        "package_code": b.package_code_snapshot if b else None,
        "start_date": b.start_date if b else None,
        "end_date": b.end_date if b else None,
        "guest_count": b.guest_count if b else None,
        "customer_id": inv.customer_id or (b.customer_id if b else None),
        "customer_name": cust.full_name if cust else "Customer",
        "customer_phone": cust.phone if cust else None,
        "customer_email": cust.email if cust else None,
        "subtotal": money(inv.subtotal),
        "gst_rate": money(inv.gst_rate),
        "gst_amount": money(inv.gst_amount),
        "total_amount": money(inv.total_amount),
        "paid_amount": money(inv.paid_amount),
        "balance_due": money(inv.balance_due),
        "payment_status": pay_status,
        "pdf_path": inv.pdf_path,
        "notes": inv.notes,
        "payments": [_serialize_payment(p) for p in pkg_payments],
        "created_at": inv.created_at,
        "updated_at": inv.updated_at,
    }


def _serialize_booking(b: PackageBooking, *, include_details: bool = False) -> dict:
    inv = b.invoice
    cust = b.customer
    pay_status = getattr(inv.payment_status, "value", str(inv.payment_status)) if inv else None
    payload = {
        "id": b.id,
        "booking_number": b.booking_number,
        "package_id": b.package_id,
        "customer_id": b.customer_id,
        "customer_name": cust.full_name if cust else "Customer",
        "customer_phone": cust.phone if cust else None,
        "customer_email": cust.email if cust else None,
        "booking_date": b.booking_date,
        "start_date": b.start_date,
        "end_date": b.end_date,
        "guest_count": b.guest_count,
        "package_name": b.package_name_snapshot,
        "package_code": b.package_code_snapshot,
        "package_category": b.package_category_snapshot,
        "pricing_type": b.pricing_type_snapshot,
        "unit_price": money(b.unit_price_snapshot),
        "duration_nights": b.duration_nights_snapshot,
        "total_amount": money(b.total_amount),
        "terms_snapshot": b.terms_snapshot,
        "exclusions_snapshot": b.exclusions_snapshot,
        "status": b.status,
        "cancellation_reason": b.cancellation_reason,
        "cancelled_at": b.cancelled_at,
        "notes": b.notes,
        "source_identifier": b.source_identifier,
        "invoice_id": inv.id if inv else None,
        "invoice_number": inv.invoice_number if inv else None,
        "invoice_total": money(inv.total_amount) if inv else None,
        "invoice_paid": money(inv.paid_amount) if inv else Decimal("0.00"),
        "invoice_balance_due": money(inv.balance_due) if inv else money(b.total_amount),
        "invoice_payment_status": pay_status,
        "inclusions_count": len(b.items) if b.items is not None else 0,
        "created_at": b.created_at,
        "updated_at": b.updated_at,
    }
    if include_details:
        payload["items"] = [
            {
                "id": it.id,
                "inclusion_type": it.inclusion_type,
                "description": it.description,
                "quantity": it.quantity,
                "is_optional": it.is_optional,
                "is_selected": it.is_selected,
                "reference_module": it.reference_module,
                "reference_id": it.reference_id,
                "reference_label": it.reference_label,
                "notes": it.notes,
                "billing_source": it.billing_source,
            }
            for it in b.items
        ]
        payload["history"] = [
            {
                "id": h.id,
                "action": h.action,
                "previous_status": h.previous_status,
                "new_status": h.new_status,
                "reason": h.reason,
                "changed_by": h.changed_by,
                "changed_by_name": h.changed_by_user.full_name if h.changed_by_user else None,
                "changed_at": h.changed_at,
            }
            for h in b.history
        ]
        payload["invoice"] = _serialize_invoice(inv, b) if inv else None
    return payload


def _get_package_or_404(db: Session, package_id: int) -> Package:
    pkg = (
        db.query(Package)
        .options(
            selectinload(Package.items),
            selectinload(Package.media),
            selectinload(Package.blackouts),
            selectinload(Package.bookings),
        )
        .filter(Package.id == package_id, Package.is_deleted.is_(False))
        .first()
    )
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found.")
    return pkg


def _paginate(rows: list, page: int, page_size: int) -> dict:
    total = len(rows)
    total_pages = max(1, (total + page_size - 1) // page_size)
    safe_page = min(max(1, page), total_pages)
    start = (safe_page - 1) * page_size
    return {
        "items": rows[start : start + page_size],
        "total": total,
        "page": safe_page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


# ==========================================
# 1. DASHBOARD
# ==========================================

@router.get("/dashboard")
def packages_dashboard(db: Session = Depends(get_db)):
    sync_expired_packages(db)
    today = get_kolkata_today()

    packages = (
        db.query(Package)
        .filter(Package.is_deleted.is_(False))
        .all()
    )
    status_counts = {s.value: 0 for s in PackageStatus}
    for p in packages:
        status_counts[p.status] = status_counts.get(p.status, 0) + 1

    bookings = (
        db.query(PackageBooking)
        .options(
            joinedload(PackageBooking.customer),
            joinedload(PackageBooking.invoice).selectinload(Invoice.payments),
            selectinload(PackageBooking.items),
        )
        .filter(PackageBooking.is_deleted.is_(False))
        .order_by(PackageBooking.created_at.desc(), PackageBooking.id.desc())
        .all()
    )

    upcoming_bookings = [
        b
        for b in bookings
        if b.status in {PackageBookingStatus.PENDING.value, PackageBookingStatus.CONFIRMED.value, PackageBookingStatus.IN_PROGRESS.value}
        and b.start_date >= today
    ]
    pending_confirmations = [b for b in bookings if b.status == PackageBookingStatus.PENDING.value]

    revenue_generated = money(
        db.query(func.coalesce(func.sum(Payment.amount), Decimal("0.00")))
        .filter(Payment.source_module == "PACKAGE", Payment.status == PaymentStatus.PAID)
        .scalar()
    )

    pkg_invoices = (
        db.query(Invoice)
        .filter(Invoice.source_module == "PACKAGE")
        .all()
    )
    cancelled_booking_ids = {b.id for b in bookings if b.status == PackageBookingStatus.CANCELLED.value}
    outstanding_balance = money(
        sum(
            (
                money(inv.balance_due)
                for inv in pkg_invoices
                if inv.package_booking_id not in cancelled_booking_ids and money(inv.balance_due) > Decimal("0.00")
            ),
            Decimal("0.00"),
        )
    )
    outstanding_invoices_count = sum(
        1
        for inv in pkg_invoices
        if inv.package_booking_id not in cancelled_booking_ids and money(inv.balance_due) > Decimal("0.00")
    )

    # Operational Alerts from real DB records
    expiring_soon = [
        p
        for p in packages
        if p.status in {PackageStatus.AVAILABLE.value, PackageStatus.PUBLISHED.value}
        and today <= p.valid_to <= today + timedelta(days=14)
    ]
    expired_pkgs = [p for p in packages if p.status == PackageStatus.EXPIRED.value]
    upcoming_7d = [
        b
        for b in upcoming_bookings
        if today <= b.start_date <= today + timedelta(days=7)
    ]

    alerts: list[dict] = []
    if expiring_soon:
        alerts.append(
            {
                "id": "expiring_soon",
                "severity": "warning",
                "title": "Packages Approaching Expiry",
                "message": f"{len(expiring_soon)} package(s) expire within the next 14 days ({', '.join(p.package_code for p in expiring_soon[:3])}).",
                "count": len(expiring_soon),
                "route": "/packages/catalog?status=Available",
            }
        )
    if expired_pkgs:
        alerts.append(
            {
                "id": "expired_packages",
                "severity": "error",
                "title": "Expired Packages",
                "message": f"{len(expired_pkgs)} package(s) have passed their validity end date and are blocked from booking.",
                "count": len(expired_pkgs),
                "route": "/packages/catalog?status=Expired",
            }
        )
    if pending_confirmations:
        alerts.append(
            {
                "id": "pending_confirmations",
                "severity": "warning",
                "title": "Pending Booking Confirmations",
                "message": f"{len(pending_confirmations)} package booking(s) await confirmation.",
                "count": len(pending_confirmations),
                "route": "/packages/bookings?status=Pending",
            }
        )
    if upcoming_7d:
        alerts.append(
            {
                "id": "upcoming_bookings",
                "severity": "info",
                "title": "Upcoming Package Arrivals",
                "message": f"{len(upcoming_7d)} package booking(s) are scheduled to start within the next 7 days.",
                "count": len(upcoming_7d),
                "route": "/packages/bookings",
            }
        )
    if outstanding_invoices_count > 0:
        alerts.append(
            {
                "id": "outstanding_payments",
                "severity": "warning",
                "title": "Outstanding Package Balances",
                "message": f"{outstanding_invoices_count} package invoice(s) have ₹{outstanding_balance:,.2f} pending collection.",
                "count": outstanding_invoices_count,
                "route": "/packages/invoices?payment_status=Pending",
            }
        )

    return {
        "statistics": {
            "total_packages": len(packages),
            "available_packages": status_counts.get(PackageStatus.AVAILABLE.value, 0),
            "published_packages": status_counts.get(PackageStatus.PUBLISHED.value, 0),
            "upcoming_packages": status_counts.get(PackageStatus.UPCOMING.value, 0),
            "paused_packages": status_counts.get(PackageStatus.PAUSED.value, 0),
            "active_packages": status_counts.get(PackageStatus.AVAILABLE.value, 0),
            "inactive_packages": status_counts.get(PackageStatus.PAUSED.value, 0),
            "draft_packages": status_counts.get(PackageStatus.DRAFT.value, 0),
            "expired_packages": status_counts.get(PackageStatus.EXPIRED.value, 0),
            "archived_packages": status_counts.get(PackageStatus.ARCHIVED.value, 0),
            "total_bookings": len(bookings),
            "upcoming_bookings": len(upcoming_bookings),
            "pending_confirmations": len(pending_confirmations),
            "revenue_generated": revenue_generated,
            "outstanding_balance": outstanding_balance,
        },
        "recent_bookings": [_serialize_booking(b) for b in bookings[:10]],
        "alerts": alerts,
    }


@router.get("/notifications")
def get_packages_notifications(db: Session = Depends(get_db)):
    dash = packages_dashboard(db=db)
    return {"items": dash["alerts"], "total": len(dash["alerts"])}


# ==========================================
# 2. CATEGORIES & SETTINGS
# ==========================================

@router.get("/categories")
def list_package_categories(db: Session = Depends(get_db)):
    sync_expired_packages(db)
    counts = dict(
        db.query(Package.category, func.count(Package.id))
        .filter(Package.is_deleted.is_(False))
        .group_by(Package.category)
        .all()
    )
    active_counts = dict(
        db.query(Package.category, func.count(Package.id))
        .filter(Package.is_deleted.is_(False), Package.status == PackageStatus.AVAILABLE.value)
        .group_by(Package.category)
        .all()
    )
    return [
        {
            "name": cfg["name"],
            "description": cfg["description"],
            "package_count": int(counts.get(cfg["name"], 0)),
            "active_count": int(active_counts.get(cfg["name"], 0)),
        }
        for cfg in PACKAGE_CATEGORY_CONFIG
    ]


@router.get("/settings")
def get_packages_settings():
    return {
        "module": "Packages",
        "business_context": "PACKAGE",
        "timezone": "Asia/Kolkata",
        "default_gst_rate": Decimal("18.00"),
        "booking_number_prefix": "PKG",
        "categories": [c["name"] for c in PACKAGE_CATEGORY_CONFIG],
        "pricing_types": ["Per Package", "Per Person", "Per Night"],
        "statuses": [s.value for s in PackageStatus],
        "inclusion_types": [
            "Unit Stay",
            "Meal Plan",
            "Spa Service",
            "Activity",
            "Transport Service",
            "Amenity",
            "Other",
        ],
    }


# ==========================================
# 3. PACKAGES CRUD, STATUS & AVAILABILITY
# ==========================================

@router.get("/packages")
def list_packages(
    search: str = "",
    category: str = "",
    status_filter: str = Query(default="", alias="status"),
    seasonal_only: bool = False,
    include_archived: bool = True,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    sync_expired_packages(db)
    q = (
        db.query(Package)
        .options(
            selectinload(Package.items),
            selectinload(Package.media),
            selectinload(Package.blackouts),
            selectinload(Package.bookings),
        )
        .filter(Package.is_deleted.is_(False))
    )
    if not include_archived:
        q = q.filter(Package.status != PackageStatus.ARCHIVED.value)
    if category and category.strip():
        q = q.filter(Package.category == category.strip())
    if status_filter and status_filter.strip():
        q = q.filter(Package.status == status_filter.strip())
    if seasonal_only:
        q = q.filter(or_(Package.is_seasonal_offer.is_(True), Package.category == "Seasonal"))
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        q = q.filter(
            or_(
                Package.name.ilike(pattern),
                Package.package_code.ilike(pattern),
                Package.category.ilike(pattern),
                Package.description.ilike(pattern),
            )
        )

    rows = q.order_by(Package.updated_at.desc(), Package.id.desc()).all()
    serialized = [_serialize_package(p, include_children=True) for p in rows]
    return _paginate(serialized, page, page_size)


@router.post("/packages", status_code=status.HTTP_201_CREATED)
def create_package(
    data: PackageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    is_seasonal = bool(data.is_seasonal_offer or data.category == "Seasonal")
    auto_code = generate_unique_package_code(
        db,
        is_seasonal_offer=is_seasonal,
        category=data.category,
    )

    pkg = Package(
        business_context="PACKAGE",
        package_code=auto_code,
        name=data.name,
        category=data.category,
        description=data.description,
        duration_nights=data.duration_nights,
        min_guests=data.min_guests,
        max_guests=data.max_guests,
        pricing_type=data.pricing_type,
        price=money(data.price),
        valid_from=data.valid_from,
        valid_to=data.valid_to,
        applicable_accommodation_types=data.applicable_accommodation_types,
        is_customizable=data.is_customizable,
        is_seasonal_offer=is_seasonal,
        offer_badge=data.offer_badge,
        terms_and_conditions=data.terms_and_conditions,
        exclusions=data.exclusions,
        status=PackageStatus.DRAFT.value,  # Mandatory: new packages initially saved as Draft
        created_by=current_user.id,
    )
    db.add(pkg)
    try:
        db.flush()
        for idx, item_in in enumerate(data.items):
            ref_mod, ref_id, ref_lbl = validate_inclusion_reference(
                db,
                item_in.inclusion_type,
                item_in.reference_id,
                item_in.reference_module,
                item_in.reference_label,
            )
            db.add(
                PackageItem(
                    package_id=pkg.id,
                    inclusion_type=item_in.inclusion_type,
                    description=item_in.description,
                    quantity=item_in.quantity,
                    is_optional=item_in.is_optional,
                    reference_module=ref_mod,
                    reference_id=ref_id,
                    reference_label=ref_lbl,
                    notes=item_in.notes,
                    sort_order=item_in.sort_order or idx,
                )
            )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Package code conflicts with an existing package.") from exc

    return _serialize_package(_get_package_or_404(db, pkg.id), include_children=True)


@router.get("/packages/{package_id}")
def get_package(package_id: int, db: Session = Depends(get_db)):
    sync_expired_packages(db)
    pkg = _get_package_or_404(db, package_id)
    data = _serialize_package(pkg, include_children=True)
    # Include recent bookings summary for Package Details view
    recent_pkg_bookings = (
        db.query(PackageBooking)
        .options(joinedload(PackageBooking.customer), joinedload(PackageBooking.invoice))
        .filter(PackageBooking.package_id == pkg.id, PackageBooking.is_deleted.is_(False))
        .order_by(PackageBooking.created_at.desc())
        .limit(20)
        .all()
    )
    data["bookings"] = [_serialize_booking(b) for b in recent_pkg_bookings]
    return data


@router.patch("/packages/{package_id}")
def update_package(
    package_id: int,
    data: PackageUpdate,
    db: Session = Depends(get_db),
):
    pkg = _get_package_or_404(db, package_id)
    updates = data.model_dump(exclude_unset=True)
    updates.pop("package_code", None)

    new_min = updates.get("min_guests", pkg.min_guests)
    new_max = updates.get("max_guests", pkg.max_guests)
    if new_max < new_min:
        raise HTTPException(status_code=422, detail="Maximum guests cannot be lower than minimum guests.")

    new_from = updates.get("valid_from", pkg.valid_from)
    new_to = updates.get("valid_to", pkg.valid_to)
    if new_to < new_from:
        raise HTTPException(status_code=422, detail="Valid-to date cannot precede valid-from date.")

    for field, val in updates.items():
        if field == "price" and val is not None:
            setattr(pkg, field, money(val))
        else:
            setattr(pkg, field, val)

    today = get_kolkata_today()
    if (
        pkg.status
        in {
            PackageStatus.PUBLISHED.value,
            PackageStatus.UPCOMING.value,
            PackageStatus.AVAILABLE.value,
            PackageStatus.PAUSED.value,
        }
        and pkg.valid_to < today
    ):
        pkg.status = PackageStatus.EXPIRED.value
    elif pkg.status == PackageStatus.EXPIRED.value and pkg.valid_to >= today:
        pkg.status = PackageStatus.PAUSED.value

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Package update conflicts with an existing code.") from exc

    return _serialize_package(_get_package_or_404(db, pkg.id), include_children=True)


@router.post("/packages/{package_id}/status")
@router.patch("/packages/{package_id}/status")
def update_package_status(
    package_id: int,
    data: PackageStatusUpdate,
    db: Session = Depends(get_db),
):
    pkg = _get_package_or_404(db, package_id)
    target = data.status
    if target in {
        PackageStatus.PUBLISHED.value,
        PackageStatus.UPCOMING.value,
        PackageStatus.AVAILABLE.value,
    }:
        errors = validate_package_for_activation(pkg)
        if errors:
            raise HTTPException(status_code=409, detail=" ".join(errors))
    pkg.status = target
    db.commit()
    return _serialize_package(_get_package_or_404(db, pkg.id), include_children=True)


@router.delete("/packages/{package_id}")
def delete_package(package_id: int, db: Session = Depends(get_db)):
    pkg = _get_package_or_404(db, package_id)
    active_booking = (
        db.query(PackageBooking)
        .filter(
            PackageBooking.package_id == pkg.id,
            PackageBooking.is_deleted.is_(False),
            PackageBooking.status.in_(
                [
                    PackageBookingStatus.PENDING.value,
                    PackageBookingStatus.CONFIRMED.value,
                    PackageBookingStatus.IN_PROGRESS.value,
                ]
            ),
        )
        .first()
    )
    if active_booking:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete a package with active bookings. Deactivate or archive it instead.",
        )

    pkg.is_deleted = True
    pkg.deleted_at = get_kolkata_now()
    pkg.status = PackageStatus.ARCHIVED.value
    db.commit()
    return {"message": f"Package '{pkg.name}' deleted successfully."}


@router.get("/packages/{package_id}/availability")
def check_package_availability(
    package_id: int,
    start_date: date,
    guest_count: int = Query(default=1, ge=1),
    customer_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
):
    sync_expired_packages(db)
    pkg = _get_package_or_404(db, package_id)
    return evaluate_package_availability(db, pkg, start_date, guest_count, customer_id=customer_id)


# ==========================================
# 4. PACKAGE INCLUSIONS (ITEMS)
# ==========================================

@router.get("/inclusions/references")
def list_inclusion_references(db: Session = Depends(get_db)):
    return get_supported_inclusion_references(db)


@router.get("/items")
def list_package_items(package_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(PackageItem).join(Package).filter(Package.is_deleted.is_(False))
    if package_id is not None:
        q = q.filter(PackageItem.package_id == package_id)
    rows = q.order_by(PackageItem.sort_order.asc(), PackageItem.id.asc()).all()
    return [_serialize_item(r) for r in rows]


@router.get("/packages/{package_id}/items")
def list_items_for_package(package_id: int, db: Session = Depends(get_db)):
    pkg = _get_package_or_404(db, package_id)
    return [_serialize_item(it) for it in pkg.items]


@router.post("/items", status_code=status.HTTP_201_CREATED)
def add_package_item_root(
    package_id: int = Query(..., ge=1),
    data: PackageItemInput = ...,
    db: Session = Depends(get_db),
):
    return add_package_item(package_id=package_id, data=data, db=db)


@router.post("/packages/{package_id}/items", status_code=status.HTTP_201_CREATED)
def add_package_item(
    package_id: int,
    data: PackageItemInput,
    db: Session = Depends(get_db),
):
    pkg = _get_package_or_404(db, package_id)
    ref_mod, ref_id, ref_lbl = validate_inclusion_reference(
        db,
        data.inclusion_type,
        data.reference_id,
        data.reference_module,
        data.reference_label,
    )
    item = PackageItem(
        package_id=pkg.id,
        inclusion_type=data.inclusion_type,
        description=data.description,
        quantity=data.quantity,
        is_optional=data.is_optional,
        reference_module=ref_mod,
        reference_id=ref_id,
        reference_label=ref_lbl,
        notes=data.notes,
        sort_order=data.sort_order,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_item(item)


@router.patch("/items/{item_id}")
def update_package_item(
    item_id: int,
    data: PackageItemUpdate,
    db: Session = Depends(get_db),
):
    item = db.get(PackageItem, item_id)
    if not item or item.package.is_deleted:
        raise HTTPException(status_code=404, detail="Package inclusion not found.")

    updates = data.model_dump(exclude_unset=True)
    next_type = updates.get("inclusion_type", item.inclusion_type)
    next_ref_id = updates.get("reference_id", item.reference_id)
    next_ref_mod = updates.get("reference_module", item.reference_module)
    next_ref_lbl = updates.get("reference_label", item.reference_label)

    if any(k in updates for k in ("inclusion_type", "reference_id", "reference_module", "reference_label")):
        ref_mod, ref_id, ref_lbl = validate_inclusion_reference(
            db, next_type, next_ref_id, next_ref_mod, next_ref_lbl
        )
        updates["reference_module"] = ref_mod
        updates["reference_id"] = ref_id
        updates["reference_label"] = ref_lbl

    for field, val in updates.items():
        setattr(item, field, val)
    db.commit()
    db.refresh(item)
    return _serialize_item(item)


@router.delete("/items/{item_id}")
def delete_package_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(PackageItem, item_id)
    if not item or item.package.is_deleted:
        raise HTTPException(status_code=404, detail="Package inclusion not found.")

    pkg = _get_package_or_404(db, item.package_id)
    if (
        pkg.status
        in {
            PackageStatus.PUBLISHED.value,
            PackageStatus.UPCOMING.value,
            PackageStatus.AVAILABLE.value,
        }
        and len(pkg.items) <= 1
    ):
        raise HTTPException(
            status_code=409,
            detail="A live package must have at least one inclusion. Pause the package or add another inclusion first.",
        )

    db.delete(item)
    db.commit()
    return {"message": "Inclusion removed."}


# ==========================================
# 5. PACKAGE MEDIA MANAGEMENT
# ==========================================

@router.get("/media")
def list_media(package_id: int = Query(..., ge=1), db: Session = Depends(get_db)):
    pkg = _get_package_or_404(db, package_id)
    return [_serialize_media(m) for m in pkg.media]


@router.get("/packages/{package_id}/media")
def list_package_media(package_id: int, db: Session = Depends(get_db)):
    pkg = _get_package_or_404(db, package_id)
    return [_serialize_media(m) for m in pkg.media]


@router.post("/media", status_code=status.HTTP_201_CREATED)
async def upload_media_root(
    package_id: int = Form(..., ge=1),
    media_type: str = Form(default="gallery"),
    caption: str | None = Form(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    return await upload_package_media(
        package_id=package_id,
        media_type=media_type,
        caption=caption,
        file=file,
        db=db,
    )


@router.post("/packages/{package_id}/media", status_code=status.HTTP_201_CREATED)
async def upload_package_media(
    package_id: int,
    media_type: str = Form(default="gallery"),
    caption: str | None = Form(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    pkg = _get_package_or_404(db, package_id)
    normalized_type = (media_type or "gallery").strip().lower()
    if normalized_type not in {"cover", "gallery"}:
        raise HTTPException(status_code=422, detail="media_type must be 'cover' or 'gallery'.")

    image_bytes, mime_type, file_size, checksum = await validate_image_file(file)

    if normalized_type == "cover":
        # Replace existing cover designation cleanly (demote old cover or replace if only 1)
        for existing_cover in pkg.media:
            if existing_cover.media_type == "cover":
                existing_cover.media_type = "gallery"

    media = PackageMedia(
        package_id=pkg.id,
        media_type=normalized_type,
        image_data=image_bytes,
        mime_type=mime_type,
        file_size=file_size,
        checksum=checksum,
        file_name=file.filename,
        caption=caption.strip() if caption and caption.strip() else None,
        sort_order=0 if normalized_type == "cover" else len(pkg.media) + 1,
    )
    db.add(media)
    db.flush()

    if normalized_type == "cover" or not pkg.cover_image_url:
        ts = int(get_kolkata_now().timestamp())
        pkg.cover_image_url = f"/api/packages/media/{media.id}?v={ts}"

    db.commit()
    db.refresh(media)
    return _serialize_media(media)


@router.get("/media/{media_id}")
def get_package_media_file(media_id: int, request: Request, db: Session = Depends(get_db)):
    media = db.get(PackageMedia, media_id)
    if not media or media.package.is_deleted:
        raise HTTPException(status_code=404, detail="Package media not found.")

    etag = f'"{media.checksum}"'
    if_none_match = request.headers.get("if-none-match")
    if if_none_match and (if_none_match == etag or if_none_match == media.checksum):
        return Response(status_code=status.HTTP_304_NOT_MODIFIED)

    headers = {
        "Content-Type": media.mime_type,
        "Content-Length": str(media.file_size),
        "ETag": etag,
        "Cache-Control": "private, max-age=86400, must-revalidate",
    }
    return Response(content=media.image_data, media_type=media.mime_type, headers=headers)


@router.patch("/media/{media_id}")
def update_package_media(
    media_id: int,
    data: PackageMediaUpdate,
    db: Session = Depends(get_db),
):
    media = db.get(PackageMedia, media_id)
    if not media or media.package.is_deleted:
        raise HTTPException(status_code=404, detail="Package media not found.")

    pkg = _get_package_or_404(db, media.package_id)
    if data.media_type == "cover":
        for m in pkg.media:
            if m.id != media.id and m.media_type == "cover":
                m.media_type = "gallery"
        media.media_type = "cover"
        ts = int(get_kolkata_now().timestamp())
        pkg.cover_image_url = f"/api/packages/media/{media.id}?v={ts}"
    elif data.media_type == "gallery":
        media.media_type = "gallery"

    if data.caption is not None:
        media.caption = data.caption.strip() or None
    if data.sort_order is not None:
        media.sort_order = data.sort_order

    db.commit()
    db.refresh(media)
    return _serialize_media(media)


@router.delete("/media/{media_id}")
def delete_package_media(media_id: int, db: Session = Depends(get_db)):
    media = db.get(PackageMedia, media_id)
    if not media or media.package.is_deleted:
        raise HTTPException(status_code=404, detail="Package media not found.")

    pkg = _get_package_or_404(db, media.package_id)
    was_cover = media.media_type == "cover" or (pkg.cover_image_url and f"/media/{media.id}" in pkg.cover_image_url)
    db.delete(media)
    db.flush()

    if was_cover:
        remaining = [m for m in pkg.media if m.id != media_id]
        if remaining:
            next_cover = next((m for m in remaining if m.media_type == "cover"), remaining[0])
            next_cover.media_type = "cover"
            ts = int(get_kolkata_now().timestamp())
            pkg.cover_image_url = f"/api/packages/media/{next_cover.id}?v={ts}"
        else:
            pkg.cover_image_url = None

    db.commit()
    return {"message": "Package media removed."}


# ==========================================
# 6. PACKAGE BLACKOUT DATES
# ==========================================

@router.get("/blackouts")
def list_blackouts(
    package_id: int | None = None,
    active_only: bool = False,
    db: Session = Depends(get_db),
):
    q = (
        db.query(PackageBlackout)
        .options(joinedload(PackageBlackout.package))
        .join(Package)
        .filter(Package.is_deleted.is_(False))
    )
    if package_id is not None:
        q = q.filter(PackageBlackout.package_id == package_id)
    if active_only:
        q = q.filter(PackageBlackout.is_active.is_(True))
    rows = q.order_by(PackageBlackout.start_date.asc(), PackageBlackout.id.asc()).all()
    return [_serialize_blackout(b) for b in rows]


@router.post("/blackouts", status_code=status.HTTP_201_CREATED)
def create_blackout(
    data: PackageBlackoutInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pkg = _get_package_or_404(db, data.package_id)
    blk = PackageBlackout(
        package_id=pkg.id,
        start_date=data.start_date,
        end_date=data.end_date,
        reason=data.reason,
        notes=data.notes,
        is_active=data.is_active,
        created_by=current_user.id,
    )
    db.add(blk)
    db.commit()
    db.refresh(blk)
    return _serialize_blackout(blk)


@router.patch("/blackouts/{blackout_id}")
def update_blackout(
    blackout_id: int,
    data: PackageBlackoutUpdate,
    db: Session = Depends(get_db),
):
    blk = db.get(PackageBlackout, blackout_id)
    if not blk or blk.package.is_deleted:
        raise HTTPException(status_code=404, detail="Blackout entry not found.")

    updates = data.model_dump(exclude_unset=True)
    next_start = updates.get("start_date", blk.start_date)
    next_end = updates.get("end_date", blk.end_date)
    if next_end < next_start:
        raise HTTPException(status_code=422, detail="Blackout end date cannot precede start date.")

    for field, val in updates.items():
        setattr(blk, field, val)
    db.commit()
    db.refresh(blk)
    return _serialize_blackout(blk)


@router.delete("/blackouts/{blackout_id}")
def delete_blackout(blackout_id: int, db: Session = Depends(get_db)):
    blk = db.get(PackageBlackout, blackout_id)
    if not blk or blk.package.is_deleted:
        raise HTTPException(status_code=404, detail="Blackout entry not found.")
    db.delete(blk)
    db.commit()
    return {"message": "Blackout date removed."}


# ==========================================
# 7. PACKAGE BOOKINGS
# ==========================================

@router.get("/bookings")
def list_bookings(
    search: str = "",
    status_filter: str = Query(default="", alias="status"),
    package_id: int | None = None,
    customer_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    q = (
        db.query(PackageBooking)
        .options(
            joinedload(PackageBooking.customer),
            joinedload(PackageBooking.invoice).selectinload(Invoice.payments),
            selectinload(PackageBooking.items),
        )
        .outerjoin(Customer, PackageBooking.customer_id == Customer.id)
        .filter(PackageBooking.is_deleted.is_(False))
    )
    if status_filter and status_filter.strip():
        q = q.filter(PackageBooking.status == status_filter.strip())
    if package_id is not None:
        q = q.filter(PackageBooking.package_id == package_id)
    if customer_id is not None:
        q = q.filter(PackageBooking.customer_id == customer_id)
    if date_from:
        q = q.filter(PackageBooking.start_date >= date_from)
    if date_to:
        q = q.filter(PackageBooking.start_date <= date_to)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        q = q.filter(
            or_(
                PackageBooking.booking_number.ilike(pattern),
                PackageBooking.package_name_snapshot.ilike(pattern),
                PackageBooking.package_code_snapshot.ilike(pattern),
                Customer.full_name.ilike(pattern),
                Customer.phone.ilike(pattern),
            )
        )

    rows = q.order_by(PackageBooking.created_at.desc(), PackageBooking.id.desc()).all()
    return _paginate([_serialize_booking(b) for b in rows], page, page_size)


@router.post("/bookings", status_code=status.HTTP_201_CREATED)
def create_booking(
    data: PackageBookingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sync_expired_packages(db)
    pkg = _get_package_or_404(db, data.package_id)

    customer = db.get(Customer, data.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")

    avail = evaluate_package_availability(db, pkg, data.start_date, data.guest_count, customer_id=data.customer_id)
    if not avail["available"]:
        raise HTTPException(status_code=409, detail=" ".join(avail["reasons"]))

    booking_number = generate_package_booking_number(db)
    today = get_kolkata_today()
    end_date = avail["end_date"]
    total_amount = money(avail["calculated_total"])

    booking = PackageBooking(
        business_context="PACKAGE",
        booking_number=booking_number,
        package_id=pkg.id,
        customer_id=customer.id,
        booking_date=today,
        start_date=data.start_date,
        end_date=end_date,
        guest_count=data.guest_count,
        package_name_snapshot=pkg.name,
        package_code_snapshot=pkg.package_code,
        package_category_snapshot=pkg.category,
        pricing_type_snapshot=pkg.pricing_type,
        unit_price_snapshot=money(pkg.price),
        duration_nights_snapshot=pkg.duration_nights,
        total_amount=total_amount,
        terms_snapshot=pkg.terms_and_conditions,
        exclusions_snapshot=pkg.exclusions,
        status=PackageBookingStatus.PENDING.value,
        notes=data.notes,
        source_identifier="PACKAGE_BOOKING",
        created_by=current_user.id,
    )
    db.add(booking)
    db.flush()

    selected_opt_set = set(data.selected_optional_item_ids) if data.selected_optional_item_ids is not None else None
    for pkg_item in pkg.items:
        if pkg_item.is_optional:
            is_selected = True if selected_opt_set is None else (pkg_item.id in selected_opt_set)
        else:
            is_selected = True
        db.add(
            PackageBookingItem(
                booking_id=booking.id,
                package_item_id=pkg_item.id,
                inclusion_type=pkg_item.inclusion_type,
                description=pkg_item.description,
                quantity=pkg_item.quantity,
                is_optional=pkg_item.is_optional,
                is_selected=is_selected,
                reference_module=pkg_item.reference_module,
                reference_id=pkg_item.reference_id,
                reference_label=pkg_item.reference_label,
                notes=pkg_item.notes,
                billing_source="PACKAGE",
            )
        )

    record_package_booking_history(
        db,
        booking_id=booking.id,
        action="CREATED",
        previous_status=None,
        new_status=PackageBookingStatus.PENDING.value,
        changed_by=current_user.id,
        reason=f"Booked {pkg.name} ({pkg.package_code}) for {data.guest_count} guests starting {data.start_date.isoformat()}",
    )

    if data.generate_invoice:
        create_package_invoice_for_booking(
            db,
            booking=booking,
            gst_rate=data.gst_rate,
            changed_by=current_user.id,
        )

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Booking could not be saved due to a reference conflict.") from exc

    created = (
        db.query(PackageBooking)
        .options(
            joinedload(PackageBooking.customer),
            joinedload(PackageBooking.invoice).selectinload(Invoice.payments),
            selectinload(PackageBooking.items),
            selectinload(PackageBooking.history).joinedload(PackageBookingHistory.changed_by_user),
        )
        .filter(PackageBooking.id == booking.id)
        .first()
    )
    return _serialize_booking(created, include_details=True)


@router.get("/bookings/{booking_id}")
def get_booking_detail(booking_id: int, db: Session = Depends(get_db)):
    booking = (
        db.query(PackageBooking)
        .options(
            joinedload(PackageBooking.customer),
            joinedload(PackageBooking.invoice).selectinload(Invoice.payments),
            selectinload(PackageBooking.items),
            selectinload(PackageBooking.history).joinedload(PackageBookingHistory.changed_by_user),
        )
        .filter(PackageBooking.id == booking_id, PackageBooking.is_deleted.is_(False))
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Package booking not found.")
    return _serialize_booking(booking, include_details=True)


@router.patch("/bookings/{booking_id}/status")
def update_booking_status(
    booking_id: int,
    data: PackageBookingStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = (
        db.query(PackageBooking)
        .filter(PackageBooking.id == booking_id, PackageBooking.is_deleted.is_(False))
        .with_for_update()
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Package booking not found.")

    prev_status = booking.status
    target_status = data.status
    allowed = ALLOWED_PACKAGE_BOOKING_TRANSITIONS.get(prev_status, set())
    if target_status not in allowed:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot transition booking from '{prev_status}' to '{target_status}'.",
        )

    booking.status = target_status
    if target_status == PackageBookingStatus.CANCELLED.value:
        booking.cancellation_reason = data.reason.strip() if data.reason else None
        booking.cancelled_at = get_kolkata_now()
        if booking.invoice and money(booking.invoice.paid_amount) == Decimal("0.00"):
            booking.invoice.balance_due = Decimal("0.00")
            booking.invoice.notes = f"Cancelled: {booking.cancellation_reason}"

    record_package_booking_history(
        db,
        booking_id=booking.id,
        action="CANCELLED" if target_status == PackageBookingStatus.CANCELLED.value else "STATUS_CHANGE",
        previous_status=prev_status,
        new_status=target_status,
        changed_by=current_user.id,
        reason=data.reason,
    )
    db.commit()
    return get_booking_detail(booking.id, db)


@router.get("/bookings/{booking_id}/history")
def get_booking_history(booking_id: int, db: Session = Depends(get_db)):
    booking = db.get(PackageBooking, booking_id)
    if not booking or booking.is_deleted:
        raise HTTPException(status_code=404, detail="Package booking not found.")
    return [
        {
            "id": h.id,
            "action": h.action,
            "previous_status": h.previous_status,
            "new_status": h.new_status,
            "reason": h.reason,
            "changed_by": h.changed_by,
            "changed_by_name": h.changed_by_user.full_name if h.changed_by_user else None,
            "changed_at": h.changed_at,
        }
        for h in booking.history
    ]


# ==========================================
# 8. CUSTOMERS (REUSES EXISTING CUSTOMER MASTER)
# ==========================================

@router.get("/customers")
def list_packages_customers(
    search: str = "",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    q = db.query(Customer)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        q = q.filter(
            or_(
                Customer.full_name.ilike(pattern),
                Customer.phone.ilike(pattern),
                Customer.email.ilike(pattern),
                Customer.address.ilike(pattern),
            )
        )
    customers = q.order_by(Customer.id.desc()).all()

    booking_stats_rows = (
        db.query(
            PackageBooking.customer_id,
            func.count(PackageBooking.id),
            func.coalesce(func.sum(PackageBooking.total_amount), Decimal("0.00")),
        )
        .filter(PackageBooking.is_deleted.is_(False))
        .group_by(PackageBooking.customer_id)
        .all()
    )
    stats_map = {cid: (int(cnt), money(tot)) for cid, cnt, tot in booking_stats_rows}

    serialized = [
        {
            "id": c.id,
            "full_name": c.full_name,
            "phone": c.phone,
            "email": c.email,
            "address": c.address,
            "image_url": c.image_url,
            "package_bookings_count": stats_map.get(c.id, (0, Decimal("0.00")))[0],
            "package_total_spend": stats_map.get(c.id, (0, Decimal("0.00")))[1],
            "created_at": c.created_at,
        }
        for c in customers
    ]
    return _paginate(serialized, page, page_size)


@router.post("/customers", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
def create_packages_customer(data: CustomerCreate, db: Session = Depends(get_db)):
    existing = db.query(Customer).filter(Customer.phone == data.phone).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"A customer with mobile number '{data.phone}' already exists ({existing.full_name}).",
        )
    cust = Customer(
        full_name=data.full_name,
        phone=data.phone,
        email=data.email,
        address=data.address,
    )
    try:
        db.add(cust)
        db.commit()
        db.refresh(cust)
        return cust
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Customer record conflicts with existing database information.") from exc


@router.get("/customers/{customer_id}")
def get_packages_customer_detail(customer_id: int, db: Session = Depends(get_db)):
    cust = db.get(Customer, customer_id)
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found.")
    bookings = (
        db.query(PackageBooking)
        .options(joinedload(PackageBooking.invoice))
        .filter(PackageBooking.customer_id == cust.id, PackageBooking.is_deleted.is_(False))
        .order_by(PackageBooking.created_at.desc())
        .all()
    )
    return {
        "id": cust.id,
        "full_name": cust.full_name,
        "phone": cust.phone,
        "email": cust.email,
        "address": cust.address,
        "image_url": cust.image_url,
        "created_at": cust.created_at,
        "bookings": [_serialize_booking(b) for b in bookings],
    }


@router.patch("/customers/{customer_id}", response_model=CustomerResponse)
def update_packages_customer(
    customer_id: int,
    data: CustomerUpdate,
    db: Session = Depends(get_db),
):
    cust = db.get(Customer, customer_id)
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found.")
    updates = data.model_dump(exclude_unset=True)
    for field, val in updates.items():
        setattr(cust, field, val)
    try:
        db.commit()
        db.refresh(cust)
        return cust
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Customer update conflicts with existing database information.") from exc


@router.delete("/customers/{customer_id}")
def delete_packages_customer(customer_id: int, db: Session = Depends(get_db)):
    cust = db.get(Customer, customer_id)
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found.")

    has_pkg_booking = (
        db.query(PackageBooking.id)
        .filter(PackageBooking.customer_id == customer_id, PackageBooking.is_deleted.is_(False))
        .first()
    )
    has_invoice = (
        db.query(Invoice.id)
        .filter(Invoice.customer_id == customer_id)
        .first()
    )
    has_order = (
        db.query(Order.id)
        .filter(Order.customer_id == customer_id)
        .first()
    )
    if has_pkg_booking or has_invoice or has_order:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete customer '{cust.full_name}' because booking, order, or invoice records exist.",
        )

    name = cust.full_name
    try:
        db.delete(cust)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete customer '{name}' because related records exist.",
        ) from exc
    return {"message": f"Customer '{name}' deleted successfully."}


# ==========================================
# 9. INVOICES & PAYMENTS (REUSES MASTER TABLES)
# ==========================================

@router.get("/invoices")
def list_package_invoices(
    search: str = "",
    payment_status: str = "",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    q = (
        db.query(Invoice)
        .options(
            joinedload(Invoice.customer),
            selectinload(Invoice.payments).joinedload(Payment.receiver),
        )
        .outerjoin(Customer, Invoice.customer_id == Customer.id)
        .filter(Invoice.source_module == "PACKAGE")
    )
    if payment_status and payment_status.strip():
        q = q.filter(func.lower(Invoice.payment_status) == payment_status.strip().lower())
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        q = q.filter(
            or_(
                Invoice.invoice_number.ilike(pattern),
                Invoice.source_reference_number.ilike(pattern),
                Customer.full_name.ilike(pattern),
                Customer.phone.ilike(pattern),
            )
        )

    invoices = q.order_by(Invoice.id.desc()).all()
    booking_ids = [inv.package_booking_id for inv in invoices if inv.package_booking_id]
    bookings_map = (
        {
            b.id: b
            for b in db.query(PackageBooking)
            .options(joinedload(PackageBooking.customer))
            .filter(PackageBooking.id.in_(booking_ids))
            .all()
        }
        if booking_ids
        else {}
    )
    serialized = [_serialize_invoice(inv, bookings_map.get(inv.package_booking_id)) for inv in invoices]
    return _paginate(serialized, page, page_size)


@router.post("/invoices", status_code=status.HTTP_201_CREATED)
def create_package_invoice(
    data: PackageInvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = (
        db.query(PackageBooking)
        .options(joinedload(PackageBooking.customer))
        .filter(PackageBooking.id == data.booking_id, PackageBooking.is_deleted.is_(False))
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Package booking not found.")

    inv = create_package_invoice_for_booking(
        db,
        booking=booking,
        gst_rate=data.gst_rate,
        notes=data.notes,
        changed_by=current_user.id,
    )
    db.commit()
    db.refresh(inv)
    return _serialize_invoice(inv, booking)


@router.delete("/invoices/{invoice_id}")
def delete_package_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inv = (
        db.query(Invoice)
        .filter(Invoice.id == invoice_id, Invoice.source_module == "PACKAGE")
        .with_for_update()
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Package invoice not found.")

    payment_count = db.query(Payment.id).filter(Payment.invoice_id == inv.id).count()
    if payment_count > 0 or inv.payment_status != PaymentStatus.PENDING or money(inv.paid_amount) > Decimal("0.00"):
        raise HTTPException(
            status_code=409,
            detail="Invoices with recorded payments or completed settlements cannot be deleted.",
        )

    invoice_number = inv.invoice_number
    if inv.package_booking_id:
        booking = db.get(PackageBooking, inv.package_booking_id)
        if booking:
            record_package_booking_history(
                db,
                booking_id=booking.id,
                action="INVOICE_DELETED",
                previous_status=booking.status,
                new_status=booking.status,
                changed_by=current_user.id,
                reason=f"Unpaid invoice {invoice_number} deleted",
            )

    db.delete(inv)
    db.commit()
    return {"message": f"Invoice {invoice_number} deleted successfully."}


@router.get("/invoices/{invoice_id}")
def get_package_invoice(invoice_id: int, db: Session = Depends(get_db)):
    inv = (
        db.query(Invoice)
        .options(
            joinedload(Invoice.customer),
            selectinload(Invoice.payments).joinedload(Payment.receiver),
        )
        .filter(Invoice.id == invoice_id, Invoice.source_module == "PACKAGE")
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Package invoice not found.")
    booking = (
        db.query(PackageBooking)
        .options(joinedload(PackageBooking.customer), selectinload(PackageBooking.items))
        .filter(PackageBooking.id == inv.package_booking_id)
        .first()
        if inv.package_booking_id
        else None
    )
    res = _serialize_invoice(inv, booking)
    if booking:
        res["booking_items"] = [
            {
                "id": it.id,
                "inclusion_type": it.inclusion_type,
                "description": it.description,
                "quantity": it.quantity,
                "is_optional": it.is_optional,
                "is_selected": it.is_selected,
                "billing_source": it.billing_source,
            }
            for it in booking.items
            if it.is_selected
        ]
    return res


@router.get("/invoices/{invoice_id}/payments")
def get_package_invoice_payments(invoice_id: int, db: Session = Depends(get_db)):
    inv = (
        db.query(Invoice)
        .options(selectinload(Invoice.payments).joinedload(Payment.receiver))
        .filter(Invoice.id == invoice_id, Invoice.source_module == "PACKAGE")
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Package invoice not found.")
    sync_package_invoice_financials(db, inv)
    db.commit()
    return {
        "invoice_id": inv.id,
        "invoice_number": inv.invoice_number,
        "total_amount": money(inv.total_amount),
        "paid_amount": money(inv.paid_amount),
        "balance_due": money(inv.balance_due),
        "payment_status": getattr(inv.payment_status, "value", str(inv.payment_status)),
        "payments": [_serialize_payment(p) for p in inv.payments if p.source_module == "PACKAGE"],
    }


@router.post("/invoices/{invoice_id}/payments", status_code=status.HTTP_201_CREATED)
def collect_package_payment(
    invoice_id: int,
    data: PackagePaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inv, payment = record_package_payment(
        db,
        invoice_id=invoice_id,
        amount=data.amount,
        payment_method=data.payment_method,
        payment_type=data.payment_type,
        reference_number=data.reference_number,
        received_by_user_id=current_user.id,
    )
    booking = db.get(PackageBooking, inv.package_booking_id) if inv.package_booking_id else None
    return {
        "invoice": _serialize_invoice(inv, booking),
        "payment": _serialize_payment(payment),
    }


@router.get("/invoices/{invoice_id}/pdf")
def download_package_invoice_pdf(invoice_id: int, db: Session = Depends(get_db)):
    inv = (
        db.query(Invoice)
        .options(
            joinedload(Invoice.customer),
            selectinload(Invoice.payments),
        )
        .filter(Invoice.id == invoice_id, Invoice.source_module == "PACKAGE")
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Package invoice not found.")
    pdf_path = generate_package_invoice_pdf(db, inv)
    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=f"{inv.invoice_number}.pdf",
    )


# ==========================================
# 10. REPORTS & EXPORT
# ==========================================

@router.get("/reports")
def packages_reports(
    start_date: date | None = None,
    end_date: date | None = None,
    package_id: int | None = None,
    category: str = "",
    status_filter: str = Query(default="", alias="status"),
    search: str = "",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=15, ge=1, le=100),
    db: Session = Depends(get_db),
):
    sync_expired_packages(db)
    today = get_kolkata_today()
    period_start = start_date or (today - timedelta(days=30))
    period_end = end_date or (today + timedelta(days=30))
    if period_end < period_start:
        raise HTTPException(status_code=422, detail="End date cannot precede start date.")

    all_packages = db.query(Package).filter(Package.is_deleted.is_(False)).all()
    q = (
        db.query(PackageBooking)
        .options(
            joinedload(PackageBooking.customer),
            joinedload(PackageBooking.invoice).selectinload(Invoice.payments),
        )
        .outerjoin(Customer, PackageBooking.customer_id == Customer.id)
        .filter(PackageBooking.is_deleted.is_(False))
    )
    if start_date or end_date:
        q = q.filter(PackageBooking.booking_date >= period_start, PackageBooking.booking_date <= period_end)
    if package_id is not None:
        q = q.filter(PackageBooking.package_id == package_id)
    if category and category.strip():
        q = q.filter(PackageBooking.package_category_snapshot == category.strip())
    if status_filter and status_filter.strip():
        q = q.filter(PackageBooking.status == status_filter.strip())
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        q = q.filter(
            or_(
                PackageBooking.booking_number.ilike(pattern),
                PackageBooking.package_name_snapshot.ilike(pattern),
                PackageBooking.package_code_snapshot.ilike(pattern),
                Customer.full_name.ilike(pattern),
            )
        )

    bookings = q.order_by(PackageBooking.booking_date.desc(), PackageBooking.id.desc()).all()

    total_booked_value = Decimal("0.00")
    total_invoiced = Decimal("0.00")
    total_tax = Decimal("0.00")
    total_collected = Decimal("0.00")
    total_outstanding = Decimal("0.00")
    cancelled_count = 0

    category_map: dict[str, dict] = {}
    popular_map: dict[int, dict] = {}
    payment_method_map: dict[str, Decimal] = {"Cash": Decimal("0.00"), "UPI": Decimal("0.00"), "Card": Decimal("0.00"), "Net Banking": Decimal("0.00")}
    cancellation_rows: list[dict] = []
    outstanding_rows: list[dict] = []

    for b in bookings:
        is_cancelled = b.status == PackageBookingStatus.CANCELLED.value
        if is_cancelled:
            cancelled_count += 1
            cancellation_rows.append(
                {
                    "booking_id": b.id,
                    "booking_number": b.booking_number,
                    "package_name": b.package_name_snapshot,
                    "package_code": b.package_code_snapshot,
                    "category": b.package_category_snapshot,
                    "customer_name": b.customer.full_name if b.customer else "Customer",
                    "start_date": b.start_date,
                    "total_amount": money(b.total_amount),
                    "cancellation_reason": b.cancellation_reason or "—",
                    "cancelled_at": b.cancelled_at,
                }
            )
        else:
            total_booked_value = money(total_booked_value + money(b.total_amount))

            cat = b.package_category_snapshot
            if cat not in category_map:
                category_map[cat] = {"category": cat, "bookings": 0, "guests": 0, "sales_amount": Decimal("0.00")}
            category_map[cat]["bookings"] += 1
            category_map[cat]["guests"] += b.guest_count
            category_map[cat]["sales_amount"] = money(category_map[cat]["sales_amount"] + money(b.total_amount))

            if b.package_id not in popular_map:
                popular_map[b.package_id] = {
                    "package_id": b.package_id,
                    "package_code": b.package_code_snapshot,
                    "package_name": b.package_name_snapshot,
                    "category": b.package_category_snapshot,
                    "bookings": 0,
                    "guests": 0,
                    "sales_amount": Decimal("0.00"),
                }
            popular_map[b.package_id]["bookings"] += 1
            popular_map[b.package_id]["guests"] += b.guest_count
            popular_map[b.package_id]["sales_amount"] = money(
                popular_map[b.package_id]["sales_amount"] + money(b.total_amount)
            )

        inv = b.invoice
        if inv and inv.source_module == "PACKAGE":
            if not is_cancelled:
                total_invoiced = money(total_invoiced + money(inv.total_amount))
                total_tax = money(total_tax + money(inv.gst_amount))
                total_outstanding = money(total_outstanding + money(inv.balance_due))
                if money(inv.balance_due) > Decimal("0.00"):
                    outstanding_rows.append(
                        {
                            "invoice_id": inv.id,
                            "invoice_number": inv.invoice_number,
                            "booking_number": b.booking_number,
                            "package_name": b.package_name_snapshot,
                            "customer_name": b.customer.full_name if b.customer else "Customer",
                            "customer_phone": b.customer.phone if b.customer else None,
                            "total_amount": money(inv.total_amount),
                            "paid_amount": money(inv.paid_amount),
                            "balance_due": money(inv.balance_due),
                            "payment_status": getattr(inv.payment_status, "value", str(inv.payment_status)),
                        }
                    )
            for p in inv.payments:
                if p.source_module == "PACKAGE" and p.status == PaymentStatus.PAID:
                    amt = money(p.amount)
                    total_collected = money(total_collected + amt)
                    m = getattr(p.payment_method, "value", str(p.payment_method))
                    payment_method_map[m] = money(payment_method_map.get(m, Decimal("0.00")) + amt)

    pkg_status_counts = {s.value: 0 for s in PackageStatus}
    for p in all_packages:
        pkg_status_counts[p.status] = pkg_status_counts.get(p.status, 0) + 1

    serialized_bookings = [_serialize_booking(b) for b in bookings]
    paginated_bookings = _paginate(serialized_bookings, page, page_size)

    return {
        "period": {"start_date": period_start, "end_date": period_end},
        "sales_summary": {
            "total_bookings": len(bookings),
            "active_bookings": len(bookings) - cancelled_count,
            "cancelled_bookings": cancelled_count,
            "total_booked_value": total_booked_value,
            "total_invoiced": total_invoiced,
            "total_tax": total_tax,
            "revenue_collected": total_collected,
            "outstanding_balance": total_outstanding,
        },
        "booking_report": paginated_bookings,
        "category_sales": sorted(category_map.values(), key=lambda x: (-x["sales_amount"], x["category"])),
        "revenue_report": {
            "total_booked_value": total_booked_value,
            "total_invoiced": total_invoiced,
            "total_gst": total_tax,
            "net_collected": total_collected,
            "outstanding_balance": total_outstanding,
            "by_payment_method": [
                {"method": k, "amount": money(v)} for k, v in payment_method_map.items()
            ],
        },
        "popular_packages": sorted(popular_map.values(), key=lambda x: (-x["bookings"], -x["sales_amount"])),
        "package_status_report": {
            "counts": pkg_status_counts,
            "packages": [_serialize_package(p) for p in all_packages],
        },
        "cancellation_report": cancellation_rows,
        "outstanding_payments_report": outstanding_rows,
    }


@router.get("/reports/export")
def export_packages_report_csv(
    start_date: date | None = None,
    end_date: date | None = None,
    package_id: int | None = None,
    category: str = "",
    status_filter: str = Query(default="", alias="status"),
    search: str = "",
    db: Session = Depends(get_db),
):
    report = packages_reports(
        start_date=start_date,
        end_date=end_date,
        package_id=package_id,
        category=category,
        status_filter=status_filter,
        search=search,
        page=1,
        page_size=100,
        db=db,
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "Booking Number",
            "Package Code",
            "Package Name",
            "Category",
            "Customer",
            "Phone",
            "Booking Date",
            "Start Date",
            "End Date",
            "Guests",
            "Pricing Type",
            "Total Amount",
            "Status",
            "Invoice Number",
            "Paid",
            "Balance Due",
        ]
    )
    for row in report["booking_report"]["items"]:
        writer.writerow(
            [
                row["booking_number"],
                row["package_code"],
                row["package_name"],
                row["package_category"],
                row["customer_name"],
                row["customer_phone"] or "",
                row["booking_date"],
                row["start_date"],
                row["end_date"],
                row["guest_count"],
                row["pricing_type"],
                row["total_amount"],
                row["status"],
                row["invoice_number"] or "",
                row["invoice_paid"],
                row["invoice_balance_due"],
            ]
        )
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=packages-report.csv"},
    )
