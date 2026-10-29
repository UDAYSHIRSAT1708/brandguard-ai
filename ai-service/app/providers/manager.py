import asyncio
from datetime import datetime, timezone
import time
import logging
import re
from typing import List, Dict, Any, Optional
from app.core.config import settings
from app.providers.base import BaseAIProvider
from app.providers.gemini_provider import GeminiProvider
from app.providers.openai_provider import OpenAIProvider
from app.rag.retriever import HybridRetriever
from app.models.schemas import ReviewResponse

logger = logging.getLogger("brandguard.provider_manager")

def extract_retry_delay(err: Exception) -> Optional[float]:
    """Extracts explicit cooldown/retry-delay from 429 or rate-limit error messages."""
    err_str = str(err)
    # Match patterns like: "retry in 3.5s" or "Please retry in 49.6s"
    match = re.search(r"retry\s+in\s+([0-9.]+)\s*s", err_str, re.IGNORECASE)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            pass
    # Match patterns like: "seconds: 49"
    match_sec = re.search(r"seconds:\s*([0-9.]+)", err_str, re.IGNORECASE)
    if match_sec:
        try:
            return float(match_sec.group(1))
        except ValueError:
            pass
    return None

def is_retryable_error(err: Exception) -> bool:
    err_s = str(err).lower()
    return (
        "429" in err_s or 
        "resource_exhausted" in err_s or 
        "rate limit" in err_s or 
        "503" in err_s or 
        "unavailable" in err_s or
        "temporarily unavailable" in err_s
    )

class ProviderManager:
    def __init__(self):
        self.retriever = HybridRetriever()

        # Initialize Primary Provider
        if settings.AI_PRIMARY_PROVIDER.lower() == "gemini":
            self.primary: BaseAIProvider = GeminiProvider(
                model_name=settings.AI_PRIMARY_MODEL,
                api_key=settings.AI_PRIMARY_API_KEY
            )
        elif settings.AI_PRIMARY_PROVIDER.lower() == "openai":
            self.primary = OpenAIProvider(
                model_name=settings.AI_PRIMARY_MODEL,
                api_key=settings.AI_PRIMARY_API_KEY
            )
        else:
            self.primary = GeminiProvider(
                model_name="gemini-flash-lite-latest",
                api_key=settings.AI_PRIMARY_API_KEY
            )

        # Initialize Fallback Provider
        if settings.AI_FALLBACK_PROVIDER.lower() == "openai":
            self.fallback: BaseAIProvider = OpenAIProvider(
                model_name=settings.AI_FALLBACK_MODEL,
                api_key=settings.AI_FALLBACK_API_KEY
            )
        elif settings.AI_FALLBACK_PROVIDER.lower() == "gemini":
            self.fallback = GeminiProvider(
                model_name=settings.AI_FALLBACK_MODEL,
                api_key=settings.AI_FALLBACK_API_KEY
            )
        else:
            self.fallback = OpenAIProvider(
                model_name="gpt-4o-mini",
                api_key=settings.AI_FALLBACK_API_KEY
            )

        self.last_successful_review: Optional[Dict[str, Any]] = None

    def _record_success(self, res: ReviewResponse):
        self.last_successful_review = {
            "provider": res.provider,
            "model": res.model,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "latency_ms": res.latency_ms,
            "findings_count": len(res.findings),
            "recommendations_count": len(res.recommendations)
        }

    async def probe_providers(self, timeout_seconds: float = 3.0) -> Dict[str, Any]:
        """
        Safely probes upstream AI provider endpoints with bounded timeout.
        """
        primary_probe, fallback_probe = await asyncio.gather(
            self.primary.check_connectivity(timeout_seconds),
            self.fallback.check_connectivity(timeout_seconds),
            return_exceptions=True
        )

        def normalize(res, provider_inst):
            if isinstance(res, Exception):
                return {
                    "configured": provider_inst.is_configured(),
                    "connected": False,
                    "latency_ms": None,
                    "error": f"Probe error: {type(res).__name__}"
                }
            return res

        return {
            "primary": normalize(primary_probe, self.primary),
            "fallback": normalize(fallback_probe, self.fallback),
            "last_successful_review": self.last_successful_review
        }

    async def execute_review(
        self,
        content_id: str,
        organisation_id: str,
        body: str,
        evidence: List[Dict[str, Any]],
        context: Optional[Dict[str, Any]] = None,
        force_failover: bool = False
    ) -> ReviewResponse:
        """
        Executes end-to-end AI brand governance review:
        1. Grounding via HybridRetriever (chunking, semantic + lexical ranking, tenant filtering).
        2. Execution on primary provider with bounded timeout and retry on transient errors.
        3. Deterministic failover to secondary provider.
        """
        # 1. Enforce that at least one external AI provider has valid credentials
        if not self.primary.is_configured() and not self.fallback.is_configured():
            logger.error("Review requested but no external AI provider has credentials configured.")
            raise RuntimeError(
                "AI Governance Service Unconfigured: Neither primary nor fallback AI provider has "
                "valid API credentials configured. Review requests cannot proceed."
            )

        # 2. Run Grounding via HybridRetriever
        retrieved_evidence = self.retriever.retrieve_evidence(
            query=body,
            sources=evidence,
            organisation_id=organisation_id,
            top_k=6,
            max_tokens=settings.AI_CONTEXT_BUDGET_TOKENS,
            min_relevance_score=0.12,
        )
        logger.info(
            f"[RAG] Tenant '{organisation_id}': Retrieved {len(retrieved_evidence)} relevant evidence "
            f"chunks from {len(evidence)} candidate guidelines."
        )

        # Bounded provider timeout (aligned with backend 35s budget)
        provider_timeout = min(30, max(5, settings.AI_REQUEST_TIMEOUT_SECONDS))

        # 3. Check if failover is manually forced (for failover verification)
        if force_failover:
            if not self.fallback.is_configured():
                raise RuntimeError(
                    f"Failover explicitly requested, but fallback AI provider ({self.fallback.provider_name}) "
                    f"is not configured with valid credentials."
                )
            logger.info(f"Routing review directly to fallback provider: {self.fallback.provider_name}")
            res = await self.fallback.analyze_content(
                content_id,
                organisation_id,
                body,
                retrieved_evidence,
                context,
                timeout_seconds=provider_timeout
            )
            res.retry_count = 1
            self._record_success(res)
            return res

        # 4. Attempt Primary Provider
        if self.primary.is_configured():
            attempts = 0
            max_attempts = 1 + settings.AI_MAX_RETRIES
            last_primary_error: Optional[Exception] = None

            while attempts < max_attempts:
                attempts += 1
                try:
                    logger.info(
                        f"Attempting Primary AI Provider (attempt {attempts}/{max_attempts}): "
                        f"{self.primary.provider_name} ({self.primary.model_name})"
                    )
                    res = await self.primary.analyze_content(
                        content_id,
                        organisation_id,
                        body,
                        retrieved_evidence,
                        context,
                        timeout_seconds=provider_timeout
                    )
                    self._record_success(res)
                    return res
                except Exception as primary_err:
                    last_primary_error = primary_err
                    logger.warning(f"Primary provider {self.primary.provider_name} attempt {attempts} failed: {str(primary_err)}")

                    # Check explicit retry delay / cooldown from 429 quota exhaustion
                    retry_delay = extract_retry_delay(primary_err)
                    if retry_delay and retry_delay > 5.0:
                        logger.warning(
                            f"Rate-limit cooldown requirement is {retry_delay}s (> 5s limit). "
                            f"Skipping in-band retry to avoid blocking request thread."
                        )
                        break

                    # Retry with backoff if retryable and attempts remaining
                    if attempts < max_attempts and is_retryable_error(primary_err):
                        # Exponential backoff with jitter and minimum retry delay respect
                        jitter = (time.time() % 0.5)
                        backoff = max(1.0 * attempts + jitter, retry_delay or 0.0)
                        logger.info(f"Transient error detected. Backing off for {round(backoff, 2)}s before retry...")
                        await asyncio.sleep(backoff)
                        continue

                    # If not retryable or retries exhausted, break out to fallback
                    logger.warning(
                        f"Primary provider {self.primary.provider_name} exhausted or non-retryable. "
                        f"Evaluating fallback provider..."
                    )
                    break

            if not self.fallback.is_configured():
                raise RuntimeError(
                    f"Primary AI provider ({self.primary.provider_name}) failed: {str(last_primary_error)}. "
                    f"Fallback provider ({self.fallback.provider_name}) is unconfigured."
                )
        else:
            logger.warning(
                f"Primary provider {self.primary.provider_name} is unconfigured. "
                f"Engaging configured fallback provider..."
            )

        # 5. Attempt Secondary Fallback Provider
        if self.fallback.is_configured():
            try:
                logger.info(f"Attempting Fallback AI Provider: {self.fallback.provider_name} ({self.fallback.model_name})")
                fallback_res = await self.fallback.analyze_content(
                    content_id,
                    organisation_id,
                    body,
                    retrieved_evidence,
                    context,
                    timeout_seconds=provider_timeout
                )
                fallback_res.retry_count = 1
                self._record_success(fallback_res)
                return fallback_res
            except Exception as fallback_err:
                logger.error(f"Fallback provider {self.fallback.provider_name} also failed: {str(fallback_err)}")
                raise RuntimeError(
                    f"Critical AI Service Failure: Both primary ({self.primary.provider_name}) "
                    f"and fallback ({self.fallback.provider_name}) providers failed: {str(fallback_err)}"
                )

        raise RuntimeError("No configured AI providers available to execute review.")

provider_manager = ProviderManager()
