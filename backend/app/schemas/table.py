from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from app.models.entities import TableStatus

# ==========================================
# 1. CREATE TABLE
# ==========================================


class TableCreate(BaseModel):

    table_number: str = Field(min_length=1, max_length=20)

    capacity: int = Field(gt=0)

    @field_validator("table_number")
    @classmethod
    def validate_table_number(cls, value):

        value = value.strip()

        if not value:
            raise ValueError("Table number cannot be empty.")

        return value


# ==========================================
# 2. UPDATE TABLE
# ==========================================


class TableUpdate(BaseModel):

    table_number: str | None = Field(default=None, min_length=1, max_length=20)

    capacity: int | None = Field(default=None, gt=0)

    status: TableStatus | None = None

    is_active: bool | None = None

    @field_validator("table_number")
    @classmethod
    def validate_table_number(cls, value):

        if value is None:
            raise ValueError("Table number cannot be null.")

        value = value.strip()

        if not value:
            raise ValueError("Table number cannot be empty.")

        return value

    @field_validator("capacity", "is_active", "status")
    @classmethod
    def validate_not_null(cls, value, info):

        if value is None:
            raise ValueError(f"{info.field_name} cannot be null.")

        return value

    @model_validator(mode="after")
    def check_empty_update(self):

        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update.")

        return self


# ==========================================
# 3. TABLE RESPONSE
# ==========================================


class TableResponse(BaseModel):

    model_config = ConfigDict(from_attributes=True)

    id: int

    table_number: str

    capacity: int

    status: TableStatus

    is_active: bool
