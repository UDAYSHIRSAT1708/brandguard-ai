import secrets
from fastapi import Security, HTTPException, status
from fastapi.security.api_key import APIKeyHeader
from app.core.config import settings

api_key_header = APIKeyHeader(name="X-Internal-API-Key", auto_error=False)

def verify_internal_api_key(api_key: str = Security(api_key_header)) -> bool:
    """
    Enforces internal service boundaries. Only authorized backend calls
    carrying the correct pre-shared secret key can invoke AI inspection endpoints.
    Uses timing-safe comparison to prevent side-channel timing attacks.
    """
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing required internal service authentication key."
        )
    if not secrets.compare_digest(api_key, settings.AI_SERVICE_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid internal service authentication credentials."
        )
    return True
