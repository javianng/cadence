"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";
import { ON_TRACK_SCORE } from "~/lib/scoring";
import { cn } from "~/lib/utils";
import { DEMO_LOANS } from "~/lib/demo-loans";
import { RULE_LABELS, STATUS_LABELS } from "~/lib/format";
import type { LoanStatus } from "~/lib/data/types";

/** Colour follows the loan (fixed categorical slot), never its rank. */
export function loanColor(loanId: string): string {
  const slot = DEMO_LOANS.findIndex((l) => l.id === loanId);
  return slot >= 0 && slot < 3
    ? `var(--series-${slot + 1})`
    : "var(--series-muted)";
}

const STATUS_COLOR: Record<LoanStatus, string> = {
  on_track: "var(--status-good)",
  watch: "var(--status-warning)",
  under_review: "var(--status-critical)",
};

const weekLabel = (label: unknown) => `Week ${String(label)}`;

const axisProps = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
} as const;

// --- Score trend (one or more loans) ------------------------------------------

export type ScoreSeries = {
  id: string;
  label: string;
  points: { period: number; score: number }[];
};

export function ScoreTrendChart({
  series,
  className,
}: {
  series: ScoreSeries[];
  className?: string;
}) {
  const periods = [
    ...new Set(series.flatMap((s) => s.points.map((p) => p.period))),
  ].sort((a, b) => a - b);
  const data = periods.map((period) => ({
    period,
    ...Object.fromEntries(
      series.map((s) => [
        s.id,
        s.points.find((p) => p.period === period)?.score ?? null,
      ]),
    ),
  }));
  const config: ChartConfig = Object.fromEntries(
    series.map((s) => [
      s.id,
      {
        label: s.label,
        color: series.length === 1 ? "var(--series-1)" : loanColor(s.id),
      },
    ]),
  );

  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto h-64 w-full", className)}
    >
      <LineChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="period"
          {...axisProps}
          tickFormatter={(p: number) => `W${p}`}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 40, 70, 100]}
          width={32}
          {...axisProps}
        />
        <ReferenceLine
          y={ON_TRACK_SCORE}
          stroke="var(--series-muted)"
          strokeDasharray="4 4"
          label={{
            value: "On track",
            position: "insideTopLeft",
            fontSize: 10,
            fill: "var(--muted-foreground)",
          }}
        />
        <ChartTooltip
          content={<ChartTooltipContent labelFormatter={weekLabel} />}
        />
        {series.map((s) => (
          <Line
            key={s.id}
            dataKey={s.id}
            type="monotone"
            stroke={`var(--color-${s.id})`}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
          />
        ))}
        {series.length > 1 ? (
          <ChartLegend content={<ChartLegendContent />} />
        ) : null}
      </LineChart>
    </ChartContainer>
  );
}

// --- Cadence margin vs the annual model ---------------------------------------

export function MarginVsAnnualChart({
  points,
  className,
}: {
  points: { period: number; cadenceBps: number; annualBps: number }[];
  className?: string;
}) {
  const data = points.map((p) => ({
    period: p.period,
    cadence: p.cadenceBps / 100,
    annual: p.annualBps / 100,
  }));
  const values = data.flatMap((d) => [d.cadence, d.annual]);
  const min = Math.floor((Math.min(...values) - 0.25) * 4) / 4;
  const max = Math.ceil((Math.max(...values) + 0.25) * 4) / 4;
  const config = {
    cadence: { label: "Cadence margin", color: "var(--series-1)" },
    annual: { label: "Annual model", color: "var(--series-muted)" },
  } satisfies ChartConfig;

  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto h-64 w-full", className)}
    >
      <LineChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="period"
          {...axisProps}
          tickFormatter={(p: number) => `W${p}`}
        />
        <YAxis
          domain={[min, max]}
          width={44}
          {...axisProps}
          tickFormatter={(v: number) => `${v.toFixed(2)}%`}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={weekLabel}
              formatter={(value, name) => (
                <div className="flex w-full justify-between gap-4">
                  <span className="text-muted-foreground">
                    {config[name as keyof typeof config]?.label}
                  </span>
                  <span className="font-mono tabular-nums">
                    {Number(value).toFixed(2)}%
                  </span>
                </div>
              )}
            />
          }
        />
        <Line
          dataKey="annual"
          type="stepAfter"
          stroke="var(--color-annual)"
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={false}
        />
        <Line
          dataKey="cadence"
          type="stepAfter"
          stroke="var(--color-cadence)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <ChartLegend content={<ChartLegendContent />} />
      </LineChart>
    </ChartContainer>
  );
}

// --- KPI vs glide path -----------------------------------------------------------

export function KpiGlideChart({
  points,
  unit,
  className,
}: {
  points: { period: number; actual: number | null; glide: number }[];
  unit: string;
  className?: string;
}) {
  const config = {
    actual: { label: "Reported (accepted)", color: "var(--series-1)" },
    glide: { label: "Glide path", color: "var(--series-muted)" },
  } satisfies ChartConfig;
  const fmt = (v: number) =>
    Math.abs(v) >= 1000
      ? v.toLocaleString("en-SG", { maximumFractionDigits: 0 })
      : v.toFixed(2);

  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto h-52 w-full", className)}
    >
      <LineChart data={points} margin={{ left: 0, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="period"
          {...axisProps}
          tickFormatter={(p: number) => `W${p}`}
        />
        <YAxis
          domain={["auto", "auto"]}
          width={52}
          {...axisProps}
          tickFormatter={fmt}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={weekLabel}
              formatter={(value, name) => (
                <div className="flex w-full justify-between gap-4">
                  <span className="text-muted-foreground">
                    {config[name as keyof typeof config]?.label}
                  </span>
                  <span className="font-mono tabular-nums">
                    {fmt(Number(value))} {unit}
                  </span>
                </div>
              )}
            />
          }
        />
        <Line
          dataKey="glide"
          stroke="var(--color-glide)"
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={false}
        />
        <Line
          dataKey="actual"
          stroke="var(--color-actual)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          connectNulls
        />
        <ChartLegend content={<ChartLegendContent />} />
      </LineChart>
    </ChartContainer>
  );
}

// --- Status donut -------------------------------------------------------------------

export function StatusDonut({
  counts,
  className,
}: {
  counts: Record<LoanStatus, number>;
  className?: string;
}) {
  const data = (Object.keys(STATUS_LABELS) as LoanStatus[])
    .map((status) => ({
      status,
      count: counts[status] ?? 0,
      fill: STATUS_COLOR[status],
    }))
    .filter((d) => d.count > 0);
  const config: ChartConfig = Object.fromEntries(
    (Object.keys(STATUS_LABELS) as LoanStatus[]).map((s) => [
      s,
      { label: STATUS_LABELS[s], color: STATUS_COLOR[s] },
    ]),
  );
  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <ChartContainer
      config={config}
      className={cn("aspect-square h-56", className)}
    >
      <PieChart>
        <ChartTooltip
          content={<ChartTooltipContent nameKey="status" hideLabel />}
        />
        <Pie
          data={data}
          dataKey="count"
          nameKey="status"
          innerRadius="60%"
          outerRadius="85%"
          strokeWidth={2}
          stroke="var(--card)"
          label={false}
        >
          {data.map((d) => (
            <Cell key={d.status} fill={d.fill} />
          ))}
        </Pie>
        <text
          x="50%"
          y="46%"
          textAnchor="middle"
          className="fill-foreground text-xl font-semibold"
        >
          {total}
        </text>
        <text
          x="50%"
          y="56%"
          textAnchor="middle"
          className="fill-muted-foreground text-[10px]"
        >
          loans
        </text>
        <ChartLegend content={<ChartLegendContent nameKey="status" />} />
      </PieChart>
    </ChartContainer>
  );
}

// --- Single-series bars ----------------------------------------------------------------

export function CountBarChart({
  data,
  label,
  className,
  layout = "vertical",
}: {
  data: { key: string; label: string; count: number }[];
  label: string;
  className?: string;
  layout?: "vertical" | "horizontal";
}) {
  const config = {
    count: { label, color: "var(--series-1)" },
  } satisfies ChartConfig;
  const horizontalBars = layout === "vertical";
  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto h-56 w-full", className)}
    >
      <BarChart
        data={data}
        layout={horizontalBars ? "vertical" : "horizontal"}
        margin={{ left: 0, right: 16, top: 8 }}
        barCategoryGap={4}
      >
        <CartesianGrid horizontal={!horizontalBars} vertical={horizontalBars} />
        {horizontalBars ? (
          <>
            <XAxis type="number" allowDecimals={false} {...axisProps} />
            <YAxis type="category" dataKey="label" width={96} {...axisProps} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" {...axisProps} />
            <YAxis allowDecimals={false} width={28} {...axisProps} />
          </>
        )}
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent hideIndicator />}
        />
        <Bar dataKey="count" fill="var(--color-count)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}

/** Distribution of transition scores in 10-point bins. */
export function ScoreHistogram({
  scores,
  className,
}: {
  scores: number[];
  className?: string;
}) {
  const bins = Array.from({ length: 10 }, (_, i) => ({
    key: String(i),
    label: `${i * 10}–${i * 10 + 9}`,
    count: scores.filter((s) => Math.min(9, Math.floor(s / 10)) === i).length,
  }));
  return (
    <CountBarChart
      data={bins}
      label="Loan-weeks"
      layout="horizontal"
      className={className}
    />
  );
}

export function EscalationsByRuleChart({
  counts,
  className,
}: {
  counts: Map<string, number>;
  className?: string;
}) {
  const data = Object.keys(RULE_LABELS)
    .map((code) => ({
      key: code,
      label: RULE_LABELS[code]!,
      count: counts.get(code) ?? 0,
    }))
    .sort((a, b) => b.count - a.count);
  return (
    <CountBarChart data={data} label="Escalations" className={className} />
  );
}

// --- KPI drift heatmap (HTML grid) ---------------------------------------------------------

export type HeatmapRow = {
  key: string;
  label: string;
  sublabel?: string;
  cells: { period: number; score: number | null }[];
};

/**
 * Diverging around the on-track score (70): blue = ahead, red = behind,
 * neutral gray at 70. Intensity scales with distance from 70.
 */
function heatColor(score: number | null): string {
  if (score === null) return "transparent";
  const delta = score - ON_TRACK_SCORE;
  const strength = Math.min(1, Math.abs(delta) / ON_TRACK_SCORE);
  const pct = Math.round(15 + strength * 85);
  const pole = delta >= 0 ? "var(--div-pos)" : "var(--div-neg)";
  return `color-mix(in oklab, ${pole} ${pct}%, var(--div-mid))`;
}

export function KpiDriftHeatmap({
  rows,
  periods,
}: {
  rows: HeatmapRow[];
  periods: number[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <div
          className="grid min-w-max gap-0.5 text-[10px]"
          style={{
            gridTemplateColumns: `minmax(10rem, 14rem) repeat(${periods.length}, 1.25rem)`,
          }}
          role="table"
          aria-label="KPI score by week"
        >
          <div role="columnheader" />
          {periods.map((p) => (
            <div
              key={p}
              role="columnheader"
              className="text-muted-foreground text-center tabular-nums"
            >
              {p % 4 === 0 || p === periods[0] || p === periods.at(-1) ? p : ""}
            </div>
          ))}
          {rows.map((row) => (
            <div key={row.key} role="row" className="contents">
              <div
                role="rowheader"
                className="flex min-w-0 flex-col justify-center pr-2"
              >
                <span className="truncate">{row.label}</span>
                {row.sublabel ? (
                  <span className="text-muted-foreground truncate">
                    {row.sublabel}
                  </span>
                ) : null}
              </div>
              {periods.map((p) => {
                const score =
                  row.cells.find((c) => c.period === p)?.score ?? null;
                const text = `${row.label}${row.sublabel ? ` · ${row.sublabel}` : ""} — week ${p}: ${score ?? "no data"}`;
                return (
                  <div
                    key={p}
                    role="cell"
                    title={text}
                    aria-label={text}
                    className="ring-foreground/5 hover:ring-foreground/40 h-6 rounded-[3px] ring-1 ring-inset"
                    style={{ background: heatColor(score) }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="text-muted-foreground flex items-center gap-2 text-[10px]">
        <span>Behind</span>
        <div
          className="h-2 w-40 rounded-full"
          style={{
            background: `linear-gradient(to right, ${heatColor(0)}, ${heatColor(ON_TRACK_SCORE)}, ${heatColor(100)})`,
          }}
        />
        <span>Ahead</span>
        <span className="ml-2">
          Gray = on glide path (score 70). Week number on top.
        </span>
      </div>
    </div>
  );
}
