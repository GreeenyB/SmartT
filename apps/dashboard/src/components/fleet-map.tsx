import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Crosshair } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Lightweight slippy-map canvas (OpenStreetMap raster tiles).
 * Pure math + <img> tiles, no map library, SSR safe.
 */

export type MapTone = "primary" | "warning" | "destructive" | "neutral" | "success";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  tone: MapTone;
  label: string;
  sublabel?: string;
  shape?: "vehicle" | "event" | "depot";
}

const TILE = 256;
const clampZoom = (z: number) => Math.max(4, Math.min(16, z));

const lngToWorldX = (lng: number, z: number) => ((lng + 180) / 360) * TILE * 2 ** z;
const latToWorldY = (lat: number, z: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z;
};
const worldXToLng = (x: number, z: number) => (x / (TILE * 2 ** z)) * 360 - 180;
const worldYToLat = (y: number, z: number) => {
  const n = Math.PI - 2 * Math.PI * (y / (TILE * 2 ** z));
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

const toneBg: Record<MapTone, string> = {
  primary: "bg-primary",
  warning: "bg-warning",
  destructive: "bg-destructive",
  neutral: "bg-neutral",
  success: "bg-success",
};

function fitView(points: { lat: number; lng: number }[], w: number, h: number) {
  if (!points.length) return { lat: 14.5, lng: 107.5, zoom: 5 };
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  let zoom = 4;
  for (let z = 16; z >= 4; z--) {
    const dx = Math.abs(lngToWorldX(maxLng, z) - lngToWorldX(minLng, z));
    const dy = Math.abs(latToWorldY(minLat, z) - latToWorldY(maxLat, z));
    if (dx < w * 0.82 && dy < h * 0.78) {
      zoom = z;
      break;
    }
  }
  return { ...center, zoom };
}

export function FleetMap({
  markers,
  path,
  height = 420,
  selectedId,
  onSelect,
  className,
  focus,
}: {
  markers: MapMarker[];
  path?: { lat: number; lng: number }[];
  height?: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
  focus?: { lat: number; lng: number; zoom: number };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 960, h: height });
  const [view, setView] = useState(() => focus ?? { lat: 14.5, lng: 107.5, zoom: 5 });
  const touched = useRef(false);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const fitPoints = useMemo(
    () => [...markers.map((m) => ({ lat: m.lat, lng: m.lng })), ...(path ?? [])],
    [markers, path],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry!.contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const reset = useCallback(() => {
    setView(focus ?? fitView(fitPoints, size.w, size.h));
    touched.current = false;
  }, [focus, fitPoints, size.w, size.h]);

  useEffect(() => {
    if (!touched.current) setView(focus ?? fitView(fitPoints, size.w, size.h));
  }, [focus, fitPoints, size.w, size.h]);

  const zoomAt = useCallback(
    (nextZoom: number, px?: number, py?: number) => {
      touched.current = true;
      setView((v) => {
        const z = clampZoom(nextZoom);
        if (z === v.zoom) return v;
        if (px === undefined || py === undefined) return { ...v, zoom: z };
        const cx = lngToWorldX(v.lng, v.zoom);
        const cy = latToWorldY(v.lat, v.zoom);
        const wx = cx + (px - size.w / 2);
        const wy = cy + (py - size.h / 2);
        const lat = worldYToLat(wy, v.zoom);
        const lng = worldXToLng(wx, v.zoom);
        const nx = lngToWorldX(lng, z) - (px - size.w / 2);
        const ny = latToWorldY(lat, z) - (py - size.h / 2);
        return { lat: worldYToLat(ny, z), lng: worldXToLng(nx, z), zoom: z };
      });
    },
    [size.w, size.h],
  );

  const wheelRef = useRef(zoomAt);
  wheelRef.current = zoomAt;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const r = el.getBoundingClientRect();
      setView((v) => {
        const target = clampZoom(v.zoom + (dy < 0 ? 1 : -1));
        if (target === v.zoom) return v;
        wheelRef.current(target, e.clientX - r.left, e.clientY - r.top);
        return v;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const centerX = lngToWorldX(view.lng, view.zoom);
  const centerY = latToWorldY(view.lat, view.zoom);
  const originX = centerX - size.w / 2;
  const originY = centerY - size.h / 2;

  const project = (lat: number, lng: number) => ({
    x: lngToWorldX(lng, view.zoom) - originX,
    y: latToWorldY(lat, view.zoom) - originY,
  });

  const tiles: { key: string; url: string; left: number; top: number }[] = [];
  const n = 2 ** view.zoom;
  const x0 = Math.floor(originX / TILE);
  const y0 = Math.floor(originY / TILE);
  const x1 = Math.floor((originX + size.w) / TILE);
  const y1 = Math.floor((originY + size.h) / TILE);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= n) continue;
      const tx = ((x % n) + n) % n;
      tiles.push({
        key: `${view.zoom}/${x}/${y}`,
        url: `https://tile.openstreetmap.org/${view.zoom}/${tx}/${y}.png`,
        left: x * TILE - originX,
        top: y * TILE - originY,
      });
    }
  }

  const pathD = path?.length
    ? path
        .map((p, i) => {
          const { x, y } = project(p.lat, p.lng);
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(" ")
    : null;

  return (
    <div
      ref={ref}
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-surface-2 select-none",
        className,
      )}
      style={{ height }}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY };
        (e.target as Element).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x;
        const dy = e.clientY - drag.current.y;
        drag.current = { x: e.clientX, y: e.clientY };
        touched.current = true;
        setView((v) => ({
          lat: worldYToLat(latToWorldY(v.lat, v.zoom) - dy, v.zoom),
          lng: worldXToLng(lngToWorldX(v.lng, v.zoom) - dx, v.zoom),
          zoom: v.zoom,
        }));
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerLeave={() => (drag.current = null)}
    >
      <div className="map-tiles absolute inset-0">
        {tiles.map((t) => (
          <img
            key={t.key}
            src={t.url}
            alt=""
            aria-hidden
            draggable={false}
            loading="lazy"
            className="pointer-events-none absolute h-[256px] w-[256px] max-w-none opacity-90"
            style={{ left: t.left, top: t.top }}
          />
        ))}
      </div>

      {pathD ? (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          <path d={pathD} fill="none" stroke="var(--color-primary)" strokeWidth={3} strokeOpacity={0.85} strokeLinecap="round" />
        </svg>
      ) : null}

      {markers.map((m) => {
        const { x, y } = project(m.lat, m.lng);
        if (x < -40 || y < -40 || x > size.w + 40 || y > size.h + 40) return null;
        const active = selectedId === m.id;
        return (
          <button
            key={m.id}
            type="button"
            title={`${m.label}${m.sublabel ? ` — ${m.sublabel}` : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(m.id);
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: x, top: y, zIndex: active ? 20 : 10 }}
          >
            <span
              className={cn(
                "block rounded-full border-2 border-card shadow-sm transition-transform",
                toneBg[m.tone],
                m.shape === "depot" ? "h-2.5 w-2.5 rounded-[3px]" : "h-3.5 w-3.5",
                m.shape === "event" ? "h-3 w-3 rotate-45 rounded-[3px]" : "",
                active ? "scale-[1.45] ring-2 ring-primary/45" : "hover:scale-125",
              )}
            />
          </button>
        );
      })}

      <div className="absolute right-3 top-3 z-30 flex flex-col overflow-hidden rounded-lg border border-border bg-card/95 shadow-sm backdrop-blur">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => zoomAt(view.zoom + 1)}
          className="grid h-8 w-8 place-items-center text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => zoomAt(view.zoom - 1)}
          className="grid h-8 w-8 place-items-center border-t border-border text-muted-foreground transition-colors hover:text-foreground"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Reset view"
          onClick={reset}
          className="grid h-8 w-8 place-items-center border-t border-border text-muted-foreground transition-colors hover:text-foreground"
        >
          <Crosshair className="h-4 w-4" />
        </button>
      </div>

      <p className="absolute bottom-1 right-2 z-30 rounded bg-card/80 px-1.5 text-[10px] text-muted-foreground">
        © OpenStreetMap contributors
      </p>
    </div>
  );
}

export function MapLegend({ items }: { items: { tone: MapTone; label: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={cn("h-2 w-2 rounded-full", toneBg[i.tone])} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
