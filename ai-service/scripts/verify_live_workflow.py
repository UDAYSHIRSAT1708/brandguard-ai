"""
BrandGuard AI - Live AI Workflow & Failover Verification Script
Tests real provider credentials against live APIs, verifying RAG traceability,
failover logic, and honest failure modes.
"""
import asyncio
import os
import sys
import time
from pathlib import Path
from dotenv import load_dotenv

# Ensure root directory and ai-service are in sys.path
root_dir = Path(__file__).resolve().parent.parent.parent
ai_service_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ai_service_dir))
sys.path.insert(0, str(root_dir))

# Load environment
load_dotenv(root_dir / ".env")
load_dotenv(ai_service_dir / ".env")

from app.core.config import settings
from app.providers.gemini_provider import GeminiProvider
from app.providers.openai_provider import OpenAIProvider
from app.providers.manager import ProviderManager

async def run_smoke_tests():
    print("=================================================================")
    print("BRANDGUARD AI — LIVE AI WORKFLOW & INTEGRATION VERIFICATION")
    print("=================================================================")
    
    # --- Test 1: Credential Reconciliation & Active Probe ---
    print("\n[TEST 1] Reconciled AI Credential Active Probe...")
    primary_key = settings.AI_PRIMARY_API_KEY
    if not primary_key:
        print("❌ FATAL: No primary API key found in environment!")
        sys.exit(1)
        
    print(f"  • Primary Provider: {settings.AI_PRIMARY_PROVIDER}")
    print(f"  • Primary Model:    {settings.AI_PRIMARY_MODEL}")
    print(f"  • Primary Key:      {primary_key[:6]}...{primary_key[-4:]} (Configured: True)")
    
    gemini = GeminiProvider(model_name=settings.AI_PRIMARY_MODEL, api_key=primary_key)
    probe_res = await gemini.check_connectivity(timeout_seconds=5.0)
    print(f"  • Connectivity:     {probe_res['connected']}")
    print(f"  • Latency:          {probe_res['latency_ms']} ms")
    print(f"  • Error:            {probe_res['error']}")
    
    assert probe_res['connected'] is True, f"Primary probe failed: {probe_res['error']}"
    print("  --> [TEST 1 PASSED]: Live Gemini connectivity verified.")

    # --- Test 2: Real AI Review Execution with RAG Evidence ---
    print("\n[TEST 2] Genuine AI Review Execution with Traceable RAG Evidence...")
    test_evidence = [
        {
            "id": "src_fin_compliance_01",
            "title": "SEC/FINRA Investment Marketing Compliance",
            "sourceType": "rule",
            "content": "All marketing communications must never promise guaranteed returns, 100% success rate, or zero risk. Any such claim violates financial regulatory standards."
        },
        {
            "id": "src_brand_tone_02",
            "title": "Corporate Voice Guidelines",
            "sourceType": "guideline",
            "content": "Maintain a professional, objective, and measured tone. Avoid hyperbole such as 'revolutionary breakthrough' or 'unprecedented magic'."
        }
    ]
    test_content = (
        "Introducing our revolutionary breakthrough investment platform! "
        "We deliver guaranteed returns with 100% success and absolutely zero risk for every customer."
    )
    
    t0 = time.time()
    review_res = await gemini.analyze_content(
        content_id="live-content-verify-001",
        organisation_id="org-production-verify",
        body=test_content,
        evidence=test_evidence
    )
    elapsed = int((time.time() - t0) * 1000)
    
    print(f"  • Execution Duration: {elapsed} ms")
    print(f"  • Review Provider:    {review_res.provider}")
    print(f"  • Review Model:       {review_res.model}")
    print(f"  • Findings Count:     {len(review_res.findings)}")
    
    assert len(review_res.findings) >= 2, f"Expected >= 2 findings, got {len(review_res.findings)}"
    
    cited_sources = set()
    for idx, f in enumerate(review_res.findings, 1):
        print(f"    [{idx}] Flagged: '{f.flagged_text}'")
        print(f"        Severity:    {f.severity}")
        print(f"        Explanation: {f.explanation}")
        print(f"        Guideline:   {f.guideline}")
        print(f"        Sources:     {f.source_ids}")
        for s in f.source_ids:
            cited_sources.add(s)
            
    assert "src_fin_compliance_01" in cited_sources, "Expected citation of src_fin_compliance_01"
    print("  --> [TEST 2 PASSED]: Real AI review completed with traceable RAG citations.")

    # --- Test 3: Provider Failover and Honest Failure Handling ---
    print("\n[TEST 3] Provider Failure Handling & Secondary Failover...")
    manager = ProviderManager()
    
    # 3a: Normal review through manager
    mgr_res = await manager.execute_review(
        content_id="live-content-mgr-002",
        organisation_id="org-production-verify",
        body="Join our platform for 100% guarantee.",
        evidence=test_evidence
    )
    print(f"  • Normal Manager Review: Provider={mgr_res.provider}, Findings={len(mgr_res.findings)}")
    assert mgr_res.provider == "gemini"
    assert manager.last_successful_review is not None
    print(f"  • Telemetry recorded: {manager.last_successful_review['timestamp']}")

    # 3b: Forced primary failure -> Fallback execution or Honest Dual Failure
    print("\n[TEST 3b] Simulating Primary Provider Failure...")
    try:
        # Force failover on review call
        await manager.execute_review(
            content_id="live-failover-003",
            organisation_id="org-production-verify",
            body="Another test content",
            evidence=test_evidence,
            force_failover=True
        )
        print("  • Secondary provider responded successfully.")
    except Exception as e:
        print(f"  • Fallback handled honestly: {type(e).__name__}: {e}")
        assert "fallback" in str(e).lower() or "not configured" in str(e).lower() or "unconfigured" in str(e).lower()
        print("  --> [TEST 3b PASSED]: Zero mock fallback. System rejected review honestly with clear error.")

    # 3c: Verified failover execution with secondary provider
    print("\n[TEST 3c] Testing Failover Execution Mechanics...")
    from tests.mocks import MockProvider
    mock_secondary = MockProvider("openai", "gpt-4o-mini")
    manager.fallback = mock_secondary
    failover_res = await manager.execute_review(
        content_id="live-failover-004",
        organisation_id="org-production-verify",
        body="Test content for failover check",
        evidence=test_evidence,
        force_failover=True
    )
    print(f"  • Failover Review: Provider={failover_res.provider}, RetryCount={failover_res.retry_count}")
    assert failover_res.provider == "openai"
    assert failover_res.retry_count == 1
    assert manager.last_successful_review["provider"] == "openai"
    print("  --> [TEST 3c PASSED]: Secondary provider failover execution & telemetry verified.")

    print("\n=================================================================")
    print("ALL LIVE WORKFLOW TESTS COMPLETED SUCCESSFULLY!")
    print("=================================================================")

if __name__ == "__main__":
    asyncio.run(run_smoke_tests())
