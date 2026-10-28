import pytest
from datetime import date, timedelta
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.models.user import User, UserSession
from app.models.medicine import Medicine, Supplier
from app.models.batch import Batch
from app.models.stock import StockTransaction
from app.models.audit import AuditLog
from app.security.passwords import hash_password
from app.clock import get_today

@pytest.fixture(autouse=True)
def clean_inventory_tables():
    session = SessionLocal()
    try:
        from tests.conftest import clear_all_tables
        clear_all_tables(session)

        # Create Admin and Sales staff
        admin = User(
            username="admin_user",
            password_hash=hash_password("AdminPass123!"),
            full_name="Admin Test",
            role="ADMIN",
            active=True,
        )
        sales = User(
            username="sales_user",
            password_hash=hash_password("SalesPass123!"),
            full_name="Sales Test",
            role="SALES_STAFF",
            active=True,
        )
        session.add_all([admin, sales])
        session.commit()
    finally:
        session.close()

def login_as(client: TestClient, username: str, password: str = "AdminPass123!") -> str:
    resp = client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200
    return resp.json()["csrf_token"]

def test_medicine_crud_and_duplicate_handling(client: TestClient):
    admin_csrf = login_as(client, "admin_user")

    # 1. Create medicine
    med_payload = {
        "name": "Metformin 500mg",
        "category": "Antidiabetic",
        "strength": "500mg",
        "unit": "Tablet",
        "reorder_level": 50,
        "selling_price": 500,  # ₹5.00
    }
    resp = client.post("/api/medicines", json=med_payload, headers={"X-CSRF-Token": admin_csrf})
    assert resp.status_code == 200
    med_data = resp.json()
    assert med_data["name"] == "Metformin 500mg"
    assert med_data["selling_price"] == 500
    assert med_data["selling_price_display"] == "₹5.00"
    med_id = med_data["id"]

    # 2. Duplicate creation should fail with 409 CONFLICT
    resp_dup = client.post("/api/medicines", json=med_payload, headers={"X-CSRF-Token": admin_csrf})
    assert resp_dup.status_code == 409
    assert resp_dup.json()["error"] == "CONFLICT"

    # 3. Update medicine
    update_payload = {
        "name": "Metformin SR 500mg",
        "category": "Antidiabetic",
        "strength": "500mg",
        "unit": "Tablet",
        "reorder_level": 60,
        "selling_price": 600,
        "active": True,
    }
    resp_update = client.put(f"/api/medicines/{med_id}", json=update_payload, headers={"X-CSRF-Token": admin_csrf})
    assert resp_update.status_code == 200
    assert resp_update.json()["name"] == "Metformin SR 500mg"
    assert resp_update.json()["reorder_level"] == 60

    # 4. Soft deactivate
    resp_deact = client.patch(f"/api/medicines/{med_id}/status", json={"active": False}, headers={"X-CSRF-Token": admin_csrf})
    assert resp_deact.status_code == 200
    assert resp_deact.json()["active"] is False

    # 5. List medicines
    resp_list = client.get("/api/medicines")
    assert resp_list.status_code == 200
    assert resp_list.json()["total"] == 1
    assert resp_list.json()["items"][0]["active"] is False

def test_sales_staff_cannot_create_or_edit_medicine(client: TestClient):
    sales_csrf = login_as(client, "sales_user", "SalesPass123!")

    resp = client.post("/api/medicines", json={
        "name": "Ibuprofen 400mg",
        "category": "Analgesic",
        "strength": "400mg",
        "unit": "Tablet",
        "reorder_level": 20,
        "selling_price": 300,
    }, headers={"X-CSRF-Token": sales_csrf})
    assert resp.status_code == 403
    assert resp.json()["error"] == "FORBIDDEN"

def test_supplier_crud(client: TestClient):
    admin_csrf = login_as(client, "admin_user")

    supp_payload = {
        "name": "Apex Pharma Distributors",
        "contact_person": "Vikram Patel",
        "email": "vikram@apexpharma.in",
        "phone": "+91 98765 43210",
        "address": "Plot 42, GIDC Industrial Estate, Ahmedabad",
    }
    resp = client.post("/api/suppliers", json=supp_payload, headers={"X-CSRF-Token": admin_csrf})
    assert resp.status_code == 200
    supp_data = resp.json()
    assert supp_data["name"] == "Apex Pharma Distributors"
    assert supp_data["active"] is True
    supp_id = supp_data["id"]

    # Duplicate supplier fails
    resp_dup = client.post("/api/suppliers", json=supp_payload, headers={"X-CSRF-Token": admin_csrf})
    assert resp_dup.status_code == 409

    # Get supplier
    resp_get = client.get(f"/api/suppliers/{supp_id}")
    assert resp_get.status_code == 200
    assert resp_get.json()["contact_person"] == "Vikram Patel"

def test_batch_creation_and_status_workflows(client: TestClient):
    admin_csrf = login_as(client, "admin_user")

    # Create active medicine first
    med_resp = client.post("/api/medicines", json={
        "name": "Ciprofloxacin 500mg",
        "category": "Antibiotics",
        "strength": "500mg",
        "unit": "Tablet",
        "reorder_level": 30,
        "selling_price": 1800,  # ₹18.00
    }, headers={"X-CSRF-Token": admin_csrf})
    assert med_resp.status_code == 200
    med_id = med_resp.json()["id"]

    # Add batch
    today = get_today()
    batch_payload = {
        "medicine_id": med_id,
        "batch_number": "CIP-2026-A1",
        "expiry_date": (today + timedelta(days=120)).isoformat(),
        "quantity_received": 200,
        "purchase_price": 1000,
    }
    b_resp = client.post("/api/batches", json=batch_payload, headers={"X-CSRF-Token": admin_csrf})
    assert b_resp.status_code == 200
    batch_data = b_resp.json()
    assert batch_data["batch_number"] == "CIP-2026-A1"
    assert batch_data["quantity_available"] == 200
    assert batch_data["status"] == "ACTIVE"
    assert batch_data["days_to_expiry"] == 120
    assert batch_data["risk_category"] == "LOW"
    batch_id = batch_data["id"]

    # Duplicate batch on same medicine fails
    dup_resp = client.post("/api/batches", json=batch_payload, headers={"X-CSRF-Token": admin_csrf})
    assert dup_resp.status_code == 409

    # Status change to QUARANTINED requires reason
    no_reason = client.patch(f"/api/batches/{batch_id}/status", json={
        "status": "QUARANTINED",
        "reason": "ab"  # Too short (< 3)
    }, headers={"X-CSRF-Token": admin_csrf})
    assert no_reason.status_code == 422

    # Valid status change
    valid_status = client.patch(f"/api/batches/{batch_id}/status", json={
        "status": "QUARANTINED",
        "reason": "Quality check hold pending packaging seal audit"
    }, headers={"X-CSRF-Token": admin_csrf})
    assert valid_status.status_code == 200
    assert valid_status.json()["status"] == "QUARANTINED"
