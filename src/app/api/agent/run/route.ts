import { Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AgentRunError, runAgentForLoan } from "~/lib/agent/orchestrator";

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

/** POST { loanId } — runs the agent for the loan's next period. */
export async function POST(request: Request) {
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

  try {
    const run = await runAgentForLoan(parsed.data.loanId);
    return NextResponse.json({ ok: true, run: toJson(run) });
  } catch (err) {
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
}
