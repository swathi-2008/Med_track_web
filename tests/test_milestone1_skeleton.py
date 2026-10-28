from datetime import date
from fastapi.testclient import TestClient

from app.config import settings
from app.clock import get_today, set_test_clock
from app.errors import NotFoundError, create_error_response

def test_settings_loaded():
    assert settings.db_path is not None
    assert settings.session_absolute_hours == 8
    assert settings.expiry_critical_days == 7
    assert settings.replenishment_target_multiplier == 2.0

def test_clock_dependency_injection():
    fixed = date(2026, 5, 15)
    set_test_clock(override_date=fixed)
    assert get_today() == fixed

def test_error_response_shape():
    resp = create_error_response(404, "NOT_FOUND", "Batch missing", [{"field": "id", "message": "Missing"}])
    import json
    data = json.loads(resp.body)
    assert data["status"] == 404
    assert data["error"] == "NOT_FOUND"
    assert data["message"] == "Batch missing"
    assert len(data["fieldErrors"]) == 1
    assert "timestamp" in data

def test_health_check_endpoint(client: TestClient):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["app"] == "MedTrack"

def test_security_headers_present(client: TestClient):
    response = client.get("/api/health")
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("Referrer-Policy") == "same-origin"

def test_static_frontend_served(client: TestClient):
    resp_index = client.get("/")
    assert resp_index.status_code == 200
    assert "MedTrack" in resp_index.text

    resp_login = client.get("/login.html")
    assert resp_login.status_code == 200
    assert "Sign In" in resp_login.text
