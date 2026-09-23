import "server-only";

import { encodeBytes32String, id as keccakId } from "ethers";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { decide, type DecideOutput } from "~/lib/agent/decide";
import { explain, type ExplainOutput } from "~/lib/agent/explain";
import { reconcileReadings, type ReconcileOutput } from "~/lib/agent/reconcile";
import type {
  AgentKpi,
  HistoryReading,
  LoanTerms,
  RawReading,
} from "~/lib/agent/types";
import { verifyReadings, type VerifyOutput } from "~/lib/agent/verify";
import type { Scenario } from "~/lib/demo-loans";
import { adminDb } from "~/lib/firebase/admin";
import { GEMINI_MODEL } from "~/lib/gemini";
import { generateReading } from "~/lib/mock-data";
import { assertGasBudget, FEE_OVERRIDES } from "~/lib/web3/client";
import { cadenceContract as contract } from "~/lib/web3/contract";
import { computeDataHash, periodHashPayload } from "~/lib/web3/hash";

export type AgentStepName =
  "load" | "verify" | "reconcile" | "decide" | "explain" | "anchor" | "persist";

/** Carries enough context for the API route to return a readable error. */
export class AgentRunError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly step: AgentStepName,
    readonly runId: string | null,
  ) {
    super(message);
    this.name = "AgentRunError";
  }
}

const HISTORY_PERIODS = 4;
/** A "running" run older than this is treated as crashed, not in progress. */
const STALE_RUN_MS = 10 * 60 * 1000;

type LoanDoc = LoanTerms & {
  borrowerName: string;
  scenario: Scenario;
  tokenId: number;
  currentPeriod: number;
  currentScore: number;
  currentMarginBps: number;
  rmUid: string;
};

const pad = (p: number) => String(p).padStart(2, "0");
const readingDocId = (loanId: string, kpiId: string, p: number) =>
  `${loanId}__${kpiId}__p${pad(p)}`;
const periodDocId = (loanId: string, p: number) => `${loanId}__p${pad(p)}`;

/**
 * Runs verify → reconcile → decide → explain for the loan's next period,
 * anchors the result on-chain, then mirrors it into Firestore. The loan doc
 * only advances if everything succeeds, so a failed run can be retried.
 */
export async function runAgentForLoan(loanId: string) {
  // --- Load --------------------------------------------------------------
  const loanRef = adminDb.doc(`loans/${loanId}`);
  const loanSnap = await loanRef.get();
  if (!loanSnap.exists) {
    throw new AgentRunError(`Loan "${loanId}" not found`, 404, "load", null);
  }
  const loan = loanSnap.data() as LoanDoc;
  if (typeof loan.tokenId !== "number") {
    throw new AgentRunError(
      `Loan "${loanId}" has no tokenId — run the seed first`,
      409,
      "load",
      null,
    );
  }
  const period = loan.currentPeriod + 1;

  const running = await adminDb
    .collection("agentRuns")
    .where("loanId", "==", loanId)
    .where("status", "==", "running")
    .get();
  const active = running.docs.find(
    (d) =>
      Date.now() - (d.get("startedAt") as Timestamp).toMillis() < STALE_RUN_MS,
  );
  if (active) {
    throw new AgentRunError(
      `Agent run ${active.id} for "${loanId}" is already in progress`,
      409,
      "load",
      active.id,
    );
  }

  const runRef = adminDb.collection("agentRuns").doc();
  const runId = runRef.id;
  await runRef.set({
    loanId,
    borrowerName: loan.borrowerName,
    tokenId: loan.tokenId,
    period,
    scenario: loan.scenario,
    model: GEMINI_MODEL,
    status: "running",
    steps: [],
    startedAt: FieldValue.serverTimestamp(),
  });

  let currentStep: AgentStepName = "load";
  async function step<T>(
    name: AgentStepName,
    input: unknown,
    fn: () => Promise<T>,
    reasoning: (out: T) => string | null,
  ): Promise<T> {
    currentStep = name;
    const started = Date.now();
    const output = await fn();
    await runRef.update({
      steps: FieldValue.arrayUnion({
        name,
        input,
        output,
        reasoning: reasoning(output),
        durationMs: Date.now() - started,
        completedAt: Timestamp.now(),
      }),
    });
    return output;
  }

  try {
    const kpis = (
      await adminDb.collection("kpis").where("loanId", "==", loanId).get()
    ).docs
      .map((d) => d.data() as AgentKpi)
      .sort((a, b) => a.kpiId.localeCompare(b.kpiId));
    if (kpis.length === 0) throw new Error(`No KPIs found for "${loanId}"`);

    // Last 4 periods per KPI, fetched by deterministic ID (no index needed).
    const historyPeriods = Array.from(
      { length: HISTORY_PERIODS },
      (_, i) => period - HISTORY_PERIODS + i,
    ).filter((p) => p >= 1);
    const history: Record<string, HistoryReading[]> = {};
    for (const kpi of kpis) {
      const refs = historyPeriods.map((p) =>
        adminDb.doc(`readings/${readingDocId(loanId, kpi.kpiId, p)}`),
      );
      const snaps = refs.length ? await adminDb.getAll(...refs) : [];
      history[kpi.kpiId] = snaps
        .filter((s) => s.exists)
        .map((s) => {
          const d = s.data()!;
          return {
            kpiId: kpi.kpiId,
            period: d.period as number,
            primaryValue: d.primaryValue as number | null,
            secondaryValue: d.secondaryValue as number | null,
            acceptedValue: d.acceptedValue as number | null,
            score: d.score as number,
          };
        });
    }
    const previousHistory = await adminDb
      .doc(`scoreHistory/${periodDocId(loanId, period - 1)}`)
      .get();
    const previousTransitionScore = previousHistory.exists
      ? (previousHistory.get("transitionScore") as number)
      : null;

    // This period's raw data, per the loan's scenario.
    const readings: RawReading[] = kpis.map((kpi) => ({
      kpiId: kpi.kpiId,
      ...generateReading({ ...kpi, id: kpi.kpiId }, period, loan.scenario),
    }));

    // The contract's current margin is the source of truth.
    const token = BigInt(loan.tokenId);
    const chainBefore = await contract.getLoan(token);
    const currentMarginBps = Number(chainBefore.currentMarginBps);

    // --- Agent steps ------------------------------------------------------
    const verifyInput = { loanId, period, kpis, readings, history };
    const verified = await step<VerifyOutput>(
      "verify",
      verifyInput,
      () => verifyReadings(verifyInput),
      (o) => o.perKpi.map((k) => `${k.kpiId}: ${k.reasoning}`).join("\n"),
    );

    const reconciled = await step<ReconcileOutput>(
      "reconcile",
      { kpis, readings },
      () => reconcileReadings({ kpis, readings }),
      (o) =>
        o.discrepancyNotes
          ? Object.entries(o.discrepancyNotes)
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n")
          : null,
    );

    const terms: LoanTerms = {
      baseMarginBps: loan.baseMarginBps,
      floorBps: loan.floorBps,
      capBps: loan.capBps,
      maxStepBps: loan.maxStepBps,
      bands: loan.bands,
    };
    const decideInput = {
      period,
      kpis,
      readings,
      reconcile: reconciled,
      anomalousKpiIds: verified.anomalousKpiIds,
      previousTransitionScore,
      terms,
      currentMarginBps,
    };
    const decided = await step<DecideOutput>(
      "decide",
      { ...decideInput, kpis: undefined, reconcile: undefined },
      () => decide(decideInput),
      (o) =>
        [
          o.rationale,
          o.recommendation &&
            `Recommendation: ${o.recommendation.action} — ${o.recommendation.justification}`,
        ]
          .filter(Boolean)
          .join("\n"),
    );

    const explainInput = {
      borrowerName: loan.borrowerName,
      period,
      kpis,
      decide: decided,
      reconcile: reconciled,
      anomalousKpiIds: verified.anomalousKpiIds,
    };
    const explained = await step<ExplainOutput>(
      "explain",
      { borrowerName: loan.borrowerName, period, decision: decided.decision },
      () => explain(explainInput),
      (o) => [o.borrowerSummary, o.rmBrief].filter(Boolean).join("\n\n"),
    );

    // --- Anchor on-chain ----------------------------------------------------
    currentStep = "anchor";
    const priorAnchored = await adminDb
      .collection("agentRuns")
      .where("loanId", "==", loanId)
      .where("period", "==", period)
      .where("status", "==", "failed")
      .get();
    const halfDone = priorAnchored.docs.find((d) =>
      d.get("chain.submitTxHash"),
    );
    if (halfDone) {
      throw new Error(
        `Run ${halfDone.id} already submitted period ${period} on-chain before failing; ` +
          `refusing to submit twice. Repair Firestore from that run's chain tx before retrying.`,
      );
    }

    const acceptedReadings = readings.map((r) => ({
      ...r,
      acceptedValue: reconciled.acceptedValues[r.kpiId] ?? null,
    }));
    const kpiScores = decided.kpiScores.map((k) => ({
      id: k.id,
      score: k.score,
      weight: k.weight,
    }));
    const dataHash = computeDataHash(
      periodHashPayload({
        loanId,
        tokenId: loan.tokenId,
        period,
        transitionScore: decided.transitionScore,
        readings: acceptedReadings,
        kpiScores,
        decision: decided.decision,
      }),
    );
    const runRefHash = keccakId(`cadence:agentRun:${runId}`);
    const escalated = decided.decision === "escalate";
    const firstRule = decided.triggeredRules[0];

    let primaryTx: { hash: string; blockNumber: number } | null = null;
    let flagTxHash: string | null = null;

    // Data-integrity escalations hold pricing: no submitScore, flag only.
    if (!decided.pricingHeld) {
      const chainPreview = Number(
        await contract.previewMargin(token, decided.transitionScore),
      );
      if (chainPreview !== decided.proposedMarginBps) {
        throw new Error(
          `pricing.ts proposed ${decided.proposedMarginBps}bps but contract.previewMargin says ${chainPreview}bps`,
        );
      }
      const args = [
        token,
        decided.transitionScore,
        dataHash,
        runRefHash,
      ] as const;
      await assertGasBudget(
        "submitScore",
        await contract.submitScore.estimateGas(...args),
      );
      const tx = await contract.submitScore(...args, FEE_OVERRIDES);
      const receipt = await tx.wait(1);
      if (receipt?.status !== 1)
        throw new Error(`submitScore reverted: ${tx.hash}`);
      primaryTx = { hash: receipt.hash, blockNumber: receipt.blockNumber };
      await runRef.update({ "chain.submitTxHash": receipt.hash });
    }
    if (escalated && firstRule) {
      const args = [token, encodeBytes32String(firstRule), dataHash] as const;
      await assertGasBudget(
        "flagException",
        await contract.flagException.estimateGas(...args),
      );
      const tx = await contract.flagException(...args, FEE_OVERRIDES);
      const receipt = await tx.wait(1);
      if (receipt?.status !== 1) {
        throw new Error(`flagException reverted: ${tx.hash}`);
      }
      flagTxHash = receipt.hash;
      primaryTx ??= { hash: receipt.hash, blockNumber: receipt.blockNumber };
      await runRef.update({ "chain.flagTxHash": receipt.hash });
    }
    if (!primaryTx) {
      throw new Error(
        "Nothing was anchored on-chain (held pricing with no rule to flag)",
      );
    }

    const chainAfter = await contract.getLoan(token);
    const appliedMarginBps = Number(chainAfter.currentMarginBps);
    const pendingAdjustmentBps = Number(chainAfter.pendingAdjustmentBps);

    // --- Persist (one atomic batch) ------------------------------------------
    currentStep = "persist";
    const periodEnd = Timestamp.fromMillis(
      (loan as unknown as { startDate: Timestamp }).startDate.toMillis() +
        period * 7 * 24 * 3600 * 1000,
    );
    const batch = adminDb.batch();

    for (const r of reconciled.perKpi) {
      const score = decided.kpiScores.find((k) => k.id === r.kpiId)!;
      batch.set(
        adminDb.doc(`readings/${readingDocId(loanId, r.kpiId, period)}`),
        {
          loanId,
          kpiId: r.kpiId,
          period,
          periodEnd,
          primaryValue: r.primaryValue,
          secondaryValue: r.secondaryValue,
          acceptedValue: r.acceptedValue,
          divergencePct:
            r.discrepancyPct === null
              ? null
              : Math.round(r.discrepancyPct * 10_000) / 10_000,
          glideValue: score.glideValue,
          score: score.score,
          anomalous: verified.anomalousKpiIds.includes(r.kpiId),
          agentRunId: runId,
        },
      );
    }

    batch.set(adminDb.doc(`scoreHistory/${periodDocId(loanId, period)}`), {
      loanId,
      tokenId: loan.tokenId,
      period,
      periodEnd,
      transitionScore: decided.transitionScore,
      kpiScores,
      marginBeforeBps: currentMarginBps,
      marginAfterBps: appliedMarginBps,
      proposedMarginBps: decided.proposedMarginBps,
      staticMarginBps: loan.baseMarginBps,
      isIncrease: decided.isIncrease,
      pricingHeld: decided.pricingHeld,
      pendingAdjustmentBps,
      escalations: decided.triggeredRules,
      decision: decided.decision,
      rationale: decided.rationale,
      dataHash,
      onChain: true,
      txHash: primaryTx.hash,
      blockNumber: primaryTx.blockNumber,
      flagTxHashes: flagTxHash ? [flagTxHash] : [],
      agentRunId: runId,
    });

    if (escalated) {
      batch.set(adminDb.doc(`exceptions/${periodDocId(loanId, period)}`), {
        loanId,
        borrowerName: loan.borrowerName,
        period,
        codes: decided.triggeredRules,
        pricingHeld: decided.pricingHeld,
        status: "open",
        assignedRmUid: loan.rmUid,
        summary: `Period ${period}: ${decided.triggeredRules.join(", ")} (transition score ${decided.transitionScore}).`,
        rmBrief: explained.rmBrief,
        recommendation: decided.recommendation ?? null,
        currentMarginBps,
        proposedMarginBps: decided.proposedMarginBps,
        dataHash,
        txHash: primaryTx.hash,
        agentRunId: runId,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    batch.set(
      adminDb.doc(`events/${periodDocId(loanId, period)}__agent_update`),
      {
        loanId,
        borrowerName: loan.borrowerName,
        period,
        type: "agent_update",
        title: `Period ${period} review`,
        detail: explained.borrowerSummary,
        visibility: "all",
        actor: "agent",
        txHash: primaryTx.hash,
        agentRunId: runId,
        createdAt: FieldValue.serverTimestamp(),
      },
    );
    if (escalated) {
      batch.set(
        adminDb.doc(`events/${periodDocId(loanId, period)}__escalation`),
        {
          loanId,
          borrowerName: loan.borrowerName,
          period,
          type: "escalation",
          title: `Escalated: ${decided.triggeredRules.join(", ")}`,
          detail: explained.rmBrief,
          visibility: "internal",
          actor: "agent",
          txHash: flagTxHash ?? primaryTx.hash,
          agentRunId: runId,
          createdAt: FieldValue.serverTimestamp(),
        },
      );
    }

    const status = escalated
      ? "under_review"
      : decided.transitionScore < 60
        ? "watch"
        : "on_track";
    batch.update(loanRef, {
      currentPeriod: period,
      currentScore: decided.transitionScore,
      scoreDelta:
        previousTransitionScore === null
          ? null
          : decided.transitionScore - previousTransitionScore,
      status,
      // Mirror the contract: auto_adjust moves it; escalations leave it (a
      // step-up waits as pendingAdjustmentBps for the RM).
      currentMarginBps: appliedMarginBps,
      pendingAdjustmentBps,
      chainScore: Number(chainAfter.currentScore),
      lastAgentRunId: runId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    batch.update(runRef, {
      status: "complete",
      finishedAt: FieldValue.serverTimestamp(),
      result: {
        decision: decided.decision,
        transitionScore: decided.transitionScore,
        triggeredRules: decided.triggeredRules,
        pricingHeld: decided.pricingHeld,
        currentMarginBps,
        proposedMarginBps: decided.proposedMarginBps,
        appliedMarginBps,
        pendingAdjustmentBps,
        dataHash,
        txHash: primaryTx.hash,
        flagTxHash,
        blockNumber: primaryTx.blockNumber,
        borrowerSummary: explained.borrowerSummary,
        rmBrief: explained.rmBrief,
        recommendation: decided.recommendation ?? null,
      },
    });
    await batch.commit();

    return (await runRef.get()).data()!;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await runRef
      .update({
        status: "failed",
        failedStep: currentStep,
        error: message,
        finishedAt: FieldValue.serverTimestamp(),
      })
      .catch(() => undefined);
    throw new AgentRunError(message, 500, currentStep, runId);
  }
}
