import { DatabaseZap, FileWarning, Waves } from "lucide-react";
import { motion } from "motion/react";

import { Reveal } from "@/components/shared/Reveal";

const problems = [
  {
    icon: Waves,
    title: "Signals move",
    body: "Fuel readings change with vehicle motion, tank geometry and sensor behavior. A moving value is not automatically a meaningful event.",
  },
  {
    icon: DatabaseZap,
    title: "Context is fragmented",
    body: "Fuel level, ignition state, location and event history often live in separate records, making review slower and less consistent.",
  },
  {
    icon: FileWarning,
    title: "Evidence arrives late",
    body: "Without a structured event trail, operations teams must reconstruct what happened after the moment has already passed.",
  },
];

export function ProblemSection() {
  return (
    <section id="problem" className="section-cool scroll-mt-24 border-t border-border">
      <div className="mx-auto max-w-[1600px] px-8 py-28 md:px-14 md:py-36">
        <div className="section-head">
          <Reveal>
            <p className="section-label">Problem</p>
          </Reveal>
          <Reveal delay={0.1}>
            <h2 className="section-title">
              Fuel is measurable.
              <br />
              The story behind it is harder.
            </h2>
          </Reveal>
        </div>

        <div className="problem-grid">
          {problems.map(({ icon: Icon, title, body }, index) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{
                duration: 0.9,
                delay: index * 0.1,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="problem-grid__item"
            >
              <Icon className="h-5 w-5 text-brand-teal" strokeWidth={1.6} />
              <h3>{title}</h3>
              <p>{body}</p>
            </motion.div>
          ))}
        </div>

        <Reveal delay={0.2}>
          <div className="fuel-context">
            <figure className="fuel-context__media" aria-label="Truck beside fuel pumps">
              <img
                src="/smartt-photos/fuel-context-truck-petrol-station.jpg"
                alt="Delivery truck parked beside fuel pumps at a petrol station."
                loading="lazy"
                decoding="async"
              />
            </figure>
            <div className="fuel-context__copy">
              <span className="eyebrow eyebrow--accent">Fuel event context</span>
              <h3>Fuel stops are operational evidence, not expense lines.</h3>
              <p>
                One vehicle can refuel, idle, move or report a suspicious drop inside a short
                window. SmartT keeps those fuel moments attached to ignition, movement and location
                context.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
