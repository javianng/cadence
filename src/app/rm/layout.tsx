import { type Metadata } from "next";
import { AppShell } from "~/components/app-shell";

export const metadata: Metadata = {
  title: {
    default: "Relationship Manager",
    template: "%s · Relationship Manager · Cadence",
  },
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppShell roles={["rm"]}>{children}</AppShell>;
}
