import re
from pydantic import BaseModel, ConfigDict, Field, field_validator


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    business_context: str = "RESTAURANT"


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: str
    role: str
    is_active: bool
    business_context: str = "RESTAURANT"
    phone: str | None = None


class ProfileUpdateRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., min_length=5, max_length=150)
    phone: str | None = Field(default=None, max_length=15)

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, value: str) -> str:
        trimmed = value.strip()
        if len(trimmed) < 2:
            raise ValueError("Full name must contain at least 2 characters.")
        if trimmed.lower() in {"string", "null", "none", "test", "example"}:
            raise ValueError("Enter a valid full name.")
        return trimmed

    @field_validator("email")
    @classmethod
    def validate_email_address(cls, value: str) -> str:
        trimmed = value.strip().lower()
        if not trimmed:
            raise ValueError("Email address cannot be empty.")
        if len(trimmed) > 150 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", trimmed):
            raise ValueError("Enter a valid email address.")
        return trimmed

    @field_validator("phone")
    @classmethod
    def validate_phone_number(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            return None
        if not re.fullmatch(r"[6-9][0-9]{9}", trimmed):
            raise ValueError("Enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.")
        return trimmed
