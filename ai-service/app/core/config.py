import os
from typing import Optional, List
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    PROJECT_NAME: str = "BrandGuard AI Service"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    
    # Internal Authentication
    AI_SERVICE_API_KEY: str = os.getenv("AI_SERVICE_API_KEY", "brandguard-internal-secret-service-key-12345")
    
    # Primary AI Provider Configuration
    AI_PRIMARY_PROVIDER: str = os.getenv("AI_PRIMARY_PROVIDER", "gemini")
    AI_PRIMARY_MODEL: str = os.getenv("AI_PRIMARY_MODEL", "gemini-flash-lite-latest")
    AI_PRIMARY_API_KEY: Optional[str] = (
        os.getenv("AI_PRIMARY_API_KEY") or
        (os.getenv("GEMINI_API_KEY") if os.getenv("AI_PRIMARY_PROVIDER", "gemini").lower() == "gemini" else None) or
        (os.getenv("OPENAI_API_KEY") if os.getenv("AI_PRIMARY_PROVIDER", "gemini").lower() == "openai" else None) or
        (os.getenv("GOOGLE_API_KEY") if os.getenv("AI_PRIMARY_PROVIDER", "gemini").lower() == "gemini" else None)
    )
    
    # Fallback AI Provider Configuration
    AI_FALLBACK_PROVIDER: str = os.getenv("AI_FALLBACK_PROVIDER", "openai")
    AI_FALLBACK_MODEL: str = os.getenv("AI_FALLBACK_MODEL", "gpt-4o-mini")
    AI_FALLBACK_API_KEY: Optional[str] = (
        os.getenv("AI_FALLBACK_API_KEY") or
        (os.getenv("OPENAI_API_KEY") if os.getenv("AI_FALLBACK_PROVIDER", "openai").lower() == "openai" else None) or
        (os.getenv("GEMINI_API_KEY") if os.getenv("AI_FALLBACK_PROVIDER", "openai").lower() == "gemini" else None)
    )
    
    # Guardrails and Budgets
    AI_REQUEST_TIMEOUT_SECONDS: int = int(os.getenv("AI_REQUEST_TIMEOUT_SECONDS", "30"))
    AI_MAX_RETRIES: int = int(os.getenv("AI_MAX_RETRIES", "1"))
    AI_CONTEXT_BUDGET_TOKENS: int = int(os.getenv("AI_CONTEXT_BUDGET_TOKENS", "4000"))

    # Dynamic Network & Allowed Origins
    BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:5000")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
    ALLOWED_ORIGINS: str = os.getenv("ALLOWED_ORIGINS", "")

    @property
    def cors_origins(self) -> List[str]:
        origins = {
            "http://localhost:5000",
            "http://127.0.0.1:5000",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        }
        if self.BACKEND_URL:
            origins.add(self.BACKEND_URL.rstrip("/"))
        if self.FRONTEND_URL:
            origins.add(self.FRONTEND_URL.rstrip("/"))
        if self.ALLOWED_ORIGINS:
            for item in self.ALLOWED_ORIGINS.split(","):
                clean = item.strip().rstrip("/")
                if clean:
                    origins.add(clean)
        return list(origins)


settings = Settings()
