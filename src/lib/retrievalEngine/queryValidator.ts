const MAX_QUERY_LENGTH = 2000;

/**
 * Validates and normalises a raw user query string.
 * Returns the cleaned query or throws a typed error object.
 *
 * Normalization applied:
 * - Unicode normalization (NFC)
 * - Remove invisible / control characters
 * - Normalize punctuation & repeated punctuation (e.g. ??? -> ?, !!! -> !)
 * - Collapse multiple spaces and trim
 */
export function validateQuery(raw: string): string {
  if (typeof raw !== "string") {
    throw { code: "EMPTY_QUERY", message: "Query must be a non-empty string." };
  }

  // 1. Unicode normalization (NFC)
  let text = raw.normalize("NFC");

  // 2. Remove invisible/control characters
  text = text.replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200D\uFEFF]/g, "");

  // 3. Normalize repeated punctuation
  text = text.replace(/([.!?,\-])\1+/g, "$1");

  // 4. Collapse multiple spaces and trim
  text = text.replace(/\s+/g, " ").trim();

  if (text.length === 0) {
    throw { code: "EMPTY_QUERY", message: "Query cannot be empty or whitespace only." };
  }

  if (text.length > MAX_QUERY_LENGTH) {
    throw {
      code: "QUERY_TOO_LONG",
      message: `Query is too long (${text.length} chars). Maximum allowed is ${MAX_QUERY_LENGTH}.`,
    };
  }

  return text;
}
