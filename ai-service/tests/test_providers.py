import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.providers.base import BaseAIProvider
from app.providers.manager import ProviderManager
from app.models.schemas import ReviewResponse, Finding, FindingCategory, FindingSeverity, FindingSummary

from tests.mocks import MockProvider

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

@pytest.mark.asyncio
async def test_unconfigured_providers_rejects_review(sample_evidence):
    """
    Verifies that when no live AI provider credentials exist,
    the service rejects review requests with an unconfigured error rather than faking findings.
    """
    manager = ProviderManager()
    manager.primary.is_configured = MagicMock(return_value=False)
    manager.fallback.is_configured = MagicMock(return_value=False)
    
    with pytest.raises(RuntimeError) as exc_info:
        await manager.execute_review(
            content_id="test_content_01",
            organisation_id="test_org_01",
            body="Our product guarantees 100% accuracy.",
            evidence=sample_evidence,
        )
    assert "AI Governance Service Unconfigured" in str(exc_info.value)

@pytest.mark.asyncio
async def test_isolated_test_mock_evaluates_prohibited_guarantee(sample_evidence):
    mock = MockProvider()
    response = await mock.analyze_content(
        content_id="test_content_01",
        organisation_id="test_org_01",
        body="Our product guarantees 100% accuracy for every customer. It never fails.",
        evidence=sample_evidence,
    )
    assert response.status == "completed"
    assert len(response.findings) >= 1
    assert response.findings[0].severity == FindingSeverity.CRITICAL

@pytest.mark.asyncio
async def test_autonomous_provider_failover(sample_evidence):
    """
    Simulates Primary provider experiencing a 504 Gateway Timeout or Rate Limit,
    verifying that the ProviderManager catches it and seamlessly falls back to the secondary provider.
    """
    manager = ProviderManager()

    # Mock primary provider to simulate a network outage or 5xx error
    mock_primary = MagicMock(spec=BaseAIProvider)
    mock_primary.is_configured.return_value = True
    mock_primary.provider_name = "gemini"
    mock_primary.model_name = "gemini-2.0-flash"
    mock_primary.analyze_content = AsyncMock(side_effect=RuntimeError("504 Gateway Timeout: Primary server unreachable"))

    # Mock secondary fallback provider to succeed
    mock_fallback = MagicMock(spec=BaseAIProvider)
    mock_fallback.is_configured.return_value = True
    mock_fallback.provider_name = "groq"
    mock_fallback.model_name = "llama-3.3-70b-versatile"
    mock_fallback.analyze_content = AsyncMock(
        return_value=ReviewResponse(
            review_id="rev_fallback_123",
            status="completed",
            provider="groq",
            model="llama-3.3-70b-versatile",
            latency_ms=450,
            retry_count=0,
            is_demo_mode=False,
            findings=[
                Finding(
                    category=FindingCategory.GUARANTEE,
                    severity=FindingSeverity.CRITICAL,
                    flagged_text="guarantees 100% accuracy",
                    explanation="Fallback analysis flagged unverified guarantee.",
                    guideline="Absolute performance guarantees are strictly prohibited.",
                    source_ids=["src_guideline_01"],
                    source_excerpts=["Guarantees are prohibited"],
                    confidence=0.99,
                    requires_human_review=True,
                )
            ],
            summary=FindingSummary(total_findings=1, critical=1),
        )
    )

    manager.primary = mock_primary
    manager.fallback = mock_fallback

    # Run review
    response = await manager.execute_review(
        content_id="content_failover_test",
        organisation_id="org_test",
        body="Our product guarantees 100% accuracy.",
        evidence=sample_evidence,
    )

    # Verify primary was attempted
    mock_primary.analyze_content.assert_awaited_once()

    # Verify fallback was successfully engaged and completed
    mock_fallback.analyze_content.assert_awaited_once()
    assert response.provider == "groq"
    assert response.retry_count == 1
    assert len(response.findings) == 1
    assert response.findings[0].severity == FindingSeverity.CRITICAL

@pytest.mark.asyncio
async def test_both_providers_fail_raises_controlled_error(sample_evidence):
    """
    Verifies that when both primary and secondary providers fail,
    the manager raises a controlled, informative exception rather than hanging or silently failing.
    """
    manager = ProviderManager()

    mock_primary = MagicMock(spec=BaseAIProvider)
    mock_primary.is_configured.return_value = True
    mock_primary.provider_name = "gemini"
    mock_primary.model_name = "gemini-2.0-flash"
    mock_primary.analyze_content = AsyncMock(side_effect=RuntimeError("Primary 500 Internal Server Error"))

    mock_fallback = MagicMock(spec=BaseAIProvider)
    mock_fallback.is_configured.return_value = True
    mock_fallback.provider_name = "groq"
    mock_fallback.model_name = "llama-3.3-70b-versatile"
    mock_fallback.analyze_content = AsyncMock(side_effect=RuntimeError("Secondary Rate Limit Exceeded (429)"))

    manager.primary = mock_primary
    manager.fallback = mock_fallback

    with pytest.raises(RuntimeError) as exc_info:
        await manager.execute_review(
            content_id="content_fail_test",
            organisation_id="org_test",
            body="Test content",
            evidence=sample_evidence,
        )

    assert "Both primary (gemini) and fallback (groq) providers failed" in str(exc_info.value)
