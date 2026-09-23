// Deterministic parts of the agent steps: kept pure (no Gemini, no
// Firestore) so they're unit-testable and can never be overridden by the LLM.

import type { EscalationCode } from "~/lib/agent/rules";
import type { Decision } from "~/lib/agent/types";

/** Period-on-period change in the primary value that counts as a jump. */
export const JUMP_THRESHOLD_PCT = 0.3;

/**
 * Relative change of the new primary value vs the previous period's, or null
 * if either is missing (nothing to compare).
 */
export function primaryJumpPct(
  current: number | null,
  previous: number | null | undefined,
): number | null {
  if (current === null || previous === null || previous === undefined) {
    return null;
  }
  if (previous === 0) return current === 0 ? 0 : Infinity;
  return Math.abs(current - previous) / Math.abs(previous);
}

export function isJump(jumpPct: number | null): boolean {
  return jumpPct !== null && jumpPct > JUMP_THRESHOLD_PCT;
}

/**
 * The fixed decision branch: any triggered rule escalates; otherwise the
 * margin either moves (auto_adjust) or doesn't (no_change). Gemini only
 * explains this outcome.
 */
export function decisionFor(
  triggeredRules: readonly EscalationCode[],
  currentMarginBps: number,
  proposedMarginBps: number,
): Decision {
  if (triggeredRules.length > 0) return "escalate";
  return proposedMarginBps === currentMarginBps ? "no_change" : "auto_adjust";
}
