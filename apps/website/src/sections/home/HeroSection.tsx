import { ArrowDownRight } from "lucide-react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

import { ease } from "@/lib/motion";

const readout = [
  {
    key: "Signals read together",
    value:
      "Tank level, ignition state, motion and position — read together as one telemetry record.",
  },
  {
    key: "Current stage",
    value: "Working bench prototype and operations console.",
  },
  {
    key: "Built by",
    value: "Team BKUIT — students from HCMUT, UIT and RMIT.",
  },
];

export function HeroSection() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  /* Deliberately shallow: the hero settles as you leave it, it does not slide. */
  const textY = useTransform(scrollYProgress, [0, 1], ["0%", "-7%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.85], [1, 0.2]);

  return (
    <section
      id="top"
      ref={ref}
      className="hero-section mx-auto max-w-[1600px] scroll-mt-24 px-8 pt-12 pb-24 md:px-14 md:pt-16 md:pb-32"
    >
      <div className="grid items-end gap-14 lg:grid-cols-[.92fr_1.08fr] lg:gap-20">
        <motion.div
          {...(reduced ? {} : { style: { y: textY, opacity } })}
          className="flex flex-col justify-end"
        >
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="hero-eyebrow"
          >
            Fuel monitoring · Telemetry
          </motion.p>
          <h1 className="hero-title">
            {["TRUST", "THE SIGNAL."].map((word, index) => (
              <span key={word} className="block overflow-hidden">
                <motion.span
                  className={index === 1 ? "text-gradient-brand block" : "block"}
                  initial={reduced ? { opacity: 0 } : { y: "108%" }}
                  animate={reduced ? { opacity: 1 } : { y: "0%" }}
                  transition={{
                    duration: 1.05,
                    delay: 0.14 + index * 0.11,
                    ease: ease.out,
                  }}
                >
                  {word}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.52, ease: ease.out }}
            className="lead mt-8 max-w-[34ch]"
          >
            SmartT is a fuel-monitoring and fleet-telemetry system that turns noisy vehicle signals
            into clear operational context.
          </motion.p>
          <motion.a
            href="#problem"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.8 }}
            className="mono hero-cue mt-9 flex w-fit items-center gap-2 border-b border-foreground/25 pb-1"
          >
            <span>Explore the system</span>
            <ArrowDownRight className="hero-cue__icon h-3.5 w-3.5" />
          </motion.a>
        </motion.div>

        <motion.figure
          initial={reduced ? { opacity: 0 } : { clipPath: "inset(16% 0% 0% 0%)", opacity: 0 }}
          animate={reduced ? { opacity: 1 } : { clipPath: "inset(0% 0% 0% 0%)", opacity: 1 }}
          transition={{ duration: 1.25, delay: 0.22, ease: ease.out }}
          className="hero-banner"
        >
          <motion.img
            src="/images/fleet-depot-banner.png"
            alt="Top-down aerial view of truck chassis lined up in rows across a fleet depot yard."
            width={1127}
            height={750}
            decoding="async"
            {...(reduced ? {} : { initial: { scale: 1.07 }, animate: { scale: 1 } })}
            transition={{ duration: 1.6, delay: 0.22, ease: ease.out }}
          />
          <motion.figcaption
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 1 }}
            className="hero-banner__caption"
          >
            <span className="hero-banner__label">Fleet-scale operations</span>
            <p>Fleet telemetry brought together in one operational view.</p>
          </motion.figcaption>
        </motion.figure>
      </div>

      <motion.dl
        initial="hidden"
        animate="shown"
        variants={{
          hidden: {},
          shown: { transition: { staggerChildren: 0.08, delayChildren: 0.9 } },
        }}
        className="readout"
      >
        {readout.map((item) => (
          <motion.div
            key={item.key}
            variants={{
              hidden: reduced ? { opacity: 0 } : { opacity: 0, y: 8 },
              shown: {
                opacity: 1,
                y: 0,
                transition: { duration: 0.6, ease: ease.out },
              },
            }}
            className="readout__cell"
          >
            <dt>{item.key}</dt>
            <dd>{item.value}</dd>
          </motion.div>
        ))}
      </motion.dl>
    </section>
  );
}
