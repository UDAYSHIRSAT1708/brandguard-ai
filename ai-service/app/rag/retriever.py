import datetime
from typing import List, Dict, Any, Optional
from app.rag.embedder import VectorEmbedder
from app.rag.chunker import TextChunker

class HybridRetriever:
    """
    Hybrid Keyword + Semantic Evidence Retriever.
    Enforces multi-tenant isolation, approval status validation,
    document chunking, date validity constraints, and context token budgeting.
    """
    def __init__(
        self,
        embedder: Optional[VectorEmbedder] = None,
        chunker: Optional[TextChunker] = None,
        min_relevance_score: float = 0.12
    ):
        self.embedder = embedder or VectorEmbedder()
        self.chunker = chunker or TextChunker(chunk_size=300, chunk_overlap=40)
        self.min_relevance_score = min_relevance_score

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
            # 1. Multi-Tenant Isolation: Strictly exclude sources from other tenants
            src_org = src.get("organisation_id") or src.get("organisationId")
            if src_org and str(src_org) != str(organisation_id):
                continue

            # 2. Strict Approval Status Filter (Unapproved / Draft / Archived are blocked)
            status = src.get("status", "approved")
            if status != "approved":
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

    def chunk_sources(self, sources: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Segments long documents into manageable chunks while preserving
        parent source references, titles, and metadata.
        """
        chunked_units = []
        for src in sources:
            parent_id = str(src.get("id", "src"))
            content = src.get("content", "").strip()
            if not content:
                continue

            chunks = self.chunker.chunk_text(content)
            if not chunks:
                continue

            for idx, chunk_text in enumerate(chunks):
                chunked_units.append({
                    "id": f"{parent_id}#chunk_{idx}" if len(chunks) > 1 else parent_id,
                    "parent_id": parent_id,
                    "title": src.get("title", "Brand Guideline"),
                    "sourceType": src.get("sourceType", "guideline"),
                    "content": chunk_text,
                    "productScope": src.get("productScope", "Global"),
                    "organisation_id": src.get("organisation_id"),
                })

        return chunked_units

    def retrieve_evidence(
        self,
        query: str,
        sources: List[Dict[str, Any]],
        organisation_id: str,
        top_k: int = 6,
        max_tokens: int = 4000,
        min_relevance_score: Optional[float] = None
    ) -> List[Dict[str, Any]]:
        """
        Executes hybrid ranking across authorized approved source chunks.
        Returns empty list if no relevant evidence passes the threshold.
        """
        threshold = min_relevance_score if min_relevance_score is not None else self.min_relevance_score

        # Step 1: Enforce security & lifecycle gates
        authorized = self.filter_authorized_sources(sources, organisation_id)
        if not authorized or not query.strip():
            return []

        # Step 2: Chunk large documents for targeted retrieval
        chunks = self.chunk_sources(authorized)
        if not chunks:
            return []

        query_lower = query.lower()
        query_vector = self.embedder.embed_text(query)
        query_words = [w for w in query_lower.split() if len(w) > 3]

        scored_chunks = []
        for chunk in chunks:
            content = chunk.get("content", "")
            title = chunk.get("title", "")
            content_lower = content.lower()
            title_lower = title.lower()

            # A. Keyword / Lexical Overlap
            keyword_score = 0.0
            if query_words:
                matched_words = sum(1 for w in query_words if w in content_lower)
                keyword_score = min(1.0, (matched_words / len(query_words)) * 1.5)

            # High weight if exact prohibited phrase or guideline title appears in content
            if title_lower in query_lower or any(phrase in query_lower for phrase in ["guarantee", "100%", "never fails", "unlimited"]):
                if any(w in content_lower for w in ["prohibit", "guarantee", "claim", "never"]):
                    keyword_score = max(keyword_score, 0.85)

            # B. Semantic Vector Cosine Similarity
            chunk_vector = self.embedder.embed_text(content)
            semantic_score = self.embedder.cosine_similarity(query_vector, chunk_vector)

            # C. Hybrid Score (50% semantic + 50% keyword)
            hybrid_score = (0.5 * semantic_score) + (0.5 * keyword_score)

            if hybrid_score >= threshold:
                scored_chunks.append((hybrid_score, chunk))

        # Sort descending by hybrid score
        scored_chunks.sort(key=lambda x: x[0], reverse=True)

        # Apply top-k and token budget
        selected = []
        char_count = 0
        char_limit = max_tokens * 4

        seen_parents = set()
        for score, chunk in scored_chunks:
            if len(selected) >= top_k:
                break

            content_len = len(chunk.get("content", ""))
            if char_count + content_len <= char_limit:
                chunk_copy = dict(chunk)
                chunk_copy["retrieval_score"] = round(score, 3)
                selected.append(chunk_copy)
                char_count += content_len
                seen_parents.add(chunk.get("parent_id"))

        return selected
