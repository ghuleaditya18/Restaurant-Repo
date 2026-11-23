from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator
import re


class BusinessProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    business_context: str
    business_name: str
    business_type: str | None = None
    business_category: str | None = None
    tagline: str | None = None
    description: str | None = None
    established_year: str | None = None

    story_heading: str | None = None
    story_subheading: str | None = None
    story_content: str | None = None

    founder_name: str | None = None
    founder_designation: str | None = None
    founder_bio: str | None = None
    founder_quote: str | None = None
    founder_image_url: str | None = None

    business_email: str | None = None
    business_phone: str | None = None

    address_line: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = "India"

    operating_hours: str | None = None
    weekly_closed_days: str | None = None
    business_highlights: str | None = None

    is_profile_complete: bool = False
    missing_fields: list[str] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class BusinessProfileUpdateRequest(BaseModel):
    business_name: str = Field(..., min_length=2, max_length=150)
    business_type: str | None = Field(default=None, max_length=100)
    business_category: str | None = Field(default=None, max_length=100)
    tagline: str | None = Field(default=None, max_length=255)
    description: str | None = None
    established_year: str | None = Field(default=None, max_length=10)

    story_heading: str | None = Field(default=None, max_length=200)
    story_subheading: str | None = Field(default=None, max_length=255)
    story_content: str | None = None

    founder_name: str | None = Field(default=None, max_length=150)
    founder_designation: str | None = Field(default=None, max_length=100)
    founder_bio: str | None = None
    founder_quote: str | None = Field(default=None, max_length=255)

    business_email: str | None = Field(default=None, max_length=150)
    business_phone: str | None = Field(default=None, max_length=50)

    address_line: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    country: str | None = Field(default="India", max_length=100)

    operating_hours: str | None = Field(default=None, max_length=100)
    weekly_closed_days: str | None = Field(default=None, max_length=100)
    business_highlights: str | None = None

    @field_validator("business_name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        s = v.strip()
        if len(s) < 2:
            raise ValueError("Business name must have at least 2 characters.")
        return s

    @field_validator("business_email")
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        if not v:
            return None
        s = v.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", s):
            raise ValueError("Please provide a valid official email address.")
        return s

    @field_validator("business_phone")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        if not v:
            return None
        s = v.strip()
        if len(s) < 8 or len(s) > 20:
            raise ValueError("Please provide a valid phone number (8-20 digits).")
        return s
