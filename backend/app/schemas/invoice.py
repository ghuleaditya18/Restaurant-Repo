from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.entities import PaymentStatus

# ==========================================
# 1. CREATE INVOICE
# ==========================================


class InvoiceCreate(BaseModel):

    order_id: int = Field(gt=0)

    # GST rate is configurable, not hardcoded.
    gst_rate: Decimal = Field(ge=0, le=100, max_digits=5, decimal_places=2)


# ==========================================
# 2. INVOICE ITEM RESPONSE
# ==========================================


class InvoiceItemResponse(BaseModel):

    item_name: str

    quantity: int

    unit_price: Decimal

    line_total: Decimal


# ==========================================
# 3. INVOICE RESPONSE
# ==========================================


class InvoiceResponse(BaseModel):

    id: int

    invoice_number: str

    order_id: int

    order_number: str

    customer_name: str

    customer_phone: str

    table_number: str

    items: list[InvoiceItemResponse]

    subtotal: Decimal

    gst_rate: Decimal

    gst_amount: Decimal

    total_amount: Decimal

    payment_status: PaymentStatus

    pdf_path: str | None

    created_at: datetime | None = None
