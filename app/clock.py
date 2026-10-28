from datetime import date, datetime, timezone
from typing import Callable

_fixed_date: date | None = None
_fixed_datetime: datetime | None = None

def get_today() -> date:
    """Returns today's date in local system or test-fixed override."""
    global _fixed_date
    if _fixed_date is not None:
        return _fixed_date
    return date.today()

def get_utcnow() -> datetime:
    """Returns current UTC timestamp, or test-fixed override."""
    global _fixed_datetime
    if _fixed_datetime is not None:
        return _fixed_datetime
    return datetime.now(timezone.utc)

def set_test_clock(override_date: date | None = None, override_dt: datetime | None = None) -> None:
    """Helper for pytest fixtures to fix date/time deterministically."""
    global _fixed_date, _fixed_datetime
    _fixed_date = override_date
    _fixed_datetime = override_dt

def reset_test_clock() -> None:
    """Reset clock to system time."""
    global _fixed_date, _fixed_datetime
    _fixed_date = None
    _fixed_datetime = None
