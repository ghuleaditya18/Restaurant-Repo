from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum as SQLAlchemyEnum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)

from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship,
)

from app.db.base import Base


# ==========================================
# COMMON TIMESTAMP MIXIN
# ==========================================

class TimestampMixin:

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )


# ==========================================
# ENUMS
# ==========================================

class UserRole(str, Enum):
    MANAGER = "manager"
    STAFF = "staff"


class OrderStatus(str, Enum):
    PENDING = "Pending"
    CONFIRMED = "Confirmed"
    PREPARING = "Preparing"
    READY = "Ready"
    SERVED = "Served"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"


class TableStatus(str, Enum):
    AVAILABLE = "Available"
    OCCUPIED = "Occupied"


class PaymentMethod(str, Enum):
    UPI = "UPI"
    NET_BANKING = "Net Banking"
    CARD = "Card"
    CASH = "Cash"


class PaymentStatus(str, Enum):
    PENDING = "Pending"
    PAID = "Paid"


# ==========================================
# ID GENERATORS
# ==========================================

def generate_order_number():
    return f"ORD-{uuid4().hex[:10].upper()}"


def generate_invoice_number():
    return f"INV-{uuid4().hex[:10].upper()}"


# ==========================================
# 1. USERS
# ==========================================

class User(TimestampMixin, Base):

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True
    )

    full_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )

    email: Mapped[str] = mapped_column(
        String(150),
        unique=True,
        index=True,
        nullable=False
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )

    role: Mapped[UserRole] = mapped_column(
        SQLAlchemyEnum(UserRole, native_enum=False),
        default=UserRole.STAFF,
        nullable=False
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )

    staff_profile: Mapped[Staff | None] = relationship(
        back_populates="user",
        uselist=False
    )

    created_orders: Mapped[list[Order]] = relationship(
        back_populates="created_by"
    )


# ==========================================
# 2. STAFF
# ==========================================

class Staff(TimestampMixin, Base):

    __tablename__ = "staff"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        unique=True,
        nullable=False
    )

    employee_code: Mapped[str] = mapped_column(
        String(30),
        unique=True,
        nullable=False
    )

    phone: Mapped[str] = mapped_column(
        String(15),
        nullable=False
    )

    designation: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )

    joining_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True
    )

    user: Mapped[User] = relationship(
        back_populates="staff_profile"
    )


# ==========================================
# 3. CUSTOMERS
# ==========================================

class Customer(TimestampMixin, Base):

    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True
    )

    full_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )

    phone: Mapped[str] = mapped_column(
        String(15),
        index=True,
        nullable=False
    )

    email: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True
    )

    address: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    orders: Mapped[list[Order]] = relationship(
        back_populates="customer"
    )


# ==========================================
# 4. RESTAURANT TABLES
# ==========================================

class RestaurantTable(TimestampMixin, Base):

    __tablename__ = "restaurant_tables"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True
    )

    table_number: Mapped[str] = mapped_column(
        String(20),
        unique=True,
        nullable=False
    )

    capacity: Mapped[int] = mapped_column(
        Integer,
        nullable=False
    )

    status: Mapped[TableStatus] = mapped_column(
        SQLAlchemyEnum(TableStatus, native_enum=False),
        default=TableStatus.AVAILABLE,
        nullable=False
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )

    orders: Mapped[list[Order]] = relationship(
        back_populates="table"
    )


# ==========================================
# 5. MENU CATEGORIES
# ==========================================

class MenuCategory(TimestampMixin, Base):

    __tablename__ = "menu_categories"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True
    )

    name: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )

    items: Mapped[list[MenuItem]] = relationship(
        back_populates="category"
    )


# ==========================================
# 6. MENU ITEMS
# ==========================================

class MenuItem(TimestampMixin, Base):

    __tablename__ = "menu_items"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True
    )

    category_id: Mapped[int] = mapped_column(
        ForeignKey("menu_categories.id", ondelete="RESTRICT"),
        nullable=False
    )

    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False
    )

    is_available: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )

    category: Mapped[MenuCategory] = relationship(
        back_populates="items"
    )

    order_items: Mapped[list[OrderItem]] = relationship(
        back_populates="menu_item"
    )


# ==========================================
# 7. ORDERS
# ==========================================

class Order(TimestampMixin, Base):

    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True
    )

    order_number: Mapped[str] = mapped_column(
        String(30),
        unique=True,
        default=generate_order_number,
        nullable=False
    )

    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False
    )

    table_id: Mapped[int] = mapped_column(
        ForeignKey("restaurant_tables.id", ondelete="RESTRICT"),
        nullable=False
    )

    created_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False
    )

    status: Mapped[OrderStatus] = mapped_column(
        SQLAlchemyEnum(OrderStatus, native_enum=False),
        default=OrderStatus.PENDING,
        nullable=False
    )

    special_instructions: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    customer: Mapped[Customer] = relationship(
        back_populates="orders"
    )

    table: Mapped[RestaurantTable] = relationship(
        back_populates="orders"
    )

    created_by: Mapped[User] = relationship(
        back_populates="created_orders"
    )

    items: Mapped[list[OrderItem]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan"
    )

    status_history: Mapped[list[OrderStatusHistory]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan"
    )

    invoice: Mapped[Invoice | None] = relationship(
        back_populates="order",
        uselist=False
    )


# ==========================================
# 8. ORDER ITEMS
# ==========================================

class OrderItem(Base):

    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True
    )

    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False
    )

    menu_item_id: Mapped[int] = mapped_column(
        ForeignKey("menu_items.id", ondelete="RESTRICT"),
        nullable=False
    )

    item_name: Mapped[str] = mapped_column(
        String(150),
        nullable=False
    )

    quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False
    )

    unit_price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False
    )

    line_total: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False
    )

    order: Mapped[Order] = relationship(
        back_populates="items"
    )

    menu_item: Mapped[MenuItem] = relationship(
        back_populates="order_items"
    )


# ==========================================
# 9. ORDER STATUS HISTORY
# ==========================================

class OrderStatusHistory(Base):

    __tablename__ = "order_status_history"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )

    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False
    )

    previous_status: Mapped[OrderStatus | None] = mapped_column(
        SQLAlchemyEnum(OrderStatus, native_enum=False),
        nullable=True
    )

    new_status: Mapped[OrderStatus] = mapped_column(
        SQLAlchemyEnum(OrderStatus, native_enum=False),
        nullable=False
    )

    changed_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False
    )

    note: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    order: Mapped[Order] = relationship(
        back_populates="status_history"
    )


# ==========================================
# 10. INVOICES
# ==========================================

class Invoice(TimestampMixin, Base):

    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True
    )

    invoice_number: Mapped[str] = mapped_column(
        String(30),
        unique=True,
        default=generate_invoice_number,
        nullable=False
    )

    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"),
        unique=True,
        nullable=False
    )

    subtotal: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False
    )

    gst_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        nullable=False
    )

    gst_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False
    )

    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False
    )

    payment_status: Mapped[PaymentStatus] = mapped_column(
        SQLAlchemyEnum(PaymentStatus, native_enum=False),
        default=PaymentStatus.PENDING,
        nullable=False
    )

    pdf_path: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True
    )

    order: Mapped[Order] = relationship(
        back_populates="invoice"
    )

    payments: Mapped[list[Payment]] = relationship(
        back_populates="invoice"
    )


# ==========================================
# 11. PAYMENTS
# ==========================================

class Payment(TimestampMixin, Base):

    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True
    )

    invoice_id: Mapped[int] = mapped_column(
        ForeignKey("invoices.id", ondelete="RESTRICT"),
        nullable=False
    )

    payment_method: Mapped[PaymentMethod] = mapped_column(
        SQLAlchemyEnum(PaymentMethod, native_enum=False),
        nullable=False
    )

    amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False
    )

    status: Mapped[PaymentStatus] = mapped_column(
        SQLAlchemyEnum(PaymentStatus, native_enum=False),
        default=PaymentStatus.PENDING,
        nullable=False
    )

    reference_number: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True
    )

    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    invoice: Mapped[Invoice] = relationship(
        back_populates="payments"
    )