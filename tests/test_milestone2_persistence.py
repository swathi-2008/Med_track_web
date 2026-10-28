import pytest
from datetime import date
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.database import SessionLocal, engine
from app.models.user import User
from app.models.medicine import Medicine, Supplier
from app.models.batch import Batch

def test_sqlite_pragmas():
    with engine.connect() as conn:
        fk_val = conn.execute(text("PRAGMA foreign_keys")).scalar()
        assert fk_val == 1

        timeout_val = conn.execute(text("PRAGMA busy_timeout")).scalar()
        assert timeout_val == 5000

        journal_mode = conn.execute(text("PRAGMA journal_mode")).scalar()
        assert journal_mode.upper() == "WAL"

def test_insert_and_query_medicine_and_batch():
    session = SessionLocal()
    try:
        med = Medicine(
            name="Amoxicillin 500mg",
            category="Antibiotics",
            strength="500mg",
            unit="Capsule",
            reorder_level=50,
            selling_price=1250,  # ₹12.50
            active=True,
        )
        session.add(med)
        session.commit()
        session.refresh(med)

        batch = Batch(
            medicine_id=med.id,
            batch_number="AMX-2026-001",
            expiry_date=date(2027, 6, 30),
            quantity_received=500,
            quantity_available=500,
            purchase_price=800,  # ₹8.00
            status="ACTIVE",
        )
        session.add(batch)
        session.commit()
        session.refresh(batch)

        assert batch.id is not None
        assert batch.quantity_available == 500
        assert batch.medicine.name == "Amoxicillin 500mg"
    finally:
        session.close()

def test_unique_batch_number_per_medicine():
    session = SessionLocal()
    try:
        med = Medicine(
            name="Paracetamol 650mg",
            category="Analgesics",
            strength="650mg",
            unit="Tablet",
            reorder_level=100,
            selling_price=300,
            active=True,
        )
        session.add(med)
        session.commit()
        session.refresh(med)

        b1 = Batch(
            medicine_id=med.id,
            batch_number="PCM-DUP-01",
            expiry_date=date(2027, 1, 1),
            quantity_received=100,
            quantity_available=100,
            purchase_price=150,
            status="ACTIVE",
        )
        session.add(b1)
        session.commit()

        b2 = Batch(
            medicine_id=med.id,
            batch_number="PCM-DUP-01",  # Duplicate!
            expiry_date=date(2027, 2, 1),
            quantity_received=100,
            quantity_available=100,
            purchase_price=150,
            status="ACTIVE",
        )
        session.add(b2)
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
    finally:
        session.close()

def test_foreign_key_enforcement():
    session = SessionLocal()
    try:
        b = Batch(
            medicine_id="non-existent-uuid-12345",
            batch_number="BAD-BATCH",
            expiry_date=date(2027, 1, 1),
            quantity_received=10,
            quantity_available=10,
            purchase_price=100,
            status="ACTIVE",
        )
        session.add(b)
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
    finally:
        session.close()

def test_check_constraint_negative_price_or_qty():
    session = SessionLocal()
    try:
        bad_med = Medicine(
            name="Bad Price Medicine",
            category="General",
            strength="10mg",
            unit="Tablet",
            reorder_level=10,
            selling_price=-50,  # Negative!
            active=True,
        )
        session.add(bad_med)
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
    finally:
        session.close()

def test_user_role_constraint():
    session = SessionLocal()
    try:
        bad_user = User(
            username="hacker_role",
            password_hash="dummyhash",
            full_name="Hacker",
            role="SUPER_ADMIN",  # Invalid role!
            active=True,
        )
        session.add(bad_user)
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
    finally:
        session.close()
