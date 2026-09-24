"use client";

import { useParams } from "next/navigation";
import { Loan360 } from "~/components/cadence/loan360";

export default function RiskLoanPage() {
  const { loanId } = useParams<{ loanId: string }>();
  return <Loan360 loanId={loanId} mode="risk" />;
}
