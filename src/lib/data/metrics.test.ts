import { describe, expect, it } from "vitest";
import {
  annualRunRate,
  autoHandledRate,
  earlyDetectionLeadWeeks,
  exceptionSeverity,
  nextAssessmentDate,
  portfolioScore,
  rmAgentAgreement,
  savingsToDate,
  scoreMovers,
  severityLabel,
} from "./metrics";

const h = (period: number, after: number, esc: string[] = []) => ({
  period,
  marginAfterBps: after,
  staticMarginBps: 250,
  escalations: esc,
});

describe("savings", () => {
  it("sums (static − cadence) × facility × 7/365 per period", () => {
    // 50bps on 100m for one week = 100m × 0.005 × 7/365 = 9,589.04
    expect(savingsToDate([h(1, 200)], 100_000_000, 7)).toBeCloseTo(9589.04, 1);
    expect(savingsToDate([h(1, 275)], 100_000_000, 7)).toBeLessThan(0);
  });

  it("annual run rate at today's margin", () => {
    expect(annualRunRate(250, 200, 150_000_000)).toBe(750_000);
  });
});

describe("portfolio metrics", () => {
  it("auto-handled rate is the share of periods with no escalation", () => {
    expect(autoHandledRate([h(1, 250), h(2, 250, ["KPI_BREACH"])])).toBe(0.5);
    expect(autoHandledRate([])).toBe(0);
  });

  it("portfolio score is facility-weighted", () => {
    expect(
      portfolioScore([
        { currentScore: 80, facilityAmount: 100 },
        { currentScore: 40, facilityAmount: 300 },
      ]),
    ).toBe(50);
  });

  it("lead time = 52 − first escalated period, averaged; null if none", () => {
    expect(
      earlyDetectionLeadWeeks([
        [h(1, 250), h(12, 250, ["SHARP_DECLINE"])],
        [h(10, 250, ["DATA_MISMATCH"])],
        [h(1, 250)],
      ]),
    ).toBe(41); // (40 + 42) / 2
    expect(earlyDetectionLeadWeeks([[h(1, 250)]])).toBeNull();
  });

  it("agreement counts only decided exceptions", () => {
    expect(
      rmAgentAgreement([
        { agreedWithAgent: true },
        { agreedWithAgent: false },
        { agreedWithAgent: true },
        {},
      ]),
    ).toEqual({ agreed: 2, overridden: 1, rate: 2 / 3 });
    expect(rmAgentAgreement([]).rate).toBeNull();
  });
});

describe("exception severity", () => {
  it("weights rules and pending step-ups", () => {
    expect(exceptionSeverity(["KPI_BREACH", "STEP_UP"], 25)).toBe(8);
    expect(exceptionSeverity(["DATA_MISMATCH"])).toBe(2);
    expect(severityLabel(8)).toBe("High");
    expect(severityLabel(3)).toBe("Medium");
    expect(severityLabel(1)).toBe("Low");
  });
});

describe("scoreMovers", () => {
  it("ranks KPIs by weighted contribution change", () => {
    const prev = [
      { id: "a", score: 70, weight: 0.5 },
      { id: "b", score: 70, weight: 0.3 },
      { id: "c", score: 70, weight: 0.2 },
    ];
    const curr = [
      { id: "a", score: 66, weight: 0.5 }, // -2.0
      { id: "b", score: 80, weight: 0.3 }, // +3.0
      { id: "c", score: 70, weight: 0.2 }, // 0
    ];
    const movers = scoreMovers(prev, curr);
    expect(movers.map((m) => m.kpiId)).toEqual(["b", "a", "c"]);
    expect(movers[0]!.contributionDelta).toBeCloseTo(3);
    expect(movers[1]!.scoreDelta).toBe(-4);
  });
});

describe("nextAssessmentDate", () => {
  it("is start + (period + 1) weeks", () => {
    const start = new Date("2026-05-04T00:00:00Z");
    expect(nextAssessmentDate(start, 21, 7).toISOString()).toBe(
      "2026-10-05T00:00:00.000Z",
    );
  });
});
