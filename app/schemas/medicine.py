from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator

class MedicineBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=128)
    category: str = Field(..., min_length=2, max_length=64)
    strength: str = Field(..., min_length=1, max_length=64)
    unit: str = Field(..., min_length=1, max_length=32)
    reorder_level: int = Field(default=10, ge=0)
    selling_price: int = Field(..., ge=0, description="Selling price in minor units (paise, e.g. 1250 for Rs 12.50)")

class MedicineCreate(MedicineBase):
    pass

class MedicineUpdate(MedicineBase):
    active: bool | None = None

class MedicineStatusUpdate(BaseModel):
    active: bool

class MedicineResponse(MedicineBase):
    id: str
    active: bool
    created_at: datetime
    updated_at: datetime
    selling_price_display: str = ""
    total_stock: int = 0

    model_config = ConfigDict(from_attributes=True)

    @field_validator("selling_price_display", mode="before")
    @classmethod
    def compute_price_display(cls, v, info):
        price = info.data.get("selling_price")
        if price is not None:
            return f"₹{price / 100:.2f}"
        return v
