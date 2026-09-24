// Deterministic escalation rules. The LLM explains escalations; it never
// decides whether one fires.

import type { KpiDirection } from "~/lib/scoring";

export const ESCALATION_CODES = [
  "DATA_MISMATCH",
  "KPI_BREACH",
  "SHARP_DECLINE",
  "DATA_GAP",
  "STEP_UP",
  "ANOMALY",
] as const;
export type EscalationCode = (typeof ESCALATION_CODES)[number];

/**
 * Data-integrity escalations freeze pricing: the agent anchors the data hash
 * via flagException instead of submitScore, and the RM decides. Performance
 * escalations (KPI_BREACH, SHARP_DECLINE, STEP_UP) still price normally.
 */
export const PRICING_HOLD_CODES: readonly EscalationCode[] = [
  "DATA_MISMATCH",
  "DATA_GAP",
  "ANOMALY",
];

export function holdsPricing(codes: readonly EscalationCode[]): boolean {
  return codes.some((c) => PRICING_HOLD_CODES.includes(c));
}

export const RULE_THRESHOLDS = {
  /** Primary vs secondary relative divergence above this is a mismatch. */
  mismatchPct: 0.05,
  /** Any KPI score below this is a breach. */
  kpiBreachScore: 40,
  /** Transition score falling by at least this much period-on-period. */
  sharpDeclinePoints: 10,
} as const;

/** |primary − secondary| / |secondary|; null if either side is missing. */
export function divergencePct(
  primary: number | null,
  secondary: number | null,
): number | null {
  if (primary === null || secondary === null) return null;
  if (secondary === 0) return primary === 0 ? 0 : Infinity;
  return Math.abs(primary - secondary) / Math.abs(secondary);
}

/**
 * Reconciliation: take the primary (borrower-reported) value unless it
 * disagrees with the secondary source beyond tolerance, in which case take
 * whichever is worse for the borrower. Missing primary falls back to
 * secondary; both missing -> null (a DATA_GAP).
 */
export function acceptedValue(
  direction: KpiDirection,
  primary: number | null,
  secondary: number | null,
): number | null {
  if (primary === null) return secondary;
  if (secondary === null) return primary;
  const div = divergencePct(primary, secondary)!;
  if (div <= RULE_THRESHOLDS.mismatchPct) return primary;
  return direction === "lower_better"
    ? Math.max(primary, secondary)
    : Math.min(primary, secondary);
}

export type RuleInput = {
  kpis: {
    kpiId: string;
    primaryValue: number | null;
    secondaryValue: number | null;
    score: number;
  }[];
  transitionScore: number;
  previousTransitionScore: number | null;
  pricing: { isIncrease: boolean };
};

/**
 * @param flaggedAnomalyKpiIds KPIs the verify step judged implausible
 *   (deterministic jump check or Gemini); any entry fires ANOMALY.
 */
export function evaluateRules(
  input: RuleInput,
  flaggedAnomalyKpiIds: readonly string[],
): EscalationCode[] {
  const codes: EscalationCode[] = [];

  if (
    input.kpis.some((k) => {
      const div = divergencePct(k.primaryValue, k.secondaryValue);
      return div !== null && div > RULE_THRESHOLDS.mismatchPct;
    })
  ) {
    codes.push("DATA_MISMATCH");
  }

  if (input.kpis.some((k) => k.score < RULE_THRESHOLDS.kpiBreachScore)) {
    codes.push("KPI_BREACH");
  }

  if (
    input.previousTransitionScore !== null &&
    input.previousTransitionScore - input.transitionScore >=
      RULE_THRESHOLDS.sharpDeclinePoints
  ) {
    codes.push("SHARP_DECLINE");
  }

  if (
    input.kpis.some((k) => k.primaryValue === null || k.secondaryValue === null)
  ) {
    codes.push("DATA_GAP");
  }

  if (input.pricing.isIncrease) codes.push("STEP_UP");

  if (flaggedAnomalyKpiIds.length > 0) codes.push("ANOMALY");

  return codes;
}
