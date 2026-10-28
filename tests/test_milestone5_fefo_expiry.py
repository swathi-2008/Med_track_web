import pytest
from datetime import date, timedelta
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.clock import set_test_clock, get_today
from app.models.user import User, UserSession
from app.models.medicine import Medicine
from app.models.batch import Batch
from app.models.stock import StockTransaction
from app.models.audit import AuditLog
from app.security.passwords import hash_password
from app.services.expiry_service import classify_expiry, get_expiry_risk_report
from app.services.stock_service import get_eligible_batches_for_sale, calculate_fefo_allocation

FIXED_TODAY = date(2026, 10, 27)

@pytest.fixture(autouse=True)
def setup_test_data():
    set_test_clock(override_date=FIXED_TODAY)
    session = SessionLocal()
    try:
        from tests.conftest import clear_all_tables
        clear_all_tables(session)

        admin = User(
            username="admin_expiry",
            password_hash=hash_password("AdminPass123!"),
            full_name="Admin Expiry",
            role="ADMIN",
            active=True,
        )
        session.add(admin)
        session.commit()
    finally:
        session.close()

def test_expiry_boundary_classification():
    today = FIXED_TODAY

    # -1: expired yesterday
    days, cat, act = classify_expiry(today - timedelta(days=1), today)
    assert days == -1
    assert cat == "EXPIRED"

    # 0: expiring today
    days, cat, act = classify_expiry(today, today)
    assert days == 0
    assert cat == "CRITICAL"

    # 7: boundary of critical
    days, cat, act = classify_expiry(today + timedelta(days=7), today)
    assert days == 7
    assert cat == "CRITICAL"

    # 8: start of high
    days, cat, act = classify_expiry(today + timedelta(days=8), today)
    assert days == 8
    assert cat == "HIGH"

    # 30: boundary of high
    days, cat, act = classify_expiry(today + timedelta(days=30), today)
    assert days == 30
    assert cat == "HIGH"

    # 31: start of medium
    days, cat, act = classify_expiry(today + timedelta(days=31), today)
    assert days == 31
    assert cat == "MEDIUM"

    # 60: boundary of medium
    days, cat, act = classify_expiry(today + timedelta(days=60), today)
    assert days == 60
    assert cat == "MEDIUM"

    # 61: low risk
    days, cat, act = classify_expiry(today + timedelta(days=61), today)
    assert days == 61
    assert cat == "LOW"

def test_zero_quantity_batch_excluded_from_wastage():
    session = SessionLocal()
    try:
        med = Medicine(
            name="Azithromycin 250mg",
            category="Antibiotic",
            strength="250mg",
            unit="Tablet",
            reorder_level=20,
            selling_price=2000,
            active=True,
        )
        session.add(med)
        session.commit()

        # Batch 1: Expiring in 3 days, but quantity is 0 (fully sold out)
        b_empty = Batch(
            medicine_id=med.id,
            batch_number="AZI-001-EMPTY",
            expiry_date=FIXED_TODAY + timedelta(days=3),
            quantity_received=100,
            quantity_available=0,
            purchase_price=1200,
            status="ACTIVE",
        )
        # Batch 2: Expiring in 5 days, quantity 50
        b_active = Batch(
            medicine_id=med.id,
            batch_number="AZI-002-RISK",
            expiry_date=FIXED_TODAY + timedelta(days=5),
            quantity_received=50,
            quantity_available=50,
            purchase_price=1200,
            status="ACTIVE",
        )
        session.add_all([b_empty, b_active])
        session.commit()

        report = get_expiry_risk_report(session)
        # Only the batch with quantity_available > 0 is evaluated
        assert report["total_batches_evaluated"] == 1
        assert report["total_quantity_at_risk"] == 50
        assert report["total_value_at_risk"] == 50 * 1200
        assert report["items"][0]["batch_number"] == "AZI-002-RISK"
    finally:
        session.close()

def test_fefo_ordering_and_exclusions():
    session = SessionLocal()
    try:
        med = Medicine(
            name="Cetirizine 10mg",
            category="Antihistamine",
            strength="10mg",
            unit="Tablet",
            reorder_level=30,
            selling_price=350,
            active=True,
        )
        session.add(med)
        session.commit()

        # Expired batch: should NOT be eligible
        b_expired = Batch(
            medicine_id=med.id,
            batch_number="CET-EXPIRED",
            expiry_date=FIXED_TODAY - timedelta(days=2),
            quantity_received=50,
            quantity_available=50,
            purchase_price=150,
            status="ACTIVE",
        )
        # Quarantined batch: should NOT be eligible
        b_quarantined = Batch(
            medicine_id=med.id,
            batch_number="CET-QUARANTINED",
            expiry_date=FIXED_TODAY + timedelta(days=10),
            quantity_received=50,
            quantity_available=50,
            purchase_price=150,
            status="QUARANTINED",
        )
        # Batch 1 (expires in 20 days)
        b1 = Batch(
            medicine_id=med.id,
            batch_number="CET-EARLY",
            expiry_date=FIXED_TODAY + timedelta(days=20),
            quantity_received=40,
            quantity_available=40,
            purchase_price=150,
            status="ACTIVE",
        )
        # Batch 2 (expires in 80 days)
        b2 = Batch(
            medicine_id=med.id,
            batch_number="CET-LATE",
            expiry_date=FIXED_TODAY + timedelta(days=80),
            quantity_received=100,
            quantity_available=100,
            purchase_price=150,
            status="ACTIVE",
        )
        session.add_all([b_expired, b_quarantined, b1, b2])
        session.commit()

        eligible = get_eligible_batches_for_sale(session, med.id)
        assert len(eligible) == 2
        # Earliest first!
        assert eligible[0].batch_number == "CET-EARLY"
        assert eligible[1].batch_number == "CET-LATE"
    finally:
        session.close()

def test_fefo_multi_batch_split_allocation(client: TestClient):
    session = SessionLocal()
    try:
        med = Medicine(
            name="Omeprazole 20mg",
            category="Antacid",
            strength="20mg",
            unit="Capsule",
            reorder_level=25,
            selling_price=800,  # ₹8.00
            active=True,
        )
        session.add(med)
        session.commit()

        b1 = Batch(
            medicine_id=med.id,
            batch_number="OME-B1",
            expiry_date=FIXED_TODAY + timedelta(days=15),
            quantity_received=25,
            quantity_available=25,
            purchase_price=400,
            status="ACTIVE",
        )
        b2 = Batch(
            medicine_id=med.id,
            batch_number="OME-B2",
            expiry_date=FIXED_TODAY + timedelta(days=60),
            quantity_received=50,
            quantity_available=50,
            purchase_price=400,
            status="ACTIVE",
        )
        session.add_all([b1, b2])
        session.commit()

        # Request 40 units: should take 25 from B1 and 15 from B2
        alloc = calculate_fefo_allocation(session, med.id, requested_quantity=40)
        assert alloc["fulfillable"] is True
        assert alloc["shortage"] == 0
        assert len(alloc["allocations"]) == 2

        assert alloc["allocations"][0]["batch_number"] == "OME-B1"
        assert alloc["allocations"][0]["quantity"] == 25

        assert alloc["allocations"][1]["batch_number"] == "OME-B2"
        assert alloc["allocations"][1]["quantity"] == 15

        assert alloc["total_amount"] == 40 * 800  # 32000 paise (₹320.00)

        # Request 90 units: total available is 75 -> shortage 15
        alloc_short = calculate_fefo_allocation(session, med.id, requested_quantity=90)
        assert alloc_short["fulfillable"] is False
        assert alloc_short["shortage"] == 15
        assert alloc_short["total_available"] == 75
    finally:
        session.close()
