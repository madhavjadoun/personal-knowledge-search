"""
services/gemini_client.py — Gemini API client with round-robin key rotation.
"""

from __future__ import annotations

import json
import os
import itertools
from typing import Any
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv
import requests

load_dotenv()

# ── Key pool ──────────────────────────────────────────────────────────────────
# Load GEMINI keys and filter out empty or placeholder keys
_raw_keys = [
    os.getenv("GEMINI_KEY_1", ""),
    os.getenv("GEMINI_KEY_2", ""),
    os.getenv("GEMINI_KEY_3", ""),
    os.getenv("GEMINI_KEY_4", ""),
    os.getenv("GEMINI_KEY_5", ""),
]

GEMINI_KEYS = [
    k.strip() for k in _raw_keys 
    if k.strip() and k.strip().lower() not in ("your_key_here", "")
]

_key_cycle = None

def _get_next_key() -> tuple[str, str]:
    """Advance key rotation and return (key, key_label) pair."""
    global _key_cycle
    if not GEMINI_KEYS:
        raise EnvironmentError("No valid GEMINI keys found in .env. Please define GEMINI_KEY_1.")
    
    if _key_cycle is None:
        _key_cycle = itertools.cycle(GEMINI_KEYS)
    
    key = next(_key_cycle)
    try:
        idx = GEMINI_KEYS.index(key) + 1
    except ValueError:
        idx = 1
    return key, f"GEMINI_KEY_{idx}"


# ── Prompt Template ───────────────────────────────────────────────────────────

_QUIZ_PROMPT_TEMPLATE = """\
You are a quiz generator. Read the following document text and generate exactly {num_questions} multiple-choice questions.

STRICT OUTPUT RULES:
- You MUST generate EXACTLY {num_questions} questions. This is mandatory. Do not stop early.
- Return ONLY a valid JSON array. No markdown, no explanation, no preamble.
- The array must contain exactly {num_questions} objects.
- Each object must have these exact keys:
    "question"    — the question text
    "options"     — array of exactly 4 answer choices
    "correct"     — exact text of correct option (must match one of the 4 options exactly)
    "explanation" — 1-2 short sentences explaining why correct is right

DOCUMENT TEXT:
\"\"\"{text}\"\"\"

Return JSON array only:"""


# ── Internal Helpers ──────────────────────────────────────────────────────────

def clean_and_repair_json(raw: str) -> str:
    """
    Cleans raw response from Gemini:
    - Removes markdown fences (e.g. ```json, ```)
    - Extracts only the JSON array content (everything from first '[' to last ']')
    - Removes trailing commas safely without affecting string content
    - Resolves unescaped newlines inside strings
    """
    if not raw:
        return ""
    
    # 1. Extract JSON array block using first '[' and last ']'
    start = raw.find("[")
    end = raw.rfind("]")
    if start == -1 or end == -1 or end <= start:
        return ""
    
    json_str = raw[start : end + 1]

    # 2. Safely remove trailing commas while respecting quotes and escape characters
    in_string = False
    escape = False
    chars = list(json_str)
    i = 0
    n = len(chars)
    while i < n:
        c = chars[i]
        if escape:
            escape = False
            i += 1
            continue
        if c == '\\':
            escape = True
            i += 1
            continue
        if c == '"':
            in_string = not in_string
            i += 1
            continue
        if not in_string:
            if c == ',':
                # look ahead to see if the next non-whitespace char is ] or }
                j = i + 1
                while j < n and chars[j].isspace():
                    j += 1
                if j < n and chars[j] in (']', '}'):
                    # Replace trailing comma with space
                    chars[i] = ' '
        i += 1
    json_str = "".join(chars)

    # 3. Escape real newlines inside JSON string literals
    in_string = False
    escape = False
    chars = list(json_str)
    i = 0
    n = len(chars)
    while i < n:
        c = chars[i]
        if escape:
            escape = False
            i += 1
            continue
        if c == '\\':
            escape = True
            i += 1
            continue
        if c == '"':
            in_string = not in_string
            i += 1
            continue
        if in_string and c == '\n':
            chars[i] = '\\n'
        i += 1
    
    return "".join(chars)


def _query_and_validate(prompt: str) -> list[dict[str, Any]]:
    """Helper to query Gemini, extract, and validate questions."""
    last_exc = None
    raw = ""

    for attempt in range(len(GEMINI_KEYS) or 1):
        key, label = _get_next_key()
        print(f"[gemini_client] Attempt {attempt + 1} using {label} — sending request to Gemini...")

        try:
            response = requests.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={key}",
                headers={
                    "Content-Type": "application/json"
                },
                json={
                    "contents": [
                        {
                            "parts": [
                                {
                                    "text": prompt
                                }
                            ]
                        }
                    ],
                    "generationConfig": {
                        "responseMimeType": "application/json",
                        "temperature": 0.7
                    }
                },
                timeout=60
            )

            if response.status_code == 429:
                print(f"[gemini_client] {label} hit 429 quota limit, rotating key...")
                raise Exception("429 rate limit or quota exceeded")

            response.raise_for_status()
            res_json = response.json()

            # Print token usage metadata
            usage = res_json.get("usageMetadata", {})
            if usage:
                print(f"[gemini_client] Prompt Tokens : {usage.get('promptTokenCount')}")
                print(f"[gemini_client] Output Tokens : {usage.get('candidatesTokenCount')}")
                print(f"[gemini_client] Total Tokens  : {usage.get('totalTokenCount')}")
            
            # Robust schema validation of response payload
            if "candidates" in res_json and len(res_json["candidates"]) > 0:
                raw = res_json["candidates"][0]["content"]["parts"][0]["text"]
            elif "error" in res_json:
                error_msg = res_json["error"].get("message", "Unknown error payload")
                raise ValueError(f"Gemini API error payload: {error_msg}")
            else:
                raise KeyError("API response missing 'candidates' block and 'error' message")

            print(f"[gemini_client] Response received — {len(raw)} chars")

            # Clean JSON
            json_str = clean_and_repair_json(raw)
            if not json_str:
                raise ValueError("No valid JSON array boundaries found in output")

            # Parse JSON
            try:
                questions_raw = json.loads(json_str)
            except json.JSONDecodeError as exc:
                raise ValueError(f"JSON parsing error: {exc}")

            if not isinstance(questions_raw, list):
                raise ValueError("Parsed JSON is not a list")

            valid: list[dict[str, Any]] = []
            for i, q in enumerate(questions_raw):
                if not isinstance(q, dict):
                    continue
                if not all(k in q for k in ("question", "options", "correct", "explanation")):
                    continue
                options = q["options"]
                if not isinstance(options, list) or len(options) != 4:
                    continue
                if q["correct"] not in options:
                    continue
                valid.append(q)
            
            print(f"[gemini_client] Parse success: parsed {len(valid)} valid questions.")
            return valid

        except Exception as exc:
            print(f"[gemini_client] Parse failure or API error using {label}: {exc}. Retry reason: rotating to next API key.")
            last_exc = exc
            continue
    else:
        raise RuntimeError(f"All Gemini keys failed. Last error: {last_exc}")


# ── Public API ────────────────────────────────────────────────────────────────

def _execute_batch_thread(text: str, batch_size: int, batch_idx: int) -> list[dict[str, Any]]:
    # Rotate perspective to ensure diversity and avoid duplicate questions across parallel threads
    perspectives = [
        "Focus on conceptual understanding and core logic.",
        "Focus on key terms, definitions, and facts.",
        "Focus on application, analysis, and problem-solving scenarios.",
        "Focus on relationships between concepts and structural details.",
        "Focus on overall summaries, key takeaways, and critical analysis."
    ]
    perspective = perspectives[(batch_idx - 1) % len(perspectives)]
    
    # Format the prompt
    prompt = _QUIZ_PROMPT_TEMPLATE.format(text=text, num_questions=batch_size)
    prompt = prompt.replace("Return JSON array only:", f"PERSPECTIVE FOCUS: {perspective}\n\nReturn JSON array only:")
    
    print(f"[gemini_client] Thread for Batch {batch_idx} started (size: {batch_size}, perspective: {perspective})")
    results = _query_and_validate(prompt)
    
    # Safe retry once inside the thread if target question count wasn't met
    if len(results) < batch_size:
        print(f"[gemini_client] Batch {batch_idx} is short ({len(results)}/{batch_size}). Retrying batch once...")
        retry_prompt = prompt.replace("Return JSON array only:", "PERSPECTIVE FOCUS: Try generating completely different questions from before. \n\nReturn JSON array only:")
        retry_results = _query_and_validate(retry_prompt)
        
        seen = {q["question"].strip().lower() for q in results}
        for q in retry_results:
            q_text = q["question"].strip().lower()
            if q_text not in seen:
                seen.add(q_text)
                results.append(q)
                if len(results) == batch_size:
                    break
                    
    return results


# ── Public API ────────────────────────────────────────────────────────────────

def generate_quiz(text: str, num_questions: int = 10) -> list[dict[str, Any]]:
    """
    Call Gemini to generate MCQ questions from the given document text.
    To ensure high-quality outputs, avoid truncation/API issues, and minimize latency,
    questions are generated in parallel batches of at most 10.
    """
    # ── 1. Truncate input ─────────────────────────────────────────────────────
    # Scale context length limits dynamically with the requested number of questions
    MAX_CHARS = max(3000, num_questions * 350)
    if len(text) > MAX_CHARS:
        print(f"[gemini_client] Text truncated from {len(text)} to {MAX_CHARS} chars (limit scaled for {num_questions} questions)")
        text = text[:MAX_CHARS]

    # ── 2. Divide into batches of at most 10 ──────────────────────────────────
    batches = []
    temp = num_questions
    while temp > 0:
        batch_size = min(10, temp)
        batches.append(batch_size)
        temp -= batch_size

    print(f"[gemini_client] Generating {num_questions} questions concurrently in {len(batches)} batches: {batches}")

    # Run all batches in parallel using ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=len(batches)) as executor:
        futures = [
            executor.submit(_execute_batch_thread, text, batch_size, idx)
            for idx, batch_size in enumerate(batches, start=1)
        ]
        all_batch_results = [f.result() for f in futures]

    # Merge results from all batches, keeping questions unique
    merged_questions: list[dict[str, Any]] = []
    seen_questions_text: set[str] = set()

    for batch_results in all_batch_results:
        for q in batch_results:
            q_text = q["question"].strip().lower()
            if q_text not in seen_questions_text:
                seen_questions_text.add(q_text)
                merged_questions.append(q)

    # ── 3. Post-batch validation & truncation ──────────────────────────────────
    # Truncate to exactly requested questions count
    if len(merged_questions) > num_questions:
        merged_questions = merged_questions[:num_questions]

    print(f"[gemini_client] Total unique valid questions gathered across all batches: {len(merged_questions)}")

    # Minimum threshold check
    min_required = min(8, num_questions)
    if len(merged_questions) < min_required:
        raise ValueError(f"Only {len(merged_questions)} valid questions were generated (minimum {min_required} required).")

    return merged_questions
