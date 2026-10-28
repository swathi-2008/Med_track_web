import pytest
from datetime import date, timedelta
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.clock import set_test_clock
from app.models.user import User
from app.models.medicine import Medicine, Supplier
from app.models.batch import Batch
from app.models.sales import Sale, SaleItem
from app.models.audit import AuditLog
from app.security.passwords import hash_password
from app.services.report_service import sanitize_csv_cell

FIXED_TODAY = date(2026, 10, 27)

@pytest.fixture(autouse=True)
def setup_m9_test():
    set_test_clock(override_date=FIXED_TODAY)
    session = SessionLocal()
    try:
        from tests.conftest import clear_all_tables
        clear_all_tables(session)

        # Admin user
        admin = User(
            username="admin_m9",
            password_hash=hash_password("AdminSecurePass123!"),
            full_name="Admin M9",
            role="ADMIN",
            active=True,
        )
        # Sales user
        sales = User(
            username="sales_m9",
            password_hash=hash_password("SalesSecurePass123!"),
            full_name="Sales M9",
            role="SALES_STAFF",
            active=True,
        )
        session.add_all([admin, sales])
        session.commit()
    finally:
        session.close()

def login_and_get_client(client: TestClient, username: str, password: str):
    res = client.post("/api/auth/login", json={"username": username, "password": password})
    assert res.status_code == 200
    token = res.json()["csrf_token"]
    client.headers.update({"X-CSRF-Token": token})
    return client

def test_last_active_admin_protection(client: TestClient):
    client = login_and_get_client(client, "admin_m9", "AdminSecurePass123!")

    # 1. Fetch users
    res = client.get("/api/users")
    assert res.status_code == 200
    users = res.json()
    admin_user = next(u for u in users if u["username"] == "admin_m9")

    # 2. Try to deactivate the only active admin via patch
    res_deact = client.patch(f"/api/users/{admin_user['id']}/status", json={"active": False})
    assert res_deact.status_code == 400
    assert "last active administrator" in res_deact.json()["message"].lower()

    # 3. Try to demote the only active admin to SALES_STAFF via put
    res_demote = client.put(f"/api/users/{admin_user['id']}", json={"role": "SALES_STAFF"})
    assert res_demote.status_code == 400
    assert "last active administrator" in res_demote.json()["message"].lower()

    # 4. Create a second admin
    res_create = client.post("/api/users", json={
        "username": "admin_two",
        "password": "SecondAdminPass123!",
        "full_name": "Second Administrator",
        "role": "ADMIN",
    })
    assert res_create.status_code == 201
    second_admin = res_create.json()

    # 5. Now deactivating the second admin works because there are 2 active admins
    res_deact2 = client.patch(f"/api/users/{second_admin['id']}/status", json={"active": False})
    assert res_deact2.status_code == 200
    assert res_deact2.json()["active"] is False

def test_sales_staff_forbidden_from_admin_areas(client: TestClient):
    client = login_and_get_client(client, "sales_m9", "SalesSecurePass123!")

    # Users endpoint
    res_users = client.get("/api/users")
    assert res_users.status_code == 403

    # Audit logs endpoint
    res_audit = client.get("/api/audit-logs")
    assert res_audit.status_code == 403

def test_dashboard_metrics_and_trends(client: TestClient):
    session = SessionLocal()
    try:
        med = Medicine(
            name="Amoxicillin 500mg",
            category="Antibiotic",
            strength="500mg",
            unit="Capsule",
            reorder_level=20,
            selling_price=1000,
            active=True,
        )
        session.add(med)
        session.commit()

        # Batch 1: Expired
        b1 = Batch(
            medicine_id=med.id,
            batch_number="AMX-EXP",
            expiry_date=FIXED_TODAY - timedelta(days=2),
            quantity_received=10,
            quantity_available=10,
            purchase_price=500,
            status="ACTIVE",
        )
        # Batch 2: Near expiry (critical <= 7d)
        b2 = Batch(
            medicine_id=med.id,
            batch_number="AMX-CRIT",
            expiry_date=FIXED_TODAY + timedelta(days=4),
            quantity_received=15,
            quantity_available=15,
            purchase_price=500,
            status="ACTIVE",
        )
        session.add_all([b1, b2])
        session.commit()
    finally:
        session.close()

    client = login_and_get_client(client, "admin_m9", "AdminSecurePass123!")

    # Summary
    res_sum = client.get("/api/dashboard/summary")
    assert res_sum.status_code == 200
    m = res_sum.json()["metrics"]
    assert m["active_medicines"] >= 1
    assert m["expired_lots_count"] == 1
    assert m["critical_lots_count"] == 1

    # Trends
    res_trend = client.get("/api/dashboard/sales-trend")
    assert res_trend.status_code == 200
    assert len(res_trend.json()) == 7

    # Expiry Breakdown
    res_exp = client.get("/api/dashboard/expiry-breakdown")
    assert res_exp.status_code == 200
    exp_data = res_exp.json()
    assert exp_data["expired"]["count"] == 1
    assert exp_data["critical_7d"]["count"] == 1

def test_reports_and_csv_formula_injection_protection(client: TestClient):
    # Test formula neutralization function directly
    assert sanitize_csv_cell("=cmd|' /C calc'!A0") == "'=cmd|' /C calc'!A0"
    assert sanitize_csv_cell("+12345") == "'+12345"
    assert sanitize_csv_cell("-50") == "'-50"
    assert sanitize_csv_cell("@SUM(A1)") == "'@SUM(A1)"
    assert sanitize_csv_cell("Normal Text") == "Normal Text"

    session = SessionLocal()
    try:
        med = Medicine(
            name="=DANGEROUS_FORMULA()",
            category="General",
            strength="10mg",
            unit="Tablet",
            reorder_level=10,
            selling_price=500,
            active=True,
        )
        session.add(med)
        session.commit()
    finally:
        session.close()

    client = login_and_get_client(client, "admin_m9", "AdminSecurePass123!")

    # JSON Inventory report
    res_json = client.get("/api/reports/inventory?format=json")
    assert res_json.status_code == 200
    data = res_json.json()
    assert "summary" in data
    assert any(r["name"] == "=DANGEROUS_FORMULA()" for r in data["records"])

    # CSV Inventory report
    res_csv = client.get("/api/reports/inventory?format=csv")
    assert res_csv.status_code == 200
    assert res_csv.headers["content-type"].startswith("text/csv")
    csv_text = res_csv.text
    # Ensure formula cell was sanitized with leading quote
    assert "'=DANGEROUS_FORMULA()" in csv_text
