import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";

import { Reveal } from "@/components/shared/Reveal";
import { SurfaceFade } from "@/components/shared/SurfaceFade";
import { SectionMark } from "@/components/shared/SectionMark";
import { ease, viewport } from "@/lib/motion";

const layers = [
  {
    number: "01",
    title: "Vehicle-side unit",
    body: "The vehicle-side unit reads the fuel-level probe together with ignition state, speed and GPS position.",
  },
  {
    number: "02",
    title: "Telemetry link",
    body: "Telemetry records move from each vehicle-side unit to the SmartT service with report timing preserved for review.",
  },
  {
    number: "03",
    title: "SmartT service",
    body: "Telemetry is stored by vehicle and combined with operating context to support fuel-event review.",
  },
  {
    number: "04",
    title: "Operations console",
    body: "Web and mobile views bring together the live map, vehicle details and supporting evidence for alerts and fuel events.",
  },
];

export function SolutionSection() {
  const railRef = useRef<HTMLDivElement>(null);
  const railInView = useInView(railRef, { once: true, margin: "-20% 0px -20% 0px" });
  const reduced = useReducedMotion();

  return (
    <section id="solution" className="surface-stone surface-blend scroll-mt-24">
      <SurfaceFade side="top" from="var(--background)" />
      <div className="mx-auto grid max-w-[1600px] gap-14 px-8 py-24 md:px-14 md:py-32 lg:grid-cols-[0.82fr_1.18fr] lg:gap-24">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <Reveal>
            <SectionMark label="System architecture" />
          </Reveal>
          <Reveal delay={0.08}>
            <h2 className="section-title section-title--sm">
              Four parts,
              <br />
              one signal path.
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="lead mt-7 max-w-[36ch]">
              SmartT follows a single path from vehicle sensing to operations review: the
              vehicle-side unit, telemetry link, SmartT service and operations console.
            </p>
          </Reveal>
        </div>

        {/* The signal path is literal here: the rail draws itself downward and
            each stage resolves just after the line reaches it. */}
        <div className="rail rail--traced" ref={railRef}>
          <motion.span
            aria-hidden="true"
            className="rail__trace"
            initial={reduced ? { opacity: 0 } : { scaleY: 0 }}
            animate={
              railInView
                ? reduced
                  ? { opacity: 1 }
                  : { scaleY: 1 }
                : reduced
                  ? { opacity: 0 }
                  : { scaleY: 0 }
            }
            transition={{ duration: reduced ? 0.3 : 1.5, ease: ease.precise }}
          />
          {layers.map((layer, index) => (
            <motion.div
              key={layer.number}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={viewport}
              transition={{
                duration: 0.7,
                delay: 0.12 + index * 0.14,
                ease: ease.out,
              }}
              className="rail__node"
            >
              <span className="ledger__key">{layer.number}</span>
              <h3 className="mt-3 font-display text-[clamp(1.5rem,2vw,2rem)] font-normal tracking-[-0.025em]">
                {layer.title}
              </h3>
              <p className="mt-3 max-w-[56ch] text-base leading-[1.8] text-muted-foreground">
                {layer.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
