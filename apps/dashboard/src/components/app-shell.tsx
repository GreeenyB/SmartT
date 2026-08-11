import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, BarChart3, Bell, Droplets, Gauge, Map as MapIcon, Search, Truck, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";

import { ThemeToggle } from "@/components/theme";
import { fleetEvents, fleetKpis, vehicles } from "@/lib/fleet-data";
import { cn } from "@/lib/utils";

type NavTo = "/" | "/live-map" | "/vehicles" | "/fuel" | "/alerts" | "/reports";

type NavItem = {
  to: NavTo;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  exact?: boolean;
  badge?: string;
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const kpis = fleetKpis("30d");
  const [q, setQ] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const nav: NavItem[] = [
    { to: "/", label: "Overview", icon: Gauge, exact: true },
    { to: "/live-map", label: "Live Map", icon: MapIcon },
    { to: "/vehicles", label: "Vehicles", icon: Truck, badge: String(vehicles.length) },
    { to: "/fuel", label: "Fuel Analytics", icon: Droplets },
    { to: "/alerts", label: "Alerts", icon: AlertTriangle, badge: String(kpis.openAlerts) },
    { to: "/reports", label: "Analytics & Reports", icon: BarChart3 },
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") setNotifOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    const v = vehicles
      .filter((x) => x.plate.toLowerCase().includes(term) || x.driver.toLowerCase().includes(term))
      .slice(0, 5)
      .map((x) => ({ id: x.id, kind: "vehicle" as const, title: x.plate, sub: `${x.driver} · ${x.model}` }));
    const e = fleetEvents
      .filter((x) => x.id.toLowerCase().includes(term) || x.title.toLowerCase().includes(term))
      .slice(0, 4)
      .map((x) => ({ id: x.id, kind: "event" as const, title: x.title, sub: `${x.id} · ${x.plate}` }));
    return [...v, ...e];
  }, [q]);

  const recent = fleetEvents.filter((e) => e.workflow === "New").slice(0, 5);

  return (
    <div className="flex min-h-screen w-full">
      <aside
        className="sticky top-0 hidden h-screen w-[252px] shrink-0 flex-col border-r border-sidebar-border text-sidebar-foreground lg:flex"
        style={{ backgroundImage: "var(--gradient-sidebar)" }}
      >
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
          <img
            src="/smartt-mark-light.png"
            alt=""
            aria-hidden
            className="h-9 w-auto shrink-0 object-contain drop-shadow-[0_1px_6px_rgba(0,0,0,0.35)]"
          />
          <div className="min-w-0">
            <p className="truncate font-display text-[16px] font-semibold leading-tight text-sidebar-accent-foreground">
              SmartT
            </p>
            <p className="truncate text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/60">
              Fleet &amp; Fuel
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto scroll-slim px-3 py-4">
          <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/50">
            Monitoring
          </p>
          {nav.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[var(--shadow-glow)]"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                )}
              >
                <span
                  className={cn("h-5 w-[3px] rounded-full transition-colors", active ? "bg-brand-teal" : "bg-transparent")}
                />
                <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.badge ? (
                  <span className="num rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-sidebar-foreground/80">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-brand-teal" />
              <p className="text-xs font-semibold text-sidebar-accent-foreground">Simulation snapshot</p>
            </div>
            <p className="num mt-1.5 text-[11px] text-sidebar-foreground/60">
              {vehicles.length} units represented · static telemetry dataset
            </p>
          </div>
        </div>
      </aside>


      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-background/75 px-4 shadow-[0_1px_0_0_var(--color-border)] backdrop-blur-xl lg:px-7">
          <div className="lg:hidden">
            <img src="/smartt-logo.png" alt="SmartT" className="h-8 w-auto object-contain" />
          </div>
          <div className="relative flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-border bg-surface px-3 transition-colors focus-within:border-brand-cyan/60 focus-within:shadow-[var(--shadow-glow)]">

              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search plate, driver or event ID…"
                aria-label="Global search"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {q ? (
                <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <span className="num hidden shrink-0 items-center gap-0.5 rounded border border-border px-1.5 text-[10px] text-muted-foreground sm:flex">
                  ⌘K
                </span>
              )}
            </div>

            {q.trim().length >= 2 ? (
              <div className="absolute left-0 top-11 z-50 w-full max-w-md overflow-hidden rounded-lg border border-border bg-popover shadow-[var(--shadow-float)]">
                {results.length ? (
                  <ul className="max-h-80 overflow-y-auto scroll-slim py-1">
                    {results.map((r) => (
                      <li key={`${r.kind}-${r.id}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setQ("");
                            if (r.kind === "vehicle") navigate({ to: "/vehicles/$vehicleId", params: { vehicleId: r.id } });
                            else navigate({ to: "/alerts", search: { event: r.id } });
                          }}
                          className="flex w-full flex-col items-start px-4 py-2 text-left transition-colors hover:bg-surface-2"
                        >
                          <span className="num text-sm font-semibold">{r.title}</span>
                          <span className="text-xs text-muted-foreground">{r.sub}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-6 text-center text-xs text-muted-foreground">No matching vehicle or event.</p>
                )}
              </div>
            ) : null}
          </div>

          <nav className="flex items-center gap-1 lg:hidden">
            {nav.map((item) => {
              const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-label={item.label}
                  className={cn("grid h-9 w-9 place-items-center rounded-lg", active ? "bg-primary-soft text-primary" : "text-muted-foreground")}
                >
                  <item.icon className="h-[18px] w-[18px]" />
                </Link>
              );
            })}
          </nav>

          <div className="relative flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              aria-label="Notifications"
              onClick={() => setNotifOpen((o) => !o)}
              className="relative grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground"
            >
              <Bell className="h-4 w-4" />
              {recent.length ? <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-destructive" /> : null}
            </button>

            {notifOpen ? (
              <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-lg border border-border bg-popover shadow-[var(--shadow-float)]">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <p className="text-xs font-semibold">New alerts</p>
                  <span className="num text-[11px] text-muted-foreground">{recent.length}</span>
                </div>
                {recent.length ? (
                  <ul className="divide-y divide-border">
                    {recent.map((e) => (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setNotifOpen(false);
                            navigate({ to: "/alerts", search: { event: e.id } });
                          }}
                          className="w-full px-4 py-3 text-left transition-colors hover:bg-surface-2"
                        >
                          <p className="truncate text-xs font-semibold">{e.title}</p>
                          <p className="num mt-0.5 truncate text-[11px] text-muted-foreground">
                            {e.plate} · {e.time}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-6 text-center text-xs text-muted-foreground">No new alerts.</p>
                )}
              </div>
            ) : null}

            <div className="hidden items-center gap-2.5 rounded-lg border border-border bg-surface py-1.5 pl-2 pr-3 sm:flex">
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary-soft text-[11px] font-semibold text-primary">
                TP
              </div>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-xs font-semibold">Tran Phuong</p>
                <p className="truncate text-[10px] text-muted-foreground">Operations Manager</p>
              </div>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-7">{children}</main>

        <footer className="border-t border-border px-4 py-4 text-[11px] text-muted-foreground lg:px-7">
          SmartT Fleet &amp; Fuel Intelligence · Demonstration dataset · Telemetry values are simulated
        </footer>
      </div>
    </div>
  );
}
