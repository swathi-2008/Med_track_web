from datetime import datetime, timedelta, timezone
from collections import defaultdict
from app.errors import RateLimitError
from app.clock import get_utcnow

class LoginRateLimiter:
    """
    In-memory rate limiter tracking failed login attempts per (user, ip).
    Locks for 10 minutes if 5 consecutive failures occur.
    """
    def __init__(self, max_attempts: int = 5, window_minutes: int = 10):
        self.max_attempts = max_attempts
        self.window = timedelta(minutes=window_minutes)
        # key -> list of failure datetimes
        self._failures: dict[str, list[datetime]] = defaultdict(list)

    def _make_key(self, identifier: str, client_ip: str) -> str:
        return f"{identifier.strip().lower()}:{client_ip}"

    def check(self, identifier: str, client_ip: str) -> None:
        key = self._make_key(identifier, client_ip)
        now = get_utcnow()
        recent_failures = [t for t in self._failures[key] if (now - t) < self.window]
        self._failures[key] = recent_failures

        if len(recent_failures) >= self.max_attempts:
            raise RateLimitError(
                "Too many failed login attempts. Account temporarily locked for 10 minutes."
            )

    def record_failure(self, identifier: str, client_ip: str) -> None:
        key = self._make_key(identifier, client_ip)
        now = get_utcnow()
        self._failures[key].append(now)

    def record_success(self, identifier: str, client_ip: str) -> None:
        key = self._make_key(identifier, client_ip)
        if key in self._failures:
            del self._failures[key]

    def reset_all(self) -> None:
        """Helper for test suites."""
        self._failures.clear()

login_rate_limiter = LoginRateLimiter()
