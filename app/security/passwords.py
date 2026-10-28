import bcrypt
from app.errors import ValidationError

def hash_password(password: str) -> str:
    """Hashes a plaintext password using bcrypt."""
    validate_password_policy(password)
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against a bcrypt hash."""
    if not plain_password or not hashed_password:
        return False
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False

def validate_password_policy(password: str) -> None:
    """Enforces minimum length of 10 characters for all passwords."""
    if not password or len(password) < 10:
        raise ValidationError(
            message="Password must be at least 10 characters long.",
            field_errors=[{"field": "password", "message": "Minimum length is 10 characters."}]
        )
