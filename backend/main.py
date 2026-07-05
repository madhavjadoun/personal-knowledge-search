"""
main.py — FastAPI entry point for the PDF Quiz Generator API.

Responsibilities:
  - Boot the FastAPI application
  - Configure CORS for the Next.js frontend
  - Mount all routers
  - Expose a health-check endpoint
"""

import os
import logging
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from routers import documents, quiz, credits

# ── Load environment variables from .env ──────────────────────────────────────
load_dotenv()

is_prod = os.getenv("APP_ENV", "production").lower() == "production"

# ── Validate Environment Variables in Production ──────────────────────────────
if is_prod:
    missing_vars = []
    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY", "").strip()
    if not supabase_url or "supabase.co" not in supabase_url:
        missing_vars.append("SUPABASE_URL")
    if not supabase_key or len(supabase_key) < 50:
        missing_vars.append("SUPABASE_SERVICE_KEY")
    
    # Need at least one valid Gemini API Key
    gemini_keys = [os.getenv(f"GEMINI_KEY_{i}", "").strip() for i in range(1, 6)]
    valid_keys = [k for k in gemini_keys if k and k.lower() != "your_key_here"]
    if not valid_keys:
        missing_vars.append("GEMINI_KEY_1 (At least one valid GEMINI_KEY is required)")
        
    if missing_vars:
        raise EnvironmentError(
            f"Production environment validation failed. Missing or invalid variables: {', '.join(missing_vars)}"
        )

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api_security")

# ── Application factory (Production Hardened) ──────────────────────────────────

app = FastAPI(
    title="PDF Quiz Generator API",
    description="A FastAPI backend that parses PDFs and generates MCQ quizzes via Gemini.",
    version="1.0.0",
    docs_url=None if is_prod else "/docs",
    redoc_url=None if is_prod else "/redoc",
    openapi_url=None if is_prod else "/openapi.json",
)

# ── Global Exception Handler (Hides Stack Traces) ─────────────────────────────
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception in API: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred. Please try again later."}
    )

# ── Request Payload Size Limits Middleware ────────────────────────────────────
@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            size = int(content_length)
            # Limit upload requests to 30 MB
            if "/upload" in request.url.path:
                if size > 30 * 1024 * 1024:
                    return JSONResponse(
                        status_code=413,
                        content={"detail": "Request payload too large. Max size is 30 MB."}
                    )
            # Limit other API requests to 2 MB
            else:
                if size > 2 * 1024 * 1024:
                    return JSONResponse(
                        status_code=413,
                        content={"detail": "Request payload too large. Max size is 2 MB."}
                    )
        except ValueError:
            pass
    return await call_next(request)

# ── HTTP Security Headers Middleware ──────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=(), interest-cohort=()"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    return response

# ── CORS ─────────────────────────────────────────────────────────────────────
def _allowed_origins() -> list[str]:
    defaults = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "https://quizgens.tech",
    ]
    configured = [
        origin.strip()
        for origin in (
            os.getenv("CORS_ALLOWED_ORIGINS")
            or os.getenv("ALLOWED_ORIGINS")
            or ""
        ).split(",")
        if origin.strip()
    ]
    return list(dict.fromkeys(defaults + configured))


app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_origin_regex=r"https://.*\.up\.railway\.app",
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept", "Origin"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(documents.router, prefix="/documents", tags=["Documents"])
app.include_router(quiz.router,      prefix="/quiz",      tags=["Quiz"])
app.include_router(credits.router,   prefix="/credits",   tags=["Credits"])


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
async def health_check() -> dict:
    """Return a simple health-check payload to confirm the API is running."""
    return {"status": "ok", "message": "Quiz Generator API running"}
