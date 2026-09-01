import { useMemo } from "react";

import * as base from "@/lib/fleet-data";

import { CONTROLLED_SCENARIO } from "./showcase-scenario";
import { useDemoScenario } from "./demo-context";
import { useLiveData, type LiveState, type LiveTelemetry } from "@/live/live";
import type { DemoStage } from "./demo-types";
import type {
  AlertSeverity,
  DailyRecord,
  DailySeriesPoint,
  EventKind,
  FleetEvent,
  FleetKpis,
  RefuelEvent,
  TelemetrySample,
  TimeRange,
  Vehicle,
  VehicleStatus,
  WeeklyPoint,
} from "@/lib/fleet-data";

export type DemoFleetData = {
  vehicles: Vehicle[];
  fleetEvents: FleetEvent[];
  refuelEvents: RefuelEvent[];
  hourlyUsage: { label: string; fuelL: number; activeVehicles: number }[];
  fleetKpis: (range: TimeRange) => FleetKpis;
  eventsForRange: (range: TimeRange) => FleetEvent[];
  refuelEventsForRange: (range: TimeRange) => RefuelEvent[];
  eventsForVehicle: (id: string) => FleetEvent[];
  vehicleById: (id: string) => Vehicle | undefined;
  vehicleStats: (range: TimeRange) => base.VehicleStat[];
  depotStats: (range: TimeRange) => base.DepotStat[];
  fleetStatusCounts: () => Record<VehicleStatus, number>;
  seriesForRange: (range: TimeRange) => DailySeriesPoint[];
  weeklySeriesForRange: (range: TimeRange) => WeeklyPoint[];
  rangeTotalSeries: (range: TimeRange) => WeeklyPoint[];
};

const rangeDays: Record<TimeRange, number> = { today: 1, "7d": 7, "30d": 30 };
const currentDate = base.dayKeys[base.dayKeys.length - 1]!;
const heroSourceEvent = base.fleetEvents.find((event) => event.id === CONTROLLED_SCENARIO.eventId);

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const round = (value: number, dp = 1) => Number(value.toFixed(dp));

const productionData: DemoFleetData = {
  vehicles: base.vehicles,
  fleetEvents: base.fleetEvents,
  refuelEvents: base.refuelEvents,
  hourlyUsage: base.hourlyUsage,
  fleetKpis: base.fleetKpis,
  eventsForRange: base.eventsForRange,
  refuelEventsForRange: base.refuelEventsForRange,
  eventsForVehicle: base.eventsForVehicle,
  vehicleById: base.vehicleById,
  vehicleStats: base.vehicleStats,
  depotStats: base.depotStats,
  fleetStatusCounts: base.fleetStatusCounts,
  seriesForRange: base.seriesForRange,
  weeklySeriesForRange: base.weeklySeriesForRange,
  rangeTotalSeries: base.rangeTotalSeries,
};

function cloneTrend(trend: TelemetrySample[]) {
  return trend.map((sample) => ({ ...sample }));
}

function withoutHeroAnomaly(record: DailyRecord) {
  const anomalyToRemove = Math.min(record.anomalyL, CONTROLLED_SCENARIO.litersLost);
  return {
    ...record,
    anomalyL: round(record.anomalyL - anomalyToRemove, 1),
    fuelL: round(Math.max(0, record.fuelL - anomalyToRemove), 1),
  };
}

function withHeroAnomaly(record: DailyRecord) {
  return {
    ...record,
    anomalyL: round(record.anomalyL + CONTROLLED_SCENARIO.litersLost, 1),
    fuelL: round(record.fuelL + CONTROLLED_SCENARIO.litersLost, 1),
  };
}

function deriveHeroVehicle(vehicle: Vehicle, stage: DemoStage): Vehicle {
  const originalDate = heroSourceEvent?.date;
  const daily = vehicle.daily.map((record) => {
    if (record.date === originalDate) return withoutHeroAnomaly(record);
    if (stage !== "NORMAL" && record.date === currentDate) return withHeroAnomaly(record);
    return { ...record };
  });

  if (stage === "NORMAL" || !heroSourceEvent) {
    return { ...vehicle, daily };
  }

  return {
    ...vehicle,
    daily,
    status: "parked",
    online: true,
    fuelPct: CONTROLLED_SCENARIO.fuelPctAfter,
    speedKph: CONTROLLED_SCENARIO.speedKph,
    ignition: CONTROLLED_SCENARIO.ignition,
    lastSeenMin: 0,
    lat: heroSourceEvent.lat,
    lng: heroSourceEvent.lng,
    location: heroSourceEvent.location,
    telemetry: cloneTrend(heroSourceEvent.evidence.fuelTrend),
  };
}

function deriveVehicles(stage: DemoStage) {
  return base.vehicles.map((vehicle) =>
    vehicle.plate === CONTROLLED_SCENARIO.vehiclePlate ? deriveHeroVehicle(vehicle, stage) : vehicle,
  );
}

function heroEventForStage(stage: DemoStage, vehicles: Vehicle[]) {
  if (stage === "NORMAL" || !heroSourceEvent) return null;
  const heroVehicle = vehicles.find((vehicle) => vehicle.plate === CONTROLLED_SCENARIO.vehiclePlate);
  return {
    ...heroSourceEvent,
    vehicleId: heroVehicle?.id ?? heroSourceEvent.vehicleId,
    plate: heroVehicle?.plate ?? heroSourceEvent.plate,
    date: currentDate,
    time: CONTROLLED_SCENARIO.time,
    workflow: stage === "VERIFIED" ? "Verified" : "New",
  } satisfies FleetEvent;
}

function cloneEvent(event: FleetEvent): FleetEvent {
  return { ...event, metric: { ...event.metric }, evidence: { ...event.evidence, fuelTrend: cloneTrend(event.evidence.fuelTrend) } };
}

function triagePreExistingNewEvent(event: FleetEvent): FleetEvent {
  const cloned = cloneEvent(event);
  return cloned.workflow === "New" ? { ...cloned, workflow: "In Progress" } : cloned;
}

function deriveEvents(stage: DemoStage, vehicles: Vehicle[]) {
  const events = base.fleetEvents
    .filter((event) => event.id !== CONTROLLED_SCENARIO.eventId)
    .map(triagePreExistingNewEvent);
  const heroEvent = heroEventForStage(stage, vehicles);
  if (heroEvent) events.push(heroEvent);
  return events.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
}

function sliceDaily(vehicle: Vehicle, days: number) {
  return vehicle.daily.slice(base.dayKeys.length - days);
}

function buildDailySeries(vehicles: Vehicle[]): DailySeriesPoint[] {
  return base.dayKeys.map((date, index) => {
    const km = sum(vehicles.map((vehicle) => vehicle.daily[index]!.km));
    const fuelL = sum(vehicles.map((vehicle) => vehicle.daily[index]!.fuelL));
    const baselineL = sum(vehicles.map((vehicle) => (vehicle.daily[index]!.km * vehicle.baseline) / 100));
    return {
      date,
      label: base.shortDate(date),
      km: Math.round(km),
      fuelL: Math.round(fuelL),
      baselineL: Math.round(baselineL),
      anomalyL: Math.round(sum(vehicles.map((vehicle) => vehicle.daily[index]!.anomalyL))),
      idleFuelL: Math.round(sum(vehicles.map((vehicle) => vehicle.daily[index]!.idleFuelL))),
    };
  });
}

function buildDataset(stage: DemoStage): DemoFleetData {
  const vehicles = deriveVehicles(stage);
  const fleetEvents = deriveEvents(stage, vehicles);
  const dailySeries = buildDailySeries(vehicles);
  const eventsForRange = (range: TimeRange) => fleetEvents.filter((event) => event.date >= base.rangeStartDate(range));
  const seriesForRange = (range: TimeRange) =>
    range === "30d" ? dailySeries : dailySeries.slice(base.dayKeys.length - rangeDays[range]);

  const fleetKpis = (range: TimeRange): FleetKpis => {
    const days = rangeDays[range];
    const rows = vehicles.map((vehicle) => {
      const records = sliceDaily(vehicle, days);
      return {
        vehicle,
        km: sum(records.map((record) => record.km)),
        fuelL: sum(records.map((record) => record.fuelL)),
        idleFuelL: sum(records.map((record) => record.idleFuelL)),
        anomalyL: sum(records.map((record) => record.anomalyL)),
      };
    });

    const distanceKm = sum(rows.map((row) => row.km));
    const fuelL = sum(rows.map((row) => row.fuelL));
    const idleFuelL = sum(rows.map((row) => row.idleFuelL));
    const anomalyL = sum(rows.map((row) => row.anomalyL));
    const driveFuel = fuelL - idleFuelL - anomalyL;
    const active = rows.filter((row) => row.km > 0);
    const aboveBaseline = active.filter(
      (row) => (row.fuelL - row.idleFuelL - row.anomalyL) / (row.km / 100) > row.vehicle.baseline * 1.05,
    ).length;
    const inRange = eventsForRange(range);
    const unresolved = (event: FleetEvent) => event.workflow === "New" || event.workflow === "In Progress";
    const baselineFuelL = sum(rows.map((row) => (row.km * row.vehicle.baseline) / 100));

    return {
      range,
      days,
      distanceKm: Math.round(distanceKm),
      fuelL: Math.round(fuelL),
      fleetEfficiency: distanceKm ? round(driveFuel / (distanceKm / 100), 1) : 0,
      baselineEfficiency: distanceKm ? round(baselineFuelL / (distanceKm / 100), 1) : 0,
      idleFuelL: Math.round(idleFuelL),
      idleShare: fuelL ? round((idleFuelL / fuelL) * 100, 1) : 0,
      suspectedLossL: Math.round(anomalyL),
      anomalyRate: fuelL ? round((anomalyL / fuelL) * 100, 2) : 0,
      vehiclesAboveBaseline: aboveBaseline,
      activeVehicles: active.length,
      dataAvailability: round((vehicles.filter((vehicle) => vehicle.online && vehicle.sensorHealthy).length / vehicles.length) * 100, 1),
      openAlerts: inRange.filter((event) => event.severity !== "info" && unresolved(event)).length,
      criticalAlerts: inRange.filter((event) => event.severity === "critical" && unresolved(event)).length,
      fuelCostVnd: Math.round(fuelL * base.FUEL_PRICE_VND),
      costPerKm: distanceKm ? Math.round((fuelL * base.FUEL_PRICE_VND) / distanceKm) : 0,
    };
  };

  const depotStats = (range: TimeRange): base.DepotStat[] => {
    const days = rangeDays[range];
    const since = base.rangeStartDate(range);
    return base.depots.map((depot) => {
      const depotVehicles = vehicles.filter((vehicle) => vehicle.depotId === depot.id);
      const km = sum(depotVehicles.flatMap((vehicle) => sliceDaily(vehicle, days).map((record) => record.km)));
      const fuelL = sum(depotVehicles.flatMap((vehicle) => sliceDaily(vehicle, days).map((record) => record.fuelL)));
      const idle = sum(depotVehicles.flatMap((vehicle) => sliceDaily(vehicle, days).map((record) => record.idleFuelL)));
      const anomaly = sum(depotVehicles.flatMap((vehicle) => sliceDaily(vehicle, days).map((record) => record.anomalyL)));
      const baselineFuelL = sum(
        depotVehicles.flatMap((vehicle) => sliceDaily(vehicle, days).map((record) => (record.km * vehicle.baseline) / 100)),
      );
      return {
        depotId: depot.id,
        depot: depot.name.replace(" Depot", ""),
        vehicles: depotVehicles.length,
        km: Math.round(km),
        fuelL: Math.round(fuelL),
        efficiency: km ? round((fuelL - idle - anomaly) / (km / 100), 1) : 0,
        baseline: km ? round(baselineFuelL / (km / 100), 1) : 0,
        suspectedLossL: Math.round(anomaly),
        incidents: fleetEvents.filter(
          (event) => event.date >= since && event.kind === "fuel_drop" && depotVehicles.some((vehicle) => vehicle.id === event.vehicleId),
        ).length,
      };
    });
  };

  const vehicleStats = (range: TimeRange): base.VehicleStat[] => {
    const days = rangeDays[range];
    return vehicles.map((vehicle) => {
      const records = sliceDaily(vehicle, days);
      const km = sum(records.map((record) => record.km));
      const fuelL = sum(records.map((record) => record.fuelL));
      const idleFuelL = sum(records.map((record) => record.idleFuelL));
      const anomalyL = sum(records.map((record) => record.anomalyL));
      const efficiency = km ? round((fuelL - idleFuelL - anomalyL) / (km / 100), 1) : 0;
      return {
        vehicle,
        km: Math.round(km),
        fuelL: round(fuelL, 1),
        idleMinutes: sum(records.map((record) => record.idleMinutes)),
        idleFuelL: round(idleFuelL, 1),
        efficiency,
        deltaVsBaseline: km ? round(efficiency - vehicle.baseline, 1) : 0,
        suspectedLossL: round(anomalyL, 1),
      };
    });
  };

  const hourlyUsage = Array.from({ length: 24 }, (_, hour) => {
    const activeVehicles = vehicles.filter((vehicle) => vehicle.telemetry[hour]!.ignition).length;
    const todayFuel = sum(vehicles.map((vehicle) => vehicle.daily[base.dayKeys.length - 1]!.fuelL));
    const weight = activeVehicles || 0.4;
    const totalWeight = sum(
      Array.from({ length: 24 }, (_, index) => vehicles.filter((vehicle) => vehicle.telemetry[index]!.ignition).length || 0.4),
    );
    return {
      label: `${String(hour).padStart(2, "0")}:00`,
      fuelL: round((todayFuel * weight) / totalWeight, 1),
      activeVehicles,
    };
  });

  const weeklySeriesForRange = (range: TimeRange): WeeklyPoint[] => {
    const input = seriesForRange(range);
    const output: WeeklyPoint[] = [];
    for (let index = 0; index < input.length; index += 7) {
      const chunk = input.slice(index, index + 7);
      if (!chunk.length) continue;
      output.push({
        label: input.length <= 7 ? base.rangeLabel[range] : `Week ${output.length + 1}`,
        range: `${chunk[0]!.label} - ${chunk[chunk.length - 1]!.label}`,
        km: sum(chunk.map((point) => point.km)),
        fuelL: sum(chunk.map((point) => point.fuelL)),
        baselineL: sum(chunk.map((point) => point.baselineL)),
        anomalyL: sum(chunk.map((point) => point.anomalyL)),
      });
    }
    return output;
  };

  const rangeTotalSeries = (range: TimeRange): WeeklyPoint[] => {
    const input = seriesForRange(range);
    if (!input.length) return [];
    return [
      {
        label: base.rangeLabel[range],
        range: `${input[0]!.label} - ${input[input.length - 1]!.label}`,
        km: sum(input.map((point) => point.km)),
        fuelL: sum(input.map((point) => point.fuelL)),
        baselineL: sum(input.map((point) => point.baselineL)),
        anomalyL: sum(input.map((point) => point.anomalyL)),
      },
    ];
  };

  return {
    vehicles,
    fleetEvents,
    refuelEvents: base.refuelEvents,
    hourlyUsage,
    fleetKpis,
    eventsForRange,
    refuelEventsForRange: (range) => base.refuelEvents.filter((event) => event.date >= base.rangeStartDate(range)),
    eventsForVehicle: (id) => fleetEvents.filter((event) => event.vehicleId === id),
    vehicleById: (id) => vehicles.find((vehicle) => vehicle.id === id),
    vehicleStats,
    depotStats,
    fleetStatusCounts: () => {
      const counts: Record<VehicleStatus, number> = {
        moving: 0,
        idling: 0,
        parked: 0,
        maintenance: 0,
        offline: 0,
      };
      vehicles.forEach((vehicle) => {
        counts[vehicle.status] += 1;
      });
      return counts;
    },
    seriesForRange,
    weeklySeriesForRange,
    rangeTotalSeries,
  };
}

export function buildDemoDatasetForStage(stage: DemoStage): DemoFleetData {
  return buildDataset(stage);
}

/* ---------------------------------------------------------------------------
 * Live device overlay.
 * Maps the SmartT V2 backend schema (/api/v2/latest, /api/v2/incidents) onto
 * the FleetView model so the prototype (TRUCK_01) appears as a real vehicle
 * with current fuel level, context status and confirmed incidents.
 * ------------------------------------------------------------------------- */

const clampPct = (value: number) => Math.max(4, Math.min(99, value));

export const LIVE_VEHICLE_ID = "V-LIVE";

/* The route loader for /vehicles/$vehicleId runs during SSR, where the
 * backend cannot be reached. Cache the last built live vehicle here so the
 * loader can resolve the live id without throwing a 404, and fall back to a
 * static placeholder before the first successful fetch. */
let cachedLiveVehicle: Vehicle | null = null;

export function liveVehicleForRoute(id: string): Vehicle | undefined {
  if (id !== LIVE_VEHICLE_ID) return undefined;
  if (cachedLiveVehicle) return cachedLiveVehicle;
  const placeholder = buildLiveVehicle({ vehicle_id: "TRUCK_01" });
  return { ...placeholder, online: false };
}

function liveStatusFrom(mode?: string): VehicleStatus {
  const m = (mode ?? "").toUpperCase();
  if (m.includes("MOVING")) return "moving";
  if (m.includes("PARKED") || m.includes("TILT")) return "parked";
  return "idling";
}

function liveEventKind(event?: string): EventKind {
  const e = (event ?? "NORMAL").toUpperCase();
  if (e.includes("THEFT") || e.includes("LOSS") || e.includes("DROP")) return "fuel_drop";
  if (e.includes("REFUEL")) return "refueling";
  if (e.includes("SLOSH")) return "overconsumption";
  if (e.includes("FAULT") || e.includes("SENSOR")) return "sensor_error";
  return "overconsumption";
}

function liveSeverity(kind: EventKind, event: string): AlertSeverity {
  const e = event.toUpperCase();
  if (e.includes("THEFT")) return "critical";
  if (e.includes("SLOSH")) return "info";
  if (kind === "fuel_drop" || kind === "sensor_error") return "warning";
  return "warning";
}

function buildLiveVehicle(latest: LiveTelemetry): Vehicle {
  const fuel = latest.fuel ?? {};
  const context = latest.context ?? {};
  const gps = latest.gps ?? {};
  const tankL = 400;
  const pct = clampPct(fuel.percent ?? 0);
  const speed = context.speed_kmh ?? 0;
  const ignition = Boolean(context.ignition_on);
  return {
    id: "V-LIVE",
    plate: latest.vehicle_id ?? "TRUCK_01",
    model: "SmartT V2.2",
    type: "Box Truck",
    driver: "Live Prototype",
    phone: "",
    depotId: base.depots[0]!.id,
    routeId: base.routes[0]!.id,
    status: liveStatusFrom(context.mode),
    online: true,
    fuelPct: pct,
    tankL,
    baseline: 30,
    odometer: 0,
    engineHours: 0,
    speedKph: speed,
    ignition,
    lastSeenMin: 0,
    lat: gps.fix ? (gps.lat ?? 10.78) : 10.78,
    lng: gps.fix ? (gps.lon ?? 106.7) : 106.7,
    heading: 0,
    location: gps.fix ? "Live device (GPS fix)" : "Live device (GPS pending)",
    progress: 0,
    trail: [],
    telemetry: Array.from({ length: 24 }, (_, hour): TelemetrySample => ({
      hour,
      fuelPct: pct,
      speedKph: speed,
      ignition,
    })),
    daily: base.dayKeys.map((date, index): DailyRecord => ({
      date,
      km: 0,
      fuelL: index === base.dayKeys.length - 1 ? round(fuel.volume_l ?? 0, 1) : 0,
      idleMinutes: 0,
      idleFuelL: 0,
      anomalyL: 0,
    })),
    sensorHealthy: (fuel.quality ?? 1) > 0.15,
  };
}

function liveEventFrom(record: LiveTelemetry, index: number, vehicle: Vehicle): FleetEvent {
  const fuel = record.fuel ?? {};
  const context = record.context ?? {};
  const gps = record.gps ?? {};
  const intel = record.intelligence ?? {};
  const event = record.event ?? "NORMAL";
  const kind = liveEventKind(event);
  const before = intel.baseline_l != null && vehicle.tankL > 0
    ? round((intel.baseline_l / vehicle.tankL) * 100, 1)
    : (fuel.percent ?? 0);
  const after = fuel.percent ?? 0;
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const litersLost = kind === "fuel_drop"
    ? Math.abs(intel.unexplained_loss_l ?? ((before - after) / 100) * vehicle.tankL)
    : null;
  const litersAdded = kind === "refueling"
    ? Math.max(0, ((after - before) / 100) * vehicle.tankL)
    : null;

  const metric: FleetEvent["metric"] = {};
  if (litersLost !== null) metric.litersLost = litersLost;
  if (litersAdded !== null) metric.litersAdded = litersAdded;

  return {
    id: `LIVE-${record.event_seq ?? "rec"}-${index}`,
    vehicleId: vehicle.id,
    plate: vehicle.plate,
    kind,
    severity: liveSeverity(kind, event),
    title: `${kind === "fuel_drop" ? "Suspected Fuel Loss" : kind === "refueling" ? "Detected Refueling" : kind === "sensor_error" ? "Sensor Warning" : "Fuel Anomaly"} — Live Device`,
    detail: Array.isArray(record.reasons) && record.reasons.length
      ? record.reasons.map((reason) => reason.replace(/_/g, " ")).join(", ")
      : `Edge confidence ${record.confidence?.toFixed(0) ?? "?"}%`,
    metric,
    lat: gps.fix ? (gps.lat ?? 10.78) : 10.78,
    lng: gps.fix ? (gps.lon ?? 106.7) : 106.7,
    location: gps.fix ? "Live device (GPS fix)" : "Live device (GPS pending)",
    date: base.dayKeys[base.dayKeys.length - 1]!,
    time,
    workflow: "New",
    evidence: {
      fuelPctBefore: before,
      fuelPctAfter: after,
      ignition: Boolean(context.ignition_on),
      speedKph: context.speed_kmh ?? 0,
      fuelTrend: Array.from({ length: 24 }, (_, hour): TelemetrySample => ({
        hour,
        fuelPct: after,
        speedKph: context.speed_kmh ?? 0,
        ignition: Boolean(context.ignition_on),
      })),
    },
  };
}

function liveVehicleStat(vehicle: Vehicle): base.VehicleStat {
  return {
    vehicle,
    km: 0,
    fuelL: round(vehicle.tankL * (vehicle.fuelPct / 100), 1),
    idleMinutes: 0,
    idleFuelL: 0,
    efficiency: 0,
    deltaVsBaseline: 0,
    suspectedLossL: 0,
  };
}

function withLiveOverlay(data: DemoFleetData, live: LiveState): DemoFleetData {
  const hasLive = Boolean(live.latest);
  const liveVehicle = hasLive
    ? buildLiveVehicle(live.latest!)
    : (liveVehicleForRoute(LIVE_VEHICLE_ID) as Vehicle);
  cachedLiveVehicle = liveVehicle;

  let liveEvents: FleetEvent[] = [];
  if (hasLive && live.latest) {
    const latest = live.latest;
    const currentEvent = latest.event ?? "NORMAL";
    const currentIsEvent =
      currentEvent !== "NORMAL" || (latest.record_type ?? "") === "event";

    liveEvents = [
      ...live.incidents
        .filter((record) => (record.event_seq ?? 0) !== (latest.event_seq ?? 0))
        .map((record, index) => liveEventFrom(record, index + 1, liveVehicle)),
    ];
    if (currentIsEvent) {
      liveEvents.push(liveEventFrom(latest, 0, liveVehicle));
    }
  }

  return {
    ...data,
    vehicles: [...data.vehicles, liveVehicle],
    fleetEvents: [...liveEvents, ...data.fleetEvents],
    vehicleById: (id) => (id === liveVehicle.id ? liveVehicle : data.vehicleById(id)),
    eventsForVehicle: (id) =>
      id === liveVehicle.id ? liveEvents : data.eventsForVehicle(id),
    eventsForRange: (range) => [...liveEvents, ...data.eventsForRange(range)],
    vehicleStats: (range) => [...data.vehicleStats(range), liveVehicleStat(liveVehicle)],
    fleetStatusCounts: () => {
      const counts = data.fleetStatusCounts();
      counts[liveVehicle.status] += 1;
      return counts;
    },
  };
}

export function useDemoData(): DemoFleetData {
  const { active, stage } = useDemoScenario();
  const live = useLiveData();
  const data = useMemo(
    () => (active ? buildDataset(stage) : productionData),
    [active, stage],
  );
  return useMemo(() => withLiveOverlay(data, live), [data, live]);
}
