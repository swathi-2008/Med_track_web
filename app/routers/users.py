"""User administration router (ADMIN only)."""
from typing import List
from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.user import UserResponse, UserCreateRequest, UserUpdateRequest, UserStatusRequest
from app.security.dependencies import require_roles
from app.services import user_service

router = APIRouter(prefix="/users", tags=["Users"])

@router.get("", response_model=List[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    return user_service.get_all_users(db)

@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    return user_service.get_user_by_id(db, user_id)

@router.post("", response_model=UserResponse, status_code=201)
def create_user(
    req: UserCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    return user_service.create_user(db, req)

@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    req: UserUpdateRequest,
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    return user_service.update_user(db, user_id, req)

@router.patch("/{user_id}/status", response_model=UserResponse)
def toggle_user_status(
    req: UserStatusRequest,
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    return user_service.set_user_status(db, user_id, req.active)

