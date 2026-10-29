from typing import List, Optional, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field

class FindingCategory(str, Enum):
    PROHIBITED_PHRASE = "prohibited_phrase"
    UNSUPPORTED_CLAIM = "unsupported_claim"
    TONE = "tone"
    TERMINOLOGY = "terminology"
    GUARANTEE = "guarantee"
    ACCESSIBILITY = "accessibility"
    DISCLAIMER = "disclaimer"
    FACTUAL_ERROR = "factual_error"

class FindingSeverity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"

class Finding(BaseModel):
    category: FindingCategory
    severity: FindingSeverity
    flagged_text: str = Field(..., description="Exact substring or location in the submitted text")
    explanation: str = Field(..., description="Clear explanation of the violation")
    guideline: str = Field(..., description="Approved rule or guideline that applies")
    source_ids: List[str] = Field(default_factory=list, description="IDs of approved sources cited")
    source_excerpts: List[str] = Field(default_factory=list, description="Verbatim citations supporting this finding")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    suggested_correction: Optional[str] = Field(None, description="Actionable alternative preserving creator's intent")
    requires_human_review: bool = Field(default=False)

class Recommendation(BaseModel):
    id: str = Field(..., description="Unique recommendation identifier")
    issue: str = Field(..., description="Clear identification of the editorial or brand problem")
    rationale: str = Field(..., description="Why this recommendation matters based on brand guidelines")
    impact: str = Field(..., description="Potential business, brand, or regulatory impact of non-compliance")
    evidence_sources: List[str] = Field(default_factory=list, description="IDs of authorized sources supporting this recommendation")
    evidence_excerpts: List[str] = Field(default_factory=list, description="Verbatim citations from retrieved evidence")
    suggested_correction: str = Field(..., description="Actionable replacement text")
    is_evidence_backed: bool = Field(default=True, description="True if backed directly by retrieved evidence; False if general model inference")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)

class FindingSummary(BaseModel):
    total_findings: int = 0
    total_recommendations: int = 0
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0

class ReviewRequest(BaseModel):
    content_id: str
    organisation_id: str
    content_type: str = "website"
    body: str
    context: Optional[Dict[str, Any]] = None

class ReviewResponse(BaseModel):
    review_id: str
    status: str
    provider: str
    model: str
    latency_ms: int
    retry_count: int
    is_demo_mode: bool
    findings: List[Finding] = Field(default_factory=list)
    recommendations: List[Recommendation] = Field(default_factory=list)
    summary: FindingSummary

class ProviderHealthStatus(BaseModel):
    provider: str
    model: str
    configured: bool
    status: str
    connectivity: str = "unconfigured"
    latency_ms: Optional[int] = None
    last_checked: Optional[str] = None
    last_successful_review: Optional[str] = None
    message: Optional[str] = None

class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    is_demo_mode: bool = False
    providers: Dict[str, ProviderHealthStatus]
    last_successful_review: Optional[Dict[str, Any]] = None
