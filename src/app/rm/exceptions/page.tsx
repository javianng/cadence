"use client";

import { sortBySeverity } from "~/components/cadence/exception-review";
import { ExceptionsTable } from "~/components/cadence/loan-sections";
import {
  ErrorState,
  LoadingCards,
  PageHeader,
} from "~/components/cadence/primitives";
import { Card, CardContent } from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useExceptions, useLoans } from "~/lib/data/hooks";

export default function RmExceptionQueuePage() {
  const exceptions = useExceptions();
  const loans = useLoans();
  const error = exceptions.error ?? loans.error;
  if (error) return <ErrorState error={error} />;
  if (exceptions.loading || loans.loading) return <LoadingCards />;

  const pendingByLoan = Object.fromEntries(
    loans.data.map((l) => [l.id, l.pendingAdjustmentBps]),
  );
  const tabs = [
    {
      value: "open",
      label: "Open",
      rows: exceptions.data.filter((e) => e.status === "open"),
    },
    {
      value: "info",
      label: "Awaiting info",
      rows: exceptions.data.filter((e) => e.status === "info_requested"),
    },
    {
      value: "done",
      label: "Resolved",
      rows: exceptions.data.filter(
        (e) => e.status === "resolved" || e.status === "superseded",
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Exception queue"
        description="Sorted by severity: rule weight, a pending step-up, then recency. Every decision is executed on-chain."
      />
      <Tabs defaultValue="open">
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label} ({t.rows.length})
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            <Card>
              <CardContent>
                <ExceptionsTable
                  exceptions={sortBySeverity(t.rows, pendingByLoan)}
                  pendingByLoan={pendingByLoan}
                  hrefFor={(e) => `/rm/exceptions/${e.id}`}
                />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
