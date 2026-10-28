import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session

from app.config import settings
from app.clock import get_utcnow
from app.models.user import UserSession, User

def hash_session_token(token: str) -> str:
    """Returns SHA-256 hash of raw session token."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def create_user_session(db: Session, user_id: str) -> tuple[str, str, UserSession]:
    """
    Creates a new user session.
    Returns:
        (raw_session_token, csrf_token, UserSession)
    """
    raw_token = secrets.token_urlsafe(32)
    session_hash = hash_session_token(raw_token)
    csrf_token = secrets.token_urlsafe(32)
    now = get_utcnow()
    expires_at = now + timedelta(hours=settings.session_absolute_hours)

    session = UserSession(
        session_hash=session_hash,
        user_id=user_id,
        csrf_token=csrf_token,
        created_at=now,
        expires_at=expires_at,
        last_seen=now,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return raw_token, csrf_token, session

def get_active_session(db: Session, raw_token: str) -> tuple[UserSession, User] | None:
    """
    Looks up session by raw token hash, verifies absolute and idle expiration.
    Returns (session, user) or None.
    """
    if not raw_token:
        return None

    session_hash = hash_session_token(raw_token)
    session = (
        db.query(UserSession)
        .filter(UserSession.session_hash == session_hash)
        .first()
    )
    if not session:
        return None

    now = get_utcnow()
    # Check absolute expiry (make comparison timezone-naive or aware consistently)
    expires_at = session.expires_at.replace(tzinfo=timezone.utc) if session.expires_at.tzinfo is None else session.expires_at
    if now > expires_at:
        delete_session(db, raw_token)
        return None

    # Check idle timeout
    last_seen = session.last_seen.replace(tzinfo=timezone.utc) if session.last_seen.tzinfo is None else session.last_seen
    idle_cutoff = now - timedelta(minutes=settings.session_idle_minutes)
    if last_seen < idle_cutoff:
        delete_session(db, raw_token)
        return None

    # Update last_seen
    session.last_seen = now
    db.commit()

    user = db.query(User).filter(User.id == session.user_id).first()
    if not user or not user.active:
        return None

    return session, user

def delete_session(db: Session, raw_token: str) -> None:
    """Deletes the session identified by raw token."""
    if not raw_token:
        return
    session_hash = hash_session_token(raw_token)
    db.query(UserSession).filter(UserSession.session_hash == session_hash).delete()
    db.commit()
