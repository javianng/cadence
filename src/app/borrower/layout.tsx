import { type Metadata } from "next";
import { AppShell } from "~/components/app-shell";
import { BorrowerLoanProvider } from "~/components/cadence/borrower-loan";

export const metadata: Metadata = {
  title: { default: "Borrower", template: "%s · Borrower · Cadence" },
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell roles={["borrower"]}>
      <BorrowerLoanProvider>{children}</BorrowerLoanProvider>
    </AppShell>
  );
}
