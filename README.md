# Cadence

**Sustainability-linked loans, priced continuously.**

Cadence replaces the once-a-year covenant check on sustainability-linked loans (SLLs) with a live, agent-verified score, settled on-chain — where every rate increase is still owned by a human.

Built for an OCBC fintech hackathon (Agentic AI × Blockchain) by Bank of Singapore.

---

## The problem

SLL margins are tied to a borrower's sustainability KPIs, but performance is typically verified **once a year** (ESG data platforms, Second Party Opinions). Pricing reflects reality on one day out of 365: improvements go unrewarded for months, deterioration is caught late, and the gap invites greenwashing.

## How Cadence works

Every reporting period (one simulated week), for each loan:

1. **Verify** — a Gemini agent checks new KPI readings for plausibility (plus a deterministic >30% jump check).
2. **Reconcile** — primary (borrower-reported) data is compared with an independent secondary source; if they diverge by more than 5%, the value less favourable to the borrower is used.
3. **Score** — deterministic code (never the LLM) scores each KPI against its glide path (70 = on track) and computes a weighted **transition score**.
4. **Decide** — deterministic escalation rules (`DATA_MISMATCH`, `KPI_BREACH`, `SHARP_DECLINE`, `DATA_GAP`, `STEP_UP`, `ANOMALY`) and a pricing grid locked on-chain decide the outcome. Gemini only writes the rationale.
5. **Explain** — a plain-language summary for the borrower and a technical brief for the relationship manager.
6. **Anchor** — the period's data is hashed (keccak256 of canonical JSON) and submitted to the `CadenceLoan` contract on Polygon Amoy.

**The contract can only lower a rate automatically.** Any increase is held as a pending adjustment until a relationship manager approves or rejects it — on-chain. Data-integrity problems freeze pricing entirely until a human reviews them.

## What's in the app

| Route                                  | Who                  | What                                                                                                                                                          |
| -------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                    | Public               | Landing page with live on-chain stats                                                                                                                         |
| `/borrower` (+ KPIs, Pricing, What-if) | Borrower             | Score, margin vs the annual model, what moved it, KPI progress, a what-if simulator, message your RM. Look and ask — never act.                               |
| `/rm` (+ Exceptions, Loan 360)         | Relationship manager | Book overview, severity-sorted exception queue, agent brief + evidence + trace, and **Approve / Hold / Request info** — each executed on-chain with a tx link |
| `/risk` (+ AI governance, Loan 360)    | Risk                 | Portfolio score, KPI drift heatmap, escalations by rule, RM–agent agreement / override rate, decision log with CSV export. Read-only.                         |
| `/demo`                                | Presenter            | Trigger the agent for a loan's next week and watch every persona update live                                                                                  |

Access is enforced by Firestore security rules, not just the UI: borrowers never see RM briefs, agent traces or other clients; RMs see only their book; Risk sees everything.

## Tech stack

- **App:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui (Base UI), Recharts, next-themes (light/dark)
- **Data:** Firebase Auth + Firestore (client `onSnapshot` for live dashboards; all writes server-side via `firebase-admin`)
- **AI:** Google Gen AI SDK (`@google/genai`), structured JSON outputs
- **Chain:** Solidity 0.8 + OpenZeppelin (soulbound ERC-721 + AccessControl), Hardhat 3, ethers v6, Polygon Amoy testnet
- **Tests:** Vitest (scoring, pricing, rules, hashing, metrics) and Hardhat/Mocha (contract)

Deployed contract (Amoy): [`0xA2beFb27De709c8ED99210D602b85c53CaF210AE`](https://amoy.polygonscan.com/address/0xA2beFb27De709c8ED99210D602b85c53CaF210AE#code) — verified on PolygonScan and Sourcify.

## Repository layout

```
contracts/            Hardhat project: CadenceLoan.sol, tests, Ignition deploy module
scripts/
  seed.ts             Seeds Firestore + anchors demo history on-chain (idempotent)
  deploy-rules.ts     Publishes firestore.rules via the Admin SDK
src/
  app/                Routes (landing, auth, borrower, rm, risk, demo) + API routes
  components/
    cadence/          Dashboard building blocks (charts, Loan 360, exception review…)
    landing/          Landing-page client components
    ui/               shadcn/ui primitives
  lib/
    agent/            verify → reconcile → decide → explain → orchestrator; rules.ts
    data/             Live Firestore hooks, types, pure dashboard metrics
    web3/             ethers client, typed contract, canonical hashing, ABI
    scoring.ts        Glide path, KPI + transition scores (deterministic)
    pricing.ts        TypeScript mirror of the contract's pricing math
    mock-data.ts      Seeded, deterministic demo readings
    demo-loans.ts     The three fictional demo facilities
firestore.rules       Role-scoped read rules
```

## Getting started

### Prerequisites

- Node.js 20+ (developed on 24)
- A Firebase project with Auth (Google + email/password) and Firestore
- A Firebase service account key (for server-side writes)
- A Gemini API key with the Generative Language API enabled
- A funded Polygon Amoy wallet (faucet POL) and an Amoy RPC URL

### 1. Install

```bash
npm install
cd contracts && npm install && cd ..
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill it in. Variables are validated in `src/env.js`.

| Variable                                                               | Purpose                                                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_FIREBASE_*`                                               | Firebase web app config (client)                                                |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Firebase Admin service account (server only)                                    |
| `DEPLOYER_PRIVATE_KEY`                                                 | Wallet that deploys the contract and acts as oracle / RM signer (testnet only!) |
| `AMOY_RPC_URL`                                                         | Polygon Amoy RPC endpoint                                                       |
| `POLYGONSCAN_API_KEY`                                                  | Etherscan V2 API key, for contract verification                                 |
| `CADENCE_CONTRACT_ADDRESS`                                             | Deployed `CadenceLoan` address                                                  |
| `GEMINI_API_KEY`, `GEMINI_MODEL` (optional)                            | Gemini access; model defaults to `gemini-3.6-flash`                             |
| `NEXT_PUBLIC_EXPLORER_BASE`                                            | Block explorer base URL (default `https://amoy.polygonscan.com`)                |

Never commit `.env` — it holds private keys.

### 3. Deploy the contract (optional — skip to reuse the existing one)

```bash
cd contracts
npx hardhat test
npx hardhat ignition deploy ignition/modules/CadenceLoan.ts --network amoy --verify
npm run export-abi        # writes src/lib/web3/abi.json
cd ..
```

Put the deployed address in `CADENCE_CONTRACT_ADDRESS`.

### 4. Create the demo accounts, seed data, publish rules

Sign up three accounts in the app and complete onboarding as **Borrower**, **Relationship manager** and **Risk**, then set their emails in `DEMO_ACCOUNTS` (`src/lib/demo-loans.ts`).

```bash
npm run seed -- --dry-run   # preview the plan (no credentials, no writes)
npm run seed                # write Firestore + anchor history on-chain (~21 txs)
npm run rules:deploy        # publish firestore.rules
```

The seed is idempotent and resumable: rerunning it sends no transactions and never rewinds loans the agent has already advanced.

### 5. Run

```bash
npm run dev
```

Open http://localhost:3000, sign in as any persona, and use `/demo` to run the agent for a loan's next week.

## Scripts

| Command                                                | What it does                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| `npm run dev`                                          | Next.js dev server (Turbopack)                               |
| `npm run build` / `npm run start`                      | Production build / serve                                     |
| `npm run check`                                        | Lint + typecheck — run before considering a change done      |
| `npm test`                                             | Vitest unit tests                                            |
| `npm run seed`                                         | Seed demo data (`--dry-run`, `--reset`, `--chain-periods=N`) |
| `npm run rules:deploy`                                 | Publish `firestore.rules`                                    |
| `npm run format:write`                                 | Prettier                                                     |
| `contracts/`: `npx hardhat test`, `npm run export-abi` | Contract tests, ABI export                                   |

## API

All routes take `Authorization: Bearer <Firebase ID token>`.

| Route                                                    | Who                | Does                                                                                                                                                      |
| -------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/agent/run` `{ loanId }`                       | Any signed-in user | Starts an agent run for the loan's next period. Returns `202 { runId }`; add `?wait=1` to block until done.                                               |
| `POST /api/exceptions/[id]/decision` `{ action, note? }` | RM (own book)      | `approve` → `resolveAdjustment(true)`; `hold` → `resolveAdjustment(false)` or `flagException(RM_HOLD)`; `request_info` → `flagException(RM_REQUEST_INFO)` |
| `POST /api/messages` `{ loanId, text }`                  | Borrower / RM      | Borrower ↔ RM message on a facility                                                                                                                       |

## Demo data

Three fictional facilities (no real client names), 20 seeded weekly periods:

- **Straits Build Pte Ltd** — improving; margin steps down to 2.00%
- **Meridian Aviation Services** — drifting; ends with a +25bps step-up awaiting RM approval
- **Lumen Semiconductors Sdn Bhd** — data mismatch; pricing held for review

## Notes & limits

- Testnet only. The deployer key signs as admin, oracle and RM for the demo; production would separate these roles.
- The Gemini free tier allows ~20 requests/day per model; an agent run makes 3–5 calls.
- The contract's `tokenURI` base currently points at localhost; redeploy with a public `baseURI` once the app is hosted.
- The bundled Lader font files are trial versions — check the licence before any public release.

---

Built by [Javian](https://www.javianng.com).
