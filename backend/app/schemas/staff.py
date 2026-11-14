import re
from datetime import date

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator
)


# Common validation functions
def validate_email(value: str) -> str:
    value = value.strip().lower()

    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
        raise ValueError("Enter a valid email address.")

    return value


def validate_required_text(value: str, field_name: str) -> str:
    value = value.strip()

    if not value:
        raise ValueError(f"{field_name} cannot be empty.")

    if value.lower() in {"string", "null", "none", "test", "example"}:
        raise ValueError(f"Enter a valid {field_name}.")

    return value


def validate_phone(value: str) -> str:
    value = value.strip()

    cleaned = re.sub(r"[\s\-()]", "", value)

    if not re.fullmatch(r"\+?\d{10,15}", cleaned):
        raise ValueError("Enter a valid phone number (10-15 digits).")

    return cleaned


# 1. CREATE STAFF
class StaffCreate(BaseModel):

    full_name: str = Field(min_length=2, max_length=100)

    email: str

    password: str = Field(min_length=12)

    employee_code: str = Field(min_length=2, max_length=30)

    phone: str

    designation: str = Field(min_length=2, max_length=100)

    joining_date: date | None = None

    @field_validator("full_name")
    @classmethod
    def validate_name(cls, value):
        return validate_required_text(value, "Full name")

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return validate_email(value)

    @field_validator("employee_code")
    @classmethod
    def validate_code(cls, value):
        return validate_required_text(value, "Employee code")

    @field_validator("phone")
    @classmethod
    def validate_phone_number(cls, value):
        return validate_phone(value)

    @field_validator("designation")
    @classmethod
    def validate_designation(cls, value):
        return validate_required_text(value, "Designation")


# 2. COMPLETE STAFF UPDATE (PUT)
class StaffPut(BaseModel):

    full_name: str = Field(min_length=2, max_length=100)

    email: str

    employee_code: str = Field(min_length=2, max_length=30)

    phone: str

    designation: str = Field(min_length=2, max_length=100)

    joining_date: date | None

    @field_validator("full_name")
    @classmethod
    def validate_name(cls, value):
        return validate_required_text(value, "Full name")

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return validate_email(value)

    @field_validator("employee_code")
    @classmethod
    def validate_code(cls, value):
        return validate_required_text(value, "Employee code")

    @field_validator("phone")
    @classmethod
    def validate_phone_number(cls, value):
        return validate_phone(value)

    @field_validator("designation")
    @classmethod
    def validate_designation(cls, value):
        return validate_required_text(value, "Designation")


# 3. PARTIAL STAFF UPDATE (PATCH)
class StaffUpdate(BaseModel):

    full_name: str | None = Field(default=None, min_length=2, max_length=100)

    email: str | None = None

    employee_code: str | None = None

    phone: str | None = None

    designation: str | None = None

    joining_date: date | None = None

    @field_validator(
        "full_name",
        "employee_code",
        "designation"
    )
    @classmethod
    def validate_text_fields(cls, value, info):

        if value is None:
            raise ValueError(f"{info.field_name} cannot be null.")

        return validate_required_text(value, info.field_name)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):

        if value is None:
            raise ValueError("Email cannot be null.")

        return validate_email(value)

    @field_validator("phone")
    @classmethod
    def validate_phone_number(cls, value):

        if value is None:
            raise ValueError("Phone cannot be null.")

        return validate_phone(value)

    @model_validator(mode="after")
    def check_empty_update(self):

        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update.")

        return self


# 4. STAFF STATUS UPDATE
class StaffStatusUpdate(BaseModel):

    is_active: bool


# 5. STAFF RESPONSE
class StaffResponse(BaseModel):

    model_config = ConfigDict(from_attributes=True)

    id: int

    user_id: int

    full_name: str

    email: str

    employee_code: str

    phone: str

    designation: str

    joining_date: date | None

    is_active: bool