import { motion, useReducedMotion } from "motion/react";

import { Item, MediaReveal, Reveal, Sequence } from "@/components/shared/Reveal";
import { SurfaceFade } from "@/components/shared/SurfaceFade";
import { SectionMark } from "@/components/shared/SectionMark";
import { SloshChapter } from "@/features/fuel-slosh/SloshChapter";
import { ease, viewport } from "@/lib/motion";

const pipeline = [
  {
    number: "01",
    title: "Read",
    body: "Fuel level is read alongside ignition state, motion and position.",
  },
  {
    number: "02",
    title: "Stabilize",
    body: "Motion-aware filtering is designed to separate short-lived slosh from sustained level change.",
  },
  {
    number: "03",
    title: "Classify",
    body: "State-aware logic distinguishes normal movement, refuelling and level-change candidates for review.",
  },
  {
    number: "04",
    title: "Review",
    body: "Telemetry and candidate events are presented on a timeline with supporting context.",
  },
];

export function TechnologySection() {
  const reduced = useReducedMotion();

  return (
    <section
      id="technology"
      className="tech-surface surface-blend surface-blend--deep scroll-mt-24"
    >
      <SurfaceFade side="top" from="var(--background)" />
      <SurfaceFade side="bottom" from="var(--surface-slate)" />
      <div className="mx-auto max-w-[1600px] px-8 py-24 md:px-14 md:py-32">
        <Reveal>
          <SectionMark label="Technology" inverse />
        </Reveal>
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_.8fr] lg:items-end lg:gap-20">
          <Reveal delay={0.08}>
            <h2 className="section-title section-title--sm section-title--flush">
              What happens between
              <br />
              the reading and the event.
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="max-w-[42ch] text-base leading-[1.75] text-white/60 md:text-lg">
              Raw level data is only one input. Motion and operating context shape how a change is
              interpreted.
            </p>
          </Reveal>
        </div>

        {/* The one deliberately memorable moment on the page: the pipeline is
            read like a signal passing through four stages — the accent tick
            fires first, the stage text resolves behind it. */}
        <motion.div
          className="flow flow--signal"
          initial="hidden"
          whileInView="shown"
          viewport={viewport}
          variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.16 } } }}
        >
          {pipeline.map((item) => (
            <motion.article
              key={item.number}
              className="flow__step"
              variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.06 } } }}
            >
              <motion.span
                aria-hidden="true"
                className="flow__tick"
                variants={
                  reduced
                    ? { hidden: { opacity: 0 }, shown: { opacity: 1 } }
                    : {
                        hidden: { scaleX: 0, opacity: 0.4 },
                        shown: {
                          scaleX: 1,
                          opacity: 1,
                          transition: { duration: 0.55, ease: ease.precise },
                        },
                      }
                }
              />
              <motion.span
                className="flow__index"
                variants={
                  reduced
                    ? { hidden: { opacity: 0 }, shown: { opacity: 1 } }
                    : {
                        hidden: { opacity: 0, y: 6 },
                        shown: {
                          opacity: 1,
                          y: 0,
                          transition: { duration: 0.5, ease: ease.out },
                        },
                      }
                }
              >
                {item.number}
              </motion.span>
              <motion.h3
                variants={
                  reduced
                    ? { hidden: { opacity: 0 }, shown: { opacity: 1 } }
                    : {
                        hidden: { opacity: 0, y: 10 },
                        shown: {
                          opacity: 1,
                          y: 0,
                          transition: { duration: 0.6, ease: ease.out },
                        },
                      }
                }
              >
                {item.title}
              </motion.h3>
              <motion.p
                variants={
                  reduced
                    ? { hidden: { opacity: 0 }, shown: { opacity: 1 } }
                    : {
                        hidden: { opacity: 0, y: 10 },
                        shown: {
                          opacity: 1,
                          y: 0,
                          transition: { duration: 0.6, ease: ease.out },
                        },
                      }
                }
              >
                {item.body}
              </motion.p>
            </motion.article>
          ))}
        </motion.div>

        <SloshChapter />

        <p className="slosh-note">
          Illustrative signal model with synthetic values; algorithm under validation.
        </p>

        <div className="deployment">
          <MediaReveal as="figure" direction="in" className="deployment__media media-frame">
            <img
              src="/smartt-photos/loading-dock-top-view.jpg"
              alt="Top-down view of trucks positioned at an industrial loading dock."
              loading="lazy"
              decoding="async"
            />
          </MediaReveal>
          <Sequence className="deployment__copy" step={0.1} delay={0.15}>
            <Item>
              <span className="mono text-[#5cd6e4]">Current focus</span>
              <p>Signal stability, event logic and the telemetry workflow.</p>
            </Item>
            <Item>
              <span className="mono text-white/45">Next</span>
              <p>Vehicle integration, enclosure development and real-world validation.</p>
            </Item>
          </Sequence>
        </div>
      </div>
    </section>
  );
}
