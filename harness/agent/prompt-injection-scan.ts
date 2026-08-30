// Heuristic prompt-injection detector used by the security reviewer
// specialist to scan untrusted tool output, logs, runbooks, and deployment
// descriptions (see SECURITY.md "Prompt injection", ARCHITECTURE.md
// "Security reviewer"). This never executes or interprets the scanned
// text — it only flags characteristic override phrases for human
// attention. It is a heuristic layer of defense, not a substitute for the
// system-wide rule that tool output is always untrusted data.
export interface PromptInjectionMatch {
  readonly pattern: string;
  readonly excerpt: string;
}

export interface PromptInjectionScanResult {
  readonly flagged: boolean;
  readonly matches: readonly PromptInjectionMatch[];
}

const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore (all )?(the )?(previous|prior|above) instructions/i,
  /disregard (the )?(system prompt|previous instructions)/i,
  /skip (the )?approval/i,
  /roll ?back immediately/i,
  /you are now (an?|the)/i,
  /new instructions?:/i,
  /act as (an?|the)/i,
  /override (safety|approval|policy)/i,
  /no approval (is )?needed/i,
  /approved automatically/i,
  /bypass (the )?(approval|policy)/i,
];

/** Scans `text` for known prompt-injection phrasing; returns every match with a short surrounding excerpt. */
export function scanForPromptInjection(
  text: string,
): PromptInjectionScanResult {
  const matches: PromptInjectionMatch[] = [];
  for (const pattern of INJECTION_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      const start = Math.max(0, match.index - 20);
      const end = Math.min(text.length, match.index + match[0].length + 20);
      matches.push({
        pattern: pattern.source,
        excerpt: text.slice(start, end),
      });
    }
  }
  return { flagged: matches.length > 0, matches };
}
