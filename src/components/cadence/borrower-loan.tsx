"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  NativeSelect,
  NativeSelectOption,
} from "~/components/ui/native-select";
import { useLoans, type Live } from "~/lib/data/hooks";
import type { Loan } from "~/lib/data/types";

const STORAGE_KEY = "cadence.borrower.loanId";

type BorrowerLoanState = {
  loans: Live<Loan[]>;
  loan: Loan | null;
  setLoanId: (id: string) => void;
};

const BorrowerLoanContext = createContext<BorrowerLoanState | null>(null);

/**
 * The borrower's selected facility. A borrower may hold several facilities;
 * each page shows one at a time. The choice is remembered per browser.
 */
export function BorrowerLoanProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const loans = useLoans();
  const [loanId, setLoanIdState] = useState<string | null>(null);

  useEffect(() => {
    try {
      setLoanIdState(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      // storage unavailable (private mode) — fall back to the first loan
    }
  }, []);

  const setLoanId = (id: string) => {
    setLoanIdState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
  };

  const loan = loans.data.find((l) => l.id === loanId) ?? loans.data[0] ?? null;

  return (
    <BorrowerLoanContext.Provider value={{ loans, loan, setLoanId }}>
      {children}
    </BorrowerLoanContext.Provider>
  );
}

export function useBorrowerLoan(): BorrowerLoanState {
  const ctx = useContext(BorrowerLoanContext);
  if (!ctx)
    throw new Error(
      "useBorrowerLoan must be used inside <BorrowerLoanProvider>",
    );
  return ctx;
}

export function FacilitySwitcher() {
  const { loans, loan, setLoanId } = useBorrowerLoan();
  if (loans.data.length < 2 || !loan) return null;
  return (
    <NativeSelect
      aria-label="Facility"
      value={loan.id}
      onChange={(e) => setLoanId(e.target.value)}
    >
      {loans.data.map((l) => (
        <NativeSelectOption key={l.id} value={l.id}>
          {l.borrowerName}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
