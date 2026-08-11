import { ArrowDownRight } from "lucide-react";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

import fleetBanner from "@/assets/fleet-depot-banner.png.asset.json";

export function HeroSection() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const textY = useTransform(scrollYProgress, [0, 1], ["0%", "-22%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.85], [1, 0]);

  return (
    <section
      id="top"
      ref={ref}
      className="hero-section mx-auto max-w-[1600px] scroll-mt-24 px-8 pt-14 pb-28 md:px-14 md:pt-20 md:pb-36"
    >
      <div className="grid items-end gap-14 lg:grid-cols-[.92fr_1.08fr] lg:gap-20">
        <motion.div style={{ y: textY, opacity }} className="flex flex-col justify-end">
          <p className="eyebrow">Fuel monitoring · Fleet telemetry</p>
          <h1 className="hero-title">
            {["TRUST", "THE SIGNAL."].map((word, index) => (
              <span key={word} className="block overflow-hidden">
                <motion.span
                  className={index === 1 ? "text-gradient-brand block" : "block"}
                  initial={{ y: "110%" }}
                  animate={{ y: "0%" }}
                  transition={{
                    duration: 1.1,
                    delay: 0.15 + index * 0.12,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  {word}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="lead mt-9 max-w-[34ch]"
          >
            SmartT is a developing fuel-monitoring and fleet-telemetry system that turns noisy
            vehicle signals into clear operational context.
          </motion.p>
          <motion.a
            href="#problem"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.9 }}
            className="mt-10 flex w-fit items-center gap-2 border-b border-foreground/25 pb-1 text-[0.78rem] tracking-[0.2em] transition-colors hover:border-foreground"
          >
            <span>EXPLORE THE SYSTEM</span>
            <motion.span
              animate={{ y: [0, 5, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            >
              <ArrowDownRight className="h-4 w-4" />
            </motion.span>
          </motion.a>
        </motion.div>

        <motion.figure
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="hero-banner"
        >
          <img
            src={fleetBanner.url}
            alt="Top-down aerial view of truck chassis lined up in rows across a fleet depot yard."
            width={1127}
            height={750}
            decoding="async"
          />
          <figcaption className="hero-banner__caption">
            <span className="hero-banner__label">Fleet-scale operations</span>
            <p>
              Dozens of vehicles, one fuel record each. SmartT reads them as a single operational
              picture.
            </p>
          </figcaption>
        </motion.figure>
      </div>
    </section>
  );
}
