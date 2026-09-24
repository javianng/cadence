import "server-only";

import { adminDb } from "~/lib/firebase/admin";

export type LandingStats = {
  loans: number;
  onChainUpdates: number;
  averageScore: number;
  loansWithExceptions: number;
};

/** Live numbers for the public landing page's stat bar (never hardcoded). */
export async function getLandingStats(): Promise<LandingStats> {
  const [loans, onChain, exceptions] = await Promise.all([
    adminDb.collection("loans").select("currentScore").get(),
    adminDb
      .collection("scoreHistory")
      .where("onChain", "==", true)
      .count()
      .get(),
    adminDb.collection("exceptions").select("loanId").get(),
  ]);
  const scores = loans.docs.map((d) => Number(d.get("currentScore") ?? 0));
  return {
    loans: loans.size,
    onChainUpdates: onChain.data().count,
    averageScore: scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0,
    loansWithExceptions: new Set(
      exceptions.docs.map((d) => d.get("loanId") as string),
    ).size,
  };
}

export type MarginPoint = {
  period: number;
  cadenceBps: number;
  annualBps: number;
};

/** Real weekly margin history for one seeded loan (Straits Build: improving). */
export async function getMarginHistory(loanId: string): Promise<MarginPoint[]> {
  const snap = await adminDb
    .collection("scoreHistory")
    .where("loanId", "==", loanId)
    .get();
  return snap.docs
    .map((d) => ({
      period: d.get("period") as number,
      cadenceBps: d.get("marginAfterBps") as number,
      annualBps: d.get("staticMarginBps") as number,
    }))
    .sort((a, b) => a.period - b.period);
}
