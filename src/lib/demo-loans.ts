// The three fictional demo facilities. Seeded by scripts/seed.ts; the demo
// panel and simulator read the same definitions. Never use real client names.

import type { Band } from "~/lib/pricing";
import type { KpiDirection } from "~/lib/scoring";

export type Scenario = "improving" | "drifting" | "mismatch";

export type KpiDefinition = {
  id: string;
  name: string;
  unit: string;
  direction: KpiDirection;
  baseline: number;
  finalTarget: number;
  targetPeriod: number;
  weight: number;
  /** Primary/secondary divergence tolerance (fraction). Defaults to RULE_THRESHOLDS.mismatchPct. */
  tolerancePct?: number;
  primarySource: string;
  secondarySource: string;
};

export type DemoLoan = {
  id: string;
  borrower: { id: string; name: string; industry: string; country: string };
  scenario: Scenario;
  currency: "SGD";
  facilityAmount: number;
  baseMarginBps: number;
  floorBps: number;
  capBps: number;
  maxStepBps: number;
  bands: Band[];
  kpis: KpiDefinition[];
};

/** Demo accounts (Firebase Auth users) that play each persona. */
export const DEMO_ACCOUNTS = {
  borrower: "j4vianz01@gmail.com",
  rm: "rm@gmail.com",
  risk: "risk@gmail.com",
} as const;

/** Period 1 starts here; one period = one week. */
export const DEMO_START_DATE = "2026-05-04";
export const PERIOD_DAYS = 7;
/** Seeded history length (periods). */
export const SEED_PERIODS = 20;
/** Glide paths reach their final target after one year of weekly periods. */
export const TARGET_PERIOD = 52;

/** Shared pricing grid: score band -> adjustment vs base margin. */
export const STANDARD_BANDS: Band[] = [
  { minScore: 80, adjustmentBps: -50 },
  { minScore: 60, adjustmentBps: -25 },
  { minScore: 40, adjustmentBps: 0 },
  { minScore: 0, adjustmentBps: 50 },
];

export const DEMO_LOANS: DemoLoan[] = [
  {
    id: "straits-build",
    borrower: {
      id: "straits-build",
      name: "Straits Build Pte Ltd",
      industry: "Construction",
      country: "Singapore",
    },
    scenario: "improving",
    currency: "SGD",
    facilityAmount: 150_000_000,
    baseMarginBps: 250,
    floorBps: 175,
    capBps: 325,
    maxStepBps: 25,
    bands: STANDARD_BANDS,
    kpis: [
      {
        id: "scope12-intensity",
        name: "Scope 1+2 emissions intensity",
        unit: "tCO2e / SGD m revenue",
        direction: "lower_better",
        baseline: 42,
        finalTarget: 30,
        targetPeriod: TARGET_PERIOD,
        weight: 0.5,
        primarySource: "Borrower ESG platform export",
        secondarySource: "Utility meter + fuel card data",
      },
      {
        id: "low-carbon-concrete",
        name: "Low-carbon concrete share",
        unit: "% of volume poured",
        direction: "higher_better",
        baseline: 18,
        finalTarget: 40,
        targetPeriod: TARGET_PERIOD,
        weight: 0.3,
        primarySource: "Site procurement system",
        secondarySource: "Supplier delivery certificates",
      },
      {
        id: "waste-recycled",
        name: "Construction waste recycled",
        unit: "% by weight",
        direction: "higher_better",
        baseline: 55,
        finalTarget: 75,
        targetPeriod: TARGET_PERIOD,
        weight: 0.2,
        primarySource: "Site waste logs",
        secondarySource: "Licensed recycler weighbridge tickets",
      },
    ],
  },
  {
    id: "meridian-aviation",
    borrower: {
      id: "meridian-aviation",
      name: "Meridian Aviation Services",
      industry: "Aviation MRO",
      country: "Singapore",
    },
    scenario: "drifting",
    currency: "SGD",
    facilityAmount: 220_000_000,
    baseMarginBps: 275,
    floorBps: 200,
    capBps: 350,
    maxStepBps: 25,
    bands: STANDARD_BANDS,
    kpis: [
      {
        id: "saf-blend",
        name: "Sustainable aviation fuel blend",
        unit: "% of fuel uplift",
        direction: "higher_better",
        baseline: 2,
        finalTarget: 8,
        targetPeriod: TARGET_PERIOD,
        weight: 0.4,
        primarySource: "Fuel management system",
        secondarySource: "Into-plane supplier invoices",
      },
      {
        id: "fuel-intensity",
        name: "Fuel intensity",
        unit: "L / 100 RTK",
        direction: "lower_better",
        baseline: 32,
        finalTarget: 28.8,
        targetPeriod: TARGET_PERIOD,
        weight: 0.4,
        primarySource: "Flight operations reporting",
        secondarySource: "ADS-B derived fuel burn model",
      },
      {
        id: "electric-gse",
        name: "Electrified ground support equipment",
        unit: "% of fleet",
        direction: "higher_better",
        baseline: 30,
        finalTarget: 60,
        targetPeriod: TARGET_PERIOD,
        weight: 0.2,
        primarySource: "Asset register",
        secondarySource: "Telematics charging logs",
      },
    ],
  },
  {
    id: "lumen-semiconductors",
    borrower: {
      id: "lumen-semiconductors",
      name: "Lumen Semiconductors Sdn Bhd",
      industry: "Semiconductors",
      country: "Malaysia",
    },
    scenario: "mismatch",
    currency: "SGD",
    facilityAmount: 180_000_000,
    baseMarginBps: 225,
    floorBps: 150,
    capBps: 300,
    maxStepBps: 25,
    bands: STANDARD_BANDS,
    kpis: [
      {
        id: "renewable-electricity",
        name: "Renewable electricity share",
        unit: "% of consumption",
        direction: "higher_better",
        baseline: 35,
        finalTarget: 60,
        targetPeriod: TARGET_PERIOD,
        weight: 0.5,
        primarySource: "Fab energy management system",
        secondarySource: "Grid operator REC registry",
      },
      {
        id: "water-intensity",
        name: "Water intensity",
        unit: "m³ / wafer",
        direction: "lower_better",
        baseline: 8,
        finalTarget: 6.5,
        targetPeriod: TARGET_PERIOD,
        weight: 0.3,
        primarySource: "Fab water SCADA",
        secondarySource: "Municipal water utility bills",
      },
      {
        id: "pfc-emissions",
        name: "PFC process emissions",
        unit: "tCO2e (annualised)",
        direction: "lower_better",
        baseline: 12_000,
        finalTarget: 9_000,
        targetPeriod: TARGET_PERIOD,
        weight: 0.2,
        primarySource: "Abatement system logs",
        secondarySource: "Gas purchase records (mass balance)",
      },
    ],
  },
];
