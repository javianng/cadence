/**
 * Seeds Firestore with the three demo loans and anchors them on Polygon Amoy.
 *
 *   npm run seed                         # idempotent: resumes / does missing work
 *   npm run seed -- --reset              # wipe demo collections, re-mint
 *   npm run seed -- --chain-periods=3    # anchor the last 3 periods on-chain
 *   npm run seed -- --dry-run            # print the plan; no writes, no txs
 *
 * What goes on-chain (to fit a faucet-sized gas budget while keeping the
 * contract's margin identical to the Firestore history):
 *   - history periods where the margin changed: submitScore (+ RM-approved
 *     resolveAdjustment for step-ups);
 *   - the last --chain-periods periods: submitScore (+ flagException per
 *     escalation). Step-ups here stay pending for the RM;
 *   - periods with a data-integrity escalation hold pricing: flagException
 *     only (last N periods).
 * Quiet history periods are Firestore-only (onChain: false).
 */
import type {
  ContractTransactionReceipt,
  ContractTransactionResponse,
} from "ethers";
import {
  evaluateRules,
  holdsPricing,
  acceptedValue,
  divergencePct,
  type EscalationCode,
} from "~/lib/agent/rules";
import {
  DEMO_ACCOUNTS,
  DEMO_LOANS,
  DEMO_START_DATE,
  PERIOD_DAYS,
  SEED_PERIODS,
  TARGET_PERIOD,
  type DemoLoan,
} from "~/lib/demo-loans";
import { generateReading } from "~/lib/mock-data";
import { findBand, previewMargin } from "~/lib/pricing";
import { glidePathValue, kpiScore, transitionScore } from "~/lib/scoring";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const RESET = argv.includes("--reset");
const DRY_RUN = argv.includes("--dry-run");
const chainArg = argv.find((a) => a.startsWith("--chain-periods="));
const CHAIN_PERIODS = chainArg ? Number(chainArg.split("=")[1]) : 2;
if (
  !Number.isInteger(CHAIN_PERIODS) ||
  CHAIN_PERIODS < 0 ||
  CHAIN_PERIODS > SEED_PERIODS
) {
  throw new Error(`--chain-periods must be an integer 0..${SEED_PERIODS}`);
}
const FIRST_RECENT_PERIOD = SEED_PERIODS - CHAIN_PERIODS + 1;

const DEMO_COLLECTIONS = [
  "personas",
  "borrowers",
  "loans",
  "kpis",
  "readings",
  "scoreHistory",
  "agentRuns",
  "events",
  "exceptions",
  "simulation",
] as const;

/** Refuse any transaction that would leave the wallet below this (POL). */
const MIN_BALANCE_POL = "0.005";
/** Upper-bound gas per call, for the pre-flight budget only. */
const GAS_BUDGET = {
  mintLoan: 350_000n,
  submitScore: 110_000n,
  resolveAdjustment: 60_000n,
  flagException: 45_000n,
};

// ---------------------------------------------------------------------------
// Pure planning — shared by --dry-run and the real run
// ---------------------------------------------------------------------------

type ReadingRow = {
  kpiId: string;
  primaryValue: number;
  secondaryValue: number;
  acceptedValue: number;
  divergencePct: number;
  glideValue: number;
  score: number;
};

type PeriodPlan = {
  period: number;
  readings: ReadingRow[];
  kpiScores: { id: string; score: number; weight: number }[];
  transitionScore: number;
  escalations: EscalationCode[];
  held: boolean;
  isIncrease: boolean;
  marginBeforeBps: number;
  /** Margin after this period (step-ups in history are RM-approved). */
  marginAfterBps: number;
  /** On-chain pending adjustment after this period. */
  pendingAdjustmentBps: number;
  /** True for the last --chain-periods periods. */
  recent: boolean;
  chain: { submit: boolean; resolve: boolean; flags: EscalationCode[] };
};

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

function computeReadings(loan: DemoLoan, period: number) {
  const readings = loan.kpis.map((kpi): ReadingRow => {
    const { primaryValue, secondaryValue } = generateReading(
      kpi,
      period,
      loan.scenario,
    );
    const glideValue = glidePathValue(
      kpi.baseline,
      kpi.finalTarget,
      kpi.targetPeriod,
      period,
    );
    const accepted = acceptedValue(
      kpi.direction,
      primaryValue,
      secondaryValue,
    )!;
    return {
      kpiId: kpi.id,
      primaryValue,
      secondaryValue,
      acceptedValue: accepted,
      divergencePct: round(divergencePct(primaryValue, secondaryValue)!, 4),
      glideValue: round(glideValue, 3),
      score: kpiScore(kpi.direction, kpi.baseline, glideValue, accepted),
    };
  });
  const kpiScores = loan.kpis.map((kpi, i) => ({
    id: kpi.id,
    score: readings[i]!.score,
    weight: kpi.weight,
  }));
  return { readings, kpiScores, transitionScore: transitionScore(kpiScores) };
}

function planLoan(loan: DemoLoan): PeriodPlan[] {
  const plans: PeriodPlan[] = [];
  let margin = loan.baseMarginBps;
  let pending = 0;
  let previousScore: number | null = null;

  for (let period = 1; period <= SEED_PERIODS; period++) {
    const {
      readings,
      kpiScores,
      transitionScore: score,
    } = computeReadings(loan, period);
    const recent = period >= FIRST_RECENT_PERIOD;
    const preview = previewMargin(
      {
        current: margin,
        base: loan.baseMarginBps,
        floor: loan.floorBps,
        cap: loan.capBps,
        maxStep: loan.maxStepBps,
      },
      findBand(score, loan.bands),
    );
    let escalations = evaluateRules(
      {
        kpis: readings.map((r) => ({
          kpiId: r.kpiId,
          primaryValue: r.primaryValue,
          secondaryValue: r.secondaryValue,
          score: r.score,
        })),
        transitionScore: score,
        previousTransitionScore: previousScore,
        pricing: { isIncrease: preview.isIncrease },
      },
      [],
    );
    const held = holdsPricing(escalations);
    if (held) escalations = escalations.filter((c) => c !== "STEP_UP");
    const isIncrease = !held && preview.isIncrease;

    const marginBefore = margin;
    let chain: PeriodPlan["chain"];
    if (held) {
      // Pricing frozen; recent periods anchor the data hash via flags.
      chain = {
        submit: false,
        resolve: false,
        flags: recent ? escalations : [],
      };
    } else if (recent) {
      chain = {
        submit: true,
        resolve: false,
        flags: escalations.filter((c) => c !== "STEP_UP"),
      };
      if (isIncrease) {
        pending = preview.step; // held for the RM
      } else {
        margin = preview.newMargin;
        pending = 0;
      }
    } else {
      // History: anchor only periods that moved the margin.
      const moved = preview.newMargin !== margin;
      chain = { submit: moved, resolve: moved && isIncrease, flags: [] };
      margin = preview.newMargin;
      pending = 0;
    }

    plans.push({
      period,
      readings,
      kpiScores,
      transitionScore: score,
      escalations,
      held,
      isIncrease,
      marginBeforeBps: marginBefore,
      marginAfterBps: margin,
      pendingAdjustmentBps: pending,
      recent,
      chain,
    });
    previousScore = score;
  }
  return plans;
}

const txCount = (p: PeriodPlan) =>
  (p.chain.submit ? 1 : 0) + (p.chain.resolve ? 1 : 0) + p.chain.flags.length;

function periodEnd(period: number): Date {
  const d = new Date(`${DEMO_START_DATE}T00:00:00+08:00`);
  d.setDate(d.getDate() + period * PERIOD_DAYS);
  return d;
}

const pad = (p: number) => String(p).padStart(2, "0");
const kpiDocId = (loanId: string, kpiId: string) => `${loanId}__${kpiId}`;
const periodDocId = (loanId: string, p: number) => `${loanId}__p${pad(p)}`;

// ---------------------------------------------------------------------------
// Dry run
// ---------------------------------------------------------------------------

function dryRun() {
  console.log(
    `DRY RUN — no writes, no transactions. Recent (always on-chain) periods: ${FIRST_RECENT_PERIOD}..${SEED_PERIODS}\n`,
  );
  let total = 0;
  for (const loan of DEMO_LOANS) {
    const plans = planLoan(loan);
    const loanTx = 1 + plans.reduce((n, p) => n + txCount(p), 0);
    total += loanTx;
    console.log(
      `${loan.borrower.name} (${loan.scenario}), base ${loan.baseMarginBps}bps — ${loanTx} tx incl. mint`,
    );
    for (const p of plans) {
      const chain = [
        p.chain.submit && "submit",
        p.chain.resolve && "approve",
        ...p.chain.flags.map((f) => `flag:${f}`),
      ]
        .filter(Boolean)
        .join("+");
      const margin = p.held
        ? `${p.marginBeforeBps} (held)`
        : `${p.marginBeforeBps}→${p.marginAfterBps}${p.pendingAdjustmentBps ? ` +${p.pendingAdjustmentBps} pending` : ""}`;
      console.log(
        `  p${pad(p.period)} score ${String(p.transitionScore).padStart(3)}  ${margin.padEnd(22)} ${p.escalations.join(",").padEnd(40)} ${chain ? `⛓ ${chain}` : ""}`,
      );
    }
    console.log();
  }
  console.log(`Total transactions: ${total}`);
}

// ---------------------------------------------------------------------------
// Real run
// ---------------------------------------------------------------------------

async function main() {
  if (DRY_RUN) return dryRun();

  // Server modules load lazily so --dry-run works without credentials.
  const { adminAuth, adminDb } = await import("~/lib/firebase/admin");
  const { FEE_OVERRIDES, provider, wallet, AMOY_CHAIN_ID } =
    await import("~/lib/web3/client");
  const { cadenceContract: contract, CADENCE_CONTRACT_ADDRESS } =
    await import("~/lib/web3/contract");
  const { computeDataHash, periodHashPayload } =
    await import("~/lib/web3/hash");
  const { Timestamp, FieldValue } = await import("firebase-admin/firestore");
  const {
    encodeBytes32String,
    formatEther,
    id: keccakId,
    parseEther,
  } = await import("ethers");

  const minBalance = parseEther(MIN_BALANCE_POL);
  const walletAddress = await wallet.getAddress();
  const ts = (d: Date) => Timestamp.fromDate(d);
  const stats = { txCount: 0, gasSpentWei: 0n };
  const balance = () => provider.getBalance(walletAddress);
  const pol = (wei: bigint) => `${Number(formatEther(wei)).toFixed(5)} POL`;

  async function send(
    label: string,
    estimate: () => Promise<bigint>,
    tx: () => Promise<ContractTransactionResponse>,
  ): Promise<ContractTransactionReceipt> {
    const gas = await estimate();
    const cost = gas * FEE_OVERRIDES.maxFeePerGas;
    const bal = await balance();
    if (bal - cost < minBalance) {
      throw new Error(
        `Stopping before ${label}: balance ${pol(bal)} minus est. ${pol(cost)} would drop below ${MIN_BALANCE_POL} POL. ` +
          `Top up ${walletAddress} and rerun — the seed resumes where it stopped.`,
      );
    }
    const response = await tx();
    const receipt = await response.wait();
    if (receipt?.status !== 1)
      throw new Error(`${label} failed: ${response.hash}`);
    stats.txCount++;
    stats.gasSpentWei += receipt.gasUsed * receipt.gasPrice;
    console.log(
      `    ✓ ${label.padEnd(34)} ${receipt.gasUsed} gas ≈ ${pol(receipt.gasUsed * receipt.gasPrice)}  ${receipt.hash}`,
    );
    return receipt;
  }

  // --- Reset ---------------------------------------------------------------
  if (RESET) {
    console.log(
      "--reset: deleting demo collections (users/ untouched). Loans will be re-minted as new tokens.",
    );
    for (const name of DEMO_COLLECTIONS) {
      await adminDb.recursiveDelete(adminDb.collection(name));
    }
  }

  // --- Personas: the existing Firebase Auth demo accounts ------------------
  type Persona = { uid: string; email: string; displayName: string };
  const personas = {} as Record<keyof typeof DEMO_ACCOUNTS, Persona>;
  for (const [role, email] of Object.entries(DEMO_ACCOUNTS) as [
    keyof typeof DEMO_ACCOUNTS,
    string,
  ][]) {
    const user = await adminAuth.getUserByEmail(email).catch(() => {
      throw new Error(
        `Demo account ${email} (${role}) not found in Firebase Auth — sign it up first.`,
      );
    });
    const profile = (await adminDb.doc(`users/${user.uid}`).get()).data() as
      { fullName?: string } | undefined;
    personas[role] = {
      uid: user.uid,
      email,
      displayName: profile?.fullName ?? user.displayName ?? email,
    };
    await adminDb.doc(`personas/${role}`).set({
      role,
      ...personas[role],
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  console.log(
    `Personas: borrower ${personas.borrower.email} · rm ${personas.rm.email} · risk ${personas.risk.email}`,
  );

  // --- Work out what's left to do, then pre-flight the gas budget ----------
  type LoanWork = {
    loan: DemoLoan;
    plans: PeriodPlan[];
    tokenId: number | null;
    mintTxHash: string | null;
    anchored: Map<number, FirebaseFirestore.DocumentData>;
  };
  const work: LoanWork[] = [];
  for (const loan of DEMO_LOANS) {
    const doc = (await adminDb.doc(`loans/${loan.id}`).get()).data();
    const minted =
      typeof doc?.tokenId === "number" &&
      String(doc.contractAddress).toLowerCase() ===
        CADENCE_CONTRACT_ADDRESS.toLowerCase();
    const history = minted
      ? await adminDb
          .collection("scoreHistory")
          .where("loanId", "==", loan.id)
          .get()
      : null;
    work.push({
      loan,
      plans: planLoan(loan),
      tokenId: minted ? (doc.tokenId as number) : null,
      mintTxHash: minted ? (doc.mintTxHash as string) : null,
      anchored: new Map(
        (history?.docs ?? [])
          .filter((d) => d.get("onChain") === true)
          .map((d) => [d.get("period") as number, d.data()]),
      ),
    });
  }

  let budgetGas = 0n;
  let plannedTx = 0;
  for (const w of work) {
    if (w.tokenId === null) {
      budgetGas += GAS_BUDGET.mintLoan;
      plannedTx++;
    }
    for (const p of w.plans) {
      if (w.anchored.has(p.period)) continue;
      if (p.chain.submit) budgetGas += GAS_BUDGET.submitScore;
      if (p.chain.resolve) budgetGas += GAS_BUDGET.resolveAdjustment;
      budgetGas += BigInt(p.chain.flags.length) * GAS_BUDGET.flagException;
      plannedTx += txCount(p);
    }
  }
  const budget = budgetGas * FEE_OVERRIDES.maxFeePerGas;
  const startBalance = await balance();
  console.log(
    `Wallet ${walletAddress}: ${pol(startBalance)}. Planned: ${plannedTx} transaction(s), worst-case ${pol(budget)} at 35 gwei.`,
  );
  if (plannedTx > 0 && startBalance - budget < minBalance) {
    throw new Error(
      `Insufficient gas: need up to ${pol(budget + minBalance)} (incl. ${MIN_BALANCE_POL} POL floor), have ${pol(startBalance)}. ` +
        `Top up ${walletAddress} and rerun. Nothing was sent.`,
    );
  }

  // --- Seed each loan -------------------------------------------------------
  const summary: Record<string, string | number>[] = [];
  const rmRef = keccakId(`cadence:rm:${personas.rm.uid}`);

  for (const { loan, plans, anchored, ...w } of work) {
    console.log(`\n▶ ${loan.borrower.name} (${loan.scenario})`);
    const loanRef = adminDb.doc(`loans/${loan.id}`);
    const borrowerRef = keccakId(`cadence:borrower:${loan.borrower.id}`);

    // 1. Borrower, loan terms, KPIs
    await adminDb.doc(`borrowers/${loan.borrower.id}`).set({
      name: loan.borrower.name,
      industry: loan.borrower.industry,
      country: loan.borrower.country,
      borrowerRef,
      ownerUid: personas.borrower.uid,
      rmUid: personas.rm.uid,
    });
    await loanRef.set(
      {
        borrowerId: loan.borrower.id,
        borrowerName: loan.borrower.name,
        ownerUid: personas.borrower.uid,
        rmUid: personas.rm.uid,
        scenario: loan.scenario,
        currency: loan.currency,
        facilityAmount: loan.facilityAmount,
        startDate: ts(periodEnd(0)),
        periodDays: PERIOD_DAYS,
        targetPeriod: TARGET_PERIOD,
        baseMarginBps: loan.baseMarginBps,
        floorBps: loan.floorBps,
        capBps: loan.capBps,
        maxStepBps: loan.maxStepBps,
        bands: loan.bands,
        staticMarginBps: loan.baseMarginBps,
        contractAddress: CADENCE_CONTRACT_ADDRESS,
        chainId: AMOY_CHAIN_ID,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    for (const kpi of loan.kpis) {
      const { id: kpiId, ...rest } = kpi;
      await adminDb
        .doc(`kpis/${kpiDocId(loan.id, kpiId)}`)
        .set({ loanId: loan.id, kpiId, ...rest });
    }

    // 2. Mint
    let tokenId = w.tokenId;
    let mintTxHash = w.mintTxHash;
    if (tokenId === null) {
      const args = [
        walletAddress,
        borrowerRef,
        loan.baseMarginBps,
        loan.floorBps,
        loan.capBps,
        loan.maxStepBps,
        loan.bands,
      ] as const;
      const receipt = await send(
        "mintLoan",
        () => contract.mintLoan.estimateGas(...args),
        () => contract.mintLoan(...args, FEE_OVERRIDES),
      );
      const minted = receipt.logs
        .map((log) => contract.interface.parseLog(log))
        .find((parsed) => parsed?.name === "LoanMinted");
      if (!minted)
        throw new Error("LoanMinted event missing from mint receipt");
      tokenId = Number(minted.args.tokenId as bigint);
      mintTxHash = receipt.hash;
      await loanRef.set(
        { tokenId, mintTxHash, mintBlockNumber: receipt.blockNumber },
        { merge: true },
      );
    } else {
      console.log(`    already minted as token #${tokenId}`);
    }
    const token = BigInt(tokenId);

    // Resume safety: chain must match the last period we recorded.
    const lastAnchored = Math.max(0, ...anchored.keys());
    {
      const expected = lastAnchored
        ? plans[lastAnchored - 1]!
        : { marginAfterBps: loan.baseMarginBps, pendingAdjustmentBps: 0 };
      const onChain = await contract.getLoan(token);
      if (
        Number(onChain.currentMarginBps) !== expected.marginAfterBps ||
        Number(onChain.pendingAdjustmentBps) !== expected.pendingAdjustmentBps
      ) {
        throw new Error(
          `Token #${tokenId} on-chain state (${onChain.currentMarginBps}bps, pending ${onChain.pendingAdjustmentBps}) ` +
            `doesn't match Firestore after p${lastAnchored}. Rerun with --reset.`,
        );
      }
    }

    // 3. Periods
    type EventDoc = {
      period: number;
      type: string;
      title: string;
      detail: string;
      actor: "agent" | "rm" | "system";
      txHash?: string | null;
    };
    const events: EventDoc[] = [
      {
        period: 0,
        type: "loan_minted",
        title: "Facility tokenised on Polygon",
        detail: `Soulbound loan token #${tokenId} minted with a ${loan.baseMarginBps}bps base margin and a locked pricing grid.`,
        actor: "system",
        txHash: mintTxHash,
      },
    ];
    let previousCodes = new Set<EscalationCode>();
    let wasHeld = false;
    let openExceptions = 0;
    const batch = adminDb.batch();

    for (const p of plans) {
      const end = ts(periodEnd(p.period));
      const dataHash = computeDataHash(
        periodHashPayload({
          loanId: loan.id,
          tokenId,
          period: p.period,
          transitionScore: p.transitionScore,
          readings: p.readings,
        }),
      );
      const historyRef = adminDb.doc(
        `scoreHistory/${periodDocId(loan.id, p.period)}`,
      );
      const historyDoc = {
        loanId: loan.id,
        tokenId,
        period: p.period,
        periodEnd: end,
        transitionScore: p.transitionScore,
        kpiScores: p.kpiScores,
        marginBeforeBps: p.marginBeforeBps,
        marginAfterBps: p.marginAfterBps,
        staticMarginBps: loan.baseMarginBps,
        isIncrease: p.isIncrease,
        pricingHeld: p.held,
        pendingAdjustmentBps: p.pendingAdjustmentBps,
        escalations: p.escalations,
        dataHash,
      };

      let chainFields: Record<string, unknown> = {
        onChain: false,
        txHash: null,
        blockNumber: null,
      };
      if (anchored.has(p.period)) {
        const doc = anchored.get(p.period)!;
        chainFields = {
          onChain: true,
          txHash: doc.txHash,
          blockNumber: doc.blockNumber,
          resolveTxHash: doc.resolveTxHash ?? null,
          flagTxHashes: doc.flagTxHashes ?? [],
        };
      } else if (txCount(p) > 0) {
        if (p.period <= lastAnchored) {
          throw new Error(
            `p${p.period} should be on-chain but later periods already are. Rerun with --reset.`,
          );
        }
        let primary: ContractTransactionReceipt | null = null;
        let resolveTxHash: string | null = null;
        const flagTxHashes: string[] = [];

        if (p.chain.submit) {
          const chainPreview = Number(
            await contract.previewMargin(token, p.transitionScore),
          );
          const expectedPreview = p.isIncrease
            ? p.marginBeforeBps +
              (p.recent
                ? p.pendingAdjustmentBps
                : p.marginAfterBps - p.marginBeforeBps)
            : p.marginAfterBps;
          if (chainPreview !== expectedPreview) {
            throw new Error(
              `pricing.ts expects ${expectedPreview}bps but contract.previewMargin says ${chainPreview}bps at p${p.period}`,
            );
          }
          const runRef = keccakId(`seed:${loan.id}:p${pad(p.period)}`);
          const args = [token, p.transitionScore, dataHash, runRef] as const;
          primary = await send(
            `p${pad(p.period)} submitScore(${p.transitionScore})`,
            () => contract.submitScore.estimateGas(...args),
            () => contract.submitScore(...args, FEE_OVERRIDES),
          );
        }
        if (p.chain.resolve) {
          const args = [token, true, rmRef] as const;
          const receipt = await send(
            `p${pad(p.period)} resolveAdjustment(approve)`,
            () => contract.resolveAdjustment.estimateGas(...args),
            () => contract.resolveAdjustment(...args, FEE_OVERRIDES),
          );
          resolveTxHash = receipt.hash;
        }
        for (const code of p.chain.flags) {
          const args = [token, encodeBytes32String(code), dataHash] as const;
          const receipt = await send(
            `p${pad(p.period)} flagException(${code})`,
            () => contract.flagException.estimateGas(...args),
            () => contract.flagException(...args, FEE_OVERRIDES),
          );
          primary ??= receipt;
          flagTxHashes.push(receipt.hash);
        }

        const after = await contract.getLoan(token);
        if (
          Number(after.currentMarginBps) !== p.marginAfterBps ||
          Number(after.pendingAdjustmentBps) !== p.pendingAdjustmentBps
        ) {
          throw new Error(
            `Chain diverged at p${p.period}: contract ${after.currentMarginBps}bps pending ${after.pendingAdjustmentBps}, ` +
              `expected ${p.marginAfterBps}bps pending ${p.pendingAdjustmentBps}`,
          );
        }
        chainFields = {
          onChain: true,
          txHash: primary!.hash,
          blockNumber: primary!.blockNumber,
          resolveTxHash,
          flagTxHashes,
        };
        // Persist immediately so a crash mid-loan can resume safely.
        await historyRef.set({ ...historyDoc, ...chainFields });
      }
      batch.set(historyRef, { ...historyDoc, ...chainFields });
      const txHash = (chainFields.txHash as string | null) ?? null;

      for (const r of p.readings) {
        batch.set(
          adminDb.doc(
            `readings/${kpiDocId(loan.id, r.kpiId)}__p${pad(p.period)}`,
          ),
          { loanId: loan.id, period: p.period, periodEnd: end, ...r },
        );
      }

      // Exceptions: recent periods stay open for the RM; history is resolved.
      if (p.escalations.length > 0) {
        const open = p.recent;
        if (open) openExceptions++;
        const resolution = p.held
          ? "Pricing held; RM requested source reconciliation from the borrower."
          : p.escalations.includes("STEP_UP")
            ? `Step-up of ${p.marginAfterBps - p.marginBeforeBps}bps approved by RM.`
            : "Reviewed and acknowledged by RM.";
        batch.set(adminDb.doc(`exceptions/${periodDocId(loan.id, p.period)}`), {
          loanId: loan.id,
          borrowerName: loan.borrower.name,
          period: p.period,
          codes: p.escalations,
          pricingHeld: p.held,
          status: open ? "open" : "resolved",
          assignedRmUid: personas.rm.uid,
          summary: `Period ${p.period}: ${p.escalations.join(", ")} (transition score ${p.transitionScore}).`,
          dataHash,
          txHash,
          createdAt: end,
          ...(open
            ? {}
            : { resolution, resolvedByUid: personas.rm.uid, resolvedAt: end }),
        });
      }

      // Narrative events
      const newCodes = p.escalations.filter(
        (c) => c !== "STEP_UP" && !previousCodes.has(c),
      );
      if (newCodes.length > 0) {
        events.push({
          period: p.period,
          type: "exception_opened",
          title: newCodes.includes("DATA_MISMATCH")
            ? "Data mismatch detected"
            : newCodes.includes("SHARP_DECLINE")
              ? "Sharp decline in transition score"
              : "KPI breach",
          detail: `${newCodes.join(", ")} raised at period ${p.period} (score ${p.transitionScore}); routed to the RM.`,
          actor: "agent",
          txHash,
        });
      }
      if (p.held && !wasHeld) {
        events.push({
          period: p.period,
          type: "pricing_held",
          title: "Pricing held pending data reconciliation",
          detail:
            "Primary and secondary sources disagree beyond 5%; margin frozen until the RM reviews.",
          actor: "agent",
          txHash,
        });
      }
      if (p.marginAfterBps < p.marginBeforeBps) {
        events.push({
          period: p.period,
          type: "margin_decreased",
          title: `Margin reduced to ${p.marginAfterBps}bps`,
          detail: `Transition score ${p.transitionScore} earned a ${p.marginBeforeBps - p.marginAfterBps}bps reduction, applied automatically.`,
          actor: "agent",
          txHash,
        });
      }
      if (p.isIncrease) {
        events.push({
          period: p.period,
          type: "adjustment_pending",
          title: "Margin step-up proposed",
          detail: `Transition score ${p.transitionScore} implies a step-up; held for RM approval.`,
          actor: "agent",
          txHash,
        });
        if (!p.recent) {
          events.push({
            period: p.period,
            type: "adjustment_approved",
            title: `Step-up approved: ${p.marginAfterBps}bps`,
            detail: `RM approved the ${p.marginAfterBps - p.marginBeforeBps}bps step-up.`,
            actor: "rm",
            txHash: (chainFields.resolveTxHash as string | null) ?? null,
          });
        }
      }
      if (chainFields.onChain) {
        events.push({
          period: p.period,
          type: "score_anchored",
          title: `Period ${p.period} anchored on-chain`,
          detail: `Data hash ${dataHash.slice(0, 10)}… recorded on Polygon Amoy.`,
          actor: "system",
          txHash,
        });
      }
      previousCodes = new Set(p.escalations);
      wasHeld = p.held;
    }

    for (const e of events) {
      batch.set(
        adminDb.doc(`events/${periodDocId(loan.id, e.period)}__${e.type}`),
        {
          loanId: loan.id,
          borrowerName: loan.borrower.name,
          ...e,
          visibility: "all",
          txHash: e.txHash ?? null,
          createdAt: ts(periodEnd(e.period)),
        },
      );
    }
    await batch.commit();

    // 4. Loan-level state: margin + pending come from the contract.
    const onChain = await contract.getLoan(token);
    const latest = plans[plans.length - 1]!;
    const status =
      openExceptions > 0
        ? "exception"
        : latest.transitionScore < 60
          ? "watch"
          : "on_track";
    await loanRef.set(
      {
        currentMarginBps: Number(onChain.currentMarginBps),
        pendingAdjustmentBps: Number(onChain.pendingAdjustmentBps),
        currentScore: latest.transitionScore,
        chainScore: Number(onChain.currentScore),
        currentPeriod: SEED_PERIODS,
        status,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    summary.push({
      loan: loan.borrower.name,
      token: tokenId,
      score: latest.transitionScore,
      "margin bps": Number(onChain.currentMarginBps),
      "pending bps": Number(onChain.pendingAdjustmentBps),
      status,
      "on-chain periods": plans.filter((p) => txCount(p) > 0).length,
    });
  }

  await adminDb.doc("simulation/state").set({
    currentPeriod: SEED_PERIODS,
    scenarios: Object.fromEntries(DEMO_LOANS.map((l) => [l.id, l.scenario])),
    chainPeriods: CHAIN_PERIODS,
    updatedAt: FieldValue.serverTimestamp(),
  });

  console.log("\n══════════════════ Seed summary ══════════════════");
  console.table(summary);
  console.log(`Contract:                    ${CADENCE_CONTRACT_ADDRESS}`);
  console.log(`Loans created/updated:       ${summary.length}`);
  console.log(`On-chain transactions sent:  ${stats.txCount}`);
  console.log(`Gas spent:                   ${pol(stats.gasSpentWei)}`);
  console.log(
    `Wallet balance remaining:    ${pol(await balance())} (${walletAddress})`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(
      `\n✖ Seed failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  });
