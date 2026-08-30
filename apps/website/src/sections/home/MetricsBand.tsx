import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { ease } from "@/lib/motion";

const metrics = [
  {
    value: 4,
    suffix: "",
    label: "Signals read together",
    note: "Fuel level, ignition, motion, position",
  },
  {
    value: 4,
    suffix: "",
    label: "Stages from reading to review",
    note: "Read → Stabilize → Classify → Review",
  },
  { value: 1, suffix: "", label: "Review timeline", note: "Telemetry and events in one view" },
  { value: 3, suffix: "", label: "Universities represented", note: "HCMUT, UIT and RMIT" },
];

function Counter({ value, suffix, active }: { value: number; suffix: string; active: boolean }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);

  useEffect(() => {
    if (!active) return;
    if (reduced) {
      setShown(value);
      return;
    }
    let frame = 0;
    const duration = 900;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      /* easeOutCubic — the number lands rather than snaps. */
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, reduced, value]);

  return (
    <span className="metric__value">
      {String(shown).padStart(2, "0")}
      {suffix}
    </span>
  );
}

/**
 * A single quiet band of figures between the architecture chapter and the
 * product chapter. It exists to give the page one moment of pure scale before
 * the detail resumes — no cards, no icons, just measured numbers on a rule.
 */
export function MetricsBand() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px -15% 0px" });
  const reduced = useReducedMotion();

  return (
    <section aria-label="System at a glance" className="metrics-band">
      <div aria-hidden="true" className="metrics-band__mesh" />
      <div ref={ref} className="metrics-band__inner">
        {metrics.map((metric, index) => (
          <motion.div
            key={metric.label}
            className="metric"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: reduced ? 0 : 14 }}
            transition={{ duration: 0.65, delay: index * 0.09, ease: ease.out }}
          >
            <Counter value={metric.value} suffix={metric.suffix} active={inView} />
            <p className="metric__label">{metric.label}</p>
            <p className="metric__note">{metric.note}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
