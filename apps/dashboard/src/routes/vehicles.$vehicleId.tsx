import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Fuel, Gauge, MapPin, Timer } from "lucide-react";
import { useState } from "react";

import {
  EmptyState,
  FuelLevelChart,
  KpiCard,
  Panel,
  PageHeader,
  RangeSwitch,
  SeverityBadge,
  StatusPill,
  WorkflowBadge,
} from "@/components/dashboard-kit";
import { useDemoData, liveVehicleForRoute } from "@/demo/demo-data";
import { FleetMap, MapLegend, type MapMarker } from "@/components/fleet-map";
import { statusTone } from "@/routes/live-map";
import {
  dayKeys,
  depotById,
  eventKindLabel,
  eventsForRange,
  eventsForVehicle,
  formatDate,
  formatNum,
  formatRelative,
  rangeLabel,
  routeById,
  vehicleById,
  type TimeRange,
} from "@/lib/fleet-data";

export const Route = createFileRoute("/vehicles/$vehicleId")({
  loader: ({ params }) => {
    const vehicle = vehicleById(params.vehicleId) ?? liveVehicleForRoute(params.vehicleId);
    if (!vehicle) throw notFound();
    return { plate: vehicle.plate };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Vehicle unavailable — SmartT" }, { name: "robots", content: "noindex" }] };
    }
    return {
      meta: [
        { title: `${loaderData.plate} — Vehicle Telemetry | SmartT` },
        {
          name: "description",
          content: `Current GPS position, tank level, trip history and fuel events for vehicle ${loaderData.plate}.`,
        },
        { property: "og:title", content: `${loaderData.plate} — Vehicle Telemetry | SmartT` },
        { property: "og:description", content: "Per-vehicle telemetry, route replay and fuel event context." },
      ],
    };
  },
  component: VehicleDetail,
});

function VehicleDetail() {
  const { vehicleId } = Route.useParams();
  const [range, setRange] = useState<TimeRange>("7d");
  const data = useDemoData();
  const vehicle = data.vehicleById(vehicleId)!;
  const stat = data.vehicleStats(range).find((s) => s.vehicle.id === vehicleId)!;
  const events = data.eventsForVehicle(vehicleId);
  const rangeEvents = data.eventsForRange(range).filter((e) => e.vehicleId === vehicleId);
  const route = routeById(vehicle.routeId);
  const depot = depotById(vehicle.depotId);

  const todayEvents = events.filter((e) => e.date === dayKeys[dayKeys.length - 1]);
  const markers: MapMarker[] = [
    {
      id: vehicle.id,
      lat: vehicle.lat,
      lng: vehicle.lng,
      tone: statusTone(vehicle.status),
      label: vehicle.plate,
      sublabel: vehicle.online ? "Current position" : "Last known position",
      shape: "vehicle",
    },
    { id: depot.id, lat: depot.lat, lng: depot.lng, tone: "neutral", label: depot.name, shape: "depot" },
    ...rangeEvents
      .filter((e) => e.kind === "fuel_drop" || e.kind === "refueling" || e.kind === "route_deviation")
      .slice(0, 6)
      .map((e) => ({
        id: e.id,
        lat: e.lat,
        lng: e.lng,
        tone:
          e.kind === "refueling"
            ? ("success" as const)
            : e.kind === "fuel_drop"
              ? ("destructive" as const)
              : ("primary" as const),
        label: eventKindLabel[e.kind],
        sublabel: `${formatDate(e.date)} ${e.time}`,
        shape: "event" as const,
      })),
  ];

  const fuelMarkers = todayEvents
    .filter((e) => e.kind === "fuel_drop" || e.kind === "refueling")
    .map((e) => ({
      hour: Number(e.time.slice(0, 2)),
      tone: e.kind === "refueling" ? ("success" as const) : ("destructive" as const),
    }));

  return (
    <>
      <Link
        to="/vehicles"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to vehicles
      </Link>

      <PageHeader
        eyebrow={`${vehicle.type} · ${depot.name}`}
        title={vehicle.plate}
        description={`${vehicle.model} · Driver ${vehicle.driver} · ${route.name}`}
        actions={
          <>
            <StatusPill status={vehicle.status} />
            <RangeSwitch value={range} onChange={setRange} />
          </>
        }
      />

      {!vehicle.online ? (
        <div className="mb-4 rounded-lg border border-border bg-surface-2 px-4 py-3 text-xs text-muted-foreground">
          This unit is offline. All values below are <strong className="font-semibold text-foreground">last known data</strong>{" "}
          captured {formatRelative(vehicle.lastSeenMin)}.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Tank level"
          value={vehicle.fuelPct.toFixed(0)}
          unit="%"
          deltaLabel={`${Math.round((vehicle.fuelPct / 100) * vehicle.tankL)} L of ${vehicle.tankL} L`}
          tone={vehicle.fuelPct < 15 ? "bad" : vehicle.fuelPct < 30 ? "warn" : "neutral"}
          icon={<Fuel className="h-4 w-4" />}
          spark={vehicle.telemetry.map((t) => t.fuelPct)}
        />
        <KpiCard
          label="Efficiency"
          value={stat.km > 0 ? formatNum(stat.efficiency, 1) : "—"}
          {...(stat.km > 0
            ? {
                unit: "L/100km",
                delta: `${stat.deltaVsBaseline > 0 ? "+" : ""}${formatNum(stat.deltaVsBaseline, 1)}`,
              }
            : {})}
          deltaLabel={`baseline ${formatNum(vehicle.baseline, 1)} · ${rangeLabel[range]}`}
          tone={stat.deltaVsBaseline > 0.5 ? "warn" : "good"}
          icon={<Gauge className="h-4 w-4" />}
        />
        <KpiCard
          label="Idle fuel waste"
          value={formatNum(stat.idleFuelL, 1)}
          unit="L"
          deltaLabel={`${formatNum(stat.idleMinutes)} idle minutes`}
          tone={stat.idleFuelL > 12 ? "warn" : "neutral"}
          icon={<Timer className="h-4 w-4" />}
        />
        <KpiCard
          label="Suspected fuel loss"
          value={formatNum(stat.suspectedLossL, 1)}
          unit="L"
          deltaLabel={`${rangeEvents.filter((e) => e.kind === "fuel_drop").length} event(s) in ${rangeLabel[range].toLowerCase()}`}
          tone={stat.suspectedLossL > 0 ? "bad" : "good"}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel
          title="Current location & recent route"
          subtitle={`${vehicle.location} · heading ${Math.round(vehicle.heading)}°`}
          bodyClassName="p-0"
        >
          <FleetMap markers={markers} path={vehicle.trail} height={380} />
          <div className="border-t border-border px-5 py-3">
            <MapLegend
              items={[
                { tone: statusTone(vehicle.status), label: vehicle.online ? "Current position" : "Last known position" },
                { tone: "destructive", label: "Suspected fuel loss" },
                { tone: "success", label: "Refueling event" },
                { tone: "primary", label: "Route deviation" },
                { tone: "neutral", label: "Depot" },
              ]}
            />
          </div>
        </Panel>

        <Panel title="Telemetry snapshot" subtitle={`Updated ${formatRelative(vehicle.lastSeenMin)}`}>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Speed" value={`${formatNum(vehicle.speedKph)} km/h`} />
            <Field label="Ignition" value={vehicle.ignition ? "On" : "Off"} />
            <Field label="Odometer" value={`${formatNum(vehicle.odometer)} km`} />
            <Field label="Engine hours" value={`${formatNum(vehicle.engineHours)} h`} />
            <Field label="Fuel sensor" value={vehicle.sensorHealthy ? "Reporting normally" : "Error — check wiring"} />
            <Field label="Telemetry link" value={vehicle.online ? "Online" : "Offline"} />
            <Field label="Depot" value={depot.name} />
            <Field label="Assigned route" value={route.name} />
            <Field label="Distance in range" value={`${formatNum(stat.km)} km`} />
            <Field label="Fuel used in range" value={`${formatNum(stat.fuelL, 1)} L`} />
          </dl>
          <div className="mt-5 flex items-start gap-2 rounded-lg border border-border bg-surface p-3 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Positions come from the on-board GPS module; fuel values come from the tank level sensor. No external
            fuel-station or camera systems are connected.
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Tank level over the last 24 hours" subtitle="Step changes mark refueling or sudden drops" bodyClassName="p-4">
          <FuelLevelChart data={vehicle.telemetry} markers={fuelMarkers} />
        </Panel>

        <Panel title="Event history" subtitle={`${rangeEvents.length} event(s) · ${rangeLabel[range]}`} bodyClassName="p-0">
          {rangeEvents.length ? (
            <ul className="max-h-[340px] divide-y divide-border overflow-y-auto scroll-slim">
              {rangeEvents.map((e) => (
                <li key={e.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={e.severity} />
                    <span className="text-xs font-semibold">{eventKindLabel[e.kind]}</span>
                    <WorkflowBadge status={e.workflow} />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">{e.detail}</p>
                  <p className="num mt-1 text-[11px] text-muted-foreground">
                    {formatDate(e.date)} {e.time} · {e.location}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No events for this vehicle" hint="Telemetry has stayed within thresholds." />
          )}
        </Panel>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{label}</dt>
      <dd className="num mt-0.5 truncate text-sm font-medium">{value}</dd>
    </div>
  );
}
