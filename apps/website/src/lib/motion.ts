import type { Transition, Variants } from "motion/react";

/**
 * Motion system — one vocabulary for the whole site.
 *
 * Rules of the system:
 *  - Easing is always decelerating. Nothing overshoots, nothing bounces.
 *  - Distance is small. Motion supports reading order, it does not perform.
 *  - Each section picks ONE grammar (rise / settle / wipe / signal) so that
 *    scrolling the page feels like a sequence of different chapters instead
 *    of the same reveal repeated nine times.
 */

export const ease = {
  /** Primary decelerate — content entering its resting position. */
  out: [0.22, 1, 0.36, 1] as const,
  /** Slightly firmer; used for rules, lines and measured/technical motion. */
  precise: [0.16, 0.9, 0.32, 1] as const,
  /** Short UI feedback: hover, focus, small state changes. */
  ui: [0.4, 0, 0.2, 1] as const,
};

export const duration = {
  micro: 0.18,
  short: 0.34,
  base: 0.55,
  long: 0.8,
  reveal: 1.05,
};

/** Viewport thresholds. Content commits slightly before it is fully in view. */
export const viewport = { once: true, margin: "-12% 0px -8% 0px" } as const;
export const viewportEarly = { once: true, margin: "-5% 0px -5% 0px" } as const;

export const transition = {
  rise: { duration: duration.long, ease: ease.out } satisfies Transition,
  settle: { duration: duration.reveal, ease: ease.out } satisfies Transition,
  line: { duration: duration.long, ease: ease.precise } satisfies Transition,
  fade: { duration: duration.base, ease: ease.out } satisfies Transition,
};

/* -------------------------------------------------------------------------- */
/* Variant grammars                                                           */
/* -------------------------------------------------------------------------- */

/** Editorial default: type lifts a short distance into place. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 22 },
  shown: { opacity: 1, y: 0, transition: transition.rise },
};

/** Quieter sibling of `rise` — used inside already-revealed blocks. */
export const riseTight: Variants = {
  hidden: { opacity: 0, y: 10 },
  shown: { opacity: 1, y: 0, transition: transition.fade },
};

/** Lateral entry: used where the layout itself reads left-to-right. */
export const drift: Variants = {
  hidden: { opacity: 0, x: -14 },
  shown: { opacity: 1, x: 0, transition: transition.rise },
};

/** Objects and panels arrive by settling, not by travelling. */
export const settle: Variants = {
  hidden: { opacity: 0, scale: 0.985, y: 12 },
  shown: { opacity: 1, scale: 1, y: 0, transition: transition.settle },
};

/** A hairline drawing itself — the site's "measurement" gesture. */
export const drawX: Variants = {
  hidden: { scaleX: 0 },
  shown: { scaleX: 1, transition: { duration: 0.7, ease: ease.precise } },
};

export const drawY: Variants = {
  hidden: { scaleY: 0 },
  shown: { scaleY: 1, transition: { duration: 1.1, ease: ease.precise } },
};

/** Image wipe: the frame opens, the picture releases its slight overscale. */
export const wipeUp: Variants = {
  hidden: { clipPath: "inset(14% 0% 0% 0%)", opacity: 0 },
  shown: {
    clipPath: "inset(0% 0% 0% 0%)",
    opacity: 1,
    transition: { duration: 1.15, ease: ease.out },
  },
};

export const wipeIn: Variants = {
  hidden: { clipPath: "inset(0% 12% 0% 0%)", opacity: 0 },
  shown: {
    clipPath: "inset(0% 0% 0% 0%)",
    opacity: 1,
    transition: { duration: 1.15, ease: ease.out },
  },
};

export const imageEase: Variants = {
  hidden: { scale: 1.06 },
  shown: { scale: 1, transition: { duration: 1.4, ease: ease.out } },
};

/** Sequential container. `step` is the beat between children. */
export function sequence(step = 0.09, delay = 0): Variants {
  return {
    hidden: {},
    shown: { transition: { staggerChildren: step, delayChildren: delay } },
  };
}

/** Reduced-motion fallback: state changes only through opacity. */
export const plainFade: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: 0.3, ease: "linear" } },
};
