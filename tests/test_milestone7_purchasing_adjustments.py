import pytest
from datetime import date, timedelta
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.clock import set_test_clock
from app.models.user import User
from app.models.medicine import Medicine, Supplier
from app.models.batch import Batch
from app.models.purchasing import PurchaseRequest, PurchaseOrder, GoodsReceipt
from app.models.stock import StockAdjustment, StockTransaction
from app.security.passwords import hash_password

FIXED_TODAY = date(2026, 10, 27)

@pytest.fixture(autouse=True)
def setup_procurement_test():
    set_test_clock(override_date=FIXED_TODAY)
    session = SessionLocal()
    try:
        from tests.conftest import clear_all_tables
        clear_all_tables(session)

        mgr_a = User(
            username="manager_a",
            password_hash=hash_password("MgrPass12345!"),
            full_name="Manager Alice",
            role="MANAGER",
            active=True,
        )
        mgr_b = User(
            username="manager_b",
            password_hash=hash_password("MgrPass12345!"),
            full_name="Manager Bob",
            role="MANAGER",
            active=True,
        )
        purchase_staff = User(
            username="buyer_1",
            password_hash=hash_password("BuyerPass123!"),
            full_name="Buyer One",
            role="PURCHASE_STAFF",
            active=True,
        )
        session.add_all([mgr_a, mgr_b, purchase_staff])
        session.commit()
    finally:
        session.close()

def login(client: TestClient, username: str, password: str = "MgrPass12345!") -> str:
    resp = client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200
    return resp.json()["csrf_token"]

def test_purchase_request_self_approval_blocked_and_approved(client: TestClient):
    session = SessionLocal()
    try:
        med = Medicine(
            name="Amoxicillin 250mg",
            category="Antibiotic",
            strength="250mg",
            unit="Capsule",
            reorder_level=20,
            selling_price=500,
            active=True,
        )
        session.add(med)
        session.commit()
        med_id = med.id
    finally:
        session.close()

    # Manager A creates request
    csrf_a = login(client, "manager_a")
    resp_pr = client.post("/api/purchase-requests", json={
        "items": [{"medicine_id": med_id, "quantity_requested": 100, "notes": "Low stock replenishment"}]
    }, headers={"X-CSRF-Token": csrf_a})
    assert resp_pr.status_code == 200
    pr_id = resp_pr.json()["id"]

    # Manager A attempts to approve own request -> BLOCKED!
    resp_self_app = client.post(f"/api/purchase-requests/{pr_id}/approve", headers={"X-CSRF-Token": csrf_a})
    assert resp_self_app.status_code == 400
    assert "Self-approval" in resp_self_app.json()["message"]

    # Manager B logs in and approves -> SUCCESS
    csrf_b = login(client, "manager_b")
    resp_b_app = client.post(f"/api/purchase-requests/{pr_id}/approve", headers={"X-CSRF-Token": csrf_b})
    assert resp_b_app.status_code == 200

    # Stock must NOT have changed on PR approval
    session = SessionLocal()
    try:
        pr = session.query(PurchaseRequest).filter(PurchaseRequest.id == pr_id).first()
        assert pr.status == "APPROVED"
        assert session.query(Batch).count() == 0
    finally:
        session.close()

def test_goods_receipt_workflow_and_validations(client: TestClient):
    session = SessionLocal()
    try:
        supp = Supplier(
            name="MediLife Pharma",
            contact_person="Kiran",
            email="kiran@medilife.com",
            phone="9876543210",
            address="Mumbai",
            active=True,
        )
        med = Medicine(
            name="Ceftriaxone 1g",
            category="Antibiotic",
            strength="1g",
            unit="Vial",
            reorder_level=10,
            selling_price=4500,
            active=True,
        )
        session.add_all([supp, med])
        session.commit()
        supp_id = supp.id
        med_id = med.id
    finally:
        session.close()

    csrf_buyer = login(client, "buyer_1", "BuyerPass123!")

    # 1. Raise PO
    resp_po = client.post("/api/purchase-orders", json={
        "supplier_id": supp_id,
        "items": [{"medicine_id": med_id, "quantity_ordered": 50, "unit_price": 2500}]
    }, headers={"X-CSRF-Token": csrf_buyer})
    assert resp_po.status_code == 200
    po_data = resp_po.json()
    po_id = po_data["id"]
    po_item_id = po_data["items"][0]["id"]

    # 2. Goods receipt with expired date -> REJECTED
    resp_exp = client.post("/api/goods-receipts", json={
        "po_id": po_id,
        "items": [{
            "po_item_id": po_item_id,
            "batch_number": "BAD-EXP",
            "expiry_date": (FIXED_TODAY - timedelta(days=1)).isoformat(),  # Expired!
            "quantity_received": 50,
            "purchase_price": 2500,
        }]
    }, headers={"X-CSRF-Token": csrf_buyer})
    assert resp_exp.status_code == 400

    # 3. Goods receipt with excess quantity -> REJECTED
    resp_excess = client.post("/api/goods-receipts", json={
        "po_id": po_id,
        "items": [{
            "po_item_id": po_item_id,
            "batch_number": "EXCESS-LOT",
            "expiry_date": (FIXED_TODAY + timedelta(days=365)).isoformat(),
            "quantity_received": 100,  # Ordered only 50!
            "purchase_price": 2500,
        }]
    }, headers={"X-CSRF-Token": csrf_buyer})
    assert resp_excess.status_code == 400

    # 4. Valid goods receipt (50 units) -> SUCCESS
    resp_valid = client.post("/api/goods-receipts", json={
        "po_id": po_id,
        "items": [{
            "po_item_id": po_item_id,
            "batch_number": "CEF-2026-B1",
            "expiry_date": (FIXED_TODAY + timedelta(days=365)).isoformat(),
            "quantity_received": 50,
            "purchase_price": 2500,
        }]
    }, headers={"X-CSRF-Token": csrf_buyer})
    assert resp_valid.status_code == 200

    # Stock increased, batch created, PO marked RECEIVED
    session = SessionLocal()
    try:
        batch = session.query(Batch).filter(Batch.batch_number == "CEF-2026-B1").first()
        assert batch is not None
        assert batch.quantity_available == 50

        po = session.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
        assert po.status == "RECEIVED"

        # Check stock transaction ledger
        tx = session.query(StockTransaction).filter(StockTransaction.transaction_type == "RECEIPT").first()
        assert tx.signed_quantity == 50
    finally:
        session.close()

def test_stock_adjustment_review_workflow(client: TestClient):
    session = SessionLocal()
    try:
        med = Medicine(
            name="Insulin Regular 100IU",
            category="Endocrine",
            strength="100IU",
            unit="Vial",
            reorder_level=10,
            selling_price=3000,
            active=True,
        )
        session.add(med)
        session.commit()

        batch = Batch(
            medicine_id=med.id,
            batch_number="INS-ADJ-01",
            expiry_date=FIXED_TODAY + timedelta(days=180),
            quantity_received=20,
            quantity_available=20,
            purchase_price=1800,
            status="ACTIVE",
        )
        session.add(batch)
        session.commit()
        b_id = batch.id
    finally:
        session.close()

    csrf_buyer = login(client, "buyer_1", "BuyerPass123!")

    # Request -4 units due to accidental breakage
    resp_adj = client.post("/api/stock-adjustments", json={
        "batch_id": b_id,
        "adjusted_quantity": -4,
        "reason": "Cold chain dropped during restocking; broken vials"
    }, headers={"X-CSRF-Token": csrf_buyer})
    assert resp_adj.status_code == 200
    adj_id = resp_adj.json()["id"]

    # Stock must NOT be adjusted yet
    session = SessionLocal()
    try:
        b_check = session.query(Batch).filter(Batch.id == b_id).first()
        assert b_check.quantity_available == 20
    finally:
        session.close()

    # Manager approves
    csrf_mgr = login(client, "manager_a")
    resp_app = client.post(f"/api/stock-adjustments/{adj_id}/approve", headers={"X-CSRF-Token": csrf_mgr})
    assert resp_app.status_code == 200

    # Stock should now be 16
    session = SessionLocal()
    try:
        b_final = session.query(Batch).filter(Batch.id == b_id).first()
        assert b_final.quantity_available == 16

        # Check transaction ledger
        tx = session.query(StockTransaction).filter(StockTransaction.transaction_type == "ADJUSTMENT").first()
        assert tx.signed_quantity == -4
    finally:
        session.close()
