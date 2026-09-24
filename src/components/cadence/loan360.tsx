"use client";

import { ArrowLeftIcon, LockIcon } from "lucide-react";
import Link from "next/link";
import { ActivityFeed, AgentRunBanner } from "~/components/cadence/activity";
import { sortBySeverity } from "~/components/cadence/exception-review";
import {
  AgentRunsList,
  BandGrid,
  ExceptionsTable,
  KpiDetailCards,
  KpiSummaryTable,
  LoanSummaryCards,
  LoanTrendCharts,
  MessageComposer,
  MessageList,
  PricingHistoryTable,
  useLoanBundle,
  WhatMovedCard,
} from "~/components/cadence/loan-sections";
import {
  ErrorState,
  LoadingCards,
  PageHeader,
  StatusBadge,
} from "~/components/cadence/primitives";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  useAgentRuns,
  useBorrowers,
  useExceptions,
  useMessages,
} from "~/lib/data/hooks";
import { formatSgd } from "~/lib/format";

/**
 * Loan 360: the borrower's dashboard plus internal tabs (agent runs,
 * exceptions, internal activity, messages). RM gets decision links and can
 * message; Risk gets the same page read-only.
 */
export function Loan360({
  loanId,
  mode,
}: {
  loanId: string;
  mode: "rm" | "risk";
}) {
  const { loan, history, kpis, readings, events, loading, error } =
    useLoanBundle(loanId, {
      internal: true,
    });
  const exceptions = useExceptions(loanId);
  const runs = useAgentRuns(loanId);
  const messages = useMessages(loanId);
  const borrowers = useBorrowers();
  const readOnly = mode === "risk";
  const basePath = `/${mode}`;

  const err = error ?? exceptions.error ?? runs.error;
  if (err) return <ErrorState error={err} />;
  if (loading || !loan) return <LoadingCards count={5} />;

  const borrower = borrowers.data.find((b) => b.id === loan.borrowerId);
  const openCount = exceptions.data.filter(
    (e) => e.status === "open" || e.status === "info_requested",
  ).length;
  const sortedExceptions = sortBySeverity(exceptions.data, {
    [loan.id]: loan.pendingAdjustmentBps,
  });

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {loan.borrowerName} <StatusBadge status={loan.status} />
            {readOnly ? (
              <Badge variant="outline">
                <LockIcon data-icon="inline-start" />
                Read-only
              </Badge>
            ) : null}
          </span>
        }
        description={[
          borrower ? `${borrower.industry} · ${borrower.country}` : null,
          `${formatSgd(loan.facilityAmount, { compact: true })} facility`,
          `scenario: ${loan.scenario}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <Button
            variant="outline"
            render={<Link href={basePath} />}
            nativeButton={false}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Portfolio
          </Button>
        }
      />
      <AgentRunBanner loan={loan} />
      <LoanSummaryCards loan={loan} history={history} />

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="kpis">KPIs</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="exceptions">
            Exceptions{openCount ? ` (${openCount})` : ""}
          </TabsTrigger>
          <TabsTrigger value="runs">Agent runs</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="messages">
            Messages{messages.data.length ? ` (${messages.data.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <WhatMovedCard
              loan={loan}
              history={history}
              kpis={kpis}
              events={events}
            />
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>KPI progress · week {loan.currentPeriod}</CardTitle>
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
        </TabsContent>

        <TabsContent value="kpis">
          <KpiDetailCards kpis={kpis} readings={readings} />
        </TabsContent>

        <TabsContent value="pricing" className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Pricing grid</CardTitle>
              <CardDescription>Locked on-chain at mint</CardDescription>
            </CardHeader>
            <CardContent>
              <BandGrid loan={loan} />
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Weekly record</CardTitle>
            </CardHeader>
            <CardContent>
              <PricingHistoryTable history={history} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exceptions">
          <Card>
            <CardHeader>
              <CardTitle>Exceptions</CardTitle>
              <CardDescription>
                {readOnly
                  ? "Read-only: RMs decide cases; Risk reviews the decisions."
                  : "Most severe first. Open a case to review the evidence and decide."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ExceptionsTable
                exceptions={sortedExceptions}
                pendingByLoan={{ [loan.id]: loan.pendingAdjustmentBps }}
                hrefFor={(e) => `${basePath}/exceptions/${e.id}`}
                showBorrower={false}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs">
          <Card>
            <CardHeader>
              <CardTitle>Agent runs</CardTitle>
              <CardDescription>
                Full trace of every step, including the agent&apos;s reasoning
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AgentRunsList runs={runs.data} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <CardDescription>
                Borrower-visible and internal events
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityFeed events={events} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages">
          <Card>
            <CardHeader>
              <CardTitle>Messages</CardTitle>
              <CardDescription>
                {readOnly
                  ? "Read-only"
                  : `Conversation with ${loan.borrowerName}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <MessageList messages={messages.data} />
              {!readOnly ? (
                <MessageComposer
                  loanId={loan.id}
                  placeholder={`Reply to ${loan.borrowerName}…`}
                />
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
