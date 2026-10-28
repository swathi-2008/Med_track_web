from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.schemas.auth import LoginRequest, LoginResponse, AuthMeResponse, UserResponse
from app.services.auth_service import authenticate_user, logout_user, ensure_admin_user_exists
from app.security.dependencies import (
    get_current_session_and_user,
    COOKIE_NAME,
)
from app.models.user import User, UserSession

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/login", response_model=LoginResponse)
async def login(
    req: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    # Ensure bootstrap admin exists if DB is newly created
    ensure_admin_user_exists(db)

    client_ip = request.client.host if request.client else "127.0.0.1"
    raw_token, csrf_token, user = authenticate_user(db, req, client_ip)

    # Set HttpOnly session cookie
    response.set_cookie(
        key=COOKIE_NAME,
        value=raw_token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=settings.session_absolute_hours * 3600,
        path="/",
    )

    # Set readable csrf_token cookie for double-submit
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        httponly=False,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=settings.session_absolute_hours * 3600,
        path="/",
    )

    return LoginResponse(
        message="Authentication successful",
        user=UserResponse.model_validate(user),
        csrf_token=csrf_token,
    )

@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    raw_token = request.cookies.get(COOKIE_NAME)
    if raw_token:
        logout_user(db, raw_token)

    response.delete_cookie(key=COOKIE_NAME, path="/")
    response.delete_cookie(key="csrf_token", path="/")
    return {"message": "Logged out successfully"}

@router.get("/me", response_model=AuthMeResponse)
async def get_me(
    response: Response,
    session_and_user: tuple[UserSession, User] = Depends(get_current_session_and_user)
):
    session, user = session_and_user

    # Refresh csrf cookie
    response.set_cookie(
        key="csrf_token",
        value=session.csrf_token,
        httponly=False,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=settings.session_absolute_hours * 3600,
        path="/",
    )

    return AuthMeResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        active=user.active,
        csrf_token=session.csrf_token,
    )
