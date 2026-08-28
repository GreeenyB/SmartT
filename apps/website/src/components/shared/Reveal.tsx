import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ElementType, ReactNode } from "react";

import {
  drift,
  plainFade,
  rise,
  riseTight,
  sequence,
  settle,
  viewport,
  wipeIn,
  wipeUp,
} from "@/lib/motion";

const grammars = {
  rise,
  tight: riseTight,
  drift,
  settle,
  wipeUp,
  wipeIn,
} satisfies Record<string, Variants>;

export type Grammar = keyof typeof grammars;

/**
 * `motion.create()` returns a NEW component type on every call. Calling it
 * during render remounts the subtree on each parent render, which resets
 * in-flight animations and made images blink out. Cache per tag instead.
 */
const cache = new Map<ElementType, ElementType>();

function motionTag(as?: ElementType): ElementType {
  const tag = (as ?? "div") as ElementType;
  let made = cache.get(tag);
  if (!made) {
    made = motion.create(tag) as ElementType;
    cache.set(tag, made);
  }
  return made;
}

type RevealProps = {
  children: ReactNode;
  /** Which motion grammar this block belongs to. */
  variant?: Grammar;
  delay?: number;
  className?: string;
  as?: ElementType;
};

/**
 * Single entry point for scroll-triggered reveals. Sections choose a grammar
 * rather than inventing their own numbers, which is what keeps the rhythm of
 * the page consistent while still letting chapters feel different.
 */
export function Reveal({ children, variant = "rise", delay = 0, className, as }: RevealProps) {
  const reduced = useReducedMotion();
  const Tag = motionTag(as);

  return (
    <Tag
      variants={reduced ? plainFade : grammars[variant]}
      initial="hidden"
      whileInView="shown"
      viewport={viewport}
      transition={{ delay: reduced ? 0 : delay }}
      className={className}
    >
      {children}
    </Tag>
  );
}

type SequenceProps = {
  children: ReactNode;
  /** Beat between children, in seconds. */
  step?: number;
  delay?: number;
  className?: string;
  as?: ElementType;
};

/** Container that releases its children one beat at a time. */
export function Sequence({ children, step = 0.09, delay = 0, className, as }: SequenceProps) {
  const reduced = useReducedMotion();
  const Tag = motionTag(as);

  return (
    <Tag
      variants={reduced ? plainFade : sequence(step, delay)}
      initial="hidden"
      whileInView="shown"
      viewport={viewport}
      className={className}
    >
      {children}
    </Tag>
  );
}

type ItemProps = {
  children: ReactNode;
  variant?: Grammar;
  className?: string;
  as?: ElementType;
};

/** A single beat inside a `Sequence`. */
export function Item({ children, variant = "tight", className, as }: ItemProps) {
  const reduced = useReducedMotion();
  const Tag = motionTag(as);

  return (
    <Tag variants={reduced ? plainFade : grammars[variant]} className={className}>
      {children}
    </Tag>
  );
}

type MediaRevealProps = {
  children: ReactNode;
  /** `up` opens from the bottom edge, `in` opens from the right edge. */
  direction?: "up" | "in";
  delay?: number;
  className?: string;
  as?: ElementType;
};

/**
 * Image moment: the frame unmasks while the picture releases a small
 * overscale. No parallax, no tilt — the photograph simply arrives.
 */
export function MediaReveal({
  children,
  direction = "up",
  delay = 0,
  className,
  as,
}: MediaRevealProps) {
  const reduced = useReducedMotion();
  const Tag = motionTag(as);

  if (reduced) {
    return (
      <Tag
        variants={plainFade}
        initial="hidden"
        whileInView="shown"
        viewport={viewport}
        className={className}
      >
        {children}
      </Tag>
    );
  }

  const opening = direction === "up" ? "inset(15% 0% 0% 0%)" : "inset(0% 13% 0% 0%)";

  return (
    <Tag
      initial={{ clipPath: opening, opacity: 0, "--media-scale": 1.07 }}
      whileInView={{ clipPath: "inset(0% 0% 0% 0%)", opacity: 1, "--media-scale": 1 }}
      viewport={viewport}
      transition={{
        clipPath: { duration: 1.15, delay, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] },
        "--media-scale": { duration: 1.5, delay, ease: [0.22, 1, 0.36, 1] },
      }}
      className={className}
    >
      {children}
    </Tag>
  );
}

/** A hairline that measures itself out from its left edge. */
export function Rule({ className, delay = 0 }: { className?: string; delay?: number }) {
  const reduced = useReducedMotion();

  return (
    <motion.span
      aria-hidden="true"
      className={className}
      initial={reduced ? { opacity: 0 } : { scaleX: 0 }}
      whileInView={reduced ? { opacity: 1 } : { scaleX: 1 }}
      viewport={viewport}
      transition={{ duration: reduced ? 0.3 : 0.7, delay, ease: [0.16, 0.9, 0.32, 1] }}
      style={{ transformOrigin: "left center", display: "block" }}
    />
  );
}
