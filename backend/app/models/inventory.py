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
    UniqueConstraint,
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
# INVENTORY ENUMS
# ==========================================

class BaseUnit(str, Enum):
    G = "g"
    KG = "kg"
    ML = "ml"
    L = "L"
    PCS = "pcs"
    PACK = "pack"


class POStatus(str, Enum):
    DRAFT = "Draft"
    ORDERED = "Ordered"
    PARTIALLY_RECEIVED = "Partially Received"
    RECEIVED = "Received"
    CANCELLED = "Cancelled"


class MovementType(str, Enum):
    OPENING_STOCK = "OPENING_STOCK"
    PURCHASE = "PURCHASE"
    SALE_CONSUMPTION = "SALE_CONSUMPTION"
    WASTAGE = "WASTAGE"
    ADJUSTMENT = "ADJUSTMENT"
    RETURN = "RETURN"
    CONSUMPTION_REVERSAL = "CONSUMPTION_REVERSAL"


class StockCountStatus(str, Enum):
    DRAFT = "Draft"
    SUBMITTED = "Submitted"
    APPROVED = "Approved"
    CANCELLED = "Cancelled"


class WastageReason(str, Enum):
    SPOILAGE = "SPOILAGE"
    EXPIRY = "EXPIRY"
    SPILLAGE = "SPILLAGE"
    STAFF_MEAL = "STAFF_MEAL"
    DAMAGE = "DAMAGE"
    OTHER = "OTHER"


# ==========================================
# NUMBER GENERATORS
# ==========================================

def generate_po_number() -> str:
    return f"PO-{uuid4().hex[:8].upper()}"


def generate_grn_number() -> str:
    return f"GRN-{uuid4().hex[:8].upper()}"


def generate_count_number() -> str:
    return f"STK-{uuid4().hex[:8].upper()}"


# ==========================================
# 1. INVENTORY CATEGORIES
# ==========================================

class InventoryCategory(TimestampMixin, Base):
    __tablename__ = "inventory_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    items: Mapped[list[InventoryItem]] = relationship(
        "InventoryItem", back_populates="category"
    )


# ==========================================
# 2. INVENTORY ITEMS (MASTER)
# ==========================================

class InventoryItem(TimestampMixin, Base):
    __tablename__ = "inventory_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_categories.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False, index=True)
    sku: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True, index=True)
    base_unit: Mapped[str] = mapped_column(String(20), nullable=False)  # g, ml, pcs, etc.
    current_stock: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), default=Decimal("0.0000"), nullable=False
    )
    reorder_level: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), default=Decimal("0.0000"), nullable=False
    )
    average_cost: Mapped[Decimal] = mapped_column(
        Numeric(12, 4), default=Decimal("0.0000"), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    created_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    category: Mapped[InventoryCategory] = relationship("InventoryCategory", back_populates="items")
    supplier_links: Mapped[list[SupplierItem]] = relationship(
        "SupplierItem", back_populates="inventory_item", cascade="all, delete-orphan"
    )
    recipe_links: Mapped[list[RecipeItem]] = relationship(
        "RecipeItem", back_populates="inventory_item"
    )
    movements: Mapped[list[StockMovement]] = relationship(
        "StockMovement", back_populates="inventory_item"
    )
    count_items: Mapped[list[StockCountItem]] = relationship(
        "StockCountItem", back_populates="inventory_item"
    )


# ==========================================
# 3. SUPPLIERS
# ==========================================

class Supplier(TimestampMixin, Base):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False, index=True)
    contact_person: Mapped[str | None] = mapped_column(String(100), nullable=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    email: Mapped[str | None] = mapped_column(String(150), nullable=True)
    gstin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    supplier_items: Mapped[list[SupplierItem]] = relationship(
        "SupplierItem", back_populates="supplier", cascade="all, delete-orphan"
    )
    purchase_orders: Mapped[list[PurchaseOrder]] = relationship(
        "PurchaseOrder", back_populates="supplier"
    )


# ==========================================
# 4. SUPPLIER ITEMS (ASSOCIATION)
# ==========================================

class SupplierItem(Base):
    __tablename__ = "supplier_items"
    __table_args__ = (
        UniqueConstraint("supplier_id", "inventory_item_id", name="uq_supplier_item"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    supplier_id: Mapped[int] = mapped_column(
        ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    inventory_item_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    supplier_sku: Mapped[str | None] = mapped_column(String(50), nullable=True)
    last_purchase_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    lead_time_days: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_preferred: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    supplier: Mapped[Supplier] = relationship("Supplier", back_populates="supplier_items")
    inventory_item: Mapped[InventoryItem] = relationship(
        "InventoryItem", back_populates="supplier_links"
    )


# ==========================================
# 5. RECIPES (BILL OF MATERIALS)
# ==========================================

class Recipe(TimestampMixin, Base):
    __tablename__ = "recipes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    menu_item_id: Mapped[int] = mapped_column(
        ForeignKey("menu_items.id", ondelete="RESTRICT"), unique=True, nullable=False, index=True
    )
    yield_servings: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    preparation_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    menu_item: Mapped[MenuItem] = relationship("MenuItem")
    items: Mapped[list[RecipeItem]] = relationship(
        "RecipeItem", back_populates="recipe", cascade="all, delete-orphan"
    )


# ==========================================
# 6. RECIPE ITEMS
# ==========================================

class RecipeItem(Base):
    __tablename__ = "recipe_items"
    __table_args__ = (
        UniqueConstraint("recipe_id", "inventory_item_id", name="uq_recipe_inventory_item"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    recipe_id: Mapped[int] = mapped_column(
        ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    inventory_item_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)

    recipe: Mapped[Recipe] = relationship("Recipe", back_populates="items")
    inventory_item: Mapped[InventoryItem] = relationship(
        "InventoryItem", back_populates="recipe_links"
    )


# ==========================================
# 7. PURCHASE ORDERS
# ==========================================

class PurchaseOrder(TimestampMixin, Base):
    __tablename__ = "purchase_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    po_number: Mapped[str] = mapped_column(
        String(30), unique=True, default=generate_po_number, nullable=False, index=True
    )
    supplier_id: Mapped[int] = mapped_column(
        ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    order_date: Mapped[date] = mapped_column(Date, nullable=False)
    expected_delivery_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    subtotal: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0.00"), nullable=False
    )
    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0.00"), nullable=False
    )
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0.00"), nullable=False
    )
    status: Mapped[POStatus] = mapped_column(
        SQLAlchemyEnum(POStatus, native_enum=False), default=POStatus.DRAFT, nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    archive_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    supplier: Mapped[Supplier] = relationship("Supplier", back_populates="purchase_orders")
    items: Mapped[list[PurchaseOrderItem]] = relationship(
        "PurchaseOrderItem", back_populates="purchase_order", cascade="all, delete-orphan"
    )
    goods_receipts: Mapped[list[GoodsReceipt]] = relationship(
        "GoodsReceipt", back_populates="purchase_order"
    )


# ==========================================
# 8. PURCHASE ORDER ITEMS
# ==========================================

class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    po_id: Mapped[int] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    inventory_item_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    ordered_quantity: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    received_quantity: Mapped[Decimal] = mapped_column(
        Numeric(12, 4), default=Decimal("0.0000"), nullable=False
    )
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    purchase_order: Mapped[PurchaseOrder] = relationship("PurchaseOrder", back_populates="items")
    inventory_item: Mapped[InventoryItem] = relationship("InventoryItem")


# ==========================================
# 9. GOODS RECEIPTS (GRN)
# ==========================================

class GoodsReceipt(Base):
    __tablename__ = "goods_receipts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    grn_number: Mapped[str] = mapped_column(
        String(30), unique=True, default=generate_grn_number, nullable=False, index=True
    )
    po_id: Mapped[int] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    supplier_bill_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    bill_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    bill_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    received_date: Mapped[date] = mapped_column(Date, nullable=False)
    total_received_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_reversed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    reversed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reversed_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reversal_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    received_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    purchase_order: Mapped[PurchaseOrder] = relationship(
        "PurchaseOrder", back_populates="goods_receipts"
    )
    items: Mapped[list[GoodsReceiptItem]] = relationship(
        "GoodsReceiptItem", back_populates="goods_receipt", cascade="all, delete-orphan"
    )


# ==========================================
# 10. GOODS RECEIPT ITEMS
# ==========================================

class GoodsReceiptItem(Base):
    __tablename__ = "goods_receipt_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    goods_receipt_id: Mapped[int] = mapped_column(
        ForeignKey("goods_receipts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    po_item_id: Mapped[int] = mapped_column(
        ForeignKey("purchase_order_items.id", ondelete="RESTRICT"), nullable=False
    )
    inventory_item_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    received_quantity: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    goods_receipt: Mapped[GoodsReceipt] = relationship("GoodsReceipt", back_populates="items")
    po_item: Mapped[PurchaseOrderItem] = relationship("PurchaseOrderItem")
    inventory_item: Mapped[InventoryItem] = relationship("InventoryItem")


# ==========================================
# 11. STOCK MOVEMENTS (IMMUTABLE LEDGER)
# ==========================================

class StockMovement(Base):
    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    inventory_item_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    movement_type: Mapped[MovementType] = mapped_column(
        SQLAlchemyEnum(MovementType, native_enum=False), nullable=False, index=True
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    reference_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # ORDER, PO, GRN, WASTAGE, ADJUSTMENT, STOCK_COUNT
    reference_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    archive_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    inventory_item: Mapped[InventoryItem] = relationship(
        "InventoryItem", back_populates="movements"
    )


# ==========================================
# 12. STOCK COUNTS (PHYSICAL AUDIT)
# ==========================================

class StockCount(TimestampMixin, Base):
    __tablename__ = "stock_counts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    count_number: Mapped[str] = mapped_column(
        String(30), unique=True, default=generate_count_number, nullable=False, index=True
    )
    count_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[StockCountStatus] = mapped_column(
        SQLAlchemyEnum(StockCountStatus, native_enum=False),
        default=StockCountStatus.DRAFT,
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    conducted_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    approved_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    items: Mapped[list[StockCountItem]] = relationship(
        "StockCountItem", back_populates="stock_count", cascade="all, delete-orphan"
    )


# ==========================================
# 13. STOCK COUNT ITEMS
# ==========================================

class StockCountItem(Base):
    __tablename__ = "stock_count_items"
    __table_args__ = (
        UniqueConstraint("stock_count_id", "inventory_item_id", name="uq_count_inventory_item"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    stock_count_id: Mapped[int] = mapped_column(
        ForeignKey("stock_counts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    inventory_item_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    system_quantity: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    counted_quantity: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    variance_quantity: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    variance_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    stock_count: Mapped[StockCount] = relationship("StockCount", back_populates="items")
    inventory_item: Mapped[InventoryItem] = relationship(
        "InventoryItem", back_populates="count_items"
    )
