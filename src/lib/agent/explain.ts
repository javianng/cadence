import "server-only";

import type { DecideOutput } from "~/lib/agent/decide";
import type { ReconcileOutput } from "~/lib/agent/reconcile";
import type { AgentKpi } from "~/lib/agent/types";
import { callGemini } from "~/lib/gemini";

export type ExplainInput = {
  borrowerName: string;
  period: number;
  kpis: AgentKpi[];
  decide: DecideOutput;
  reconcile: ReconcileOutput;
  anomalousKpiIds: string[];
};

export type ExplainOutput = { borrowerSummary: string; rmBrief: string | null };

const BORROWER_INSTRUCTION = `You write a one-to-two sentence update for a company's finance team about this week's review of their sustainability-linked loan.
Plain language, factual and neutral. No rule codes, no internal jargon (no "transition score", "bps", "escalation", "glide path"), no scores out of 100.
Mention what drove the outcome (which KPI(s), in everyday words) and what it means for their interest rate: reduced, unchanged, or being reviewed by their relationship manager before any change.
Example: "Water usage came in above target this period, so this is being reviewed before any change to your rate."`;

const RM_INSTRUCTION = `You write a technical brief for a bank relationship manager reviewing an escalated sustainability-linked loan update.
Be precise and concise (3-5 sentences). Reference the triggered rule codes, the specific KPI scores and any source discrepancy percentages, the current vs proposed margin in bps, and whether pricing is held.
End with the agent's recommended action and its justification. Do not recompute or dispute any numbers.`;

const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;

export async function explain(input: ExplainInput): Promise<ExplainOutput> {
  const { decide } = input;
  const kpiFacts = decide.kpiScores.map((k) => {
    const kpi = input.kpis.find((x) => x.kpiId === k.id)!;
    const rec = input.reconcile.perKpi.find((r) => r.kpiId === k.id);
    return {
      kpi: kpi.name,
      unit: kpi.unit,
      direction: kpi.direction,
      acceptedValue: k.acceptedValue,
      glidePathTarget: k.glideValue,
      score: k.score,
      discrepancyPct:
        rec?.discrepancyPct != null
          ? `${(rec.discrepancyPct * 100).toFixed(1)}%`
          : null,
      discrepancyNote: input.reconcile.discrepancyNotes?.[k.id] ?? null,
      flaggedImplausible: input.anomalousKpiIds.includes(k.id),
    };
  });

  const borrower = await callGemini<{ borrowerSummary: string }>({
    systemInstruction: BORROWER_INSTRUCTION,
    prompt: JSON.stringify(
      {
        company: input.borrowerName,
        period: input.period,
        kpis: kpiFacts.map(({ discrepancyNote: _n, ...rest }) => rest),
        outcome:
          decide.decision === "auto_adjust"
            ? `interest margin reduced from ${pct(decide.currentMarginBps)} to ${pct(decide.proposedMarginBps)}`
            : decide.decision === "no_change"
              ? `interest margin unchanged at ${pct(decide.currentMarginBps)}`
              : `under review by the relationship manager; margin stays at ${pct(decide.currentMarginBps)} for now`,
        dataSourcesDisagree: decide.triggeredRules.includes("DATA_MISMATCH"),
      },
      null,
      2,
    ),
    responseSchema: {
      type: "object",
      properties: { borrowerSummary: { type: "string" } },
      required: ["borrowerSummary"],
    },
  });

  if (decide.decision !== "escalate") {
    return { borrowerSummary: borrower.borrowerSummary, rmBrief: null };
  }

  const rm = await callGemini<{ rmBrief: string }>({
    systemInstruction: RM_INSTRUCTION,
    prompt: JSON.stringify(
      {
        borrower: input.borrowerName,
        period: input.period,
        transitionScore: decide.transitionScore,
        triggeredRules: decide.triggeredRules,
        pricingHeld: decide.pricingHeld,
        currentMarginBps: decide.currentMarginBps,
        proposedMarginBps: decide.proposedMarginBps,
        stepUpPendingApproval: decide.isIncrease,
        kpis: kpiFacts,
        rationale: decide.rationale,
        recommendation: decide.recommendation ?? null,
      },
      null,
      2,
    ),
    responseSchema: {
      type: "object",
      properties: { rmBrief: { type: "string" } },
      required: ["rmBrief"],
    },
  });

  return { borrowerSummary: borrower.borrowerSummary, rmBrief: rm.rmBrief };
}
