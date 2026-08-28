import { motion, useReducedMotion } from "motion/react";

import { Reveal } from "@/components/shared/Reveal";
import { SectionMark } from "@/components/shared/SectionMark";
import { ease, viewport } from "@/lib/motion";

/**
 * Horizons, sequence and wording follow the development strategy in the pitch
 * deck. Everything below is planned work: only the bench prototype and the
 * console exist today.
 */
const horizons = [
  {
    stamp: "6 Months",
    title: "First production run & pilot",
    items: [
      "Reinvest prize funding into a first production run of 30 commercial units.",
      "Run a strategic pilot at Cát Lái to secure the first SaaS contracts.",
    ],
    note: "Pilot with early fleet partners",
    fill: 1,
  },
  {
    stamp: "Year 1",
    title: "Fleet deployment & break-even",
    items: [
      "Deploy adaptive hardware across 500 trucks in mixed-brand fleets.",
      "Refine the anti-sloshing algorithm against field data.",
      "Reach unit cash-flow break-even.",
    ],
    note: "Core fleet segment",
    fill: 2,
  },
  {
    stamp: "Year 2",
    title: "Regional expansion & API integration",
    items: [
      "Expand to Cái Mép and Hải Phòng.",
      "Enter cold chain with IoT temperature sensing.",
      "Launch open APIs to sync with MISA and enterprise ERPs.",
    ],
    note: "Regional expansion",
    fill: 3,
  },
  {
    stamp: "Year 3",
    title: "Fleet intelligence & ESG reporting",
    items: [
      "Integrate AI dashcams for predictive safety.",
      "Automate ESG carbon-emission reporting for FDI bidding.",
    ],
    note: "National logistics hubs",
    fill: 4,
  },
];

const fade = (y: number, duration = 0.6) => ({
  hidden: { opacity: 0, y },
  shown: { opacity: 1, y: 0, transition: { duration, ease: ease.out } },
});

export function RoadmapSection() {
  const reduced = useReducedMotion();
  const flat = { hidden: { opacity: 0 }, shown: { opacity: 1 } };

  return (
    <section id="roadmap" className="surface-slate scroll-mt-24">
      <div className="mx-auto max-w-[1600px] px-8 py-24 md:px-14 md:py-32">
        <Reveal>
          <SectionMark label="Roadmap" />
        </Reveal>
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.05fr_.95fr] lg:items-start lg:gap-20">
          <Reveal delay={0.08}>
            <h2 className="section-title section-title--sm section-title--flush">
              Where this goes next.
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="max-w-[46ch] text-base leading-[1.75] text-muted-foreground md:text-lg lg:mt-[0.35rem]">
              Today SmartT is a working bench prototype and operations console; vehicle integration
              and field validation are next. Every horizon below is{" "}
              <span className="mono">planned</span>
              development, not shipped capability.
            </p>
          </Reveal>
        </div>

        {/* Timeline grammar: each horizon opens with its index rule drawing
            across, then the date stamp lands ahead of the commitments. */}
        <ol className="horizons horizons--timed">
          {horizons.map((item) => (
            <motion.li
              key={item.stamp}
              className="horizon"
              initial="hidden"
              whileInView="shown"
              viewport={viewport}
              variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.07 } } }}
            >
              <motion.span
                aria-hidden="true"
                className="horizon__rule"
                variants={
                  reduced
                    ? flat
                    : {
                        hidden: { scaleX: 0 },
                        shown: {
                          scaleX: 1,
                          transition: { duration: 0.65, ease: ease.precise },
                        },
                      }
                }
              />
              <motion.div className="horizon__when" variants={reduced ? flat : fade(10)}>
                <span className="horizon__stamp">{item.stamp}</span>
                <span className="horizon__note">{item.note}</span>
              </motion.div>
              <motion.div className="horizon__body" variants={reduced ? flat : fade(12, 0.7)}>
                <h3>{item.title}</h3>
                <ul>
                  {item.items.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </motion.div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
