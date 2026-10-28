from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

# Purchase Request Schemas
class PurchaseRequestItemCreate(BaseModel):
    medicine_id: str
    quantity_requested: int = Field(..., ge=1)
    notes: Optional[str] = None

class PurchaseRequestCreate(BaseModel):
    items: List[PurchaseRequestItemCreate] = Field(..., min_length=1)

class PurchaseRequestItemResponse(BaseModel):
    id: str
    medicine_id: str
    medicine_name: str
    strength: str
    unit: str
    quantity_requested: int
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class PurchaseRequestResponse(BaseModel):
    id: str
    request_number: str
    requested_by_id: str
    requested_by_name: str
    status: str  # PENDING, APPROVED, REJECTED
    reviewed_by_id: Optional[str] = None
    reviewed_by_name: Optional[str] = None
    review_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    items: List[PurchaseRequestItemResponse]

    model_config = ConfigDict(from_attributes=True)

class PurchaseRequestReview(BaseModel):
    reason: Optional[str] = Field(None, description="Mandatory when rejecting")

# Purchase Order Schemas
class PurchaseOrderItemCreate(BaseModel):
    medicine_id: str
    quantity_ordered: int = Field(..., ge=1)
    unit_price: int = Field(..., ge=0, description="Cost in minor units (paise)")

class PurchaseOrderCreate(BaseModel):
    supplier_id: str
    request_id: Optional[str] = None
    items: List[PurchaseOrderItemCreate] = Field(..., min_length=1)

class PurchaseOrderItemResponse(BaseModel):
    id: str
    medicine_id: str
    medicine_name: str
    quantity_ordered: int
    quantity_received: int
    outstanding_quantity: int
    unit_price: int
    unit_price_display: str

    model_config = ConfigDict(from_attributes=True)

class PurchaseOrderResponse(BaseModel):
    id: str
    po_number: str
    supplier_id: str
    supplier_name: str
    request_id: Optional[str] = None
    status: str
    created_at: datetime
    items: List[PurchaseOrderItemResponse]

    model_config = ConfigDict(from_attributes=True)

# Goods Receipt Schemas
class GoodsReceiptItemCreate(BaseModel):
    po_item_id: str
    batch_number: str = Field(..., min_length=1, max_length=64)
    expiry_date: date
    quantity_received: int = Field(..., ge=1)
    purchase_price: int = Field(..., ge=0, description="Cost in minor units (paise)")

class GoodsReceiptCreate(BaseModel):
    po_id: str
    items: List[GoodsReceiptItemCreate] = Field(..., min_length=1)

class GoodsReceiptItemResponse(BaseModel):
    id: str
    batch_id: str
    batch_number: str
    medicine_name: str
    quantity_received: int
    purchase_price: int
    purchase_price_display: str

    model_config = ConfigDict(from_attributes=True)

class GoodsReceiptResponse(BaseModel):
    id: str
    receipt_number: str
    po_id: str
    received_by_name: str
    created_at: datetime
    items: List[GoodsReceiptItemResponse]

    model_config = ConfigDict(from_attributes=True)
