import pytest
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch
from app.providers.groq_provider import GroqProvider, DEFAULT_GROQ_MODEL
from app.providers.manager import ProviderManager
from app.providers.base import BaseAIProvider
from app.models.schemas import (
    FindingCategory, 
    FindingSeverity, 
    ReviewResponse, 
    Finding, 
    FindingSummary
)

@pytest.fixture
def sample_evidence():
    return [
        {
            "id": "src_guideline_01",
            "title": "Prohibition of Absolute Guarantees",
            "sourceType": "guideline",
            "content": "Absolute performance guarantees are strictly prohibited across all marketing and product copy.",
        },
        {
            "id": "src_fact_01",
            "title": "Q3 Independent Accuracy Benchmark",
            "sourceType": "fact",
            "content": "Product accuracy was 94% in Test A under documented test conditions (Q3 2026).",
        },
    ]

def test_groq_missing_credentials_unconfigured():
    # Unconfigured when key is None, empty, placeholder, or wrong prefix
    provider_none = GroqProvider(api_key=None)
    assert not provider_none.is_configured()
    assert provider_none.client is None

    provider_empty = GroqProvider(api_key="")
    assert not provider_empty.is_configured()

    provider_placeholder = GroqProvider(api_key="your_groq_api_key_here")
    assert not provider_placeholder.is_configured()

    # Groq keys must strictly start with 'gsk_'
    provider_wrong_prefix = GroqProvider(api_key="wrong_prefix_not_gsk_dummy_test_key_12345")
    assert not provider_wrong_prefix.is_configured()

def test_groq_valid_credentials_configured():
    provider = GroqProvider(api_key="gsk_test_valid_dummy_key_length_30_chars")
    assert provider.is_configured()
    assert provider.provider_name == "groq"
    assert provider.model_name == DEFAULT_GROQ_MODEL
    assert provider.client is not None

@pytest.mark.asyncio
async def test_groq_unconfigured_raises_on_analyze(sample_evidence):
    provider = GroqProvider(api_key=None)
    with pytest.raises(ValueError) as exc:
        await provider.analyze_content(
            content_id="c1",
            organisation_id="o1",
            body="Our product guarantees 100% accuracy.",
            evidence=sample_evidence
        )
    assert "Groq API key is unconfigured" in str(exc.value)

@pytest.mark.asyncio
async def test_groq_success(sample_evidence):
    provider = GroqProvider(api_key="gsk_test_valid_dummy_key_length_30_chars")
    
    mock_payload = {
        "findings": [
            {
                "category": "guarantee",
                "severity": "critical",
                "flagged_text": "guarantees 100% accuracy",
                "explanation": "Absolute performance guarantees are strictly prohibited.",
                "guideline": "Prohibition of Absolute Guarantees",
                "source_ids": ["src_guideline_01", "src_hallucinated_99"],
                "source_excerpts": ["Absolute performance guarantees are strictly prohibited across all marketing and product copy."],
                "confidence": 0.97,
                "suggested_correction": "delivers up to 94% benchmarked accuracy",
                "requires_human_review": True
            }
        ],
        "recommendations": [
            {
                "id": "rec_01",
                "issue": "Prohibited guarantee claim",
                "rationale": "Claims of 100% accuracy violate marketing compliance.",
                "impact": "High regulatory risk",
                "evidence_sources": ["src_guideline_01"],
                "evidence_excerpts": ["Absolute performance guarantees are strictly prohibited across all marketing and product copy."],
                "suggested_correction": "delivers up to 94% benchmarked accuracy",
                "is_evidence_backed": True,
                "confidence": 0.97
            }
        ]
    }

    mock_chat_completion = MagicMock()
    mock_choice = MagicMock()
    mock_choice.message.content = json.dumps(mock_payload)
    mock_chat_completion.choices = [mock_choice]

    with patch.object(provider.client.chat.completions, "create", AsyncMock(return_value=mock_chat_completion)):
        res = await provider.analyze_content(
            content_id="c_success",
            organisation_id="o_success",
            body="Our product guarantees 100% accuracy for all clients.",
            evidence=sample_evidence,
            timeout_seconds=10
        )

    assert res.status == "completed"
    assert res.provider == "groq"
    assert res.model == DEFAULT_GROQ_MODEL
    assert len(res.findings) == 1
    assert res.findings[0].category == FindingCategory.GUARANTEE
    assert res.findings[0].severity == FindingSeverity.CRITICAL
    # Crucial: verify hallucinated source "src_hallucinated_99" was filtered out
    assert res.findings[0].source_ids == ["src_guideline_01"]
    assert len(res.recommendations) == 1
    assert res.recommendations[0].is_evidence_backed is True
    assert res.summary.critical == 1

@pytest.mark.asyncio
async def test_groq_invalid_response_json(sample_evidence):
    provider = GroqProvider(api_key="gsk_test_valid_dummy_key_length_30_chars")
    mock_chat_completion = MagicMock()
    mock_choice = MagicMock()
    mock_choice.message.content = "This is not valid JSON {malformed"
    mock_chat_completion.choices = [mock_choice]

    with patch.object(provider.client.chat.completions, "create", AsyncMock(return_value=mock_chat_completion)):
        with pytest.raises(RuntimeError) as exc:
            await provider.analyze_content(
                content_id="c_err",
                organisation_id="o_err",
                body="Some text",
                evidence=sample_evidence,
                timeout_seconds=5
            )
    assert "Groq provider returned invalid JSON response" in str(exc.value)

@pytest.mark.asyncio
async def test_groq_provider_error(sample_evidence):
    provider = GroqProvider(api_key="gsk_test_valid_dummy_key_length_30_chars")
    with patch.object(
        provider.client.chat.completions, 
        "create", 
        AsyncMock(side_effect=Exception("503 Groq upstream service overloaded"))
    ):
        with pytest.raises(RuntimeError) as exc:
            await provider.analyze_content(
                content_id="c_err",
                organisation_id="o_err",
                body="Some text",
                evidence=sample_evidence,
                timeout_seconds=5
            )
    assert "GroqProvider execution failed: 503 Groq upstream service overloaded" in str(exc.value)

@pytest.mark.asyncio
async def test_groq_timeout_handling(sample_evidence):
    provider = GroqProvider(api_key="gsk_test_valid_dummy_key_length_30_chars")
    with patch.object(
        provider.client.chat.completions, 
        "create", 
        AsyncMock(side_effect=asyncio.TimeoutError())
    ):
        with pytest.raises(RuntimeError) as exc:
            await provider.analyze_content(
                content_id="c_timeout",
                organisation_id="o_timeout",
                body="Some text",
                evidence=sample_evidence,
                timeout_seconds=2
            )
    assert "GroqProvider timeout after 2s" in str(exc.value)

@pytest.mark.asyncio
async def test_gemini_to_groq_failover(sample_evidence):
    manager = ProviderManager()

    # Mock primary Gemini provider to fail with rate-limit or 503
    mock_primary = MagicMock(spec=BaseAIProvider)
    mock_primary.is_configured.return_value = True
    mock_primary.provider_name = "gemini"
    mock_primary.model_name = "gemini-flash-lite-latest"
    mock_primary.analyze_content = AsyncMock(
        side_effect=RuntimeError("ResourceExhausted: 429 Quota exceeded (retry in 15.0s)")
    )

    # Mock fallback Groq provider to succeed
    mock_fallback = MagicMock(spec=BaseAIProvider)
    mock_fallback.is_configured.return_value = True
    mock_fallback.provider_name = "groq"
    mock_fallback.model_name = "llama-3.3-70b-versatile"
    mock_fallback.analyze_content = AsyncMock(
        return_value=ReviewResponse(
            review_id="rev_groq_failover_123",
            status="completed",
            provider="groq",
            model="llama-3.3-70b-versatile",
            latency_ms=280,
            retry_count=0,
            is_demo_mode=False,
            findings=[
                Finding(
                    category=FindingCategory.GUARANTEE,
                    severity=FindingSeverity.CRITICAL,
                    flagged_text="guarantees 100% accuracy",
                    explanation="Groq failover flagged unverified guarantee.",
                    guideline="Absolute performance guarantees are strictly prohibited.",
                    source_ids=["src_guideline_01"],
                    source_excerpts=["Guarantees are prohibited"],
                    confidence=0.98,
                    requires_human_review=True,
                )
            ],
            summary=FindingSummary(total_findings=1, critical=1),
        )
    )

    manager.primary = mock_primary
    manager.fallback = mock_fallback

    response = await manager.execute_review(
        content_id="content_failover_test",
        organisation_id="org_test",
        body="Our product guarantees 100% accuracy.",
        evidence=sample_evidence,
    )

    # Primary was called
    mock_primary.analyze_content.assert_awaited_once()
    # Fallback was called
    mock_fallback.analyze_content.assert_awaited_once()

    assert response.provider == "groq"
    assert response.model == "llama-3.3-70b-versatile"
    assert response.retry_count == 1
    assert len(response.findings) == 1
    assert response.findings[0].severity == FindingSeverity.CRITICAL
    assert manager.last_successful_review["provider"] == "groq"

@pytest.mark.asyncio
async def test_groq_connectivity_probe():
    # Unconfigured
    provider_unconf = GroqProvider(api_key=None)
    status_unconf = await provider_unconf.check_connectivity(timeout_seconds=1.0)
    assert status_unconf["configured"] is False
    assert status_unconf["connected"] is False

    # Configured probe success
    provider_conf = GroqProvider(api_key="gsk_test_valid_dummy_key_length_30_chars")
    mock_resp_200 = MagicMock()
    mock_resp_200.status_code = 200

    with patch("httpx.AsyncClient.get", AsyncMock(return_value=mock_resp_200)):
        status_ok = await provider_conf.check_connectivity(timeout_seconds=1.0)
        assert status_ok["configured"] is True
        assert status_ok["connected"] is True
        assert status_ok["error"] is None

    # Configured probe auth failure
    mock_resp_401 = MagicMock()
    mock_resp_401.status_code = 401

    with patch("httpx.AsyncClient.get", AsyncMock(return_value=mock_resp_401)):
        status_401 = await provider_conf.check_connectivity(timeout_seconds=1.0)
        assert status_401["configured"] is True
        assert status_401["connected"] is False
        assert "Authentication failed" in status_401["error"]
