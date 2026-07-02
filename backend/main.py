"""
main.py — FastAPI entry point for the PDF Quiz Generator API.

Responsibilities:
  - Boot the FastAPI application
  - Configure CORS for the Next.js frontend
  - Mount all routers
  - Expose a health-check endpoint
"""

import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import documents, quiz, credits

# ── Load environment variables from .env ──────────────────────────────────────
load_dotenv()

# ── Application factory ───────────────────────────────────────────────────────
app = FastAPI(
    title="PDF Quiz Generator API",
    description="A FastAPI backend that parses PDFs and generates MCQ quizzes via Gemini.",
    version="1.0.0",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
def _allowed_origins() -> list[str]:
    defaults = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
