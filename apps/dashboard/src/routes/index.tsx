import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Droplets, Gauge, Route as RouteIcon, Signal, Timer } from "lucide-react";
import { useState } from "react";

import {
  ConsumptionTrendChart,
  EmptyState,
  HourlyChart,
  KpiCard,
  Panel,
  PageHeader,
  RangeSwitch,
  SeverityBadge,
  StatusPill,
  WorkflowBadge,
} from "@/components/dashboard-kit";
import { useDemoData } from "@/demo/demo-data";
import { useDemoScenario } from "@/demo/demo-context";
import { DemoAnimatedNumber } from "@/demo/demo-number";
import { DEMO_TARGETS } from "@/demo/demo-targets";
import {
  eventKindLabel,
  formatNum,
  formatRelative,
  rangeLabel,
  statusLabel,
  type TimeRange,
  type VehicleStatus,
} from "@/lib/fleet-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fleet Overview — SmartT Fuel Intelligence" },
      {
        name: "description",
        content:
          "Fleet-wide fuel efficiency, idle waste, suspected fuel loss and open alerts derived from live vehicle telemetry.",
      },
      { property: "og:title", content: "Fleet Overview — SmartT Fuel Intelligence" },
      {
        property: "og:description",
        content: "Monitor fuel efficiency, idle waste and suspected fuel loss across the whole fleet.",
      },
    ],
  }),
  component: Overview,
});

const statusOrder: VehicleStatus[] = ["moving", "idling", "parked", "maintenance", "offline"];

function Overview() {
  const [range, setRange] = useState<TimeRange>("today");
  const {
    depotStats,
    eventsForRange,
    fleetKpis,
    fleetStatusCounts,
    hourlyUsage,
    seriesForRange,
    vehicleStats,
    vehicles,
  } = useDemoData();
  const { active: demoActive, stage: demoStage } = useDemoScenario();
  const kpis = fleetKpis(range);
  const series = seriesForRange(range);
  const counts = fleetStatusCounts();
  const depots = depotStats(range);
  const stats = vehicleStats(range);

  const worst = [...stats]
    .filter((s) => s.km > 0)
    .sort((a, b) => b.deltaVsBaseline - a.deltaVsBaseline)
    .slice(0, 6);

  const recentEvents = eventsForRange(range)
    .filter((e) => e.severity !== "info" && (e.workflow === "New" || e.workflow === "In Progress"))
    .slice(0, 6);
  const spark = seriesForRange("30d").map((d) => d.fuelL);

  return (
    <>
      <PageHeader
        eyebrow="Fleet operations"
        title="Fuel & Fleet Overview"
        description={`Aggregated from ${vehicles.length} telemetry units · ${rangeLabel[range]}`}
        actions={<RangeSwitch value={range} onChange={setRange} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Fleet fuel efficiency"
          value={formatNum(kpis.fleetEfficiency, 1)}
          unit="L/100km"
          delta={`${kpis.fleetEfficiency > kpis.baselineEfficiency ? "+" : ""}${formatNum(kpis.fleetEfficiency - kpis.baselineEfficiency, 1)}`}
          deltaLabel={`vs baseline ${formatNum(kpis.baselineEfficiency, 1)}`}
          tone={kpis.fleetEfficiency > kpis.baselineEfficiency ? "warn" : "good"}
          spark={spark}
          icon={<Gauge className="h-4 w-4" />}
        />
        <KpiCard
          label="Suspected fuel loss"
          value={
            demoActive ? (
              <DemoAnimatedNumber active={demoActive} value={kpis.suspectedLossL} durationMs={680} />
            ) : (
              formatNum(kpis.suspectedLossL)
            )
          }
          unit="L"
          delta={`${formatNum(kpis.anomalyRate, 2)}%`}
          deltaLabel={`anomaly rate over ${rangeLabel[range].toLowerCase()}`}
          tone={kpis.anomalyRate > 1 ? "bad" : "neutral"}
          icon={<Droplets className="h-4 w-4" />}
          demoTarget={DEMO_TARGETS.OVERVIEW_LOSS_KPI}
          demoEmphasis={demoActive && demoStage === "INCIDENT" ? "strong" : undefined}
        />
        <KpiCard
          label="Idle fuel waste"
          value={formatNum(kpis.idleFuelL)}
          unit="L"
          delta={`${formatNum(kpis.idleShare, 1)}%`}
          deltaLabel="of total fuel used"
          tone={kpis.idleShare > 9 ? "warn" : "neutral"}
          icon={<Timer className="h-4 w-4" />}
        />
        <KpiCard
          label="Open alerts"
          value={
            demoActive ? (
              <DemoAnimatedNumber active={demoActive} value={kpis.openAlerts} durationMs={420} />
            ) : (
              formatNum(kpis.openAlerts)
            )
          }
          delta={`${formatNum(kpis.criticalAlerts)} critical`}
          deltaLabel="awaiting operator review"
          tone={kpis.criticalAlerts > 0 ? "bad" : "good"}
          icon={<AlertTriangle className="h-4 w-4" />}
          demoTarget={DEMO_TARGETS.OVERVIEW_OPEN_ALERTS_KPI}
          demoEmphasis={demoActive && demoStage === "INCIDENT" ? "subtle" : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total distance"
          value={formatNum(kpis.distanceKm)}
          unit="km"
          deltaLabel={`${kpis.activeVehicles} vehicles active`}
          icon={<RouteIcon className="h-4 w-4" />}
        />
        <KpiCard
          label="Fuel consumed"
          value={formatNum(kpis.fuelL)}
          unit="L"
          deltaLabel={`${formatNum(kpis.costPerKm)} ₫/km`}
        />
        <KpiCard
          label="Vehicles above baseline"
          value={formatNum(kpis.vehiclesAboveBaseline)}
          unit={`/ ${kpis.activeVehicles}`}
          deltaLabel="more than 5% over target"
          tone={kpis.vehiclesAboveBaseline > kpis.activeVehicles / 3 ? "warn" : "neutral"}
        />
        <KpiCard
          label="Data availability"
          value={formatNum(kpis.dataAvailability, 1)}
          unit="%"
          deltaLabel="units online with healthy sensor"
          tone={kpis.dataAvailability < 90 ? "warn" : "good"}
          icon={<Signal className="h-4 w-4" />}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel
          title="Consumption vs baseline"
          subtitle={`Daily fleet totals · ${rangeLabel[range]}`}
          bodyClassName="p-4"
        >
          <ConsumptionTrendChart data={series} interval={range === "30d" ? 4 : range === "7d" ? 0 : 0} />
        </Panel>

        <Panel title="Fleet status" subtitle="Current telemetry state">
          <ul className="space-y-3">
            {statusOrder.map((s) => {
              const value = counts[s];
              const pct = Math.round((value / vehicles.length) * 100);
              return (
                <li key={s}>
                  <div className="flex items-center justify-between text-sm">
                    <StatusPill status={s} />
                    <span className="num text-sm font-semibold">
                      {value}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">{pct}%</span>
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={
                        s === "moving" ? "h-full rounded-full bg-primary" : s === "idling" ? "h-full rounded-full bg-warning" : "h-full rounded-full bg-neutral"
                      }
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <Link
            to="/live-map"
            className="mt-5 inline-flex w-full items-center justify-center rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold transition-colors hover:bg-surface-2"
          >
            Open Live Map
          </Link>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Hourly fuel usage" subtitle="Today, derived from ignition telemetry" bodyClassName="p-4">
          <HourlyChart data={hourlyUsage} />
        </Panel>

        <Panel title="Depot performance" subtitle={`Efficiency vs baseline · ${rangeLabel[range]}`} bodyClassName="p-0">
          <div className="overflow-x-auto scroll-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Depot</th>
                  <th className="px-3 py-3 text-right font-medium">Units</th>
                  <th className="px-3 py-3 text-right font-medium">Distance</th>
                  <th className="px-3 py-3 text-right font-medium">L/100km</th>
                  <th className="px-5 py-3 text-right font-medium">Suspected loss</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {depots.map((d) => (
                  <tr key={d.depotId} className="transition-colors hover:bg-surface">
                    <td className="px-5 py-3 font-medium">{d.depot}</td>
                    <td className="num px-3 py-3 text-right text-muted-foreground">{d.vehicles}</td>
                    <td className="num px-3 py-3 text-right text-muted-foreground">{formatNum(d.km)} km</td>
                    <td className="num px-3 py-3 text-right">
                      <span className={d.efficiency > d.baseline ? "text-warning" : "text-success"}>
                        {formatNum(d.efficiency, 1)}
                      </span>
                      <span className="text-xs text-muted-foreground"> / {formatNum(d.baseline, 1)}</span>
                    </td>
                    <td className="num px-5 py-3 text-right">{formatNum(d.suspectedLossL)} L</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel
          title="Vehicles above baseline"
          subtitle={`Largest efficiency gap · ${rangeLabel[range]}`}
          bodyClassName="p-0"
        >
          {worst.length ? (
            <ul className="divide-y divide-border">
              {worst.map((s) => (
                <li key={s.vehicle.id}>
                  <Link
                    to="/vehicles/$vehicleId"
                    params={{ vehicleId: s.vehicle.id }}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="num truncate text-sm font-semibold">{s.vehicle.plate}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.vehicle.driver} · {s.vehicle.location}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="num text-sm font-semibold">{formatNum(s.efficiency, 1)} L/100km</p>
                      <p className={`num text-xs ${s.deltaVsBaseline > 0 ? "text-warning" : "text-success"}`}>
                        {s.deltaVsBaseline > 0 ? "+" : ""}
                        {formatNum(s.deltaVsBaseline, 1)} vs baseline
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No active vehicles in this range" hint="Try a wider time range." />
          )}
        </Panel>

        <Panel
          title="Latest alerts"
          subtitle="Critical and warning events"
          bodyClassName="p-0"
          actions={
            <Link to="/alerts" className="text-xs font-semibold text-primary hover:underline">
              View all
            </Link>
          }
        >
          {recentEvents.length ? (
            <ul className="divide-y divide-border">
              {recentEvents.map((e) => (
                <li key={e.id}>
                  <Link
                    to="/alerts"
                    search={{ event: e.id }}
                    className="flex flex-col gap-2 px-5 py-3 transition-colors hover:bg-surface"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={e.severity} />
                      <span className="num text-sm font-semibold">{e.plate}</span>
                      <span className="text-xs text-muted-foreground">{eventKindLabel[e.kind]}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{e.detail}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <WorkflowBadge status={e.workflow} />
                      <span className="num text-[11px] text-muted-foreground">
                        {e.location} · {e.time}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No alerts raised" hint="All telemetry is within expected thresholds." />
          )}
        </Panel>
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground">
        Offline units report {statusLabel.offline.toLowerCase()} state with last known data —
        {` ${vehicles.filter((v) => !v.online).length} unit(s) last seen ${formatRelative(
          Math.min(...vehicles.filter((v) => !v.online).map((v) => v.lastSeenMin)),
        )}.`}
      </p>
    </>
  );
}
