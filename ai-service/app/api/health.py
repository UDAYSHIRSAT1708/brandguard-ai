from fastapi import APIRouter, Query
from datetime import datetime, timezone
from app.core.config import settings
from app.models.schemas import HealthResponse, ProviderHealthStatus
from app.providers.manager import provider_manager

router = APIRouter()

@router.get("/health", response_model=HealthResponse)
async def get_health(probe: bool = Query(False, description="Whether to execute active bounded connectivity probe to upstream providers")):
    """
    Public health check endpoint. Reports truthful service vitality, safe provider
    readiness, active connectivity, and last successful review without exposing raw API keys or internal secrets.
    """
    now = datetime.now(timezone.utc).isoformat()
    primary_configured = provider_manager.primary.is_configured()
    fallback_configured = provider_manager.fallback.is_configured()

    if probe and (primary_configured or fallback_configured):
        probe_res = await provider_manager.probe_providers(timeout_seconds=2.5)
        p_res = probe_res["primary"]
        f_res = probe_res["fallback"]

        primary_status = "ready" if p_res.get("connected") else ("unconfigured" if not primary_configured else "unreachable")
        fallback_status = "ready" if f_res.get("connected") else ("unconfigured" if not fallback_configured else "unreachable")

        primary_conn = "verified" if p_res.get("connected") else ("unconfigured" if not primary_configured else "unreachable")
        fallback_conn = "verified" if f_res.get("connected") else ("unconfigured" if not fallback_configured else "unreachable")

        providers = {
            "primary": ProviderHealthStatus(
                provider=settings.AI_PRIMARY_PROVIDER,
                model=settings.AI_PRIMARY_MODEL,
                configured=primary_configured,
                status=primary_status,
                connectivity=primary_conn,
                latency_ms=p_res.get("latency_ms"),
                last_checked=now,
                message=p_res.get("error") or "Upstream connectivity verified",
            ),
            "fallback": ProviderHealthStatus(
                provider=settings.AI_FALLBACK_PROVIDER,
                model=settings.AI_FALLBACK_MODEL,
                configured=fallback_configured,
                status=fallback_status,
                connectivity=fallback_conn,
                latency_ms=f_res.get("latency_ms"),
                last_checked=now,
                message=f_res.get("error") or "Upstream connectivity verified",
            ),
        }
    else:
        providers = {
            "primary": ProviderHealthStatus(
                provider=settings.AI_PRIMARY_PROVIDER,
                model=settings.AI_PRIMARY_MODEL,
                configured=primary_configured,
                status="ready" if primary_configured else "unconfigured",
                connectivity="configured" if primary_configured else "unconfigured",
                last_checked=now,
                message="Credentials configured (run active probe to verify)" if primary_configured else "API credentials unconfigured",
            ),
            "fallback": ProviderHealthStatus(
                provider=settings.AI_FALLBACK_PROVIDER,
                model=settings.AI_FALLBACK_MODEL,
                configured=fallback_configured,
                status="ready" if fallback_configured else "unconfigured",
                connectivity="configured" if fallback_configured else "unconfigured",
                last_checked=now,
                message="Credentials configured (run active probe to verify)" if fallback_configured else "API credentials unconfigured",
            ),
        }

    # Truthful service health
    any_verified_or_ready = any(p.status == "ready" for p in providers.values())
    if any_verified_or_ready:
        service_status = "healthy"
    elif primary_configured or fallback_configured:
        service_status = "degraded"
    else:
        service_status = "unconfigured"

    return HealthResponse(
        status=service_status,
        service=settings.PROJECT_NAME,
        version=settings.VERSION,
        is_demo_mode=False,
        providers=providers,
        last_successful_review=provider_manager.last_successful_review
    )
