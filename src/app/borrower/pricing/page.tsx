"use client";

import { FacilitySwitcher } from "~/components/cadence/borrower-loan";
import { useBorrowerBundle } from "~/components/cadence/borrower-parts";
import {
  BandGrid,
  LoanTrendCharts,
  PricingHistoryTable,
} from "~/components/cadence/loan-sections";
import {
  ErrorState,
  LoadingCards,
  PageHeader,
} from "~/components/cadence/primitives";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { formatBps } from "~/lib/format";

export default function BorrowerPricingPage() {
  const { loan, history, loading, error } = useBorrowerBundle();
  if (error) return <ErrorState error={error} />;
  if (loading || !loan) return <LoadingCards />;
  return (
    <>
      <PageHeader
        title="Pricing history"
        description={`${loan.borrowerName} · every weekly repricing, with its on-chain record`}
        actions={<FacilitySwitcher />}
      />
      <LoanTrendCharts loan={loan} history={history} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Pricing grid</CardTitle>
            <CardDescription>
              Locked on-chain at signing. Moves at most{" "}
              {formatBps(loan.maxStepBps)} per week, between{" "}
              {formatBps(loan.floorBps)} and {formatBps(loan.capBps)}. Decreases
              apply automatically; increases need your RM&apos;s approval.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BandGrid loan={loan} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Weekly record</CardTitle>
            <CardDescription>
              Earlier weeks are stored off-chain; weeks that changed your
              margin, and the most recent weeks, are anchored on Polygon.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PricingHistoryTable history={history} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
