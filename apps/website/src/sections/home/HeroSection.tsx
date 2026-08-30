import { ArrowDownRight } from "lucide-react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect, useRef } from "react";

import { ease } from "@/lib/motion";

const readout = [
  {
    key: "Signals read together",
    value:
      "Tank level, ignition state, motion and position — read together in one telemetry record.",
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

const line1 = "TRUST";
const line2 = "THE SIGNAL.";

export function HeroSection() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  /* Deliberately shallow: the hero settles as you leave it, it does not slide. */
  const textY = useTransform(scrollYProgress, [0, 1], ["0%", "-11%"]);
  const mediaY = useTransform(scrollYProgress, [0, 1], ["0%", "12%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.9], [1, 0.12]);

  /* Pointer parallax: the frame breathes with the cursor, never chases it. */
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const spring = { stiffness: 60, damping: 22, mass: 0.7 };
  const sx = useSpring(px, spring);
  const sy = useSpring(py, spring);
  const mediaX = useTransform(sx, [-1, 1], ["2.4%", "-2.4%"]);
  const mediaTilt = useTransform(sy, [-1, 1], ["1.6%", "-1.6%"]);
  const meshX = useTransform(sx, [-1, 1], [18, -18]);
  const meshY = useTransform(sy, [-1, 1], [12, -12]);
  const glowX = useTransform(sx, [-1, 1], [-40, 40]);
  const glowY = useTransform(sy, [-1, 1], [-28, 28]);

  useEffect(() => {
    if (reduced) return;
    const onMove = (event: PointerEvent) => {
      const node = ref.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      px.set(((event.clientX - rect.left) / rect.width) * 2 - 1);
      py.set(((event.clientY - rect.top) / rect.height) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [px, py, reduced]);

  const renderLine = (text: string, base: number, accent = false) => (
    <span className="hero-title__line">
      {text.split("").map((char, index) => (
        <motion.span
          key={`${text}-${index}`}
          className={`hero-title__char${accent ? " hero-title__accent" : ""}`}
          initial={reduced ? { opacity: 0 } : { y: "115%", opacity: 0, filter: "blur(14px)" }}
          animate={reduced ? { opacity: 1 } : { y: "0%", opacity: 1, filter: "blur(0px)" }}
          transition={{
            duration: 1.1,
            delay: base + index * 0.045,
            ease: ease.out,
          }}
        >
          {char === " " ? "\u00a0" : char}
        </motion.span>
      ))}
    </span>
  );

  return (
    <>
      {/* The opening frame holds exactly one screen: nothing below it peeks in. */}
      <section id="top" ref={ref} className="hero-stage scroll-mt-24">
        {/* Cinematic backdrop: one photograph, held dark so the type carries. */}
        <motion.div
          aria-hidden="true"
          className="hero-stage__media"
          {...(reduced ? {} : { style: { y: mediaY, x: mediaX } })}
        >
          <motion.img
            src="/images/fleet-depot-banner.png"
            alt=""
            decoding="async"
            className={reduced ? undefined : "hero-stage__drift"}
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.18, filter: "blur(18px)" }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 2.4, ease: ease.out }}
            {...(reduced ? {} : { style: { y: mediaTilt } })}
          />
        </motion.div>
        <div aria-hidden="true" className="hero-stage__veil" />
        <motion.div
          aria-hidden="true"
          className="hero-stage__glow"
          {...(reduced ? {} : { style: { x: glowX, y: glowY } })}
        />
        <motion.div
          aria-hidden="true"
          className="hero-stage__mesh"
          {...(reduced ? {} : { style: { x: meshX, y: meshY } })}
        />
        <div aria-hidden="true" className="hero-stage__scan" />
        <div aria-hidden="true" className="hero-stage__sweep" />

        {/* Curtain: the frame opens once, then never again. */}
        {!reduced && (
          <motion.div
            aria-hidden="true"
            className="hero-stage__curtain"
            initial={{ scaleY: 1 }}
            animate={{ scaleY: 0 }}
            transition={{ duration: 1.25, ease: [0.76, 0, 0.24, 1] }}
          />
        )}

        <motion.div
          className="hero-stage__inner"
          {...(reduced ? {} : { style: { y: textY, opacity } })}
        >
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.75, ease: ease.out }}
            className="hero-eyebrow hero-eyebrow--onstage"
          >
            <span className="hero-eyebrow__dot" aria-hidden="true" />
            Fuel monitoring · Telemetry
          </motion.p>

          <h1 className="hero-title hero-title--stage">
            {renderLine(line1, 0.95)}
            {renderLine(line2, 1.18, true)}
          </h1>

          <motion.span
            aria-hidden="true"
            className="hero-stage__rule"
            initial={reduced ? { opacity: 0 } : { scaleX: 0 }}
            animate={reduced ? { opacity: 1 } : { scaleX: 1 }}
            transition={{ duration: 1.1, delay: 1.7, ease: ease.precise }}
          />

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 1.85, ease: ease.out }}
            className="hero-stage__lead"
          >
            SmartT combines fuel monitoring and fleet telemetry to turn noisy vehicle signals into
            clear operational context.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 2.05, ease: ease.out }}
            className="hero-stage__actions"
          >
            <a href="#problem" className="hero-cta">
              <span>Explore the system</span>
              <ArrowDownRight className="hero-cta__icon h-4 w-4" />
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* The first thing under the fold: the facts, still on the dark stage. */}
      <motion.dl
        initial="hidden"
        whileInView="shown"
        viewport={{ once: true, margin: "-10% 0px -10% 0px" }}
        variants={{
          hidden: {},
          shown: { transition: { staggerChildren: 0.09 } },
        }}
        className="hero-readout"
      >
        {readout.map((item, index) => (
          <motion.div
            key={item.key}
            variants={{
              hidden: reduced ? { opacity: 0 } : { opacity: 0, y: 10 },
              shown: {
                opacity: 1,
                y: 0,
                transition: { duration: 0.6, ease: ease.out },
              },
            }}
            className="hero-readout__cell"
          >
            <span className="hero-readout__index" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <dt>{item.key}</dt>
            <dd>{item.value}</dd>
          </motion.div>
        ))}
      </motion.dl>
    </>
  );
}
