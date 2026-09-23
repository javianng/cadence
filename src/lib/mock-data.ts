// Deterministic mock readings for the demo scenarios. Same inputs -> same
// numbers on every run, so reseeding reproduces the demo exactly.

import type { KpiDefinition, Scenario } from "~/lib/demo-loans";
import { glidePathValue } from "~/lib/scoring";

export type MockReading = { primaryValue: number; secondaryValue: number };

type KpiShape = Pick<
  KpiDefinition,
  "id" | "direction" | "baseline" | "finalTarget" | "targetPeriod"
>;

/** Period from which the drifting scenario falls behind its glide path. */
export const DRIFT_START_PERIOD = 12;
/** Period from which the mismatch scenario's secondary source diverges. */
export const MISMATCH_START_PERIOD = 10;

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * On-track ratio = achieved / expected improvement (1.0 = on the glide path,
 * which scores 70).
 */
function onTrackRatio(scenario: Scenario, period: number, r: number): number {
  switch (scenario) {
    case "improving":
      return 1.1 + 0.15 * r; // slightly ahead: scores ~77–87
    case "drifting": {
      if (period < DRIFT_START_PERIOD) return 0.97 + 0.08 * r;
      // Sharp drop at period 12 (~0.80), then a slide to ~0.48 by period 20.
      const slide = (period - DRIFT_START_PERIOD) * 0.04;
      return Math.max(0, 0.8 - slide + (r - 0.5) * 0.06);
    }
    case "mismatch":
      return 1.0 + 0.1 * r; // primary looks fine
  }
}

export function generateReading(
  kpi: KpiShape,
  period: number,
  scenario: Scenario,
): MockReading {
  const rand = mulberry32(fnv1a(`${kpi.id}|${period}|${scenario}`));
  const r1 = rand();
  const r2 = rand();

  const glide = glidePathValue(
    kpi.baseline,
    kpi.finalTarget,
    kpi.targetPeriod,
    period,
  );
  const expected = glide - kpi.baseline; // signed, in the KPI's own units
  const primaryValue = round3(
    kpi.baseline + expected * onTrackRatio(scenario, period, r1),
  );

  // Relative gap between the secondary source and primary.
  let gap: number;
  if (scenario === "mismatch" && period >= MISMATCH_START_PERIOD) {
    // Secondary says the borrower is doing 8–12% worse than reported.
    const worse = kpi.direction === "lower_better" ? 1 : -1;
    gap = worse * (0.08 + 0.04 * r2);
  } else {
    const tolerance = scenario === "drifting" ? 0.028 : 0.018;
    gap = (r2 * 2 - 1) * tolerance;
  }
  const secondaryValue = round3(primaryValue * (1 + gap));

  return { primaryValue, secondaryValue };
}
