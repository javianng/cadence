import "server-only";

import { decisionFor } from "~/lib/agent/checks";
import type { ReconcileOutput } from "~/lib/agent/reconcile";
import {
  evaluateRules,
  holdsPricing,
  type EscalationCode,
} from "~/lib/agent/rules";
import {
  RECOMMENDED_ACTIONS,
  type AgentKpi,
  type Decision,
  type LoanTerms,
  type RawReading,
  type Recommendation,
} from "~/lib/agent/types";
import { callGemini } from "~/lib/gemini";
import { findBand, previewMargin } from "~/lib/pricing";
import { glidePathValue, kpiScore, transitionScore } from "~/lib/scoring";

export type DecideInput = {
  period: number;
  kpis: AgentKpi[];
  readings: RawReading[];
  reconcile: ReconcileOutput;
  anomalousKpiIds: string[];
  previousTransitionScore: number | null;
  terms: LoanTerms;
  /** The contract's current margin (Firestore mirrors it). */
  currentMarginBps: number;
};

export type DecideKpiScore = {
  id: string;
  score: number;
  weight: number;
  glideValue: number;
  acceptedValue: number | null;
};

export type DecideOutput = {
  transitionScore: number;
  kpiScores: DecideKpiScore[];
  triggeredRules: EscalationCode[];
  /** Data-integrity escalation: the margin is frozen this period. */
  pricingHeld: boolean;
  decision: Decision;
  currentMarginBps: number;
  proposedMarginBps: number;
  isIncrease: boolean;
  rationale: string;
  recommendation?: Recommendation;
};

const SYSTEM_INSTRUCTION = `You write the decision rationale for an AI agent that reprices a sustainability-linked loan every week.
All numbers (KPI scores, transition score, margins) and the decision itself were computed by deterministic code and are final. Never recompute, dispute or change them.
Write a short, factual rationale (2-3 sentences) explaining why the decision follows from the scores and triggered rules.
Scoring: 70 = exactly on the KPI's glide path, higher is ahead, lower is behind. Margins are in basis points (bps).
If a recommendation is requested, choose the single best next action for the relationship manager:
- approve_step_up: the margin increase is justified by genuine underperformance;
- hold: keep the current margin while the situation develops;
- request_info: ask the borrower for evidence or corrected data;
- accept_data: the flagged data looks acceptable and can be taken as reported.`;

export async function decide(input: DecideInput): Promise<DecideOutput> {
  // 1. Scores (scoring.ts) from the reconciled values.
  const kpiScores = input.kpis.map((kpi): DecideKpiScore => {
    const glideValue = glidePathValue(
      kpi.baseline,
      kpi.finalTarget,
      kpi.targetPeriod,
      input.period,
    );
    const accepted = input.reconcile.acceptedValues[kpi.kpiId] ?? null;
    return {
      id: kpi.kpiId,
      // No data from either source scores 0; DATA_GAP escalates it.
      score:
        accepted === null
          ? 0
          : kpiScore(kpi.direction, kpi.baseline, glideValue, accepted),
      weight: kpi.weight,
      glideValue: Math.round(glideValue * 1000) / 1000,
      acceptedValue: accepted,
    };
  });
  const score = transitionScore(kpiScores);

  // 3. Proposed margin (pricing.ts mirrors the contract).
  const { currentMarginBps, terms } = input;
  const preview = previewMargin(
    {
      current: currentMarginBps,
      base: terms.baseMarginBps,
      floor: terms.floorBps,
      cap: terms.capBps,
      maxStep: terms.maxStepBps,
    },
    findBand(score, terms.bands),
  );

  // 2. Rules (rules.ts), including verify's anomalies.
  let triggeredRules = evaluateRules(
    {
      kpis: input.readings.map((r) => ({
        kpiId: r.kpiId,
        primaryValue: r.primaryValue,
        secondaryValue: r.secondaryValue,
        score: kpiScores.find((k) => k.id === r.kpiId)?.score ?? 0,
      })),
      transitionScore: score,
      previousTransitionScore: input.previousTransitionScore,
      pricing: { isIncrease: preview.isIncrease },
    },
    input.anomalousKpiIds,
  );
  // Data-integrity escalations freeze pricing (see CLAUDE.md), so no step-up.
  const pricingHeld = holdsPricing(triggeredRules);
  if (pricingHeld)
    triggeredRules = triggeredRules.filter((c) => c !== "STEP_UP");
  const proposedMarginBps = pricingHeld ? currentMarginBps : preview.newMargin;
  const isIncrease = !pricingHeld && preview.isIncrease;

  // 4. Fixed in code; Gemini never changes it.
  const decision = decisionFor(
    triggeredRules,
    currentMarginBps,
    proposedMarginBps,
  );

  // 5. Rationale (+ recommendation when escalating).
  const escalating = decision === "escalate";
  const prompt = JSON.stringify(
    {
      period: input.period,
      transitionScore: score,
      previousTransitionScore: input.previousTransitionScore,
      kpiScores: kpiScores.map((k) => ({
        kpi: input.kpis.find((x) => x.kpiId === k.id)?.name,
        score: k.score,
        weight: k.weight,
      })),
      triggeredRules,
      pricingHeld,
      anomalousKpiIds: input.anomalousKpiIds,
      discrepancyNotes: input.reconcile.discrepancyNotes,
      currentMarginBps,
      proposedMarginBps,
      marginChangeNeedsRmApproval: isIncrease,
      decision,
      recommendationRequested: escalating,
    },
    null,
    2,
  );
  const gemini = await callGemini<{
    rationale: string;
    recommendation?: Recommendation;
  }>({
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    responseSchema: {
      type: "object",
      properties: {
        rationale: { type: "string" },
        ...(escalating && {
          recommendation: {
            type: "object",
            properties: {
              action: { type: "string", enum: [...RECOMMENDED_ACTIONS] },
              justification: { type: "string" },
            },
            required: ["action", "justification"],
          },
        }),
      },
      required: escalating ? ["rationale", "recommendation"] : ["rationale"],
    },
  });

  return {
    transitionScore: score,
    kpiScores,
    triggeredRules,
    pricingHeld,
    decision,
    currentMarginBps,
    proposedMarginBps,
    isIncrease,
    rationale: gemini.rationale,
    ...(escalating && gemini.recommendation
      ? { recommendation: gemini.recommendation }
      : {}),
  };
}
