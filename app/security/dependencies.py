import hmac
from typing import Callable
from fastapi import Request, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.errors import AuthenticationError, AuthorizationError
from app.models.user import User, UserSession
from app.security.sessions import get_active_session

COOKIE_NAME = "session_token"

def get_current_session_and_user(
    request: Request,
    db: Session = Depends(get_db)
) -> tuple[UserSession, User]:
    """Validates session cookie and retrieves current user."""
    raw_token = request.cookies.get(COOKIE_NAME)
    if not raw_token:
        raise AuthenticationError("No session cookie present. Please sign in.")

    active = get_active_session(db, raw_token)
    if not active:
        raise AuthenticationError("Session expired, invalid, or user deactivated.")

    return active

def get_current_user(
    session_and_user: tuple[UserSession, User] = Depends(get_current_session_and_user)
) -> User:
    """Returns authenticated active User."""
    _, user = session_and_user
    return user

def verify_csrf(
    request: Request,
    session_and_user: tuple[UserSession, User] = Depends(get_current_session_and_user)
) -> None:
    """
    Validates double-submit CSRF token for state-changing requests (POST, PUT, PATCH, DELETE).
    Compares X-CSRF-Token header against user_session.csrf_token using constant-time comparison.
    """
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        session, _ = session_and_user
        header_token = request.headers.get("X-CSRF-Token")
        if not header_token or not hmac.compare_digest(header_token, session.csrf_token):
            raise AuthorizationError("CSRF verification failed. Missing or invalid X-CSRF-Token.")

def require_roles(*roles: str) -> Callable:
    """FastAPI dependency factory enforcing that the authenticated user has one of the allowed roles."""
    def role_checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise AuthorizationError(f"Access denied. Required role: {', '.join(roles)} (you have {user.role})")
        return user
    return role_checker
