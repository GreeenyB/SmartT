import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";
import { Circle, CircleDot, Pause, Square, WifiOff, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  statusLabel,
  type AlertSeverity,
  type TimeRange,
  type VehicleStatus,
  type WorkflowStatus,
} from "@/lib/fleet-data";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 grid gap-4 sm:flex sm:flex-wrap sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            <span className="h-px w-6 bg-border-strong" />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-[30px]">{title}</h1>
        {description ? <p className="mt-1.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>

  );
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("panel flex flex-col", className)}>
      {title ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-surface-2/40 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
            {subtitle ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("flex-1 p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function RangeSwitch({
  value,
  onChange,
  options = ["today", "7d", "30d"],
}: {
  value: TimeRange;
  onChange: (r: TimeRange) => void;
  options?: TimeRange[];
}) {
  const label: Record<TimeRange, string> = { today: "Today", "7d": "7 days", "30d": "30 days" };
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5 text-xs">
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
          {label[o]}
        </button>
      ))}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  tone = "neutral",
  spark,
  icon,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  deltaLabel?: string;
  tone?: "good" | "bad" | "warn" | "neutral";
  spark?: number[];
  icon?: ReactNode;
}) {
  const strokeVar =
    tone === "bad"
      ? "var(--color-destructive)"
      : tone === "warn"
        ? "var(--color-warning)"
        : tone === "good"
          ? "var(--color-brand-teal)"
          : "var(--color-brand-azure)";
  const sparkId = label.replace(/[^a-z0-9]/gi, "");

  return (
    <div className="panel panel-hover relative overflow-hidden p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <p className="min-w-0 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
        {icon ? (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground">{icon}</span>
        ) : null}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="num text-[32px] font-semibold leading-none tracking-tight">{value}</span>
        {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
      </div>
      <div className="mt-3 flex min-w-0 items-center gap-2">
        {delta ? (
          <span
            className={cn(
              "num text-xs font-semibold",
              tone === "good"
                ? "text-success"
                : tone === "bad"
                  ? "text-destructive"
                  : tone === "warn"
                    ? "text-warning"
                    : "text-muted-foreground",
            )}
          >
            {delta}
          </span>
        ) : null}
        {deltaLabel ? <span className="truncate text-xs text-muted-foreground">{deltaLabel}</span> : null}
      </div>

      {spark ? (
        <div className="mt-4 h-10">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark.map((v, i) => ({ i, v }))} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`sp-${sparkId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeVar} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={strokeVar} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={strokeVar} strokeWidth={1.8} fill={`url(#sp-${sparkId})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------- badges --------------------------------- */

const statusStyle: Record<VehicleStatus, { dot: string; icon: typeof Circle }> = {
  moving: { dot: "text-primary", icon: CircleDot },
  idling: { dot: "text-warning", icon: Pause },
  parked: { dot: "text-muted-foreground", icon: Square },
  maintenance: { dot: "text-muted-foreground", icon: Wrench },
  offline: { dot: "text-muted-foreground", icon: WifiOff },
};

export function StatusPill({ status }: { status: VehicleStatus }) {
  const s = statusStyle[status];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-foreground">
      <s.icon className={cn("h-3 w-3", s.dot)} />
      {statusLabel[status]}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const map: Record<AlertSeverity, { dot: string; label: string }> = {
    critical: { dot: "bg-destructive", label: "Critical" },
    warning: { dot: "bg-warning", label: "Warning" },
    info: { dot: "bg-primary", label: "Info" },
  };
  const s = map[severity];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-foreground">
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

export function WorkflowBadge({ status }: { status: WorkflowStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "New" ? "bg-primary" : status === "In Progress" ? "bg-neutral" : status === "Verified" ? "bg-success" : "bg-border-strong",
        )}
      />
      {status}
    </span>
  );
}

export function FuelBar({ pct, tankL, stale }: { pct: number; tankL?: number; stale?: boolean }) {
  const tone = stale ? "bg-neutral" : pct < 15 ? "bg-destructive" : pct < 30 ? "bg-warning" : "bg-primary";
  return (
    <div className="flex min-w-[120px] items-center gap-2.5">
      <div className="h-1.5 w-full min-w-0 overflow-hidden rounded-full bg-surface-2">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="num w-[68px] shrink-0 text-right text-xs">
        {pct.toFixed(0)}%
        {tankL ? <span className="text-muted-foreground"> · {Math.round((pct / 100) * tankL)}L</span> : null}
      </span>
    </div>
  );
}

/* --------------------------------- charts --------------------------------- */

export function ChartTooltip() {
  return (
    <Tooltip
      cursor={{ stroke: "var(--color-border-strong)", strokeWidth: 1 }}
      contentStyle={{
        background: "var(--color-popover)",
        border: "1px solid var(--color-border-strong)",
        borderRadius: 10,
        fontSize: 12,
        boxShadow: "var(--shadow-float)",
      }}
      labelStyle={{ color: "var(--color-muted-foreground)", fontSize: 11, marginBottom: 4 }}
      itemStyle={{ color: "var(--color-foreground)" }}
    />
  );
}

export const axisProps = {
  tick: { fill: "var(--color-muted-foreground)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
};

const legendProps = {
  iconType: "plainline" as const,
  iconSize: 12,
  wrapperStyle: { fontSize: 11, color: "var(--color-muted-foreground)", paddingTop: 8 },
};

export function ConsumptionTrendChart({
  data,
  interval = 4,
}: {
  data: { label: string; fuelL: number; baselineL: number; anomalyL: number }[];
  interval?: number;
}) {
  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="gActual" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.24} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" {...axisProps} interval={interval} />
          <YAxis {...axisProps} width={52} />
          <ChartTooltip />
          <Legend {...legendProps} />
          <Area
            type="monotone"
            name="Actual fuel used (L)"
            dataKey="fuelL"
            stroke="var(--color-primary)"
            strokeWidth={2}
            fill="url(#gActual)"
            dot={false}
          />
          <Line
            type="monotone"
            name="Baseline (L)"
            dataKey="baselineL"
            stroke="var(--color-neutral)"
            strokeWidth={1.6}
            strokeDasharray="5 4"
            dot={false}
          />
          <Bar name="Suspected loss (L)" dataKey="anomalyL" fill="var(--color-destructive)" maxBarSize={10} radius={[2, 2, 0, 0]} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HourlyChart({ data }: { data: { label: string; fuelL: number; activeVehicles: number }[] }) {
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" {...axisProps} interval={2} />
          <YAxis {...axisProps} width={46} />
          <ChartTooltip />
          <Legend {...legendProps} />
          <Bar name="Fuel used (L)" dataKey="fuelL" fill="var(--color-primary)" radius={[3, 3, 0, 0]} maxBarSize={16} />
          <Bar
            name="Vehicles with ignition on"
            dataKey="activeVehicles"
            fill="var(--color-chart-2)"
            fillOpacity={0.45}
            radius={[3, 3, 0, 0]}
            maxBarSize={16}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FuelLevelChart({
  data,
  markers,
}: {
  data: { hour: number; fuelPct: number }[];
  markers?: { hour: number; tone: "destructive" | "success" }[] | undefined;
}) {
  const shaped = data.map((d) => ({ label: `${String(d.hour).padStart(2, "0")}:00`, fuelPct: d.fuelPct }));
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={shaped} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" {...axisProps} interval={3} />
          <YAxis {...axisProps} width={44} domain={[0, 100]} />
          <ChartTooltip />
          {markers?.map((m) => (
            <ReferenceLine
              key={`${m.hour}-${m.tone}`}
              x={`${String(m.hour).padStart(2, "0")}:00`}
              stroke={m.tone === "destructive" ? "var(--color-destructive)" : "var(--color-success)"}
              strokeDasharray="4 3"
            />
          ))}
          <Line type="stepAfter" name="Tank level (%)" dataKey="fuelPct" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
