"""
routers/documents.py — Document upload and listing endpoints.

POST /documents/upload — parse PDF, upload to Supabase Storage, save metadata + chunks
GET  /documents/list   — return all documents for a given user
"""

from __future__ import annotations

import os
import uuid
import asyncio
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Request

from services.auth import get_current_user_id
from services.pdf_parser import parse_image, parse_pdf
from services.supabase_client import (
    get_client,
    get_documents,
    save_chunks,
    save_document,
)
from services.rate_limiter import upload_limiter, api_limiter

router = APIRouter()

# ── Constants ─────────────────────────────────────────────────────────────────
STORAGE_BUCKET = "documents"
CHUNK_SIZE     = 500   # characters per chunk
CHUNK_OVERLAP  = 50    # overlap between consecutive chunks
DEFAULT_MAX_UPLOAD_MB = 25

# ── Hardening Limits ──────────────────────────────────────────────────────────
MAX_PDF_PAGES = int(os.getenv("MAX_PDF_PAGES", "100"))
MAX_PDF_CHARS = int(os.getenv("MAX_PDF_CHARS", "500000"))

# ── Allowed file types for upload ─────────────────────────────────────────────
ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
ALLOWED_IMAGE_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}
# .jpg and .jpeg both map to image/jpeg for storage
_EXT_TO_CONTENT_TYPE: dict[str, str] = {
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}
_CONTENT_TYPE_TO_EXT: dict[str, str] = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}

# Concurrency semaphore to prevent overloading pdf parsing resources
upload_semaphore = asyncio.Semaphore(5)


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
            print(
                "[documents] Rejecting because upload size limit failed: "
                f"bytes_read={total}, max_bytes={max_bytes}"
            )
            raise HTTPException(
                status_code=413,
                detail=f"File is too large. Maximum allowed file size is {max_mb:.0f} MB.",
            )
        chunks.append(chunk)
    return b"".join(chunks)


# ── POST /documents/upload ────────────────────────────────────────────────────

@router.post("/upload", status_code=201)
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    legacy_user_id: str | None = Form(None, alias="user_id"),
    current_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Upload a PDF or image (PNG/JPG/JPEG/WEBP), extract text, store in Supabase
    Storage, and save chunks for quiz generation.

    PDFs go through the existing pdfplumber + OCR fallback pipeline.
    Images go through OCR directly (with EXIF orientation correction).
    Everything after text extraction is identical for both types.

    Form data:
        file    — multipart upload (PDF or image)
        user_id — legacy field; ignored in favor of the authenticated JWT user

    Returns:
        {
            "document_id":    str,
            "title":          str,
            "is_large":       bool,
            "chunks_created": int,
        }
    """
    # ── Rate limiting ──────────────────────────────────────────────────────────
    ip = request.client.host if request.client else "unknown"
    api_limiter.check_rate_limit(f"api_ip:{ip}", ip)
    api_limiter.check_rate_limit(f"api_user:{current_user_id}", ip)
    upload_limiter.check_rate_limit(f"upload_ip:{ip}", ip)
    upload_limiter.check_rate_limit(f"upload_user:{current_user_id}", ip)

    async with upload_semaphore:
        # ── 1. Validate inputs ────────────────────────────────────────────────────
        user_id = current_user_id.strip()

        submitted_user_id = (legacy_user_id or "").strip()
        if submitted_user_id and submitted_user_id != current_user_id:
            print("[documents] Ignoring mismatched legacy user_id form field.")

        print(f"[documents] Upload request — filename='{file.filename}', authenticated_user_id='{current_user_id}'")
        print(f"[documents] Upload content_type='{file.content_type}'")
        print(f"[documents] Upload headers={dict(file.headers)}")

        # ── Determine file type from extension ────────────────────────────────
        original_filename = os.path.basename(file.filename or "document")
        fname_lower = original_filename.lower()
        detected_extension = os.path.splitext(fname_lower)[1]

        if file.content_type in ALLOWED_IMAGE_CONTENT_TYPES:
            file_type = "image"
        elif fname_lower.endswith(".pdf"):
            file_type = "pdf"
        elif detected_extension in ALLOWED_IMAGE_EXTENSIONS:
            file_type = "image"
        else:
            print(
                "[documents] Rejecting because extension/content-type validation failed: "
                f"filename='{original_filename}', extension='{detected_extension}', "
                f"content_type='{file.content_type}'"
            )
            raise HTTPException(
                status_code=400,
                detail=(
                    "Unsupported file type. Please upload a PDF or an image "
                    "(PNG, JPG, JPEG, WEBP)."
                ),
            )
        print(
            "[documents] Detected upload type: "
            f"extension='{detected_extension}', file_type='{file_type}', "
            f"content_type='{file.content_type}'"
        )

        # ── Validate content-type when provided by the client ─────────────────
        if file.content_type:
            if file_type == "pdf" and file.content_type not in ("application/pdf", "application/x-pdf"):
                print(
                    "[documents] Rejecting because content type validation failed for PDF: "
                    f"filename='{original_filename}', content_type='{file.content_type}'"
                )
                raise HTTPException(
                    status_code=400,
                    detail="Only PDF files are accepted for the .pdf extension. Please upload a valid PDF.",
                )
            if file_type == "image" and file.content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
                print(
                    "[documents] Rejecting because content type validation failed for image: "
                    f"filename='{original_filename}', content_type='{file.content_type}'"
                )
                raise HTTPException(
                    status_code=400,
                    detail="Unsupported image type. Please upload a PNG, JPG, JPEG, or WEBP image.",
                )

        # ── PDF magic-byte validation (images skip this) ──────────────────────
        if file_type == "pdf":
            magic = await file.read(4)
            await file.seek(0)
            if magic != b"%PDF":
                print(
                    "[documents] Rejecting because magic bytes failed for PDF: "
                    f"filename='{original_filename}', magic={magic!r}"
                )
                raise HTTPException(
                    status_code=400,
                    detail="Invalid file format. The file is not a valid PDF document.",
                )

        # ── Build storage filename and derive title ───────────────────────────
        file_uuid = str(uuid.uuid4())
        if file_type == "pdf":
            storage_ext          = ".pdf"
            storage_content_type = "application/pdf"
        else:
            last_dot = original_filename.rfind(".")
            submitted_ext        = original_filename[last_dot:].lower() if last_dot != -1 else ""
            storage_ext          = submitted_ext if submitted_ext in ALLOWED_IMAGE_EXTENSIONS else _CONTENT_TYPE_TO_EXT.get(file.content_type or "", ".jpg")
            storage_content_type = _EXT_TO_CONTENT_TYPE.get(storage_ext, "image/jpeg")

        safe_filename = f"{file_uuid}{storage_ext}"

        # Strip the file extension to produce a human-readable title
        title = original_filename
        for known_ext in (".pdf", ".PDF", ".png", ".PNG", ".jpg", ".JPG",
                          ".jpeg", ".JPEG", ".webp", ".WEBP"):
            if title.endswith(known_ext):
                title = title[: -len(known_ext)]
                break
        title = title.replace("_", " ").strip() or "Untitled Document"

        # ── 2. Read bytes ─────────────────────────────────────────────────────────
        max_bytes = _max_upload_bytes()
        file_bytes = await _read_limited_upload(file, max_bytes)
        file_size  = len(file_bytes)
        print(f"[documents] Read {file_size} bytes from original='{original_filename}' -> storage='{safe_filename}'")

        if file_size == 0:
            print(f"[documents] Rejecting because uploaded file is empty: filename='{original_filename}'")
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        # ── 3. Extract text (PDF or Image) ────────────────────────────────────────
        if file_type == "pdf":
            print("[documents] Parsing PDF...")
            try:
                parsed = parse_pdf(file_bytes)
            except ValueError as exc:
                print(f"[documents] Rejecting because PDF parser validation failed: {exc}")
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            except Exception as exc:
                print(f"[documents] Unexpected PDF parsing failure: {exc}")
                raise HTTPException(
                    status_code=500,
                    detail="PDF parsing failed unexpectedly. Please try again with a different PDF.",
                ) from exc

            extracted_text: str = parsed["text"]
            is_large: bool      = parsed["is_large"]
            pages: int          = parsed["pages"]

            # Enforce PDF-specific page count and character limits
            if pages > MAX_PDF_PAGES:
                print(
                    "[documents] Rejecting because PDF page limit failed: "
                    f"pages={pages}, max={MAX_PDF_PAGES}"
                )
                raise HTTPException(
                    status_code=422,
                    detail=f"PDF has too many pages ({pages}). Maximum allowed is {MAX_PDF_PAGES} pages.",
                )
            if len(extracted_text) > MAX_PDF_CHARS:
                print(
                    "[documents] Rejecting because PDF character limit failed: "
                    f"chars={len(extracted_text)}, max={MAX_PDF_CHARS}"
                )
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"PDF text content is too large ({len(extracted_text)} characters). "
                        f"Maximum allowed is {MAX_PDF_CHARS} characters."
                    ),
                )
        else:
            # file_type == "image"
            print(f"[documents] Running OCR on image (type='{storage_content_type}')...")
            try:
                parsed = parse_image(file_bytes)
            except ValueError as exc:
                print(f"[documents] Rejecting because image parser validation failed: {exc}")
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            except Exception as exc:
                print(f"[documents] Unexpected image OCR failure: {exc}")
                raise HTTPException(
                    status_code=500,
                    detail="Image OCR failed unexpectedly. Please try again with a different image.",
                ) from exc

            extracted_text = parsed["text"]
            is_large       = parsed["is_large"]
            pages          = parsed["pages"]

        print(
            f"[documents] Parsed — file_type={file_type}, pages={pages}, "
            f"chars={len(extracted_text)}, is_large={is_large}, title='{title}'"
        )

        # ── 4. Upload original PDF to Supabase Storage ────────────────────────────
        storage_path = f"{user_id}/{safe_filename}"
        print(f"[documents] Uploading PDF to Storage — bucket='{STORAGE_BUCKET}', path='{storage_path}'")

        try:
            client = get_client()
            client.storage.from_(STORAGE_BUCKET).upload(
                path=storage_path,
                file=file_bytes,
                file_options={"content-type": storage_content_type, "upsert": "true"},
            )
            # Store only the storage path for secure private bucket handling
            file_url: str = storage_path
            print(f"[documents] File uploaded — storage path: {file_url}")
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
    request: Request,
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
    # ── Rate limiting ──────────────────────────────────────────────────────────
    ip = request.client.host if request.client else "unknown"
    api_limiter.check_rate_limit(f"api_ip:{ip}", ip)
    api_limiter.check_rate_limit(f"api_user:{current_user_id}", ip)

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

    return {"documents": docs}
