export const DEMO_TARGETS = {
  OVERVIEW_LOSS_KPI: "overview-loss-kpi",
  OVERVIEW_OPEN_ALERTS_KPI: "overview-open-alerts-kpi",
  NOTIFICATION_BELL: "notification-bell",
  HERO_NOTIFICATION: "hero-notification",
  ALERT_HERO_EVENT: "alert-hero-event",
  ALERT_EVIDENCE: "alert-evidence",
  ALERT_MEASUREMENT: "alert-measurement",
  ALERT_VEHICLE_CONTEXT: "alert-vehicle-context",
  ALERT_LOCATION: "alert-location",
  ALERT_FUEL_TREND: "alert-fuel-trend",
  ALERT_MARK_VERIFIED: "alert-mark-verified",
  SIDEBAR_OVERVIEW: "sidebar-overview",
} as const;

export type DemoTarget = (typeof DEMO_TARGETS)[keyof typeof DEMO_TARGETS];

export type DemoTargetAnchor = "center" | "left" | "right";

export interface DemoTargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
