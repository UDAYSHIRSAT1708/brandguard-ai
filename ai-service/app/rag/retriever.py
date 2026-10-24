import datetime
from typing import List, Dict, Any, Optional
from app.rag.embedder import VectorEmbedder

class HybridRetriever:
    """
    Hybrid Keyword + Semantic Evidence Retriever.
    Enforces multi-tenant isolation, approval status validation,
    date validity constraints, and context token budgeting.
    """
    def __init__(self, embedder: Optional[VectorEmbedder] = None):
        self.embedder = embedder or VectorEmbedder()

    def filter_authorized_sources(
        self,
        sources: List[Dict[str, Any]],
        organisation_id: str,
        current_time: Optional[datetime.datetime] = None,
        scope: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        now = current_time or datetime.datetime.now(datetime.timezone.utc)
        valid_sources = []

        for src in sources:
            # 1. Multi-Tenant Isolation
            src_org = src.get("organisation_id") or src.get("organisationId")
            if src_org and str(src_org) != str(organisation_id):
                continue

            # 2. Strict Approval Status Filter (Unapproved / Draft / Archived are blocked)
            if src.get("status") != "approved":
                continue

            # 3. Expiry Date Check
            expiry_str = src.get("expiryDate") or src.get("expiry_date")
            if expiry_str:
                try:
                    expiry_date = datetime.datetime.fromisoformat(str(expiry_str).replace('Z', '+00:00'))
                    if expiry_date <= now:
                        continue
                except Exception:
                    pass

            # 4. Effective Date Check
            effective_str = src.get("effectiveDate") or src.get("effective_date")
            if effective_str:
                try:
                    effective_date = datetime.datetime.fromisoformat(str(effective_str).replace('Z', '+00:00'))
                    if effective_date > now:
                        continue
                except Exception:
                    pass

            # 5. Scope Filtering (Global rules apply everywhere)
            src_scope = src.get("productScope") or src.get("product_scope") or "Global"
            if scope and src_scope != "Global" and src_scope.lower() != scope.lower():
                continue

            valid_sources.append(src)

        return valid_sources

    def retrieve_evidence(
        self,
        query: str,
        sources: List[Dict[str, Any]],
        organisation_id: str,
        top_k: int = 5,
        max_tokens: int = 4000
    ) -> List[Dict[str, Any]]:
        """
        Executes hybrid ranking across authorized approved sources.
        """
        # Step 1: Enforce security & lifecycle gates
        authorized = self.filter_authorized_sources(sources, organisation_id)
        if not authorized or not query.strip():
            return []

        query_lower = query.lower()
        query_vector = self.embedder.embed_text(query)

        scored_sources = []
        for src in authorized:
            content = src.get("content", "")
            title = src.get("title", "")
            combined_text = f"{title} {content}".lower()

            # A. Keyword / Term matching score
            keyword_score = 0.0
            words = content.lower().split()
            matched_words = sum(1 for w in words if len(w) > 3 and w in query_lower)
            if matched_words > 0:
                keyword_score = min(1.0, matched_words / max(len(words), 1) * 2.0)

            # Extra weight for exact prohibited phrases or guideline title matches
            if title.lower() in query_lower or content.lower() in query_lower:
                keyword_score = 1.0

            # B. Semantic Vector Cosine Similarity
            src_vector = self.embedder.embed_text(content)
            semantic_score = self.embedder.cosine_similarity(query_vector, src_vector)

            # C. Hybrid Score (0.5 Semantic + 0.5 Keyword)
            hybrid_score = (0.5 * semantic_score) + (0.5 * keyword_score)

            if hybrid_score > 0.05:
                scored_sources.append((hybrid_score, src))

        # Sort descending by hybrid score
        scored_sources.sort(key=lambda x: x[0], reverse=True)

        # Apply top-k and token budget
        selected = []
        char_count = 0
        char_limit = max_tokens * 4  # rough conversion

        for score, src in scored_sources[:top_k]:
            content_len = len(src.get("content", ""))
            if char_count + content_len <= char_limit:
                src_copy = dict(src)
                src_copy["retrieval_score"] = round(score, 3)
                selected.append(src_copy)
                char_count += content_len

        return selected
