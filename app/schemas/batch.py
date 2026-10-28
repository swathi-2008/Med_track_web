from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

BatchStatusType = Literal["ACTIVE", "QUARANTINED", "RECALLED", "INACTIVE"]

class BatchCreate(BaseModel):
    medicine_id: str
    supplier_id: str | None = None
    batch_number: str = Field(..., min_length=1, max_length=64)
    expiry_date: date
    quantity_received: int = Field(..., ge=1)
    quantity_available: int | None = Field(default=None, ge=0)
    purchase_price: int = Field(..., ge=0, description="Purchase price in minor units (paise)")

class BatchStatusUpdate(BaseModel):
    status: BatchStatusType
    reason: str = Field(..., min_length=3, max_length=256, description="Reason is strictly required for status change/quarantine/recall.")

class BatchResponse(BaseModel):
    id: str
    medicine_id: str
    medicine_name: str | None = None
    supplier_id: str | None = None
    supplier_name: str | None = None
    batch_number: str
    expiry_date: date
    quantity_received: int
    quantity_available: int
    purchase_price: int
    purchase_price_display: str = ""
    status: str
    days_to_expiry: int | None = None
    risk_category: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
