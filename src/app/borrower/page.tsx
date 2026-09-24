"use client";

import { CalculatorIcon } from "lucide-react";
import Link from "next/link";
import { AgentRunBanner, ActivityFeed } from "~/components/cadence/activity";
import { FacilitySwitcher } from "~/components/cadence/borrower-loan";
import {
  MessageRmDialog,
  UnderReviewAlert,
  useBorrowerBundle,
} from "~/components/cadence/borrower-parts";
import {
  KpiSummaryTable,
  LatestUpdateAlert,
  LoanSummaryCards,
  LoanTrendCharts,
  WhatMovedCard,
} from "~/components/cadence/loan-sections";
import {
  ErrorState,
  LoadingCards,
  PageHeader,
  StatusBadge,
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import { ROLE_META } from "~/lib/roles";

export default function BorrowerOverviewPage() {
  const { loan, history, kpis, readings, events, loading, error, noLoans } =
    useBorrowerBundle();

  if (error) return <ErrorState error={error} />;
  if (noLoans) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No facilities yet</EmptyTitle>
          <EmptyDescription>
            Your sustainability-linked facilities appear here once your bank
            sets them up.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  if (loading || !loan) return <LoadingCards count={5} />;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {loan.borrowerName} <StatusBadge status={loan.status} />
          </span>
        }
        description={ROLE_META.borrower.question}
        actions={
          <>
            <FacilitySwitcher />
            <MessageRmDialog loan={loan} />
            <Button
              render={<Link href="/borrower/what-if" />}
              nativeButton={false}
            >
              <CalculatorIcon data-icon="inline-start" />
              What-if
            </Button>
          </>
        }
      />
      <AgentRunBanner loan={loan} />
      <UnderReviewAlert loan={loan} />
      <LatestUpdateAlert loan={loan} events={events} />
      <LoanSummaryCards loan={loan} history={history} />
      <div className="grid gap-4 lg:grid-cols-3">
        <WhatMovedCard
          loan={loan}
          history={history}
          kpis={kpis}
          events={events}
        />
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>KPI progress</CardTitle>
            <CardDescription>
              This week against your agreed glide path
            </CardDescription>
            <CardAction>
              <Button
                size="sm"
                variant="outline"
                render={<Link href="/borrower/kpis" />}
                nativeButton={false}
              >
                KPI detail
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <KpiSummaryTable
              kpis={kpis}
              readings={readings}
              period={loan.currentPeriod}
            />
          </CardContent>
        </Card>
      </div>
      <LoanTrendCharts loan={loan} history={history} />
      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>
            Weekly reviews, rate changes and on-chain records
          </CardDescription>
          <CardAction>
            <Button
              size="sm"
              variant="outline"
              render={<Link href="/borrower/pricing" />}
              nativeButton={false}
            >
              Pricing history
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <ActivityFeed events={events} limit={8} />
        </CardContent>
      </Card>
    </>
  );
}
