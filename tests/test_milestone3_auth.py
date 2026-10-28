import pytest
from fastapi.testclient import TestClient
from fastapi import APIRouter, Depends

from app.main import app, api_router, create_app
from app.database import SessionLocal
from app.models.user import User, UserSession
from app.models.audit import AuditLog
from app.security.passwords import hash_password
from app.security.rate_limit import login_rate_limiter
from app.security.dependencies import require_roles, verify_csrf

# Router for testing RBAC and CSRF
rbac_test_router = APIRouter(prefix="/test-rbac")

@rbac_test_router.get("/admin-only", dependencies=[Depends(require_roles("ADMIN"))])
async def admin_only_endpoint():
    return {"message": "Hello Admin"}

@rbac_test_router.get("/manager-or-admin", dependencies=[Depends(require_roles("ADMIN", "MANAGER"))])
async def manager_or_admin_endpoint():
    return {"message": "Hello Manager or Admin"}

@rbac_test_router.post("/state-change", dependencies=[Depends(require_roles("ADMIN")), Depends(verify_csrf)])
async def state_change_endpoint():
    return {"status": "success"}

api_router.include_router(rbac_test_router)

@pytest.fixture(autouse=True)
def setup_users():
    login_rate_limiter.reset_all()
    session = SessionLocal()
    try:
        from tests.conftest import clear_all_tables
        clear_all_tables(session)

        u_admin = User(
            username="admin_test",
            password_hash=hash_password("AdminPass123!"),
            full_name="Admin Tester",
            role="ADMIN",
            active=True,
        )
        u_mgr = User(
            username="manager_test",
            password_hash=hash_password("ManagerPass123!"),
            full_name="Manager Tester",
            role="MANAGER",
            active=True,
        )
        u_sales = User(
            username="sales_test",
            password_hash=hash_password("SalesPass123!"),
            full_name="Sales Tester",
            role="SALES_STAFF",
            active=True,
        )
        u_purchase = User(
            username="purchase_test",
            password_hash=hash_password("PurchasePass123!"),
            full_name="Purchase Tester",
            role="PURCHASE_STAFF",
            active=True,
        )
        session.add_all([u_admin, u_mgr, u_sales, u_purchase])
        session.commit()
    finally:
        session.close()

def test_login_success_and_no_password_hash(client: TestClient):
    resp = client.post("/api/auth/login", json={"username": "admin_test", "password": "AdminPass123!"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["message"] == "Authentication successful"
    assert "user" in data
    assert data["user"]["username"] == "admin_test"
    assert "password" not in data["user"]
    assert "password_hash" not in data["user"]
    assert "csrf_token" in data
    assert "session_token" in resp.cookies

def test_login_failure_and_rate_limiting(client: TestClient):
    for _ in range(5):
        resp = client.post("/api/auth/login", json={"username": "admin_test", "password": "WrongPassword!"})
        assert resp.status_code == 401
        data = resp.json()
        assert data["error"] == "UNAUTHORIZED"

    resp6 = client.post("/api/auth/login", json={"username": "admin_test", "password": "WrongPassword!"})
    assert resp6.status_code == 429
    assert resp6.json()["error"] == "RATE_LIMIT_EXCEEDED"

def test_auth_me_and_logout(client: TestClient):
    login_resp = client.post("/api/auth/login", json={"username": "manager_test", "password": "ManagerPass123!"})
    assert login_resp.status_code == 200

    me_resp = client.get("/api/auth/me")
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["username"] == "manager_test"
    assert me_data["role"] == "MANAGER"

    logout_resp = client.post("/api/auth/logout")
    assert logout_resp.status_code == 200

    me_resp_after = client.get("/api/auth/me")
    assert me_resp_after.status_code == 401

def test_role_based_access_control(client: TestClient):
    client.post("/api/auth/login", json={"username": "sales_test", "password": "SalesPass123!"})
    
    resp_admin = client.get("/api/test-rbac/admin-only")
    assert resp_admin.status_code == 403
    assert resp_admin.json()["error"] == "FORBIDDEN"

    resp_mgr = client.get("/api/test-rbac/manager-or-admin")
    assert resp_mgr.status_code == 403

    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"username": "manager_test", "password": "ManagerPass123!"})

    assert client.get("/api/test-rbac/admin-only").status_code == 403
    assert client.get("/api/test-rbac/manager-or-admin").status_code == 200

def test_csrf_protection(client: TestClient):
    login_resp = client.post("/api/auth/login", json={"username": "admin_test", "password": "AdminPass123!"})
    csrf_token = login_resp.json()["csrf_token"]

    post_no_csrf = client.post("/api/test-rbac/state-change")
    assert post_no_csrf.status_code == 403

    post_bad_csrf = client.post("/api/test-rbac/state-change", headers={"X-CSRF-Token": "bogus-token"})
    assert post_bad_csrf.status_code == 403

    post_valid_csrf = client.post("/api/test-rbac/state-change", headers={"X-CSRF-Token": csrf_token})
    assert post_valid_csrf.status_code == 200
    assert post_valid_csrf.json()["status"] == "success"
