import { describe, expect, it } from "vitest";
import {
  findBand,
  previewMargin,
  type Band,
  type MarginParams,
} from "./pricing";

// Same fixture as contracts/test/CadenceLoan.ts.
const BANDS: Band[] = [
  { minScore: 80, adjustmentBps: -50 },
  { minScore: 60, adjustmentBps: -25 },
  { minScore: 40, adjustmentBps: 0 },
  { minScore: 0, adjustmentBps: 50 },
];
const LOAN = { base: 250, floor: 175, cap: 325, maxStep: 25 };

function run(
  params: Omit<MarginParams, "current">,
  bands: Band[],
  start: number,
  scores: number[],
) {
  let current = start;
  return scores.map((score) => {
    const preview = previewMargin(
      { ...params, current },
      findBand(score, bands),
    );
    current = preview.newMargin; // increases assumed approved, as in the contract tests
    return preview;
  });
}

describe("findBand", () => {
  it("picks the highest band whose minScore <= score", () => {
    expect(findBand(100, BANDS).minScore).toBe(80);
    expect(findBand(80, BANDS).minScore).toBe(80);
    expect(findBand(79, BANDS).minScore).toBe(60);
    expect(findBand(40, BANDS).minScore).toBe(40);
    expect(findBand(0, BANDS).minScore).toBe(0);
  });

  it("throws if no band covers the score", () => {
    expect(() => findBand(10, [{ minScore: 50, adjustmentBps: 0 }])).toThrow();
  });
});

describe("previewMargin (mirrors CadenceLoan.sol)", () => {
  it("score 65 from 250: band 60 (-25) -> 225, a decrease", () => {
    expect(
      previewMargin({ ...LOAN, current: 250 }, findBand(65, BANDS)),
    ).toEqual({
      newMargin: 225,
      step: -25,
      isIncrease: false,
    });
  });

  it("score 20 from 250: band 0 (+50) -> target 300, capped step +25 -> 275", () => {
    expect(
      previewMargin({ ...LOAN, current: 250 }, findBand(20, BANDS)),
    ).toEqual({
      newMargin: 275,
      step: 25,
      isIncrease: true,
    });
  });

  it("caps the step: score 90 three times -> 225, 200, 200", () => {
    const out = run(LOAN, BANDS, 250, [90, 90, 90]);
    expect(out.map((p) => p.newMargin)).toEqual([225, 200, 200]);
    expect(out[2]).toEqual({ newMargin: 200, step: 0, isIncrease: false });
  });

  it("holds floor and cap with wide bands (contract floor/cap test)", () => {
    const wide: Band[] = [
      { minScore: 50, adjustmentBps: -500 },
      { minScore: 0, adjustmentBps: 500 },
    ];
    const out = run({ ...LOAN, maxStep: 100 }, wide, 250, [99, 99, 0, 0, 0]);
    expect(out.map((p) => p.newMargin)).toEqual([175, 175, 275, 325, 325]);
    expect(out[4]!.isIncrease).toBe(false); // at the cap: zero step, nothing pending
  });

  it("matches the contract's previewMargin sequence test by hand", () => {
    // 90:225 90:200 50:225(+) 10:250(+) 10:275(+) 70:250 100:225 0:250(+)
    const out = run(LOAN, BANDS, 250, [90, 90, 50, 10, 10, 70, 100, 0]);
    expect(out.map((p) => p.newMargin)).toEqual([
      225, 200, 225, 250, 275, 250, 225, 250,
    ]);
    expect(out.map((p) => p.isIncrease)).toEqual([
      false,
      false,
      true,
      true,
      true,
      false,
      false,
      true,
    ]);
  });
});
