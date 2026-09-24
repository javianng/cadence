"use client";

import {
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "~/components/auth/auth-provider";
import { Button } from "~/components/ui/button";
import { ROLE_META, type Role } from "~/lib/roles";
import { cn } from "~/lib/utils";

/**
 * Brand-red CTA label: OCBC red vs off-white is 3.8:1, so red buttons use
 * large bold text (WCAG "large text", 3:1 minimum).
 */
export const RED_BUTTON = "h-11 px-5 text-[1.1667rem] font-bold";

/** Hero CTA: smooth-scrolls to the persona grid (no navigation). */
export function ScrollToButton({
  targetId,
  children,
}: {
  targetId: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      size="lg"
      className={RED_BUTTON}
      onClick={() =>
        document
          .getElementById(targetId)
          ?.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    >
      {children}
      <ArrowRightIcon data-icon="inline-end" />
    </Button>
  );
}

export function CopyAddressButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={copied ? "Copied" : "Copy contract address"}
      onClick={() => {
        void navigator.clipboard.writeText(address).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}

/** Top-right header action: sign in, or jump to your own dashboard. */
export function HeaderAuthAction() {
  const { user, profile, loading } = useAuth();
  if (loading) return null;
  if (user && profile) {
    return (
      <Button
        variant="outline"
        render={<Link href={ROLE_META[profile.role].home} />}
        nativeButton={false}
      >
        Open dashboard
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      render={<Link href="/login" />}
      nativeButton={false}
    >
      Sign in
    </Button>
  );
}

/**
 * "See how it decides" only for staff who can actually open agent traces;
 * signed-out visitors are never sent into a gated page.
 */
export function AgentTraceLink({ className }: { className?: string }) {
  const { profile } = useAuth();
  const href =
    profile?.role === "risk"
      ? "/risk/governance"
      : profile?.role === "rm"
        ? "/rm/exceptions"
        : null;
  if (!href) return null;
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1 text-(--brand-red-text) underline-offset-4 hover:underline",
        className,
      )}
    >
      See how it decides <ArrowRightIcon className="size-3.5" />
    </Link>
  );
}

/**
 * Persona card button. /login has no redirect parameter — every account
 * lands on its own role's dashboard after sign-in — so signed-out visitors
 * go to /login and signed-in visitors go straight to their dashboard.
 */
export function PersonaButton({ role }: { role: Role }) {
  const { user, profile, loading } = useAuth();
  if (loading) {
    return (
      <Button className={RED_BUTTON} disabled>
        Enter
      </Button>
    );
  }
  if (!user || !profile) {
    return (
      <Button
        className={RED_BUTTON}
        render={<Link href="/login" />}
        nativeButton={false}
      >
        Sign in
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
    );
  }
  if (profile.role === role) {
    return (
      <Button
        className={RED_BUTTON}
        render={<Link href={ROLE_META[role].home} />}
        nativeButton={false}
      >
        Open dashboard
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      render={<Link href={ROLE_META[profile.role].home} />}
      nativeButton={false}
    >
      You&apos;re signed in as {ROLE_META[profile.role].label}
    </Button>
  );
}

export function ExternalTextLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 underline-offset-4 transition-colors hover:underline",
        className,
      )}
    >
      {children}
      <ExternalLinkIcon className="size-3.5 text-(--brand-red-text)" />
    </a>
  );
}
