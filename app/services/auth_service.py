from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.config import settings
from app.errors import AuthenticationError
from app.models.user import User
from app.models.audit import AuditLog
from app.security.passwords import hash_password, verify_password
from app.security.sessions import create_user_session, delete_session
from app.security.rate_limit import login_rate_limiter
from app.schemas.auth import LoginRequest

def ensure_admin_user_exists(db: Session) -> User:
    """Creates the initial admin account if users table is empty."""
    user_count = db.query(User).count()
    if user_count == 0:
        admin = User(
            username=settings.admin_user,
            password_hash=hash_password(settings.admin_password),
            full_name="System Administrator",
            role="ADMIN",
            active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

        audit = AuditLog(
            user_id=admin.id,
            action="BOOTSTRAP_ADMIN",
            entity_type="User",
            entity_id=admin.id,
            reason="First-run initial admin bootstrap from environment",
        )
        db.add(audit)
        db.commit()
        return admin

    admin_user = db.query(User).filter(User.username == settings.admin_user).first()
    return admin_user

def authenticate_user(db: Session, req: LoginRequest, client_ip: str) -> tuple[str, str, User]:
    """
    Authenticates username and password against database, enforcing rate limits.
    Returns:
        (raw_session_token, csrf_token, user)
    """
    # Rate limit check
    login_rate_limiter.check(req.username, client_ip)

    user = db.query(User).filter(User.username == req.username).first()
    if not user or not user.active or not verify_password(req.password, user.password_hash):
        login_rate_limiter.record_failure(req.username, client_ip)
        # Log failed attempt
        try:
            audit = AuditLog(
                user_id=user.id if user else None,
                action="LOGIN_FAILURE",
                entity_type="User",
                entity_id=user.id if user else None,
                reason=f"Failed login attempt for username '{req.username}' from IP {client_ip}",
            )
            db.add(audit)
            db.commit()
        except Exception:
            db.rollback()

        raise AuthenticationError("Invalid username or password.")

    # Reset rate limit counter on success
    login_rate_limiter.record_success(req.username, client_ip)

    # Create server session
    raw_token, csrf_token, _ = create_user_session(db, user.id)

    # Log successful login
    try:
        audit = AuditLog(
            user_id=user.id,
            action="LOGIN_SUCCESS",
            entity_type="User",
            entity_id=user.id,
            reason=f"Successful login from IP {client_ip}",
        )
        db.add(audit)
        db.commit()
    except Exception:
        db.rollback()

    return raw_token, csrf_token, user

def logout_user(db: Session, raw_token: str, user_id: str | None = None) -> None:
    delete_session(db, raw_token)
    if user_id:
        try:
            audit = AuditLog(
                user_id=user_id,
                action="LOGOUT",
                entity_type="User",
                entity_id=user_id,
                reason="User signed out",
            )
            db.add(audit)
            db.commit()
        except Exception:
            db.rollback()
