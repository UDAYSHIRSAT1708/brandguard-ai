from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from app.models.schemas import ReviewResponse

class BaseAIProvider(ABC):
    """
    Abstract interface for AI brand governance providers.
    All providers must accept identical parameters and produce
    outputs conforming to the unified ReviewResponse schema.
    """
    def __init__(self, provider_name: str, model_name: str, api_key: Optional[str] = None):
        self.provider_name = provider_name
        self.model_name = model_name
        self.api_key = api_key

    @abstractmethod
    async def analyze_content(
        self,
        content_id: str,
        organisation_id: str,
        body: str,
        evidence: List[Dict[str, Any]],
        context: Optional[Dict[str, Any]] = None,
        timeout_seconds: int = 30
    ) -> ReviewResponse:
        pass

    def is_configured(self) -> bool:
        return bool(self.api_key and len(self.api_key.strip()) > 0)

    @abstractmethod
    async def check_connectivity(self, timeout_seconds: float = 3.0) -> Dict[str, Any]:
        """
        Safely probes upstream provider connectivity without exposing credentials.
        Returns: {
            "configured": bool,
            "connected": bool,
            "latency_ms": Optional[int],
            "error": Optional[str]
        }
        """
        pass
