from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from uuid import uuid4

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.entities import TimestampMixin


def villa_reference(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:8].upper()}"


class StayStatus(str, Enum):
    RESERVED = "Reserved"
    CONFIRMED = "Confirmed"
    CHECKED_IN = "Checked In"
    CHECKED_OUT = "Checked Out"
    CANCELLED = "Cancelled"
    NO_SHOW = "No Show"


class VillaPropertySettings(TimestampMixin, Base):
    __tablename__ = "villa_property_settings"
    __table_args__ = (
        CheckConstraint("late_checkout_grace_minutes >= 0", name="ck_villa_settings_grace_nonneg"),
        CheckConstraint(
            "default_late_checkout_fee IS NULL OR default_late_checkout_fee >= 0",
            name="ck_villa_settings_fee_nonneg",
        ),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    default_check_in_time: Mapped[str] = mapped_column(String(5), default="14:00", nullable=False)
    default_check_out_time: Mapped[str] = mapped_column(String(5), default="11:00", nullable=False)
    late_checkout_grace_minutes: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    default_late_checkout_fee: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)


class Villa(TimestampMixin, Base):
    __tablename__ = "villas"
    __table_args__ = (
        CheckConstraint("late_checkout_fee IS NULL OR late_checkout_fee >= 0", name="ck_villas_late_fee_nonneg"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    address: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))
    check_in_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    check_out_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    late_checkout_fee: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    units: Mapped[list[Unit]] = relationship(back_populates="villa")


class UnitCategory(TimestampMixin, Base):
    __tablename__ = "villa_unit_categories"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Unit(TimestampMixin, Base):
    __tablename__ = "villa_units"
    __table_args__ = (
        UniqueConstraint("villa_id", "name", name="uq_villa_units_villa_name"),
        CheckConstraint("capacity > 0", name="ck_villa_units_capacity_positive"),
        CheckConstraint("base_rate > 0", name="ck_villa_units_rate_positive"),
        CheckConstraint("late_checkout_fee IS NULL OR late_checkout_fee >= 0", name="ck_villa_units_late_fee_nonneg"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    villa_id: Mapped[int] = mapped_column(ForeignKey("villas.id", ondelete="RESTRICT"), index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("villa_unit_categories.id", ondelete="RESTRICT"), index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    bedrooms: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    base_rate: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))
    check_in_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    check_out_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    late_checkout_fee: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    housekeeping_status: Mapped[str] = mapped_column(String(30), default="Ready", nullable=False)
    villa: Mapped[Villa] = relationship(back_populates="units")
    category: Mapped[UnitCategory] = relationship()


class SeasonalRate(TimestampMixin, Base):
    __tablename__ = "villa_seasonal_rates"
    __table_args__ = (
        CheckConstraint("end_date > start_date", name="ck_villa_rates_dates_ordered"),
        CheckConstraint("nightly_rate > 0", name="ck_villa_rates_amount_positive"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("villa_units.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    nightly_rate: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    unit: Mapped[Unit] = relationship()


class UnitBlock(TimestampMixin, Base):
    __tablename__ = "villa_unit_blocks"
    __table_args__ = (CheckConstraint("end_date > start_date", name="ck_villa_blocks_dates_ordered"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("villa_units.id", ondelete="CASCADE"), index=True)
    block_type: Mapped[str] = mapped_column(String(30), default="Maintenance", nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    unit: Mapped[Unit] = relationship()


class VillaGuest(TimestampMixin, Base):
    __tablename__ = "villa_guests"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    guest_reference: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, default=lambda: villa_reference("V-GST"))
    full_name: Mapped[str] = mapped_column(String(150), index=True, nullable=False)
    phone: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(150), index=True)
    address: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(String(100))
    state: Mapped[str | None] = mapped_column(String(100))
    country: Mapped[str | None] = mapped_column(String(100), default="India")
    notes: Mapped[str | None] = mapped_column(Text)
    preferences: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    bookings: Mapped[list[StayBooking]] = relationship("StayBooking", back_populates="guest")


class StayBooking(TimestampMixin, Base):
    __tablename__ = "villa_stay_bookings"
    __table_args__ = (
        CheckConstraint("check_out > check_in", name="ck_villa_bookings_dates_ordered"),
        CheckConstraint("guests > 0", name="ck_villa_bookings_guests_positive"),
        CheckConstraint("nightly_rate > 0 AND total_amount > 0", name="ck_villa_bookings_amount_positive"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    booking_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, default=lambda: villa_reference("STAY"))
    unit_id: Mapped[int] = mapped_column(ForeignKey("villa_units.id", ondelete="RESTRICT"), index=True)
    guest_id: Mapped[int | None] = mapped_column(ForeignKey("villa_guests.id", ondelete="RESTRICT"), index=True, nullable=True)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), index=True, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    check_in: Mapped[date] = mapped_column(Date, nullable=False)
    check_out: Mapped[date] = mapped_column(Date, nullable=False)
    guests: Mapped[int] = mapped_column(Integer, nullable=False)
    nightly_rate: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default=StayStatus.RESERVED.value, nullable=False)
    actual_check_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_check_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text)
    unit: Mapped[Unit] = relationship()
    guest: Mapped[VillaGuest | None] = relationship("VillaGuest", back_populates="bookings")
    customer = relationship("Customer")
    invoice = relationship("VillaInvoice", back_populates="booking", uselist=False)
    status_history: Mapped[list[VillaBookingStatusHistory]] = relationship(
        "VillaBookingStatusHistory",
        back_populates="booking",
        cascade="all, delete-orphan",
        order_by="VillaBookingStatusHistory.changed_at.desc(), VillaBookingStatusHistory.id.desc()",
    )


class VillaBookingStatusHistory(Base):
    __tablename__ = "villa_booking_status_history"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("villa_stay_bookings.id", ondelete="CASCADE"), index=True, nullable=False)
    previous_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    new_status: Mapped[str] = mapped_column(String(30), nullable=False)
    changed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    booking = relationship("StayBooking", back_populates="status_history")
    changed_by_user = relationship("User")


class VillaService(TimestampMixin, Base):
    __tablename__ = "villa_services"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ServiceRequest(TimestampMixin, Base):
    __tablename__ = "villa_service_requests"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("villa_stay_bookings.id", ondelete="CASCADE"), index=True)
    service_id: Mapped[int] = mapped_column(ForeignKey("villa_services.id", ondelete="RESTRICT"))
    staff_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id", ondelete="SET NULL"))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(30), default="Requested", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    booking = relationship("StayBooking")
    service = relationship("VillaService")
    staff = relationship("Staff")


class VillaInvoice(TimestampMixin, Base):
    __tablename__ = "villa_invoices"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    invoice_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, default=lambda: villa_reference("V-INV"))
    booking_id: Mapped[int] = mapped_column(ForeignKey("villa_stay_bookings.id", ondelete="RESTRICT"), unique=True, index=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("18.00"), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    payment_status: Mapped[str] = mapped_column(String(30), default="Pending", nullable=False)
    is_finalized: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    booking = relationship("StayBooking", back_populates="invoice")
    items: Mapped[list[VillaInvoiceItem]] = relationship(
        "VillaInvoiceItem",
        back_populates="invoice",
        cascade="all, delete-orphan",
        order_by="VillaInvoiceItem.id.asc()",
    )
    payments: Mapped[list[VillaPayment]] = relationship(
        "VillaPayment",
        back_populates="invoice",
        order_by="VillaPayment.id.asc()",
    )
    reversals: Mapped[list[VillaPaymentReversal]] = relationship(
        "VillaPaymentReversal",
        back_populates="invoice",
        order_by="VillaPaymentReversal.id.asc()",
    )


class VillaInvoiceItem(Base):
    __tablename__ = "villa_invoice_items"
    __table_args__ = (
        UniqueConstraint("invoice_id", "service_request_id", name="uq_villa_invoice_items_invoice_service_req"),
        Index(
            "uq_villa_invoice_items_late_checkout",
            "invoice_id",
            unique=True,
            sqlite_where=text("item_type = 'LATE_CHECKOUT'"),
            postgresql_where=text("item_type = 'LATE_CHECKOUT'"),
        ),
        CheckConstraint("quantity > 0", name="ck_villa_invoice_items_qty_positive"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("villa_invoices.id", ondelete="CASCADE"), index=True, nullable=False)
    item_type: Mapped[str] = mapped_column(String(30), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    booking_id: Mapped[int | None] = mapped_column(ForeignKey("villa_stay_bookings.id", ondelete="SET NULL"), index=True, nullable=True)
    service_request_id: Mapped[int | None] = mapped_column(ForeignKey("villa_service_requests.id", ondelete="SET NULL"), index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    invoice = relationship("VillaInvoice", back_populates="items")
    service_request = relationship("ServiceRequest")


class VillaPayment(TimestampMixin, Base):
    __tablename__ = "villa_payments"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_villa_payments_amount_positive"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("villa_invoices.id", ondelete="RESTRICT"), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    method: Mapped[str] = mapped_column(String(30), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(100))
    received_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    invoice = relationship("VillaInvoice", back_populates="payments")
    receiver = relationship("User")
    reversals: Mapped[list[VillaPaymentReversal]] = relationship(
        "VillaPaymentReversal",
        back_populates="payment",
        order_by="VillaPaymentReversal.id.asc()",
    )


class VillaPaymentReversal(TimestampMixin, Base):
    __tablename__ = "villa_payment_reversals"
    __table_args__ = (CheckConstraint("refund_amount > 0", name="ck_villa_payment_reversals_amount_positive"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    payment_id: Mapped[int] = mapped_column(ForeignKey("villa_payments.id", ondelete="RESTRICT"), index=True, nullable=False)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("villa_invoices.id", ondelete="RESTRICT"), index=True, nullable=False)
    refund_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    refund_method: Mapped[str] = mapped_column(String(30), nullable=False)
    refund_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    reversal_status: Mapped[str] = mapped_column(String(30), default="Refunded", nullable=False)
    recorded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    payment = relationship("VillaPayment", back_populates="reversals")
    invoice = relationship("VillaInvoice", back_populates="reversals")
    recorder = relationship("User")
