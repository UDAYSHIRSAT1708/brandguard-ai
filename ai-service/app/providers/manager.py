import asyncio
from datetime import datetime, timezone
import time
import logging
from typing import List, Dict, Any, Optional
from app.core.config import settings
from app.providers.base import BaseAIProvider
from app.providers.gemini_provider import GeminiProvider
from app.providers.openai_provider import OpenAIProvider
from app.models.schemas import ReviewResponse

logger = logging.getLogger("brandguard.provider_manager")

class ProviderManager:
    def __init__(self):
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
                model_name="gemini-flash-latest",
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
            "findings_count": len(res.findings)
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
        Executes AI brand review using real primary provider with bounded timeout
        and autonomous fallback to secondary provider.
        Never falls back to hardcoded mock/demo data in production paths.
        """
        # 1. Enforce that at least one external AI provider has valid credentials
        if not self.primary.is_configured() and not self.fallback.is_configured():
            logger.error("Review requested but no external AI provider has credentials configured.")
            raise RuntimeError(
                "AI Governance Service Unconfigured: Neither primary nor fallback AI provider has "
                "valid API credentials configured. Review requests cannot proceed."
            )

        # 2. Check if failover is manually forced (for failover testing verification)
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
                evidence,
                context,
                timeout_seconds=settings.AI_REQUEST_TIMEOUT_SECONDS
            )
            res.retry_count = 1
            self._record_success(res)
            return res

        # 3. Attempt Primary Provider
        if self.primary.is_configured():
            try:
                logger.info(f"Attempting Primary AI Provider: {self.primary.provider_name} ({self.primary.model_name})")
                res = await self.primary.analyze_content(
                    content_id,
                    organisation_id,
                    body,
                    evidence,
                    context,
                    timeout_seconds=settings.AI_REQUEST_TIMEOUT_SECONDS
                )
                self._record_success(res)
                return res
            except Exception as primary_err:
                logger.warning(
                    f"Primary provider {self.primary.provider_name} failed: {str(primary_err)}. "
                    f"Evaluating fallback provider..."
                )
                if not self.fallback.is_configured():
                    raise RuntimeError(
                        f"Primary AI provider ({self.primary.provider_name}) failed: {str(primary_err)}. "
                        f"Fallback provider is not configured."
                    )
        else:
            logger.warning(
                f"Primary provider {self.primary.provider_name} is unconfigured. "
                f"Engaging configured fallback provider..."
            )

        # 4. Attempt Secondary Fallback Provider
        if self.fallback.is_configured():
            try:
                logger.info(f"Attempting Fallback AI Provider: {self.fallback.provider_name} ({self.fallback.model_name})")
                fallback_res = await self.fallback.analyze_content(
                    content_id,
                    organisation_id,
                    body,
                    evidence,
                    context,
                    timeout_seconds=settings.AI_REQUEST_TIMEOUT_SECONDS
                )
                fallback_res.retry_count = 1
                self._record_success(fallback_res)
                return fallback_res
            except Exception as fallback_err:
                logger.error(f"Fallback provider {self.fallback.provider_name} also failed: {str(fallback_err)}")
                raise RuntimeError(
                    f"Critical AI Service Failure: Both primary ({self.primary.provider_name}) "
                    f"and fallback ({self.fallback.provider_name}) providers failed."
                )

        raise RuntimeError("No configured AI providers available to execute review.")

provider_manager = ProviderManager()
