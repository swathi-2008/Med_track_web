from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, EmailStr

class SupplierBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=128)
    contact_person: str = Field(..., min_length=2, max_length=128)
    email: str = Field(..., min_length=5, max_length=128)
    phone: str = Field(..., min_length=6, max_length=32)
    address: str = Field(..., min_length=3, max_length=256)

class SupplierCreate(SupplierBase):
    pass

class SupplierUpdate(SupplierBase):
    active: bool | None = None

class SupplierResponse(SupplierBase):
    id: str
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
