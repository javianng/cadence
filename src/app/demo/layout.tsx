import { type Metadata } from "next";
import { AppShell } from "~/components/app-shell";

/** Hidden presenter page: any signed-in persona can trigger agent runs. */
export const metadata: Metadata = {
  title: { default: "Presenter", template: "%s · Presenter · Cadence" },
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppShell roles={["borrower", "rm", "risk"]}>{children}</AppShell>;
}
