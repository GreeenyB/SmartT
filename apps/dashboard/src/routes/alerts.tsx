import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Check, CircleSlash, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";

import {
  EmptyState,
  FuelLevelChart,
  KpiCard,
  Panel,
  PageHeader,
  SeverityBadge,
  StatusPill,
  WorkflowBadge,
} from "@/components/dashboard-kit";
import { FleetMap, type MapMarker } from "@/components/fleet-map";
import {
  eventKindLabel,
  fleetEvents,
  formatDate,
  formatNum,
  vehicleById,
  type AlertSeverity,
  type EventKind,
  type FleetEvent,
  type WorkflowStatus,
} from "@/lib/fleet-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/alerts")({
  validateSearch: (search: Record<string, unknown>) => ({
    event: typeof search['event'] === "string" ? (search['event'] as string) : undefined,
    vehicle: typeof search['vehicle'] === "string" ? (search['vehicle'] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Alerts — SmartT Fleet Monitoring" },
      {
        name: "description",
        content: "Review fuel and telemetry alerts with severity, workflow status, GPS position and supporting evidence.",
      },
      { property: "og:title", content: "Alerts — SmartT Fleet Monitoring" },
      { property: "og:description", content: "Severity, workflow and telemetry evidence for every fleet alert." },
    ],
  }),
  component: Alerts,
});

const operators = ["Tran Phuong", "Le Hoang Nam", "Nguyen Thu Ha"];

function metricLine(e: FleetEvent) {
  const m = e.metric;
  switch (e.kind) {
    case "fuel_drop":
      return `${formatNum(m.litersLost ?? 0, 1)} L unaccounted`;
    case "refueling":
      return `${formatNum(m.litersAdded ?? 0)} L added${m.receiptLiters != null ? ` · receipt ${formatNum(m.receiptLiters)} L` : " · no receipt entered"}`;
    case "overconsumption":
      return `${formatNum(m.overPct ?? 0, 1)}% above baseline`;
    case "idling":
      return `${formatNum(m.durationMin ?? 0)} minutes idling`;
    case "sensor_error":
      return `Sensor: ${m.sensorStatus ?? "unknown"}`;
    case "route_deviation":
      return `${formatNum(m.distanceKm ?? 0, 1)} km off the planned route`;
    case "offline":
      return `${formatNum(m.durationMin ?? 0)} minutes without telemetry`;
    default:
      return "";
  }
}

const severities: ("all" | AlertSeverity)[] = ["all", "critical", "warning", "info"];
const workflows: ("all" | WorkflowStatus)[] = ["all", "New", "In Progress", "Verified", "Dismissed"];
const kinds: ("all" | EventKind)[] = [
  "all",
  "fuel_drop",
  "overconsumption",
  "refueling",
  "idling",
  "sensor_error",
  "route_deviation",
  "offline",
];

function Alerts() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [severity, setSeverity] = useState<"all" | AlertSeverity>("all");
  const [workflow, setWorkflow] = useState<"all" | WorkflowStatus>("all");
  const [kind, setKind] = useState<"all" | EventKind>("all");
  const [overrides, setOverrides] = useState<Record<string, { workflow: WorkflowStatus; operator?: string }>>({});

  const resolved = useMemo(
    () =>
      fleetEvents.map((e) => ({
        ...e,
        workflow: overrides[e.id]?.workflow ?? e.workflow,
        operator: overrides[e.id]?.operator,
      })),
    [overrides],
  );

  const filtered = useMemo(
    () =>
      resolved.filter((e) => {
        if (search.vehicle && e.vehicleId !== search.vehicle) return false;
        if (severity !== "all" && e.severity !== severity) return false;
        if (workflow !== "all" && e.workflow !== workflow) return false;
        if (kind !== "all" && e.kind !== kind) return false;
        return true;
      }),
    [resolved, severity, workflow, kind, search.vehicle],
  );

  const selectedId = search.event ?? filtered[0]?.id ?? null;
  const active = resolved.find((e) => e.id === selectedId) ?? null;
  const vehicle = active ? vehicleById(active.vehicleId) ?? null : null;

  const select = (id: string) => navigate({ to: "/alerts", search: { ...search, event: id } });
  const setWorkflowFor = (id: string, next: WorkflowStatus, operator?: string) =>
    setOverrides((o) => ({ ...o, [id]: { workflow: next, ...(operator ? { operator } : {}) } }));

  const unresolved = (e: (typeof resolved)[number]) => e.workflow === "New" || e.workflow === "In Progress";
  const counts = {
    open: resolved.filter((e) => e.severity !== "info" && unresolved(e)).length,
    critical: resolved.filter((e) => e.severity === "critical" && unresolved(e)).length,
    progress: resolved.filter((e) => e.workflow === "In Progress").length,
    verified: resolved.filter((e) => e.workflow === "Verified").length,
  };

  const markers: MapMarker[] =
    active && vehicle
      ? [
          {
            id: active.id,
            lat: active.lat,
            lng: active.lng,
            tone: active.severity === "critical" ? "destructive" : active.severity === "warning" ? "warning" : "primary",
            label: active.plate,
            sublabel: eventKindLabel[active.kind],
            shape: "event",
          },
        ]
      : [];

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Alerts"
        description={`${filtered.length} event(s) match the current filters`}
        actions={
          search.vehicle ? (
            <button
              type="button"
              onClick={() => navigate({ to: "/alerts", search: {} })}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-surface-2"
            >
              Clear vehicle filter
            </button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Open alerts" value={formatNum(counts.open)} deltaLabel="new or in progress" tone={counts.open ? "warn" : "good"} icon={<AlertTriangle className="h-4 w-4" />} />
        <KpiCard label="Critical severity" value={formatNum(counts.critical)} deltaLabel="unresolved critical alerts" tone={counts.critical ? "bad" : "good"} />
        <KpiCard label="In progress" value={formatNum(counts.progress)} deltaLabel="assigned to an operator" />
        <KpiCard label="Verified" value={formatNum(counts.verified)} deltaLabel="confirmed by an operator" tone="good" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <FilterGroup label="Severity" value={severity} options={severities} onChange={setSeverity} render={(v) => (v === "all" ? "All severities" : v[0]!.toUpperCase() + v.slice(1))} />
        <FilterGroup label="Workflow" value={workflow} options={workflows} onChange={setWorkflow} render={(v) => (v === "all" ? "All statuses" : v)} />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "all" | EventKind)}
          aria-label="Filter by event type"
          className="h-9 rounded-lg border border-border bg-surface px-3 text-xs font-medium outline-none"
        >
          {kinds.map((k) => (
            <option key={k} value={k}>
              {k === "all" ? "All event types" : eventKindLabel[k]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Panel title="Event list" subtitle="Severity describes impact; workflow describes handling" bodyClassName="p-0">
          {filtered.length ? (
            <ul className="max-h-[620px] divide-y divide-border overflow-y-auto scroll-slim">
              {filtered.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => select(e.id)}
                    className={cn(
                      "w-full px-5 py-3 text-left transition-colors hover:bg-surface",
                      selectedId === e.id && "bg-surface",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={e.severity} />
                      <span className="num text-sm font-semibold">{e.plate}</span>
                      <span className="text-xs text-muted-foreground">{eventKindLabel[e.kind]}</span>
                      <span className="ml-auto">
                        <WorkflowBadge status={e.workflow} />
                      </span>
                    </div>
                    <p className="num mt-1.5 text-xs text-muted-foreground">
                      {metricLine(e)} · {formatDate(e.date)} {e.time}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No alerts match these filters" hint="Reset severity, workflow or event type." />
          )}
        </Panel>

        {active && vehicle ? (
          <div className="grid gap-4">
            <Panel
              title={eventKindLabel[active.kind]}
              subtitle={`${active.id} · ${formatDate(active.date)} ${active.time}`}
              actions={<SeverityBadge severity={active.severity} />}
            >
              <p className="text-sm text-muted-foreground">{active.detail}</p>

              <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
                <Field label="Measurement" value={metricLine(active)} />
                <Field label="Vehicle" value={`${active.plate} · ${vehicle.driver}`} />
                {active.kind === "fuel_drop" || active.kind === "refueling" ? (
                  <>
                    <Field label="Fuel level before" value={`${active.evidence.fuelPctBefore.toFixed(0)}%`} />
                    <Field label="Fuel level after" value={`${active.evidence.fuelPctAfter.toFixed(0)}%`} />
                  </>
                ) : (
                  <Field label="Fuel level at detection" value={`${active.evidence.fuelPctAfter.toFixed(0)}%`} />
                )}
                <Field label="Ignition at detection" value={active.evidence.ignition ? "On" : "Off"} />
                <Field label="Speed at detection" value={`${formatNum(active.evidence.speedKph)} km/h`} />
                <Field label="GPS position" value={`${active.lat.toFixed(4)}, ${active.lng.toFixed(4)}`} />
                <Field label="Location" value={active.location} />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <WorkflowBadge status={active.workflow} />
                <button
                  type="button"
                  onClick={() => setWorkflowFor(active.id, "In Progress", operators[0])}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-surface-2"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Assign to {operators[0]}
                </button>
                <button
                  type="button"
                  onClick={() => setWorkflowFor(active.id, "Verified")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Check className="h-3.5 w-3.5" />
                  Mark verified
                </button>
                <button
                  type="button"
                  onClick={() => setWorkflowFor(active.id, "Dismissed")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-surface-2"
                >
                  <CircleSlash className="h-3.5 w-3.5" />
                  Dismiss
                </button>
              </div>
              {overrides[active.id]?.operator ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Assigned to {overrides[active.id]?.operator}.
                </p>
              ) : null}
            </Panel>

            <Panel title="Event location" subtitle="GPS position recorded at detection time" bodyClassName="p-0">
              <FleetMap markers={markers} height={220} focus={{ lat: active.lat, lng: active.lng, zoom: 11 }} />
            </Panel>

            <Panel title="Event-day fuel trend" subtitle={`${vehicle.plate} · ${formatDate(active.date)} evidence window`} bodyClassName="p-4">
              <FuelLevelChart
                data={active.evidence.fuelTrend}
                markers={
                  active.kind === "refueling" || active.kind === "fuel_drop"
                    ? [
                        {
                          hour: Number(active.time.slice(0, 2)),
                          tone: active.kind === "refueling" ? "success" : "destructive",
                        },
                      ]
                    : undefined
                }
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusPill status={vehicle.status} />
                <Link
                  to="/vehicles/$vehicleId"
                  params={{ vehicleId: vehicle.id }}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Open vehicle detail
                </Link>
              </div>
            </Panel>
          </div>
        ) : (
          <Panel>
            <EmptyState title="No alert selected" hint="Pick an event from the list to see its evidence." />
          </Panel>
        )}
      </div>
    </>
  );
}

function FilterGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  render,
}: {
  label: string;
  value: T;
  options: T[];
  onChange: (v: T) => void;
  render: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5 text-xs" aria-label={label}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className={cn(
            "rounded-md px-2.5 py-1 font-semibold transition-colors",
            value === o ? "bg-primary-soft text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {render(o)}
        </button>
      ))}
    </div>
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
