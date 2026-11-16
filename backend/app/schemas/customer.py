import re

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

# ==========================================
# COMMON VALIDATION
# ==========================================


def validate_required_text(value: str, field_name: str) -> str:

    value = value.strip()

    if not value:
        raise ValueError(f"{field_name} cannot be empty.")

    if value.lower() in {"string", "null", "none", "test", "example"}:
        raise ValueError(f"Enter a valid {field_name}.")

    return value


def validate_phone(value: str) -> str:
    if not re.fullmatch(r"[6-9][0-9]{9}", value):
        raise ValueError(
            "Enter a valid 10-digit mobile number starting with 6, 7, 8, or 9."
        )

    return value


def validate_email(value: str | None) -> str | None:

    if value is None:
        return None

    value = value.strip().lower()

    if not value:
        return None

    if len(value) > 150 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
        raise ValueError("Enter a valid email address.")

    return value


def validate_optional_text(value: str | None) -> str | None:

    if value is None:
        return None

    value = value.strip()

    return value if value else None


# ==========================================
# 1. CREATE CUSTOMER
# ==========================================


class CustomerCreate(BaseModel):

    full_name: str = Field(min_length=2, max_length=100)

    phone: str

    email: str | None = Field(default=None, max_length=150)

    address: str | None = None

    @field_validator("full_name")
    @classmethod
    def validate_name(cls, value):
        return validate_required_text(value, "Customer name")

    @field_validator("phone")
    @classmethod
    def validate_phone_number(cls, value):
        return validate_phone(value)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return validate_email(value)

    @field_validator("address")
    @classmethod
    def clean_address(cls, value):
        return validate_optional_text(value)


# ==========================================
# 2. UPDATE CUSTOMER
# ==========================================


class CustomerUpdate(BaseModel):

    full_name: str | None = Field(default=None, min_length=2, max_length=100)

    phone: str | None = None

    email: str | None = Field(default=None, max_length=150)

    address: str | None = None

    @field_validator("full_name")
    @classmethod
    def validate_name(cls, value):

        if value is None:
            raise ValueError("Customer name cannot be null.")

        return validate_required_text(value, "Customer name")

    @field_validator("phone")
    @classmethod
    def validate_phone_number(cls, value):

        if value is None:
            raise ValueError("Phone number cannot be null.")

        return validate_phone(value)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return validate_email(value)

    @field_validator("address")
    @classmethod
    def clean_address(cls, value):
        return validate_optional_text(value)

    @model_validator(mode="after")
    def check_empty_update(self):

        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update.")

        return self


# ==========================================
# 3. CUSTOMER RESPONSE
# ==========================================


class CustomerResponse(BaseModel):

    model_config = ConfigDict(from_attributes=True)

    id: int

    full_name: str

    phone: str

    email: str | None

    address: str | None
