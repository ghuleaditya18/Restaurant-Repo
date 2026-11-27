from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.entities import TimestampMixin


class PackageCategory(str, Enum):
    COUPLE = "Couple"
    FAMILY = "Family"
    WEEKEND = "Weekend"
    WELLNESS = "Wellness"
    ADVENTURE = "Adventure"
    EVENT = "Event"
    SEASONAL = "Seasonal"


class PackageStatus(str, Enum):
    DRAFT = "Draft"
    PUBLISHED = "Published"
    UPCOMING = "Upcoming"
    AVAILABLE = "Available"
    PAUSED = "Paused"
    EXPIRED = "Expired"
    ARCHIVED = "Archived"


class PackagePricingType(str, Enum):
    PER_PACKAGE = "Per Package"
    PER_PERSON = "Per Person"
    PER_NIGHT = "Per Night"


class PackageInclusionType(str, Enum):
    UNIT_STAY = "Unit Stay"
    MEAL_PLAN = "Meal Plan"
    SPA_SERVICE = "Spa Service"
    ACTIVITY = "Activity"
    TRANSPORT_SERVICE = "Transport Service"
    AMENITY = "Amenity"
    OTHER = "Other"


class PackageBookingStatus(str, Enum):
    PENDING = "Pending"
    CONFIRMED = "Confirmed"
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"


# ==========================================
# 1. PACKAGES
# ==========================================

class Package(TimestampMixin, Base):
    __tablename__ = "packages"
    __table_args__ = (
        UniqueConstraint("business_context", "package_code", name="uq_packages_context_code"),
        CheckConstraint("duration_nights >= 1", name="ck_packages_duration_positive"),
        CheckConstraint("min_guests >= 1", name="ck_packages_min_guests_positive"),
        CheckConstraint("max_guests >= min_guests", name="ck_packages_guest_range_valid"),
        CheckConstraint("price > 0", name="ck_packages_price_positive"),
        CheckConstraint("valid_to >= valid_from", name="ck_packages_validity_range_valid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    business_context: Mapped[str] = mapped_column(
        String(50),
        default="PACKAGE",
        server_default="PACKAGE",
        index=True,
        nullable=False,
    )
    package_code: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), index=True, nullable=False)
    category: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    duration_nights: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    min_guests: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    max_guests: Mapped[int] = mapped_column(Integer, default=2, nullable=False)

    pricing_type: Mapped[str] = mapped_column(
        String(30), default=PackagePricingType.PER_PACKAGE.value, nullable=False
    )
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    valid_from: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    valid_to: Mapped[date] = mapped_column(Date, index=True, nullable=False)

    applicable_accommodation_types: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_customizable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_seasonal_offer: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    offer_badge: Mapped[str | None] = mapped_column(String(60), nullable=True)
    terms_and_conditions: Mapped[str | None] = mapped_column(Text, nullable=True)
    exclusions: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        String(30), default=PackageStatus.DRAFT.value, index=True, nullable=False
    )
    cover_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    items: Mapped[list[PackageItem]] = relationship(
        "PackageItem",
        back_populates="package",
        cascade="all, delete-orphan",
        order_by="PackageItem.sort_order.asc(), PackageItem.id.asc()",
    )
    media: Mapped[list[PackageMedia]] = relationship(
        "PackageMedia",
        back_populates="package",
        cascade="all, delete-orphan",
        order_by="PackageMedia.sort_order.asc(), PackageMedia.id.asc()",
    )
    blackouts: Mapped[list[PackageBlackout]] = relationship(
        "PackageBlackout",
        back_populates="package",
        cascade="all, delete-orphan",
        order_by="PackageBlackout.start_date.asc(), PackageBlackout.id.asc()",
    )
    bookings: Mapped[list[PackageBooking]] = relationship(
        "PackageBooking", back_populates="package"
    )
    creator = relationship("User")


# ==========================================
# 2. PACKAGE ITEMS (INCLUSIONS)
# ==========================================

class PackageItem(TimestampMixin, Base):
    __tablename__ = "package_items"
    __table_args__ = (
        CheckConstraint("quantity >= 1", name="ck_package_items_qty_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    package_id: Mapped[int] = mapped_column(
        ForeignKey("packages.id", ondelete="CASCADE"), index=True, nullable=False
    )
    inclusion_type: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_optional: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    reference_module: Mapped[str | None] = mapped_column(String(40), nullable=True)
    reference_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reference_label: Mapped[str | None] = mapped_column(String(150), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    package: Mapped[Package] = relationship("Package", back_populates="items")


# ==========================================
# 3. PACKAGE MEDIA
# ==========================================

class PackageMedia(TimestampMixin, Base):
    __tablename__ = "package_media"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    package_id: Mapped[int] = mapped_column(
        ForeignKey("packages.id", ondelete="CASCADE"), index=True, nullable=False
    )
    media_type: Mapped[str] = mapped_column(String(20), default="gallery", nullable=False)
    image_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    caption: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    package: Mapped[Package] = relationship("Package", back_populates="media")


# ==========================================
# 4. PACKAGE BLACKOUTS
# ==========================================

class PackageBlackout(TimestampMixin, Base):
    __tablename__ = "package_blackouts"
    __table_args__ = (
        CheckConstraint("end_date >= start_date", name="ck_package_blackouts_dates_valid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    package_id: Mapped[int] = mapped_column(
        ForeignKey("packages.id", ondelete="CASCADE"), index=True, nullable=False
    )
    start_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    package: Mapped[Package] = relationship("Package", back_populates="blackouts")
    creator = relationship("User")


# ==========================================
# 5. PACKAGE BOOKINGS
# ==========================================

class PackageBooking(TimestampMixin, Base):
    __tablename__ = "package_bookings"
    __table_args__ = (
        CheckConstraint("guest_count >= 1", name="ck_package_bookings_guests_positive"),
        CheckConstraint("duration_nights_snapshot >= 1", name="ck_package_bookings_duration_positive"),
        CheckConstraint("unit_price_snapshot > 0", name="ck_package_bookings_unit_price_positive"),
        CheckConstraint("total_amount > 0", name="ck_package_bookings_total_positive"),
        CheckConstraint("end_date >= start_date", name="ck_package_bookings_dates_valid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    business_context: Mapped[str] = mapped_column(
        String(50), default="PACKAGE", server_default="PACKAGE", index=True, nullable=False
    )
    booking_number: Mapped[str] = mapped_column(String(30), unique=True, index=True, nullable=False)
    package_id: Mapped[int] = mapped_column(
        ForeignKey("packages.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), index=True, nullable=False
    )

    booking_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    guest_count: Mapped[int] = mapped_column(Integer, nullable=False)

    # Immutable sale-time snapshot fields
    package_name_snapshot: Mapped[str] = mapped_column(String(150), nullable=False)
    package_code_snapshot: Mapped[str] = mapped_column(String(50), nullable=False)
    package_category_snapshot: Mapped[str] = mapped_column(String(50), nullable=False)
    pricing_type_snapshot: Mapped[str] = mapped_column(String(30), nullable=False)
    unit_price_snapshot: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    duration_nights_snapshot: Mapped[int] = mapped_column(Integer, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    terms_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    exclusions_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        String(30), default=PackageBookingStatus.PENDING.value, index=True, nullable=False
    )
    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_identifier: Mapped[str] = mapped_column(
        String(50), default="PACKAGE_BOOKING", server_default="PACKAGE_BOOKING", nullable=False
    )

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    package: Mapped[Package] = relationship("Package", back_populates="bookings")
    customer = relationship("Customer")
    creator = relationship("User")
    items: Mapped[list[PackageBookingItem]] = relationship(
        "PackageBookingItem",
        back_populates="booking",
        cascade="all, delete-orphan",
        order_by="PackageBookingItem.id.asc()",
    )
    history: Mapped[list[PackageBookingHistory]] = relationship(
        "PackageBookingHistory",
        back_populates="booking",
        cascade="all, delete-orphan",
        order_by="PackageBookingHistory.changed_at.desc(), PackageBookingHistory.id.desc()",
    )
    invoice = relationship(
        "Invoice",
        foreign_keys="[Invoice.package_booking_id]",
        uselist=False,
    )


# ==========================================
# 6. PACKAGE BOOKING ITEMS (SNAPSHOT)
# ==========================================

class PackageBookingItem(Base):
    __tablename__ = "package_booking_items"
    __table_args__ = (
        CheckConstraint("quantity >= 1", name="ck_package_booking_items_qty_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("package_bookings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    package_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("package_items.id", ondelete="SET NULL"), nullable=True
    )
    inclusion_type: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_optional: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_selected: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    reference_module: Mapped[str | None] = mapped_column(String(40), nullable=True)
    reference_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reference_label: Mapped[str | None] = mapped_column(String(150), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    billing_source: Mapped[str] = mapped_column(
        String(40), default="PACKAGE", server_default="PACKAGE", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    booking: Mapped[PackageBooking] = relationship("PackageBooking", back_populates="items")


# ==========================================
# 7. PACKAGE BOOKING HISTORY
# ==========================================

class PackageBookingHistory(Base):
    __tablename__ = "package_booking_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("package_bookings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    action: Mapped[str] = mapped_column(String(50), default="STATUS_CHANGE", nullable=False)
    previous_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    new_status: Mapped[str] = mapped_column(String(30), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    booking: Mapped[PackageBooking] = relationship("PackageBooking", back_populates="history")
    changed_by_user = relationship("User")
