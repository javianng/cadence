import { DashboardPlaceholder } from "~/components/dashboard-placeholder";
import { ROLE_META } from "~/lib/roles";

export default function RmPage() {
  return (
    <DashboardPlaceholder
      title="My book"
      question={ROLE_META.rm.question}
      metrics={[
        "Loans in book",
        "Open exceptions",
        "Average book score",
        "Margin passed to clients",
        "Handled automatically",
      ]}
    />
  );
}
