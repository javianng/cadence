// Pure dashboard metrics. Kept free of Firebase so they're unit-testable and
// shared by all three personas. All margins are in bps.

import type { EscalationCode } from "~/lib/agent/rules";

const DAYS_PER_YEAR = 365;
/** The annual model reprices once a year: period 52 of weekly periods. */
export const ANNUAL_RESET_PERIOD = 52;

type HistoryPoint = {
  period: number;
  marginAfterBps: number;
  staticMarginBps: number;
  escalations: readonly string[];
};

/**
 * Interest saved vs the static annual model so far:
 * Σ (static − cadence) bps × facility × periodDays/365.
 * Negative when Cadence cost the borrower more (step-ups).
 */
export function savingsToDate(
  history: readonly HistoryPoint[],
  facilityAmount: number,
  periodDays: number,
): number {
  return history.reduce(
    (sum, h) =>
      sum +
      ((h.staticMarginBps - h.marginAfterBps) / 10_000) *
        facilityAmount *
        (periodDays / DAYS_PER_YEAR),
    0,
  );
}

/** Annualised interest difference at today's margin vs the static margin. */
export function annualRunRate(
  staticMarginBps: number,
  currentMarginBps: number,
  facilityAmount: number,
): number {
  return ((staticMarginBps - currentMarginBps) / 10_000) * facilityAmount;
}

/** Share (0–1) of periods that needed no human (no escalation). */
export function autoHandledRate(history: readonly HistoryPoint[]): number {
  if (history.length === 0) return 0;
  return (
    history.filter((h) => h.escalations.length === 0).length / history.length
  );
}

/** Facility-weighted average of the latest transition scores. */
export function portfolioScore(
  loans: readonly { currentScore: number; facilityAmount: number }[],
): number {
  const total = loans.reduce((s, l) => s + l.facilityAmount, 0);
  if (total === 0) return 0;
  return (
    loans.reduce((s, l) => s + l.currentScore * l.facilityAmount, 0) / total
  );
}

/**
 * Weeks by which continuous monitoring flagged a problem before the annual
 * review would have: ANNUAL_RESET_PERIOD − first escalated period. Averaged
 * over loans that escalated at all; null if none did.
 */
export function earlyDetectionLeadWeeks(
  historiesByLoan: readonly (readonly HistoryPoint[])[],
): number | null {
  const leads = historiesByLoan
    .map((h) => h.find((p) => p.escalations.length > 0)?.period)
    .filter((p): p is number => p !== undefined)
    .map((p) => Math.max(0, ANNUAL_RESET_PERIOD - p));
  if (leads.length === 0) return null;
  return leads.reduce((a, b) => a + b, 0) / leads.length;
}

/** Share of decided exceptions where the RM followed the agent's advice. */
export function rmAgentAgreement(
  exceptions: readonly { agreedWithAgent?: boolean | null }[],
): { agreed: number; overridden: number; rate: number | null } {
  const decided = exceptions.filter(
    (e) => typeof e.agreedWithAgent === "boolean",
  );
  const agreed = decided.filter((e) => e.agreedWithAgent).length;
  return {
    agreed,
    overridden: decided.length - agreed,
    rate: decided.length ? agreed / decided.length : null,
  };
}

const SEVERITY: Record<EscalationCode, number> = {
  STEP_UP: 3,
  KPI_BREACH: 3,
  DATA_MISMATCH: 2,
  ANOMALY: 2,
  SHARP_DECLINE: 2,
  DATA_GAP: 1,
};

/** Queue ordering: rule weights, +2 if a step-up awaits approval. */
export function exceptionSeverity(
  codes: readonly EscalationCode[],
  pendingAdjustmentBps = 0,
): number {
  return (
    codes.reduce((s, c) => s + (SEVERITY[c] ?? 1), 0) +
    (pendingAdjustmentBps > 0 ? 2 : 0)
  );
}

export function severityLabel(score: number): "High" | "Medium" | "Low" {
  return score >= 5 ? "High" : score >= 3 ? "Medium" : "Low";
}

export type ScoreMover = {
  kpiId: string;
  /** Change in this KPI's weighted contribution to the transition score. */
  contributionDelta: number;
  scoreDelta: number;
  score: number;
};

/** Which KPIs moved the transition score since the previous period. */
export function scoreMovers(
  previous: readonly { id: string; score: number; weight: number }[],
  current: readonly { id: string; score: number; weight: number }[],
): ScoreMover[] {
  const totalWeight = current.reduce((s, k) => s + k.weight, 0) || 1;
  return current
    .map((k) => {
      const prev = previous.find((p) => p.id === k.id)?.score ?? k.score;
      return {
        kpiId: k.id,
        scoreDelta: k.score - prev,
        contributionDelta: ((k.score - prev) * k.weight) / totalWeight,
        score: k.score,
      };
    })
    .sort(
      (a, b) => Math.abs(b.contributionDelta) - Math.abs(a.contributionDelta),
    );
}

/** Next weekly assessment after the current period. */
export function nextAssessmentDate(
  startDate: Date,
  currentPeriod: number,
  periodDays: number,
): Date {
  return new Date(
    startDate.getTime() + (currentPeriod + 1) * periodDays * 86_400_000,
  );
}

/** Count of each rule code, optionally per period (for stacked charts). */
export function escalationCounts(
  rows: readonly { period: number; escalations: readonly string[] }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const code of r.escalations) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return counts;
}
