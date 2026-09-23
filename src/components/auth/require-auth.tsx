"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "~/components/auth/auth-provider";
import { ROLE_META, routeAfterAuth, type Role } from "~/lib/profile";

/**
 * Client-side route guard. This is UX only — data access must be enforced by
 * Firestore rules / server routes.
 *
 * - No user → /login
 * - `roles` given and no profile → /onboarding
 * - `roles` given and the user's role isn't allowed → their own role home
 */
export function RequireAuth({
  roles,
  children,
}: {
  roles?: Role[];
  children: React.ReactNode;
}) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  const redirect = (() => {
    if (loading) return null;
    if (!user) return "/login";
    if (!roles) return null;
    if (!profile) return "/onboarding";
    if (!roles.includes(profile.role)) return ROLE_META[profile.role].home;
    return null;
  })();

  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  if (loading || redirect) return <FullPageSpinner />;
  return <>{children}</>;
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Loader2Icon className="text-muted-foreground size-5 animate-spin" />
    </div>
  );
}

/** For /login and /signup: signed-in users are sent on to onboarding or their role home. */
export function GuestOnly({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const redirect = !loading && user ? routeAfterAuth(profile) : null;

  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  if (loading || redirect) return <FullPageSpinner />;
  return <>{children}</>;
}
