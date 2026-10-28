"""User management service with strict admin protection rules."""
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.user import User
from app.schemas.user import UserCreateRequest, UserUpdateRequest
from app.security.passwords import hash_password
from app.errors import BadRequestError, ConflictError, NotFoundError

def get_all_users(db: Session) -> List[User]:
    return db.query(User).order_by(User.id.asc()).all()

def get_user_by_id(db: Session, user_id: str) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise NotFoundError("User not found.")
    return user

def count_active_admins(db: Session) -> int:
    return db.query(func.count(User.id)).filter(User.role == "ADMIN", User.active == True).scalar() or 0

def create_user(db: Session, req: UserCreateRequest) -> User:
    existing = db.query(User).filter(User.username == req.username).first()
    if existing:
        raise ConflictError(f"Username '{req.username}' is already taken.")

    user = User(
        username=req.username.strip(),
        password_hash=hash_password(req.password),
        full_name=req.full_name.strip(),
        role=req.role,
        active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def update_user(db: Session, user_id: str, req: UserUpdateRequest) -> User:
    user = get_user_by_id(db, user_id)

    # Check last active admin protection if deactivating or changing role
    is_current_active_admin = (user.role == "ADMIN" and user.active is True)
    if is_current_active_admin:
        role_demoted = req.role is not None and req.role != "ADMIN"
        deactivated = req.active is False
        if role_demoted or deactivated:
            active_admin_count = count_active_admins(db)
            if active_admin_count <= 1:
                raise BadRequestError("Cannot deactivate or demote the last active administrator.")

    if req.full_name is not None:
        user.full_name = req.full_name.strip()
    if req.role is not None:
        user.role = req.role
    if req.active is not None:
        user.active = req.active
    if req.password is not None and req.password.strip():
        user.password_hash = hash_password(req.password)

    db.commit()
    db.refresh(user)
    return user

def set_user_status(db: Session, user_id: str, active: bool) -> User:

    user = get_user_by_id(db, user_id)
    if not active and user.role == "ADMIN" and user.active:
        if count_active_admins(db) <= 1:
            raise BadRequestError("Cannot deactivate the last active administrator.")

    user.active = active
    db.commit()
    db.refresh(user)
    return user
