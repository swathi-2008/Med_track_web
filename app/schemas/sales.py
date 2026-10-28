from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

class SaleItemRequest(BaseModel):
    medicine_id: str
    quantity: int = Field(..., ge=1, description="Quantity to purchase (positive integer)")
    batch_id: Optional[str] = Field(None, description="Optional specific batch; if omitted, optimal FEFO allocation is used")

class SaleCreateRequest(BaseModel):
    items: List[SaleItemRequest] = Field(..., min_length=1)

class SaleItemResponse(BaseModel):
    id: str
    batch_id: str
    batch_number: str
    medicine_id: str
    medicine_name: str
    quantity: int
    unit_price_snapshot: int
    unit_price_display: str = ""
    subtotal: int
    subtotal_display: str = ""

    model_config = ConfigDict(from_attributes=True)

class SaleResponse(BaseModel):
    id: str
    reference_number: str
    user_id: str
    cashier_name: str
    total_amount: int
    total_amount_display: str = ""
    status: str
    created_at: datetime
    items: List[SaleItemResponse]

    model_config = ConfigDict(from_attributes=True)
