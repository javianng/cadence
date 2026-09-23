"use client";

import { useEffect, useMemo, useState } from "react";
import { FacilitySwitcher } from "~/components/cadence/borrower-loan";
import { useBorrowerBundle } from "~/components/cadence/borrower-parts";
import { ScoreStatus } from "~/components/cadence/loan-sections";
import {
  ErrorState,
  LoadingCards,
  PageHeader,
  StatCard,
  StatGrid,
} from "~/components/cadence/primitives";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Slider } from "~/components/ui/slider";
import type { Kpi } from "~/lib/data/types";
import { formatBps, formatBpsDelta, formatSgd } from "~/lib/format";
import { findBand, previewMargin } from "~/lib/pricing";
import { glidePathValue, kpiScore, transitionScore } from "~/lib/scoring";

function sliderRange(k: Kpi) {
  const lo = Math.min(k.baseline, k.finalTarget);
  const hi = Math.max(k.baseline, k.finalTarget);
  const pad = (hi - lo) * 0.25;
  return { min: lo - pad, max: hi + pad, step: (hi - lo) / 200 };
}

const fmt = (v: number) =>
  Math.abs(v) >= 1000
    ? v.toLocaleString("en-SG", { maximumFractionDigits: 0 })
    : v.toFixed(2);

/** Client-side only: uses the same scoring + pricing code as the agent and contract. */
export default function WhatIfPage() {
  const { loan, kpis, readings, loading, error } = useBorrowerBundle();
  const [values, setValues] = useState<Record<string, number>>({});
  const period = (loan?.currentPeriod ?? 0) + 1;

  const latest = useMemo(
    () =>
      Object.fromEntries(
        kpis.map((k) => [
          k.kpiId,
          readings.filter((r) => r.kpiId === k.kpiId).at(-1)?.acceptedValue ??
            k.baseline,
        ]),
      ),
    [kpis, readings],
  );
  const glide = useMemo(
    () =>
      Object.fromEntries(
        kpis.map((k) => [
          k.kpiId,
          glidePathValue(k.baseline, k.finalTarget, k.targetPeriod, period),
        ]),
      ),
    [kpis, period],
  );

  // Start from this week's values when the facility (or its latest data)
  // changes — keyed on primitives so a re-render can't retrigger it.
  const resetKey = `${loan?.id ?? ""}:${loan?.currentPeriod ?? 0}:${readings.length}`;
  useEffect(() => {
    setValues(latest);
    // `latest` is derived from the same data as resetKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  if (error) return <ErrorState error={error} />;
  if (loading || !loan) return <LoadingCards />;

  const scores = kpis.map((k) => ({
    id: k.kpiId,
    weight: k.weight,
    score: kpiScore(
      k.direction,
      k.baseline,
      glide[k.kpiId]!,
      values[k.kpiId] ?? latest[k.kpiId]!,
    ),
  }));
  const score = transitionScore(scores);
  const band = findBand(score, loan.bands);
  const params = {
    current: loan.currentMarginBps,
    base: loan.baseMarginBps,
    floor: loan.floorBps,
    cap: loan.capBps,
    maxStep: loan.maxStepBps,
  };
  const next = previewMargin(params, band);
  // Where the margin settles if this performance is sustained.
  const settled = Math.min(
    loan.capBps,
    Math.max(loan.floorBps, loan.baseMarginBps + band.adjustmentBps),
  );
  const yearly =
    ((loan.currentMarginBps - settled) / 10_000) * loan.facilityAmount;

  const preset = (fn: (k: Kpi) => number) =>
    setValues(Object.fromEntries(kpis.map((k) => [k.kpiId, fn(k)])));

  return (
    <>
      <PageHeader
        title="What-if simulator"
        description={`${loan.borrowerName} · see how next week's results would move your score and rate. Nothing here is submitted.`}
        actions={<FacilitySwitcher />}
      />
      <StatGrid cols={4}>
        <StatCard
          label="Projected score"
          value={score}
          hint={`${score - loan.currentScore >= 0 ? "+" : ""}${score - loan.currentScore} vs this week`}
          tone={
            score > loan.currentScore
              ? "good"
              : score < loan.currentScore
                ? "bad"
                : "neutral"
          }
        />
        <StatCard
          label="Next week's margin"
          value={formatBps(next.newMargin)}
          hint={
            next.isIncrease
              ? `${formatBpsDelta(next.step)} — only after your RM approves`
              : next.step === 0
                ? "No change"
                : `${formatBpsDelta(next.step)}, applied automatically`
          }
          tone={next.step < 0 ? "good" : next.step > 0 ? "bad" : "neutral"}
        />
        <StatCard
          label="If sustained"
          value={formatBps(settled)}
          hint={`Pricing band ${band.minScore}+ · moves ${formatBps(loan.maxStepBps)}/week max`}
        />
        <StatCard
          label="Yearly interest impact"
          value={formatSgd(yearly, { compact: true })}
          hint={
            yearly >= 0
              ? "saved vs today's margin, once settled"
              : "extra vs today's margin"
          }
          tone={yearly > 0 ? "good" : yearly < 0 ? "bad" : "neutral"}
        />
      </StatGrid>
      <Card>
        <CardHeader>
          <CardTitle>Next week&apos;s KPIs (week {period})</CardTitle>
          <CardDescription>
            Drag to try different results. 70 = exactly on your glide path.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setValues(latest)}
            >
              This week&apos;s values
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => preset((k) => glide[k.kpiId]!)}
            >
              Exactly on path
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                preset((k) => k.baseline + (glide[k.kpiId]! - k.baseline) * 1.3)
              }
            >
              30% ahead
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                preset((k) => k.baseline + (glide[k.kpiId]! - k.baseline) * 0.5)
              }
            >
              Half the expected progress
            </Button>
          </div>
          {kpis.map((k) => {
            const range = sliderRange(k);
            const value = values[k.kpiId] ?? latest[k.kpiId]!;
            const s = scores.find((x) => x.id === k.kpiId)!.score;
            return (
              <div key={k.kpiId} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{k.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {fmt(value)} {k.unit} · path {fmt(glide[k.kpiId]!)} · score{" "}
                    {s} · <ScoreStatus score={s} />
                  </span>
                </div>
                <Slider
                  aria-label={k.name}
                  min={range.min}
                  max={range.max}
                  step={range.step}
                  value={[value]}
                  onValueChange={(v: number | readonly number[]) => {
                    const next = typeof v === "number" ? v : (v[0] ?? value);
                    setValues((prev) => ({ ...prev, [k.kpiId]: next }));
                  }}
                />
                <div className="text-muted-foreground flex justify-between text-[10px]">
                  <span>
                    {k.direction === "lower_better" ? "Better ←" : "Worse ←"}{" "}
                    {fmt(range.min)}
                  </span>
                  <span>
                    {fmt(range.max)}{" "}
                    {k.direction === "lower_better" ? "→ Worse" : "→ Better"}
                  </span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}
