from datetime import datetime
from decimal import Decimal

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


def validate_description(value: str | None) -> str | None:
    if value is None:
        return None

    value = value.strip()

    return value if value else None


# ==========================================
# 1. CREATE MENU CATEGORY
# ==========================================


class MenuCategoryCreate(BaseModel):

    name: str = Field(min_length=2, max_length=100)

    description: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value):
        return validate_required_text(value, "Category name")

    @field_validator("description")
    @classmethod
    def clean_description(cls, value):
        return validate_description(value)


# ==========================================
# 2. UPDATE MENU CATEGORY
# ==========================================


class MenuCategoryUpdate(BaseModel):

    name: str | None = Field(default=None, min_length=2, max_length=100)

    description: str | None = None

    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value):

        if value is None:
            raise ValueError("Category name cannot be null.")

        return validate_required_text(value, "Category name")

    @field_validator("description")
    @classmethod
    def clean_description(cls, value):
        return validate_description(value)

    @field_validator("is_active")
    @classmethod
    def validate_active_status(cls, value):

        if value is None:
            raise ValueError("Active status cannot be null.")

        return value

    @model_validator(mode="after")
    def check_empty_update(self):

        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update.")

        return self


# ==========================================
# 3. MENU CATEGORY RESPONSE
# ==========================================


class MenuCategoryResponse(BaseModel):

    model_config = ConfigDict(from_attributes=True)

    id: int

    name: str

    description: str | None

    is_active: bool


# ==========================================
# 4. CREATE MENU ITEM
# ==========================================


class MenuItemCreate(BaseModel):

    category_id: int = Field(gt=0)

    name: str = Field(min_length=2, max_length=150)

    description: str | None = None

    price: Decimal = Field(gt=0, max_digits=12, decimal_places=2)

    is_available: bool = True

    @field_validator("name")
    @classmethod
    def validate_name(cls, value):
        return validate_required_text(value, "Menu item name")

    @field_validator("description")
    @classmethod
    def clean_description(cls, value):
        return validate_description(value)


# ==========================================
# 5. UPDATE MENU ITEM
# ==========================================


class MenuItemUpdate(BaseModel):

    category_id: int | None = Field(default=None, gt=0)

    name: str | None = Field(default=None, min_length=2, max_length=150)

    description: str | None = None

    price: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)

    is_available: bool | None = None

    @field_validator("category_id", "price", "is_available")
    @classmethod
    def validate_not_null(cls, value, info):

        if value is None:
            raise ValueError(f"{info.field_name} cannot be null.")

        return value

    @field_validator("name")
    @classmethod
    def validate_name(cls, value):

        if value is None:
            raise ValueError("Menu item name cannot be null.")

        return validate_required_text(value, "Menu item name")

    @field_validator("description")
    @classmethod
    def clean_description(cls, value):
        return validate_description(value)

    @model_validator(mode="after")
    def check_empty_update(self):

        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update.")

        return self


# ==========================================
# 6. MENU ITEM AVAILABILITY UPDATE
# ==========================================


class MenuItemAvailabilityUpdate(BaseModel):

    is_available: bool


# ==========================================
# 7. MENU ITEM RESPONSE
# ==========================================


class MenuItemResponse(BaseModel):

    id: int

    category_id: int

    category_name: str

    name: str

    description: str | None

    price: Decimal

    is_available: bool

    # Stored path of the uploaded photo, e.g. "/uploads/menu/<name>.jpg"
    image_url: str | None = None

    # Shown in the View dialog
    created_at: datetime | None = None

    updated_at: datetime | None = None
