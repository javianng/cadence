import "server-only";

import {
  acceptedValue,
  divergencePct,
  RULE_THRESHOLDS,
} from "~/lib/agent/rules";
import type { AgentKpi, RawReading } from "~/lib/agent/types";
import { callGemini } from "~/lib/gemini";

export type ReconcileInput = { kpis: AgentKpi[]; readings: RawReading[] };

export type ReconcileKpiResult = {
  kpiId: string;
  primaryValue: number | null;
  secondaryValue: number | null;
  acceptedValue: number | null;
  discrepancyPct: number | null;
  tolerancePct: number;
  exceedsTolerance: boolean;
};

export type ReconcileOutput = {
  acceptedValues: Record<string, number | null>;
  discrepancyNotes: Record<string, string> | null;
  perKpi: ReconcileKpiResult[];
};

const SYSTEM_INSTRUCTION = `You are a data reconciliation analyst for sustainability-linked loan reporting.
Two independent sources report each KPI. For each KPI given, write one or two plain sentences on what the discrepancy between the primary and secondary source might indicate (e.g. data quality issue, timing or reporting lag, methodology or boundary difference).
You are explaining, not deciding: the accepted value has already been chosen by policy (the value less favourable to the borrower). Do not propose a different value.`;

export async function reconcileReadings(
  input: ReconcileInput,
): Promise<ReconcileOutput> {
  // 1. Policy lives in rules.ts; just apply it per KPI.
  const perKpi = input.kpis.map((kpi): ReconcileKpiResult => {
    const r = input.readings.find((x) => x.kpiId === kpi.kpiId);
    const primary = r?.primaryValue ?? null;
    const secondary = r?.secondaryValue ?? null;
    const discrepancyPct = divergencePct(primary, secondary);
    const tolerancePct = kpi.tolerancePct ?? RULE_THRESHOLDS.mismatchPct;
    return {
      kpiId: kpi.kpiId,
      primaryValue: primary,
      secondaryValue: secondary,
      acceptedValue: acceptedValue(kpi.direction, primary, secondary),
      discrepancyPct,
      tolerancePct,
      exceedsTolerance:
        discrepancyPct !== null && discrepancyPct > tolerancePct,
    };
  });
  const acceptedValues = Object.fromEntries(
    perKpi.map((k) => [k.kpiId, k.acceptedValue]),
  );

  // 3. Common case: sources agree, no Gemini call.
  const discrepant = perKpi.filter((k) => k.exceedsTolerance);
  if (discrepant.length === 0) {
    return { acceptedValues, discrepancyNotes: null, perKpi };
  }

  // 2. One call for all discrepant KPIs.
  const prompt = JSON.stringify(
    discrepant.map((k) => {
      const kpi = input.kpis.find((x) => x.kpiId === k.kpiId)!;
      return {
        kpiId: k.kpiId,
        name: kpi.name,
        unit: kpi.unit,
        direction: kpi.direction,
        primarySource: kpi.primarySource,
        primaryValue: k.primaryValue,
        secondarySource: kpi.secondarySource,
        secondaryValue: k.secondaryValue,
        discrepancyPct: `${(k.discrepancyPct! * 100).toFixed(1)}%`,
        tolerance: `${(k.tolerancePct * 100).toFixed(1)}%`,
        acceptedValue: k.acceptedValue,
      };
    }),
    null,
    2,
  );
  const gemini = await callGemini<{ notes: { kpiId: string; note: string }[] }>(
    {
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt,
      responseSchema: {
        type: "object",
        properties: {
          notes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                kpiId: { type: "string", enum: discrepant.map((k) => k.kpiId) },
                note: { type: "string" },
              },
              required: ["kpiId", "note"],
            },
          },
        },
        required: ["notes"],
      },
    },
  );

  const discrepancyNotes = Object.fromEntries(
    discrepant.map((k) => [
      k.kpiId,
      gemini.notes.find((n) => n.kpiId === k.kpiId)?.note ??
        "No explanation returned.",
    ]),
  );
  return { acceptedValues, discrepancyNotes, perKpi };
}
