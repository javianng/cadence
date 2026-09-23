"use client";

import {
  collection,
  doc,
  onSnapshot,
  query,
  Timestamp,
  where,
  type DocumentData,
  type QueryConstraint,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "~/components/auth/auth-provider";
import { db } from "~/lib/firebase/client";
import type {
  AgentRun,
  Borrower,
  Kpi,
  Loan,
  LoanEvent,
  LoanException,
  Message,
  Reading,
  ScoreHistory,
} from "~/lib/data/types";

export type Live<T> = { data: T; loading: boolean; error: Error | null };

/** Firestore Timestamps -> Date, recursively (arrays + nested maps). */
function revive(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        revive(v),
      ]),
    );
  }
  return value;
}

const toDoc = <T>(id: string, data: DocumentData) =>
  ({ id, ...(revive(data) as object) }) as T;

/**
 * Scope constraint matching firestore.rules: borrowers see their own loans,
 * RMs their book, Risk everything. Every loan-scoped query must include it.
 */
function useScope(): { ready: boolean; constraints: QueryConstraint[] } {
  const { user, profile } = useAuth();
  if (!user || !profile) return { ready: false, constraints: [] };
  if (profile.role === "borrower") {
    return { ready: true, constraints: [where("ownerUid", "==", user.uid)] };
  }
  if (profile.role === "rm") {
    return { ready: true, constraints: [where("rmUid", "==", user.uid)] };
  }
  return { ready: true, constraints: [] };
}

function useLiveQuery<T>(
  name: string,
  extra: QueryConstraint[],
  key: string,
  enabled = true,
): Live<T[]> {
  const scope = useScope();
  const [state, setState] = useState<Live<T[]>>({
    data: [],
    loading: true,
    error: null,
  });
  const scopeKey = scope.constraints.map((c) => JSON.stringify(c)).join();

  useEffect(() => {
    if (!scope.ready || !enabled) return;
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      query(collection(db, name), ...scope.constraints, ...extra),
      (snap) =>
        setState({
          data: snap.docs.map((d) => toDoc<T>(d.id, d.data())),
          loading: false,
          error: null,
        }),
      (error) => setState({ data: [], loading: false, error }),
    );
    // `extra` is described by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, key, scopeKey, scope.ready, enabled]);

  return state;
}

function useLiveDoc<T>(path: string | null): Live<T | null> {
  const [state, setState] = useState<Live<T | null>>({
    data: null,
    loading: true,
    error: null,
  });
  useEffect(() => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      doc(db, path),
      (snap) =>
        setState({
          data: snap.exists() ? toDoc<T>(snap.id, snap.data()) : null,
          loading: false,
          error: null,
        }),
      (error) => setState({ data: null, loading: false, error }),
    );
  }, [path]);
  return state;
}

/**
 * Sorted view of a live result. Memoized on the snapshot array so consumers
 * get a stable reference between renders (new array only when data changes);
 * otherwise effects/memos depending on it would re-run on every render.
 */
function useSorted<T>(
  live: Live<T[]>,
  compare: (a: T, b: T) => number,
): Live<T[]> {
  const data = useMemo(
    () => [...live.data].sort(compare),
    [live.data, compare],
  );
  return useMemo(() => ({ ...live, data }), [live, data]);
}

const byPeriod = (a: { period: number }, b: { period: number }) =>
  a.period - b.period;
const byBorrowerName = (a: Loan, b: Loan) =>
  a.borrowerName.localeCompare(b.borrowerName);
const byWeightDesc = (a: Kpi, b: Kpi) => b.weight - a.weight;
const newestEventFirst = (a: LoanEvent, b: LoanEvent) =>
  b.period - a.period ||
  (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
const oldestMessageFirst = (a: Message, b: Message) =>
  (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
const newestPeriodFirst = (a: { period: number }, b: { period: number }) =>
  b.period - a.period;
const newestRunFirst = (a: AgentRun, b: AgentRun) =>
  (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0);

// --- Loans -------------------------------------------------------------------

export function useLoans(): Live<Loan[]> {
  return useSorted(useLiveQuery<Loan>("loans", [], "all"), byBorrowerName);
}

export function useLoan(loanId: string | null): Live<Loan | null> {
  return useLiveDoc<Loan>(loanId ? `loans/${loanId}` : null);
}

export function useBorrowers(): Live<Borrower[]> {
  return useLiveQuery<Borrower>("borrowers", [], "all");
}

// --- Per-loan series ---------------------------------------------------------

const loanFilter = (loanId: string | null) =>
  loanId ? [where("loanId", "==", loanId)] : [];

export function useScoreHistory(loanId: string | null): Live<ScoreHistory[]> {
  const live = useLiveQuery<ScoreHistory>(
    "scoreHistory",
    loanFilter(loanId),
    `loan:${loanId ?? "*"}`,
  );
  return useSorted(live, byPeriod);
}

export function useReadings(loanId: string | null): Live<Reading[]> {
  const live = useLiveQuery<Reading>(
    "readings",
    loanFilter(loanId),
    `loan:${loanId ?? "*"}`,
  );
  return useSorted(live, byPeriod);
}

export function useKpis(loanId: string | null): Live<Kpi[]> {
  const live = useLiveQuery<Kpi>(
    "kpis",
    loanFilter(loanId),
    `loan:${loanId ?? "*"}`,
  );
  return useSorted(live, byWeightDesc);
}

/** Borrowers only ever query borrower-visible events (rules require it). */
export function useEvents(
  loanId: string | null,
  { internal = false }: { internal?: boolean } = {},
): Live<LoanEvent[]> {
  const extra = [
    ...loanFilter(loanId),
    ...(internal ? [] : [where("visibility", "==", "all")]),
  ];
  const live = useLiveQuery<LoanEvent>(
    "events",
    extra,
    `loan:${loanId ?? "*"}:${internal}`,
  );
  return useSorted(live, newestEventFirst);
}

export function useMessages(loanId: string | null): Live<Message[]> {
  const live = useLiveQuery<Message>(
    "messages",
    loanFilter(loanId),
    `loan:${loanId ?? "*"}`,
    loanId !== null,
  );
  return useSorted(live, oldestMessageFirst);
}

// --- Staff-only (RM / Risk) ---------------------------------------------------

export function useExceptions(
  loanId: string | null = null,
): Live<LoanException[]> {
  const live = useLiveQuery<LoanException>(
    "exceptions",
    loanFilter(loanId),
    `loan:${loanId ?? "*"}`,
  );
  return useSorted(live, newestPeriodFirst);
}

export function useException(id: string | null): Live<LoanException | null> {
  return useLiveDoc<LoanException>(id ? `exceptions/${id}` : null);
}

export function useAgentRuns(loanId: string | null = null): Live<AgentRun[]> {
  const live = useLiveQuery<AgentRun>(
    "agentRuns",
    loanFilter(loanId),
    `loan:${loanId ?? "*"}`,
  );
  return useSorted(live, newestRunFirst);
}

export function useAgentRun(id: string | null): Live<AgentRun | null> {
  return useLiveDoc<AgentRun>(id ? `agentRuns/${id}` : null);
}
