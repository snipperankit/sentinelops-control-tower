// Redacts sensitive fields before evidence/audit persistence or display
// (see SECURITY.md "Audit security": never record API keys, access
// tokens, passwords, full payment details, or unnecessary personal data).
// Pure and recursive — never mutates its input.

const REDACTED = "[REDACTED]";

const SENSITIVE_FIELD_NAME_PATTERNS: readonly RegExp[] = [
  /api[_-]?key/i,
  /access[_-]?token/i,
  /\btoken\b/i,
  /password/i,
  /secret/i,
  /authorization/i,
  /\bcvv\b/i,
  /card[_-]?number/i,
  /credit[_-]?card/i,
  /\bssn\b/i,
  /social[_-]?security/i,
  /account[_-]?number/i,
];

export function isSensitiveFieldName(fieldName: string): boolean {
  return SENSITIVE_FIELD_NAME_PATTERNS.some((pattern) =>
    pattern.test(fieldName),
  );
}

/**
 * Recursively redacts values whose object key matches a sensitive field
 * name pattern; arrays and non-sensitive nested objects are walked, not
 * skipped wholesale, so one sensitive field never causes an entire evidence
 * result to be dropped.
 */
export function redactSensitiveFields<T>(value: T): T {
  return redact(value) as T;
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, fieldValue] of Object.entries(value)) {
      result[key] = isSensitiveFieldName(key) ? REDACTED : redact(fieldValue);
    }
    return result;
  }
  return value;
}
