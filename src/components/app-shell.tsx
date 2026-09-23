"use client";

import { LogOutIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "~/components/auth/auth-provider";
import { RequireAuth } from "~/components/auth/require-auth";
import { CadenceMark } from "~/components/cadence-mark";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { ROLE_META, type Role } from "~/lib/profile";
import { cn } from "~/lib/utils";

const NAV: Record<Role, { href: string; label: string }[]> = {
  borrower: [
    { href: "/borrower", label: "Overview" },
    { href: "/borrower/kpis", label: "KPIs" },
    { href: "/borrower/pricing", label: "Pricing" },
    { href: "/borrower/what-if", label: "What-if" },
  ],
  rm: [
    { href: "/rm", label: "Portfolio" },
    { href: "/rm/exceptions", label: "Exceptions" },
  ],
  risk: [
    { href: "/risk", label: "Portfolio" },
    { href: "/risk/governance", label: "AI governance" },
  ],
};

/** Guarded layout shared by the role dashboards (/borrower, /rm, /risk). */
export function AppShell({
  roles,
  children,
}: {
  roles: Role[];
  children: React.ReactNode;
}) {
  return (
    <RequireAuth roles={roles}>
      <div className="bg-muted/40 flex min-h-svh flex-col">
        <Header />
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-8">
          {children}
        </main>
      </div>
    </RequireAuth>
  );
}

function Header() {
  const { profile, signOut } = useAuth();
  const pathname = usePathname();
  if (!profile) return null;
  const nav = NAV[profile.role];
  // The most specific matching nav entry is active.
  const active = nav
    .filter((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <header className="bg-background border-b">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-4 md:px-8">
        <Link
          href={ROLE_META[profile.role].home}
          className="flex items-center gap-3"
        >
          <CadenceMark />
          <Badge variant="secondary">{ROLE_META[profile.role].label}</Badge>
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {nav.map((n) => (
            <Button
              key={n.href}
              size="sm"
              variant="ghost"
              render={<Link href={n.href} />}
              nativeButton={false}
              className={cn(active === n.href && "bg-muted text-foreground")}
            >
              {n.label}
            </Button>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground hidden text-sm lg:inline">
            {profile.fullName}
          </span>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOutIcon data-icon="inline-start" />
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
