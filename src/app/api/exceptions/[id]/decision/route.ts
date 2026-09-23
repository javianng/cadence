import { encodeBytes32String, id as keccakId } from "ethers";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "~/lib/firebase/admin";
import { errorResponse, HttpError, requireUser } from "~/lib/server/auth";
import { assertGasBudget, FEE_OVERRIDES } from "~/lib/web3/client";
import { cadenceContract as contract } from "~/lib/web3/contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  action: z.enum(["approve", "hold", "request_info"]),
  note: z.string().trim().max(1000).optional(),
});

/** Agent recommendation that each RM action agrees with. */
const AGREES_WITH = {
  approve: "approve_step_up",
  hold: "hold",
  request_info: "request_info",
} as const;

const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;
const pad = (p: number) => String(p).padStart(2, "0");

/**
 * POST { action, note? } — the RM's decision on an exception. Every decision
 * is executed on-chain:
 *   approve       → resolveAdjustment(approve = true)   (pending step-up only)
 *   hold          → resolveAdjustment(false) if a step-up is pending,
 *                   else flagException(RM_HOLD, dataHash)
 *   request_info  → flagException(RM_REQUEST_INFO, dataHash)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request, ["rm"]);
    const { id } = await params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new HttpError(
        400,
        'Body must be { "action": "approve" | "hold" | "request_info", "note"?: string }',
      );
    }
    const { action, note } = parsed.data;

    const exRef = adminDb.doc(`exceptions/${id}`);
    const ex = (await exRef.get()).data();
    if (!ex) throw new HttpError(404, `Exception ${id} not found`);
    if (ex.rmUid !== user.uid) {
      throw new HttpError(403, "This exception belongs to another RM's book");
    }
    if (ex.status !== "open" && ex.status !== "info_requested") {
      throw new HttpError(409, `Exception is already ${String(ex.status)}`);
    }

    const loanId = ex.loanId as string;
    const loanRef = adminDb.doc(`loans/${loanId}`);
    const loan = (await loanRef.get()).data();
    if (!loan) throw new HttpError(404, `Loan ${loanId} not found`);
    const token = BigInt(loan.tokenId as number);

    const before = await contract.getLoan(token);
    const pending = Number(before.pendingAdjustmentBps);
    if (action === "approve" && pending <= 0) {
      throw new HttpError(409, "No step-up is pending on-chain to approve");
    }

    // --- Execute on-chain -----------------------------------------------------
    const rmRef = keccakId(`cadence:rm:${user.uid}`);
    const dataHash = ex.dataHash as string;
    const send = async (
      label: string,
      estimate: () => Promise<bigint>,
      submit: () => ReturnType<typeof contract.flagException>,
    ) => {
      await assertGasBudget(label, await estimate());
      const tx = await submit();
      const receipt = await tx.wait(1);
      if (receipt?.status !== 1)
        throw new Error(`${label} reverted: ${tx.hash}`);
      return receipt;
    };

    let receipt;
    if (action === "approve" || (action === "hold" && pending > 0)) {
      const args = [token, action === "approve", rmRef] as const;
      receipt = await send(
        "resolveAdjustment",
        () => contract.resolveAdjustment.estimateGas(...args),
        () => contract.resolveAdjustment(...args, FEE_OVERRIDES),
      );
    } else {
      const code = action === "hold" ? "RM_HOLD" : "RM_REQUEST_INFO";
      const args = [token, encodeBytes32String(code), dataHash] as const;
      receipt = await send(
        "flagException",
        () => contract.flagException.estimateGas(...args),
        () => contract.flagException(...args, FEE_OVERRIDES),
      );
    }

    const after = await contract.getLoan(token);
    const marginBps = Number(after.currentMarginBps);
    const pendingBps = Number(after.pendingAdjustmentBps);

    // --- Mirror into Firestore ------------------------------------------------
    const recommended = (ex.recommendation as { action?: string } | null)
      ?.action;
    const agreedWithAgent = recommended
      ? recommended === AGREES_WITH[action]
      : null;
    const resolution =
      action === "approve"
        ? `Step-up approved: margin ${pct(Number(before.currentMarginBps))} → ${pct(marginBps)}.`
        : action === "hold"
          ? pending > 0
            ? `Step-up rejected; margin held at ${pct(marginBps)}.`
            : `Held at ${pct(marginBps)} pending further review.`
          : "Additional information requested from the borrower.";

    const batch = adminDb.batch();
    batch.update(exRef, {
      status: action === "request_info" ? "info_requested" : "resolved",
      decision: action,
      note: note ?? null,
      resolution,
      decidedByUid: user.uid,
      decisionTxHash: receipt.hash,
      agreedWithAgent,
      decidedAt: FieldValue.serverTimestamp(),
    });

    // A pricing decision settles every other open case on the loan.
    const others = (
      await adminDb.collection("exceptions").where("loanId", "==", loanId).get()
    ).docs.filter(
      (d) =>
        d.id !== id &&
        (d.get("status") === "open" || d.get("status") === "info_requested"),
    );
    const supersede = action !== "request_info";
    if (supersede) {
      for (const d of others) {
        batch.update(d.ref, {
          status: "superseded",
          resolution: `Superseded by the RM decision on period ${String(ex.period)}.`,
          decidedAt: FieldValue.serverTimestamp(),
        });
      }
    }
    const stillOpen =
      (supersede ? 0 : others.length) + (action === "request_info" ? 1 : 0);

    const currentScore = Number(loan.currentScore ?? 0);
    const status =
      stillOpen > 0 ? "under_review" : currentScore < 60 ? "watch" : "on_track";
    batch.update(loanRef, {
      currentMarginBps: marginBps,
      pendingAdjustmentBps: pendingBps,
      status,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Keep the latest period's history in step with the chain.
    const period = Number(loan.currentPeriod);
    batch.set(
      adminDb.doc(`scoreHistory/${loanId}__p${pad(period)}`),
      {
        marginAfterBps: marginBps,
        pendingAdjustmentBps: pendingBps,
        rmDecision: action,
        rmDecisionTxHash: receipt.hash,
      },
      { merge: true },
    );

    const scope = {
      loanId,
      ownerUid: loan.ownerUid as string,
      rmUid: loan.rmUid as string,
      borrowerName: loan.borrowerName as string,
      period,
      actor: "rm",
      txHash: receipt.hash,
      createdAt: FieldValue.serverTimestamp(),
    };
    const stamp = Date.now();
    batch.set(adminDb.doc(`events/${loanId}__p${pad(period)}__rm_${stamp}`), {
      ...scope,
      type: "rm_decision",
      title:
        action === "approve"
          ? `RM approved step-up to ${pct(marginBps)}`
          : action === "hold"
            ? "RM held pricing"
            : "RM requested information",
      detail: [resolution, note].filter(Boolean).join(" Note: "),
      visibility: "internal",
    });
    batch.set(
      adminDb.doc(`events/${loanId}__p${pad(period)}__update_${stamp}`),
      {
        ...scope,
        type: action === "request_info" ? "info_requested" : "rate_decision",
        title:
          action === "approve"
            ? `Your margin is now ${pct(marginBps)}`
            : action === "hold"
              ? `Your margin stays at ${pct(marginBps)}`
              : "Your relationship manager has a question",
        detail:
          action === "approve"
            ? "Following review, your relationship manager confirmed the rate change."
            : action === "hold"
              ? "Your relationship manager reviewed this period and kept your rate unchanged."
              : "Your relationship manager has asked for more information about this period's data and will be in touch.",
        visibility: "all",
      },
    );
    await batch.commit();

    return Response.json({
      ok: true,
      action,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      currentMarginBps: marginBps,
      pendingAdjustmentBps: pendingBps,
      status,
      agreedWithAgent,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
