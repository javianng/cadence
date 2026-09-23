import { AppShell } from "~/components/app-shell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppShell roles={["borrower"]}>{children}</AppShell>;
}
