import { Timestamp } from "firebase-admin/firestore";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import {
  AgentRunError,
  runAgentForLoan,
  startAgentRun,
} from "~/lib/agent/orchestrator";
import { HttpError, requireUser } from "~/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 3-5 Gemini calls (with quota back-off) plus up to two Amoy confirmations.
export const maxDuration = 300;

const bodySchema = z.object({ loanId: z.string().min(1) });

/** Firestore Timestamps -> ISO strings so the run trace is readable JSON. */
function toJson(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, toJson(v)]),
    );
  }
  return value;
}

function agentError(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: err.status },
    );
  }
  if (err instanceof AgentRunError) {
    console.error(`[agent] ${err.step} failed (run ${err.runId}):`, err);
    return NextResponse.json(
      {
        ok: false,
        error: err.message,
        failedStep: err.step,
        runId: err.runId,
        hint: err.runId
          ? `Partial trace: Firestore agentRuns/${err.runId}`
          : undefined,
      },
      { status: err.status },
    );
  }
  console.error("[agent] unexpected error:", err);
  return NextResponse.json(
    {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    },
    { status: 500 },
  );
}

/**
 * POST { loanId } — runs the agent for the loan's next period. Requires a
 * signed-in user (Authorization: Bearer <Firebase ID token>).
 *
 * Default: returns 202 { runId } immediately and runs in the background;
 * dashboards follow agentRuns/{runId} live. `?wait=1` blocks and returns the
 * completed run (for curl/scripts).
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Body must be JSON: { "loanId": "<loan id>" }',
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }
    const { loanId } = parsed.data;

    if (new URL(request.url).searchParams.get("wait") === "1") {
      const run = await runAgentForLoan(loanId, user.uid);
      return NextResponse.json({ ok: true, run: toJson(run) });
    }

    const { runId, execute } = await startAgentRun(loanId, user.uid);
    after(async () => {
      // Failures are recorded on the agentRuns doc by the orchestrator.
      await execute().catch(() => undefined);
    });
    return NextResponse.json({ ok: true, runId }, { status: 202 });
  } catch (err) {
    return agentError(err);
  }
}
