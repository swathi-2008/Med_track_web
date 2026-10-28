import os
from contextlib import contextmanager
from typing import Generator
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from app.config import settings

# Ensure data directory exists
db_dir = os.path.dirname(settings.db_path)
if db_dir and not os.path.exists(db_dir):
    os.makedirs(db_dir, exist_ok=True)

sqlite_url = f"sqlite:///{settings.db_path}"

engine = create_engine(
    sqlite_url,
    connect_args={"check_same_thread": False},
    future=True,
    echo=False,
)

@event.listens_for(engine, "connect")
def set_sqlite_pragmas(dbapi_connection, connection_record):
    """
    Enforces SQLite foreign keys, WAL mode, and busy timeout for concurrent safety.
    """
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)

Base = declarative_base()

def get_db() -> Generator[Session, None, None]:
    """FastAPI request session dependency with clean auto-close."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@contextmanager
def get_db_context() -> Generator[Session, None, None]:
    """Standalone session context manager for CLI/scripts/seed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def begin_immediate(session: Session) -> None:
    """
    Begins an immediate write transaction in SQLite to prevent deadlock
    and ensure serializable concurrency for critical stock modifications.
    """
    session.execute(text("BEGIN IMMEDIATE"))
