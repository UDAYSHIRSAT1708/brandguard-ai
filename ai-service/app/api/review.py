import logging
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from app.core.security import verify_internal_api_key
from app.models.schemas import ReviewResponse
from app.providers.manager import provider_manager

logger = logging.getLogger("brandguard.api.review")
router = APIRouter()

class ReviewPayload(BaseModel):
    content_id: str
    organisation_id: str
    body: str
    evidence: List[Dict[str, Any]] = []
    context: Optional[Dict[str, Any]] = None
    force_failover: bool = False

@router.post("/review", response_model=ReviewResponse, dependencies=[Depends(verify_internal_api_key)])
async def review_content(payload: ReviewPayload):
    """
    Executes deep AI brand governance review on submitted content against
    retrieved approved evidence with dual-provider autonomous fallback.
    Never returns fake placeholder findings.
    """
    try:
        response = await provider_manager.execute_review(
            content_id=payload.content_id,
            organisation_id=payload.organisation_id,
            body=payload.body,
            evidence=payload.evidence,
            context=payload.context,
            force_failover=payload.force_failover,
        )
        return response
    except RuntimeError as e:
        err_msg = str(e)
        logger.error(f"Review execution failed: {err_msg}")
        status_code = 503 if "unconfigured" in err_msg.lower() else 502
        raise HTTPException(status_code=status_code, detail=err_msg)
    except Exception as e:
        logger.error(f"Unexpected review error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Unexpected AI Service error: {str(e)}")
