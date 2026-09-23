// Shared shapes for the agent pipeline (verify → reconcile → decide → explain).

import type { Band } from "~/lib/pricing";
import type { KpiDirection } from "~/lib/scoring";

/** A KPI as stored in kpis/{loanId}__{kpiId}. */
export type AgentKpi = {
  kpiId: string;
  name: string;
  unit: string;
  direction: KpiDirection;
  baseline: number;
  finalTarget: number;
  targetPeriod: number;
  weight: number;
  tolerancePct?: number;
  primarySource: string;
  secondarySource: string;
};

/** One period's raw values from both sources. */
export type RawReading = {
  kpiId: string;
  primaryValue: number | null;
  secondaryValue: number | null;
};

/** A stored reading from readings/{loanId}__{kpiId}__pNN. */
export type HistoryReading = RawReading & {
  period: number;
  acceptedValue: number | null;
  score: number;
};

export type LoanTerms = {
  baseMarginBps: number;
  floorBps: number;
  capBps: number;
  maxStepBps: number;
  bands: Band[];
};

export type Decision = "escalate" | "no_change" | "auto_adjust";

export const RECOMMENDED_ACTIONS = [
  "approve_step_up",
  "hold",
  "request_info",
  "accept_data",
] as const;
export type Recommendation = {
  action: (typeof RECOMMENDED_ACTIONS)[number];
  justification: string;
};
