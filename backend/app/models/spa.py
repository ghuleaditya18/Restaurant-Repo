from __future__ import annotations

from datetime import datetime, date, time
from decimal import Decimal
from enum import Enum
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    func,
)
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship,
)

from app.db.base import Base
from app.models.entities import TimestampMixin


# ==========================================
# SPA ENUMS
# ==========================================

class SpaBookingStatus(str, Enum):
    # Primary Three-Stage Operational Workflow
    BOOKED = "Booked"
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"
    # Preserved historical statuses for backward compatibility
    NO_SHOW = "No Show"
    PENDING = "Pending"
    CONFIRMED = "Confirmed"
    CHECKED_IN = "Checked In"


class SpaPaymentStatus(str, Enum):
    PENDING = "Pending"
    PARTIALLY_PAID = "Partially Paid"
    PAID = "Paid"


class SpaPaymentMethod(str, Enum):
    UPI = "UPI"
    CARD = "Card"
    NET_BANKING = "Net Banking"
    CASH = "Cash"


# ==========================================
# ID GENERATORS
# ==========================================

def generate_spa_booking_number() -> str:
    return f"SPA-BKG-{uuid4().hex[:8].upper()}"


def generate_spa_invoice_number() -> str:
    return f"SPA-INV-{uuid4().hex[:8].upper()}"


def generate_spa_payment_reference() -> str:
    return f"SPA-PAY-{uuid4().hex[:8].upper()}"


# ==========================================
# T1. SPA SERVICE CATEGORIES
# ==========================================

class SpaServiceCategory(TimestampMixin, Base):
    __tablename__ = "spa_service_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    services: Mapped[list[SpaService]] = relationship(
        "SpaService", back_populates="category", cascade="all, delete-orphan"
    )


# ==========================================
# T2. SPA SERVICES
# ==========================================

class SpaService(TimestampMixin, Base):
    __tablename__ = "spa_services"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("spa_service_categories.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    category: Mapped[SpaServiceCategory] = relationship("SpaServiceCategory", back_populates="services")


# ==========================================
# T3. SPA CUSTOMERS
# ==========================================

class SpaCustomer(TimestampMixin, Base):
    __tablename__ = "spa_customers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(150), nullable=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    bookings: Mapped[list[SpaBooking]] = relationship("SpaBooking", back_populates="customer")


# ==========================================
# T4. SPA STAFF
# ==========================================

class SpaStaff(TimestampMixin, Base):
    __tablename__ = "spa_staff"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    employee_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    designation: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    email: Mapped[str | None] = mapped_column(String(150), nullable=True)
    specialization: Mapped[str | None] = mapped_column(String(150), nullable=True)
    is_therapist: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    availabilities: Mapped[list[SpaStaffAvailability]] = relationship(
        "SpaStaffAvailability", back_populates="staff", cascade="all, delete-orphan"
    )
    bookings: Mapped[list[SpaBooking]] = relationship("SpaBooking", back_populates="therapist")


# ==========================================
# T5. SPA STAFF AVAILABILITY
# ==========================================

class SpaStaffAvailability(Base):
    __tablename__ = "spa_staff_availability"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    staff_id: Mapped[int] = mapped_column(
        ForeignKey("spa_staff.id", ondelete="CASCADE"), nullable=False, index=True
    )
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)  # 0=Monday, 6=Sunday
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    staff: Mapped[SpaStaff] = relationship("SpaStaff", back_populates="availabilities")


# ==========================================
# T6. SPA BOOKINGS
# ==========================================

class SpaBooking(TimestampMixin, Base):
    __tablename__ = "spa_bookings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    booking_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True, default=generate_spa_booking_number)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("spa_customers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    staff_id: Mapped[int] = mapped_column(
        ForeignKey("spa_staff.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    booking_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="Booked", nullable=False)
    estimated_total: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    customer: Mapped[SpaCustomer] = relationship("SpaCustomer", back_populates="bookings")
    therapist: Mapped[SpaStaff] = relationship("SpaStaff", back_populates="bookings")
    booking_services: Mapped[list[SpaBookingService]] = relationship(
        "SpaBookingService", back_populates="booking", cascade="all, delete-orphan"
    )
    status_history: Mapped[list[SpaBookingStatusHistory]] = relationship(
        "SpaBookingStatusHistory", back_populates="booking", cascade="all, delete-orphan", order_by="SpaBookingStatusHistory.changed_at.desc()"
    )
    invoice: Mapped[SpaInvoice | None] = relationship("SpaInvoice", back_populates="booking", uselist=False)


# ==========================================
# T7. SPA BOOKING SERVICES
# ==========================================

class SpaBookingService(Base):
    __tablename__ = "spa_booking_services"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("spa_bookings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    service_id: Mapped[int] = mapped_column(
        ForeignKey("spa_services.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    service_name: Mapped[str] = mapped_column(String(150), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    booking: Mapped[SpaBooking] = relationship("SpaBooking", back_populates="booking_services")
    service: Mapped[SpaService] = relationship("SpaService")


# ==========================================
# T8. SPA BOOKING STATUS HISTORY
# ==========================================

class SpaBookingStatusHistory(Base):
    __tablename__ = "spa_booking_status_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("spa_bookings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    previous_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    new_status: Mapped[str] = mapped_column(String(50), nullable=False)
    changed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    booking: Mapped[SpaBooking] = relationship("SpaBooking", back_populates="status_history")


# ==========================================
# T9. SPA INVOICES
# ==========================================

class SpaInvoice(TimestampMixin, Base):
    __tablename__ = "spa_invoices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    invoice_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True, default=generate_spa_invoice_number)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("spa_bookings.id", ondelete="RESTRICT"), unique=True, nullable=False, index=True
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("spa_customers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("18.00"), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    balance_due: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    payment_status: Mapped[str] = mapped_column(String(50), default="Pending", nullable=False)  # Pending, Partially Paid, Paid
    pdf_path: Mapped[str | None] = mapped_column(String(255), nullable=True)

    booking: Mapped[SpaBooking] = relationship("SpaBooking", back_populates="invoice")
    customer: Mapped[SpaCustomer] = relationship("SpaCustomer")
    items: Mapped[list[SpaInvoiceItem]] = relationship(
        "SpaInvoiceItem", back_populates="invoice", cascade="all, delete-orphan"
    )
    payments: Mapped[list[SpaPayment]] = relationship("SpaPayment", back_populates="invoice")


# ==========================================
# T10. SPA INVOICE ITEMS
# ==========================================

class SpaInvoiceItem(Base):
    __tablename__ = "spa_invoice_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    invoice_id: Mapped[int] = mapped_column(
        ForeignKey("spa_invoices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    booking_service_id: Mapped[int | None] = mapped_column(
        ForeignKey("spa_booking_services.id", ondelete="SET NULL"), nullable=True
    )
    service_name: Mapped[str] = mapped_column(String(150), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    invoice: Mapped[SpaInvoice] = relationship("SpaInvoice", back_populates="items")
    booking_service: Mapped[SpaBookingService | None] = relationship("SpaBookingService")


# ==========================================
# T11. SPA PAYMENTS
# ==========================================

class SpaPayment(Base):
    __tablename__ = "spa_payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    invoice_id: Mapped[int] = mapped_column(
        ForeignKey("spa_invoices.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    payment_reference: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True, default=generate_spa_payment_reference
    )
    payment_method: Mapped[str] = mapped_column(String(50), nullable=False)  # UPI, Card, Net Banking, Cash
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    payment_status: Mapped[str] = mapped_column(String(50), default="Paid", nullable=False)
    transaction_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    received_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    paid_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    invoice: Mapped[SpaInvoice] = relationship("SpaInvoice", back_populates="payments")
    receiver = relationship("User")
