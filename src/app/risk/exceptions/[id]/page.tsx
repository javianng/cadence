"use client";

import { useParams } from "next/navigation";
import { ExceptionReview } from "~/components/cadence/exception-review";

export default function RiskExceptionPage() {
  const { id } = useParams<{ id: string }>();
  return <ExceptionReview id={id} readOnly basePath="/risk" />;
}
