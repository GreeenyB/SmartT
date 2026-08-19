import type { DemoTarget, DemoTargetAnchor, DemoTargetRect } from "./demo-targets";

export type DemoStage = "NORMAL" | "INCIDENT" | "VERIFIED";

export interface SmartTDemoApi {
  getStage: () => DemoStage;
  reset: () => void;
  setStage: (stage: DemoStage) => void;
  triggerIncident: () => void;
  verifyIncident: () => void;
  isReady: () => boolean;
  showCursor: () => void;
  hideCursor: () => void;
  moveCursorTo: (
    target: DemoTarget,
    options?: { durationMs?: number; anchor?: DemoTargetAnchor },
  ) => Promise<void>;
  clickTarget: (target: DemoTarget, options?: { ripple?: boolean }) => Promise<void>;
  scrollTargetIntoView: (
    target: DemoTarget,
    options?: { durationMs?: number; block?: "center" | "start" },
  ) => Promise<void>;
  waitForTarget: (target: DemoTarget, timeoutMs?: number) => Promise<void>;
  getTargetRect: (target: DemoTarget) => DemoTargetRect | null;
}

declare global {
  interface Window {
    __SMARTT_DEMO__?: SmartTDemoApi;
  }
}

export {};
