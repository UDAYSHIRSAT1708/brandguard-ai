import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["healthy", "unconfigured"]
    assert "service" in data
    assert "providers" in data
    assert "primary" in data["providers"]
    assert "fallback" in data["providers"]
    assert data["providers"]["primary"]["provider"] == "gemini"
    assert data["providers"]["fallback"]["provider"] == "groq"
    assert "llama" in data["providers"]["fallback"]["model"].lower()
    # Ensure raw API keys are never leaked in response
    assert "api_key" not in str(data).lower()

def test_internal_auth_missing_header():
    response = client.get("/api/v1/verify-auth")
    assert response.status_code == 401

def test_internal_auth_invalid_header():
    response = client.get(
        "/api/v1/verify-auth",
        headers={"X-Internal-API-Key": "completely-wrong-key"}
    )
    assert response.status_code == 403

def test_internal_auth_valid_header():
    from app.core.config import settings
    response = client.get(
        "/api/v1/verify-auth",
        headers={"X-Internal-API-Key": settings.AI_SERVICE_API_KEY}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "authenticated"
