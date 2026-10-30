import os
import warnings

# Suppress library deprecation FutureWarnings (e.g., google.generativeai migration notices)
warnings.filterwarnings("ignore", category=FutureWarning)

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.security import verify_internal_api_key
from app.api.health import router as health_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    docs_url="/docs" if os.getenv("ENVIRONMENT") != "production" else None,
    redoc_url=None
)

# Dynamic CORS: allows configured BACKEND_URL, FRONTEND_URL, and ALLOWED_ORIGINS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Root liveness check
@app.get("/", tags=["Health"])
async def root_status():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": os.getenv("ENVIRONMENT", "development")
    }

# Public health check (supports /health and /api/health)
app.include_router(health_router, tags=["Health"])
app.include_router(health_router, prefix="/api", tags=["Health"])

# AI Review Router
from app.api.review import router as review_router
app.include_router(review_router, prefix="/api", tags=["Review"])

# Deep Diagnostics Router
from app.api.diagnostics import router as diagnostics_router
app.include_router(diagnostics_router, tags=["Diagnostics"])

# Protected internal verification endpoint
@app.get("/api/v1/verify-auth", dependencies=[Depends(verify_internal_api_key)], tags=["Internal"])
async def verify_auth():
    return {"status": "authenticated", "message": "Backend to AI-service handshake verified"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
