import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DemoTarget, DemoTargetAnchor, DemoTargetRect } from "./demo-targets";

export interface DemoPresentationApi {
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

interface Ripple {
  id: number;
  x: number;
  y: number;
}

const defaultMoveDurationMs = 620;
const defaultScrollDurationMs = 520;
const clickSettleDurationMs = 380;

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function getTargetElement(target: DemoTarget) {
  return document.querySelector<HTMLElement>(`[data-demo-target="${target}"]`);
}

function readRect(target: DemoTarget): DemoTargetRect | null {
  const element = getTargetElement(target);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function targetPoint(rect: DemoTargetRect, anchor: DemoTargetAnchor) {
  const x =
    anchor === "left"
      ? rect.x + Math.min(18, rect.width / 2)
      : anchor === "right"
        ? rect.x + rect.width - Math.min(18, rect.width / 2)
        : rect.x + rect.width / 2;
  return { x, y: rect.y + rect.height / 2 };
}

function animateValue({
  from,
  to,
  durationMs,
  easing,
  onFrame,
}: {
  from: number;
  to: number;
  durationMs: number;
  easing: (t: number) => number;
  onFrame: (value: number) => void;
}) {
  return new Promise<void>((resolve) => {
    if (durationMs <= 0 || from === to) {
      onFrame(to);
      resolve();
      return;
    }

    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = easing(progress);
      onFrame(from + (to - from) * eased);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        onFrame(to);
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

export function DemoCursor({ onApiReady }: { onApiReady: (api: DemoPresentationApi | null) => void }) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const positionRef = useRef(position);
  const rippleIdRef = useRef(0);

  const commitPosition = useCallback((next: { x: number; y: number }) => {
    positionRef.current = next;
    setPosition(next);
  }, []);

  const showCursor = useCallback(() => {
    const next =
      positionRef.current ?? {
        x: Math.round(window.innerWidth * 0.42),
        y: Math.round(window.innerHeight * 0.46),
      };
    commitPosition(next);
    setVisible(true);
  }, [commitPosition]);

  const waitForTarget = useCallback((target: DemoTarget, timeoutMs = 1600) => {
    return new Promise<void>((resolve, reject) => {
      const startedAt = performance.now();
      const check = (now: number) => {
        const rect = readRect(target);
        if (rect && rect.width > 0 && rect.height > 0) {
          resolve();
          return;
        }
        if (now - startedAt >= timeoutMs) {
          reject(new Error(`SmartT demo target not found: ${target}`));
          return;
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }, []);

  const moveCursorTo = useCallback(
    async (target: DemoTarget, options?: { durationMs?: number; anchor?: DemoTargetAnchor }) => {
      await waitForTarget(target, options?.durationMs ? Math.max(options.durationMs, 800) : undefined);
      const rect = readRect(target);
      if (!rect) throw new Error(`SmartT demo target not found: ${target}`);

      const next = targetPoint(rect, options?.anchor ?? "center");
      const current = positionRef.current ?? { x: next.x, y: next.y };
      if (!positionRef.current) {
        commitPosition(current);
      }

      await animateValue({
        from: 0,
        to: 1,
        durationMs: options?.durationMs ?? defaultMoveDurationMs,
        easing: easeInOutCubic,
        onFrame: (progress) => {
          commitPosition({
            x: current.x + (next.x - current.x) * progress,
            y: current.y + (next.y - current.y) * progress,
          });
        },
      });
    },
    [commitPosition, waitForTarget],
  );

  const clickTarget = useCallback(
    async (target: DemoTarget, options?: { ripple?: boolean }) => {
      await moveCursorTo(target, { durationMs: 180 });
      const rect = readRect(target);
      const element = getTargetElement(target);
      if (!rect || !element) throw new Error(`SmartT demo target not found: ${target}`);

      const point = targetPoint(rect, "center");
      if (options?.ripple !== false) {
        const id = rippleIdRef.current + 1;
        rippleIdRef.current = id;
        setRipples((items) => [...items, { id, x: point.x, y: point.y }]);
      }

      element.click();
      await new Promise<void>((resolve) => window.setTimeout(resolve, clickSettleDurationMs));
      setRipples([]);
    },
    [moveCursorTo],
  );

  const scrollTargetIntoView = useCallback(
    async (target: DemoTarget, options?: { durationMs?: number; block?: "center" | "start" }) => {
      await waitForTarget(target);
      const rect = readRect(target);
      if (!rect) throw new Error(`SmartT demo target not found: ${target}`);

      const startY = window.scrollY;
      const viewportOffset =
        options?.block === "start" ? 88 : Math.max(80, window.innerHeight / 2 - rect.height / 2);
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const nextY = Math.min(maxY, Math.max(0, startY + rect.y - viewportOffset));

      await animateValue({
        from: startY,
        to: nextY,
        durationMs: options?.durationMs ?? defaultScrollDurationMs,
        easing: easeOutCubic,
        onFrame: (value) => window.scrollTo(0, value),
      });
      window.scrollTo(0, nextY);
    },
    [waitForTarget],
  );

  const api = useMemo<DemoPresentationApi>(
    () => ({
      showCursor,
      hideCursor: () => setVisible(false),
      moveCursorTo,
      clickTarget,
      scrollTargetIntoView,
      waitForTarget,
      getTargetRect: readRect,
    }),
    [clickTarget, moveCursorTo, scrollTargetIntoView, showCursor, waitForTarget],
  );

  useEffect(() => {
    onApiReady(api);
    return () => onApiReady(null);
  }, [api, onApiReady]);

  useEffect(() => {
    if (!ripples.length) return;
    const timeout = window.setTimeout(() => setRipples([]), clickSettleDurationMs);
    return () => window.clearTimeout(timeout);
  }, [ripples.length]);

  return (
    <>
      {visible && position ? (
        <svg
          aria-hidden="true"
          className="demo-cursor"
          viewBox="0 0 28 28"
          style={{ transform: `translate3d(${position.x - 4}px, ${position.y - 3}px, 0)` }}
        >
          <path className="demo-cursor-outline" d="M4 2.5L22.5 14.1L14.1 16.2L10.7 25.1L4 2.5Z" />
          <path className="demo-cursor-fill" d="M6.2 6.2L18.9 14.1L12.7 15.6L10.4 21.8L6.2 6.2Z" />
        </svg>
      ) : null}
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          aria-hidden="true"
          className="demo-click-ripple"
          style={{ left: ripple.x, top: ripple.y }}
        />
      ))}
    </>
  );
}
