import { describe, expect, it } from "vitest";
import {
  acceptedValue,
  divergencePct,
  evaluateRules,
  holdsPricing,
  type RuleInput,
} from "./rules";

function clean(): RuleInput {
  return {
    kpis: [
      { kpiId: "a", primaryValue: 100, secondaryValue: 101, score: 72 },
      { kpiId: "b", primaryValue: 50, secondaryValue: 50, score: 68 },
    ],
    transitionScore: 70,
    previousTransitionScore: 72,
    pricing: { isIncrease: false },
  };
}

describe("evaluateRules", () => {
  it("fires nothing on clean data", () => {
    expect(evaluateRules(clean(), [])).toEqual([]);
  });

  it("DATA_MISMATCH above 5% divergence, not at exactly 5%", () => {
    const input = clean();
    input.kpis[0]!.primaryValue = 105; // exactly 5% vs 100
    input.kpis[0]!.secondaryValue = 100;
    expect(evaluateRules(input, [])).toEqual([]);
    input.kpis[0]!.primaryValue = 106;
    expect(evaluateRules(input, [])).toEqual(["DATA_MISMATCH"]);
  });

  it("KPI_BREACH below 40, not at exactly 40", () => {
    const input = clean();
    input.kpis[1]!.score = 40;
    expect(evaluateRules(input, [])).toEqual([]);
    input.kpis[1]!.score = 39;
    expect(evaluateRules(input, [])).toEqual(["KPI_BREACH"]);
  });

  it("SHARP_DECLINE on a drop of 10+ points, not 9, not with no history", () => {
    const input = clean();
    input.previousTransitionScore = 79;
    expect(evaluateRules(input, [])).toEqual([]);
    input.previousTransitionScore = 80;
    expect(evaluateRules(input, [])).toEqual(["SHARP_DECLINE"]);
    input.previousTransitionScore = null;
    expect(evaluateRules(input, [])).toEqual([]);
  });

  it("DATA_GAP when either source is missing", () => {
    const input = clean();
    input.kpis[0]!.secondaryValue = null;
    expect(evaluateRules(input, [])).toEqual(["DATA_GAP"]);
    const input2 = clean();
    input2.kpis[1]!.primaryValue = null;
    expect(evaluateRules(input2, [])).toEqual(["DATA_GAP"]);
  });

  it("STEP_UP when pricing is an increase", () => {
    const input = clean();
    input.pricing.isIncrease = true;
    expect(evaluateRules(input, [])).toEqual(["STEP_UP"]);
  });

  it("ANOMALY when verify flags any KPI", () => {
    expect(evaluateRules(clean(), [])).toEqual([]);
    expect(evaluateRules(clean(), ["a"])).toEqual(["ANOMALY"]);
  });

  it("fires several rules together", () => {
    const input: RuleInput = {
      kpis: [
        { kpiId: "a", primaryValue: 100, secondaryValue: 120, score: 30 },
        { kpiId: "b", primaryValue: null, secondaryValue: 50, score: 55 },
      ],
      transitionScore: 45,
      previousTransitionScore: 62,
      pricing: { isIncrease: true },
    };
    expect(evaluateRules(input, ["b"])).toEqual([
      "DATA_MISMATCH",
      "KPI_BREACH",
      "SHARP_DECLINE",
      "DATA_GAP",
      "STEP_UP",
      "ANOMALY",
    ]);
  });
});

describe("reconciliation helpers", () => {
  it("divergencePct handles nulls and zero", () => {
    expect(divergencePct(null, 1)).toBeNull();
    expect(divergencePct(110, 100)).toBeCloseTo(0.1);
    expect(divergencePct(0, 0)).toBe(0);
  });

  it("acceptedValue keeps primary within tolerance, else the conservative value", () => {
    expect(acceptedValue("lower_better", 30, 31)).toBe(30);
    expect(acceptedValue("lower_better", 30, 33)).toBe(33); // worse = higher
    expect(acceptedValue("higher_better", 40, 36)).toBe(36); // worse = lower
    expect(acceptedValue("higher_better", null, 36)).toBe(36);
    expect(acceptedValue("higher_better", null, null)).toBeNull();
  });
});

describe("holdsPricing", () => {
  it("holds on data-integrity codes only", () => {
    expect(holdsPricing(["DATA_MISMATCH"])).toBe(true);
    expect(holdsPricing(["DATA_GAP", "STEP_UP"])).toBe(true);
    expect(holdsPricing(["ANOMALY"])).toBe(true);
    expect(holdsPricing(["KPI_BREACH", "SHARP_DECLINE", "STEP_UP"])).toBe(
      false,
    );
    expect(holdsPricing([])).toBe(false);
  });
});
