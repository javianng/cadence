# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

Cadence is a very early-stage Next.js app scaffolded with `create-t3-app`. `README.md` still describes the generic T3 stack (tRPC, NextAuth, Prisma/Drizzle) but none of those packages are actually installed — check `package.json` as the source of truth, not the README. The current stack is: Next.js 15 (App Router) + React 19, Tailwind CSS v4, shadcn/ui, and Firebase (installed but not yet wired up — no Firebase config/init file exists under `src` yet).

## Commands

- `npm run dev` — start the dev server (Turbopack)
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run preview` — build then start
- `npm run check` — `next lint` + `tsc --noEmit` (run this before considering a change done)
- `npm run lint` / `npm run lint:fix`
- `npm run typecheck`
- `npm run format:check` / `npm run format:write` — Prettier (with `prettier-plugin-tailwindcss`)

There is no test runner configured in this repo.

## Architecture

- App Router lives in `src/app`; path alias `~/*` maps to `src/*` (see `tsconfig.json`).
- Environment variables are validated through `src/env.js` (`@t3-oss/env-nextjs` + zod). Add any new env var to both the zod schema (`server`/`client`) and `runtimeEnv` there, and mirror it in `.env.example`. `next.config.js` imports `src/env.js` so builds fail fast on invalid/missing env vars (bypass with `SKIP_ENV_VALIDATION`).
- `src/lib/utils.ts` re-exports `cn` from the `cn` package (not a local implementation).

### UI (shadcn/ui)

- `components.json` config: style `base-mira`, base color `neutral`, icon library `lucide`. The `base-mira` style means components use **Base UI** primitives (`@base-ui/react`), not Radix — APIs differ (e.g. `render` prop instead of `asChild`). When adding or modifying shadcn components, the `shadcn` skill is available and injects project-specific rules (styling, forms, composition, icons) and a base-vs-radix API reference at `.agents/skills/shadcn/rules/`.
- Global CSS/theme tokens live in `src/styles/globals.css` (Tailwind v4 `@theme` blocks, OKLCH color vars) — edit this file for theme changes rather than creating a new stylesheet.
- Installed UI primitives go in `src/components/ui` (aliased as `~/components/ui`).
