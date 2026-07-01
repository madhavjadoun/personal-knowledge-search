"""
routers/quiz.py — Quiz generation and history endpoints.

POST /quiz/generate              — generate an MCQ quiz from a document's chunks
GET  /quiz/history/{document_id} — return all quizzes for a document
"""

from __future__ import annotations

import random
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from services.auth import get_current_user_id
from services.gemini_client import generate_quiz
from services.supabase_client import (
    check_document_ownership,
    check_quiz_ownership,
    consume_credits,
    delete_all_user_quizzes,
    delete_quiz,
    get_chunks,
    get_client,
    get_or_create_daily_credits,
    get_quiz_history,
    save_quiz,
    update_quiz,
)

router = APIRouter()




# ── Request models ────────────────────────────────────────────────────────────

class GenerateQuizRequest(BaseModel):
    """Request body for POST /quiz/generate."""

    document_id: str
    """UUID of the document to generate a quiz from."""

    num_questions: int = 10
    """How many questions to generate (limit 50, defaults to 10)."""


class SubmitQuizRequest(BaseModel):
    """Request body for POST /quiz/submit."""

    quiz_id: str
    status: str
    total_questions: int



# ── POST /quiz/generate ───────────────────────────────────────────────────────

@router.post("/generate", status_code=201)
async def generate_quiz_endpoint(
    body: GenerateQuizRequest,
    user_id: str = Depends(get_current_user_id)
) -> dict[str, Any]:
    """
    Generate a 10-question MCQ quiz for a document and persist it.

    Steps:
      1. Fetch all chunks for the document.
      2. For large PDFs (> 1 chunk), randomly sample up to 3 chunks.
         For small PDFs (1 chunk), use the full text.
      3. Combine selected chunks into a single context string.
      4. Call Gemini to generate questions.
      5. Persist quiz + questions to Supabase.
      6. Return the complete quiz payload.

    Returns:
        {
            "quiz_id":   str,
            "document_id": str,
            "questions": [
                {
                    "question":     str,
                    "options":      list[str],   # 4 items
                    "correct":      str,
                    "explanation":  str,
                },
                ...
            ]
        }
    """
    document_id = body.document_id.strip()
    num_questions = body.num_questions

    if not document_id:
        raise HTTPException(
            status_code=400,
            detail="document_id must be a non-empty string."
        )

    if num_questions < 1 or num_questions > 50:
        raise HTTPException(
            status_code=400,
            detail="Number of questions (num_questions) must be between 1 and 50."
        )

    # Verify ownership of the document
    if not check_document_ownership(document_id, user_id):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: You do not own this document."
        )

    # ── Credit check — BEFORE the Gemini call ─────────────────────────────────
    try:
        credit_row = get_or_create_daily_credits(user_id)
        credits_used  = credit_row["credits_used"]
        credits_limit = credit_row["credits_limit"]
        remaining     = credits_limit - credits_used
        if num_questions > remaining:
            raise HTTPException(
                status_code=402,
                detail=(
                    f"Insufficient credits: generating {num_questions} MCQs requires {num_questions} credits, "
                    f"but you only have {remaining} remaining today (limit: {credits_limit}/day). "
                    f"Your credits reset at midnight UTC."
                ),
            )
    except HTTPException:
        raise  # re-raise our own 402
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check daily credits: {exc}",
        ) from exc

    print(f"[quiz] Generate request — document_id='{document_id}', user_id='{user_id}', num_questions={num_questions}")

    # ── 1. Fetch chunks ───────────────────────────────────────────────────────
    try:
        chunks = get_chunks(document_id)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch document chunks: {exc}",
        ) from exc

    if not chunks:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No chunks found for document_id='{document_id}'. "
                "Ensure the document was uploaded and processed successfully."
            ),
        )

    print(f"[quiz] Found {len(chunks)} chunk(s) for document '{document_id}'")

    # ── 2. Select chunks ──────────────────────────────────────────────────────
    is_large = len(chunks) > 1

    if is_large:
        # Dynamically scale chunk sample size to coverage requirements:
        # e.g., 5 MCQs -> 3-4 chunks, 10 MCQs -> 6-8 chunks, 50 MCQs -> 30-35 chunks.
        calculated_sample_size = int(num_questions * 0.6) + 1
        sample_size = min(calculated_sample_size, len(chunks))
        selected = random.sample(chunks, sample_size)
        # Re-sort by chunk_index to keep reading order
        selected.sort(key=lambda c: c.get("chunk_index", 0))
        print(
            f"[quiz] Large PDF — sampled {sample_size}/{len(chunks)} chunk(s) (target was {calculated_sample_size}) "
            f"(indices: {[c.get('chunk_index') for c in selected]})"
        )
    else:
        selected = chunks
        print("[quiz] Small PDF — using single chunk as full context")

    combined_text: str = "\n\n".join(c["content"] for c in selected)
    print(f"[quiz] Combined context length: {len(combined_text)} chars")

    # ── 3. Generate quiz via Gemini ───────────────────────────────────────────
    print(f"[quiz] Calling Gemini/Quiz API to generate {num_questions} questions...")
    try:
        questions = generate_quiz(combined_text, num_questions=num_questions)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Quiz generation failed — {exc}",
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Quiz API unavailable — {exc}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error during quiz generation: {exc}",
        ) from exc

    print(f"[quiz] Quiz API returned {len(questions)} valid question(s)")

    # ── 4. Persist quiz to Supabase ───────────────────────────────────────────
    print("[quiz] Saving quiz to Supabase...")
    try:
        quiz_id = save_quiz(document_id=document_id, questions=questions)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save quiz to database: {exc}",
        ) from exc

    print(f"[quiz] Quiz saved — quiz_id='{quiz_id}'")

    # ── 5. Consume credits — AFTER successful generation ──────────────────────
    try:
        updated_credits = consume_credits(user_id=user_id, amount=num_questions)
        credits_remaining_after = updated_credits["credits_limit"] - updated_credits["credits_used"]
        print(f"[quiz] Credits consumed — {num_questions} used, {credits_remaining_after} remaining today")
    except ValueError as exc:
        # Extremely unlikely (race condition), but handle gracefully.
        # Quiz is already saved — don't block the response, just log.
        print(f"[quiz] WARNING: Credit consumption failed after generation: {exc}")
        credits_remaining_after = None
    except Exception as exc:
        print(f"[quiz] WARNING: Unexpected error consuming credits: {exc}")
        credits_remaining_after = None

    # ── 6. Return full quiz payload ───────────────────────────────────────────
    return {
        "quiz_id":          quiz_id,
        "document_id":      document_id,
        "questions":        questions,
        "credits_remaining": credits_remaining_after,
    }


# ── GET /quiz/history/{document_id} ──────────────────────────────────────────

@router.get("/history/{document_id}")
async def quiz_history(document_id: str) -> dict[str, Any]:
    """
    Return all quizzes (with nested questions) generated for a document.

    Path parameter:
        document_id — UUID of the document

    Returns:
        {"quizzes": [...]}
    """
    document_id = document_id.strip()
    if not document_id:
        raise HTTPException(status_code=400, detail="document_id path parameter is required.")

    print(f"[quiz] Fetching quiz history for document_id='{document_id}'")

    try:
        quizzes = get_quiz_history(document_id)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch quiz history: {exc}",
        ) from exc

    if not quizzes:
        raise HTTPException(
            status_code=404,
            detail=f"No quizzes found for document_id='{document_id}'.",
        )

    print(f"[quiz] Returning {len(quizzes)} quiz(zes)")
    return {"quizzes": quizzes}


# ── GET /quiz/user-history ───────────────────────────────────────────────────

@router.get("/user-history")
async def get_user_quiz_history(
    user_id: str = Depends(get_current_user_id)
) -> dict[str, Any]:
    """
    Fetch all quizzes associated with the user's documents.
    """
    start_time = time.time()
    print(f"[history] Request received: GET /quiz/user-history")
    print(f"[history] Authenticated user ID: {user_id}")
    
    client = get_client()

    try:
        # 1. Fetch user's documents
        docs_res = client.table("documents").select("id").eq("user_id", user_id).execute()
        doc_ids = [d["id"] for d in (docs_res.data or [])]
        if not doc_ids:
            duration = (time.time() - start_time) * 1000
            print(f"[history] Quizzes returned: 0. Execution time: {duration:.2f}ms")
            return {"quizzes": []}

        # 2. Fetch quizzes for those document IDs
        quizzes_res = (
            client.table("quizzes")
            .select("*, quiz_questions(*)")
            .in_("document_id", doc_ids)
            .order("created_at", desc=True)
            .execute()
        )
        quizzes_data = quizzes_res.data or []
        duration = (time.time() - start_time) * 1000
        print(f"[history] Quizzes returned: {len(quizzes_data)}. Execution time: {duration:.2f}ms")
        return {"quizzes": quizzes_data}
    except Exception as exc:
        duration = (time.time() - start_time) * 1000
        print(f"[history] Failed after {duration:.2f}ms: {exc}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch user quiz history: {exc}"
        ) from exc



# ── POST /quiz/submit ────────────────────────────────────────────────────────

@router.post("/submit")
async def submit_quiz_endpoint(
    body: SubmitQuizRequest,
    user_id: str = Depends(get_current_user_id)
) -> dict[str, Any]:
    """
    Submit/save a completed quiz attempt. Updates status and total_questions.
    """
    quiz_id = body.quiz_id.strip()
    status = body.status.strip()
    total_questions = body.total_questions

    if not quiz_id or not status:
        raise HTTPException(
            status_code=400,
            detail="quiz_id and status must be non-empty strings."
        )

    # Verify ownership of the quiz (and document)
    if not check_quiz_ownership(quiz_id, user_id):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: You do not own this quiz."
        )

    print(f"[quiz] Submit request — quiz_id='{quiz_id}', user_id='{user_id}', total_questions={total_questions}")

    try:
        updated_quiz = update_quiz(
            quiz_id=quiz_id,
            status=status,
            total_questions=total_questions
        )
        return {"success": True, "quiz": updated_quiz}
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update quiz in database: {exc}"
        ) from exc


# ── GET /quiz/{quiz_id} ──────────────────────────────────────────────────────

@router.get("/{quiz_id}")
async def get_quiz_by_id(
    quiz_id: str,
    user_id: str = Depends(get_current_user_id)
) -> dict[str, Any]:
    """
    Fetch a single quiz by its UUID, including nested questions, if the user owns it.
    """
    quiz_id = quiz_id.strip()
    if not quiz_id:
        raise HTTPException(status_code=400, detail="quiz_id path parameter is required.")

    print(f"[quiz] Fetching quiz details for quiz_id='{quiz_id}', user_id='{user_id}'")

    # Verify ownership of the quiz (and document)
    if not check_quiz_ownership(quiz_id, user_id):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: You do not own this quiz."
        )

    try:
        client = get_client()
        result = (
            client.table("quizzes")
            .select("*, quiz_questions(*)")
            .eq("id", quiz_id)
            .single()
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Quiz not found.")
        return result.data
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch quiz details: {exc}"
        ) from exc


# ── DELETE /quiz/clear-all ───────────────────────────────────────────────────

@router.delete("/clear-all")
async def clear_all_quizzes_endpoint(
    user_id: str = Depends(get_current_user_id)
) -> dict[str, Any]:
    """
    Delete all quiz history belonging to the authenticated user.
    """
    print(f"[quiz] Clear all request — user_id='{user_id}'")
    try:
        delete_all_user_quizzes(user_id=user_id)
        return {"success": True, "message": "All quiz history cleared successfully."}
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to clear all quiz history: {exc}"
        ) from exc


# ── DELETE /quiz/{quiz_id} ────────────────────────────────────────────────────

@router.delete("/{quiz_id}")
async def delete_quiz_endpoint(
    quiz_id: str,
    user_id: str = Depends(get_current_user_id)
) -> dict[str, Any]:
    """
    Delete a single quiz attempt by its ID.
    """
    quiz_id = quiz_id.strip()
    if not quiz_id:
        raise HTTPException(status_code=400, detail="quiz_id path parameter is required.")

    print(f"[quiz] Delete request — quiz_id='{quiz_id}', user_id='{user_id}'")

    # Verify ownership of the quiz (and document)
    if not check_quiz_ownership(quiz_id, user_id):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: You do not own this quiz."
        )

    try:
        delete_quiz(quiz_id=quiz_id)
        return {"success": True, "message": f"Quiz {quiz_id} deleted successfully."}
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete quiz: {exc}"
        ) from exc




