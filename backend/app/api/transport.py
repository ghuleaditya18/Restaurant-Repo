"""Transport Management Module – FastAPI Router."""
from __future__ import annotations

import csv
import datetime
import io
import json
import math
from decimal import Decimal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import require_transport_context, require_transport_context_image
from app.core.date_utils import get_kolkata_now, get_kolkata_today
from app.db.session import get_db
from app.models.activities import ActivityBooking
from app.models.entities import Customer, Invoice, Payment, PaymentStatus, Staff, User
from app.models.packages import PackageBooking
from app.models.transport import (
    MaintenanceStatus,
    TransportAssignment,
    TransportBooking,
    TransportBookingPassenger,
    TransportBookingStatus,
    TransportDriver,
    TransportFuelRecord,
    TransportMaintenanceRecord,
    TransportRoute,
    TransportSchedule,
    TransportServiceType,
    TransportVehicle,
    TransportVehicleCategory,
    VehicleStatus,
)
from app.models.villas import StayBooking, Unit, VillaGuest
from app.schemas.customer import CustomerCreate, CustomerUpdate
from app.schemas.transport import (
    AssignmentRequest,
    DriverCreate,
    DriverUpdate,
    FuelExpenseCreate,
    FuelExpenseUpdate,
    MaintenanceCreate,
    MaintenanceUpdate,
    RouteCreate,
    RouteUpdate,
    ServiceTypeCreate,
    ServiceTypeUpdate,
    TransportBookingCreate,
    TransportBookingUpdate,
    TransportInvoiceCreate,
    TransportPaymentCreate,
    TripStatusUpdate,
    VehicleCategoryCreate,
    VehicleCategoryUpdate,
    VehicleCreate,
    VehicleStatusUpdate,
    VehicleUpdate,
)
from app.services.entity_image_service import (
    build_image_response,
    delete_entity_image,
    get_entity_image,
    save_or_replace_entity_image,
    validate_image_file,
)
from app.services.transport_service import (
    ACTIVE_TRIP_STATUSES,
    ALLOWED_TRIP_TRANSITIONS,
    PAYMENT_METHOD_ENUM_MAP,
    add_minutes_to_time,
    calculate_transport_price,
    ensure_default_vehicle_categories,
    generate_transport_booking_number,
    generate_transport_invoice_pdf,
    generate_unique_route_code,
    has_overlapping_assignment,
    money,
    parse_hhmm,
    record_booking_history,
    resolve_customer_for_stay,
    sync_transport_invoice_financials,
    sync_vehicle_and_driver_operational_status,
    validate_not_past_pickup,
    validate_vehicle_and_driver_for_assignment,
)

router = APIRouter(
    tags=["Transport Management"],
    dependencies=[Depends(require_transport_context)],
)

# Image GET endpoints use require_transport_context_image (same context check; explicitly separated for clarity)
BUSINESS_CONTEXT = "TRANSPORT"


def _serialize_time(t: datetime.time | None) -> str | None:
    return t.strftime("%H:%M") if t else None


def _parse_category_ids(raw: str | None) -> list[int]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [int(x) for x in parsed]
    except Exception:
        pass
    return [int(x.strip()) for x in str(raw).split(",") if x.strip().isdigit()]


def _serialize_vehicle(v: TransportVehicle) -> dict:
    today = get_kolkata_today()
    warn_cutoff = today + datetime.timedelta(days=30)
    alerts = []
    if v.insurance_expiry and v.insurance_expiry <= warn_cutoff:
        alerts.append("Insurance Expiring" if v.insurance_expiry >= today else "Insurance Expired")
    if v.registration_validity and v.registration_validity <= warn_cutoff:
        alerts.append("RC Expiring" if v.registration_validity >= today else "RC Expired")
    if v.permit_validity and v.permit_validity <= warn_cutoff:
        alerts.append("Permit Expiring" if v.permit_validity >= today else "Permit Expired")
    if v.next_service_date and v.next_service_date <= today + datetime.timedelta(days=7):
        alerts.append("Service Overdue" if v.next_service_date < today else "Service Due Soon")

    return {
        "id": v.id,
        "vehicle_name": v.vehicle_name,
        "registration_number": v.registration_number,
        "category_id": v.category_id,
        "category_name": v.category.name if v.category else None,
        "vehicle_type": v.vehicle_type,
        "make": v.make,
        "model": v.model,
        "year": v.year,
        "seating_capacity": v.seating_capacity,
        "fuel_type": v.fuel_type,
        "transmission_type": v.transmission_type,
        "image_url": v.image_url,
        "status": v.status,
        "is_active": v.is_active,
        "insurance_provider": v.insurance_provider,
        "insurance_policy_number": v.insurance_policy_number,
        "insurance_expiry": v.insurance_expiry,
        "registration_validity": v.registration_validity,
        "permit_validity": v.permit_validity,
        "last_service_date": v.last_service_date,
        "next_service_date": v.next_service_date,
        "odometer_km": v.odometer_km,
        "notes": v.notes,
        "alerts": alerts,
        "created_at": v.created_at,
        "updated_at": v.updated_at,
    }


def _serialize_driver(d: TransportDriver) -> dict:
    today = get_kolkata_today()
    warn_cutoff = today + datetime.timedelta(days=30)
    licence_alert = None
    if d.licence_validity < today:
        licence_alert = "Licence Expired"
    elif d.licence_validity <= warn_cutoff:
        licence_alert = "Licence Expiring Soon"

    return {
        "id": d.id,
        "staff_id": d.staff_id,
        "driver_name": d.driver_name,
        "profile_image_url": d.profile_image_url,
        "phone": d.phone,
        "email": d.email,
        "licence_number": d.licence_number,
        "licence_validity": d.licence_validity,
        "licence_alert": licence_alert,
        "experience_years": d.experience_years,
        "address": d.address,
        "assigned_vehicle_id": d.assigned_vehicle_id,
        "assigned_vehicle_name": d.assigned_vehicle.vehicle_name if d.assigned_vehicle else None,
        "assigned_vehicle_reg": d.assigned_vehicle.registration_number if d.assigned_vehicle else None,
        "availability_status": d.availability_status,
        "employment_status": d.employment_status,
        "is_active": d.is_active,
        "notes": d.notes,
        "created_at": d.created_at,
        "updated_at": d.updated_at,
    }


def _serialize_route(r: TransportRoute) -> dict:
    return {
        "id": r.id,
        "route_name": r.route_name,
        "route_code": r.route_code,
        "starting_location": r.starting_location,
        "destination": r.destination,
        "intermediate_stops": r.intermediate_stops,
        "approximate_distance_km": str(money(r.approximate_distance_km)),
        "estimated_duration_minutes": r.estimated_duration_minutes,
        "route_type": r.route_type,
        "standard_price": str(money(r.standard_price)),
        "description": r.description,
        "is_active": r.is_active,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
    }


def _serialize_service(s: TransportServiceType) -> dict:
    return {
        "id": s.id,
        "service_name": s.service_name,
        "service_code": s.service_code,
        "description": s.description,
        "pricing_model": s.pricing_model,
        "base_price": str(money(s.base_price)),
        "price_per_km": str(money(s.price_per_km)) if s.price_per_km is not None else None,
        "price_per_hour": str(money(s.price_per_hour)) if s.price_per_hour is not None else None,
        "applicable_category_ids": _parse_category_ids(s.applicable_category_ids),
        "is_available": s.is_available,
        "is_active": s.is_active,
        "created_at": s.created_at,
        "updated_at": s.updated_at,
    }


def _serialize_booking(b: TransportBooking, db: Session, *, include_details: bool = False) -> dict:
    inv = db.scalar(
        select(Invoice).where(
            Invoice.source_module == BUSINESS_CONTEXT,
            Invoice.source_reference_id == b.id,
        )
    )
    pay_status = getattr(inv.payment_status, "value", str(inv.payment_status)) if inv else None
    active_assignment = b.assignments[0] if b.assignments else None

    stay_guest = b.stay_booking.guest if b.stay_booking else None
    payload = {
        "id": b.id,
        "booking_number": b.booking_number,
        "booking_type": b.booking_type,
        "customer_id": b.customer_id,
        "customer_name": b.customer.full_name if b.customer else (stay_guest.full_name if stay_guest else ""),
        "customer_phone": b.customer.phone if b.customer else (stay_guest.phone if stay_guest else ""),
        "customer_email": b.customer.email if b.customer else (stay_guest.email if stay_guest else None),
        "stay_booking_id": b.stay_booking_id,
        "stay_booking_number": b.stay_booking.booking_number if b.stay_booking else None,
        "stay_guest_name": stay_guest.full_name if stay_guest else None,
        "stay_guest_reference": stay_guest.guest_reference if stay_guest else None,
        "stay_guest_phone": stay_guest.phone if stay_guest else None,
        "package_booking_id": b.package_booking_id,
        "package_booking_number": b.package_booking.booking_number if b.package_booking else None,
        "package_name": b.package_booking.package_name_snapshot if b.package_booking else None,
        "activity_booking_id": b.activity_booking_id,
        "activity_booking_number": b.activity_booking.booking_number if b.activity_booking else None,
        "activity_name": b.activity_booking.activity_name_snapshot if b.activity_booking else None,
        "service_type_id": b.service_type_id,
        "service_name": b.service_type.service_name if b.service_type else None,
        "route_id": b.route_id,
        "route_name": b.route.route_name if b.route else None,
        "pickup_location": b.pickup_location,
        "drop_location": b.drop_location,
        "pickup_date": b.pickup_date,
        "pickup_time": _serialize_time(b.pickup_time),
        "estimated_end_time": _serialize_time(b.estimated_end_time),
        "estimated_distance_km": str(money(b.estimated_distance_km)),
        "estimated_duration_minutes": b.estimated_duration_minutes,
        "passenger_count": b.passenger_count,
        "vehicle_id": b.vehicle_id,
        "vehicle_name": b.vehicle.vehicle_name if b.vehicle else None,
        "vehicle_reg": b.vehicle.registration_number if b.vehicle else None,
        "driver_id": b.driver_id,
        "driver_name": b.driver.driver_name if b.driver else None,
        "driver_phone": b.driver.phone if b.driver else None,
        "base_price": str(money(b.base_price)),
        "additional_charges": str(money(b.additional_charges)),
        "discount_amount": str(money(b.discount_amount)),
        "total_amount": str(money(b.total_amount)),
        "status": b.status,
        "cancellation_reason": b.cancellation_reason,
        "cancelled_at": b.cancelled_at,
        "notes": b.notes,
        "invoice_id": inv.id if inv else None,
        "invoice_number": inv.invoice_number if inv else None,
        "payment_status": pay_status,
        "invoice_paid": str(money(inv.paid_amount)) if inv else "0.00",
        "invoice_balance_due": str(money(inv.balance_due)) if inv else str(money(b.total_amount)),
        "actual_departure_at": active_assignment.actual_departure_at if active_assignment else None,
        "actual_arrival_at": active_assignment.actual_arrival_at if active_assignment else None,
        "start_odometer_km": active_assignment.start_odometer_km if active_assignment else None,
        "end_odometer_km": active_assignment.end_odometer_km if active_assignment else None,
        "trip_remarks": active_assignment.remarks if active_assignment else None,
        "created_at": b.created_at,
        "updated_at": b.updated_at,
    }
    if include_details:
        payload["passengers"] = [
            {
                "id": p.id,
                "passenger_name": p.passenger_name,
                "phone": p.phone,
                "age": p.age,
                "is_primary": p.is_primary,
                "notes": p.notes,
            }
            for p in b.passengers
        ]
        payload["history"] = [
            {
                "id": h.id,
                "action": h.action,
                "previous_status": h.previous_status,
                "new_status": h.new_status,
                "reason": h.reason,
                "changed_by_name": h.changed_by_user.full_name if h.changed_by_user else None,
                "changed_at": h.changed_at,
            }
            for h in b.history
        ]
    return payload


def _serialize_invoice(inv: Invoice, db: Session) -> dict:
    customer = db.get(Customer, inv.customer_id) if inv.customer_id else None
    booking = db.get(TransportBooking, inv.source_reference_id) if inv.source_reference_id else None
    payments = (
        db.query(Payment)
        .filter(Payment.invoice_id == inv.id, Payment.source_module == BUSINESS_CONTEXT)
        .order_by(Payment.created_at.asc())
        .all()
    )
    pay_status = getattr(inv.payment_status, "value", str(inv.payment_status))
    return {
        "id": inv.id,
        "invoice_number": inv.invoice_number,
        "source_module": inv.source_module,
        "source_reference_id": inv.source_reference_id,
        "source_reference_number": inv.source_reference_number,
        "booking_number": booking.booking_number if booking else inv.source_reference_number,
        "booking_type": booking.booking_type if booking else None,
        "booking_status": booking.status if booking else None,
        "pickup_location": booking.pickup_location if booking else None,
        "drop_location": booking.drop_location if booking else None,
        "pickup_date": booking.pickup_date if booking else None,
        "customer_id": inv.customer_id,
        "customer_name": customer.full_name if customer else "Guest",
        "customer_phone": customer.phone if customer else None,
        "customer_email": customer.email if customer else None,
        "base_price": str(money(booking.base_price)) if booking else str(money(inv.subtotal)),
        "additional_charges": str(money(booking.additional_charges)) if booking else "0.00",
        "discount_amount": str(money(booking.discount_amount)) if booking else "0.00",
        "subtotal": str(money(inv.subtotal)),
        "gst_rate": str(money(inv.gst_rate)),
        "gst_amount": str(money(inv.gst_amount)),
        "total_amount": str(money(inv.total_amount)),
        "paid_amount": str(money(inv.paid_amount)),
        "balance_due": str(money(inv.balance_due)),
        "payment_status": pay_status,
        "notes": inv.notes,
        "pdf_path": inv.pdf_path,
        "created_at": inv.created_at,
        "payments": [
            {
                "id": p.id,
                "amount": str(money(p.amount)),
                "payment_method": getattr(p.payment_method, "value", str(p.payment_method)),
                "payment_type": p.payment_type,
                "reference_number": p.reference_number,
                "status": getattr(p.status, "value", str(p.status)),
                "paid_at": p.paid_at,
            }
            for p in payments
        ],
    }


# ==========================================
# 1. DASHBOARD
# ==========================================

@router.get("/dashboard")
def get_dashboard(db: Session = Depends(get_db)):
    ensure_default_vehicle_categories(db)
    today = get_kolkata_today()
    warn_cutoff = today + datetime.timedelta(days=30)

    vehicles = db.query(TransportVehicle).filter(TransportVehicle.is_deleted.is_(False)).all()
    total_vehicles = len(vehicles)
    available_vehicles = sum(1 for v in vehicles if v.is_active and v.status == VehicleStatus.AVAILABLE.value)
    on_trip_vehicles = sum(1 for v in vehicles if v.is_active and v.status == VehicleStatus.ON_TRIP.value)
    maintenance_vehicles = sum(1 for v in vehicles if v.status == VehicleStatus.MAINTENANCE.value)

    active_drivers = (
        db.query(func.count(TransportDriver.id))
        .filter(
            TransportDriver.is_deleted.is_(False),
            TransportDriver.is_active.is_(True),
            TransportDriver.employment_status == "Active",
        )
        .scalar()
        or 0
    )

    todays_trips = (
        db.query(func.count(TransportBooking.id))
        .filter(
            TransportBooking.is_deleted.is_(False),
            TransportBooking.pickup_date == today,
            TransportBooking.status != TransportBookingStatus.CANCELLED.value,
        )
        .scalar()
        or 0
    )
    upcoming_pickups_count = (
        db.query(func.count(TransportBooking.id))
        .filter(
            TransportBooking.is_deleted.is_(False),
            TransportBooking.pickup_date >= today,
            TransportBooking.status.in_(
                [
                    TransportBookingStatus.PENDING.value,
                    TransportBookingStatus.CONFIRMED.value,
                    TransportBookingStatus.ASSIGNED.value,
                ]
            ),
        )
        .scalar()
        or 0
    )
    pending_requests = (
        db.query(func.count(TransportBooking.id))
        .filter(
            TransportBooking.is_deleted.is_(False),
            TransportBooking.status == TransportBookingStatus.PENDING.value,
        )
        .scalar()
        or 0
    )
    completed_trips = (
        db.query(func.count(TransportBooking.id))
        .filter(
            TransportBooking.is_deleted.is_(False),
            TransportBooking.status == TransportBookingStatus.COMPLETED.value,
        )
        .scalar()
        or 0
    )
    cancelled_trips = (
        db.query(func.count(TransportBooking.id))
        .filter(
            TransportBooking.is_deleted.is_(False),
            TransportBooking.status.in_([TransportBookingStatus.CANCELLED.value, TransportBookingStatus.NO_SHOW.value]),
        )
        .scalar()
        or 0
    )

    paid_in = (
        db.query(func.coalesce(func.sum(Payment.amount), Decimal("0.00")))
        .filter(
            Payment.source_module == BUSINESS_CONTEXT,
            Payment.status == PaymentStatus.PAID,
            Payment.payment_type != "Refund",
        )
        .scalar()
        or Decimal("0.00")
    )
    refunds = (
        db.query(func.coalesce(func.sum(Payment.amount), Decimal("0.00")))
        .filter(
            Payment.source_module == BUSINESS_CONTEXT,
            Payment.status == PaymentStatus.PAID,
            Payment.payment_type == "Refund",
        )
        .scalar()
        or Decimal("0.00")
    )
    transport_revenue = max(Decimal("0.00"), money(paid_in) - money(refunds))

    # Maintenance & document alerts
    alerts = []
    for v in vehicles:
        if v.status == VehicleStatus.MAINTENANCE.value:
            alerts.append(
                {
                    "id": f"veh-maint-{v.id}",
                    "severity": "warning",
                    "title": f"{v.vehicle_name} ({v.registration_number}) in Maintenance",
                    "message": "Vehicle is currently unavailable for trip assignments until maintenance completes.",
                    "route": "/transport/maintenance",
                }
            )
        if v.next_service_date and v.next_service_date <= today + datetime.timedelta(days=7):
            alerts.append(
                {
                    "id": f"veh-srv-{v.id}",
                    "severity": "error" if v.next_service_date < today else "warning",
                    "title": f"Service Due: {v.vehicle_name} ({v.registration_number})",
                    "message": f"Next scheduled service date: {v.next_service_date.isoformat()}.",
                    "route": "/transport/maintenance",
                }
            )
        for label, dt in [
            ("Insurance", v.insurance_expiry),
            ("Registration", v.registration_validity),
            ("Permit", v.permit_validity),
        ]:
            if dt and dt <= warn_cutoff:
                alerts.append(
                    {
                        "id": f"veh-{label.lower()}-{v.id}",
                        "severity": "error" if dt < today else "warning",
                        "title": f"{label} {'Expired' if dt < today else 'Expiring'}: {v.registration_number}",
                        "message": f"{v.vehicle_name} {label.lower()} validity date is {dt.isoformat()}.",
                        "route": "/transport/vehicles",
                    }
                )

    expiring_drivers = (
        db.query(TransportDriver)
        .filter(
            TransportDriver.is_deleted.is_(False),
            TransportDriver.is_active.is_(True),
            TransportDriver.licence_validity <= warn_cutoff,
        )
        .all()
    )
    for d in expiring_drivers:
        alerts.append(
            {
                "id": f"drv-lic-{d.id}",
                "severity": "error" if d.licence_validity < today else "warning",
                "title": f"Driver Licence {'Expired' if d.licence_validity < today else 'Expiring'}: {d.driver_name}",
                "message": f"Licence {d.licence_number} validity ends {d.licence_validity.isoformat()}.",
                "route": "/transport/drivers",
            }
        )

    upcoming_rows = (
        db.query(TransportBooking)
        .options(
            joinedload(TransportBooking.customer),
            joinedload(TransportBooking.vehicle),
            joinedload(TransportBooking.driver),
            joinedload(TransportBooking.service_type),
            joinedload(TransportBooking.route),
            selectinload(TransportBooking.assignments),
        )
        .filter(
            TransportBooking.is_deleted.is_(False),
            TransportBooking.pickup_date >= today,
            TransportBooking.status.notin_([TransportBookingStatus.COMPLETED.value, TransportBookingStatus.CANCELLED.value, TransportBookingStatus.NO_SHOW.value]),
        )
        .order_by(TransportBooking.pickup_date.asc(), TransportBooking.pickup_time.asc())
        .limit(10)
        .all()
    )

    return {
        "statistics": {
            "total_vehicles": total_vehicles,
            "available_vehicles": available_vehicles,
            "on_trip_vehicles": on_trip_vehicles,
            "maintenance_vehicles": maintenance_vehicles,
            "active_drivers": active_drivers,
            "todays_scheduled_trips": todays_trips,
            "upcoming_pickups": upcoming_pickups_count,
            "pending_requests": pending_requests,
            "completed_trips": completed_trips,
            "cancelled_trips": cancelled_trips,
            "transport_revenue": str(transport_revenue),
            "maintenance_alerts_count": len(alerts),
        },
        "alerts": alerts[:10],
        "upcoming_pickups": [_serialize_booking(b, db) for b in upcoming_rows],
    }


# ==========================================
# 2. VEHICLE CATEGORIES
# ==========================================

@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    ensure_default_vehicle_categories(db)
    rows = db.query(TransportVehicleCategory).order_by(TransportVehicleCategory.name.asc()).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "default_capacity": c.default_capacity,
            "is_active": c.is_active,
            "vehicle_count": len([v for v in c.vehicles if not v.is_deleted]),
        }
        for c in rows
    ]


@router.post("/categories", status_code=201)
def create_category(data: VehicleCategoryCreate, db: Session = Depends(get_db)):
    cat = TransportVehicleCategory(**data.model_dump())
    db.add(cat)
    try:
        db.commit()
        db.refresh(cat)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Vehicle category with this name already exists.")
    return {"id": cat.id, "name": cat.name, "message": "Category created."}


@router.patch("/categories/{category_id}")
def update_category(category_id: int, data: VehicleCategoryUpdate, db: Session = Depends(get_db)):
    cat = db.get(TransportVehicleCategory, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Vehicle category not found.")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(cat, k, v)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Category name conflicts with an existing category.")
    return {"message": "Category updated."}


@router.delete("/categories/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db)):
    cat = db.get(TransportVehicleCategory, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Vehicle category not found.")
    in_use = (
        db.query(TransportVehicle.id)
        .filter(TransportVehicle.category_id == category_id, TransportVehicle.is_deleted.is_(False))
        .first()
    )
    if in_use:
        raise HTTPException(status_code=409, detail="Cannot delete category that is assigned to existing vehicles.")
    db.delete(cat)
    db.commit()
    return {"message": "Category deleted."}


# ==========================================
# 3. VEHICLES CRUD & IMAGES
# ==========================================

@router.get("/vehicles")
def list_vehicles(
    search: str | None = None,
    category_id: int | None = None,
    status_filter: str | None = Query(None, alias="status"),
    fuel_type: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    ensure_default_vehicle_categories(db)
    q = (
        db.query(TransportVehicle)
        .options(joinedload(TransportVehicle.category))
        .filter(TransportVehicle.is_deleted.is_(False))
    )
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(
            or_(
                TransportVehicle.vehicle_name.ilike(like),
                TransportVehicle.registration_number.ilike(like),
                TransportVehicle.make.ilike(like),
                TransportVehicle.model.ilike(like),
            )
        )
    if category_id:
        q = q.filter(TransportVehicle.category_id == category_id)
    if status_filter:
        q = q.filter(TransportVehicle.status == status_filter)
    if fuel_type:
        q = q.filter(TransportVehicle.fuel_type.ilike(f"%{fuel_type.strip()}%"))

    total = q.count()
    rows = q.order_by(TransportVehicle.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, math.ceil(total / page_size)),
        "items": [_serialize_vehicle(v) for v in rows],
    }


@router.get("/vehicles/{vehicle_id}")
def get_vehicle(vehicle_id: int, db: Session = Depends(get_db)):
    v = (
        db.query(TransportVehicle)
        .options(joinedload(TransportVehicle.category))
        .filter(TransportVehicle.id == vehicle_id, TransportVehicle.is_deleted.is_(False))
        .first()
    )
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found.")
    return _serialize_vehicle(v)


@router.post("/vehicles", status_code=201)
def create_vehicle(
    data: VehicleCreate,
    current_user: User = Depends(require_transport_context),
    db: Session = Depends(get_db),
):
    cat = db.get(TransportVehicleCategory, data.category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Selected vehicle category not found.")

    payload = data.model_dump()
    if not payload.get("vehicle_type"):
        payload["vehicle_type"] = cat.name
    if not payload.get("make"):
        payload["make"] = payload["vehicle_name"]
    if not payload.get("model"):
        payload["model"] = cat.name
    if not payload.get("fuel_type"):
        payload["fuel_type"] = "Standard"
    if payload.get("status") == VehicleStatus.INACTIVE.value:
        payload["is_active"] = False
    elif not payload["is_active"]:
        payload["status"] = VehicleStatus.INACTIVE.value
    vehicle = TransportVehicle(**payload, created_by=current_user.id)
    db.add(vehicle)
    try:
        db.commit()
        db.refresh(vehicle)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A vehicle with this registration number already exists.")
    return _serialize_vehicle(vehicle)


@router.patch("/vehicles/{vehicle_id}")
def update_vehicle(vehicle_id: int, data: VehicleUpdate, db: Session = Depends(get_db)):
    v = (
        db.query(TransportVehicle)
        .filter(TransportVehicle.id == vehicle_id, TransportVehicle.is_deleted.is_(False))
        .first()
    )
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found.")
    updates = data.model_dump(exclude_unset=True)
    if "category_id" in updates:
        cat = db.get(TransportVehicleCategory, updates["category_id"])
        if not cat:
            raise HTTPException(status_code=404, detail="Vehicle category not found.")
        if not updates.get("vehicle_type"):
            updates["vehicle_type"] = cat.name
    for k, val in updates.items():
        if val is not None or k in {"notes", "year", "transmission_type", "insurance_provider", "insurance_policy_number", "insurance_expiry", "registration_validity", "permit_validity", "last_service_date", "next_service_date"}:
            setattr(v, k, val)
    if "status" in updates:
        v.is_active = updates["status"] != VehicleStatus.INACTIVE.value
    elif "is_active" in updates and not updates["is_active"]:
        v.status = VehicleStatus.INACTIVE.value
    elif "is_active" in updates and updates["is_active"] and v.status == VehicleStatus.INACTIVE.value:
        v.status = VehicleStatus.AVAILABLE.value
    try:
        db.commit()
        db.refresh(v)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Registration number conflicts with another vehicle.")
    return _serialize_vehicle(v)


@router.patch("/vehicles/{vehicle_id}/status")
def toggle_vehicle_status(vehicle_id: int, data: VehicleStatusUpdate, db: Session = Depends(get_db)):
    v = (
        db.query(TransportVehicle)
        .filter(TransportVehicle.id == vehicle_id, TransportVehicle.is_deleted.is_(False))
        .first()
    )
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found.")
    if data.is_active is not None:
        if not data.is_active:
            active_trip = (
                db.query(TransportAssignment.id)
                .filter(
                    TransportAssignment.vehicle_id == vehicle_id,
                    TransportAssignment.assignment_status.in_(list(ACTIVE_TRIP_STATUSES)),
                )
                .first()
            )
            if active_trip:
                raise HTTPException(status_code=409, detail="Cannot deactivate a vehicle with active trip assignments.")
        v.is_active = data.is_active
        v.status = VehicleStatus.AVAILABLE.value if data.is_active else VehicleStatus.INACTIVE.value
    if data.status is not None:
        v.status = data.status
        v.is_active = data.status != VehicleStatus.INACTIVE.value
    db.commit()
    db.refresh(v)
    return _serialize_vehicle(v)


@router.delete("/vehicles/{vehicle_id}")
def delete_vehicle(vehicle_id: int, db: Session = Depends(get_db)):
    v = (
        db.query(TransportVehicle)
        .filter(TransportVehicle.id == vehicle_id, TransportVehicle.is_deleted.is_(False))
        .first()
    )
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found.")

    has_assignments = db.query(TransportAssignment.id).filter(TransportAssignment.vehicle_id == vehicle_id).first()
    has_bookings = db.query(TransportBooking.id).filter(TransportBooking.vehicle_id == vehicle_id, TransportBooking.is_deleted.is_(False)).first()
    has_maint = db.query(TransportMaintenanceRecord.id).filter(TransportMaintenanceRecord.vehicle_id == vehicle_id).first()
    has_fuel = db.query(TransportFuelRecord.id).filter(TransportFuelRecord.vehicle_id == vehicle_id).first()
    if has_assignments or has_bookings or has_maint or has_fuel:
        raise HTTPException(
            status_code=409,
            detail="Vehicle cannot be deleted because it has active or historical assignments, bookings, maintenance, or fuel records. Deactivate it instead.",
        )

    delete_entity_image(db, "transport_vehicle", v.id, business_context="transport")
    db.delete(v)
    db.commit()
    return {"message": "Vehicle deleted successfully."}


@router.post("/vehicles/{vehicle_id}/image")
async def upload_vehicle_image(vehicle_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    v = db.query(TransportVehicle).filter(TransportVehicle.id == vehicle_id, TransportVehicle.is_deleted.is_(False)).first()
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found.")
    image_bytes, mime_type, file_size, checksum = await validate_image_file(file)
    img_record = save_or_replace_entity_image(
        db=db,
        entity_type="transport_vehicle",
        business_context="transport",
        entity_id=v.id,
        image_data=image_bytes,
        mime_type=mime_type,
        file_size=file_size,
        checksum=checksum,
    )
    ts = int(img_record.updated_at.timestamp())
    v.image_url = f"/api/transport/vehicles/{v.id}/image?v={ts}"
    db.commit()
    db.refresh(v)
    return _serialize_vehicle(v)


@router.get("/vehicles/{vehicle_id}/image")
def get_vehicle_image(
    vehicle_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_transport_context_image),
):
    img = get_entity_image(db, "transport_vehicle", vehicle_id, business_context="transport")
    if not img:
        raise HTTPException(status_code=404, detail="Vehicle image not found.")
    return build_image_response(img, request.headers.get("if-none-match"))


@router.delete("/vehicles/{vehicle_id}/image")
def delete_vehicle_image(vehicle_id: int, db: Session = Depends(get_db)):
    v = db.query(TransportVehicle).filter(TransportVehicle.id == vehicle_id, TransportVehicle.is_deleted.is_(False)).first()
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found.")
    delete_entity_image(db, "transport_vehicle", v.id, business_context="transport")
    v.image_url = None
    db.commit()
    db.refresh(v)
    return _serialize_vehicle(v)


# ==========================================
# 4. DRIVERS CRUD & IMAGES
# ==========================================

@router.get("/staff-lookup")
def list_available_staff_for_drivers(db: Session = Depends(get_db)):
    """Lists active Staff records whose designation is Driver and not yet linked to a TransportDriver."""
    linked_ids = [
        sid for (sid,) in db.query(TransportDriver.staff_id).filter(TransportDriver.staff_id.isnot(None)).all()
    ]
    q = (
        db.query(Staff, User)
        .join(User, Staff.user_id == User.id)
        .filter(User.is_active.is_(True), Staff.designation.ilike("%driver%"))
    )
    if linked_ids:
        q = q.filter(~Staff.id.in_(linked_ids))
    rows = q.order_by(User.full_name.asc()).all()
    return [
        {
            "staff_id": s.id,
            "full_name": u.full_name,
            "email": u.email,
            "phone": s.phone,
            "designation": s.designation,
            "employee_code": s.employee_code,
        }
        for s, u in rows
    ]


@router.get("/drivers")
def list_drivers(
    search: str | None = None,
    availability_status: str | None = None,
    employment_status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = (
        db.query(TransportDriver)
        .options(joinedload(TransportDriver.assigned_vehicle))
        .filter(TransportDriver.is_deleted.is_(False))
    )
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(
            or_(
                TransportDriver.driver_name.ilike(like),
                TransportDriver.phone.ilike(like),
                TransportDriver.licence_number.ilike(like),
                TransportDriver.email.ilike(like),
            )
        )
    if availability_status:
        q = q.filter(TransportDriver.availability_status == availability_status)
    if employment_status:
        q = q.filter(TransportDriver.employment_status == employment_status)

    total = q.count()
    rows = q.order_by(TransportDriver.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, math.ceil(total / page_size)),
        "items": [_serialize_driver(d) for d in rows],
    }


@router.post("/drivers", status_code=201)
def create_driver(
    data: DriverCreate,
    current_user: User = Depends(require_transport_context),
    db: Session = Depends(get_db),
):
    payload = data.model_dump()
    if payload.get("assigned_vehicle_id"):
        if not db.get(TransportVehicle, payload["assigned_vehicle_id"]):
            raise HTTPException(status_code=404, detail="Assigned vehicle not found.")
    if payload.get("staff_id"):
        if not db.get(Staff, payload["staff_id"]):
            raise HTTPException(status_code=404, detail="Linked staff record not found.")

    if payload["employment_status"] != "Active":
        payload["is_active"] = False

    driver = TransportDriver(**payload, created_by=current_user.id)
    db.add(driver)
    try:
        db.commit()
        db.refresh(driver)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Licence number or linked staff record already exists.")
    return _serialize_driver(driver)


@router.patch("/drivers/{driver_id}")
def update_driver(driver_id: int, data: DriverUpdate, db: Session = Depends(get_db)):
    d = db.query(TransportDriver).filter(TransportDriver.id == driver_id, TransportDriver.is_deleted.is_(False)).first()
    if not d:
        raise HTTPException(status_code=404, detail="Driver not found.")
    updates = data.model_dump(exclude_unset=True)
    if updates.get("assigned_vehicle_id"):
        if not db.get(TransportVehicle, updates["assigned_vehicle_id"]):
            raise HTTPException(status_code=404, detail="Assigned vehicle not found.")
    for k, val in updates.items():
        setattr(d, k, val)
    if "employment_status" in updates:
        d.is_active = updates["employment_status"] == "Active"
    try:
        db.commit()
        db.refresh(d)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Driver update conflicts with existing licence or staff link.")
    return _serialize_driver(d)


@router.delete("/drivers/{driver_id}")
def delete_driver(driver_id: int, db: Session = Depends(get_db)):
    d = db.query(TransportDriver).filter(TransportDriver.id == driver_id, TransportDriver.is_deleted.is_(False)).first()
    if not d:
        raise HTTPException(status_code=404, detail="Driver not found.")
    has_assignments = db.query(TransportAssignment.id).filter(TransportAssignment.driver_id == driver_id).first()
    has_bookings = db.query(TransportBooking.id).filter(TransportBooking.driver_id == driver_id, TransportBooking.is_deleted.is_(False)).first()
    if has_assignments or has_bookings:
        raise HTTPException(
            status_code=409,
            detail="Driver cannot be deleted because trip assignments or bookings reference this driver. Set driver Inactive instead.",
        )
    delete_entity_image(db, "transport_driver", d.id, business_context="transport")
    db.delete(d)
    db.commit()
    return {"message": "Driver deleted successfully."}


@router.post("/drivers/{driver_id}/image")
async def upload_driver_image(driver_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    d = db.query(TransportDriver).filter(TransportDriver.id == driver_id, TransportDriver.is_deleted.is_(False)).first()
    if not d:
        raise HTTPException(status_code=404, detail="Driver not found.")
    image_bytes, mime_type, file_size, checksum = await validate_image_file(file)
    img_record = save_or_replace_entity_image(
        db=db,
        entity_type="transport_driver",
        business_context="transport",
        entity_id=d.id,
        image_data=image_bytes,
        mime_type=mime_type,
        file_size=file_size,
        checksum=checksum,
    )
    ts = int(img_record.updated_at.timestamp())
    d.profile_image_url = f"/api/transport/drivers/{d.id}/image?v={ts}"
    db.commit()
    db.refresh(d)
    return _serialize_driver(d)


@router.get("/drivers/{driver_id}/image")
def get_driver_image(
    driver_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_transport_context_image),
):
    img = get_entity_image(db, "transport_driver", driver_id, business_context="transport")
    if not img:
        raise HTTPException(status_code=404, detail="Driver photo not found.")
    return build_image_response(img, request.headers.get("if-none-match"))


@router.delete("/drivers/{driver_id}/image")
def delete_driver_image(driver_id: int, db: Session = Depends(get_db)):
    d = db.query(TransportDriver).filter(TransportDriver.id == driver_id, TransportDriver.is_deleted.is_(False)).first()
    if not d:
        raise HTTPException(status_code=404, detail="Driver not found.")
    delete_entity_image(db, "transport_driver", d.id, business_context="transport")
    d.profile_image_url = None
    db.commit()
    db.refresh(d)
    return _serialize_driver(d)


# ==========================================
# 5. ROUTES & SERVICE CATALOGUE
# ==========================================

@router.get("/routes")
def list_routes(
    search: str | None = None,
    route_type: str | None = None,
    active_only: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(TransportRoute).filter(TransportRoute.is_deleted.is_(False))
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(
            or_(
                TransportRoute.route_name.ilike(like),
                TransportRoute.route_code.ilike(like),
                TransportRoute.starting_location.ilike(like),
                TransportRoute.destination.ilike(like),
            )
        )
    if route_type:
        q = q.filter(TransportRoute.route_type == route_type)
    if active_only:
        q = q.filter(TransportRoute.is_active.is_(True))
    rows = q.order_by(TransportRoute.route_name.asc()).all()
    return [_serialize_route(r) for r in rows]


@router.get("/routes/next-code")
def get_next_route_code(
    route_type: str = Query("Custom Route"),
    starting_location: str = Query(""),
    destination: str = Query(""),
    db: Session = Depends(get_db),
):
    return {
        "route_code": generate_unique_route_code(
            db,
            route_type=route_type,
            starting_location=starting_location,
            destination=destination,
        )
    }


@router.post("/routes", status_code=201)
def create_route(data: RouteCreate, db: Session = Depends(get_db)):
    payload = data.model_dump()
    if not payload.get("route_code"):
        payload["route_code"] = generate_unique_route_code(
            db,
            route_type=payload.get("route_type", ""),
            starting_location=payload.get("starting_location", ""),
            destination=payload.get("destination", ""),
        )
    r = TransportRoute(**payload)
    db.add(r)
    try:
        db.commit()
        db.refresh(r)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Route code already exists.")
    return _serialize_route(r)


@router.patch("/routes/{route_id}")
def update_route(route_id: int, data: RouteUpdate, db: Session = Depends(get_db)):
    r = db.query(TransportRoute).filter(TransportRoute.id == route_id, TransportRoute.is_deleted.is_(False)).first()
    if not r:
        raise HTTPException(status_code=404, detail="Route not found.")
    for k, val in data.model_dump(exclude_unset=True).items():
        setattr(r, k, val)
    try:
        db.commit()
        db.refresh(r)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Route code conflicts with an existing route.")
    return _serialize_route(r)


@router.delete("/routes/{route_id}")
def delete_route(route_id: int, db: Session = Depends(get_db)):
    r = db.query(TransportRoute).filter(TransportRoute.id == route_id, TransportRoute.is_deleted.is_(False)).first()
    if not r:
        raise HTTPException(status_code=404, detail="Route not found.")
    in_use = db.query(TransportBooking.id).filter(TransportBooking.route_id == route_id, TransportBooking.is_deleted.is_(False)).first()
    if in_use:
        raise HTTPException(status_code=409, detail="Route has associated bookings and cannot be deleted. Deactivate it instead.")
    db.delete(r)
    db.commit()
    return {"message": "Route deleted."}


@router.get("/services")
def list_services(
    search: str | None = None,
    active_only: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(TransportServiceType).filter(TransportServiceType.is_deleted.is_(False))
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(or_(TransportServiceType.service_name.ilike(like), TransportServiceType.service_code.ilike(like)))
    if active_only:
        q = q.filter(TransportServiceType.is_active.is_(True), TransportServiceType.is_available.is_(True))
    rows = q.order_by(TransportServiceType.service_name.asc()).all()
    return [_serialize_service(s) for s in rows]


@router.post("/services", status_code=201)
def create_service(data: ServiceTypeCreate, db: Session = Depends(get_db)):
    payload = data.model_dump()
    cat_ids = payload.pop("applicable_category_ids", [])
    svc = TransportServiceType(**payload, applicable_category_ids=json.dumps(cat_ids))
    db.add(svc)
    try:
        db.commit()
        db.refresh(svc)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Service code already exists.")
    return _serialize_service(svc)


@router.patch("/services/{service_id}")
def update_service(service_id: int, data: ServiceTypeUpdate, db: Session = Depends(get_db)):
    svc = db.query(TransportServiceType).filter(TransportServiceType.id == service_id, TransportServiceType.is_deleted.is_(False)).first()
    if not svc:
        raise HTTPException(status_code=404, detail="Transport service not found.")
    updates = data.model_dump(exclude_unset=True)
    if "applicable_category_ids" in updates:
        svc.applicable_category_ids = json.dumps(updates.pop("applicable_category_ids") or [])
    for k, val in updates.items():
        setattr(svc, k, val)
    try:
        db.commit()
        db.refresh(svc)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Service code conflicts with an existing service.")
    return _serialize_service(svc)


@router.delete("/services/{service_id}")
def delete_service(service_id: int, db: Session = Depends(get_db)):
    svc = db.query(TransportServiceType).filter(TransportServiceType.id == service_id, TransportServiceType.is_deleted.is_(False)).first()
    if not svc:
        raise HTTPException(status_code=404, detail="Transport service not found.")
    in_use = db.query(TransportBooking.id).filter(TransportBooking.service_type_id == service_id, TransportBooking.is_deleted.is_(False)).first()
    if in_use:
        raise HTTPException(status_code=409, detail="Service has associated bookings and cannot be deleted. Deactivate it instead.")
    db.delete(svc)
    db.commit()
    return {"message": "Transport service deleted."}


# ==========================================
# 6. AVAILABILITY & MODULE INTEGRATIONS
# ==========================================

@router.get("/availability")
def check_availability(
    pickup_date: datetime.date,
    pickup_time: str = Query("09:00"),
    duration_minutes: int = Query(60, ge=1, le=2880),
    passenger_count: int = Query(1, ge=1, le=100),
    service_type_id: int | None = None,
    exclude_booking_id: int | None = None,
    db: Session = Depends(get_db),
):
    start_t = parse_hhmm(pickup_time)
    if exclude_booking_id is None:
        validate_not_past_pickup(pickup_date, start_t)
    end_t = add_minutes_to_time(start_t, duration_minutes)

    allowed_cat_ids: set[int] | None = None
    if service_type_id:
        svc = db.get(TransportServiceType, service_type_id)
        if svc:
            parsed = _parse_category_ids(svc.applicable_category_ids)
            if parsed:
                allowed_cat_ids = set(parsed)

    vehicles = (
        db.query(TransportVehicle)
        .options(joinedload(TransportVehicle.category))
        .filter(
            TransportVehicle.is_deleted.is_(False),
            TransportVehicle.is_active.is_(True),
            TransportVehicle.status != VehicleStatus.MAINTENANCE.value,
            TransportVehicle.status != VehicleStatus.INACTIVE.value,
            TransportVehicle.seating_capacity >= passenger_count,
        )
        .order_by(TransportVehicle.seating_capacity.asc(), TransportVehicle.vehicle_name.asc())
        .all()
    )
    available_vehicles = []
    for v in vehicles:
        if allowed_cat_ids is not None and v.category_id not in allowed_cat_ids:
            continue
        overlap, _ = has_overlapping_assignment(
            db,
            scheduled_date=pickup_date,
            start_time=start_t,
            end_time=end_t,
            vehicle_id=v.id,
            exclude_booking_id=exclude_booking_id,
        )
        if not overlap:
            available_vehicles.append(_serialize_vehicle(v))

    drivers = (
        db.query(TransportDriver)
        .options(joinedload(TransportDriver.assigned_vehicle))
        .filter(
            TransportDriver.is_deleted.is_(False),
            TransportDriver.is_active.is_(True),
            TransportDriver.employment_status == "Active",
            ~TransportDriver.availability_status.in_(["On Leave", "Unavailable", "Off Duty"]),
            TransportDriver.licence_validity >= pickup_date,
        )
        .order_by(TransportDriver.driver_name.asc())
        .all()
    )
    available_drivers = []
    for d in drivers:
        overlap, _ = has_overlapping_assignment(
            db,
            scheduled_date=pickup_date,
            start_time=start_t,
            end_time=end_t,
            driver_id=d.id,
            exclude_booking_id=exclude_booking_id,
        )
        if not overlap:
            available_drivers.append(_serialize_driver(d))

    return {
        "pickup_date": pickup_date,
        "pickup_time": _serialize_time(start_t),
        "estimated_end_time": _serialize_time(end_t),
        "passenger_count": passenger_count,
        "available_vehicles": available_vehicles,
        "available_drivers": available_drivers,
    }


@router.get("/integration-references")
def get_integration_references(db: Session = Depends(get_db)):
    stays = (
        db.query(StayBooking)
        .options(
            joinedload(StayBooking.guest),
            joinedload(StayBooking.customer),
            joinedload(StayBooking.unit).joinedload(Unit.villa),
        )
        .filter(StayBooking.status.in_(["Reserved", "Confirmed", "Checked In"]))
        .order_by(StayBooking.id.desc())
        .limit(50)
        .all()
    )
    customers_all = db.query(Customer).all()
    cust_by_phone = {c.phone: c for c in customers_all if c.phone}
    cust_by_email = {c.email.lower(): c for c in customers_all if c.email}

    stay_refs = []
    for s in stays:
        guest = s.guest
        linked_cust = s.customer
        if not linked_cust and guest:
            if guest.phone and guest.phone in cust_by_phone:
                linked_cust = cust_by_phone[guest.phone]
            elif guest.email and guest.email.lower() in cust_by_email:
                linked_cust = cust_by_email[guest.email.lower()]

        guest_name = (
            guest.full_name
            if guest
            else (linked_cust.full_name if linked_cust else "Walk-in / Unassigned Guest")
        )
        guest_phone = guest.phone if guest else (linked_cust.phone if linked_cust else "")
        guest_email = guest.email if guest else (linked_cust.email if linked_cust else None)
        guest_ref = guest.guest_reference if guest else f"CUST-{linked_cust.id}" if linked_cust else "—"
        unit_label = (
            f"{s.unit.villa.name} · {s.unit.name}"
            if s.unit and s.unit.villa
            else (s.unit.name if s.unit else None)
        )
        identity_parts = [p for p in [guest_ref if guest_ref != "—" else None, guest_phone] if p]
        identity_str = f" ({' · '.join(identity_parts)})" if identity_parts else ""
        date_span = f"{s.check_in.strftime('%d %b')}–{s.check_out.strftime('%d %b')}"
        stay_refs.append(
            {
                "id": s.id,
                "booking_number": s.booking_number,
                "customer_id": linked_cust.id if linked_cust else None,
                "guest_id": s.guest_id,
                "guest_name": guest_name,
                "guest_phone": guest_phone,
                "guest_email": guest_email,
                "guest_reference": guest_ref,
                "guests_count": s.guests,
                "unit_label": unit_label,
                "status": s.status,
                "label": f"{guest_name}{identity_str} · {s.booking_number} ({date_span})",
            }
        )

    packages = (
        db.query(PackageBooking)
        .options(joinedload(PackageBooking.customer))
        .filter(PackageBooking.is_deleted.is_(False), PackageBooking.status.in_(["Pending", "Confirmed", "In Progress"]))
        .order_by(PackageBooking.id.desc())
        .limit(50)
        .all()
    )
    activities = (
        db.query(ActivityBooking)
        .options(joinedload(ActivityBooking.customer))
        .filter(ActivityBooking.is_deleted.is_(False), ActivityBooking.status.in_(["Pending", "Confirmed"]))
        .order_by(ActivityBooking.id.desc())
        .limit(50)
        .all()
    )
    return {
        "stay_bookings": stay_refs,
        "package_bookings": [
            {
                "id": p.id,
                "booking_number": p.booking_number,
                "customer_id": p.customer_id,
                "customer_name": p.customer.full_name if p.customer else "",
                "customer_phone": p.customer.phone if p.customer else "",
                "customer_email": p.customer.email if p.customer else None,
                "guests_count": p.guest_count,
                "package_name": p.package_name_snapshot,
                "label": f"{p.booking_number} · {p.package_name_snapshot}"
                + (f" — {p.customer.full_name}" if p.customer else "")
                + f" ({p.guest_count} guests)",
            }
            for p in packages
        ],
        "activity_bookings": [
            {
                "id": a.id,
                "booking_number": a.booking_number,
                "customer_id": a.customer_id,
                "customer_name": a.customer.full_name if a.customer else "",
                "customer_phone": a.customer.phone if a.customer else "",
                "customer_email": a.customer.email if a.customer else None,
                "participant_count": a.participant_count,
                "activity_name": a.activity_name_snapshot,
                "label": f"{a.booking_number} · {a.activity_name_snapshot}"
                + (f" — {a.customer.full_name}" if a.customer else "")
                + f" ({a.participant_count} pax)",
            }
            for a in activities
        ],
    }


# ==========================================
# 7. SHARED CUSTOMERS REUSE
# ==========================================

@router.get("/customers")
def list_customers(search: str | None = None, db: Session = Depends(get_db)):
    q = db.query(Customer)
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(or_(Customer.full_name.ilike(like), Customer.phone.ilike(like), Customer.email.ilike(like)))
    rows = q.order_by(Customer.full_name.asc()).limit(100).all()
    return [
        {
            "id": c.id,
            "full_name": c.full_name,
            "phone": c.phone,
            "email": c.email,
            "address": c.address,
        }
        for c in rows
    ]


@router.post("/customers", status_code=201)
def create_customer(data: CustomerCreate, db: Session = Depends(get_db)):
    c = Customer(full_name=data.full_name, phone=data.phone, email=data.email, address=data.address)
    db.add(c)
    try:
        db.commit()
        db.refresh(c)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Customer conflicts with an existing record.")
    return {"id": c.id, "full_name": c.full_name, "phone": c.phone, "email": c.email, "address": c.address}


@router.patch("/customers/{customer_id}")
def update_customer(customer_id: int, data: CustomerUpdate, db: Session = Depends(get_db)):
    c = db.get(Customer, customer_id)
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found.")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "full_name": c.full_name, "phone": c.phone, "email": c.email, "address": c.address}


# ==========================================
# 8. TRANSPORT BOOKINGS, ASSIGNMENTS & TRIP WORKFLOW
# ==========================================

@router.get("/bookings")
def list_bookings(
    search: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    booking_type: str | None = None,
    date_from: datetime.date | None = None,
    date_to: datetime.date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = (
        db.query(TransportBooking)
        .options(
            joinedload(TransportBooking.customer),
            joinedload(TransportBooking.vehicle),
            joinedload(TransportBooking.driver),
            joinedload(TransportBooking.service_type),
            joinedload(TransportBooking.route),
            joinedload(TransportBooking.stay_booking).joinedload(StayBooking.guest),
            joinedload(TransportBooking.package_booking),
            joinedload(TransportBooking.activity_booking),
            selectinload(TransportBooking.assignments),
        )
        .outerjoin(Customer, TransportBooking.customer_id == Customer.id)
        .filter(TransportBooking.is_deleted.is_(False))
    )
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(
            or_(
                TransportBooking.booking_number.ilike(like),
                TransportBooking.pickup_location.ilike(like),
                TransportBooking.drop_location.ilike(like),
                Customer.full_name.ilike(like),
                Customer.phone.ilike(like),
            )
        )
    if status_filter:
        q = q.filter(TransportBooking.status == status_filter)
    if booking_type:
        q = q.filter(TransportBooking.booking_type == booking_type)
    if date_from:
        q = q.filter(TransportBooking.pickup_date >= date_from)
    if date_to:
        q = q.filter(TransportBooking.pickup_date <= date_to)

    total = q.count()
    rows = q.order_by(TransportBooking.pickup_date.desc(), TransportBooking.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, math.ceil(total / page_size)),
        "items": [_serialize_booking(b, db) for b in rows],
    }


@router.get("/bookings/{booking_id}")
def get_booking(booking_id: int, db: Session = Depends(get_db)):
    b = (
        db.query(TransportBooking)
        .options(
            joinedload(TransportBooking.customer),
            joinedload(TransportBooking.vehicle),
            joinedload(TransportBooking.driver),
            joinedload(TransportBooking.service_type),
            joinedload(TransportBooking.route),
            joinedload(TransportBooking.stay_booking).joinedload(StayBooking.guest),
            joinedload(TransportBooking.package_booking),
            joinedload(TransportBooking.activity_booking),
            selectinload(TransportBooking.passengers),
            selectinload(TransportBooking.assignments),
            selectinload(TransportBooking.history).joinedload(TransportBooking.history.property.mapper.class_.changed_by_user),
        )
        .filter(TransportBooking.id == booking_id, TransportBooking.is_deleted.is_(False))
        .first()
    )
    if not b:
        raise HTTPException(status_code=404, detail="Transport booking not found.")
    return _serialize_booking(b, db, include_details=True)


@router.post("/bookings", status_code=201)
def create_booking(
    data: TransportBookingCreate,
    current_user: User = Depends(require_transport_context),
    db: Session = Depends(get_db),
):
    stay = (
        db.query(StayBooking)
        .options(joinedload(StayBooking.guest), joinedload(StayBooking.customer))
        .filter(StayBooking.id == data.stay_booking_id)
        .first()
        if data.stay_booking_id
        else None
    )
    if data.stay_booking_id and not stay:
        raise HTTPException(status_code=404, detail="Referenced stay booking not found.")

    if data.customer_id:
        customer = db.get(Customer, data.customer_id)
        if not customer:
            raise HTTPException(status_code=404, detail="Selected customer not found.")
    elif stay:
        customer = resolve_customer_for_stay(db, stay)
        if not customer:
            raise HTTPException(status_code=422, detail="Could not resolve a guest/customer profile from the selected stay booking.")
    else:
        raise HTTPException(status_code=422, detail="Please select a customer or linked stay guest.")

    service = db.get(TransportServiceType, data.service_type_id) if data.service_type_id else None
    if data.service_type_id and (not service or service.is_deleted or not service.is_active):
        raise HTTPException(status_code=404, detail="Selected transport service is unavailable.")

    route = db.get(TransportRoute, data.route_id) if data.route_id else None
    if data.route_id and (not route or route.is_deleted or not route.is_active):
        raise HTTPException(status_code=404, detail="Selected route is unavailable.")

    if data.package_booking_id and not db.get(PackageBooking, data.package_booking_id):
        raise HTTPException(status_code=404, detail="Referenced package booking not found.")
    if data.activity_booking_id and not db.get(ActivityBooking, data.activity_booking_id):
        raise HTTPException(status_code=404, detail="Referenced activity booking not found.")

    pickup_t = parse_hhmm(data.pickup_time)
    validate_not_past_pickup(data.pickup_date, pickup_t)
    duration = data.estimated_duration_minutes or (route.estimated_duration_minutes if route else 60)
    distance = data.estimated_distance_km if data.estimated_distance_km > 0 else (route.approximate_distance_km if route else Decimal("0.00"))
    end_t = add_minutes_to_time(pickup_t, duration)

    if (data.vehicle_id and not data.driver_id) or (data.driver_id and not data.vehicle_id):
        raise HTTPException(status_code=422, detail="Assign both a vehicle and a driver together, or leave both unassigned.")

    vehicle = None
    driver = None
    initial_status = TransportBookingStatus.CONFIRMED.value
    if data.vehicle_id and data.driver_id:
        vehicle, driver = validate_vehicle_and_driver_for_assignment(
            db,
            vehicle_id=data.vehicle_id,
            driver_id=data.driver_id,
            passenger_count=data.passenger_count,
            scheduled_date=data.pickup_date,
            start_time=pickup_t,
            end_time=end_t,
        )
        initial_status = TransportBookingStatus.ASSIGNED.value

    base_price = calculate_transport_price(
        service=service,
        route=route,
        estimated_distance_km=distance,
        estimated_duration_minutes=duration,
        override_base_price=data.base_price,
    )
    add_charges = money(data.additional_charges)
    discount = money(data.discount_amount)
    total_amount = max(Decimal("0.00"), money(base_price + add_charges - discount))

    booking = TransportBooking(
        booking_number=generate_transport_booking_number(db),
        booking_type=data.booking_type,
        customer_id=customer.id,
        stay_booking_id=data.stay_booking_id,
        package_booking_id=data.package_booking_id,
        activity_booking_id=data.activity_booking_id,
        service_type_id=data.service_type_id,
        route_id=data.route_id,
        pickup_location=data.pickup_location.strip(),
        drop_location=data.drop_location.strip(),
        pickup_date=data.pickup_date,
        pickup_time=pickup_t,
        estimated_end_time=end_t,
        estimated_distance_km=distance,
        estimated_duration_minutes=duration,
        passenger_count=data.passenger_count,
        vehicle_id=vehicle.id if vehicle else None,
        driver_id=driver.id if driver else None,
        base_price=base_price,
        additional_charges=add_charges,
        discount_amount=discount,
        total_amount=total_amount,
        status=initial_status,
        notes=data.notes,
        created_by=current_user.id,
    )
    db.add(booking)
    db.flush()

    passengers_to_add = list(data.passengers)
    if not passengers_to_add:
        db.add(
            TransportBookingPassenger(
                booking_id=booking.id,
                passenger_name=customer.full_name,
                phone=customer.phone,
                is_primary=True,
            )
        )
    else:
        for idx, p in enumerate(passengers_to_add):
            db.add(
                TransportBookingPassenger(
                    booking_id=booking.id,
                    passenger_name=p.passenger_name,
                    phone=p.phone,
                    age=p.age,
                    is_primary=p.is_primary or idx == 0,
                    notes=p.notes,
                )
            )

    schedule = TransportSchedule(
        booking_id=booking.id,
        vehicle_id=vehicle.id if vehicle else None,
        driver_id=driver.id if driver else None,
        scheduled_date=data.pickup_date,
        start_time=pickup_t,
        end_time=end_t,
        status="Scheduled",
        notes=data.notes,
    )
    db.add(schedule)

    if vehicle and driver:
        assignment = TransportAssignment(
            booking_id=booking.id,
            vehicle_id=vehicle.id,
            driver_id=driver.id,
            scheduled_date=data.pickup_date,
            start_time=pickup_t,
            end_time=end_t,
            assignment_status=TransportBookingStatus.ASSIGNED.value,
            assigned_by=current_user.id,
        )
        db.add(assignment)
        sync_vehicle_and_driver_operational_status(db, vehicle.id, driver.id)

    record_booking_history(
        db,
        booking_id=booking.id,
        action="CREATED",
        previous_status=None,
        new_status=initial_status,
        changed_by=current_user.id,
        reason="Transport booking created",
    )

    db.commit()
    db.refresh(booking)
    return _serialize_booking(booking, db, include_details=True)


@router.patch("/bookings/{booking_id}")
def update_booking(
    booking_id: int,
    data: TransportBookingUpdate,
    current_user: User = Depends(require_transport_context),
    db: Session = Depends(get_db),
):
    b = db.query(TransportBooking).filter(TransportBooking.id == booking_id, TransportBooking.is_deleted.is_(False)).first()
    if not b:
        raise HTTPException(status_code=404, detail="Transport booking not found.")
    if b.status in {TransportBookingStatus.COMPLETED.value, TransportBookingStatus.CANCELLED.value, TransportBookingStatus.NO_SHOW.value}:
        raise HTTPException(status_code=409, detail="Completed, cancelled, or no-show bookings cannot be edited.")

    updates = data.model_dump(exclude_unset=True)
    new_date = updates.get("pickup_date", b.pickup_date)
    new_time = parse_hhmm(updates["pickup_time"]) if "pickup_time" in updates and updates["pickup_time"] else b.pickup_time
    if (new_date != b.pickup_date) or (new_time != b.pickup_time):
        validate_not_past_pickup(new_date, new_time)

    new_dur = updates.get("estimated_duration_minutes", b.estimated_duration_minutes)
    new_end = add_minutes_to_time(new_time, new_dur)
    new_pax = updates.get("passenger_count", b.passenger_count)

    if "customer_id" in updates and updates["customer_id"] is not None:
        if not db.get(Customer, updates["customer_id"]):
            raise HTTPException(status_code=404, detail="Selected customer not found.")
    if "stay_booking_id" in updates and updates["stay_booking_id"] is not None:
        stay = (
            db.query(StayBooking)
            .options(joinedload(StayBooking.guest), joinedload(StayBooking.customer))
            .filter(StayBooking.id == updates["stay_booking_id"])
            .first()
        )
        if not stay:
            raise HTTPException(status_code=404, detail="Referenced stay booking not found.")
        if "customer_id" not in updates or updates["customer_id"] is None:
            resolved = resolve_customer_for_stay(db, stay)
            if resolved:
                updates["customer_id"] = resolved.id
    if "package_booking_id" in updates and updates["package_booking_id"] is not None:
        if not db.get(PackageBooking, updates["package_booking_id"]):
            raise HTTPException(status_code=404, detail="Referenced package booking not found.")
    if "activity_booking_id" in updates and updates["activity_booking_id"] is not None:
        if not db.get(ActivityBooking, updates["activity_booking_id"]):
            raise HTTPException(status_code=404, detail="Referenced activity booking not found.")

    veh_id_in = updates.pop("vehicle_id", b.vehicle_id) if ("vehicle_id" in updates or "driver_id" in updates) else b.vehicle_id
    drv_id_in = updates.pop("driver_id", b.driver_id) if ("vehicle_id" in updates or "driver_id" in updates) else b.driver_id
    if (veh_id_in and not drv_id_in) or (drv_id_in and not veh_id_in):
        raise HTTPException(status_code=422, detail="Assign both a vehicle and a driver together, or leave both unassigned.")

    prev_veh_id = b.vehicle_id
    prev_drv_id = b.driver_id
    fleet_changed = (veh_id_in != prev_veh_id) or (drv_id_in != prev_drv_id)

    if veh_id_in and drv_id_in:
        validate_vehicle_and_driver_for_assignment(
            db,
            vehicle_id=veh_id_in,
            driver_id=drv_id_in,
            passenger_count=new_pax,
            scheduled_date=new_date,
            start_time=new_time,
            end_time=new_end,
            exclude_booking_id=b.id,
        )

    for k, val in updates.items():
        if k == "pickup_time":
            b.pickup_time = new_time
        elif k in {"pickup_location", "drop_location"} and isinstance(val, str):
            setattr(b, k, val.strip())
        elif k in {"base_price", "additional_charges", "discount_amount"} and val is not None:
            setattr(b, k, money(val))
        else:
            setattr(b, k, val)

    b.vehicle_id = veh_id_in
    b.driver_id = drv_id_in
    b.estimated_end_time = new_end
    b.total_amount = max(Decimal("0.00"), money(b.base_price + b.additional_charges - b.discount_amount))

    for s in b.schedules:
        s.scheduled_date = new_date
        s.start_time = new_time
        s.end_time = new_end
        s.vehicle_id = veh_id_in
        s.driver_id = drv_id_in

    if fleet_changed:
        for a in b.assignments:
            if a.assignment_status in ACTIVE_TRIP_STATUSES:
                a.assignment_status = "Reassigned"
        if veh_id_in and drv_id_in:
            db.add(
                TransportAssignment(
                    booking_id=b.id,
                    vehicle_id=veh_id_in,
                    driver_id=drv_id_in,
                    scheduled_date=new_date,
                    start_time=new_time,
                    end_time=new_end,
                    assignment_status=TransportBookingStatus.ASSIGNED.value,
                    assigned_by=current_user.id,
                )
            )
            if b.status in {TransportBookingStatus.PENDING.value, TransportBookingStatus.CONFIRMED.value}:
                b.status = TransportBookingStatus.ASSIGNED.value
        elif b.status == TransportBookingStatus.ASSIGNED.value:
            b.status = TransportBookingStatus.CONFIRMED.value
    else:
        for a in b.assignments:
            if a.assignment_status in ACTIVE_TRIP_STATUSES:
                a.scheduled_date = new_date
                a.start_time = new_time
                a.end_time = new_end

    record_booking_history(
        db,
        booking_id=b.id,
        action="UPDATED",
        previous_status=b.status,
        new_status=b.status,
        changed_by=current_user.id,
        reason="Booking details updated",
    )

    db.flush()
    if prev_veh_id or prev_drv_id:
        sync_vehicle_and_driver_operational_status(db, prev_veh_id, prev_drv_id)
    if veh_id_in or drv_id_in:
        sync_vehicle_and_driver_operational_status(db, veh_id_in, drv_id_in)

    db.commit()
    db.refresh(b)
    return _serialize_booking(b, db, include_details=True)


@router.post("/bookings/{booking_id}/assign")
def assign_vehicle_and_driver(
    booking_id: int,
    data: AssignmentRequest,
    current_user: User = Depends(require_transport_context),
    db: Session = Depends(get_db),
):
    b = db.query(TransportBooking).filter(TransportBooking.id == booking_id, TransportBooking.is_deleted.is_(False)).first()
    if not b:
        raise HTTPException(status_code=404, detail="Transport booking not found.")
    if b.status in {TransportBookingStatus.COMPLETED.value, TransportBookingStatus.CANCELLED.value, TransportBookingStatus.NO_SHOW.value}:
        raise HTTPException(status_code=409, detail=f"Cannot assign vehicle/driver when booking is '{b.status}'.")

    vehicle, driver = validate_vehicle_and_driver_for_assignment(
        db,
        vehicle_id=data.vehicle_id,
        driver_id=data.driver_id,
        passenger_count=b.passenger_count,
        scheduled_date=b.pickup_date,
        start_time=b.pickup_time,
        end_time=b.estimated_end_time,
        exclude_booking_id=b.id,
    )

    prev_vehicle_id = b.vehicle_id
    prev_driver_id = b.driver_id

    for existing_a in b.assignments:
        if existing_a.assignment_status in ACTIVE_TRIP_STATUSES:
            existing_a.assignment_status = "Reassigned"

    assignment = TransportAssignment(
        booking_id=b.id,
        vehicle_id=vehicle.id,
        driver_id=driver.id,
        scheduled_date=b.pickup_date,
        start_time=b.pickup_time,
        end_time=b.estimated_end_time,
        assignment_status=TransportBookingStatus.ASSIGNED.value,
        remarks=data.remarks,
        assigned_by=current_user.id,
    )
    db.add(assignment)

    prev_status = b.status
    b.vehicle_id = vehicle.id
    b.driver_id = driver.id
    if b.status in {TransportBookingStatus.PENDING.value, TransportBookingStatus.CONFIRMED.value}:
        b.status = TransportBookingStatus.ASSIGNED.value

    for s in b.schedules:
        s.vehicle_id = vehicle.id
        s.driver_id = driver.id

    db.flush()
    if prev_vehicle_id or prev_driver_id:
        sync_vehicle_and_driver_operational_status(db, prev_vehicle_id, prev_driver_id)
    sync_vehicle_and_driver_operational_status(db, vehicle.id, driver.id)

    record_booking_history(
        db,
        booking_id=b.id,
        action="ASSIGNED",
        previous_status=prev_status,
        new_status=b.status,
        changed_by=current_user.id,
        reason=f"Assigned {vehicle.vehicle_name} ({vehicle.registration_number}) with driver {driver.driver_name}",
    )

    db.commit()
    db.refresh(b)
    return _serialize_booking(b, db, include_details=True)


@router.patch("/bookings/{booking_id}/status")
def update_trip_status(
    booking_id: int,
    data: TripStatusUpdate,
    current_user: User = Depends(require_transport_context),
    db: Session = Depends(get_db),
):
    b = db.query(TransportBooking).filter(TransportBooking.id == booking_id, TransportBooking.is_deleted.is_(False)).first()
    if not b:
        raise HTTPException(status_code=404, detail="Transport booking not found.")

    allowed = ALLOWED_TRIP_TRANSITIONS.get(b.status, set())
    if data.status not in allowed:
        raise HTTPException(
            status_code=422,
            detail=f"Cannot transition booking from '{b.status}' to '{data.status}'. Allowed: {sorted(allowed)}",
        )

    if data.status in {TransportBookingStatus.ASSIGNED.value, TransportBookingStatus.DRIVER_EN_ROUTE.value, TransportBookingStatus.IN_PROGRESS.value, TransportBookingStatus.COMPLETED.value}:
        if not b.vehicle_id or not b.driver_id:
            raise HTTPException(status_code=409, detail="Assign a vehicle and driver before advancing trip status.")

    prev_status = b.status
    b.status = data.status
    if data.status == TransportBookingStatus.CANCELLED.value:
        b.cancellation_reason = data.reason
        b.cancelled_at = get_kolkata_now()

    active_a = next((a for a in b.assignments if a.assignment_status in ACTIVE_TRIP_STATUSES), None)
    if active_a:
        active_a.assignment_status = data.status
        if data.status == TransportBookingStatus.IN_PROGRESS.value and not active_a.actual_departure_at:
            active_a.actual_departure_at = data.actual_departure_at or get_kolkata_now()
        elif data.actual_departure_at:
            active_a.actual_departure_at = data.actual_departure_at
        if data.status == TransportBookingStatus.COMPLETED.value and not active_a.actual_arrival_at:
            active_a.actual_arrival_at = data.actual_arrival_at or get_kolkata_now()
        elif data.actual_arrival_at:
            active_a.actual_arrival_at = data.actual_arrival_at
        if data.start_odometer_km is not None:
            active_a.start_odometer_km = data.start_odometer_km
        if data.end_odometer_km is not None:
            active_a.end_odometer_km = data.end_odometer_km
            if b.vehicle_id:
                veh = db.get(TransportVehicle, b.vehicle_id)
                if veh and data.end_odometer_km > veh.odometer_km:
                    veh.odometer_km = data.end_odometer_km
        if data.remarks:
            active_a.remarks = data.remarks

    sched_status_map = {
        TransportBookingStatus.DRIVER_EN_ROUTE.value: "En Route",
        TransportBookingStatus.IN_PROGRESS.value: "In Progress",
        TransportBookingStatus.COMPLETED.value: "Completed",
        TransportBookingStatus.CANCELLED.value: "Cancelled",
        TransportBookingStatus.NO_SHOW.value: "No Show",
    }
    for s in b.schedules:
        if data.status in sched_status_map:
            s.status = sched_status_map[data.status]

    db.flush()
    sync_vehicle_and_driver_operational_status(db, b.vehicle_id, b.driver_id)

    record_booking_history(
        db,
        booking_id=b.id,
        action="STATUS_CHANGE",
        previous_status=prev_status,
        new_status=data.status,
        changed_by=current_user.id,
        reason=data.reason or data.remarks,
    )

    db.commit()
    db.refresh(b)
    return _serialize_booking(b, db, include_details=True)


# ==========================================
# 9. SCHEDULES
# ==========================================

@router.get("/schedules")
def list_schedules(
    date_from: datetime.date | None = None,
    date_to: datetime.date | None = None,
    vehicle_id: int | None = None,
    driver_id: int | None = None,
    status_filter: str | None = Query(None, alias="status"),
    db: Session = Depends(get_db),
):
    q = (
        db.query(TransportSchedule)
        .join(TransportBooking, TransportSchedule.booking_id == TransportBooking.id)
        .options(
            joinedload(TransportSchedule.booking).joinedload(TransportBooking.customer),
            joinedload(TransportSchedule.vehicle),
            joinedload(TransportSchedule.driver),
        )
        .filter(TransportBooking.is_deleted.is_(False))
    )
    if date_from:
        q = q.filter(TransportSchedule.scheduled_date >= date_from)
    if date_to:
        q = q.filter(TransportSchedule.scheduled_date <= date_to)
    if vehicle_id:
        q = q.filter(TransportSchedule.vehicle_id == vehicle_id)
    if driver_id:
        q = q.filter(TransportSchedule.driver_id == driver_id)
    if status_filter:
        q = q.filter(TransportBooking.status == status_filter)

    rows = q.order_by(TransportSchedule.scheduled_date.asc(), TransportSchedule.start_time.asc()).all()
    return [
        {
            "id": s.id,
            "booking_id": s.booking_id,
            "booking_number": s.booking.booking_number,
            "booking_type": s.booking.booking_type,
            "booking_status": s.booking.status,
            "customer_name": s.booking.customer.full_name if s.booking.customer else "",
            "customer_phone": s.booking.customer.phone if s.booking.customer else "",
            "pickup_location": s.booking.pickup_location,
            "drop_location": s.booking.drop_location,
            "passenger_count": s.booking.passenger_count,
            "vehicle_id": s.vehicle_id,
            "vehicle_name": s.vehicle.vehicle_name if s.vehicle else None,
            "vehicle_reg": s.vehicle.registration_number if s.vehicle else None,
            "driver_id": s.driver_id,
            "driver_name": s.driver.driver_name if s.driver else None,
            "driver_phone": s.driver.phone if s.driver else None,
            "scheduled_date": s.scheduled_date,
            "start_time": _serialize_time(s.start_time),
            "end_time": _serialize_time(s.end_time),
            "status": s.booking.status,
            "notes": s.notes,
        }
        for s in rows
    ]


# ==========================================
# 10. MAINTENANCE RECORDS
# ==========================================

@router.get("/maintenance")
def list_maintenance(
    vehicle_id: int | None = None,
    status_filter: str | None = Query(None, alias="status"),
    db: Session = Depends(get_db),
):
    q = db.query(TransportMaintenanceRecord).options(joinedload(TransportMaintenanceRecord.vehicle))
    if vehicle_id:
        q = q.filter(TransportMaintenanceRecord.vehicle_id == vehicle_id)
    if status_filter:
        q = q.filter(TransportMaintenanceRecord.status == status_filter)
    rows = q.order_by(TransportMaintenanceRecord.service_date.desc(), TransportMaintenanceRecord.id.desc()).all()
    return [
        {
            "id": m.id,
            "vehicle_id": m.vehicle_id,
            "vehicle_name": m.vehicle.vehicle_name if m.vehicle else "",
            "vehicle_reg": m.vehicle.registration_number if m.vehicle else "",
            "maintenance_type": m.maintenance_type,
            "service_date": m.service_date,
            "service_description": m.service_description,
            "service_provider": m.service_provider,
            "cost": str(money(m.cost)),
            "odometer_km": m.odometer_km,
            "next_service_date": m.next_service_date,
            "status": m.status,
            "notes": m.notes,
            "created_at": m.created_at,
        }
        for m in rows
    ]


@router.post("/maintenance", status_code=201)
def create_maintenance(
    data: MaintenanceCreate,
    current_user: User = Depends(require_transport_context),
    db: Session = Depends(get_db),
):
    v = db.query(TransportVehicle).filter(TransportVehicle.id == data.vehicle_id, TransportVehicle.is_deleted.is_(False)).first()
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found.")
    if data.status == MaintenanceStatus.IN_PROGRESS.value:
        active_trip = (
            db.query(TransportAssignment.id)
            .filter(
                TransportAssignment.vehicle_id == v.id,
                TransportAssignment.assignment_status.in_(
                    [TransportBookingStatus.DRIVER_EN_ROUTE.value, TransportBookingStatus.IN_PROGRESS.value]
                ),
            )
            .first()
        )
        if active_trip:
            raise HTTPException(status_code=409, detail="Vehicle is currently on an active trip and cannot enter maintenance.")

    rec = TransportMaintenanceRecord(**data.model_dump(), created_by=current_user.id)
    db.add(rec)
    if data.status == MaintenanceStatus.COMPLETED.value:
        v.last_service_date = data.service_date
        if data.next_service_date:
            v.next_service_date = data.next_service_date
    db.flush()
    sync_vehicle_and_driver_operational_status(db, v.id, None)
    db.commit()
    db.refresh(rec)
    return {"id": rec.id, "status": rec.status, "message": "Maintenance record created."}


@router.patch("/maintenance/{record_id}")
def update_maintenance(record_id: int, data: MaintenanceUpdate, db: Session = Depends(get_db)):
    rec = db.get(TransportMaintenanceRecord, record_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Maintenance record not found.")
    updates = data.model_dump(exclude_unset=True)
    for k, val in updates.items():
        setattr(rec, k, val)
    v = db.get(TransportVehicle, rec.vehicle_id)
    if v and rec.status == MaintenanceStatus.COMPLETED.value:
        v.last_service_date = rec.service_date
        if rec.next_service_date:
            v.next_service_date = rec.next_service_date
    db.flush()
    sync_vehicle_and_driver_operational_status(db, rec.vehicle_id, None)
    db.commit()
    return {"message": "Maintenance record updated."}


@router.delete("/maintenance/{record_id}")
def delete_maintenance(record_id: int, db: Session = Depends(get_db)):
    rec = db.get(TransportMaintenanceRecord, record_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Maintenance record not found.")
    vehicle_id = rec.vehicle_id
    db.delete(rec)
    db.flush()
    sync_vehicle_and_driver_operational_status(db, vehicle_id, None)
    db.commit()
    return {"message": "Maintenance record deleted."}


# ==========================================
# 11. FUEL & OPERATING EXPENSES
# ==========================================

@router.get("/expenses")
def list_expenses(
    vehicle_id: int | None = None,
    expense_category: str | None = None,
    date_from: datetime.date | None = None,
    date_to: datetime.date | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(TransportFuelRecord).options(joinedload(TransportFuelRecord.vehicle))
    if vehicle_id:
        q = q.filter(TransportFuelRecord.vehicle_id == vehicle_id)
    if expense_category:
        q = q.filter(TransportFuelRecord.expense_category == expense_category)
    if date_from:
        q = q.filter(TransportFuelRecord.record_date >= date_from)
    if date_to:
        q = q.filter(TransportFuelRecord.record_date <= date_to)
    rows = q.order_by(TransportFuelRecord.record_date.desc(), TransportFuelRecord.id.desc()).all()
    items = [
        {
            "id": e.id,
            "vehicle_id": e.vehicle_id,
            "vehicle_name": e.vehicle.vehicle_name if e.vehicle else "",
            "vehicle_reg": e.vehicle.registration_number if e.vehicle else "",
            "record_date": e.record_date,
            "expense_category": e.expense_category,
            "fuel_type": e.fuel_type,
            "quantity": str(e.quantity) if e.quantity is not None else None,
            "cost_per_unit": str(money(e.cost_per_unit)) if e.cost_per_unit is not None else None,
            "total_amount": str(money(e.total_amount)),
            "odometer_km": e.odometer_km,
            "vendor_name": e.vendor_name,
            "notes": e.notes,
        }
        for e in rows
    ]

    # Vehicle-wise expense summary (fuel/operating + maintenance)
    summary_map: dict[int, dict] = {}
    for e in rows:
        entry = summary_map.setdefault(
            e.vehicle_id,
            {
                "vehicle_id": e.vehicle_id,
                "vehicle_name": e.vehicle.vehicle_name if e.vehicle else "",
                "vehicle_reg": e.vehicle.registration_number if e.vehicle else "",
                "fuel_total": Decimal("0.00"),
                "other_total": Decimal("0.00"),
                "records_count": 0,
            },
        )
        if e.expense_category == "Fuel":
            entry["fuel_total"] += money(e.total_amount)
        else:
            entry["other_total"] += money(e.total_amount)
        entry["records_count"] += 1

    vehicle_summary = [
        {
            **s,
            "fuel_total": str(money(s["fuel_total"])),
            "other_total": str(money(s["other_total"])),
            "combined_total": str(money(s["fuel_total"] + s["other_total"])),
        }
        for s in summary_map.values()
    ]
    return {"items": items, "vehicle_summary": vehicle_summary}


@router.post("/expenses", status_code=201)
def create_expense(
    data: FuelExpenseCreate,
    current_user: User = Depends(require_transport_context),
    db: Session = Depends(get_db),
):
    v = db.query(TransportVehicle).filter(TransportVehicle.id == data.vehicle_id, TransportVehicle.is_deleted.is_(False)).first()
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found.")
    payload = data.model_dump()
    if payload.get("total_amount") is None:
        if payload.get("quantity") is not None and payload.get("cost_per_unit") is not None:
            payload["total_amount"] = money(Decimal(str(payload["quantity"])) * Decimal(str(payload["cost_per_unit"])))
        else:
            raise HTTPException(status_code=422, detail="Provide total_amount or both quantity and cost_per_unit.")
    rec = TransportFuelRecord(**payload, recorded_by=current_user.id)
    db.add(rec)
    if data.odometer_km and data.odometer_km > v.odometer_km:
        v.odometer_km = data.odometer_km
    db.commit()
    db.refresh(rec)
    return {"id": rec.id, "message": "Expense record saved."}


@router.patch("/expenses/{expense_id}")
def update_expense(expense_id: int, data: FuelExpenseUpdate, db: Session = Depends(get_db)):
    rec = db.get(TransportFuelRecord, expense_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Expense record not found.")
    for k, val in data.model_dump(exclude_unset=True).items():
        setattr(rec, k, val)
    db.commit()
    return {"message": "Expense record updated."}


@router.delete("/expenses/{expense_id}")
def delete_expense(expense_id: int, db: Session = Depends(get_db)):
    rec = db.get(TransportFuelRecord, expense_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Expense record not found.")
    db.delete(rec)
    db.commit()
    return {"message": "Expense record deleted."}


# ==========================================
# 12. INVOICES & PAYMENTS (SHARED INVOICES/PAYMENTS)
# ==========================================

@router.get("/invoices")
def list_invoices(
    search: str | None = None,
    payment_status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = (
        db.query(Invoice)
        .outerjoin(Customer, Invoice.customer_id == Customer.id)
        .filter(Invoice.source_module == BUSINESS_CONTEXT)
    )
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(
            or_(
                Invoice.invoice_number.ilike(like),
                Invoice.source_reference_number.ilike(like),
                Customer.full_name.ilike(like),
                Customer.phone.ilike(like),
            )
        )
    if payment_status:
        q = q.filter(Invoice.payment_status == payment_status)
    total = q.count()
    rows = q.order_by(Invoice.created_at.desc(), Invoice.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, math.ceil(total / page_size)),
        "items": [_serialize_invoice(inv, db) for inv in rows],
    }


@router.post("/invoices", status_code=201)
def create_invoice(data: TransportInvoiceCreate, db: Session = Depends(get_db)):
    booking = (
        db.query(TransportBooking)
        .filter(TransportBooking.id == data.booking_id, TransportBooking.is_deleted.is_(False))
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Transport booking not found.")
    if booking.status == TransportBookingStatus.CANCELLED.value:
        raise HTTPException(status_code=409, detail="Cannot generate an invoice for a cancelled booking.")

    existing = (
        db.query(Invoice)
        .filter(Invoice.source_module == BUSINESS_CONTEXT, Invoice.source_reference_id == booking.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="An invoice already exists for this transport booking.")

    if data.additional_charges is not None:
        booking.additional_charges = money(data.additional_charges)
    if data.discount_amount is not None:
        booking.discount_amount = money(data.discount_amount)
    booking.total_amount = max(Decimal("0.00"), money(booking.base_price + booking.additional_charges - booking.discount_amount))

    subtotal = money(booking.total_amount)
    gst_rate = money(data.gst_rate)
    gst_amount = money(subtotal * gst_rate / Decimal("100"))
    total_amount = money(subtotal + gst_amount)

    inv = Invoice(
        invoice_number=f"TRN-INV-{uuid4().hex[:8].upper()}",
        order_id=None,
        source_module=BUSINESS_CONTEXT,
        source_reference_id=booking.id,
        source_reference_number=booking.booking_number,
        customer_id=booking.customer_id,
        subtotal=subtotal,
        gst_rate=gst_rate,
        gst_amount=gst_amount,
        total_amount=total_amount,
        paid_amount=Decimal("0.00"),
        balance_due=total_amount,
        payment_status=PaymentStatus.PAID if total_amount == Decimal("0.00") else PaymentStatus.PENDING,
        notes=data.notes,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return _serialize_invoice(inv, db)


@router.post("/invoices/{invoice_id}/payments")
def record_payment(
    invoice_id: int,
    data: TransportPaymentCreate,
    current_user: User = Depends(require_transport_context),
    db: Session = Depends(get_db),
):
    inv = (
        db.query(Invoice)
        .filter(Invoice.id == invoice_id, Invoice.source_module == BUSINESS_CONTEXT)
        .with_for_update()
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Transport invoice not found.")

    sync_transport_invoice_financials(db, inv)
    pay_amount = money(data.amount)
    method_enum = PAYMENT_METHOD_ENUM_MAP.get(data.payment_method)
    if not method_enum:
        raise HTTPException(status_code=422, detail=f"Unsupported payment method '{data.payment_method}'.")

    if data.payment_type == "Refund":
        if pay_amount > money(inv.paid_amount):
            raise HTTPException(status_code=422, detail=f"Refund amount cannot exceed paid amount (INR {money(inv.paid_amount)}).")
    else:
        if inv.payment_status == PaymentStatus.PAID or money(inv.balance_due) <= Decimal("0.00"):
            raise HTTPException(status_code=409, detail="Invoice is already fully paid.")
        if pay_amount > money(inv.balance_due):
            raise HTTPException(status_code=422, detail=f"Amount exceeds remaining balance due (INR {money(inv.balance_due)}).")

    payment = Payment(
        invoice_id=inv.id,
        payment_method=method_enum,
        amount=pay_amount,
        status=PaymentStatus.PAID,
        reference_number=data.reference_number,
        paid_at=get_kolkata_now(),
        source_module=BUSINESS_CONTEXT,
        payment_type=data.payment_type,
        received_by=current_user.id,
    )
    db.add(payment)
    db.flush()
    sync_transport_invoice_financials(db, inv)
    db.commit()
    db.refresh(inv)
    return {"message": f"{data.payment_type} recorded.", "invoice": _serialize_invoice(inv, db)}


@router.get("/invoices/{invoice_id}/pdf")
def download_invoice_pdf(invoice_id: int, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.source_module == BUSINESS_CONTEXT).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Transport invoice not found.")
    pdf_path = generate_transport_invoice_pdf(db, inv)
    db.commit()
    return FileResponse(path=pdf_path, media_type="application/pdf", filename=f"{inv.invoice_number}.pdf")


# ==========================================
# 13. OPERATIONAL REPORTS & CSV EXPORT
# ==========================================

def _build_report_data(
    db: Session,
    *,
    report_type: str,
    date_from: datetime.date | None,
    date_to: datetime.date | None,
) -> tuple[list[dict], dict]:
    if report_type == "vehicle_utilization":
        vehicles = db.query(TransportVehicle).filter(TransportVehicle.is_deleted.is_(False)).all()
        rows = []
        for v in vehicles:
            q = db.query(TransportAssignment).filter(TransportAssignment.vehicle_id == v.id)
            if date_from:
                q = q.filter(TransportAssignment.scheduled_date >= date_from)
            if date_to:
                q = q.filter(TransportAssignment.scheduled_date <= date_to)
            assigns = q.all()
            completed = sum(1 for a in assigns if a.assignment_status == "Completed")
            active = sum(1 for a in assigns if a.assignment_status in ACTIVE_TRIP_STATUSES)
            rows.append(
                {
                    "vehicle_name": v.vehicle_name,
                    "registration_number": v.registration_number,
                    "status": v.status,
                    "total_trips": len(assigns),
                    "completed_trips": completed,
                    "active_trips": active,
                    "odometer_km": v.odometer_km,
                }
            )
        return rows, {"total_vehicles": len(rows), "total_trips": sum(r["total_trips"] for r in rows)}

    if report_type == "driver_utilization":
        drivers = db.query(TransportDriver).filter(TransportDriver.is_deleted.is_(False)).all()
        rows = []
        for d in drivers:
            q = db.query(TransportAssignment).filter(TransportAssignment.driver_id == d.id)
            if date_from:
                q = q.filter(TransportAssignment.scheduled_date >= date_from)
            if date_to:
                q = q.filter(TransportAssignment.scheduled_date <= date_to)
            assigns = q.all()
            rows.append(
                {
                    "driver_name": d.driver_name,
                    "phone": d.phone,
                    "availability_status": d.availability_status,
                    "total_trips": len(assigns),
                    "completed_trips": sum(1 for a in assigns if a.assignment_status == "Completed"),
                }
            )
        return rows, {"total_drivers": len(rows), "total_trips": sum(r["total_trips"] for r in rows)}

    if report_type in {"daily_trips", "monthly_trips", "pending_bookings", "cancelled_trips"}:
        q = (
            db.query(TransportBooking)
            .options(joinedload(TransportBooking.customer), joinedload(TransportBooking.vehicle), joinedload(TransportBooking.driver))
            .filter(TransportBooking.is_deleted.is_(False))
        )
        if date_from:
            q = q.filter(TransportBooking.pickup_date >= date_from)
        if date_to:
            q = q.filter(TransportBooking.pickup_date <= date_to)
        if report_type == "pending_bookings":
            q = q.filter(TransportBooking.status == TransportBookingStatus.PENDING.value)
        elif report_type == "cancelled_trips":
            q = q.filter(TransportBooking.status.in_([TransportBookingStatus.CANCELLED.value, TransportBookingStatus.NO_SHOW.value]))
        rows_db = q.order_by(TransportBooking.pickup_date.desc(), TransportBooking.pickup_time.desc()).all()
        rows = [
            {
                "booking_number": b.booking_number,
                "pickup_date": b.pickup_date.isoformat(),
                "pickup_time": _serialize_time(b.pickup_time),
                "booking_type": b.booking_type,
                "customer_name": b.customer.full_name if b.customer else "",
                "route": f"{b.pickup_location} -> {b.drop_location}",
                "vehicle": b.vehicle.registration_number if b.vehicle else "Unassigned",
                "driver": b.driver.driver_name if b.driver else "Unassigned",
                "total_amount": str(money(b.total_amount)),
                "status": b.status,
            }
            for b in rows_db
        ]
        return rows, {"total_records": len(rows), "total_value": str(sum((money(b.total_amount) for b in rows_db), Decimal("0.00")))}

    if report_type == "revenue":
        q = db.query(Invoice).filter(Invoice.source_module == BUSINESS_CONTEXT)
        if date_from:
            q = q.filter(func.date(Invoice.created_at) >= date_from)
        if date_to:
            q = q.filter(func.date(Invoice.created_at) <= date_to)
        invs = q.order_by(Invoice.created_at.desc()).all()
        rows = [
            {
                "invoice_number": i.invoice_number,
                "booking_number": i.source_reference_number,
                "subtotal": str(money(i.subtotal)),
                "gst_amount": str(money(i.gst_amount)),
                "total_amount": str(money(i.total_amount)),
                "paid_amount": str(money(i.paid_amount)),
                "balance_due": str(money(i.balance_due)),
                "payment_status": getattr(i.payment_status, "value", str(i.payment_status)),
            }
            for i in invs
        ]
        return rows, {
            "total_invoiced": str(sum((money(i.total_amount) for i in invs), Decimal("0.00"))),
            "total_collected": str(sum((money(i.paid_amount) for i in invs), Decimal("0.00"))),
            "total_outstanding": str(sum((money(i.balance_due) for i in invs), Decimal("0.00"))),
        }

    if report_type == "maintenance":
        q = db.query(TransportMaintenanceRecord).options(joinedload(TransportMaintenanceRecord.vehicle))
        if date_from:
            q = q.filter(TransportMaintenanceRecord.service_date >= date_from)
        if date_to:
            q = q.filter(TransportMaintenanceRecord.service_date <= date_to)
        recs = q.order_by(TransportMaintenanceRecord.service_date.desc()).all()
        rows = [
            {
                "vehicle": f"{m.vehicle.vehicle_name} ({m.vehicle.registration_number})" if m.vehicle else "",
                "maintenance_type": m.maintenance_type,
                "service_date": m.service_date.isoformat(),
                "service_provider": m.service_provider or "—",
                "cost": str(money(m.cost)),
                "status": m.status,
            }
            for m in recs
        ]
        return rows, {"total_records": len(rows), "total_cost": str(sum((money(m.cost) for m in recs), Decimal("0.00")))}

    # fuel_expenses
    q = db.query(TransportFuelRecord).options(joinedload(TransportFuelRecord.vehicle))
    if date_from:
        q = q.filter(TransportFuelRecord.record_date >= date_from)
    if date_to:
        q = q.filter(TransportFuelRecord.record_date <= date_to)
    exps = q.order_by(TransportFuelRecord.record_date.desc()).all()
    rows = [
        {
            "vehicle": f"{e.vehicle.vehicle_name} ({e.vehicle.registration_number})" if e.vehicle else "",
            "record_date": e.record_date.isoformat(),
            "expense_category": e.expense_category,
            "fuel_type": e.fuel_type or "—",
            "quantity": str(e.quantity) if e.quantity is not None else "—",
            "total_amount": str(money(e.total_amount)),
            "vendor_name": e.vendor_name or "—",
        }
        for e in exps
    ]
    return rows, {"total_records": len(rows), "total_expense": str(sum((money(e.total_amount) for e in exps), Decimal("0.00")))}


@router.get("/reports")
def get_reports(
    report_type: str = Query("daily_trips"),
    date_from: datetime.date | None = None,
    date_to: datetime.date | None = None,
    db: Session = Depends(get_db),
):
    rows, summary = _build_report_data(db, report_type=report_type, date_from=date_from, date_to=date_to)
    return {"report_type": report_type, "summary": summary, "items": rows}


@router.get("/reports/export")
def export_report_csv(
    report_type: str = Query("daily_trips"),
    date_from: datetime.date | None = None,
    date_to: datetime.date | None = None,
    db: Session = Depends(get_db),
):
    rows, _ = _build_report_data(db, report_type=report_type, date_from=date_from, date_to=date_to)
    output = io.StringIO()
    if rows:
        writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    else:
        output.write("No records found\n")
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=transport-{report_type}-report.csv"},
    )
