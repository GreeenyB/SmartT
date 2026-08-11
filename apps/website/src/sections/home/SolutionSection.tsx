import { motion } from "motion/react";

import { Reveal } from "@/components/shared/Reveal";

const layers = [
  {
    number: "01",
    title: "On-board unit",
    body: "A device on the vehicle reads the tank-level sensor together with ignition state, speed and GPS position.",
  },
  {
    number: "02",
    title: "Telemetry link",
    body: "Readings are transmitted as a continuous stream per unit, with a record of when a vehicle last reported.",
  },
  {
    number: "03",
    title: "SmartT service",
    body: "Telemetry is stored per vehicle, related to depots, routes and drivers, and turned into fuel events.",
  },
  {
    number: "04",
    title: "Operations console",
    body: "Web and mobile views for the live map, vehicle detail and alert evidence the operations team reviews.",
  },
];

export function SolutionSection() {
  return (
    <section
      id="solution"
      className="mx-auto max-w-[1600px] scroll-mt-24 px-8 py-28 md:px-14 md:py-36"
    >
      <div className="grid gap-14 lg:grid-cols-[0.82fr_1.18fr] lg:gap-24">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <Reveal>
            <p className="section-label">Solution · System architecture</p>
          </Reveal>
          <Reveal delay={0.1}>
            <h2 className="section-title section-title--sm">
              The system architecture
              <br />
              behind the context.
            </h2>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="lead mt-7 max-w-[36ch]">
              How the parts of SmartT are arranged: the on-board unit, the telemetry service and the
              console the operations team works in.
            </p>
          </Reveal>
        </div>

        <div className="solution-steps">
          {layers.map((layer, index) => (
            <motion.div
              key={layer.number}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{
                duration: 0.9,
                delay: index * 0.12,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="solution-steps__item"
            >
              <span className="solution-steps__number">{layer.number}</span>
              <div>
                <h3>{layer.title}</h3>
                <p>{layer.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
