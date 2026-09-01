import { useEffect, useRef, useState } from "react";

/* SmartT live overlay — pulls real device telemetry from the V2 backend.
 *
 * The FleetView demo dataset stays the base; this hook adds a live vehicle
 * (TRUCK_01) and real incidents on top of it so the dashboard shows the
 * actual prototype alongside the fleet simulation.
 *
 * Configure with VITE_SMARTT_API / VITE_SMARTT_AUTH or edit the defaults.
 * AUTH is a precomputed "Basic base64(user:pass)" matching backend/app.py
 * (defaults smartt:smartt-bkuit-2026).
 */
const API_BASE =
  (import.meta.env["VITE_SMARTT_API"] as string | undefined) ??
  "https://granted-advise-barbie-interaction.trycloudflare.com/api/v2";
const AUTH =
  (import.meta.env["VITE_SMARTT_AUTH"] as string | undefined) ??
  "Basic c21hcnR0OnNtYXJ0dC1ia3VpdC0yMDI2";

export interface LiveTelemetry {
  schema_version?: number;
  record_type?: string;
  device_id?: string;
  vehicle_id?: string;
  uptime_ms?: number;
  event_seq?: number;
  event?: string;
  decision_state?: string;
  confidence?: number;
  reasons?: string[];
  fuel?: {
    distance_mm?: number;
    height_mm?: number;
    volume_l?: number;
    volume_l_raw?: number;
    percent?: number;
    rate_lps?: number;
    quality?: number;
    innovation_score?: number;
  };
  intelligence?: {
    baseline_ready?: boolean;
    baseline_l?: number;
    dynamic_threshold_l?: number;
    slosh_score?: number;
    change_point_score?: number;
    drop_cusum_l?: number;
    expected_consumption_l?: number;
    expected_fuel_l?: number;
    unexplained_loss_l?: number;
    ecu_fuel_level_pct?: number;
    ecu_fuel_disagreement_pct?: number;
  };
  context?: {
    mode?: string;
    speed_kmh?: number;
    gps_fresh?: boolean;
    can_fresh?: boolean;
    ignition_known?: boolean;
    ignition_on?: boolean;
    rpm?: number;
    engine_load_pct?: number;
    motion_energy?: number;
    roll_deg?: number;
    pitch_deg?: number;
  };
  gps?: {
    fix?: boolean;
    lat?: number;
    lon?: number;
    last_update_ms?: number;
  };
}

export interface LiveState {
  latest: LiveTelemetry | null;
  incidents: LiveTelemetry[];
  connected: boolean;
  error: string | null;
}

async function fetchJson(url: string, signal: AbortSignal | null): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Authorization: AUTH },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

export function useLiveData(intervalMs = 2000): LiveState {
  const [state, setState] = useState<LiveState>({
    latest: null,
    incidents: [],
    connected: false,
    error: null,
  });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        const [latest, incidents] = await Promise.all([
          fetchJson(`${API_BASE}/latest`, controller.signal),
          fetchJson(`${API_BASE}/incidents?limit=5`, controller.signal),
        ]);
        if (cancelled) return;
        const hasLatest = Boolean(latest && typeof latest === "object");
        const incidentList = Array.isArray(incidents) ? (incidents as LiveTelemetry[]) : [];
        setState({
          latest: hasLatest ? (latest as LiveTelemetry) : null,
          incidents: incidentList,
          connected: hasLatest || incidentList.length > 0,
          error: null,
        });
      } catch (error) {
        if (cancelled) return;
        if ((error as Error).name === "AbortError") return;
        setState((previous) => ({
          ...previous,
          connected: false,
          error: (error as Error).message,
        }));
      }
    };

    poll();
    const timer = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      controllerRef.current?.abort();
      clearInterval(timer);
    };
  }, [intervalMs]);

  return state;
}
