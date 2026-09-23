// Client-side shapes of the Firestore collections (Timestamps -> Date).

import type { EscalationCode } from "~/lib/agent/rules";
import type { AgentKpi, Decision, Recommendation } from "~/lib/agent/types";
import type { Scenario } from "~/lib/demo-loans";
import type { Band } from "~/lib/pricing";

export type LoanStatus = "on_track" | "watch" | "under_review";

type Scoped = { id: string; loanId: string; ownerUid: string; rmUid: string };

export type Loan = {
  id: string;
  ownerUid: string;
  rmUid: string;
  borrowerId: string;
  borrowerName: string;
  scenario: Scenario;
  currency: string;
  facilityAmount: number;
  startDate: Date;
  periodDays: number;
  targetPeriod: number;
  baseMarginBps: number;
  floorBps: number;
  capBps: number;
  maxStepBps: number;
  bands: Band[];
  staticMarginBps: number;
  currentMarginBps: number;
  pendingAdjustmentBps: number;
  currentScore: number;
  currentPeriod: number;
  scoreDelta?: number | null;
  status: LoanStatus;
  tokenId: number;
  mintTxHash: string;
  contractAddress: string;
  chainId: number;
  lastAgentRunId?: string;
  activeRun?: { runId: string; period: number; startedAt?: Date };
  updatedAt?: Date;
};

export type Borrower = {
  id: string;
  name: string;
  industry: string;
  country: string;
  ownerUid: string;
  rmUid: string;
};

export type Kpi = Scoped & AgentKpi;

export type Reading = Scoped & {
  kpiId: string;
  period: number;
  periodEnd: Date;
  primaryValue: number | null;
  secondaryValue: number | null;
  acceptedValue: number | null;
  divergencePct: number | null;
  glideValue: number;
  score: number;
  anomalous?: boolean;
};

export type ScoreHistory = Scoped & {
  tokenId: number;
  period: number;
  periodEnd: Date;
  transitionScore: number;
  kpiScores: { id: string; score: number; weight: number }[];
  marginBeforeBps: number;
  marginAfterBps: number;
  proposedMarginBps?: number;
  staticMarginBps: number;
  isIncrease: boolean;
  pricingHeld?: boolean;
  pendingAdjustmentBps: number;
  escalations: EscalationCode[];
  decision?: Decision;
  rationale?: string;
  dataHash: string;
  onChain: boolean;
  txHash: string | null;
  blockNumber: number | null;
  agentRunId?: string;
};

export type EventVisibility = "all" | "internal";

export type LoanEvent = Scoped & {
  borrowerName: string;
  period: number;
  type: string;
  title: string;
  detail: string | null;
  actor: "agent" | "rm" | "system" | "borrower";
  visibility: EventVisibility;
  txHash: string | null;
  createdAt: Date;
};

export type ExceptionStatus =
  "open" | "info_requested" | "resolved" | "superseded";

export type RmAction = "approve" | "hold" | "request_info";

export type LoanException = Scoped & {
  borrowerName: string;
  period: number;
  codes: EscalationCode[];
  pricingHeld?: boolean;
  status: ExceptionStatus;
  assignedRmUid: string;
  summary: string;
  rmBrief?: string | null;
  recommendation?: Recommendation | null;
  currentMarginBps?: number;
  proposedMarginBps?: number;
  dataHash: string;
  txHash: string | null;
  agentRunId?: string;
  createdAt: Date;
  resolution?: string;
  decision?: RmAction;
  note?: string;
  decidedByUid?: string;
  decisionTxHash?: string;
  agreedWithAgent?: boolean | null;
  decidedAt?: Date;
};

export type AgentStep = {
  name: string;
  input: unknown;
  output: unknown;
  reasoning: string | null;
  durationMs: number;
  completedAt: Date;
};

export type AgentRun = Scoped & {
  borrowerName: string;
  period: number;
  status: "running" | "complete" | "failed";
  model: string;
  steps: AgentStep[];
  startedAt: Date;
  finishedAt?: Date;
  error?: string;
  failedStep?: string;
  result?: {
    decision: Decision;
    transitionScore: number;
    triggeredRules: EscalationCode[];
    pricingHeld: boolean;
    currentMarginBps: number;
    proposedMarginBps: number;
    appliedMarginBps: number;
    pendingAdjustmentBps: number;
    txHash: string;
    flagTxHash: string | null;
    borrowerSummary: string;
    rmBrief: string | null;
    recommendation: Recommendation | null;
  };
};

export type Message = Scoped & {
  fromUid: string;
  fromRole: "borrower" | "rm";
  fromName: string;
  text: string;
  createdAt: Date;
};
