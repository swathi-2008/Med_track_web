from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1)

class UserResponse(BaseModel):
    id: str
    username: str
    full_name: str
    role: str
    active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class AuthMeResponse(BaseModel):
    id: str
    username: str
    full_name: str
    role: str
    active: bool
    csrf_token: str

class LoginResponse(BaseModel):
    message: str
    user: UserResponse
    csrf_token: str
