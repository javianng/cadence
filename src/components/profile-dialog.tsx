"use client";

import type { User } from "firebase/auth";
import { useAuth } from "~/components/auth/auth-provider";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Separator } from "~/components/ui/separator";
import { formatDate } from "~/lib/format";
import { ROLE_META } from "~/lib/roles";
import { cn } from "~/lib/utils";

export function initials(
  name: string | null | undefined,
  email?: string | null,
) {
  // Empty strings fall through to the next source.
  const source = [name?.trim(), email?.split("@")[0], "?"].find((v) => !!v)!;
  const parts = source.split(/\s+/).filter(Boolean);
  return (
    parts.length > 1 ? `${parts[0]![0]}${parts.at(-1)![0]}` : source.slice(0, 2)
  ).toUpperCase();
}

/** Google photo when available, initials otherwise. */
export function UserAvatar({
  user,
  name,
  className,
}: {
  user: User;
  name: string | null | undefined;
  className?: string;
}) {
  return (
    <Avatar className={cn("rounded-lg", className)}>
      {user.photoURL ? (
        <AvatarImage src={user.photoURL} alt={name ?? ""} />
      ) : null}
      <AvatarFallback className="rounded-lg">
        {initials(name, user.email)}
      </AvatarFallback>
    </Avatar>
  );
}

function signInMethod(user: User): string {
  const ids = user.providerData.map((p) => p.providerId);
  if (ids.includes("google.com")) return "Google";
  if (ids.includes("password")) return "Email & password";
  return ids[0] ?? "—";
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium break-all">
        {value === null || value === undefined || value === "" ? "—" : value}
      </span>
    </div>
  );
}

/** Read-only view of the signed-in user's own account and profile. */
export function ProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, profile } = useAuth();
  if (!user || !profile) return null;
  const created = user.metadata.creationTime
    ? new Date(user.metadata.creationTime)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>My profile</DialogTitle>
          <DialogDescription>Your Cadence account details.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3">
          <UserAvatar user={user} name={profile.fullName} className="size-12" />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-sm font-medium">
              {profile.fullName}
            </span>
            <Badge variant="secondary">{ROLE_META[profile.role].label}</Badge>
          </div>
        </div>
        <Separator />
        <div className="flex flex-col gap-3">
          <Row label="Email (login)" value={user.email} />
          <Row label="Sign-in method" value={signInMethod(user)} />
          <Row
            label="Email verified"
            value={user.emailVerified ? "Yes" : "No"}
          />
          <Row label="Member since" value={formatDate(created)} />
        </div>
        <Separator />
        <div className="flex flex-col gap-3">
          <Row label="Organisation" value={profile.organisation} />
          <Row label="Job title" value={profile.jobTitle} />
          {profile.role === "borrower" ? (
            <Row label="Industry" value={profile.industry} />
          ) : null}
          <Row label="Country" value={profile.country} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
