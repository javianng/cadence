"use client";

import { useParams } from "next/navigation";
import { ExceptionReview } from "~/components/cadence/exception-review";

export default function RmExceptionPage() {
  const { id } = useParams<{ id: string }>();
  return <ExceptionReview id={id} readOnly={false} basePath="/rm" />;
}
