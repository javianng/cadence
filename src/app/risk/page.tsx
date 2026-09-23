import { DashboardPlaceholder } from "~/components/dashboard-placeholder";
import { ROLE_META } from "~/lib/roles";

export default function RiskPage() {
  return (
    <DashboardPlaceholder
      title="Portfolio"
      question={ROLE_META.risk.question}
      metrics={[
        "Portfolio score",
        "Loans on watch",
        "Early-detection lead time",
        "Escalation rate",
        "RM–agent agreement",
      ]}
    />
  );
}
