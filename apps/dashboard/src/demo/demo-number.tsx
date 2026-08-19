import { useEffect, useRef, useState } from "react";

import { formatNum } from "@/lib/fleet-data";

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export function DemoAnimatedNumber({
  active,
  value,
  durationMs,
  decimals = 0,
}: {
  active: boolean;
  value: number;
  durationMs: number;
  decimals?: number;
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValueRef = useRef(value);

  useEffect(() => {
    if (!active) {
      previousValueRef.current = value;
      setDisplayValue(value);
      return;
    }

    const from = previousValueRef.current;
    const to = value;
    previousValueRef.current = value;

    if (from === to) {
      setDisplayValue(to);
      return;
    }

    let frame = 0;
    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = easeOutCubic(progress);
      setDisplayValue(from + (to - from) * eased);

      if (progress < 1) {
        frame = requestAnimationFrame(step);
      } else {
        setDisplayValue(to);
      }
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [active, durationMs, value]);

  return <>{formatNum(displayValue, decimals)}</>;
}
