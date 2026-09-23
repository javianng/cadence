"use client";

import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  EyeIcon,
  MinusIcon,
  SendIcon,
  SparklesIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  KpiGlideChart,
  MarginVsAnnualChart,
  ScoreTrendChart,
} from "~/components/cadence/charts";
import {
  OnChainLink,
  RuleBadge,
  StatCard,
  StatGrid,
} from "~/components/cadence/primitives";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
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
import { apiPost } from "~/lib/client/api";
import {
  useEvents,
  useKpis,
  useLoan,
  useReadings,
  useScoreHistory,
} from "~/lib/data/hooks";
import {
  annualRunRate,
  exceptionSeverity,
  nextAssessmentDate,
  savingsToDate,
  scoreMovers,
  severityLabel,
} from "~/lib/data/metrics";
import type {
  AgentRun,
  Kpi,
  Loan,
  LoanEvent,
  LoanException,
  Message,
  Reading,
  ScoreHistory,
} from "~/lib/data/types";
import {
  formatBps,
  formatBpsDelta,
  formatDate,
  formatDateTime,
  formatSgd,
  tokenUrl,
} from "~/lib/format";
import { findBand } from "~/lib/pricing";
import { ON_TRACK_SCORE } from "~/lib/scoring";
import { cn } from "~/lib/utils";

// --- Data bundle ---------------------------------------------------------------

/** Everything a loan dashboard needs, live. `internal` adds staff-only events. */
export function useLoanBundle(
  loanId: string | null,
  { internal = false } = {},
) {
  const loan = useLoan(loanId);
  const history = useScoreHistory(loanId);
  const kpis = useKpis(loanId);
  const readings = useReadings(loanId);
  const events = useEvents(loanId, { internal });
  const parts = [loan, history, kpis, readings, events];
  return {
    loan: loan.data,
    history: history.data,
    kpis: kpis.data,
    readings: readings.data,
    events: events.data,
    loading: parts.some((p) => p.loading),
    error: parts.find((p) => p.error)?.error ?? null,
  };
}

const kpiName = (kpis: Kpi[], id: string) =>
  kpis.find((k) => k.kpiId === id)?.name ?? id;

function scoreTone(score: number) {
  if (score >= ON_TRACK_SCORE) {
    return {
      icon: CheckCircle2Icon,
      label: "On track",
      tone: "text-status-good",
    };
  }
  if (score >= 40)
    return { icon: EyeIcon, label: "Behind", tone: "text-status-warning" };
  return {
    icon: CircleAlertIcon,
    label: "Off track",
    tone: "text-status-critical",
  };
}

export function ScoreStatus({ score }: { score: number }) {
  const t = scoreTone(score);
  const Icon = t.icon;
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className={cn("size-3.5", t.tone)} />
      {t.label}
    </span>
  );
}

// --- Summary cards ----------------------------------------------------------------

export function LoanSummaryCards({
  loan,
  history,
}: {
  loan: Loan;
  history: ScoreHistory[];
}) {
  const latest = history.at(-1);
  const previous = history.at(-2);
  const delta =
    loan.scoreDelta ??
    (latest && previous
      ? latest.transitionScore - previous.transitionScore
      : null);
  const savings = savingsToDate(history, loan.facilityAmount, loan.periodDays);
  const runRate = annualRunRate(
    loan.staticMarginBps,
    loan.currentMarginBps,
    loan.facilityAmount,
  );

  return (
    <StatGrid cols={5}>
      <StatCard
        label="Transition score"
        value={loan.currentScore}
        hint={
          delta === null
            ? `Week ${loan.currentPeriod}`
            : `${delta > 0 ? "+" : ""}${delta} vs last week`
        }
        tone={
          delta === null || delta === 0 ? "neutral" : delta > 0 ? "good" : "bad"
        }
      />
      <StatCard
        label="Current margin"
        value={formatBps(loan.currentMarginBps)}
        hint={
          loan.pendingAdjustmentBps > 0
            ? `Rate change of ${formatBpsDelta(loan.pendingAdjustmentBps)} under review`
            : `Base ${formatBps(loan.baseMarginBps)}`
        }
      />
      <StatCard
        label="Saved vs annual model"
        value={formatSgd(savings, { compact: true })}
        hint={`${formatSgd(runRate, { compact: true })}/yr at today's margin`}
        tone={savings > 0 ? "good" : savings < 0 ? "bad" : "neutral"}
      />
      <StatCard
        label="Next assessment"
        value={formatDate(
          nextAssessmentDate(
            loan.startDate,
            loan.currentPeriod,
            loan.periodDays,
          ),
        )}
        hint={`Week ${loan.currentPeriod + 1} · weekly reviews`}
      />
      <StatCard
        label="On-chain record"
        value={
          <a
            href={tokenUrl(loan.contractAddress, loan.tokenId)}
            target="_blank"
            rel="noreferrer"
            className="underline-offset-4 hover:underline"
          >
            Token #{loan.tokenId}
          </a>
        }
        hint={
          latest?.txHash ? (
            <span className="inline-flex items-center gap-1">
              Latest: <OnChainLink hash={latest.txHash} />
            </span>
          ) : (
            "Polygon Amoy"
          )
        }
      />
    </StatGrid>
  );
}

// --- Latest update + what moved the score -------------------------------------------

/** Flow step 1: the portal shows what changed this week. */
export function LatestUpdateAlert({
  loan,
  events,
}: {
  loan: Loan;
  events: LoanEvent[];
}) {
  const latest = events.find(
    (e) => e.period === loan.currentPeriod && e.visibility === "all",
  );
  if (!latest) return null;
  return (
    <Alert>
      <SparklesIcon />
      <AlertTitle>
        Week {latest.period} update · {latest.title}
      </AlertTitle>
      {latest.detail ? (
        <AlertDescription>{latest.detail}</AlertDescription>
      ) : null}
    </Alert>
  );
}

export function WhatMovedCard({
  loan,
  history,
  kpis,
  events,
}: {
  loan: Loan;
  history: ScoreHistory[];
  kpis: Kpi[];
  events: LoanEvent[];
}) {
  const latest = history.at(-1);
  const previous = history.at(-2);
  const movers =
    latest && previous ? scoreMovers(previous.kpiScores, latest.kpiScores) : [];
  const summary = events.find(
    (e) => e.type === "agent_update" && e.period === loan.currentPeriod,
  )?.detail;
  const top = movers[0];
  const fallback = top
    ? `${kpiName(kpis, top.kpiId)} ${top.scoreDelta >= 0 ? "improved" : "slipped"} the most this week; your overall score is ${loan.currentScore}.`
    : `Your overall score is ${loan.currentScore} this week.`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>What moved your score</CardTitle>
        <CardDescription>Week {loan.currentPeriod} review</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm">{summary ?? fallback}</p>
        <ul className="flex flex-col gap-2">
          {movers.map((m) => {
            const Icon =
              m.scoreDelta > 0
                ? ArrowUpRightIcon
                : m.scoreDelta < 0
                  ? ArrowDownRightIcon
                  : MinusIcon;
            return (
              <li
                key={m.kpiId}
                className="flex items-center justify-between gap-3"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon
                    className={cn(
                      "size-3.5 shrink-0",
                      m.scoreDelta > 0 && "text-status-good",
                      m.scoreDelta < 0 && "text-status-critical",
                      m.scoreDelta === 0 && "text-muted-foreground",
                    )}
                  />
                  <span className="truncate">{kpiName(kpis, m.kpiId)}</span>
                </span>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {m.score} ({m.scoreDelta > 0 ? "+" : ""}
                  {m.scoreDelta})
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

// --- Charts --------------------------------------------------------------------------

export function marginPoints(loan: Loan, history: ScoreHistory[]) {
  const points = history.map((h) => ({
    period: h.period,
    cadenceBps: h.marginAfterBps,
    annualBps: h.staticMarginBps,
  }));
  // After an RM decision the live margin can be ahead of the last history row.
  const last = points.at(-1);
  if (last && last.cadenceBps !== loan.currentMarginBps) {
    last.cadenceBps = loan.currentMarginBps;
  }
  return points;
}

export function LoanTrendCharts({
  loan,
  history,
}: {
  loan: Loan;
  history: ScoreHistory[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Transition score</CardTitle>
          <CardDescription>
            Weekly, 70 = on the agreed glide path
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScoreTrendChart
            series={[
              {
                id: "score",
                label: "Transition score",
                points: history.map((h) => ({
                  period: h.period,
                  score: h.transitionScore,
                })),
              },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Margin: Cadence vs annual model</CardTitle>
          <CardDescription>
            Cadence reprices weekly; the annual model stays at{" "}
            {formatBps(loan.staticMarginBps)} until the yearly reset
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MarginVsAnnualChart points={marginPoints(loan, history)} />
        </CardContent>
      </Card>
    </div>
  );
}

// --- KPIs ----------------------------------------------------------------------------

function fmtValue(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return Math.abs(v) >= 1000
    ? v.toLocaleString("en-SG", { maximumFractionDigits: 0 })
    : v.toFixed(2);
}

/** Compact KPI table for overview pages. */
export function KpiSummaryTable({
  kpis,
  readings,
  period,
}: {
  kpis: Kpi[];
  readings: Reading[];
  period: number;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>KPI</TableHead>
          <TableHead className="text-right">This week</TableHead>
          <TableHead className="text-right">Glide path</TableHead>
          <TableHead className="text-right">Final target</TableHead>
          <TableHead className="text-right">Score</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {kpis.map((k) => {
          const r = readings.find(
            (x) => x.kpiId === k.kpiId && x.period === period,
          );
          return (
            <TableRow key={k.kpiId}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">{k.name}</span>
                  <span className="text-muted-foreground">
                    {k.unit} · weight {Math.round(k.weight * 100)}%
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtValue(r?.acceptedValue)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtValue(r?.glideValue)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtValue(k.finalTarget)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r?.score ?? "—"}
              </TableCell>
              <TableCell>{r ? <ScoreStatus score={r.score} /> : "—"}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** Per-KPI glide chart + recent readings (both sources shown neutrally). */
export function KpiDetailCards({
  kpis,
  readings,
}: {
  kpis: Kpi[];
  readings: Reading[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {kpis.map((k) => {
        const rows = readings.filter((r) => r.kpiId === k.kpiId);
        const latest = rows.at(-1);
        return (
          <Card key={k.kpiId}>
            <CardHeader>
              <CardTitle>{k.name}</CardTitle>
              <CardDescription>
                {k.unit} ·{" "}
                {k.direction === "lower_better"
                  ? "lower is better"
                  : "higher is better"}{" "}
                · baseline {fmtValue(k.baseline)} → target{" "}
                {fmtValue(k.finalTarget)} by week {k.targetPeriod} · weight{" "}
                {Math.round(k.weight * 100)}%
              </CardDescription>
              {latest ? (
                <CardAction>
                  <Badge variant="outline">
                    <ScoreStatus score={latest.score} />
                  </Badge>
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-[3fr_2fr]">
              <KpiGlideChart
                unit={k.unit}
                points={rows.map((r) => ({
                  period: r.period,
                  actual: r.acceptedValue,
                  glide: r.glideValue,
                }))}
              />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Week</TableHead>
                    <TableHead className="text-right">Reported</TableHead>
                    <TableHead className="text-right">Independent</TableHead>
                    <TableHead className="text-right">Used</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows
                    .slice(-6)
                    .reverse()
                    .map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>W{r.period}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtValue(r.primaryValue)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtValue(r.secondaryValue)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtValue(r.acceptedValue)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.score}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// --- Pricing -------------------------------------------------------------------------

export function PricingHistoryTable({ history }: { history: ScoreHistory[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Week</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Score</TableHead>
          <TableHead className="text-right">Margin</TableHead>
          <TableHead className="text-right">Change</TableHead>
          <TableHead className="text-right">Annual model</TableHead>
          <TableHead>Record</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...history].reverse().map((h) => {
          const change = h.marginAfterBps - h.marginBeforeBps;
          return (
            <TableRow key={h.id}>
              <TableCell>W{h.period}</TableCell>
              <TableCell>{formatDate(h.periodEnd)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {h.transitionScore}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatBps(h.marginAfterBps)}
                {h.pendingAdjustmentBps > 0 ? (
                  <span className="text-muted-foreground"> (review)</span>
                ) : null}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {change === 0 ? "—" : formatBpsDelta(change)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatBps(h.staticMarginBps)}
              </TableCell>
              <TableCell>
                {h.onChain ? (
                  <OnChainLink hash={h.txHash} />
                ) : (
                  <span className="text-muted-foreground">
                    Off-chain history
                  </span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** The locked pricing grid: score band → target margin. */
export function BandGrid({ loan }: { loan: Loan }) {
  const current = findBand(loan.currentScore, loan.bands);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Transition score</TableHead>
          <TableHead className="text-right">Adjustment</TableHead>
          <TableHead className="text-right">Target margin</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {loan.bands.map((b, i) => {
          const upper = i === 0 ? 100 : loan.bands[i - 1]!.minScore - 1;
          const target = Math.min(
            loan.capBps,
            Math.max(loan.floorBps, loan.baseMarginBps + b.adjustmentBps),
          );
          return (
            <TableRow key={b.minScore}>
              <TableCell>
                {b.minScore}–{upper}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatBpsDelta(b.adjustmentBps)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatBps(target)}
              </TableCell>
              <TableCell>
                {b.minScore === current.minScore ? (
                  <Badge variant="secondary">You are here</Badge>
                ) : null}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// --- Messages -------------------------------------------------------------------------

export function MessageComposer({
  loanId,
  placeholder,
  onSent,
}: {
  loanId: string;
  placeholder: string;
  onSent?: () => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    try {
      await apiPost("/api/messages", { loanId, text });
      setText("");
      onSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        rows={3}
        maxLength={2000}
      />
      {error ? <p className="text-destructive">{error}</p> : null}
      <div className="flex justify-end">
        <Button onClick={() => void send()} disabled={sending || !text.trim()}>
          {sending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <SendIcon data-icon="inline-start" />
          )}
          Send
        </Button>
      </div>
    </div>
  );
}

export function MessageList({ messages }: { messages: Message[] }) {
  if (messages.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No messages yet</EmptyTitle>
          <EmptyDescription>
            Messages between the borrower and their RM appear here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {messages.map((m) => (
        <li
          key={m.id}
          className={cn(
            "flex max-w-[85%] flex-col gap-1 rounded-lg p-3",
            m.fromRole === "rm"
              ? "bg-muted self-start"
              : "bg-secondary self-end",
          )}
        >
          <span className="text-muted-foreground">
            {m.fromName} ·{" "}
            {m.fromRole === "rm" ? "Relationship manager" : "Borrower"} ·{" "}
            {formatDateTime(m.createdAt)}
          </span>
          <p className="whitespace-pre-wrap">{m.text}</p>
        </li>
      ))}
    </ul>
  );
}

// --- Agent runs (staff) -------------------------------------------------------------------

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="bg-muted max-h-64 overflow-auto rounded-md p-3 font-mono text-[11px] leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function AgentTrace({ run }: { run: AgentRun }) {
  return (
    <div className="flex flex-col gap-3">
      {run.error ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Failed at {run.failedStep}</AlertTitle>
          <AlertDescription>{run.error}</AlertDescription>
        </Alert>
      ) : null}
      {run.steps.length === 0 ? (
        <p className="text-muted-foreground">No steps recorded yet.</p>
      ) : (
        <Accordion>
          {run.steps.map((s, i) => (
            <AccordionItem key={`${s.name}-${i}`} value={`${s.name}-${i}`}>
              <AccordionTrigger>
                <span className="flex w-full items-center justify-between gap-3 pr-2">
                  <span className="font-medium capitalize">
                    {i + 1}. {s.name}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {(s.durationMs / 1000).toFixed(1)}s
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="flex flex-col gap-3">
                {s.reasoning ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground">Reasoning</span>
                    <p className="whitespace-pre-wrap">{s.reasoning}</p>
                  </div>
                ) : null}
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">Output</span>
                  <JsonBlock value={s.output} />
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}

const RUN_STATUS: Record<AgentRun["status"], string> = {
  running: "Running",
  complete: "Complete",
  failed: "Failed",
};

export function AgentRunsList({ runs }: { runs: AgentRun[] }) {
  if (runs.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No agent runs yet</EmptyTitle>
          <EmptyDescription>
            Seeded history predates the agent. Runs appear here once the agent
            reviews a new week.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <Accordion>
      {runs.map((run) => {
        const duration =
          run.finishedAt && run.startedAt
            ? `${Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000)}s`
            : null;
        return (
          <AccordionItem key={run.id} value={run.id}>
            <AccordionTrigger>
              <span className="flex w-full flex-wrap items-center gap-2 pr-2">
                <span className="font-medium">Week {run.period}</span>
                <Badge
                  variant={run.status === "failed" ? "destructive" : "outline"}
                >
                  {run.status === "running" ? (
                    <Spinner data-icon="inline-start" />
                  ) : null}
                  {RUN_STATUS[run.status]}
                </Badge>
                {run.result ? (
                  <Badge variant="secondary">{run.result.decision}</Badge>
                ) : null}
                <span className="text-muted-foreground ml-auto">
                  {formatDateTime(run.startedAt)}
                  {duration ? ` · ${duration}` : ""} · {run.model}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              {run.result ? (
                <div className="text-muted-foreground mb-3 flex flex-wrap gap-x-4 gap-y-1">
                  <span>Score {run.result.transitionScore}</span>
                  <span>
                    Margin {formatBps(run.result.currentMarginBps)} → proposed{" "}
                    {formatBps(run.result.proposedMarginBps)} → applied{" "}
                    {formatBps(run.result.appliedMarginBps)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    Tx <OnChainLink hash={run.result.txHash} />
                  </span>
                </div>
              ) : null}
              <AgentTrace run={run} />
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

// --- Exceptions (staff) ----------------------------------------------------------------------

export const EXCEPTION_STATUS_LABEL: Record<LoanException["status"], string> = {
  open: "Open",
  info_requested: "Awaiting info",
  resolved: "Resolved",
  superseded: "Superseded",
};

export const RECOMMENDATION_LABEL: Record<string, string> = {
  approve_step_up: "Approve step-up",
  hold: "Hold",
  request_info: "Request info",
  accept_data: "Accept data",
};

export function ExceptionsTable({
  exceptions,
  pendingByLoan,
  hrefFor,
  showBorrower = true,
}: {
  exceptions: LoanException[];
  pendingByLoan?: Record<string, number>;
  hrefFor?: (e: LoanException) => string;
  showBorrower?: boolean;
}) {
  if (exceptions.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Nothing here</EmptyTitle>
          <EmptyDescription>No exceptions in this view.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showBorrower ? <TableHead>Borrower</TableHead> : null}
          <TableHead>Week</TableHead>
          <TableHead>Rules</TableHead>
          <TableHead>Severity</TableHead>
          <TableHead>Agent recommends</TableHead>
          <TableHead>Status</TableHead>
          {hrefFor ? <TableHead /> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {exceptions.map((e) => {
          const severity = exceptionSeverity(
            e.codes,
            e.status === "open" ? (pendingByLoan?.[e.loanId] ?? 0) : 0,
          );
          return (
            <TableRow key={e.id}>
              {showBorrower ? (
                <TableCell className="font-medium">{e.borrowerName}</TableCell>
              ) : null}
              <TableCell>W{e.period}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {e.codes.map((c) => (
                    <RuleBadge key={c} code={c} />
                  ))}
                </div>
              </TableCell>
              <TableCell>{severityLabel(severity)}</TableCell>
              <TableCell>
                {e.recommendation
                  ? RECOMMENDATION_LABEL[e.recommendation.action]
                  : "—"}
              </TableCell>
              <TableCell>{EXCEPTION_STATUS_LABEL[e.status]}</TableCell>
              {hrefFor ? (
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant={e.status === "open" ? "default" : "outline"}
                    render={<Link href={hrefFor(e)} />}
                    nativeButton={false}
                  >
                    {e.status === "open" || e.status === "info_requested"
                      ? "Review"
                      : "View"}
                  </Button>
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
