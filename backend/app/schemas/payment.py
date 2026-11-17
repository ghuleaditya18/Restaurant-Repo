from datetime import datetime
from decimal import Decimal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)

from app.models.entities import PaymentMethod, PaymentStatus

# ==========================================
# 1. CREATE PAYMENT
# ==========================================


class PaymentCreate(BaseModel):

    payment_method: PaymentMethod

    reference_number: str | None = Field(default=None, max_length=100)

    @field_validator("reference_number")
    @classmethod
    def clean_reference(cls, value):

        if value is None:
            return None

        value = value.strip()

        return value if value else None


# ==========================================
# 2. UPDATE PAYMENT STATUS
# ==========================================


class PaymentStatusUpdate(BaseModel):

    status: PaymentStatus


# ==========================================
# 3. PAYMENT RESPONSE
# ==========================================


class PaymentResponse(BaseModel):

    model_config = ConfigDict(from_attributes=True)

    id: int

    invoice_id: int

    payment_method: PaymentMethod

    amount: Decimal

    status: PaymentStatus

    reference_number: str | None

    paid_at: datetime | None
