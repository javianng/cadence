"use client";

import { InfoIcon, MessageSquareIcon } from "lucide-react";
import { useBorrowerLoan } from "~/components/cadence/borrower-loan";
import {
  MessageComposer,
  MessageList,
  useLoanBundle,
} from "~/components/cadence/loan-sections";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useMessages } from "~/lib/data/hooks";
import type { Loan } from "~/lib/data/types";

/** The borrower's selected facility plus all its live data. */
export function useBorrowerBundle() {
  const { loans, loan } = useBorrowerLoan();
  const bundle = useLoanBundle(loan?.id ?? null);
  return {
    ...bundle,
    loan: bundle.loan ?? loan,
    loading: loans.loading || (loan !== null && bundle.loading),
    error: loans.error ?? bundle.error,
    noLoans: !loans.loading && loans.data.length === 0,
  };
}

/**
 * Flow step 5: a neutral notice when this period is flagged. Borrowers never
 * see rule codes, the RM brief or the agent's recommendation.
 */
export function UnderReviewAlert({ loan }: { loan: Loan }) {
  if (loan.status !== "under_review" && loan.pendingAdjustmentBps <= 0)
    return null;
  return (
    <Alert>
      <InfoIcon />
      <AlertTitle>This week is being reviewed</AlertTitle>
      <AlertDescription>
        Your relationship manager is looking at this week&apos;s results and
        will follow up with you. Your rate won&apos;t go up unless they confirm
        it.
      </AlertDescription>
    </Alert>
  );
}

/** Flow step 6: ask, never act. */
export function MessageRmDialog({ loan }: { loan: Loan }) {
  const messages = useMessages(loan.id);
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>
        <MessageSquareIcon data-icon="inline-start" />
        Message your RM
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Message your relationship manager</DialogTitle>
          <DialogDescription>
            About your {loan.borrowerName} facility. Your RM sees this on their
            dashboard.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-72">
          <MessageList messages={messages.data} />
        </ScrollArea>
        <MessageComposer
          loanId={loan.id}
          placeholder="Ask about your rate, KPIs or this week's review…"
        />
      </DialogContent>
    </Dialog>
  );
}
