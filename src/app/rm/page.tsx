"use client";

import Link from "next/link";
import { StatusDonut, ScoreTrendChart } from "~/components/cadence/charts";
import { sortBySeverity } from "~/components/cadence/exception-review";
import { ExceptionsTable } from "~/components/cadence/loan-sections";
import {
  groupHistory,
  isOpen,
  LoanBookTable,
  statusCounts,
} from "~/components/cadence/portfolio";
import {
  ErrorState,
  LoadingCards,
  PageHeader,
  StatCard,
  StatGrid,
} from "~/components/cadence/primitives";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { useExceptions, useLoans, useScoreHistory } from "~/lib/data/hooks";
import {
  annualRunRate,
  autoHandledRate,
  portfolioScore,
} from "~/lib/data/metrics";
import { formatPct, formatSgd } from "~/lib/format";
import { ROLE_META } from "~/lib/roles";

export default function RmPortfolioPage() {
  const loans = useLoans();
  const history = useScoreHistory(null);
  const exceptions = useExceptions();

  const error = loans.error ?? history.error ?? exceptions.error;
  if (error) return <ErrorState error={error} />;
  if (loans.loading || history.loading || exceptions.loading)
    return <LoadingCards count={5} />;

  const book = loans.data;
  const open = exceptions.data.filter(isOpen);
  const awaitingDecision = open.filter((e) => e.status === "open");
  const byLoan = groupHistory(history.data);
  const passed = book.reduce(
    (s, l) =>
      s + annualRunRate(l.baseMarginBps, l.currentMarginBps, l.facilityAmount),
    0,
  );
  const avgBpsVsBase =
    book.length > 0
      ? book.reduce((s, l) => s + (l.baseMarginBps - l.currentMarginBps), 0) /
        book.length
      : 0;
  const pendingByLoan = Object.fromEntries(
    book.map((l) => [l.id, l.pendingAdjustmentBps]),
  );
  const queue = sortBySeverity(awaitingDecision, pendingByLoan).slice(0, 4);

  return (
    <>
      <PageHeader title="My book" description={ROLE_META.rm.question} />
      <StatGrid cols={5}>
        <StatCard
          label="Loans in book"
          value={book.length}
          hint={`${formatSgd(
            book.reduce((s, l) => s + l.facilityAmount, 0),
            { compact: true },
          )} committed`}
        />
        <StatCard
          label="Open exceptions"
          value={open.length}
          hint={`${awaitingDecision.length} awaiting your decision`}
          tone={awaitingDecision.length > 0 ? "bad" : "neutral"}
        />
        <StatCard
          label="Average book score"
          value={Math.round(portfolioScore(book))}
          hint="Facility-weighted · 70 = on track"
        />
        <StatCard
          label="Margin passed to clients"
          value={formatSgd(passed, { compact: true })}
          hint={`per year · avg ${(avgBpsVsBase / 100).toFixed(2)}% below base`}
          tone={passed > 0 ? "good" : "neutral"}
        />
        <StatCard
          label="Handled automatically"
          value={formatPct(autoHandledRate(history.data))}
          hint={`of ${history.data.length} loan-weeks needed no human`}
        />
      </StatGrid>

      <Card>
        <CardHeader>
          <CardTitle>Needs you now</CardTitle>
          <CardDescription>Most severe open cases first</CardDescription>
          <CardAction>
            <Button
              size="sm"
              render={<Link href="/rm/exceptions" />}
              nativeButton={false}
            >
              Open queue
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <ExceptionsTable
            exceptions={queue}
            pendingByLoan={pendingByLoan}
            hrefFor={(e) => `/rm/exceptions/${e.id}`}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Transition score by client</CardTitle>
            <CardDescription>
              Weekly · 70 = on the agreed glide path
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScoreTrendChart
              series={book.map((l) => ({
                id: l.id,
                label: l.borrowerName,
                points: (byLoan[l.id] ?? []).map((h) => ({
                  period: h.period,
                  score: h.transitionScore,
                })),
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Book status</CardTitle>
            <CardDescription>Loans by current status</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <StatusDonut counts={statusCounts(book)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Clients</CardTitle>
        </CardHeader>
        <CardContent>
          <LoanBookTable
            loans={book}
            exceptions={exceptions.data}
            basePath="/rm"
          />
        </CardContent>
      </Card>
    </>
  );
}
