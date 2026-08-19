import type { DemoStage, SmartTDemoApi } from "./demo-types";

const stages: readonly DemoStage[] = ["NORMAL", "INCIDENT", "VERIFIED"];

export function isDemoStage(value: string): value is DemoStage {
  return stages.includes(value as DemoStage);
}

export function installDemoController(api: SmartTDemoApi) {
  window.__SMARTT_DEMO__ = api;
  return () => {
    if (window.__SMARTT_DEMO__ === api) {
      delete window.__SMARTT_DEMO__;
    }
  };
}
