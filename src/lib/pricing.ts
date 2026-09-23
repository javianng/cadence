// TypeScript mirror of CadenceLoan.sol's pricing (submitScore steps 1–3 and
// previewMargin). Must stay integer-for-integer identical to the contract.

export type Band = { minScore: number; adjustmentBps: number };

export type MarginParams = {
  current: number;
  base: number;
  floor: number;
  cap: number;
  maxStep: number;
};

export type MarginPreview = {
  newMargin: number;
  step: number;
  isIncrease: boolean;
};

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Highest band with minScore <= score (bands are sorted descending). */
export function findBand(score: number, bands: readonly Band[]): Band {
  const band = bands.find((b) => b.minScore <= score);
  if (!band) {
    throw new Error(`No band covers score ${score}; the lowest band must be 0`);
  }
  return band;
}

/**
 * target = clamp(base + adjustment, floor, cap); step = clamp(target −
 * current, ±maxStep). Decreases (step <= 0) apply immediately on-chain;
 * increases become a pending adjustment for RM approval.
 */
export function previewMargin(
  { current, base, floor, cap, maxStep }: MarginParams,
  band: Band,
): MarginPreview {
  const target = clamp(base + band.adjustmentBps, floor, cap);
  const step = clamp(target - current, -maxStep, maxStep);
  return { newMargin: current + step, step, isIncrease: step > 0 };
}
