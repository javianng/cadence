"use client";

import {
  EscalationsByRuleChart,
  KpiDriftHeatmap,
  ScoreHistogram,
  StatusDonut,
  type HeatmapRow,
} from "~/components/cadence/charts";
import {
  groupHistory,
  LoanBookTable,
  statusCounts,
} from "~/components/cadence/portfolio";
import {
  ErrorState,
  LoadingCards,
  PageHeader,
  StatCard,
  StatGrid,
  StatusBadge,
} from "~/components/cadence/primitives";
import {
  Card,
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
import {
  useBorrowers,
  useExceptions,
  useKpis,
  useLoans,
  useReadings,
  useScoreHistory,
} from "~/lib/data/hooks";
import {
  ANNUAL_RESET_PERIOD,
  autoHandledRate,
  earlyDetectionLeadWeeks,
  escalationCounts,
  portfolioScore,
  rmAgentAgreement,
} from "~/lib/data/metrics";
import { formatPct, formatSgd } from "~/lib/format";
import { ROLE_META } from "~/lib/roles";

export default function RiskPortfolioPage() {
  const loans = useLoans();
  const history = useScoreHistory(null);
  const exceptions = useExceptions();
  const readings = useReadings(null);
  const kpis = useKpis(null);
  const borrowers = useBorrowers();

  const all = [loans, history, exceptions, readings, kpis, borrowers];
  const error = all.find((x) => x.error)?.error;
  if (error) return <ErrorState error={error} />;
  if (all.some((x) => x.loading)) return <LoadingCards count={5} />;

  const book = loans.data;
  const byLoan = groupHistory(history.data);
  const onWatch = book.filter((l) => l.status !== "on_track");
  const lead = earlyDetectionLeadWeeks(Object.values(byLoan));
  const agreement = rmAgentAgreement(exceptions.data);
  const periods = [...new Set(history.data.map((h) => h.period))].sort(
    (a, b) => a - b,
  );

  const heatRows: HeatmapRow[] = book.flatMap((l) =>
    kpis.data
      .filter((k) => k.loanId === l.id)
      .map((k) => ({
        key: `${l.id}:${k.kpiId}`,
        label: k.name,
        sublabel: l.borrowerName,
        cells: readings.data
          .filter((r) => r.loanId === l.id && r.kpiId === k.kpiId)
          .map((r) => ({ period: r.period, score: r.score })),
      })),
  );

  const sectors = [...new Set(borrowers.data.map((b) => b.industry))].map(
    (industry) => {
      const ids = borrowers.data
        .filter((b) => b.industry === industry)
        .map((b) => b.id);
      const inSector = book.filter((l) => ids.includes(l.borrowerId));
      return { industry, loans: inSector };
    },
  );

  return (
    <>
      <PageHeader
        title="Portfolio oversight"
        description={ROLE_META.risk.question}
      />
      <StatGrid cols={5}>
        <StatCard
          label="Portfolio score"
          value={Math.round(portfolioScore(book))}
          hint={`Facility-weighted across ${book.length} loans`}
        />
        <StatCard
          label="Loans on watch"
          value={onWatch.length}
          hint={`${formatSgd(
            onWatch.reduce((s, l) => s + l.facilityAmount, 0),
            { compact: true },
          )} exposure`}
          tone={onWatch.length ? "bad" : "neutral"}
        />
        <StatCard
          label="Early-detection lead time"
          value={lead === null ? "—" : `${Math.round(lead)} wks`}
          hint={`Flagged this far ahead of the annual review (week ${ANNUAL_RESET_PERIOD})`}
          tone="good"
        />
        <StatCard
          label="Escalation rate"
          value={formatPct(1 - autoHandledRate(history.data))}
          hint={`of ${history.data.length} loan-weeks went to a human`}
        />
        <StatCard
          label="RM–agent agreement"
          value={agreement.rate === null ? "—" : formatPct(agreement.rate)}
          hint={`${agreement.agreed} agreed · ${agreement.overridden} overridden`}
        />
      </StatGrid>

      <Card>
        <CardHeader>
          <CardTitle>KPI drift heatmap</CardTitle>
          <CardDescription>
            Every KPI, every week. Spot systemic patterns: a whole row reddening
            is drift; a column is a portfolio-wide event.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KpiDriftHeatmap rows={heatRows} periods={periods} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Score distribution</CardTitle>
            <CardDescription>All loan-weeks, 10-point bins</CardDescription>
          </CardHeader>
          <CardContent>
            <ScoreHistogram
              scores={history.data.map((h) => h.transitionScore)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Escalations by rule</CardTitle>
            <CardDescription>Across all loan-weeks</CardDescription>
          </CardHeader>
          <CardContent>
            <EscalationsByRuleChart counts={escalationCounts(history.data)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
            <CardDescription>Loans by current status</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <StatusDonut counts={statusCounts(book)} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sector breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sector</TableHead>
                  <TableHead className="text-right">Exposure</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sectors.map((s) => (
                  <TableRow key={s.industry}>
                    <TableCell className="font-medium">{s.industry}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatSgd(
                        s.loans.reduce((a, l) => a + l.facilityAmount, 0),
                        { compact: true },
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Math.round(portfolioScore(s.loans))}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {s.loans.map((l) => (
                          <StatusBadge key={l.id} status={l.status} />
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Watch list</CardTitle>
            <CardDescription>
              Read-only drill-down into any loan
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoanBookTable
              loans={onWatch}
              exceptions={exceptions.data}
              basePath="/risk"
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
