"use client";

import {
  ArrowLeftIcon,
  CheckIcon,
  CircleAlertIcon,
  HelpCircleIcon,
  PauseIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AgentRunBanner } from "~/components/cadence/activity";
import {
  AgentTrace,
  EXCEPTION_STATUS_LABEL,
  RECOMMENDATION_LABEL,
} from "~/components/cadence/loan-sections";
import {
  ErrorState,
  LoadingCards,
  OnChainLink,
  PageHeader,
  RuleBadge,
} from "~/components/cadence/primitives";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Field, FieldLabel } from "~/components/ui/field";
import { Spinner } from "~/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Textarea } from "~/components/ui/textarea";
import { RULE_THRESHOLDS } from "~/lib/agent/rules";
import { apiPost } from "~/lib/client/api";
import {
  useAgentRun,
  useException,
  useExceptions,
  useKpis,
  useLoans,
  useReadings,
} from "~/lib/data/hooks";
import { exceptionSeverity, severityLabel } from "~/lib/data/metrics";
import type { LoanException, RmAction } from "~/lib/data/types";
import { formatBps, formatBpsDelta, formatDateTime } from "~/lib/format";
import { cn } from "~/lib/utils";

const ACTIONS: Record<
  RmAction,
  {
    label: string;
    icon: LucideIcon;
    confirm: string;
    variant: "default" | "outline";
  }
> = {
  approve: {
    label: "Approve step-up",
    icon: CheckIcon,
    confirm:
      "Approve the pending step-up on-chain (resolveAdjustment, approve = true).",
    variant: "default",
  },
  hold: {
    label: "Hold",
    icon: PauseIcon,
    confirm:
      "Keep the current margin. A pending step-up is rejected on-chain; otherwise the hold is recorded with flagException(RM_HOLD).",
    variant: "outline",
  },
  request_info: {
    label: "Request info",
    icon: HelpCircleIcon,
    confirm:
      "Ask the borrower for evidence. Recorded on-chain with flagException(RM_REQUEST_INFO); the case stays in your queue as “Awaiting info”.",
    variant: "outline",
  },
};

const isActionable = (e: LoanException) =>
  e.status === "open" || e.status === "info_requested";

/** Open cases, most severe first (used for the queue and "next case"). */
export function sortBySeverity(
  exceptions: LoanException[],
  pendingByLoan: Record<string, number>,
): LoanException[] {
  const sev = (e: LoanException) =>
    exceptionSeverity(
      e.codes,
      isActionable(e) ? (pendingByLoan[e.loanId] ?? 0) : 0,
    );
  return [...exceptions].sort(
    (a, b) =>
      sev(b) - sev(a) ||
      (pendingByLoan[b.loanId] ?? 0) - (pendingByLoan[a.loanId] ?? 0) ||
      b.period - a.period,
  );
}

type DecisionResult = {
  action: RmAction;
  txHash: string;
  currentMarginBps: number;
};

export function ExceptionReview({
  id,
  readOnly,
  basePath,
}: {
  id: string;
  /** Risk sees the same case without decision controls. */
  readOnly: boolean;
  /** "/rm" or "/risk": where Loan 360 / queue links point. */
  basePath: string;
}) {
  const exception = useException(id);
  const ex = exception.data;
  const loans = useLoans();
  const loan = loans.data.find((l) => l.id === ex?.loanId) ?? null;
  const readings = useReadings(ex?.loanId ?? null);
  const kpis = useKpis(ex?.loanId ?? null);
  const run = useAgentRun(ex?.agentRunId ?? null);
  const queue = useExceptions();

  const [note, setNote] = useState("");
  const [pending, setPending] = useState<RmAction | null>(null);
  const [confirming, setConfirming] = useState<RmAction | null>(null);
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadError = exception.error ?? loans.error ?? readings.error;
  if (loadError) return <ErrorState error={loadError} />;
  if (exception.loading || loans.loading) return <LoadingCards />;
  if (!ex) {
    return (
      <Alert>
        <CircleAlertIcon />
        <AlertTitle>Exception not found</AlertTitle>
        <AlertDescription>
          It may have been removed or belongs to another RM&apos;s book.
        </AlertDescription>
      </Alert>
    );
  }

  const periodReadings = readings.data.filter((r) => r.period === ex.period);
  const pendingByLoan = Object.fromEntries(
    loans.data.map((l) => [l.id, l.pendingAdjustmentBps]),
  );
  const nextCase = sortBySeverity(
    queue.data.filter((e) => e.status === "open" && e.id !== ex.id),
    pendingByLoan,
  )[0];
  const onChainPending = loan?.pendingAdjustmentBps ?? 0;
  const severity = exceptionSeverity(
    ex.codes,
    isActionable(ex) ? onChainPending : 0,
  );

  async function decide(action: RmAction) {
    setPending(action);
    setError(null);
    try {
      const res = await apiPost<DecisionResult>(
        `/api/exceptions/${id}/decision`,
        {
          action,
          note: note.trim() || undefined,
        },
      );
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
      setConfirming(null);
    }
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {ex.borrowerName} · week {ex.period}
            {ex.codes.map((c) => (
              <RuleBadge key={c} code={c} />
            ))}
          </span>
        }
        description={`${EXCEPTION_STATUS_LABEL[ex.status]} · severity ${severityLabel(severity)} · raised ${formatDateTime(ex.createdAt)}`}
        actions={
          <>
            <Button
              variant="outline"
              render={
                <Link
                  href={
                    readOnly
                      ? `${basePath}/governance`
                      : `${basePath}/exceptions`
                  }
                />
              }
              nativeButton={false}
            >
              <ArrowLeftIcon data-icon="inline-start" />
              {readOnly ? "Governance" : "Queue"}
            </Button>
            <Button
              variant="outline"
              render={<Link href={`${basePath}/loans/${ex.loanId}`} />}
              nativeButton={false}
            >
              Loan 360
            </Button>
          </>
        }
      />
      <AgentRunBanner loan={loan} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Agent brief</CardTitle>
              <CardDescription>
                {ex.rmBrief
                  ? "Written by the agent from deterministic scores and rules"
                  : "Seeded history — this case predates the agent"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">
                {ex.rmBrief ?? ex.summary}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Evidence · week {ex.period}</CardTitle>
              <CardDescription>
                Primary (borrower-reported) vs secondary source. Divergence over{" "}
                {RULE_THRESHOLDS.mismatchPct * 100}% or a KPI score under{" "}
                {RULE_THRESHOLDS.kpiBreachScore} is flagged.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>KPI</TableHead>
                    <TableHead className="text-right">Primary</TableHead>
                    <TableHead className="text-right">Secondary</TableHead>
                    <TableHead className="text-right">Divergence</TableHead>
                    <TableHead className="text-right">Accepted</TableHead>
                    <TableHead className="text-right">Glide path</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periodReadings.map((r) => {
                    const mismatch =
                      (r.divergencePct ?? 0) > RULE_THRESHOLDS.mismatchPct;
                    const breach = r.score < RULE_THRESHOLDS.kpiBreachScore;
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          {kpis.data.find((k) => k.kpiId === r.kpiId)?.name ??
                            r.kpiId}
                          {r.anomalous ? (
                            <Badge variant="destructive" className="ml-2">
                              Anomaly
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.primaryValue ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.secondaryValue ?? "—"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            mismatch && "text-destructive font-medium",
                          )}
                        >
                          {r.divergencePct === null
                            ? "—"
                            : `${(r.divergencePct * 100).toFixed(1)}%`}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.acceptedValue ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.glideValue}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            breach && "text-destructive font-medium",
                          )}
                        >
                          {r.score}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Agent trace</CardTitle>
              <CardDescription>
                {run.data
                  ? `Run ${run.data.id} · ${run.data.model} · verify → reconcile → decide → explain`
                  : "No agent run is attached to this case."}
              </CardDescription>
            </CardHeader>
            {run.data ? (
              <CardContent>
                <AgentTrace run={run.data} />
              </CardContent>
            ) : null}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Margin impact</CardTitle>
              <CardDescription>Live from the contract</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current margin</span>
                <span className="font-medium tabular-nums">
                  {loan ? formatBps(loan.currentMarginBps) : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pending step-up</span>
                <span className="font-medium tabular-nums">
                  {onChainPending > 0 ? formatBpsDelta(onChainPending) : "None"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">If approved</span>
                <span className="font-medium tabular-nums">
                  {loan && onChainPending > 0
                    ? formatBps(loan.currentMarginBps + onChainPending)
                    : "—"}
                </span>
              </div>
              {ex.pricingHeld ? (
                <p className="text-muted-foreground">
                  Pricing is held: data integrity must be resolved before the
                  margin can move.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Agent recommends</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {ex.recommendation ? (
                <>
                  <Badge variant="secondary">
                    {RECOMMENDATION_LABEL[ex.recommendation.action]}
                  </Badge>
                  <p>{ex.recommendation.justification}</p>
                </>
              ) : (
                <p className="text-muted-foreground">
                  No recommendation (seeded case).
                </p>
              )}
            </CardContent>
          </Card>

          {ex.decision || result ? (
            <Card>
              <CardHeader>
                <CardTitle>Decision</CardTitle>
                <CardDescription>Executed on-chain</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>
                    {ACTIONS[(result?.action ?? ex.decision)!].label}
                  </Badge>
                  {typeof ex.agreedWithAgent === "boolean" ? (
                    <Badge variant="outline">
                      {ex.agreedWithAgent
                        ? "Agreed with agent"
                        : "Overrode agent"}
                    </Badge>
                  ) : null}
                </div>
                {ex.resolution ? <p>{ex.resolution}</p> : null}
                {ex.note ? (
                  <p className="text-muted-foreground">Note: {ex.note}</p>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  Transaction{" "}
                  <OnChainLink hash={result?.txHash ?? ex.decisionTxHash} />
                </span>
              </CardContent>
              {!readOnly ? (
                <CardFooter className="flex flex-wrap gap-2">
                  {nextCase ? (
                    <Button
                      render={
                        <Link href={`${basePath}/exceptions/${nextCase.id}`} />
                      }
                      nativeButton={false}
                    >
                      Next case
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    render={<Link href={`${basePath}/loans/${ex.loanId}`} />}
                    nativeButton={false}
                  >
                    Loan 360
                  </Button>
                </CardFooter>
              ) : null}
            </Card>
          ) : null}

          {!readOnly && isActionable(ex) && !result ? (
            <Card>
              <CardHeader>
                <CardTitle>Your decision</CardTitle>
                <CardDescription>
                  Every decision is executed and recorded on Polygon.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Field>
                  <FieldLabel htmlFor="rm-note">Note (optional)</FieldLabel>
                  <Textarea
                    id="rm-note"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Context for the file and for Risk…"
                  />
                </Field>
                {error ? (
                  <Alert variant="destructive">
                    <CircleAlertIcon />
                    <AlertTitle>Decision failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
                <div className="flex flex-col gap-2">
                  {(Object.keys(ACTIONS) as RmAction[]).map((action) => {
                    const meta = ACTIONS[action];
                    const Icon = meta.icon;
                    const disabled =
                      pending !== null ||
                      (action === "approve" && onChainPending <= 0);
                    return (
                      <Button
                        key={action}
                        variant={
                          action === "approve" && onChainPending > 0
                            ? "default"
                            : "outline"
                        }
                        disabled={disabled}
                        onClick={() => setConfirming(action)}
                      >
                        {pending === action ? (
                          <Spinner data-icon="inline-start" />
                        ) : (
                          <Icon data-icon="inline-start" />
                        )}
                        {meta.label}
                        {action === "approve" && onChainPending <= 0
                          ? " (nothing pending)"
                          : ""}
                      </Button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming ? ACTIONS[confirming].label : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming ? ACTIONS[confirming].confirm : ""} This sends a
              transaction on Polygon Amoy and can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending !== null}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={pending !== null}
              onClick={() => confirming && void decide(confirming)}
            >
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Confirm on-chain
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
