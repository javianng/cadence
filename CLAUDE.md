# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Cadence is a Bank of Singapore team entry for an OCBC-organized fintech hackathon focused on Agentic AI and Blockchain, aligned with OCBC's "ADD" framework (AI, Data, Digital) and its four shifts: Asia, Tech, Net Zero, and Franchise.

## Project Overview & State

Cadence addresses the "annual cliff" in Sustainability-Linked Loans (SLLs), where borrower performance is continuous but repricing is annual. This gap delays rewards for improvements, limits proactive risk management, and poses greenwashing risks. Cadence solves this by replacing the annual reset with a continuous verification model. A multi-step AI agent validates performance data every reporting period, deterministic code calculates a transition score, and a Polygon Amoy smart contract executes the margin adjustments. AI handles reasoning, code computes the scores, and humans oversee any margin step-ups.

**Current Project State**
The repository was scaffolded using `create-t3-app`, but the generic `README.md` should be ignored as tRPC, NextAuth, and Prisma/Drizzle are not installed.

- **Core Framework:** Next.js 15 (App Router) and React 19.

- **Styling & UI:** Tailwind CSS v4 and shadcn/ui.

- **Database Backend:** Firebase is installed but is not yet wired up, lacking a configuration file within the `src` directory.

- **Testing:** There is no test runner currently configured.

**Available Commands**

- `npm run dev` starts the Turbopack development server.

- `npm run build` generates the production build.

- `npm run start` runs the production build.

- `npm run preview` builds and then starts the server.

- `npm run check` runs `next lint` and `tsc --noEmit`, which must be run before considering any change complete.

- Code quality can be maintained using `npm run lint`, `npm run lint:fix`, `npm run typecheck`, `npm run format:check`, and `npm run format:write`.

## Architecture, Stack & Tech Details

**Routing and Environment**

- The App Router is located in `src/app`, and the path alias `~/*` is mapped to `src/*`.

- Environment variables are validated by `@t3-oss/env-nextjs` and Zod within `src/env.js`.

- Any new environment variables must be added to the server/client schema in `src/env.js` and mirrored in `.env.example`.

- The `next.config.js` file imports this environment configuration to fail fast during builds, which can be bypassed using `SKIP_ENV_VALIDATION`.

- Required environment variables include `DEPLOYER_PRIVATE_KEY`, `AMOY_RPC_URL`, `POLYGONSCAN_API_KEY`, `CADENCE_CONTRACT_ADDRESS`, `GEMINI_API_KEY`, Firebase configs (Admin + public web JSON), and `NEXT_PUBLIC_APP_URL`.

**UI Components & Styling**

- The `components.json` configuration utilizes the `base-mira` style, `neutral` base color, and `lucide` icons.

- The `base-mira` style relies on Base UI primitives (`@base-ui/react`), meaning APIs utilize a `render` prop rather than Radix's `asChild`.

- The `shadcn` skill is available for project-specific rules and Base-vs-Radix API references.

- Global theme tokens, utilizing Tailwind v4 `@theme` blocks and OKLCH color variables, are stored in `src/styles/globals.css`.

- Installed UI primitives are placed in `src/components/ui`.

- The utility function `cn` is re-exported from the `cn` package inside `src/lib/utils.ts`.

**Backend & External APIs**

- **Firebase Firestore:** Writes happen strictly server-side via `firebase-admin` (API routes/scripts). The client SDK is used read-only with `onSnapshot` listeners for live dashboard updates.
  - **Exception — `users/{uid}`:** user profiles (role, name, organisation) are written by the client SDK during onboarding, guarded by `firestore.rules` (own doc only; role locked after creation).
- **Auth:** Firebase Auth (Google + email/password) on the client. `AuthProvider` (`src/components/auth/auth-provider.tsx`) exposes `user` + `profile`. New users (no profile) go to `/onboarding`; others go to their role home (`/borrower`, `/rm`, `/risk`, see `src/lib/roles.ts`). `RequireAuth`/`AppShell` guards are UX only — enforce data scoping in rules/server routes.
- **Agentic AI:** Powered by the Google Gen AI SDK (`@google/genai`) using the latest Flash model. All agent steps use structured JSON schema outputs.
- **Blockchain:** Solidity and Hardhat reside in `/contracts`, deployed on the Polygon Amoy testnet (chainId 80002). Server-side code interacts with the chain using `ethers v6`.
- **Security Convention:** Mark all modules interacting with private keys, `firebase-admin`, or Gemini with `import "server-only"`.

## Domain Model & Data Structures

**Scoring and Pricing Logic**
Each KPI is measured against a linear glide path moving from a baseline to a final target. Code calculates the expected versus achieved improvement to generate a deterministic KPI score (0-100). The overall transition score is a weighted average of these KPI scores. The transition score maps to a locked pricing grid on-chain, triggering margin reductions automatically or flagging margin increases as pending adjustments for human Relationship Manager (RM) approval.

**Escalation Rules & Agent Workflow**
The AI agent runs per loan per simulated period (one week). It processes through five structured calls:

1. **Verify:** Assesses data plausibility and finds anomalies.
2. **Reconcile:** Compares primary data to secondary sources.
3. **Score:** Deterministic calculation (AI is excluded from this step).
4. **Decide:** Triggers deterministic escalations (`DATA_MISMATCH`, `KPI_BREACH`, `SHARP_DECLINE`, `DATA_GAP`, `STEP_UP`, `ANOMALY`) or auto-applies margins, generating a rationale.
5. **Explain:** Outputs plain-language summaries for borrowers and briefs for RMs.
6. **Orchestrate:** Hashes the data, submits to the blockchain, updates Firestore, and routes exceptions.

**Data Schema & Smart Contract**

- **Firestore:** Houses collections for `personas`, `borrowers`, `loans`, `kpis`, `readings`, `scoreHistory`, `agentRuns`, `events`, `exceptions`, and `simulation/state`.
- **CadenceLoan.sol:** Inherits OpenZeppelin ERC721 and AccessControl. The tokens are soulbound (non-transferable). Functions include `mintLoan`, `submitScore`, `flagException`, `resolveAdjustment`, and `previewMargin`.
- **Tamper Evidence:** Firestore data is converted into a canonical JSON string and hashed (`keccak256`). This hash is verified against on-chain records to prove off-chain data integrity. The NFT URI dynamically renders an SVG based on score status.

## Workflows, Pages & Guidelines

**Key Application Routes**

- `/`: Landing and persona switcher highlighting the continuous pricing model.
- `/borrower`: Primary demo screen showing facility status, transition score, dynamic margin vs. static annual model, KPI tracking, and activity feed. Subpages include KPI detail, pricing history, and a what-if simulator.
- `/rm`: RM portfolio overview and exception queue for human-in-the-loop overrides. Includes detailed Loan 360 views and exception review interfaces.
- `/risk`: Aggregated portfolio sustainability risk, escalation rates, and AI governance metrics (e.g., override rates).
- `/verify/[tokenId]`: Public verification displaying the on-chain event timeline, a tamper test integrity check, and the live SVG.
- `/demo`: Hidden presenter control panel to simulate time advancement, toggle scenarios (improving/drifting/mismatch), and inject events.

**Implementation Priorities & Guardrails**
Execute the build chronologically: Contract → Data/Seed → Agent → Borrower dashboard → RM exception review → Verify page → Demo panel. Ensure strict adherence to design constraints: never expose private keys or credentials to the client, never use real OCBC client names, and never allow the LLM to handle arithmetic. All on-chain writes must gracefully handle failures to ensure Firestore strictly mirrors the true blockchain state.
