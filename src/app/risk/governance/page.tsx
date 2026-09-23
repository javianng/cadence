"use client";

import { DownloadIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { RECOMMENDATION_LABEL } from "~/components/cadence/loan-sections";
import {
  ErrorState,
  LoadingCards,
  OnChainLink,
  PageHeader,
  RuleBadge,
  StatCard,
  StatGrid,
} from "~/components/cadence/primitives";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { JUMP_THRESHOLD_PCT } from "~/lib/agent/checks";
import { PRICING_HOLD_CODES, RULE_THRESHOLDS } from "~/lib/agent/rules";
import { useAgentRuns, useExceptions, useScoreHistory } from "~/lib/data/hooks";
import {
  autoHandledRate,
  escalationCounts,
  rmAgentAgreement,
} from "~/lib/data/metrics";
import {
  formatBps,
  formatDateTime,
  formatPct,
  RULE_LABELS,
} from "~/lib/format";

type LogRow = {
  key: string;
  at: Date;
  actor: "Agent" | "RM";
  borrower: string;
  period: number;
  decision: string;
  detail: string;
  rules: string[];
  txHash: string | null;
  href: string | null;
};

const RM_DECISION_LABEL: Record<string, string> = {
  approve: "Approved step-up",
  hold: "Held",
  request_info: "Requested info",
};

const RULE_DEFINITIONS: { code: string; threshold: string }[] = [
  {
    code: "DATA_MISMATCH",
    threshold: `Sources diverge by more than ${RULE_THRESHOLDS.mismatchPct * 100}%`,
  },
  {
    code: "KPI_BREACH",
    threshold: `Any KPI score below ${RULE_THRESHOLDS.kpiBreachScore}`,
  },
  {
    code: "SHARP_DECLINE",
    threshold: `Score falls ${RULE_THRESHOLDS.sharpDeclinePoints}+ points week-on-week`,
  },
  { code: "DATA_GAP", threshold: "A primary or secondary reading is missing" },
  { code: "STEP_UP", threshold: "Pricing would increase the margin" },
  {
    code: "ANOMALY",
    threshold: `Primary jumps over ${JUMP_THRESHOLD_PCT * 100}% or the agent judges it implausible`,
  },
];

function csvEscape(v: string | number | null) {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function RiskGovernancePage() {
  const runs = useAgentRuns();
  const exceptions = useExceptions();
  const history = useScoreHistory(null);
  const [filter, setFilter] = useState<"all" | "Agent" | "RM">("all");

  const error = runs.error ?? exceptions.error ?? history.error;
  if (error) return <ErrorState error={error} />;
  if (runs.loading || exceptions.loading || history.loading)
    return <LoadingCards />;

  const agreement = rmAgentAgreement(exceptions.data);
  const decided = exceptions.data.filter((e) => e.decision);
  const completed = runs.data.filter((r) => r.status === "complete");
  const failed = runs.data.filter((r) => r.status === "failed");
  const durations = completed
    .map((r) =>
      r.finishedAt && r.startedAt
        ? r.finishedAt.getTime() - r.startedAt.getTime()
        : null,
    )
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);
  const median = durations.length
    ? durations[Math.floor(durations.length / 2)]!
    : null;
  const fired = escalationCounts(history.data);

  const log: LogRow[] = [
    ...completed.map((r) => ({
      key: `run:${r.id}`,
      at: r.finishedAt ?? r.startedAt,
      actor: "Agent" as const,
      borrower: r.borrowerName,
      period: r.period,
      decision: r.result?.decision ?? "—",
      detail: r.result
        ? `Score ${r.result.transitionScore}; ${formatBps(r.result.currentMarginBps)} → proposed ${formatBps(r.result.proposedMarginBps)}`
        : "",
      rules: r.result?.triggeredRules ?? [],
      txHash: r.result?.txHash ?? null,
      href:
        r.result?.decision === "escalate"
          ? `/risk/exceptions/${r.loanId}__p${String(r.period).padStart(2, "0")}`
          : `/risk/loans/${r.loanId}`,
    })),
    ...decided.map((e) => ({
      key: `rm:${e.id}`,
      at: e.decidedAt ?? e.createdAt,
      actor: "RM" as const,
      borrower: e.borrowerName,
      period: e.period,
      decision: RM_DECISION_LABEL[e.decision!] ?? e.decision!,
      detail: [
        e.recommendation
          ? `Agent recommended: ${RECOMMENDATION_LABEL[e.recommendation.action]}`
          : null,
        typeof e.agreedWithAgent === "boolean"
          ? e.agreedWithAgent
            ? "agreed"
            : "overrode"
          : null,
        e.note ? `Note: ${e.note}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      rules: e.codes,
      txHash: e.decisionTxHash ?? null,
      href: `/risk/exceptions/${e.id}`,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  const visible =
    filter === "all" ? log : log.filter((r) => r.actor === filter);

  const byRecommendation = Object.entries(
    decided.reduce<Record<string, { total: number; agreed: number }>>(
      (acc, e) => {
        const key = e.recommendation?.action ?? "none";
        acc[key] ??= { total: 0, agreed: 0 };
        acc[key].total++;
        if (e.agreedWithAgent) acc[key].agreed++;
        return acc;
      },
      {},
    ),
  );

  function exportCsv() {
    const header = [
      "time",
      "actor",
      "borrower",
      "week",
      "decision",
      "rules",
      "detail",
      "tx_hash",
    ];
    const lines = log.map((r) =>
      [
        r.at.toISOString(),
        r.actor,
        r.borrower,
        r.period,
        r.decision,
        r.rules.join(" "),
        r.detail,
        r.txHash,
      ]
        .map(csvEscape)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cadence-decision-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="AI governance"
        description="Can we trust the agent? How often RMs follow or override it, every decision on record, and the rules it runs on."
        actions={
          <Button onClick={exportCsv}>
            <DownloadIcon data-icon="inline-start" />
            Export report (CSV)
          </Button>
        }
      />
      <StatGrid cols={5}>
        <StatCard
          label="RM–agent agreement"
          value={agreement.rate === null ? "—" : formatPct(agreement.rate)}
          hint={`${decided.length} RM decision${decided.length === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Override rate"
          value={agreement.rate === null ? "—" : formatPct(1 - agreement.rate)}
          hint={`${agreement.overridden} overridden`}
        />
        <StatCard
          label="Escalation rate"
          value={formatPct(1 - autoHandledRate(history.data))}
          hint="Loan-weeks routed to a human"
        />
        <StatCard
          label="Agent runs"
          value={`${completed.length}/${runs.data.length}`}
          hint={`${failed.length} failed · safely retried`}
          tone={failed.length ? "bad" : "neutral"}
        />
        <StatCard
          label="Median run time"
          value={median === null ? "—" : `${Math.round(median / 1000)}s`}
          hint={runs.data[0] ? `Model ${runs.data[0].model}` : undefined}
        />
      </StatGrid>

      <Card>
        <CardHeader>
          <CardTitle>Decision log</CardTitle>
          <CardDescription>
            Every agent decision and every RM action, newest first, with its
            on-chain record
          </CardDescription>
          <CardAction>
            <Tabs
              value={filter}
              onValueChange={(v) => setFilter(v as typeof filter)}
            >
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="Agent">Agent</TabsTrigger>
                <TabsTrigger value="RM">RM</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Borrower</TableHead>
                <TableHead>Week</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead>Rules</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>Tx</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-muted-foreground text-center"
                  >
                    No decisions yet.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(r.at)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={r.actor === "RM" ? "default" : "secondary"}
                      >
                        {r.actor}
                      </Badge>
                    </TableCell>
                    <TableCell>{r.borrower}</TableCell>
                    <TableCell>W{r.period}</TableCell>
                    <TableCell>
                      {r.href ? (
                        <Link
                          href={r.href}
                          className="underline-offset-4 hover:underline"
                        >
                          {r.decision}
                        </Link>
                      ) : (
                        r.decision
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.rules.map((c) => (
                          <RuleBadge key={c} code={c} />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-80 whitespace-normal">
                      {r.detail}
                    </TableCell>
                    <TableCell>
                      <OnChainLink hash={r.txHash} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Agreement by recommendation</CardTitle>
            <CardDescription>
              Where RMs follow the agent, and where they don&apos;t
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent recommended</TableHead>
                  <TableHead className="text-right">Cases</TableHead>
                  <TableHead className="text-right">Agreed</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byRecommendation.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-muted-foreground text-center"
                    >
                      No RM decisions yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  byRecommendation.map(([action, v]) => (
                    <TableRow key={action}>
                      <TableCell>
                        {RECOMMENDATION_LABEL[action] ??
                          "No recommendation (seeded)"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {v.total}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {v.agreed}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {action === "none"
                          ? "—"
                          : formatPct(v.agreed / v.total)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Rules in force</CardTitle>
            <CardDescription>
              Deterministic thresholds the agent cannot change. Findings here
              feed rule tuning.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead>Fires when</TableHead>
                  <TableHead className="text-right">Fired</TableHead>
                  <TableHead>Pricing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {RULE_DEFINITIONS.map((r) => (
                  <TableRow key={r.code}>
                    <TableCell className="font-medium">
                      {RULE_LABELS[r.code]}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-normal">
                      {r.threshold}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fired.get(r.code) ?? 0}
                    </TableCell>
                    <TableCell>
                      {PRICING_HOLD_CODES.includes(
                        r.code as (typeof PRICING_HOLD_CODES)[number],
                      )
                        ? "Holds"
                        : r.code === "STEP_UP"
                          ? "Needs RM"
                          : "Prices"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
