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

def test_rag_filters_out_irrelevant_queries(mock_sources):
    retriever = HybridRetriever(min_relevance_score=0.25)

    # Completely unrelated query about vacations
    results = retriever.retrieve_evidence(
        query="We went to the beach yesterday and ate vanilla ice cream under the sunshine.",
        sources=mock_sources,
        organisation_id="org_alpha",
    )

    # Should filter out non-relevant guidelines rather than hallucinating relevance
    assert len(results) == 0

def test_rag_text_chunker_splits_long_sources():
    from app.rag.chunker import TextChunker

    chunker = TextChunker(chunk_size=50, chunk_overlap=10)
    # Long text with 120 words
    words = [f"word_{i}" for i in range(120)]
    long_text = " ".join(words)

    chunks = chunker.chunk_text(long_text)
    assert len(chunks) >= 3

    # Verify overlap exists between consecutive chunks
    chunk_0_words = set(chunks[0].split())
    chunk_1_words = set(chunks[1].split())
    overlap = chunk_0_words.intersection(chunk_1_words)
    assert len(overlap) >= 5

def test_rag_retriever_handles_chunked_long_guideline():
    retriever = HybridRetriever(min_relevance_score=0.1)

    # Create a long guideline (over 400 words)
    long_content = "Introductory context about brand architecture. " * 30 + "Special Clause: Never use the word 'unbeatable' under any circumstance. " + "Concluding administrative details. " * 30

    sources = [
        {
            "id": "src_long_guideline_01",
            "organisation_id": "org_test",
            "title": "Comprehensive Brand Architecture Policy",
            "sourceType": "guideline",
            "status": "approved",
            "content": long_content,
        }
    ]

    results = retriever.retrieve_evidence(
        query="Our prices are unbeatable in the market.",
        sources=sources,
        organisation_id="org_test",
    )

    assert len(results) > 0
    # The parent guideline ID or chunk with the matching clause must be retrieved
    first_result = results[0]
    assert first_result.get("parent_id") == "src_long_guideline_01" or first_result.get("id") == "src_long_guideline_01"
    assert "unbeatable" in first_result.get("content", "").lower()
