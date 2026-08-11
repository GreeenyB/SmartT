import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { EmptyState, Panel, PageHeader, StatusPill } from "@/components/dashboard-kit";
import { FleetMap, MapLegend, type MapMarker, type MapTone } from "@/components/fleet-map";
import {
  depots,
  formatNum,
  formatRelative,
  routeById,
  statusLabel,
  vehicles,
  type VehicleStatus,
} from "@/lib/fleet-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/live-map")({
  head: () => ({
    meta: [
      { title: "Live Map — SmartT Fleet Tracking" },
      {
        name: "description",
        content: "Explore every vehicle on the map with simulated GPS position, status, tank level and telemetry timestamp.",
      },
      { property: "og:title", content: "Live Map — SmartT Fleet Tracking" },
      { property: "og:description", content: "Fleet GPS simulation snapshot with status filters and per-vehicle telemetry context." },
    ],
  }),
  component: LiveMap,
});

export const statusTone = (s: VehicleStatus): MapTone =>
  s === "moving" ? "primary" : s === "idling" ? "warning" : "neutral";

const filters: ("all" | VehicleStatus)[] = ["all", "moving", "idling", "parked", "maintenance", "offline"];

function LiveMap() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"all" | VehicleStatus>("all");
  const [depotId, setDepotId] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [showDepots, setShowDepots] = useState(true);

  const visible = useMemo(
    () =>
      vehicles.filter(
        (v) => (status === "all" || v.status === status) && (depotId === "all" || v.depotId === depotId),
      ),
    [status, depotId],
  );

  const markers: MapMarker[] = useMemo(() => {
    const vehicleMarkers: MapMarker[] = visible.map((v) => ({
      id: v.id,
      lat: v.lat,
      lng: v.lng,
      tone: statusTone(v.status),
      label: v.plate,
      sublabel: `${statusLabel[v.status]} · ${v.fuelPct.toFixed(0)}%`,
      shape: "vehicle",
    }));
    const depotMarkers: MapMarker[] = showDepots
      ? depots.map((d) => ({
          id: d.id,
          lat: d.lat,
          lng: d.lng,
          tone: "neutral" as MapTone,
          label: d.name,
          shape: "depot" as const,
        }))
      : [];
    return [...depotMarkers, ...vehicleMarkers];
  }, [visible, showDepots]);

  const active = selected ? vehicles.find((v) => v.id === selected) ?? null : null;

  return (
    <>
      <PageHeader
        eyebrow="GPS tracking"
        title="Live Map"
        description={`${visible.length} of ${vehicles.length} vehicles shown · simulated GPS snapshot`}
        actions={
          <label className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium">
            <input
              type="checkbox"
              checked={showDepots}
              onChange={(e) => setShowDepots(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--color-primary)]"
            />
            Show depots
          </label>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5 text-xs">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatus(f)}
              aria-pressed={status === f}
              className={cn(
                "rounded-md px-2.5 py-1 font-semibold transition-colors",
                status === f ? "bg-primary-soft text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f === "all" ? "All statuses" : statusLabel[f]}
            </button>
          ))}
        </div>
        <select
          value={depotId}
          onChange={(e) => setDepotId(e.target.value)}
          aria-label="Filter by depot"
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium outline-none"
        >
          <option value="all">All depots</option>
          {depots.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]">
        <Panel bodyClassName="p-0">
          <FleetMap
            markers={markers}
            height={560}
            selectedId={selected}
            onSelect={(id) => setSelected(vehicles.some((v) => v.id === id) ? id : null)}
            {...(active ? { path: active.trail } : {})}
          />
          <div className="border-t border-border px-5 py-3">
            <MapLegend
              items={[
                { tone: "primary", label: "Moving" },
                { tone: "warning", label: "Idling" },
                { tone: "neutral", label: "Parked / maintenance / offline" },
              ]}
            />
          </div>
        </Panel>

        <div className="grid gap-4">
          <Panel title="Vehicle summary" subtitle={active ? active.plate : "Select a marker on the map"}>
            {active ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={active.status} />
                  {!active.online ? (
                    <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      Last known data
                    </span>
                  ) : null}
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Field label="Driver" value={active.driver} />
                  <Field label="Model" value={active.model} />
                  <Field label="Route" value={routeById(active.routeId).name} />
                  <Field label="Location" value={active.location} />
                  <Field label="Tank level" value={`${active.fuelPct.toFixed(0)}% · ${Math.round((active.fuelPct / 100) * active.tankL)} L`} />
                  <Field label="Speed" value={`${formatNum(active.speedKph)} km/h`} />
                  <Field label="Ignition" value={active.ignition ? "On" : "Off"} />
                  <Field label="Last telemetry" value={formatRelative(active.lastSeenMin)} />
                </dl>
                <div className="flex gap-2">
                  <Link
                    to="/vehicles/$vehicleId"
                    params={{ vehicleId: active.id }}
                    className="flex-1 rounded-lg bg-primary px-3 py-2 text-center text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Open vehicle detail
                  </Link>
                  <button
                    type="button"
                    onClick={() => navigate({ to: "/alerts", search: { vehicle: active.id } })}
                    className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold transition-colors hover:bg-surface-2"
                  >
                    View alerts
                  </button>
                </div>
              </div>
            ) : (
              <EmptyState title="No vehicle selected" hint="Click any marker to see live telemetry context." />
            )}
          </Panel>

          <Panel title="Vehicles in view" subtitle={`${visible.length} unit(s)`} bodyClassName="p-0">
            {visible.length ? (
              <ul className="max-h-[320px] divide-y divide-border overflow-y-auto scroll-slim">
                {visible.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(v.id)}
                      className={cn(
                        "flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-surface",
                        selected === v.id && "bg-surface",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="num truncate text-sm font-semibold">{v.plate}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{v.location}</p>
                      </div>
                      <StatusPill status={v.status} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No vehicles match these filters" hint="Clear the status or depot filter." />
            )}
          </Panel>
        </div>
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
