import { useRouterState } from "@tanstack/react-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { installDemoController, isDemoStage } from "./demo-controller";
import { DemoCursor, type DemoPresentationApi } from "./demo-cursor";
import type { DemoStage, SmartTDemoApi } from "./demo-types";

interface DemoContextValue {
  active: boolean;
  stage: DemoStage;
  setStage: (stage: DemoStage) => void;
  reset: () => void;
  triggerIncident: () => void;
  verifyIncident: () => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

function captureModeRequested() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("capture") === "1";
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const captureRequested = useRouterState({
    select: (state) => state.location.searchStr.includes("capture=1"),
  });
  const [active, setActive] = useState(false);
  const [stage, setStageState] = useState<DemoStage>("NORMAL");
  const stageRef = useRef(stage);
  const presentationRef = useRef<DemoPresentationApi | null>(null);
  const presentationReadyRef = useRef(false);

  useEffect(() => {
    if (captureRequested || captureModeRequested()) {
      setActive(true);
    }
  }, [captureRequested]);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  const setStage = useCallback((next: DemoStage) => {
    if (isDemoStage(next)) {
      setStageState(next);
    }
  }, []);

  const reset = useCallback(() => setStageState("NORMAL"), []);
  const triggerIncident = useCallback(() => setStageState("INCIDENT"), []);
  const verifyIncident = useCallback(() => setStageState("VERIFIED"), []);
  const registerPresentationApi = useCallback((api: DemoPresentationApi | null) => {
    presentationRef.current = api;
    presentationReadyRef.current = Boolean(api);
  }, []);
  const requirePresentation = useCallback(() => {
    const presentation = presentationRef.current;
    if (!presentation) {
      throw new Error("SmartT demo presentation layer is not ready.");
    }
    return presentation;
  }, []);

  useEffect(() => {
    if (!active) return;

    const api: SmartTDemoApi = {
      getStage: () => stageRef.current,
      reset,
      setStage,
      triggerIncident,
      verifyIncident,
      isReady: () => active && presentationReadyRef.current && Boolean(presentationRef.current),
      showCursor: () => requirePresentation().showCursor(),
      hideCursor: () => requirePresentation().hideCursor(),
      moveCursorTo: (...args) => requirePresentation().moveCursorTo(...args),
      clickTarget: (...args) => requirePresentation().clickTarget(...args),
      scrollTargetIntoView: (...args) => requirePresentation().scrollTargetIntoView(...args),
      waitForTarget: (...args) => requirePresentation().waitForTarget(...args),
      getTargetRect: (...args) => presentationRef.current?.getTargetRect(...args) ?? null,
    };

    return installDemoController(api);
  }, [active, requirePresentation, reset, setStage, triggerIncident, verifyIncident]);

  const value = useMemo(
    () => ({
      active,
      stage,
      setStage,
      reset,
      triggerIncident,
      verifyIncident,
    }),
    [active, stage, setStage, reset, triggerIncident, verifyIncident],
  );

  return (
    <DemoContext.Provider value={value}>
      {children}
      {active ? <DemoCursor onApiReady={registerPresentationApi} /> : null}
    </DemoContext.Provider>
  );
}

export function useDemoScenario() {
  const context = useContext(DemoContext);
  if (!context) {
    return {
      active: false,
      stage: "NORMAL" as DemoStage,
      setStage: () => undefined,
      reset: () => undefined,
      triggerIncident: () => undefined,
      verifyIncident: () => undefined,
    };
  }
  return context;
}
