import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, XAxis, YAxis } from "recharts";

import { ChartTooltip, ConsumptionTrendChart, KpiCard, Panel, PageHeader, RangeSwitch, axisProps } from "@/components/dashboard-kit";
import { useDemoData } from "@/demo/demo-data";
import {
  formatNum,
  formatVnd,
  rangeLabel,
  type TimeRange,
  type VehicleStat,
} from "@/lib/fleet-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Analytics & Reports — SmartT" },
      {
        name: "description",
        content: "Daily, weekly and monthly fuel analytics with depot comparison, efficiency ranking and exportable summaries.",
      },
      { property: "og:title", content: "Analytics & Reports — SmartT" },
      { property: "og:description", content: "True daily, weekly and monthly aggregation of fleet fuel telemetry." },
    ],
  }),
  component: Reports,
});

type Grain = "daily" | "weekly" | "range";

function Reports() {
  const [range, setRange] = useState<TimeRange>("30d");
  const [grain, setGrain] = useState<Grain>("daily");
  const { depotStats, fleetKpis, rangeTotalSeries, seriesForRange, vehicleStats, weeklySeriesForRange } = useDemoData();

  const kpis = fleetKpis(range);
  const daily = seriesForRange(range);
  const depots = depotStats(range);
  const stats = vehicleStats(range).filter((s) => s.km > 0);

  const weekly = weeklySeriesForRange(range);
  const rangeTotal = rangeTotalSeries(range);
  const bucketed = grain === "daily" ? daily : grain === "weekly" ? weekly : rangeTotal;

  const best = [...stats].sort((a, b) => a.deltaVsBaseline - b.deltaVsBaseline).slice(0, 5);
  const worst = [...stats].sort((a, b) => b.deltaVsBaseline - a.deltaVsBaseline).slice(0, 5);

  const exportCsv = () => {
    const header = ["Bucket", "Distance (km)", "Fuel (L)", "Baseline (L)", "Suspected loss (L)"];
    const lines = bucketed.map((b) => [b.label, b.km, b.fuelL, b.baselineL, b.anomalyL].join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smartt-${grain}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        eyebrow="Analytics"
        title="Analytics & Reports"
        description={`${grain === "range" ? "Range-total" : `True ${grain}`} aggregation from vehicle telemetry · ${rangeLabel[range]}`}
        actions={
          <>
            <RangeSwitch value={range} onChange={setRange} />
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-surface-2"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total distance" value={formatNum(kpis.distanceKm)} unit="km" deltaLabel={`${kpis.activeVehicles} vehicles active`} />
        <KpiCard label="Average consumption" value={formatNum(kpis.fleetEfficiency, 1)} unit="L/100km" deltaLabel={`baseline ${formatNum(kpis.baselineEfficiency, 1)}`} tone={kpis.fleetEfficiency > kpis.baselineEfficiency ? "warn" : "good"} />
        <KpiCard label="Fuel cost" value={formatVnd(kpis.fuelCostVnd)} deltaLabel={`${formatNum(kpis.costPerKm)} ₫ per km`} />
        <KpiCard label="Fuel anomaly rate" value={formatNum(kpis.anomalyRate, 2)} unit="%" deltaLabel={`${formatNum(kpis.suspectedLossL)} L suspected loss`} tone={kpis.anomalyRate > 1 ? "bad" : "neutral"} />
      </div>

      <div className="mt-4 flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5 text-xs">
        {(["daily", "weekly", "range"] as Grain[]).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGrain(g)}
            aria-pressed={grain === g}
            className={cn(
              "rounded-md px-3 py-1.5 font-semibold capitalize transition-colors",
              grain === g ? "bg-primary-soft text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {g === "range" ? "Range total" : g}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4">
        <Panel
          title={`${grain[0]!.toUpperCase()}${grain.slice(1)} consumption vs baseline`}
          subtitle={
            grain === "daily"
              ? `${daily.length} calendar day(s)`
              : grain === "weekly"
                ? `${weekly.length} weekly bucket(s) within ${rangeLabel[range].toLowerCase()} · final bucket may be partial`
                : `One bucket covering ${rangeLabel[range].toLowerCase()}`
          }
          bodyClassName="p-4"
        >
          {grain === "daily" ? (
            <ConsumptionTrendChart data={daily} interval={range === "30d" ? 4 : 0} />
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bucketed} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis {...axisProps} width={56} />
                  <ChartTooltip />
                  <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11, color: "var(--color-muted-foreground)", paddingTop: 8 }} />
                  <Bar name="Actual fuel used (L)" dataKey="fuelL" fill="var(--color-primary)" radius={[3, 3, 0, 0]} maxBarSize={48} />
                  <Bar name="Baseline (L)" dataKey="baselineL" fill="var(--color-neutral)" fillOpacity={0.45} radius={[3, 3, 0, 0]} maxBarSize={48} />
                  <Bar name="Suspected loss (L)" dataKey="anomalyL" fill="var(--color-destructive)" radius={[3, 3, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Panel title="Depot comparison" subtitle={`Efficiency, distance and anomalies · ${rangeLabel[range]}`} bodyClassName="p-0">
            <div className="overflow-x-auto scroll-slim">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Depot</th>
                    <th className="px-3 py-3 text-right font-medium">Units</th>
                    <th className="px-3 py-3 text-right font-medium">Distance</th>
                    <th className="px-3 py-3 text-right font-medium">Fuel</th>
                    <th className="px-3 py-3 text-right font-medium">L/100km</th>
                    <th className="px-5 py-3 text-right font-medium">Suspected loss</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {depots.map((d) => (
                    <tr key={d.depotId} className="transition-colors hover:bg-surface">
                      <td className="px-5 py-3 font-medium">{d.depot}</td>
                      <td className="num px-3 py-3 text-right text-muted-foreground">{d.vehicles}</td>
                      <td className="num px-3 py-3 text-right">{formatNum(d.km)} km</td>
                      <td className="num px-3 py-3 text-right">{formatNum(d.fuelL)} L</td>
                      <td className="num px-3 py-3 text-right">
                        <span className={d.efficiency > d.baseline ? "text-warning" : "text-success"}>{formatNum(d.efficiency, 1)}</span>
                        <span className="text-xs text-muted-foreground"> / {formatNum(d.baseline, 1)}</span>
                      </td>
                      <td className="num px-5 py-3 text-right">{formatNum(d.suspectedLossL)} L</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid gap-4">
            <Panel title="Best efficiency vs baseline" subtitle="Vehicles running under target" bodyClassName="p-0">
              <Ranking rows={best} />
            </Panel>
            <Panel title="Worst efficiency vs baseline" subtitle="Vehicles to review with maintenance" bodyClassName="p-0">
              <Ranking rows={worst} />
            </Panel>
          </div>
        </div>
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground">
        Weekly and range-total figures are summed from the same daily telemetry records selected above — no rescaling or relabelling of daily data.
      </p>
    </>
  );
}

function Ranking({ rows }: { rows: VehicleStat[] }) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((s) => (
        <li key={s.vehicle.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
          <div className="min-w-0">
            <p className="num truncate text-sm font-semibold">{s.vehicle.plate}</p>
            <p className="truncate text-[11px] text-muted-foreground">{s.vehicle.driver}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="num text-sm font-semibold">{formatNum(s.efficiency, 1)}</p>
            <p className={cn("num text-[11px]", s.deltaVsBaseline > 0 ? "text-warning" : "text-success")}>
              {s.deltaVsBaseline > 0 ? "+" : ""}
              {formatNum(s.deltaVsBaseline, 1)} vs baseline
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
