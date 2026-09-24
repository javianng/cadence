import { AppShell } from "~/components/app-shell";
import { BorrowerLoanProvider } from "~/components/cadence/borrower-loan";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell roles={["borrower"]}>
      <BorrowerLoanProvider>{children}</BorrowerLoanProvider>
    </AppShell>
  );
}
