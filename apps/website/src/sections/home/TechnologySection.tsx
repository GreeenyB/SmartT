import { ArrowDownRight } from "lucide-react";
import { motion } from "motion/react";

import { Reveal } from "@/components/shared/Reveal";

const pipeline = [
  {
    number: "01",
    title: "Read",
    body: "Fuel-sender input is sampled alongside ignition state and optional positioning context.",
  },
  {
    number: "02",
    title: "Stabilize",
    body: "A staged filtering path reduces short-lived movement without hiding meaningful change.",
  },
  {
    number: "03",
    title: "Classify",
    body: "State-aware logic separates normal movement, refuelling, drop candidates and sensor faults.",
  },
  {
    number: "04",
    title: "Review",
    body: "Telemetry and events are stored locally and presented as a timeline with supporting context.",
  },
];

export function TechnologySection() {
  return (
    <section
      id="technology"
      className="scroll-mt-24 border-y border-white/10 bg-foreground text-background"
    >
      <div className="mx-auto max-w-[1600px] px-8 py-28 md:px-14 md:py-36">
        <Reveal>
          <p className="section-label section-label--inverse">Technology · Processing pipeline</p>
        </Reveal>
        <div className="mt-7 grid gap-10 lg:grid-cols-[1fr_.75fr] lg:items-end lg:gap-20">
          <Reveal delay={0.1}>
            <h2 className="section-title section-title--sm section-title--flush">
              The processing pipeline,
              <br />
              step by step.
            </h2>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="max-w-[42ch] text-base leading-[1.75] text-white/60 md:text-lg">
              What happens to a single fuel reading between the sender and an event in the console —
              described without publishing calibration values or decision thresholds.
            </p>
          </Reveal>
        </div>

        <div className="pipeline-grid">
          {pipeline.map((item, index) => (
            <motion.article
              key={item.number}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.8, delay: index * 0.09 }}
              className="pipeline-grid__item group"
            >
              <div className="pipeline-grid__meta">
                <span>{item.number}</span>
                <ArrowDownRight className="h-4 w-4 transition-transform group-hover:translate-x-1 group-hover:translate-y-1" />
              </div>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </motion.article>
          ))}
        </div>

        <div className="deployment">
          <figure className="deployment__media" aria-label="Loading dock operations">
            <img
              src="/smartt-photos/loading-dock-top-view.jpg"
              alt="Top-down view of trucks positioned at an industrial loading dock."
              loading="lazy"
              decoding="async"
            />
          </figure>
          <div className="deployment__copy">
            <div>
              <span className="eyebrow eyebrow--accent">Current focus</span>
              <p>Signal stability, event logic and the local telemetry workflow.</p>
            </div>
            <div>
              <span className="eyebrow eyebrow--accent">Next</span>
              <p>Vehicle integration, enclosure development and real-world validation.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
