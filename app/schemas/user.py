"""User schemas for administration and RBAC."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    full_name: str
    role: str
    active: bool
    created_at: datetime

class UserCreateRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=10, max_length=100)
    full_name: str = Field(..., min_length=2, max_length=100)
    role: str = Field(..., pattern=r"^(ADMIN|MANAGER|SALES_STAFF|PURCHASE_STAFF)$")

class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    role: Optional[str] = Field(None, pattern=r"^(ADMIN|MANAGER|SALES_STAFF|PURCHASE_STAFF)$")
    password: Optional[str] = Field(None, min_length=10, max_length=100)
    active: Optional[bool] = None

class UserStatusRequest(BaseModel):
    active: bool
