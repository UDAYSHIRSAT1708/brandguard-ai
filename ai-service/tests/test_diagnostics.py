import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch, MagicMock
from app.main import app
from app.core.config import settings

client = TestClient(app)

def test_diagnostics_unauthorized_without_key():
    response = client.post("/api/v1/diagnostics/run")
    assert response.status_code == 401

def test_diagnostics_forbidden_with_invalid_key():
    response = client.post(
        "/api/v1/diagnostics/run",
        headers={"X-Internal-API-Key": "wrong-internal-key"}
    )
    assert response.status_code == 403

def test_diagnostics_run_success():
    headers = {"X-Internal-API-Key": settings.AI_SERVICE_API_KEY}
    response = client.post(
        "/api/v1/diagnostics/run?test_generation=false&test_failover=false",
        headers=headers
    )
    assert response.status_code == 200
    data = response.json()
    assert "overall_status" in data
    assert "tiers" in data
    assert "reachable" in data["tiers"]
    assert "configured" in data["tiers"]
    assert "authenticated" in data["tiers"]
    assert "generation_verified" in data["tiers"]
    assert "end_to_end_verified" in data["tiers"]
    assert "providers" in data
    assert "primary" in data["providers"]
    assert "fallback" in data["providers"]
    assert data["providers"]["primary"]["provider"] == "gemini"
    assert data["providers"]["fallback"]["provider"] == "groq"
    assert "rag_retrieval" in data
    assert data["rag_retrieval"]["tenant_isolation_verified"] is True
    assert data["rag_retrieval"]["approval_status_filter_verified"] is True
    assert "api_key" not in str(data).lower()
    assert "secret" not in str(data).lower()

@pytest.mark.asyncio
async def test_diagnostics_generation_probe_mock():
    headers = {"X-Internal-API-Key": settings.AI_SERVICE_API_KEY}
    with patch("app.providers.gemini_provider.GeminiProvider.is_configured", return_value=True):
        with patch(
            "app.providers.gemini_provider.GeminiProvider.check_connectivity",
            AsyncMock(return_value={"configured": True, "connected": True, "latency_ms": 45, "error": None})
        ):
            with patch(
                "app.providers.gemini_provider.GeminiProvider.test_generation",
                AsyncMock(return_value={
                    "success": True,
                    "latency_ms": 120,
                    "model": "gemini-flash-lite-latest",
                    "sample_output": "OPERATIONAL",
                    "error": None,
                    "error_category": None
                })
            ):
                response = client.post(
                    "/api/v1/diagnostics/run?test_generation=true&test_failover=false",
                    headers=headers
                )
                assert response.status_code == 200
                data = response.json()
                assert data["providers"]["primary"]["generation_verified"] is True
                assert data["providers"]["primary"]["sample_output"] == "OPERATIONAL"
