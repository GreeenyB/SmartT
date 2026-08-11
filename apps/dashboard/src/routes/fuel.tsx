import { createFileRoute, Link } from "@tanstack/react-router";
import { Droplets, FileText, Fuel, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";

import {
  ConsumptionTrendChart,
  EmptyState,
  KpiCard,
  Panel,
  PageHeader,
  RangeSwitch,
  SeverityBadge,
  WorkflowBadge,
} from "@/components/dashboard-kit";
import { FleetMap, MapLegend, type MapMarker } from "@/components/fleet-map";
import {
  depotStats,
  eventKindLabel,
  eventsForRange,
  fleetKpis,
  formatDate,
  formatNum,
  formatVnd,
  rangeLabel,
  refuelEventsForRange,
  seriesForRange,
  vehicleStats,
  type TimeRange,
} from "@/lib/fleet-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/fuel")({
  head: () => ({
    meta: [
      { title: "Fuel Analytics — SmartT" },
      {
        name: "description",
        content:
          "Analyse fuel consumption against baseline, review suspected fuel loss and reconcile detected refueling events with receipts.",
      },
      { property: "og:title", content: "Fuel Analytics — SmartT" },
      { property: "og:description", content: "Consumption vs baseline, suspected fuel loss and refueling reconciliation." },
    ],
  }),
  component: FuelAnalytics,
});

type Tab = "loss" | "refuel";

function FuelAnalytics() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [tab, setTab] = useState<Tab>("loss");
  const [selected, setSelected] = useState<string | null>(null);

  const kpis = fleetKpis(range);
  const series = seriesForRange(range);
  const depots = depotStats(range);
  const stats = vehicleStats(range);

  const lossEvents = useMemo(
    () => eventsForRange(range).filter((e) => e.kind === "fuel_drop" || e.kind === "overconsumption"),
    [range],
  );
  const rangeRefuels = useMemo(() => refuelEventsForRange(range), [range]);

  const markers: MapMarker[] = useMemo(
    () =>
      (tab === "loss" ? lossEvents.slice(0, 12) : rangeRefuels).map((e) => ({
        id: e.id,
        lat: e.lat,
        lng: e.lng,
        tone:
          tab === "refuel"
            ? ("success" as const)
            : "severity" in e && e.severity === "critical"
              ? ("destructive" as const)
              : ("warning" as const),
        label: e.plate,
        sublabel: tab === "loss" && "kind" in e ? eventKindLabel[e.kind] : "Detected refueling event",
        shape: "event" as const,
      })),
    [tab, lossEvents, rangeRefuels],
  );

  const topLoss = [...stats].sort((a, b) => b.suspectedLossL - a.suspectedLossL).slice(0, 5);
  const reconciled = rangeRefuels.filter((r) => r.receiptLiters !== null);
  const varianceTotal = reconciled.reduce((sum, r) => sum + Math.abs(r.varianceL ?? 0), 0);

  return (
    <>
      <PageHeader
        eyebrow="Fuel intelligence"
        title="Fuel Analytics"
        description={`Consumption, anomalies and refueling reconciliation · ${rangeLabel[range]}`}
        actions={
          <RangeSwitch
            value={range}
            onChange={(next) => {
              setRange(next);
              setSelected(null);
            }}
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Fuel consumed"
          value={formatNum(kpis.fuelL)}
          unit="L"
          deltaLabel={`${formatVnd(kpis.fuelCostVnd)} at configured reference price`}
          icon={<Fuel className="h-4 w-4" />}
          spark={series.map((s) => s.fuelL)}
        />
        <KpiCard
          label="Suspected fuel loss"
          value={formatNum(kpis.suspectedLossL)}
          unit="L"
          delta={`${formatNum(kpis.anomalyRate, 2)}%`}
          deltaLabel="of fuel used in the same range"
          tone={kpis.anomalyRate > 1 ? "bad" : "neutral"}
          icon={<Droplets className="h-4 w-4" />}
        />
        <KpiCard
          label="Consumption vs baseline"
          value={formatNum(kpis.fleetEfficiency, 1)}
          unit="L/100km"
          delta={`${kpis.fleetEfficiency > kpis.baselineEfficiency ? "+" : ""}${formatNum(kpis.fleetEfficiency - kpis.baselineEfficiency, 1)}`}
          deltaLabel={`baseline ${formatNum(kpis.baselineEfficiency, 1)}`}
          tone={kpis.fleetEfficiency > kpis.baselineEfficiency ? "warn" : "good"}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiCard
          label="Receipt variance"
          value={formatNum(varianceTotal, 1)}
          unit="L"
          deltaLabel={`${reconciled.length} of ${rangeRefuels.length} refuels have a receipt entered`}
          tone={varianceTotal > 40 ? "warn" : "neutral"}
          icon={<FileText className="h-4 w-4" />}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="Consumption vs baseline" subtitle={`Daily totals · ${rangeLabel[range]}`} bodyClassName="p-4">
          <ConsumptionTrendChart data={series} interval={range === "30d" ? 4 : 0} />
        </Panel>

        <Panel title="Suspected loss by depot" subtitle={rangeLabel[range]} bodyClassName="p-5">
          <ul className="space-y-4">
            {depots.map((d) => {
              const max = Math.max(...depots.map((x) => x.suspectedLossL), 1);
              return (
                <li key={d.depotId}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate font-medium">{d.depot}</span>
                    <span className="num text-sm font-semibold">{formatNum(d.suspectedLossL)} L</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(d.suspectedLossL / max) * 100}%` }}
                    />
                  </div>
                  <p className="num mt-1 text-[11px] text-muted-foreground">
                    {d.incidents} suspected loss event(s) · {d.vehicles} vehicles
                  </p>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="mt-4 flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5 text-xs">
        {(["loss", "refuel"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setSelected(null);
            }}
            aria-pressed={tab === t}
            className={cn(
              "rounded-md px-3 py-1.5 font-semibold transition-colors",
              tab === t ? "bg-primary-soft text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "loss" ? "Fuel anomalies" : "Detected refueling events"}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {tab === "loss" ? (
          <Panel title="Fuel anomalies" subtitle="Pending operator verification — not confirmed theft" bodyClassName="p-0">
            {lossEvents.length ? (
              <ul className="max-h-[440px] divide-y divide-border overflow-y-auto scroll-slim">
                {lossEvents.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(e.id)}
                      className={cn(
                        "w-full px-5 py-3 text-left transition-colors hover:bg-surface",
                        selected === e.id && "bg-surface",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={e.severity} />
                        <span className="num text-sm font-semibold">{e.plate}</span>
                        <span className="text-xs text-muted-foreground">{eventKindLabel[e.kind]}</span>
                        <WorkflowBadge status={e.workflow} />
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">{e.detail}</p>
                      <p className="num mt-1 text-[11px] text-muted-foreground">
                        {formatDate(e.date)} {e.time} · {e.location} ·{" "}
                        {e.kind === "fuel_drop"
                          ? `${formatNum(e.metric.litersLost ?? 0, 1)} L unaccounted`
                          : `${formatNum(e.metric.overPct ?? 0, 1)}% over baseline`}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No fuel anomalies detected" hint="Tank readings match expected consumption." />
            )}
          </Panel>
        ) : (
          <Panel
            title="Detected refueling events"
            subtitle="Tank increases from the level sensor, optionally matched to a manually entered receipt"
            bodyClassName="p-0"
          >
            <div className="overflow-x-auto scroll-slim">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Event</th>
                    <th className="px-3 py-3 font-medium">Vehicle</th>
                    <th className="px-3 py-3 text-right font-medium">Sensor</th>
                    <th className="px-3 py-3 text-right font-medium">Receipt</th>
                    <th className="px-5 py-3 text-right font-medium">Difference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rangeRefuels.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelected(r.id)}
                      className={cn("cursor-pointer transition-colors hover:bg-surface", selected === r.id && "bg-surface")}
                    >
                      <td className="px-5 py-3">
                        <p className="num text-xs font-semibold">{r.id}</p>
                        <p className="num text-[11px] text-muted-foreground">
                          {formatDate(r.date)} {r.time} · {r.site}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          to="/vehicles/$vehicleId"
                          params={{ vehicleId: r.vehicleId }}
                          className="num text-xs font-semibold hover:text-primary"
                        >
                          {r.plate}
                        </Link>
                        <p className="truncate text-[11px] text-muted-foreground">{r.driver}</p>
                      </td>
                      <td className="num px-3 py-3 text-right">{formatNum(r.sensorLiters)} L</td>
                      <td className="num px-3 py-3 text-right">
                        {r.receiptLiters === null ? (
                          <span className="text-xs text-muted-foreground">Not entered</span>
                        ) : (
                          `${formatNum(r.receiptLiters)} L`
                        )}
                      </td>
                      <td className="num px-5 py-3 text-right">
                        {r.varianceL === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={Math.abs(r.varianceL) > 6 ? "text-warning" : "text-muted-foreground"}>
                            {r.varianceL > 0 ? "+" : ""}
                            {formatNum(r.varianceL, 1)} L
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-border px-5 py-3 text-[11px] text-muted-foreground">
              Receipts are entered manually by the operator. SmartT is not connected to fuel-station point-of-sale systems.
            </p>
          </Panel>
        )}

        <div className="grid gap-4">
          <Panel
            title={tab === "loss" ? "Where anomalies happened" : "Where refueling happened"}
            subtitle="GPS position captured at detection time"
            bodyClassName="p-0"
          >
            <FleetMap markers={markers} height={300} selectedId={selected} onSelect={setSelected} />
            <div className="border-t border-border px-5 py-3">
              <MapLegend
                items={
                  tab === "loss"
                    ? [
                        { tone: "destructive", label: "Suspected fuel loss" },
                        { tone: "warning", label: "Overconsumption anomaly" },
                      ]
                    : [{ tone: "success", label: "Detected refueling event" }]
                }
              />
            </div>
          </Panel>

          <Panel title="Highest suspected loss" subtitle={`By vehicle · ${rangeLabel[range]}`} bodyClassName="p-0">
            {topLoss.some((s) => s.suspectedLossL > 0) ? (
              <ul className="divide-y divide-border">
                {topLoss.map((s) => (
                  <li key={s.vehicle.id}>
                    <Link
                      to="/vehicles/$vehicleId"
                      params={{ vehicleId: s.vehicle.id }}
                      className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface"
                    >
                      <div className="min-w-0">
                        <p className="num truncate text-sm font-semibold">{s.vehicle.plate}</p>
                        <p className="truncate text-xs text-muted-foreground">{s.vehicle.driver}</p>
                      </div>
                      <span className="num shrink-0 text-sm font-semibold">{formatNum(s.suspectedLossL, 1)} L</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No suspected loss in this range" />
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
