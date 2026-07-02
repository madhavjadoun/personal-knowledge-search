"""
routers/credits.py — Daily MCQ Credit System endpoints.

GET /credits/status — return today's credit balance for the authenticated user
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from services.auth import get_current_user_id
from services.rate_limiter import api_limiter
from services.supabase_client import get_or_create_daily_credits

router = APIRouter()


def _next_midnight_utc() -> str:
    """Return the ISO-8601 timestamp of the next UTC midnight (i.e. when credits reset)."""
    now_utc = datetime.now(tz=timezone.utc)
    next_midnight = (now_utc + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return next_midnight.isoformat()


# ── GET /credits/status ───────────────────────────────────────────────────────

@router.get("/status")
async def get_credit_status(
    request: Request,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Return the authenticated user's daily MCQ credit balance.

    Response:
        {
            "credits_used":      int,   # MCQs generated today
            "credits_limit":     int,   # daily cap (30)
            "credits_remaining": int,   # credits_limit - credits_used
            "reset_at":          str,   # ISO-8601 UTC timestamp of next reset
        }
    """
    # ── Rate limiting ──────────────────────────────────────────────────────────
    ip = request.client.host if request.client else "unknown"
    api_limiter.check_rate_limit(f"api_ip:{ip}", ip)
    api_limiter.check_rate_limit(f"api_user:{user_id}", ip)

    try:
        row = get_or_create_daily_credits(user_id)
    except Exception as exc:
        print(f"[credits] Failed to fetch credit status for user_id='{user_id}': {exc}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch credit status.",
        ) from exc

    used      = row["credits_used"]
    limit     = row["credits_limit"]
    remaining = max(0, limit - used)

    return {
        "credits_used":      used,
        "credits_limit":     limit,
        "credits_remaining": remaining,
        "reset_at":          _next_midnight_utc(),
    }
