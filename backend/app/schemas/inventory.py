from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from app.models.inventory import (
    BaseUnit,
    MovementType,
    POStatus,
    StockCountStatus,
    WastageReason,
)


# ==========================================
# COMMON STRING VALIDATION HELPERS
# ==========================================

def clean_required_str(value: str, field_name: str) -> str:
    trimmed = value.strip()
    if not trimmed:
        raise ValueError(f"{field_name} cannot be empty.")
    if trimmed.lower() in {"string", "null", "none", "test", "example"}:
        raise ValueError(f"Please provide a valid {field_name.lower()}.")
    return trimmed


def clean_optional_str(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed if trimmed else None


# ==========================================
# 1. INVENTORY CATEGORY SCHEMAS
# ==========================================

class InventoryCategoryCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return clean_required_str(v, "Category name")

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: str | None) -> str | None:
        return clean_optional_str(v)


class InventoryCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        return clean_required_str(v, "Category name") if v is not None else None

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: str | None) -> str | None:
        return clean_optional_str(v)

    @model_validator(mode="after")
    def check_at_least_one(self) -> InventoryCategoryUpdate:
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update.")
        return self


class InventoryCategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    items_count: int = 0


# ==========================================
# 2. INVENTORY ITEM SCHEMAS
# ==========================================

class InventoryItemCreate(BaseModel):
    category_id: int = Field(..., gt=0)
    name: str = Field(..., min_length=2, max_length=150)
    sku: str | None = Field(default=None, max_length=50)
    base_unit: str = Field(..., min_length=1, max_length=20)
    reorder_level: Decimal = Field(default=Decimal("0.0000"), ge=0)
    opening_stock: Decimal = Field(default=Decimal("0.0000"), ge=0)
    opening_unit_cost: Decimal = Field(default=Decimal("0.0000"), ge=0)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return clean_required_str(v, "Item name")

    @field_validator("sku")
    @classmethod
    def validate_sku(cls, v: str | None) -> str | None:
        return clean_optional_str(v)

    @field_validator("base_unit")
    @classmethod
    def validate_unit(cls, v: str) -> str:
        trimmed = clean_required_str(v, "Base unit")
        allowed = {u.value for u in BaseUnit}
        if trimmed not in allowed:
            raise ValueError(f"Base unit must be one of: {', '.join(sorted(allowed))}")
        return trimmed


class InventoryItemUpdate(BaseModel):
    category_id: int | None = Field(default=None, gt=0)
    name: str | None = Field(default=None, min_length=2, max_length=150)
    sku: str | None = Field(default=None, max_length=50)
    base_unit: str | None = Field(default=None, min_length=1, max_length=20)
    reorder_level: Decimal | None = Field(default=None, ge=0)
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        return clean_required_str(v, "Item name") if v is not None else None

    @field_validator("sku")
    @classmethod
    def validate_sku(cls, v: str | None) -> str | None:
        return clean_optional_str(v)

    @field_validator("base_unit")
    @classmethod
    def validate_unit(cls, v: str | None) -> str | None:
        if v is None:
            return None
        trimmed = clean_required_str(v, "Base unit")
        allowed = {u.value for u in BaseUnit}
        if trimmed not in allowed:
            raise ValueError(f"Base unit must be one of: {', '.join(sorted(allowed))}")
        return trimmed

    @model_validator(mode="after")
    def check_at_least_one(self) -> InventoryItemUpdate:
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update.")
        return self


class InventoryItemStatusUpdate(BaseModel):
    is_active: bool


class OpeningStockCreate(BaseModel):
    quantity: Decimal = Field(..., gt=0)
    unit_cost: Decimal = Field(..., ge=0)
    notes: str | None = "Initial Opening Stock"


class InventoryItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category_id: int
    category_name: str = ""
    name: str
    sku: str | None
    base_unit: str
    current_stock: Decimal
    reorder_level: Decimal
    average_cost: Decimal
    is_active: bool
    is_archived: bool = False
    archived_at: datetime | None = None
    archive_reason: str | None = None
    created_by_user_id: int
    created_at: datetime
    updated_at: datetime
    stock_status: str = "IN_STOCK"  # IN_STOCK, LOW_STOCK, OUT_OF_STOCK
    total_valuation: Decimal = Decimal("0.00")


class ItemArchiveRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=255)


class BulkItemActionRequest(BaseModel):
    item_ids: list[int] = Field(..., min_length=1)
    action: str = Field(..., pattern="^(delete|archive|activate|deactivate)$")
    reason: str | None = Field(default=None, max_length=255)


class BulkCheckRequest(BaseModel):
    item_ids: list[int] = Field(..., min_length=1)


class BulkCheckResponse(BaseModel):
    total_selected: int
    eligible_for_deletion: list[int]
    require_archiving: list[int]
    cannot_modify: list[int]
    breakdown: list[dict]


# ==========================================
# 3. SUPPLIER SCHEMAS
# ==========================================

class SupplierCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    contact_person: str | None = Field(default=None, max_length=100)
    phone: str = Field(..., min_length=5, max_length=20)
    email: str | None = Field(default=None, max_length=150)
    gstin: str | None = Field(default=None, max_length=20)
    address: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return clean_required_str(v, "Supplier name")

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return clean_required_str(v, "Phone number")


class SupplierUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    contact_person: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, min_length=5, max_length=20)
    email: str | None = Field(default=None, max_length=150)
    gstin: str | None = Field(default=None, max_length=20)
    address: str | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        return clean_required_str(v, "Supplier name") if v is not None else None

    @model_validator(mode="after")
    def check_at_least_one(self) -> SupplierUpdate:
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update.")
        return self


class SupplierResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    contact_person: str | None
    phone: str
    email: str | None
    gstin: str | None
    address: str | None
    is_active: bool
    is_archived: bool = False
    archived_at: datetime | None = None
    archive_reason: str | None = None
    created_by_user_id: int
    created_at: datetime
    updated_at: datetime
    supplied_items_count: int = 0
    total_orders_count: int = 0


class SupplierArchiveRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=255)


class BulkSupplierActionRequest(BaseModel):
    supplier_ids: list[int] = Field(..., min_length=1)
    action: str = Field(..., pattern="^(delete|archive|activate|deactivate)$")
    reason: str | None = Field(default=None, max_length=255)


# ==========================================
# 4. SUPPLIER ITEM ASSOCIATIONS
# ==========================================

class SupplierItemCreate(BaseModel):
    inventory_item_id: int = Field(..., gt=0)
    supplier_sku: str | None = Field(default=None, max_length=50)
    last_purchase_price: Decimal | None = Field(default=None, ge=0)
    lead_time_days: int = Field(default=1, ge=0)
    is_preferred: bool = False


class SupplierItemUpdate(BaseModel):
    supplier_sku: str | None = Field(default=None, max_length=50)
    last_purchase_price: Decimal | None = Field(default=None, ge=0)
    lead_time_days: int | None = Field(default=None, ge=0)
    is_preferred: bool | None = None


class SupplierItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    supplier_id: int
    inventory_item_id: int
    inventory_item_name: str = ""
    inventory_item_unit: str = ""
    supplier_sku: str | None
    last_purchase_price: Decimal | None
    lead_time_days: int
    is_preferred: bool


# ==========================================
# 5. RECIPE (BOM) SCHEMAS
# ==========================================

class RecipeItemCreate(BaseModel):
    inventory_item_id: int = Field(..., gt=0)
    quantity: Decimal = Field(..., gt=0)


class RecipeItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    inventory_item_id: int
    inventory_item_name: str = ""
    inventory_item_unit: str = ""
    inventory_item_average_cost: Decimal = Decimal("0.0000")
    quantity: Decimal
    line_cost: Decimal = Decimal("0.0000")


class RecipeCreateOrUpdate(BaseModel):
    yield_servings: int = Field(default=1, gt=0)
    preparation_notes: str | None = None
    items: list[RecipeItemCreate] = Field(..., min_length=1)

    @model_validator(mode="after")
    def validate_unique_items(self) -> RecipeCreateOrUpdate:
        ids = [i.inventory_item_id for i in self.items]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate ingredients in recipe are not allowed. Combine quantities.")
        return self


class RecipeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    menu_item_id: int
    menu_item_name: str = ""
    menu_item_price: Decimal = Decimal("0.00")
    yield_servings: int
    preparation_notes: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    items: list[RecipeItemResponse] = []
    total_estimated_cost: Decimal = Decimal("0.0000")
    food_cost_percentage: Decimal = Decimal("0.00")
    gross_margin_percentage: Decimal = Decimal("0.00")


# ==========================================
# 6. PURCHASE ORDER SCHEMAS
# ==========================================

class PurchaseOrderItemCreate(BaseModel):
    inventory_item_id: int = Field(..., gt=0)
    ordered_quantity: Decimal = Field(..., gt=0)
    unit_price: Decimal = Field(..., ge=0)


class PurchaseOrderItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    po_id: int
    inventory_item_id: int
    inventory_item_name: str = ""
    inventory_item_unit: str = ""
    ordered_quantity: Decimal
    received_quantity: Decimal
    remaining_quantity: Decimal = Decimal("0.0000")
    unit_price: Decimal
    line_total: Decimal


class PurchaseOrderCreate(BaseModel):
    supplier_id: int = Field(..., gt=0)
    order_date: date
    expected_delivery_date: date | None = None
    tax_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    notes: str | None = None
    items: list[PurchaseOrderItemCreate] = Field(..., min_length=1)

    @model_validator(mode="after")
    def validate_unique_items(self) -> PurchaseOrderCreate:
        ids = [i.inventory_item_id for i in self.items]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate items in Purchase Order are not allowed.")
        return self


class PurchaseOrderUpdate(BaseModel):
    supplier_id: int | None = Field(default=None, gt=0)
    order_date: date | None = None
    expected_delivery_date: date | None = None
    tax_amount: Decimal | None = Field(default=None, ge=0)
    notes: str | None = None
    items: list[PurchaseOrderItemCreate] | None = None


class POStatusUpdate(BaseModel):
    status: POStatus
    notes: str | None = None


class PurchaseOrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    po_number: str
    supplier_id: int
    supplier_name: str = ""
    order_date: date
    expected_delivery_date: date | None
    subtotal: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    status: POStatus
    notes: str | None
    created_by_user_id: int
    created_at: datetime
    updated_at: datetime
    items: list[PurchaseOrderItemResponse] = []
    received_amount: Decimal = Decimal("0.00")


# ==========================================
# 7. GOODS RECEIPT (GRN) SCHEMAS
# ==========================================

class GoodsReceiptItemCreate(BaseModel):
    po_item_id: int = Field(..., gt=0)
    received_quantity: Decimal = Field(..., gt=0)
    unit_cost: Decimal = Field(..., ge=0)


class GoodsReceiptItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    goods_receipt_id: int
    po_item_id: int
    inventory_item_id: int
    inventory_item_name: str = ""
    inventory_item_unit: str = ""
    received_quantity: Decimal
    unit_cost: Decimal
    line_total: Decimal


class GoodsReceiptCreate(BaseModel):
    received_date: date
    supplier_bill_number: str = Field(..., min_length=1, max_length=50)
    bill_date: date | None = None
    notes: str | None = None
    items: list[GoodsReceiptItemCreate] = Field(..., min_length=1)

    @field_validator("supplier_bill_number")
    @classmethod
    def validate_bill_number(cls, v: str) -> str:
        return clean_required_str(v, "Supplier bill number")


class GoodsReceiptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    grn_number: str
    po_id: int
    po_number: str = ""
    supplier_name: str = ""
    supplier_bill_number: str | None
    bill_date: date | None
    bill_image_url: str | None
    received_date: date
    total_received_amount: Decimal
    notes: str | None
    is_reversed: bool = False
    reversed_at: datetime | None = None
    reversed_by_user_id: int | None = None
    reversal_reason: str | None = None
    received_by_user_id: int
    created_at: datetime
    items: list[GoodsReceiptItemResponse] = []


class GoodsReceiptUpdate(BaseModel):
    supplier_bill_number: str | None = None
    bill_date: date | None = None
    notes: str | None = None


class GoodsReceiptReverseRequest(BaseModel):
    reason: str


# ==========================================
# 8. STOCK MOVEMENT SCHEMAS
# ==========================================

class StockMovementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    inventory_item_id: int
    inventory_item_name: str = ""
    inventory_item_unit: str = ""
    movement_type: MovementType
    quantity: Decimal
    unit_cost: Decimal
    balance_after: Decimal
    reference_type: str
    reference_id: int
    notes: str | None
    is_archived: bool = False
    archived_at: datetime | None = None
    archive_reason: str | None = None
    can_archive: bool = False
    created_by_user_id: int
    created_at: datetime


class BulkMovementArchiveRequest(BaseModel):
    movement_ids: list[int] = Field(..., min_length=1)
    reason: str | None = Field(default=None, max_length=255)


# ==========================================
# 9. WASTAGE & STOCK ADJUSTMENT SCHEMAS
# ==========================================

class StockAdjustmentCreate(BaseModel):
    inventory_item_id: int = Field(..., gt=0)
    quantity: Decimal = Field(...)  # positive to add, negative to deduct
    reason: str = Field(..., min_length=3, max_length=255)
    notes: str | None = None

    @field_validator("quantity")
    @classmethod
    def validate_nonzero(cls, v: Decimal) -> Decimal:
        if v == 0:
            raise ValueError("Adjustment quantity cannot be zero.")
        return v


class WastageCreate(BaseModel):
    inventory_item_id: int = Field(..., gt=0)
    quantity: Decimal = Field(..., gt=0)
    reason: WastageReason = WastageReason.SPOILAGE
    explanation: str = Field(..., min_length=3, max_length=255)


class StockMovementReversalRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=255)


# ==========================================
# 10. PHYSICAL STOCK COUNT SCHEMAS
# ==========================================

class StockCountItemEntry(BaseModel):
    inventory_item_id: int = Field(..., gt=0)
    counted_quantity: Decimal = Field(..., ge=0)


class StockCountCreate(BaseModel):
    count_date: date
    notes: str | None = None
    item_ids: list[int] | None = None  # None means all active items


class StockCountSubmit(BaseModel):
    counts: list[StockCountItemEntry] = Field(..., min_length=1)


class StockCountItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    stock_count_id: int
    inventory_item_id: int
    inventory_item_name: str = ""
    inventory_item_unit: str = ""
    system_quantity: Decimal
    counted_quantity: Decimal
    variance_quantity: Decimal
    unit_cost: Decimal
    variance_value: Decimal


class StockCountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    count_number: str
    count_date: date
    status: StockCountStatus
    notes: str | None
    conducted_by_user_id: int
    approved_by_user_id: int | None
    approved_at: datetime | None
    created_at: datetime
    updated_at: datetime
    items_count: int = 0
    total_variance_value: Decimal = Decimal("0.00")
    items: list[StockCountItemResponse] = []


# ==========================================
# 11. REPORTS & METRICS SCHEMAS
# ==========================================

class StockValuationItem(BaseModel):
    item_id: int
    item_name: str
    category_name: str
    base_unit: str
    current_stock: Decimal
    average_cost: Decimal
    total_valuation: Decimal
    stock_status: str


class StockValuationReport(BaseModel):
    total_items: int
    total_valuation: Decimal
    low_stock_count: int
    out_of_stock_count: int
    items: list[StockValuationItem]


class ConsumptionReportItem(BaseModel):
    item_id: int
    item_name: str
    category_name: str
    base_unit: str
    total_consumed_quantity: Decimal
    total_cost: Decimal
    order_count: int


class ConsumptionReport(BaseModel):
    start_date: date | None
    end_date: date | None
    total_consumption_cost: Decimal
    items: list[ConsumptionReportItem]


class WastageReportItem(BaseModel):
    item_id: int
    item_name: str
    category_name: str
    base_unit: str
    total_wasted_quantity: Decimal
    total_loss_value: Decimal
    incidents_count: int
    primary_reason: str


class WastageReport(BaseModel):
    start_date: date | None
    end_date: date | None
    total_wastage_loss: Decimal
    items: list[WastageReportItem]


class FoodCostReportItem(BaseModel):
    menu_item_id: int
    menu_item_name: str
    category_name: str
    selling_price: Decimal
    recipe_cost: Decimal
    gross_margin_amount: Decimal
    food_cost_percentage: Decimal
    gross_margin_percentage: Decimal
    has_active_recipe: bool


class ReconciliationItem(BaseModel):
    item_id: int
    item_name: str
    base_unit: str
    cached_current_stock: Decimal
    ledger_sum: Decimal
    difference: Decimal
    is_balanced: bool


class ReconciliationReport(BaseModel):
    total_items_checked: int
    discrepancy_count: int
    items: list[ReconciliationItem]


# ==========================================
# 12. MENU INVENTORY STATUS SCHEMA
# ==========================================

class InsufficientIngredientDetail(BaseModel):
    inventory_item_id: int
    ingredient_name: str
    required_per_serving: Decimal
    available_stock: Decimal
    base_unit: str


class MenuItemInventoryStatus(BaseModel):
    menu_item_id: int
    inventory_status: str  # "IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "NO_RECIPE"
    max_preparable_servings: int
    insufficient_ingredients: list[InsufficientIngredientDetail] = []
