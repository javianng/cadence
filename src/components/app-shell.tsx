"use client";

import { LogOutIcon } from "lucide-react";
import { useAuth } from "~/components/auth/auth-provider";
import { RequireAuth } from "~/components/auth/require-auth";
import { CadenceMark } from "~/components/cadence-mark";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { ROLE_META, type Role } from "~/lib/profile";

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
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>
    </RequireAuth>
  );
}

function Header() {
  const { profile, signOut } = useAuth();
  if (!profile) return null;

  return (
    <header className="bg-background border-b">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 md:px-8">
        <div className="flex items-center gap-3">
          <CadenceMark />
          <Badge variant="secondary">{ROLE_META[profile.role].label}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground hidden text-sm sm:inline">
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
