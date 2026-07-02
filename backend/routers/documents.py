"""
routers/documents.py — Document upload and listing endpoints.

POST /documents/upload — parse PDF, upload to Supabase Storage, save metadata + chunks
GET  /documents/list   — return all documents for a given user
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from services.auth import get_current_user_id
from services.pdf_parser import parse_pdf
from services.supabase_client import (
    get_client,
    get_documents,
    save_chunks,
    save_document,
)

router = APIRouter()

# ── Constants ─────────────────────────────────────────────────────────────────
STORAGE_BUCKET = "documents"
CHUNK_SIZE     = 500   # characters per chunk
CHUNK_OVERLAP  = 50    # overlap between consecutive chunks
DEFAULT_MAX_UPLOAD_MB = 25


# ── Helpers ───────────────────────────────────────────────────────────────────

def _chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """
    Split `text` into overlapping windows of `size` characters.

    E.g. with size=500, overlap=50:
      chunk 0 → chars [0, 500)
      chunk 1 → chars [450, 950)
      ...
    """
    if not text:
        return []

    step = size - overlap
    chunks: list[str] = []
    start = 0

    while start < len(text):
        end = start + size
        chunks.append(text[start:end])
        start += step

    return chunks


def _max_upload_bytes() -> int:
    """Return configured maximum upload size, preserving legacy env names."""
    raw_bytes = os.getenv("MAX_UPLOAD_BYTES", "").strip()
    if raw_bytes:
        try:
            return max(1, int(raw_bytes))
        except ValueError:
            print("[documents] Invalid MAX_UPLOAD_BYTES value; falling back to MB limit.")

    raw_mb = (
        os.getenv("MAX_UPLOAD_MB")
        or os.getenv("MAX_PDF_UPLOAD_MB")
        or str(DEFAULT_MAX_UPLOAD_MB)
    )
    try:
        return max(1, int(raw_mb)) * 1024 * 1024
    except ValueError:
        print("[documents] Invalid MAX_UPLOAD_MB value; using default.")
        return DEFAULT_MAX_UPLOAD_MB * 1024 * 1024


async def _read_limited_upload(file: UploadFile, max_bytes: int) -> bytes:
    """Read an UploadFile in chunks and stop before unbounded memory growth."""
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            max_mb = max_bytes / (1024 * 1024)
            raise HTTPException(
                status_code=413,
                detail=f"File is too large. Maximum allowed PDF size is {max_mb:.0f} MB.",
            )
        chunks.append(chunk)
    return b"".join(chunks)


# ── POST /documents/upload ────────────────────────────────────────────────────

@router.post("/upload", status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    legacy_user_id: str | None = Form(None, alias="user_id"),
    current_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Upload a PDF, extract text, store in Supabase Storage, and save chunks.

    Form data:
        file    — multipart PDF upload
        user_id — legacy field; ignored in favor of the authenticated JWT user

    Returns:
        {
            "document_id":    str,
            "title":          str,
            "is_large":       bool,
            "chunks_created": int,
        }
    """
    # ── 1. Validate inputs ────────────────────────────────────────────────────
    user_id = current_user_id.strip()

    submitted_user_id = (legacy_user_id or "").strip()
    if submitted_user_id and submitted_user_id != current_user_id:
        print("[documents] Ignoring mismatched legacy user_id form field.")

    print(f"[documents] Upload request — filename='{file.filename}', authenticated_user_id='{current_user_id}'")

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are accepted. Please upload a .pdf file.",
        )
    if file.content_type and file.content_type not in ("application/pdf", "application/x-pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are accepted. Please upload a valid PDF.",
        )

    # Sanitize the filename to prevent directory traversal or folder structure breakout
    safe_filename = os.path.basename(file.filename)
    if not safe_filename or not safe_filename.lower().endswith(".pdf"):
        safe_filename = "uploaded_document.pdf"

    # ── 2. Read bytes ─────────────────────────────────────────────────────────
    max_bytes = _max_upload_bytes()
    file_bytes = await _read_limited_upload(file, max_bytes)
    file_size  = len(file_bytes)
    print(f"[documents] Read {file_size} bytes from '{safe_filename}'")

    if file_size == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # ── 3. Parse PDF ──────────────────────────────────────────────────────────
    print("[documents] Parsing PDF...")
    try:
        parsed = parse_pdf(file_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        print(f"[documents] Unexpected PDF parsing failure: {exc}")
        raise HTTPException(
            status_code=500,
            detail="PDF parsing failed unexpectedly. Please try again with a different PDF.",
        ) from exc

    extracted_text: str  = parsed["text"]
    is_large: bool       = parsed["is_large"]
    pages: int           = parsed["pages"]
    title: str           = safe_filename.removesuffix(".pdf").replace("_", " ").strip()

    print(
        f"[documents] Parsed — pages={pages}, chars={len(extracted_text)}, "
        f"is_large={is_large}, title='{title}'"
    )

    # ── 4. Upload original PDF to Supabase Storage ────────────────────────────
    storage_path = f"{user_id}/{safe_filename}"
    print(f"[documents] Uploading PDF to Storage — bucket='{STORAGE_BUCKET}', path='{storage_path}'")

    try:
        client = get_client()
        client.storage.from_(STORAGE_BUCKET).upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": "application/pdf", "upsert": "true"},
        )
        # Build a public URL for the stored file
        file_url: str = client.storage.from_(STORAGE_BUCKET).get_public_url(storage_path)
        print(f"[documents] PDF uploaded — public URL: {file_url}")
    except Exception as exc:
        print(f"[documents] Storage upload failed: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Failed to upload PDF to storage.",
        ) from exc

    # ── 5. Save document metadata ─────────────────────────────────────────────
    print("[documents] Saving document metadata to database...")
    try:
        doc_row = save_document(
            user_id=user_id,
            title=title,
            file_name=safe_filename,
            file_size=file_size,
            file_url=file_url,
        )
    except Exception as exc:
        print(f"[documents] Failed to save document metadata: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Failed to save document metadata.",
        ) from exc

    document_id: str = doc_row["id"]

    # ── 6. Chunk and save text ────────────────────────────────────────────────
    chunk_dicts: list[dict[str, Any]] = []

    if is_large:
        print(f"[documents] Large PDF — chunking text into {CHUNK_SIZE}-char segments...")
        raw_chunks = _chunk_text(extracted_text)
        chunk_dicts = [
            {"content": chunk, "page_number": 1, "chunk_index": i}
            for i, chunk in enumerate(raw_chunks)
        ]
        print(f"[documents] Created {len(chunk_dicts)} chunk(s)")
    else:
        print("[documents] Small PDF — saving as single chunk")
        chunk_dicts = [{"content": extracted_text, "page_number": 1, "chunk_index": 0}]

    try:
        save_chunks(document_id=document_id, user_id=user_id, chunks=chunk_dicts)
    except Exception as exc:
        print(f"[documents] Failed to save text chunks: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Failed to save text chunks.",
        ) from exc

    print(
        f"[documents] Upload complete — document_id='{document_id}', "
        f"chunks_created={len(chunk_dicts)}"
    )

    return {
        "document_id":    document_id,
        "title":          title,
        "is_large":       is_large,
        "chunks_created": len(chunk_dicts),
    }


# ── GET /documents/list ───────────────────────────────────────────────────────

@router.get("/list")
async def list_documents(
    user_id: str | None = None,
    current_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Return all documents belonging to a user.

    Query parameter:
        user_id — legacy query parameter; ignored in favor of the authenticated JWT user

    Returns:
        {"documents": [...]}
    """
    if user_id and user_id.strip() != current_user_id:
        print("[documents] Ignoring mismatched legacy user_id query parameter.")

    print(f"[documents] Listing documents for authenticated_user_id='{current_user_id}'")

    try:
        docs = get_documents(current_user_id)
    except Exception as exc:
        print(f"[documents] Failed to fetch documents: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch documents.",
        ) from exc

    print(f"[documents] Returning {len(docs)} document(s)")
    return {"documents": docs}
