"use client";

import { PlayIcon } from "lucide-react";
import { useState } from "react";
import { isRunActive } from "~/components/cadence/activity";
import { AgentTrace } from "~/components/cadence/loan-sections";
import {
  ErrorState,
  LoadingCards,
  PageHeader,
  StatusBadge,
} from "~/components/cadence/primitives";
import { useAuth } from "~/components/auth/auth-provider";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Spinner } from "~/components/ui/spinner";
import { apiPost } from "~/lib/client/api";
import { useAgentRun, useLoans } from "~/lib/data/hooks";
import type { Loan } from "~/lib/data/types";
import { formatBps, formatBpsDelta } from "~/lib/format";

function LiveTrace({ runId }: { runId: string }) {
  const run = useAgentRun(runId);
  // Borrowers can't read agent traces (by design) — the dashboards still update.
  if (run.error || !run.data) return null;
  return <AgentTrace run={run.data} />;
}

function LoanRunCard({
  loan,
  canSeeTrace,
}: {
  loan: Loan;
  canSeeTrace: boolean;
}) {
  const [runId, setRunId] = useState<string | null>(
    loan.activeRun?.runId ?? null,
  );
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = isRunActive(loan);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const res = await apiPost<{ runId: string }>("/api/agent/run", {
        loanId: loan.id,
      });
      setRunId(res.runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {loan.borrowerName} <StatusBadge status={loan.status} />
        </CardTitle>
        <CardDescription>
          Week {loan.currentPeriod} · score {loan.currentScore} · margin{" "}
          {formatBps(loan.currentMarginBps)}
          {loan.pendingAdjustmentBps > 0
            ? ` (${formatBpsDelta(loan.pendingAdjustmentBps)} pending)`
            : ""}{" "}
          · scenario {loan.scenario}
        </CardDescription>
        <CardAction>
          <Button onClick={() => void start()} disabled={starting || running}>
            {starting || running ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <PlayIcon data-icon="inline-start" />
            )}
            {running
              ? `Running week ${loan.activeRun?.period}`
              : `Run week ${loan.currentPeriod + 1}`}
          </Button>
        </CardAction>
      </CardHeader>
      {error || (runId && canSeeTrace) ? (
        <CardContent className="flex flex-col gap-3">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Couldn&apos;t start the run</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {runId && canSeeTrace ? <LiveTrace runId={runId} /> : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

export default function DemoPage() {
  const { profile } = useAuth();
  const loans = useLoans();
  if (loans.error) return <ErrorState error={loans.error} />;
  if (loans.loading) return <LoadingCards count={3} />;
  const canSeeTrace = profile?.role === "rm" || profile?.role === "risk";

  return (
    <>
      <PageHeader
        title="Presenter controls"
        description="Run the agent for a loan's next week. Open the borrower, RM and Risk views in separate windows to watch the same event surface for each role in real time."
      />
      <Alert>
        <AlertTitle>Free-tier Gemini</AlertTitle>
        <AlertDescription>
          A run makes 3–5 Gemini calls and takes about 30s–4 min depending on
          quota back-off. Run one loan at a time; the drifting loan (Meridian)
          shows the full flag → RM approval path.
        </AlertDescription>
      </Alert>
      <div className="flex flex-col gap-4">
        {loans.data.map((l) => (
          <LoanRunCard key={l.id} loan={l} canSeeTrace={canSeeTrace} />
        ))}
      </div>
    </>
  );
}
