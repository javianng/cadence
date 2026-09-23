import { describe, expect, it } from "vitest";
import { glidePathValue, kpiScore, transitionScore } from "./scoring";

describe("glidePathValue", () => {
  it("interpolates linearly and holds at the target after targetPeriod", () => {
    expect(glidePathValue(42, 30, 52, 0)).toBe(42);
    expect(glidePathValue(42, 30, 52, 26)).toBe(36);
    expect(glidePathValue(42, 30, 52, 52)).toBe(30);
    expect(glidePathValue(42, 30, 52, 80)).toBe(30);
    expect(glidePathValue(18, 40, 52, 13)).toBe(23.5);
  });
});

describe("kpiScore", () => {
  it("scores 70 when exactly on the glide path (both directions)", () => {
    expect(kpiScore("lower_better", 42, 36, 36)).toBe(70);
    expect(kpiScore("higher_better", 18, 23.5, 23.5)).toBe(70);
  });

  it("scores above 70 when ahead", () => {
    // expected 6 lower, achieved 8 lower -> 70 * 8/6 = 93.3
    expect(kpiScore("lower_better", 42, 36, 34)).toBe(93);
    expect(kpiScore("higher_better", 18, 23.5, 25)).toBeGreaterThan(70);
  });

  it("scores below 70 when behind", () => {
    // expected 6 lower, achieved 3 lower -> 35
    expect(kpiScore("lower_better", 42, 36, 39)).toBe(35);
    expect(kpiScore("higher_better", 18, 23.5, 20)).toBeLessThan(70);
  });

  it("clamps to 0..100", () => {
    expect(kpiScore("lower_better", 42, 36, 45)).toBe(0); // got worse
    expect(kpiScore("higher_better", 18, 23.5, 40)).toBe(100);
  });

  it("handles expected == 0 without dividing by zero", () => {
    expect(kpiScore("lower_better", 42, 42, 42)).toBe(70);
    expect(kpiScore("lower_better", 42, 42, 41)).toBe(100);
    expect(kpiScore("lower_better", 42, 42, 43)).toBe(0);
    expect(kpiScore("higher_better", 18, 18, 19)).toBe(100);
    expect(kpiScore("higher_better", 18, 18, 17)).toBe(0);
  });
});

describe("transitionScore", () => {
  it("is the weighted average across 3 KPIs", () => {
    // 80*0.5 + 60*0.3 + 90*0.2 = 40 + 18 + 18 = 76
    expect(
      transitionScore([
        { id: "a", score: 80, weight: 0.5 },
        { id: "b", score: 60, weight: 0.3 },
        { id: "c", score: 90, weight: 0.2 },
      ]),
    ).toBe(76);
  });

  it("normalizes weights that don't sum to 1", () => {
    // weights 5/3/2 -> same as 0.5/0.3/0.2
    expect(
      transitionScore([
        { id: "a", score: 80, weight: 5 },
        { id: "b", score: 60, weight: 3 },
        { id: "c", score: 90, weight: 2 },
      ]),
    ).toBe(76);
  });

  it("rounds to an integer and falls back to a mean for zero weights", () => {
    // (70*0.4 + 75*0.4 + 71*0.2) = 28 + 30 + 14.2 = 72.2
    expect(
      transitionScore([
        { id: "a", score: 70, weight: 0.4 },
        { id: "b", score: 75, weight: 0.4 },
        { id: "c", score: 71, weight: 0.2 },
      ]),
    ).toBe(72);
    expect(
      transitionScore([
        { id: "a", score: 60, weight: 0 },
        { id: "b", score: 81, weight: 0 },
      ]),
    ).toBe(71);
    expect(transitionScore([])).toBe(0);
  });
});
