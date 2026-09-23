import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  EyeIcon,
  ExternalLinkIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import type { LoanStatus } from "~/lib/data/types";
import { RULE_LABELS, shortHash, STATUS_LABELS, txUrl } from "~/lib/format";

const STATUS_META: Record<LoanStatus, { icon: LucideIcon; tone: string }> = {
  on_track: { icon: CheckCircle2Icon, tone: "text-status-good" },
  watch: { icon: EyeIcon, tone: "text-status-warning" },
  under_review: { icon: AlertTriangleIcon, tone: "text-status-critical" },
};

/** Status never relies on colour alone: icon + label, colour on the icon. */
export function StatusBadge({ status }: { status: LoanStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.on_track;
  const Icon = meta.icon;
  return (
    <Badge variant="outline">
      <Icon data-icon="inline-start" className={meta.tone} />
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function RuleBadge({ code }: { code: string }) {
  return <Badge variant="secondary">{RULE_LABELS[code] ?? code}</Badge>;
}

export function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** Optional semantic tone for the hint line (e.g. "good" | "bad"). */
  tone?: "good" | "bad" | "neutral";
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">
          {value}
        </CardTitle>
      </CardHeader>
      {hint ? (
        <CardFooter
          className={cn(
            "text-muted-foreground",
            tone === "good" && "text-status-good",
            tone === "bad" && "text-destructive",
          )}
        >
          {hint}
        </CardFooter>
      ) : null}
    </Card>
  );
}

export function OnChainLink({
  hash,
  label,
}: {
  hash: string | null | undefined;
  label?: string;
}) {
  if (!hash) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={txUrl(hash)}
      target="_blank"
      rel="noreferrer"
      className="text-foreground inline-flex items-center gap-1 font-mono underline-offset-4 hover:underline"
    >
      {label ?? shortHash(hash)}
      <ExternalLinkIcon className="text-muted-foreground size-3" />
    </a>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="truncate text-xl font-semibold">{title}</h1>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function LoadingCards({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: count }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

export function ErrorState({ error }: { error: Error }) {
  const denied = /permission/i.test(error.message);
  return (
    <Alert variant="destructive">
      <AlertTriangleIcon />
      <AlertTitle>
        {denied ? "You don't have access to this data" : "Couldn't load data"}
      </AlertTitle>
      <AlertDescription>
        {denied
          ? "Firestore rules blocked this read. If you just changed roles or rules, make sure the latest firestore.rules are published."
          : error.message}
      </AlertDescription>
    </Alert>
  );
}

/** Grid for a row of StatCards. */
export function StatGrid({
  children,
  cols = 4,
}: {
  children: React.ReactNode;
  cols?: 3 | 4 | 5;
}) {
  return (
    <div
      className={cn(
        "grid gap-4 sm:grid-cols-2",
        cols === 3 && "lg:grid-cols-3",
        cols === 4 && "lg:grid-cols-4",
        cols === 5 && "lg:grid-cols-5",
      )}
    >
      {children}
    </div>
  );
}
