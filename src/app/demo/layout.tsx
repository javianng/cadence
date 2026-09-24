import { AppShell } from "~/components/app-shell";

/** Hidden presenter page: any signed-in persona can trigger agent runs. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppShell roles={["borrower", "rm", "risk"]}>{children}</AppShell>;
}
