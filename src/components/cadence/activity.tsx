"use client";

import {
  BotIcon,
  CircleDotIcon,
  LinkIcon,
  LockIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { OnChainLink } from "~/components/cadence/primitives";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import { Separator } from "~/components/ui/separator";
import { Spinner } from "~/components/ui/spinner";
import type { Loan, LoanEvent } from "~/lib/data/types";
import { formatDate } from "~/lib/format";

const ACTOR_ICON: Record<LoanEvent["actor"], LucideIcon> = {
  agent: BotIcon,
  rm: UserRoundIcon,
  system: LinkIcon,
  borrower: UserRoundIcon,
};

const ACTOR_LABEL: Record<LoanEvent["actor"], string> = {
  agent: "Cadence agent",
  rm: "Relationship manager",
  system: "On-chain",
  borrower: "Borrower",
};

/** Timeline of events, newest first. Internal events are marked for staff. */
export function ActivityFeed({
  events,
  limit,
  showLoan = false,
}: {
  events: LoanEvent[];
  limit?: number;
  showLoan?: boolean;
}) {
  const rows = limit ? events.slice(0, limit) : events;
  if (rows.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No activity yet</EmptyTitle>
          <EmptyDescription>
            Updates appear here after each weekly review.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ol className="flex flex-col">
      {rows.map((e, i) => {
        const Icon = ACTOR_ICON[e.actor] ?? CircleDotIcon;
        return (
          <li key={e.id} className="flex flex-col">
            {i > 0 ? <Separator className="my-3" /> : null}
            <div className="flex gap-3">
              <div className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full">
                <Icon className="size-3.5" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{e.title}</span>
                  {e.visibility === "internal" ? (
                    <Badge variant="outline">
                      <LockIcon data-icon="inline-start" />
                      Internal
                    </Badge>
                  ) : null}
                </div>
                {e.detail ? (
                  <p className="text-muted-foreground">{e.detail}</p>
                ) : null}
                <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                  {showLoan ? <span>{e.borrowerName}</span> : null}
                  <span>
                    {e.period > 0 ? `Week ${e.period}` : "Onboarding"} ·{" "}
                    {ACTOR_LABEL[e.actor]}
                  </span>
                  <span>{formatDate(e.createdAt)}</span>
                  {e.txHash ? <OnChainLink hash={e.txHash} /> : null}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const STALE_RUN_MS = 10 * 60 * 1000;

/** True while an agent run for this loan is in flight (and not stale). */
export function isRunActive(loan: Loan | null | undefined): boolean {
  const started = loan?.activeRun?.startedAt?.getTime();
  return !!loan?.activeRun && (!started || Date.now() - started < STALE_RUN_MS);
}

/** Live "assessment in progress" notice, visible to every persona. */
export function AgentRunBanner({ loan }: { loan: Loan | null | undefined }) {
  if (!loan || !isRunActive(loan)) return null;
  return (
    <Alert>
      <Spinner />
      <AlertTitle>
        Week {loan.activeRun!.period} assessment in progress
      </AlertTitle>
      <AlertDescription>
        Cadence is verifying this week&apos;s sustainability data for{" "}
        {loan.borrowerName}. This page updates automatically when the review
        completes.
      </AlertDescription>
    </Alert>
  );
}
