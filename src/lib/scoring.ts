// Deterministic KPI + transition scoring. The LLM never does this arithmetic.

export type KpiDirection = "lower_better" | "higher_better";

/** Score for a KPI exactly on its glide path. */
export const ON_TRACK_SCORE = 70;

const EPSILON = 1e-9;

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Linear baseline → finalTarget over targetPeriod periods, held after that. */
export function glidePathValue(
  baseline: number,
  finalTarget: number,
  targetPeriod: number,
  currentPeriod: number,
): number {
  if (targetPeriod <= 0) return finalTarget;
  const t = clamp(currentPeriod / targetPeriod, 0, 1);
  return baseline + (finalTarget - baseline) * t;
}

/**
 * 0–100 KPI score: 70 × (achieved improvement / expected improvement), where
 * improvement is measured from baseline in the KPI's "good" direction.
 * On the glide path = 70, ahead > 70, behind < 70.
 */
export function kpiScore(
  direction: KpiDirection,
  baseline: number,
  glideValue: number,
  acceptedValue: number,
): number {
  const sign = direction === "lower_better" ? -1 : 1;
  const expected = sign * (glideValue - baseline);
  const achieved = sign * (acceptedValue - baseline);

  if (Math.abs(expected) < EPSILON) {
    // No improvement expected yet (e.g. period 0): flat is on track.
    if (Math.abs(achieved) < EPSILON) return ON_TRACK_SCORE;
    return achieved > 0 ? 100 : 0;
  }

  return clamp(Math.round(ON_TRACK_SCORE * (achieved / expected)), 0, 100);
}

export type WeightedKpiScore = { id: string; score: number; weight: number };

/**
 * Weighted average of KPI scores, rounded to an integer (the contract takes a
 * uint8). Weights are normalized, so they needn't sum to exactly 1; if they
 * sum to 0, falls back to a plain mean.
 */
export function transitionScore(kpis: WeightedKpiScore[]): number {
  if (kpis.length === 0) return 0;
  const totalWeight = kpis.reduce((sum, k) => sum + Math.max(0, k.weight), 0);
  const raw =
    totalWeight > EPSILON
      ? kpis.reduce((sum, k) => sum + k.score * Math.max(0, k.weight), 0) /
        totalWeight
      : kpis.reduce((sum, k) => sum + k.score, 0) / kpis.length;
  return clamp(Math.round(raw), 0, 100);
}
