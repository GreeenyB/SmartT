/*
 * Deterministic signal model behind the fuel-slosh chapter.
 *
 * Nothing here is measured data. It is a readable caricature of one 100 s
 * window: two manoeuvres that move the free surface without changing the
 * amount of fuel, and one quiet moment where the fuel actually leaves.
 */

export const WINDOW_S = 100;
export const SAMPLES = 260;

type Episode = { start: number; end: number; amp: number; freq: number };

/** Lateral / longitudinal acceleration episodes along the window. */
const EPISODES: Episode[] = [
  { start: 12, end: 27, amp: 6.2, freq: 0.3 }, // braking
  { start: 38, end: 55, amp: 9.4, freq: 0.44 }, // cornering
  { start: 58, end: 64, amp: 2.1, freq: 0.62 }, // road surface
];

/** Bell window so each episode fades in and out instead of clipping. */
function bell(t: number, start: number, end: number) {
  if (t <= start || t >= end) return 0;
  const u = (t - start) / (end - start);
  return Math.sin(Math.PI * u) ** 0.7;
}

/** Signed motion state: what the IMU sees, in fractions of g. */
export function motionState(t: number) {
  let a = 0;
  for (const e of EPISODES) {
    a += e.amp * bell(t, e.start, e.end) * Math.sin((t - e.start) * e.freq * Math.PI);
  }
  return a / 22; // ~ -0.45 .. 0.45 g
}

/** Slosh contribution to the instantaneous reading, in percent of tank. */
export function slosh(t: number) {
  let s = 0;
  for (const e of EPISODES) {
    const w = bell(t, e.start, e.end);
    s +=
      e.amp *
      w *
      (Math.sin((t - e.start) * e.freq * Math.PI * 2) * 0.72 +
        Math.sin((t - e.start) * e.freq * Math.PI * 3.7) * 0.28);
  }
  return s;
}

/** True quantity of fuel in the tank. Constant, then a genuine drop. */
export function trueLevel(t: number) {
  const from = 82;
  const to = 70.4;
  if (t <= 68) return from;
  if (t >= 79) return to;
  const u = (t - 68) / 11;
  return from + (to - from) * u;
}

export type Frame = {
  t: number;
  /** Raw instantaneous probe reading. */
  raw: number;
  /** Level after motion context is applied. */
  stable: number;
  /** Signed acceleration, g. */
  a: number;
};

/** One pass over the window, pre-computed once. */
export function buildSeries(): Frame[] {
  const out: Frame[] = [];
  let smoothed = trueLevel(0);
  for (let i = 0; i < SAMPLES; i += 1) {
    const t = (i / (SAMPLES - 1)) * WINDOW_S;
    const a = motionState(t);
    const raw = trueLevel(t) + slosh(t);
    // Motion context gates the filter: while the vehicle is manoeuvring the
    // estimate holds; when it is quiet the estimate is free to follow.
    const gate = Math.min(1, Math.abs(a) / 0.06);
    const k = 0.16 * (1 - gate) + 0.004 * gate;
    smoothed += (raw - smoothed) * k;
    out.push({ t, raw, stable: smoothed, a });
  }
  return out;
}

/** Chapters of the window, keyed to scroll progress. */
export const BEATS = [
  {
    id: "brake",
    from: 0,
    to: 0.34,
    label: "Braking",
    state: "TRANSIENT",
    text: "Braking tilts the fuel surface, so the probe reading shifts even though the fuel quantity is unchanged.",
  },
  {
    id: "corner",
    from: 0.34,
    to: 0.63,
    label: "Cornering",
    state: "TRANSIENT",
    text: "The raw reading follows the moving surface while the motion-aware level stays steady.",
  },
  {
    id: "drop",
    from: 0.63,
    to: 1.01,
    label: "Vehicle at rest",
    state: "LEVEL CHANGE",
    text: "With motion settled, a sustained level change becomes a stronger candidate for review.",
  },
] as const;

export function beatAt(p: number) {
  return BEATS.find((b) => p >= b.from && p < b.to) ?? BEATS[BEATS.length - 1]!;
}
