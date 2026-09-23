import { DashboardPlaceholder } from "~/components/dashboard-placeholder";
import { ROLE_META } from "~/lib/roles";

export default function BorrowerPage() {
  return (
    <DashboardPlaceholder
      title="My facility"
      question={ROLE_META.borrower.question}
      metrics={[
        "Transition score",
        "Current margin",
        "Savings vs annual model",
        "Next assessment",
        "On-chain record",
      ]}
    />
  );
}
