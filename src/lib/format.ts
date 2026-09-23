// Display formatting shared by the dashboards.

const EXPLORER = "https://amoy.polygonscan.com";

/** 225 -> "2.25%" */
export const formatBps = (bps: number) => `${(bps / 100).toFixed(2)}%`;

/** -25 -> "−0.25%", 25 -> "+0.25%" */
export function formatBpsDelta(bps: number): string {
  if (bps === 0) return "±0.00%";
  return `${bps > 0 ? "+" : "−"}${(Math.abs(bps) / 100).toFixed(2)}%`;
}

export function formatSgd(amount: number, { compact = false } = {}): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  }).format(amount);
}

export const formatPct = (fraction: number, digits = 0) =>
  `${(fraction * 100).toFixed(digits)}%`;

export function formatDate(date: Date | undefined | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(date: Date | undefined | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** "0x1234…abcd" */
export const shortHash = (hash: string, size = 4) =>
  `${hash.slice(0, 2 + size)}…${hash.slice(-size)}`;

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (address: string) => `${EXPLORER}/address/${address}`;
export const tokenUrl = (address: string, tokenId: number) =>
  `${EXPLORER}/nft/${address}/${tokenId}`;

/** Human names for escalation codes (staff views only). */
export const RULE_LABELS: Record<string, string> = {
  DATA_MISMATCH: "Data mismatch",
  KPI_BREACH: "KPI breach",
  SHARP_DECLINE: "Sharp decline",
  DATA_GAP: "Data gap",
  STEP_UP: "Step-up",
  ANOMALY: "Anomaly",
};

export const STATUS_LABELS = {
  on_track: "On track",
  watch: "Watch",
  under_review: "Under review",
} as const;
