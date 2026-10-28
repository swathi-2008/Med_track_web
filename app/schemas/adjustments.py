from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field

class StockAdjustmentCreate(BaseModel):
    batch_id: str
    adjusted_quantity: int = Field(..., description="Signed delta (+N or -N)")
    reason: str = Field(..., min_length=3, max_length=256)

class StockAdjustmentReview(BaseModel):
    reason: Optional[str] = Field(None, description="Mandatory when rejecting")

class StockAdjustmentResponse(BaseModel):
    id: str
    medicine_id: str
    medicine_name: str
    batch_id: str
    batch_number: str
    adjusted_quantity: int
    reason: str
    status: str  # PENDING, APPROVED, REJECTED
    requested_by_id: str
    requested_by_name: str
    reviewed_by_id: Optional[str] = None
    reviewed_by_name: Optional[str] = None
    review_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
