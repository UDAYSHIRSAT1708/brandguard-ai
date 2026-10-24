import time
from typing import List, Dict, Any, Optional
from app.providers.base import BaseAIProvider
from app.models.schemas import (
    ReviewResponse, 
    Finding, 
    FindingCategory, 
    FindingSeverity, 
    FindingSummary
)

class MockProvider(BaseAIProvider):
    """
    Isolated test mock provider used ONLY in offline test suites.
    Never referenced in production code paths.
    """
    def __init__(self, provider_name: str = "mock", model_name: str = "test-mock-v1"):
        super().__init__(provider_name, model_name, api_key="test_mock_key")

    async def check_connectivity(self, timeout_seconds: float = 3.0) -> Dict[str, Any]:
        return {
            "configured": True,
            "connected": True,
            "latency_ms": 10,
            "error": None
        }

    async def analyze_content(
        self,
        content_id: str,
        organisation_id: str,
        body: str,
        evidence: List[Dict[str, Any]],
        context: Optional[Dict[str, Any]] = None,
        timeout_seconds: int = 30
    ) -> ReviewResponse:
        start_time = time.time()
        findings: List[Finding] = []
        body_lower = body.lower()

        if "guarantee" in body_lower or "100%" in body_lower:
            findings.append(
                Finding(
                    category=FindingCategory.GUARANTEE,
                    severity=FindingSeverity.CRITICAL,
                    flagged_text="guarantees 100% accuracy",
                    explanation="Prohibited absolute performance guarantee.",
                    guideline="Absolute performance guarantees are strictly prohibited across all marketing and product copy.",
                    source_ids=["src_guideline_01"],
                    source_excerpts=["Absolute performance guarantees are strictly prohibited"],
                    confidence=0.98,
                    suggested_correction="achieved 94% accuracy in benchmark testing",
                    requires_human_review=True,
                )
            )

        duration_ms = int((time.time() - start_time) * 1000)
        return ReviewResponse(
            review_id=f"rev_test_{int(time.time())}",
            status="completed",
            provider=self.provider_name,
            model=self.model_name,
            latency_ms=max(duration_ms, 5),
            retry_count=0,
            is_demo_mode=False,
            findings=findings,
            summary=FindingSummary(
                total_findings=len(findings),
                critical=sum(1 for f in findings if f.severity == FindingSeverity.CRITICAL),
                high=sum(1 for f in findings if f.severity == FindingSeverity.HIGH),
                medium=sum(1 for f in findings if f.severity == FindingSeverity.MEDIUM),
                low=sum(1 for f in findings if f.severity == FindingSeverity.LOW),
            ),
        )
