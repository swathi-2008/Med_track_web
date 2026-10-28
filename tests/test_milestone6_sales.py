import pytest
import concurrent.futures
from datetime import date, timedelta
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.clock import set_test_clock
from app.models.user import User
from app.models.medicine import Medicine
from app.models.batch import Batch
from app.models.sales import Sale, SaleItem
from app.models.stock import StockTransaction
from app.security.passwords import hash_password
from app.services.sales_service import process_sale
from app.schemas.sales import SaleCreateRequest, SaleItemRequest

FIXED_TODAY = date(2026, 10, 27)

@pytest.fixture(autouse=True)
def setup_sales_test():
    set_test_clock(override_date=FIXED_TODAY)
    session = SessionLocal()
    try:
        from tests.conftest import clear_all_tables
        clear_all_tables(session)

        sales_user = User(
            username="cashier_1",
            password_hash=hash_password("CashierPass123!"),
            full_name="Cashier One",
            role="SALES_STAFF",
            active=True,
        )
        admin_user = User(
            username="admin_sales",
            password_hash=hash_password("AdminPass123!"),
            full_name="Admin Sales",
            role="ADMIN",
            active=True,
        )
        session.add_all([sales_user, admin_user])
        session.commit()
    finally:
        session.close()

def login_as(client: TestClient, username: str, password: str = "CashierPass123!") -> str:
    resp = client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200
    return resp.json()["csrf_token"]

def test_successful_fefo_sale_and_ledger(client: TestClient):
    session = SessionLocal()
    try:
        med = Medicine(
            name="Pantoprazole 40mg",
            category="Gastrointestinal",
            strength="40mg",
            unit="Tablet",
            reorder_level=20,
            selling_price=1200,  # ₹12.00
            active=True,
        )
        session.add(med)
        session.commit()

        # Batch 1 (expires in 10 days, qty 15)
        b1 = Batch(
            medicine_id=med.id,
            batch_number="PAN-LOT-01",
            expiry_date=FIXED_TODAY + timedelta(days=10),
            quantity_received=15,
            quantity_available=15,
            purchase_price=600,
            status="ACTIVE",
        )
        # Batch 2 (expires in 50 days, qty 50)
        b2 = Batch(
            medicine_id=med.id,
            batch_number="PAN-LOT-02",
            expiry_date=FIXED_TODAY + timedelta(days=50),
            quantity_received=50,
            quantity_available=50,
            purchase_price=600,
            status="ACTIVE",
        )
        session.add_all([b1, b2])
        session.commit()
        med_id = med.id
        b1_id = b1.id
        b2_id = b2.id
    finally:
        session.close()

    csrf = login_as(client, "cashier_1")

    # Purchase 20 units -> 15 from B1, 5 from B2
    payload = {
        "items": [
            {"medicine_id": med_id, "quantity": 20}
        ]
    }
    resp = client.post("/api/sales", json=payload, headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "COMPLETED"
    assert data["reference_number"].startswith("SAL-20261027-")
    assert data["total_amount"] == 20 * 1200
    assert len(data["items"]) == 2

    # Verify DB stock updates and transactions
    session = SessionLocal()
    try:
        batch1 = session.query(Batch).filter(Batch.id == b1_id).first()
        batch2 = session.query(Batch).filter(Batch.id == b2_id).first()
        assert batch1.quantity_available == 0
        assert batch2.quantity_available == 45

        # Check stock transactions created
        txs = session.query(StockTransaction).filter(StockTransaction.reference_type == "SALE").all()
        assert len(txs) == 2
        assert sum(tx.signed_quantity for tx in txs) == -20
    finally:
        session.close()

def test_sale_insufficient_stock_rollback(client: TestClient):
    session = SessionLocal()
    try:
        med = Medicine(
            name="Doxycycline 100mg",
            category="Antibiotics",
            strength="100mg",
            unit="Capsule",
            reorder_level=10,
            selling_price=1500,
            active=True,
        )
        session.add(med)
        session.commit()

        b = Batch(
            medicine_id=med.id,
            batch_number="DOX-01",
            expiry_date=FIXED_TODAY + timedelta(days=90),
            quantity_received=10,
            quantity_available=10,
            purchase_price=800,
            status="ACTIVE",
        )
        session.add(b)
        session.commit()
        med_id = med.id
        b_id = b.id
    finally:
        session.close()

    csrf = login_as(client, "cashier_1")

    # Attempt to purchase 25 (only 10 available)
    resp = client.post("/api/sales", json={"items": [{"medicine_id": med_id, "quantity": 25}]}, headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 400
    assert resp.json()["error"] == "BUSINESS_RULE_VIOLATION"

    # Verify no partial deduction occurred
    session = SessionLocal()
    try:
        batch = session.query(Batch).filter(Batch.id == b_id).first()
        assert batch.quantity_available == 10
        sales_count = session.query(Sale).count()
        assert sales_count == 0
    finally:
        session.close()

def test_idempotent_sale_deduplication(client: TestClient):
    session = SessionLocal()
    try:
        med = Medicine(
            name="Aspirin 75mg",
            category="Cardiovascular",
            strength="75mg",
            unit="Tablet",
            reorder_level=50,
            selling_price=200,
            active=True,
        )
        session.add(med)
        session.commit()

        b = Batch(
            medicine_id=med.id,
            batch_number="ASP-IDEM-01",
            expiry_date=FIXED_TODAY + timedelta(days=180),
            quantity_received=100,
            quantity_available=100,
            purchase_price=100,
            status="ACTIVE",
        )
        session.add(b)
        session.commit()
        med_id = med.id
        b_id = b.id
    finally:
        session.close()

    csrf = login_as(client, "cashier_1")
    key = "UNIQUE-IDEMPOTENCY-KEY-12345"

    payload = {"items": [{"medicine_id": med_id, "quantity": 10}]}

    # First request
    resp1 = client.post("/api/sales", json=payload, headers={"X-CSRF-Token": csrf, "Idempotency-Key": key})
    assert resp1.status_code == 200
    ref1 = resp1.json()["reference_number"]

    # Second request with identical key
    resp2 = client.post("/api/sales", json=payload, headers={"X-CSRF-Token": csrf, "Idempotency-Key": key})
    assert resp2.status_code == 200
    ref2 = resp2.json()["reference_number"]

    assert ref1 == ref2

    # Stock should only have decreased by 10 (not 20!)
    session = SessionLocal()
    try:
        batch = session.query(Batch).filter(Batch.id == b_id).first()
        assert batch.quantity_available == 90
        assert session.query(Sale).count() == 1
    finally:
        session.close()

def test_concurrent_sales_never_negative_stock():
    """
    Spawns concurrent worker threads attempting to buy from a batch with limited stock.
    Stock must never go below 0 and rowcount check guarantees serialized deductions.
    """
    session = SessionLocal()
    try:
        med = Medicine(
            name="Rare Injection 500mcg",
            category="Emergency",
            strength="500mcg",
            unit="Vial",
            reorder_level=5,
            selling_price=5000,
            active=True,
        )
        session.add(med)
        session.commit()

        batch = Batch(
            medicine_id=med.id,
            batch_number="CONCUR-LOT-01",
            expiry_date=FIXED_TODAY + timedelta(days=30),
            quantity_received=25,
            quantity_available=25,  # Only 25 available
            purchase_price=3000,
            status="ACTIVE",
        )
        session.add(batch)
        session.commit()

        user = session.query(User).filter(User.username == "cashier_1").first()
        user_id = user.id
        med_id = med.id
        batch_id = batch.id
    finally:
        session.close()

    # 10 workers each trying to buy 5 units (total requested = 50 units, but only 25 exist!)
    successes = 0
    failures = 0

    def attempt_sale():
        db = SessionLocal()
        try:
            req = SaleCreateRequest(items=[SaleItemRequest(medicine_id=med_id, quantity=5, batch_id=batch_id)])
            process_sale(db, req, user_id=user_id)
            return True
        except Exception:
            return False
        finally:
            db.close()

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(attempt_sale) for _ in range(10)]
        for f in concurrent.futures.as_completed(futures):
            if f.result():
                successes += 1
            else:
                failures += 1

    # Exactly 5 transactions should succeed (5 * 5 = 25 units) and 5 should fail
    assert successes == 5
    assert failures == 5

    # Final stock must be exactly 0, never negative!
    session = SessionLocal()
    try:
        final_batch = session.query(Batch).filter(Batch.id == batch_id).first()
        assert final_batch.quantity_available == 0
    finally:
        session.close()
