"use client";

import Link from "next/link";
import { StatusBadge } from "~/components/cadence/primitives";
import { isRunActive } from "~/components/cadence/activity";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import type {
  Loan,
  LoanException,
  LoanStatus,
  ScoreHistory,
} from "~/lib/data/types";
import { formatBps, formatBpsDelta, formatSgd } from "~/lib/format";

export const isOpen = (e: LoanException) =>
  e.status === "open" || e.status === "info_requested";

export function statusCounts(loans: Loan[]): Record<LoanStatus, number> {
  const counts: Record<LoanStatus, number> = {
    on_track: 0,
    watch: 0,
    under_review: 0,
  };
  for (const l of loans) counts[l.status] = (counts[l.status] ?? 0) + 1;
  return counts;
}

export function groupHistory(
  history: ScoreHistory[],
): Record<string, ScoreHistory[]> {
  const out: Record<string, ScoreHistory[]> = {};
  for (const h of history) (out[h.loanId] ??= []).push(h);
  return out;
}

/** Portfolio table: one row per loan, linking to Loan 360. */
export function LoanBookTable({
  loans,
  exceptions,
  basePath,
}: {
  loans: Loan[];
  exceptions: LoanException[];
  basePath: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Borrower</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Facility</TableHead>
          <TableHead className="text-right">Score</TableHead>
          <TableHead className="text-right">Margin</TableHead>
          <TableHead className="text-right">vs base</TableHead>
          <TableHead className="text-right">Open cases</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {loans.map((l) => {
          const open = exceptions.filter(
            (e) => e.loanId === l.id && isOpen(e),
          ).length;
          return (
            <TableRow key={l.id}>
              <TableCell className="font-medium">
                <span className="flex items-center gap-2">
                  {l.borrowerName}
                  {isRunActive(l) ? (
                    <Spinner aria-label="Agent run in progress" />
                  ) : null}
                </span>
              </TableCell>
              <TableCell>
                <StatusBadge status={l.status} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatSgd(l.facilityAmount, { compact: true })}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {l.currentScore}
                {typeof l.scoreDelta === "number" && l.scoreDelta !== 0 ? (
                  <span className="text-muted-foreground">
                    {" "}
                    ({l.scoreDelta > 0 ? "+" : ""}
                    {l.scoreDelta})
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatBps(l.currentMarginBps)}
                {l.pendingAdjustmentBps > 0 ? (
                  <span className="text-muted-foreground">
                    {" "}
                    {formatBpsDelta(l.pendingAdjustmentBps)} pending
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatBpsDelta(l.currentMarginBps - l.baseMarginBps)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{open}</TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link href={`${basePath}/loans/${l.id}`} />}
                  nativeButton={false}
                >
                  Loan 360
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
