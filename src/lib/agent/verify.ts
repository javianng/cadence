import "server-only";

import { isJump, JUMP_THRESHOLD_PCT, primaryJumpPct } from "~/lib/agent/checks";
import type { AgentKpi, HistoryReading, RawReading } from "~/lib/agent/types";
import { callGemini } from "~/lib/gemini";

export type VerifyInput = {
  loanId: string;
  period: number;
  kpis: AgentKpi[];
  readings: RawReading[];
  /** Up to the last 4 periods per KPI, oldest first. */
  history: Record<string, HistoryReading[]>;
};

export type VerifyKpiResult = {
  kpiId: string;
  deterministicFlag: boolean;
  jumpPct: number | null;
  /** null if Gemini returned no verdict for this KPI. */
  plausible: boolean | null;
  reasoning: string;
  anomalous: boolean;
};

export type VerifyOutput = {
  anomalousKpiIds: string[];
  perKpi: VerifyKpiResult[];
};

const SYSTEM_INSTRUCTION = `You are a plausibility reviewer for sustainability KPI data reported weekly under a sustainability-linked loan.
For each KPI, judge whether the NEW primary reading is plausible given the KPI's definition, units, baseline, target and its recent history.
- Mark plausible=false only for readings that look like data errors: impossible values (e.g. a percentage outside 0-100, negative quantities), unit or decimal-place slips, implausible jumps for a weekly series, or suspiciously frozen/copy-pasted values.
- Gradual under- or over-performance against the target is NOT an anomaly; performance is scored separately.
- Disagreement with the secondary data source is checked separately; judge the primary series only.
- Do not compute scores or margins. Give one or two sentences of reasoning per KPI.`;

export async function verifyReadings(
  input: VerifyInput,
): Promise<VerifyOutput> {
  // 1. Deterministic pre-check: >30% jump vs the previous period's primary.
  const deterministic = input.readings.map((r) => {
    const previous = input.history[r.kpiId]?.at(-1);
    const jumpPct = primaryJumpPct(r.primaryValue, previous?.primaryValue);
    return { kpiId: r.kpiId, jumpPct, deterministicFlag: isJump(jumpPct) };
  });

  // 2. One Gemini call for the whole loan.
  const kpiIds = input.kpis.map((k) => k.kpiId);
  const prompt = JSON.stringify(
    {
      task: `Review period ${input.period} readings for loan ${input.loanId}.`,
      kpis: input.kpis.map((k) => ({
        kpiId: k.kpiId,
        name: k.name,
        unit: k.unit,
        direction: k.direction,
        baseline: k.baseline,
        finalTarget: k.finalTarget,
        targetPeriod: k.targetPeriod,
        recentPrimary: (input.history[k.kpiId] ?? []).map((h) => ({
          period: h.period,
          value: h.primaryValue,
        })),
        newPrimary: input.readings.find((r) => r.kpiId === k.kpiId)
          ?.primaryValue,
      })),
    },
    null,
    2,
  );
  const gemini = await callGemini<{
    kpis: { kpiId: string; plausible: boolean; reasoning: string }[];
  }>({
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    responseSchema: {
      type: "object",
      properties: {
        kpis: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kpiId: { type: "string", enum: kpiIds },
              plausible: { type: "boolean" },
              reasoning: { type: "string" },
            },
            required: ["kpiId", "plausible", "reasoning"],
          },
        },
      },
      required: ["kpis"],
    },
  });

  // 3. Anomalous if EITHER check fires.
  const perKpi = deterministic.map((d): VerifyKpiResult => {
    const verdict = gemini.kpis.find((g) => g.kpiId === d.kpiId);
    const plausible = verdict?.plausible ?? null;
    const notes = [
      d.deterministicFlag
        ? `Primary moved ${(d.jumpPct! * 100).toFixed(1)}% vs last period (>${JUMP_THRESHOLD_PCT * 100}% threshold).`
        : null,
      verdict?.reasoning ?? "Gemini returned no verdict for this KPI.",
    ];
    return {
      kpiId: d.kpiId,
      deterministicFlag: d.deterministicFlag,
      jumpPct: d.jumpPct,
      plausible,
      reasoning: notes.filter(Boolean).join(" "),
      anomalous: d.deterministicFlag || plausible === false,
    };
  });

  return {
    anomalousKpiIds: perKpi.filter((k) => k.anomalous).map((k) => k.kpiId),
    perKpi,
  };
}
