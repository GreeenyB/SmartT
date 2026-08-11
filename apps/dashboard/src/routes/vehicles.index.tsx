import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpDown, Download, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState, FuelBar, Panel, PageHeader, RangeSwitch, StatusPill } from "@/components/dashboard-kit";
import {
  depots,
  formatNum,
  formatRelative,
  rangeLabel,
  routeById,
  statusLabel,
  vehicleStats,
  type TimeRange,
  type VehicleStatus,
} from "@/lib/fleet-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/vehicles/")({
  head: () => ({
    meta: [
      { title: "Vehicles — SmartT Fleet Register" },
      {
        name: "description",
        content: "Browse every vehicle with tank level, efficiency versus baseline, distance and suspected fuel loss.",
      },
      { property: "og:title", content: "Vehicles — SmartT Fleet Register" },
      { property: "og:description", content: "Per-vehicle telemetry, efficiency and fuel anomaly rollups." },
    ],
  }),
  component: VehiclesIndex,
});

type SortKey = "plate" | "efficiency" | "km" | "fuelPct" | "suspectedLossL";

const statusFilters: ("all" | VehicleStatus)[] = ["all", "moving", "idling", "parked", "maintenance", "offline"];

function VehiclesIndex() {
  const [range, setRange] = useState<TimeRange>("today");
  const [status, setStatus] = useState<"all" | VehicleStatus>("all");
  const [depotId, setDepotId] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("efficiency");
  const [asc, setAsc] = useState(false);

  const stats = vehicleStats(range);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    const filtered = stats.filter((s) => {
      const v = s.vehicle;
      if (status !== "all" && v.status !== status) return false;
      if (depotId !== "all" && v.depotId !== depotId) return false;
      if (term && !`${v.plate} ${v.driver} ${v.model}`.toLowerCase().includes(term)) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      const dir = asc ? 1 : -1;
      if (sort === "plate") return a.vehicle.plate.localeCompare(b.vehicle.plate) * dir;
      if (sort === "fuelPct") return (a.vehicle.fuelPct - b.vehicle.fuelPct) * dir;
      if (sort === "km") return (a.km - b.km) * dir;
      if (sort === "suspectedLossL") return (a.suspectedLossL - b.suspectedLossL) * dir;
      return (a.efficiency - b.efficiency) * dir;
    });
  }, [stats, status, depotId, query, sort, asc]);

  const exportCsv = () => {
    const header = ["Plate", "Driver", "Status", "Depot", "Route", "Distance (km)", "Fuel (L)", "L/100km", "Baseline", "Suspected loss (L)"];
    const lines = rows.map((s) =>
      [
        s.vehicle.plate,
        s.vehicle.driver,
        statusLabel[s.vehicle.status],
        depots.find((d) => d.id === s.vehicle.depotId)?.name ?? "",
        routeById(s.vehicle.routeId).name,
        s.km,
        s.fuelL,
        s.efficiency,
        s.vehicle.baseline,
        s.suspectedLossL,
      ].join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smartt-vehicles-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSort = (key: SortKey) => {
    if (key === sort) setAsc((v) => !v);
    else {
      setSort(key);
      setAsc(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Fleet register"
        title="Vehicles"
        description={`${rows.length} vehicle(s) matching current filters · ${rangeLabel[range]}`}
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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex h-9 min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 sm:max-w-xs">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by plate, driver or model…"
            aria-label="Filter vehicles"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5 text-xs">
          {statusFilters.map((f) => (
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
              {f === "all" ? "All" : statusLabel[f]}
            </button>
          ))}
        </div>
        <select
          value={depotId}
          onChange={(e) => setDepotId(e.target.value)}
          aria-label="Filter by depot"
          className="h-9 rounded-lg border border-border bg-surface px-3 text-xs font-medium outline-none"
        >
          <option value="all">All depots</option>
          {depots.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <Panel bodyClassName="p-0">
        <div className="overflow-x-auto scroll-slim">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <Th onClick={() => toggleSort("plate")}>Vehicle</Th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Route / location</th>
                <Th onClick={() => toggleSort("fuelPct")}>Tank level</Th>
                <Th onClick={() => toggleSort("efficiency")} right>
                  L/100km
                </Th>
                <Th onClick={() => toggleSort("km")} right>
                  Distance
                </Th>
                <Th onClick={() => toggleSort("suspectedLossL")} right>
                  Suspected loss
                </Th>
                <th className="px-5 py-3 text-right font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((s) => {
                const v = s.vehicle;
                return (
                  <tr key={v.id} className="transition-colors hover:bg-surface">
                    <td className="px-5 py-3">
                      <Link to="/vehicles/$vehicleId" params={{ vehicleId: v.id }} className="block min-w-0">
                        <p className="num text-sm font-semibold hover:text-primary">{v.plate}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {v.driver} · {v.model}
                        </p>
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={v.status} />
                    </td>
                    <td className="px-3 py-3">
                      <p className="truncate text-xs font-medium">{routeById(v.routeId).name}</p>
                      <p className="truncate text-xs text-muted-foreground">{v.location}</p>
                    </td>
                    <td className="px-3 py-3">
                      <FuelBar pct={v.fuelPct} tankL={v.tankL} stale={!v.online} />
                    </td>
                    <td className="num px-3 py-3 text-right">
                      {s.km > 0 ? (
                        <>
                          <span className={s.deltaVsBaseline > 0.5 ? "text-warning" : "text-foreground"}>
                            {formatNum(s.efficiency, 1)}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            baseline {formatNum(v.baseline, 1)}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">No trips</span>
                      )}
                    </td>
                    <td className="num px-3 py-3 text-right">{formatNum(s.km)} km</td>
                    <td className="num px-3 py-3 text-right">
                      {s.suspectedLossL > 0 ? (
                        <span className="text-destructive">{formatNum(s.suspectedLossL, 1)} L</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="num px-5 py-3 text-right text-xs text-muted-foreground">
                      {v.online ? formatRelative(v.lastSeenMin) : `Last known · ${formatRelative(v.lastSeenMin)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No vehicles match these filters" hint="Clear the search box or reset the status filter." />
        ) : null}
      </Panel>
    </>
  );
}

function Th({ children, onClick, right }: { children: React.ReactNode; onClick: () => void; right?: boolean }) {
  return (
    <th className={cn("px-3 py-3 font-medium first:pl-5", right && "text-right")}>
      <button
        type="button"
        onClick={onClick}
        className={cn("inline-flex items-center gap-1 transition-colors hover:text-foreground", right && "flex-row-reverse")}
      >
        {children}
        <ArrowUpDown className="h-3 w-3" />
      </button>
    </th>
  );
}
