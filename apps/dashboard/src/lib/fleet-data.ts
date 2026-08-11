/**
 * SmartT — deterministic mock telemetry dataset (single source of truth).
 *
 * Model:
 *   depots -> routes (geo polylines) -> vehicles (assigned to a depot + route)
 *   vehicles -> daily telemetry records (30 days) -> fleet aggregates / KPIs
 *   vehicles -> events (typed payloads) -> alerts, refueling log, map markers
 *
 * Everything shown in the UI is derived from the structures below. No metric
 * is invented independently of vehicle telemetry.
 */

/* --------------------------------- helpers -------------------------------- */

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry(20260809);
const between = (a: number, b: number, dp = 0) => {
  const v = a + rnd() * (b - a);
  return dp === 0 ? Math.round(v) : Number(v.toFixed(dp));
};
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)]!;
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
const round = (n: number, dp = 1) => Number(n.toFixed(dp));

export const FUEL_PRICE_VND = 20450;

/* ------------------------------- geography -------------------------------- */

export interface GeoPoint {
  lat: number;
  lng: number;
  label: string;
}

export interface Depot {
  id: string;
  name: string;
  region: string;
  lat: number;
  lng: number;
}

export const depots: Depot[] = [
  { id: "DP-BD", name: "Binh Duong Depot", region: "Southeast", lat: 11.0, lng: 106.65 },
  { id: "DP-LA", name: "Long An Depot", region: "Mekong Delta", lat: 10.64, lng: 106.49 },
  { id: "DP-DN", name: "Da Nang Depot", region: "Central Coast", lat: 16.05, lng: 108.22 },
  { id: "DP-HP", name: "Hai Phong Depot", region: "Red River Delta", lat: 20.86, lng: 106.68 },
  { id: "DP-CT", name: "Can Tho Depot", region: "Mekong Delta", lat: 10.03, lng: 105.78 },
];

export interface FleetRoute {
  id: string;
  name: string;
  depotId: string;
  distanceKm: number;
  points: GeoPoint[];
}

export const routes: FleetRoute[] = [
  {
    id: "RT-01",
    name: "Ho Chi Minh City → Can Tho",
    depotId: "DP-LA",
    distanceKm: 172,
    points: [
      { lat: 10.78, lng: 106.7, label: "Ring Road 3, Ho Chi Minh City" },
      { lat: 10.64, lng: 106.49, label: "Highway QL1A, Ben Luc, Long An" },
      { lat: 10.42, lng: 106.35, label: "Trung Luong Expressway, Km 32" },
      { lat: 10.24, lng: 105.98, label: "Cai Lay Rest Stop, Tien Giang" },
      { lat: 10.03, lng: 105.78, label: "Can Tho Depot Yard" },
    ],
  },
  {
    id: "RT-02",
    name: "Ho Chi Minh City → Da Nang",
    depotId: "DP-BD",
    distanceKm: 964,
    points: [
      { lat: 10.78, lng: 106.7, label: "Ring Road 3, Ho Chi Minh City" },
      { lat: 11.32, lng: 107.2, label: "Highway QL1A, Xuan Loc, Dong Nai" },
      { lat: 12.24, lng: 109.19, label: "Nha Trang Bypass, Khanh Hoa" },
      { lat: 13.77, lng: 109.22, label: "Quy Nhon Junction, Binh Dinh" },
      { lat: 15.12, lng: 108.8, label: "Da Nang – Quang Ngai Expressway, Km 18" },
      { lat: 16.05, lng: 108.22, label: "Da Nang Depot Yard" },
    ],
  },
  {
    id: "RT-03",
    name: "Hanoi → Hai Phong",
    depotId: "DP-HP",
    distanceKm: 106,
    points: [
      { lat: 21.03, lng: 105.85, label: "Hanoi Distribution Hub" },
      { lat: 20.95, lng: 106.15, label: "Highway QL5, Hung Yen" },
      { lat: 20.9, lng: 106.42, label: "Hanoi – Hai Phong Expressway, Km 62" },
      { lat: 20.86, lng: 106.68, label: "Hai Phong Depot Yard" },
    ],
  },
  {
    id: "RT-04",
    name: "Binh Duong → Vung Tau",
    depotId: "DP-BD",
    distanceKm: 118,
    points: [
      { lat: 11.0, lng: 106.65, label: "Binh Duong Depot Yard" },
      { lat: 10.86, lng: 106.79, label: "Highway QL13, Thuan An" },
      { lat: 10.62, lng: 107.0, label: "Highway QL51, Long Thanh, Dong Nai" },
      { lat: 10.35, lng: 107.08, label: "Vung Tau Port Gate" },
    ],
  },
  {
    id: "RT-05",
    name: "Da Nang → Hue",
    depotId: "DP-DN",
    distanceKm: 96,
    points: [
      { lat: 16.05, lng: 108.22, label: "Da Nang Depot Yard" },
      { lat: 16.19, lng: 108.05, label: "Hai Van Tunnel South Portal" },
      { lat: 16.33, lng: 107.85, label: "Lang Co Bay, Thua Thien Hue" },
      { lat: 16.46, lng: 107.59, label: "Hue Logistics Yard" },
    ],
  },
  {
    id: "RT-06",
    name: "Ho Chi Minh City → Nha Trang",
    depotId: "DP-BD",
    distanceKm: 431,
    points: [
      { lat: 10.78, lng: 106.7, label: "Ring Road 3, Ho Chi Minh City" },
      { lat: 11.1, lng: 107.05, label: "Highway QL1A, Trang Bom, Dong Nai" },
      { lat: 11.56, lng: 108.02, label: "Highway QL1A, Phan Thiet, Binh Thuan" },
      { lat: 12.24, lng: 109.19, label: "Nha Trang Bypass, Khanh Hoa" },
    ],
  },
  {
    id: "RT-07",
    name: "Long An → Dong Nai",
    depotId: "DP-LA",
    distanceKm: 84,
    points: [
      { lat: 10.64, lng: 106.49, label: "Long An Depot Yard" },
      { lat: 10.75, lng: 106.6, label: "Song Than Industrial Park, Binh Duong" },
      { lat: 10.88, lng: 106.75, label: "Highway QL1K, Di An" },
      { lat: 10.95, lng: 106.82, label: "Bien Hoa Industrial Zone, Dong Nai" },
    ],
  },
  {
    id: "RT-08",
    name: "Hai Phong → Ninh Binh",
    depotId: "DP-HP",
    distanceKm: 121,
    points: [
      { lat: 20.86, lng: 106.68, label: "Hai Phong Depot Yard" },
      { lat: 20.6, lng: 106.3, label: "Highway QL10, Thai Binh" },
      { lat: 20.25, lng: 105.97, label: "Ninh Binh Cement Terminal" },
    ],
  },
  {
    id: "RT-09",
    name: "Can Tho → Ca Mau",
    depotId: "DP-CT",
    distanceKm: 148,
    points: [
      { lat: 10.03, lng: 105.78, label: "Can Tho Depot Yard" },
      { lat: 9.6, lng: 105.45, label: "Highway QL1A, Vi Thanh, Hau Giang" },
      { lat: 9.18, lng: 105.15, label: "Ca Mau Distribution Yard" },
    ],
  },
  {
    id: "RT-10",
    name: "Da Nang → Quang Ngai",
    depotId: "DP-DN",
    distanceKm: 131,
    points: [
      { lat: 16.05, lng: 108.22, label: "Da Nang Depot Yard" },
      { lat: 15.58, lng: 108.47, label: "Hoi An Junction, Quang Nam" },
      { lat: 15.12, lng: 108.8, label: "Da Nang – Quang Ngai Expressway, Km 18" },
    ],
  },
];

export const routeById = (id: string) => routes.find((r) => r.id === id)!;
export const depotById = (id: string) => depots.find((d) => d.id === id)!;

/** Interpolate a position along a route polyline. progress: 0..1 */
export function pointOnRoute(route: FleetRoute, progress: number): GeoPoint {
  const p = Math.max(0, Math.min(0.9999, progress));
  const segs = route.points.length - 1;
  const idx = Math.floor(p * segs);
  const t = p * segs - idx;
  const a = route.points[idx]!;
  const b = route.points[idx + 1]!;
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
    label: t < 0.5 ? a.label : b.label,
  };
}

/* -------------------------------- vehicles -------------------------------- */

export type VehicleStatus = "moving" | "idling" | "parked" | "maintenance" | "offline";
export type VehicleType = "Box Truck" | "Tractor Unit" | "Tanker" | "Coach";

export interface DailyRecord {
  /** ISO date, oldest first */
  date: string;
  km: number;
  fuelL: number;
  idleMinutes: number;
  idleFuelL: number;
  /** liters flagged as unexplained on this day (0 for most days) */
  anomalyL: number;
}

export interface TelemetrySample {
  hour: number;
  fuelPct: number;
  speedKph: number;
  ignition: boolean;
}

export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  type: VehicleType;
  driver: string;
  phone: string;
  depotId: string;
  routeId: string;
  status: VehicleStatus;
  online: boolean;
  fuelPct: number;
  tankL: number;
  baseline: number; // L/100km target for this vehicle class + route
  odometer: number;
  engineHours: number;
  speedKph: number;
  ignition: boolean;
  lastSeenMin: number;
  lat: number;
  lng: number;
  heading: number;
  location: string;
  progress: number;
  trail: { lat: number; lng: number }[];
  telemetry: TelemetrySample[];
  daily: DailyRecord[];
  sensorHealthy: boolean;
}

const drivers = [
  "Nguyen Van Hung", "Tran Quoc Bao", "Le Minh Tuan", "Pham Duc Anh", "Hoang Van Khanh",
  "Do Thanh Son", "Vu Hai Dang", "Bui Trong Nghia", "Ngo Gia Bao", "Dang Van Loc",
  "Trinh Quang Huy", "Ly Thanh Nam", "Cao Van Dung", "Phan Dinh Trung", "Mai Van Tien",
  "Ta Quoc Cuong", "Ho Minh Nhat", "Duong Van Thang", "Lam Chi Kien", "Vo Ngoc Hai",
  "Kieu Van Phu", "Chu Ba Dat", "Dinh Cong Vinh", "To Hoang Long", "Ha Van Sang",
  "Luong Tuan Kiet", "Nguyen Ba Don", "Tran Xuan Hoa",
];

const models: [string, VehicleType][] = [
  ["Hino FG8JPSB", "Box Truck"],
  ["Isuzu FVR34", "Box Truck"],
  ["Hyundai HD210", "Box Truck"],
  ["Howo A7 375", "Tractor Unit"],
  ["Freightliner CST120", "Tractor Unit"],
  ["Chenglong H7 380", "Tractor Unit"],
  ["Thaco Auman C300", "Box Truck"],
  ["Dongfeng DFL", "Tanker"],
  ["Hino XZU730", "Tanker"],
  ["Thaco TB120S", "Coach"],
];

const statusWeights: [VehicleStatus, number][] = [
  ["moving", 0.5],
  ["idling", 0.14],
  ["parked", 0.22],
  ["maintenance", 0.08],
  ["offline", 0.06],
];

function weightedStatus(): VehicleStatus {
  const r = rnd();
  let acc = 0;
  for (const [s, w] of statusWeights) {
    acc += w;
    if (r <= acc) return s;
  }
  return "parked";
}

const DAYS = 30;
const today = new Date(Date.UTC(2026, 7, 9));
export const dayKeys = Array.from({ length: DAYS }, (_, i) => {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() - (DAYS - 1 - i));
  return d.toISOString().slice(0, 10);
});

export const shortDate = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return (Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180) / Math.PI;
}

export const vehicles: Vehicle[] = Array.from({ length: 28 }, (_, i) => {
  const [model, type] = models[i % models.length]!;
  const depot = depots[i % depots.length]!;
  const depotRoutes = routes.filter((r) => r.depotId === depot.id);
  const route = depotRoutes[i % depotRoutes.length]!;
  const status = weightedStatus();
  const online = status !== "offline";
  const tankL = type === "Tractor Unit" ? 400 : type === "Tanker" ? 300 : 200;
  const baseline = type === "Tractor Unit" ? between(31, 35, 1) : type === "Coach" ? between(22, 25, 1) : between(26, 30, 1);
  const sensorHealthy = rnd() > 0.07;

  // daily telemetry — the source every aggregate is derived from
  const anomalyDays = new Set<number>();
  if (rnd() > 0.72) anomalyDays.add(between(DAYS - 8, DAYS - 1));
  if (rnd() > 0.9) anomalyDays.add(between(0, DAYS - 9));

  const efficiencyDrift = between(-8, 12, 1) / 100; // -8% .. +12% vs baseline
  const daily: DailyRecord[] = dayKeys.map((date, d) => {
    const weekend = (d + 3) % 7 >= 5;
    const active = status === "maintenance" && d > DAYS - 4 ? false : rnd() > (weekend ? 0.45 : 0.08);
    const km = active ? between(weekend ? 90 : 180, weekend ? 300 : 520) : 0;
    const idleMinutes = active ? between(18, 95) : between(0, 12);
    const idleFuelL = round(idleMinutes * 0.035, 1);
    const dayEff = baseline * (1 + efficiencyDrift + between(-25, 25, 2) / 1000);
    const fuelL = round((km * dayEff) / 100 + idleFuelL, 1);
    const anomalyL = anomalyDays.has(d) && active ? between(38, 86) : 0;
    return { date, km, fuelL: round(fuelL + anomalyL, 1), idleMinutes, idleFuelL, anomalyL };
  });

  const progress = between(4, 96) / 100;
  const pos = status === "parked" || status === "maintenance"
    ? { lat: depot.lat + between(-12, 12) / 1000, lng: depot.lng + between(-12, 12) / 1000, label: depot.name }
    : pointOnRoute(route, progress);
  const prev = pointOnRoute(route, Math.max(0.001, progress - 0.06));
  const trail = Array.from({ length: 10 }, (_, t) => {
    const p = pointOnRoute(route, Math.max(0.001, progress - (9 - t) * 0.045));
    return { lat: p.lat, lng: p.lng };
  });

  const fuelPct = between(11, 94, 1);
  const telemetry: TelemetrySample[] = Array.from({ length: 24 }, (_, h) => {
    const running = h > 5 && h < 21 && status !== "parked" && status !== "maintenance";
    const drop = daily[DAYS - 1]!.anomalyL > 0 && h === 14 ? 18 : 0;
    const base = Math.min(98, fuelPct + (23 - h) * 1.9 + drop);
    return {
      hour: h,
      fuelPct: round(Math.max(6, Math.min(99, base)), 1),
      speedKph: running ? between(0, 82) : 0,
      ignition: running,
    };
  });

  return {
    id: `V-${1024 + i * 7}`,
    plate: `${between(50, 79)}${pick(["C", "H", "F", "LD"])}-${between(100, 999)}.${between(10, 99)}`,
    model,
    type,
    driver: drivers[i % drivers.length]!,
    phone: `09${between(10, 89)} ${between(100, 999)} ${between(100, 999)}`,
    depotId: depot.id,
    routeId: route.id,
    status,
    online,
    fuelPct,
    tankL,
    baseline,
    odometer: between(64000, 412000),
    engineHours: between(2400, 12800),
    speedKph: status === "moving" ? between(38, 84) : 0,
    ignition: status === "moving" || status === "idling",
    lastSeenMin: online ? between(0, 4) : between(95, 900),
    lat: pos.lat,
    lng: pos.lng,
    heading: bearing(prev, pos),
    location: pos.label,
    progress,
    trail,
    telemetry,
    daily,
    sensorHealthy,
  };
});

export const vehicleById = (id: string) => vehicles.find((v) => v.id === id);

export const statusLabel: Record<VehicleStatus, string> = {
  moving: "Moving",
  idling: "Idling",
  parked: "Parked",
  maintenance: "Maintenance",
  offline: "Offline",
};

/* --------------------------------- events --------------------------------- */

export type EventKind =
  | "fuel_drop"
  | "refueling"
  | "overconsumption"
  | "idling"
  | "sensor_error"
  | "route_deviation"
  | "offline";

export type AlertSeverity = "critical" | "warning" | "info";
export type WorkflowStatus = "New" | "In Progress" | "Verified" | "Dismissed";

export interface FleetEvent {
  id: string;
  vehicleId: string;
  plate: string;
  kind: EventKind;
  severity: AlertSeverity;
  title: string;
  detail: string;
  /** kind-specific measurement — exactly one is meaningful per event kind */
  metric: {
    litersLost?: number;
    litersAdded?: number;
    receiptLiters?: number | null;
    overPct?: number;
    durationMin?: number;
    distanceKm?: number;
    sensorStatus?: string;
  };
  lat: number;
  lng: number;
  location: string;
  date: string; // ISO date
  time: string; // HH:mm
  workflow: WorkflowStatus;
  /** telemetry snapshot captured at detection time */
  evidence: {
    fuelPctBefore: number;
    fuelPctAfter: number;
    ignition: boolean;
    speedKph: number;
    /** event-day 24h tank trace used by the evidence chart */
    fuelTrend: TelemetrySample[];
  };
}

export const eventKindLabel: Record<EventKind, string> = {
  fuel_drop: "Suspected Fuel Loss",
  refueling: "Detected Refueling Event",
  overconsumption: "Fuel Anomaly — Overconsumption",
  idling: "Excessive Idling",
  sensor_error: "Fuel Sensor Error",
  route_deviation: "Route Deviation",
  offline: "Telemetry Offline",
};

const hhmm = (startHour = 0, endHour = 23) =>
  `${String(between(startHour, endHour)).padStart(2, "0")}:${String(between(0, 59)).padStart(2, "0")}`;

function eventPosition(v: Vehicle, back: number) {
  const route = routeById(v.routeId);
  return pointOnRoute(route, Math.max(0.01, v.progress - back));
}

function clampPct(n: number) {
  return round(Math.max(4, Math.min(99, n)), 1);
}

function evidenceTrend(
  eventHour: number,
  before: number,
  after: number,
  kind: EventKind,
): TelemetrySample[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const fuelPct =
      hour < eventHour
        ? clampPct(before + (eventHour - hour) * 0.45)
        : clampPct(after - (hour - eventHour) * 0.45);
    const driving = kind === "overconsumption" || kind === "route_deviation";
    const idling = kind === "idling";
    return {
      hour,
      fuelPct,
      speedKph: driving ? 54 : 0,
      ignition: driving || idling,
    };
  });
}

function workflowForDay(dayIndex: number): WorkflowStatus {
  return dayIndex >= DAYS - 7
    ? pick(["New", "In Progress", "Verified", "Verified", "Dismissed", "Dismissed"] as const)
    : pick(["Verified", "Verified", "Verified", "Dismissed"] as const);
}

const events: FleetEvent[] = [];
let eventSeq = 9200;

type EventOverrides = {
  position?: GeoPoint;
  time?: string;
  fuelPctBefore?: number;
  fuelPctAfter?: number;
  workflow?: WorkflowStatus;
};

function pushEvent(
  v: Vehicle,
  kind: EventKind,
  severity: AlertSeverity,
  detail: string,
  metric: FleetEvent["metric"],
  dayIndex: number,
  drop = 0,
  overrides: EventOverrides = {},
): FleetEvent {
  const p = overrides.position ?? eventPosition(v, between(2, 30) / 100);
  const time = overrides.time ?? hhmm();
  const eventHour = Number(time.slice(0, 2));
  const defaultBefore = round(Math.min(92, Math.max(28, v.fuelPct + between(60, 180) / 10)), 1);
  const before = clampPct(overrides.fuelPctBefore ?? defaultBefore);
  const after = clampPct(overrides.fuelPctAfter ?? (before - drop));
  const driving = kind === "overconsumption" || kind === "route_deviation";
  const event: FleetEvent = {
    id: `EV-${(eventSeq += 3)}`,
    vehicleId: v.id,
    plate: v.plate,
    kind,
    severity,
    title: eventKindLabel[kind],
    detail,
    metric,
    lat: p.lat,
    lng: p.lng,
    location: p.label,
    date: dayKeys[dayIndex]!,
    time,
    workflow: overrides.workflow ?? workflowForDay(dayIndex),
    evidence: {
      fuelPctBefore: before,
      fuelPctAfter: after,
      ignition: kind === "idling" || driving,
      speedKph: driving ? between(42, 78) : 0,
      fuelTrend: evidenceTrend(eventHour, before, after, kind),
    },
  };
  events.push(event);
  return event;
}

vehicles.forEach((v) => {
  v.daily.forEach((d, i) => {
    if (d.anomalyL > 0) {
      const pctDrop = round((d.anomalyL / v.tankL) * 100, 1);
      pushEvent(
        v,
        "fuel_drop",
        "critical",
        `Tank level fell ${d.anomalyL}L in under 9 minutes while the engine was off and the vehicle stationary.`,
        { litersLost: d.anomalyL },
        i,
        pctDrop,
        { time: "14:00" },
      );
    }
    const eff = d.km > 0 ? (d.fuelL - d.idleFuelL - d.anomalyL) / (d.km / 100) : 0;
    if (d.km > 0 && eff > v.baseline * 1.1) {
      pushEvent(
        v,
        "overconsumption",
        "warning",
        `Consumption ran at ${round(eff, 1)} L/100km against a ${v.baseline} L/100km baseline for the shift.`,
        { overPct: round(((eff - v.baseline) / v.baseline) * 100, 1) },
        i,
      );
    }
    if (d.idleMinutes > 78) {
      pushEvent(
        v,
        "idling",
        "warning",
        `Engine idled ${d.idleMinutes} minutes across the shift, wasting an estimated ${d.idleFuelL}L.`,
        { durationMin: d.idleMinutes },
        i,
      );
    }
  });

  if (!v.sensorHealthy) {
    pushEvent(
      v,
      "sensor_error",
      "warning",
      "Fuel level sensor reported noisy readings; level values are unreliable for this window.",
      { sensorStatus: "Signal noise", durationMin: between(25, 190) },
      DAYS - between(1, 4),
    );
  }
  if (!v.online) {
    pushEvent(
      v,
      "offline",
      "warning",
      "No telemetry received from the on-board unit. Values shown are last known data.",
      { durationMin: v.lastSeenMin },
      DAYS - 1,
    );
  }
  if (rnd() > 0.86) {
    pushEvent(
      v,
      "route_deviation",
      "info",
      "Vehicle left the planned corridor and rejoined it later in the shift.",
      { distanceKm: between(35, 142) / 10 },
      DAYS - between(1, 6),
    );
  }
});

/* ------------------------------ refuel events ----------------------------- */

export interface RefuelEvent {
  id: string;
  eventId: string;
  vehicleId: string;
  plate: string;
  driver: string;
  sensorLiters: number;
  receiptLiters: number | null;
  varianceL: number | null;
  site: string;
  date: string;
  time: string;
  lat: number;
  lng: number;
  location: string;
}

function refuelSiteLabel(v: Vehicle, p: GeoPoint) {
  const depot = depotById(v.depotId);
  return p.label.includes("Depot") || p.label.includes("Yard")
    ? `${depot.name} Pump`
    : `Fuel stop near ${p.label}`;
}

export const refuelEvents: RefuelEvent[] = vehicles
  .filter((_, i) => i % 3 === 0)
  .slice(0, 9)
  .map((v, i) => {
    let dayIndex = DAYS - 1 - (i % 5);
    // Keep a single material tank step per vehicle/day so the 24h evidence remains unambiguous.
    if (v.daily[dayIndex]!.anomalyL > 0 && dayIndex > 0) dayIndex -= 1;

    const beforePct = between(18, 55, 1);
    const targetAfterPct = between(Math.max(72, Math.ceil(beforePct + 18)), 92, 1);
    const sensorLiters = round(((targetAfterPct - beforePct) / 100) * v.tankL, 1);
    const hasReceipt = rnd() > 0.25;
    const receiptLiters = hasReceipt ? round(sensorLiters + between(-50, 40, 1) / 10, 1) : null;
    const p = eventPosition(v, between(10, 40) / 100);
    const time = hhmm(8, 18);
    const event = pushEvent(
      v,
      "refueling",
      "info",
      `Tank level increased by ${sensorLiters}L; ${hasReceipt ? "matched against an entered receipt." : "no receipt entered yet."}`,
      { litersAdded: sensorLiters, receiptLiters },
      dayIndex,
      0,
      {
        position: p,
        time,
        fuelPctBefore: beforePct,
        fuelPctAfter: targetAfterPct,
      },
    );
    return {
      id: `RF-${4410 + i * 5}`,
      eventId: event.id,
      vehicleId: v.id,
      plate: v.plate,
      driver: v.driver,
      sensorLiters,
      receiptLiters,
      varianceL: receiptLiters === null ? null : round(receiptLiters - sensorLiters, 1),
      site: refuelSiteLabel(v, p),
      date: event.date,
      time: event.time,
      lat: event.lat,
      lng: event.lng,
      location: event.location,
    };
  });

// The current-day vehicle chart is the current snapshot. If a material tank event
// happened today, reuse that exact event-day trace so its marker and step agree.
const currentDate = dayKeys[DAYS - 1]!;
vehicles.forEach((v) => {
  const todayFuelEvent = events
    .filter((e) => e.vehicleId === v.id && e.date === currentDate && (e.kind === "fuel_drop" || e.kind === "refueling"))
    .sort((a, b) => b.time.localeCompare(a.time))[0];
  if (todayFuelEvent) {
    v.telemetry = todayFuelEvent.evidence.fuelTrend.map((t, hour) => ({
      ...t,
      speedKph: v.telemetry[hour]?.speedKph ?? t.speedKph,
      ignition: v.telemetry[hour]?.ignition ?? t.ignition,
    }));
    v.fuelPct = v.telemetry[v.telemetry.length - 1]!.fuelPct;
  }
});

events.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

export const fleetEvents: FleetEvent[] = events;
export const eventsForVehicle = (id: string) => fleetEvents.filter((e) => e.vehicleId === id);

/* ------------------------------- aggregation ------------------------------ */

export type TimeRange = "today" | "7d" | "30d";

export const rangeLabel: Record<TimeRange, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

const rangeDays: Record<TimeRange, number> = { today: 1, "7d": 7, "30d": 30 };

export const rangeStartDate = (range: TimeRange) => dayKeys[DAYS - rangeDays[range]]!;

export const eventsForRange = (range: TimeRange) =>
  fleetEvents.filter((e) => e.date >= rangeStartDate(range));

export const refuelEventsForRange = (range: TimeRange) =>
  refuelEvents.filter((e) => e.date >= rangeStartDate(range));

export interface FleetKpis {
  range: TimeRange;
  days: number;
  distanceKm: number;
  fuelL: number;
  /** L/100km across the whole fleet for the range */
  fleetEfficiency: number;
  baselineEfficiency: number;
  idleFuelL: number;
  idleShare: number;
  suspectedLossL: number;
  /** suspected loss as a share of fuel used in the same range */
  anomalyRate: number;
  vehiclesAboveBaseline: number;
  activeVehicles: number;
  dataAvailability: number;
  openAlerts: number;
  criticalAlerts: number;
  fuelCostVnd: number;
  costPerKm: number;
}

function sliceDaily(v: Vehicle, days: number) {
  return v.daily.slice(DAYS - days);
}

export function fleetKpis(range: TimeRange): FleetKpis {
  const days = rangeDays[range];
  const rows = vehicles.map((v) => {
    const d = sliceDaily(v, days);
    return {
      v,
      km: sum(d.map((x) => x.km)),
      fuelL: sum(d.map((x) => x.fuelL)),
      idleFuelL: sum(d.map((x) => x.idleFuelL)),
      anomalyL: sum(d.map((x) => x.anomalyL)),
    };
  });

  const distanceKm = sum(rows.map((r) => r.km));
  const fuelL = sum(rows.map((r) => r.fuelL));
  const idleFuelL = sum(rows.map((r) => r.idleFuelL));
  const anomalyL = sum(rows.map((r) => r.anomalyL));
  const driveFuel = fuelL - idleFuelL - anomalyL;
  const active = rows.filter((r) => r.km > 0);
  const aboveBaseline = active.filter(
    (r) => (r.fuelL - r.idleFuelL - r.anomalyL) / (r.km / 100) > r.v.baseline * 1.05,
  ).length;

  const inRange = eventsForRange(range);
  const unresolved = (e: FleetEvent) => e.workflow === "New" || e.workflow === "In Progress";
  const baselineFuelL = sum(rows.map((r) => (r.km * r.v.baseline) / 100));

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
    dataAvailability: round((vehicles.filter((v) => v.online && v.sensorHealthy).length / vehicles.length) * 100, 1),
    openAlerts: inRange.filter((e) => e.severity !== "info" && unresolved(e)).length,
    criticalAlerts: inRange.filter((e) => e.severity === "critical" && unresolved(e)).length,
    fuelCostVnd: Math.round(fuelL * FUEL_PRICE_VND),
    costPerKm: distanceKm ? Math.round((fuelL * FUEL_PRICE_VND) / distanceKm) : 0,
  };
}

export interface DailySeriesPoint {
  date: string;
  label: string;
  km: number;
  fuelL: number;
  baselineL: number;
  anomalyL: number;
  idleFuelL: number;
}

export const dailySeries: DailySeriesPoint[] = dayKeys.map((date, i) => {
  const km = sum(vehicles.map((v) => v.daily[i]!.km));
  const fuelL = sum(vehicles.map((v) => v.daily[i]!.fuelL));
  const baselineL = sum(vehicles.map((v) => (v.daily[i]!.km * v.baseline) / 100));
  return {
    date,
    label: shortDate(date),
    km: Math.round(km),
    fuelL: Math.round(fuelL),
    baselineL: Math.round(baselineL),
    anomalyL: Math.round(sum(vehicles.map((v) => v.daily[i]!.anomalyL))),
    idleFuelL: Math.round(sum(vehicles.map((v) => v.daily[i]!.idleFuelL))),
  };
});

export const seriesForRange = (range: TimeRange) =>
  range === "30d" ? dailySeries : dailySeries.slice(DAYS - rangeDays[range]);

/** True weekly buckets (calendar-aligned, 7 real days summed per bucket). */
export interface WeeklyPoint {
  label: string;
  range: string;
  km: number;
  fuelL: number;
  baselineL: number;
  anomalyL: number;
}

export const weeklySeries: WeeklyPoint[] = Array.from({ length: 4 }, (_, w) => {
  const chunk = dailySeries.slice(w * 7 + 2, w * 7 + 9);
  return {
    label: `Week ${w + 1}`,
    range: `${chunk[0]!.label} – ${chunk[chunk.length - 1]!.label}`,
    km: sum(chunk.map((c) => c.km)),
    fuelL: sum(chunk.map((c) => c.fuelL)),
    baselineL: sum(chunk.map((c) => c.baselineL)),
    anomalyL: sum(chunk.map((c) => c.anomalyL)),
  };
});

export function weeklySeriesForRange(range: TimeRange): WeeklyPoint[] {
  const input = seriesForRange(range);
  const out: WeeklyPoint[] = [];
  for (let i = 0; i < input.length; i += 7) {
    const chunk = input.slice(i, i + 7);
    if (!chunk.length) continue;
    out.push({
      label: input.length <= 7 ? rangeLabel[range] : `Week ${out.length + 1}`,
      range: `${chunk[0]!.label} – ${chunk[chunk.length - 1]!.label}`,
      km: sum(chunk.map((c) => c.km)),
      fuelL: sum(chunk.map((c) => c.fuelL)),
      baselineL: sum(chunk.map((c) => c.baselineL)),
      anomalyL: sum(chunk.map((c) => c.anomalyL)),
    });
  }
  return out;
}

export function rangeTotalSeries(range: TimeRange): WeeklyPoint[] {
  const input = seriesForRange(range);
  if (!input.length) return [];
  return [{
    label: rangeLabel[range],
    range: `${input[0]!.label} – ${input[input.length - 1]!.label}`,
    km: sum(input.map((c) => c.km)),
    fuelL: sum(input.map((c) => c.fuelL)),
    baselineL: sum(input.map((c) => c.baselineL)),
    anomalyL: sum(input.map((c) => c.anomalyL)),
  }];
}

/** Hourly fuel usage across the fleet for the current day, from telemetry. */
export const hourlyUsage = Array.from({ length: 24 }, (_, h) => {
  const activeVehicles = vehicles.filter((v) => v.telemetry[h]!.ignition).length;
  const todayFuel = sum(vehicles.map((v) => v.daily[DAYS - 1]!.fuelL));
  const weight = activeVehicles || 0.4;
  const totalWeight = sum(
    Array.from({ length: 24 }, (_, k) => vehicles.filter((v) => v.telemetry[k]!.ignition).length || 0.4),
  );
  return {
    label: `${String(h).padStart(2, "0")}:00`,
    fuelL: round((todayFuel * weight) / totalWeight, 1),
    activeVehicles,
  };
});

export interface DepotStat {
  depotId: string;
  depot: string;
  vehicles: number;
  km: number;
  fuelL: number;
  efficiency: number;
  baseline: number;
  suspectedLossL: number;
  incidents: number;
}

export function depotStats(range: TimeRange): DepotStat[] {
  const days = rangeDays[range];
  const since = dayKeys[DAYS - days]!;
  return depots.map((d) => {
    const vs = vehicles.filter((v) => v.depotId === d.id);
    const km = sum(vs.flatMap((v) => sliceDaily(v, days).map((x) => x.km)));
    const fuelL = sum(vs.flatMap((v) => sliceDaily(v, days).map((x) => x.fuelL)));
    const idle = sum(vs.flatMap((v) => sliceDaily(v, days).map((x) => x.idleFuelL)));
    const anomaly = sum(vs.flatMap((v) => sliceDaily(v, days).map((x) => x.anomalyL)));
    const baselineFuelL = sum(
      vs.flatMap((v) => sliceDaily(v, days).map((x) => (x.km * v.baseline) / 100)),
    );
    return {
      depotId: d.id,
      depot: d.name.replace(" Depot", ""),
      vehicles: vs.length,
      km: Math.round(km),
      fuelL: Math.round(fuelL),
      efficiency: km ? round((fuelL - idle - anomaly) / (km / 100), 1) : 0,
      baseline: km ? round(baselineFuelL / (km / 100), 1) : 0,
      suspectedLossL: Math.round(anomaly),
      incidents: fleetEvents.filter(
        (e) => e.date >= since && e.kind === "fuel_drop" && vs.some((v) => v.id === e.vehicleId),
      ).length,
    };
  });
}

/** Per-vehicle rollup for a range — used by tables and rankings. */
export interface VehicleStat {
  vehicle: Vehicle;
  km: number;
  fuelL: number;
  idleMinutes: number;
  idleFuelL: number;
  efficiency: number;
  deltaVsBaseline: number;
  suspectedLossL: number;
}

export function vehicleStats(range: TimeRange): VehicleStat[] {
  const days = rangeDays[range];
  return vehicles.map((v) => {
    const d = sliceDaily(v, days);
    const km = sum(d.map((x) => x.km));
    const fuelL = sum(d.map((x) => x.fuelL));
    const idleFuelL = sum(d.map((x) => x.idleFuelL));
    const anomalyL = sum(d.map((x) => x.anomalyL));
    const efficiency = km ? round((fuelL - idleFuelL - anomalyL) / (km / 100), 1) : 0;
    return {
      vehicle: v,
      km: Math.round(km),
      fuelL: round(fuelL, 1),
      idleMinutes: sum(d.map((x) => x.idleMinutes)),
      idleFuelL: round(idleFuelL, 1),
      efficiency,
      deltaVsBaseline: km ? round(efficiency - v.baseline, 1) : 0,
      suspectedLossL: round(anomalyL, 1),
    };
  });
}

export const fleetStatusCounts = () => {
  const counts: Record<VehicleStatus, number> = {
    moving: 0,
    idling: 0,
    parked: 0,
    maintenance: 0,
    offline: 0,
  };
  vehicles.forEach((v) => (counts[v.status] += 1));
  return counts;
};

/* -------------------------------- formatting ------------------------------ */

export const formatNum = (n: number, dp = 0) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n);

export const formatVnd = (n: number) => `₫${formatNum(Math.round(n))}`;

export const formatRelative = (min: number) =>
  min < 1 ? "just now" : min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`;

export const formatDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
