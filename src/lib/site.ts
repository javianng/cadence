import { env } from "~/env";

/** Shared SEO copy + canonical URL for metadata, sitemap, robots and OG image. */
export const siteConfig = {
  name: "Cadence",
  tagline: "Continuous pricing for sustainability-linked loans",
  description:
    "Cadence replaces the annual reset in sustainability-linked loans with continuous verification: an AI agent checks borrower KPI data every period, deterministic code scores the transition, and a Polygon smart contract adjusts the margin — with humans approving every step-up.",
  keywords: [
    "sustainability-linked loans",
    "SLL",
    "green finance",
    "transition finance",
    "ESG",
    "KPI verification",
    "margin ratchet",
    "agentic AI",
    "blockchain",
    "Polygon",
    "greenwashing",
    "Singapore",
  ],
  url: (
    env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  ).replace(/\/$/, ""),
} as const;
