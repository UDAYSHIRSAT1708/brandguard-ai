import pytest
import datetime
from app.rag.retriever import HybridRetriever

@pytest.fixture
def mock_sources():
    now = datetime.datetime.now(datetime.timezone.utc)
    one_day = datetime.timedelta(days=1)

    return [
        {
            "id": "src_approved_01",
            "organisation_id": "org_alpha",
            "title": "Prohibition of Absolute Guarantees",
            "sourceType": "guideline",
            "status": "approved",
            "content": "Absolute performance guarantees are strictly prohibited across all marketing and product copy.",
            "effectiveDate": (now - one_day).isoformat(),
            "expiryDate": (now + one_day).isoformat(),
        },
        {
            "id": "src_draft_02",
            "organisation_id": "org_alpha",
            "title": "Unapproved Experimental Guideline",
            "sourceType": "guideline",
            "status": "draft",
            "content": "Draft rule that has not undergone legal sign-off.",
            "effectiveDate": (now - one_day).isoformat(),
        },
        {
            "id": "src_expired_03",
            "organisation_id": "org_alpha",
            "title": "Expired Campaign Rule",
            "sourceType": "claim",
            "status": "approved",
            "content": "Historical guarantee valid only during 2024 Black Friday.",
            "effectiveDate": (now - datetime.timedelta(days=365)).isoformat(),
            "expiryDate": (now - one_day).isoformat(),  # EXPIRED!
        },
        {
            "id": "src_other_tenant_04",
            "organisation_id": "org_beta",  # DIFFERENT TENANT!
            "title": "Beta Inc Proprietary Formula",
            "sourceType": "fact",
            "status": "approved",
            "content": "Beta Inc guarantees 100% data residency.",
            "effectiveDate": (now - one_day).isoformat(),
        },
    ]

def test_rag_retrieves_approved_source_and_excludes_invalid_sources(mock_sources):
    retriever = HybridRetriever()

    # Query as org_alpha
    results = retriever.retrieve_evidence(
        query="Our product guarantees 100% performance for all users.",
        sources=mock_sources,
        organisation_id="org_alpha",
    )

    result_ids = [r["id"] for r in results]

    # 1. Approved source in Org Alpha must be retrieved
    assert "src_approved_01" in result_ids

    # 2. Draft/unapproved source must be EXCLUDED
    assert "src_draft_02" not in result_ids

    # 3. Expired source must be EXCLUDED
    assert "src_expired_03" not in result_ids

    # 4. Cross-tenant Org Beta source must be EXCLUDED
    assert "src_other_tenant_04" not in result_ids

def test_rag_cross_tenant_isolation(mock_sources):
    retriever = HybridRetriever()

    # Query as org_beta
    results = retriever.retrieve_evidence(
        query="data residency and guarantees",
        sources=mock_sources,
        organisation_id="org_beta",
    )

    result_ids = [r["id"] for r in results]

    # Org Beta gets only Org Beta sources
    assert "src_other_tenant_04" in result_ids
    assert "src_approved_01" not in result_ids
