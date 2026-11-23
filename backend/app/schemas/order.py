from datetime import datetime
from decimal import Decimal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from app.models.entities import OrderStatus, PaymentStatus, PaymentMethod

# ==========================================
# 1. CREATE ORDER ITEM
# ==========================================


class OrderItemCreate(BaseModel):

    menu_item_id: int = Field(gt=0)

    quantity: int = Field(gt=0)


# ==========================================
# 2. CREATE ORDER
# ==========================================


class OrderCreate(BaseModel):

    customer_id: int = Field(gt=0)

    table_id: int = Field(gt=0)

    items: list[OrderItemCreate] = Field(min_length=1)

    special_instructions: str | None = None

    @field_validator("special_instructions")
    @classmethod
    def clean_instructions(cls, value):

        if value is None:
            return None

        value = value.strip()

        return value if value else None

    @model_validator(mode="after")
    def validate_unique_items(self):

        item_ids = [item.menu_item_id for item in self.items]

        if len(item_ids) != len(set(item_ids)):
            raise ValueError(
                "Duplicate menu items are not allowed. "
                "Combine them by updating the quantity."
            )

        return self


# ==========================================
# 3. UPDATE ORDER DETAILS
# ==========================================


class OrderUpdate(BaseModel):

    special_instructions: str | None = None

    @field_validator("special_instructions")
    @classmethod
    def clean_instructions(cls, value):

        if value is None:
            return None

        value = value.strip()

        return value if value else None

    @model_validator(mode="after")
    def check_empty_update(self):

        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update.")

        return self


# ==========================================
# 4. UPDATE ORDER ITEM QUANTITY
# ==========================================


class OrderItemUpdate(BaseModel):

    quantity: int = Field(gt=0)


# ==========================================
# 5. UPDATE ORDER STATUS
# ==========================================


class OrderStatusUpdate(BaseModel):

    status: OrderStatus

    note: str | None = None

    @field_validator("note")
    @classmethod
    def clean_note(cls, value):

        if value is None:
            return None

        value = value.strip()

        return value if value else None


# ==========================================
# 6. ORDER ITEM RESPONSE
# ==========================================


class OrderItemResponse(BaseModel):

    model_config = ConfigDict(from_attributes=True)

    id: int

    menu_item_id: int

    item_name: str

    quantity: int

    unit_price: Decimal

    line_total: Decimal

    price_at_order: Decimal | None = None

    @model_validator(mode="after")
    def set_price_at_order(self):
        if self.price_at_order is None:
            self.price_at_order = self.unit_price
        return self


# ==========================================
# 7. ORDER STATUS HISTORY RESPONSE
# ==========================================


class OrderStatusHistoryResponse(BaseModel):

    model_config = ConfigDict(from_attributes=True)

    id: int

    previous_status: OrderStatus | None

    new_status: OrderStatus

    changed_by_user_id: int

    note: str | None

    changed_at: datetime


# ==========================================
# 8. ORDER RESPONSE
# ==========================================


class OrderResponse(BaseModel):

    id: int

    order_number: str

    customer_id: int

    customer_name: str

    table_id: int

    table_number: str

    created_by_user_id: int

    status: OrderStatus

    special_instructions: str | None

    items: list[OrderItemResponse]

    status_history: list[OrderStatusHistoryResponse]

    subtotal: Decimal

    created_at: datetime | None = None

    invoice_id: int | None = None

    invoice_number: str | None = None

    payment_status: PaymentStatus | None = None

    tax_amount: Decimal = Decimal("0.00")

    total_amount: Decimal = Decimal("0.00")

    amount_paid: Decimal = Decimal("0.00")

    outstanding_balance: Decimal = Decimal("0.00")

    payments: list[dict] = Field(default_factory=list)

    archived_at: datetime | None = None

    archived_by: int | None = None

    archive_reason: str | None = None


# ==========================================
# 9. ORDER PAYMENT & BULK ARCHIVE SCHEMAS
# ==========================================


class OrderPaymentCreate(BaseModel):

    payment_method: PaymentMethod

    amount: Decimal = Field(gt=0)

    reference_number: str | None = None


class BulkArchiveRequest(BaseModel):

    order_ids: list[int] | None = None

    older_than_days: int = 3

    reason: str | None = "Cleared old orders"


class BulkArchiveResponse(BaseModel):

    archived_count: int

    excluded_count: int

    archived_ids: list[int]

    excluded_details: list[dict] = Field(default_factory=list)


class PaginatedOrdersResponse(BaseModel):

    items: list[OrderResponse]

    total: int

    page: int

    page_size: int

    total_pages: int

    summary_counts: dict[str, int] = Field(default_factory=dict)
