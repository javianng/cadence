import { describe, expect, it } from "vitest";
import {
  acceptedValue,
  divergencePct,
  RULE_THRESHOLDS,
} from "~/lib/agent/rules";
import { DEMO_LOANS, SEED_PERIODS, type Scenario } from "~/lib/demo-loans";
import { glidePathValue, kpiScore } from "~/lib/scoring";
import { generateReading, MISMATCH_START_PERIOD } from "./mock-data";

const byScenario = (s: Scenario) => DEMO_LOANS.find((l) => l.scenario === s)!;
const periods = Array.from({ length: SEED_PERIODS }, (_, i) => i + 1);

function scoreFor(loanScenario: Scenario, period: number) {
  return byScenario(loanScenario).kpis.map((kpi) => {
    const { primaryValue, secondaryValue } = generateReading(
      kpi,
      period,
      loanScenario,
    );
    const glide = glidePathValue(
      kpi.baseline,
      kpi.finalTarget,
      kpi.targetPeriod,
      period,
    );
    const accepted = acceptedValue(
      kpi.direction,
      primaryValue,
      secondaryValue,
    )!;
    return {
      score: kpiScore(kpi.direction, kpi.baseline, glide, accepted),
      divergence: divergencePct(primaryValue, secondaryValue)!,
    };
  });
}

describe("generateReading", () => {
  it("is deterministic", () => {
    const kpi = DEMO_LOANS[0]!.kpis[0]!;
    expect(generateReading(kpi, 7, "improving")).toEqual(
      generateReading(kpi, 7, "improving"),
    );
    expect(generateReading(kpi, 7, "improving")).not.toEqual(
      generateReading(kpi, 8, "improving"),
    );
  });

  it("improving: every KPI ahead of the glide path, sources agree within 2%", () => {
    for (const p of periods) {
      for (const k of scoreFor("improving", p)) {
        expect(k.score).toBeGreaterThan(70);
        expect(k.divergence).toBeLessThanOrEqual(0.02);
      }
    }
  });

  it("drifting: on track early, breaching by period 20, sources within 3%", () => {
    for (const k of scoreFor("drifting", 5))
      expect(k.score).toBeGreaterThanOrEqual(65);
    for (const k of scoreFor("drifting", SEED_PERIODS))
      expect(k.score).toBeLessThan(40);
    for (const p of periods) {
      for (const k of scoreFor("drifting", p))
        expect(k.divergence).toBeLessThanOrEqual(0.03);
    }
  });

  it("mismatch: secondary diverges beyond the rule threshold only from period 10", () => {
    for (const p of periods) {
      for (const k of scoreFor("mismatch", p)) {
        if (p < MISMATCH_START_PERIOD) {
          expect(k.divergence).toBeLessThanOrEqual(RULE_THRESHOLDS.mismatchPct);
        } else {
          expect(k.divergence).toBeGreaterThan(RULE_THRESHOLDS.mismatchPct);
          expect(k.divergence).toBeLessThan(0.14);
        }
      }
    }
  });
});
