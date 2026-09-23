"use client";

import { FacilitySwitcher } from "~/components/cadence/borrower-loan";
import { useBorrowerBundle } from "~/components/cadence/borrower-parts";
import { KpiDetailCards } from "~/components/cadence/loan-sections";
import {
  ErrorState,
  LoadingCards,
  PageHeader,
} from "~/components/cadence/primitives";

export default function BorrowerKpisPage() {
  const { loan, kpis, readings, loading, error } = useBorrowerBundle();
  if (error) return <ErrorState error={error} />;
  if (loading || !loan) return <LoadingCards />;
  return (
    <>
      <PageHeader
        title="KPI detail"
        description={`${loan.borrowerName} · each KPI against its glide path. "Independent" is the second data source used to check what you report; where they differ by more than 5%, the more conservative value is used.`}
        actions={<FacilitySwitcher />}
      />
      <KpiDetailCards kpis={kpis} readings={readings} />
    </>
  );
}
