import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BEATS, SAMPLES, beatAt, buildSeries, motionState, slosh } from "./slosh-signal";
import "./slosh-chapter.css";

/* --------------------------------------------------------------------------
 * Geometry
 * ----------------------------------------------------------------------- */

type Plot = { x0: number; x1: number; y0: number; y1: number; lo: number; hi: number };

/* Wide instrument for desktop; a narrower viewBox on small screens so the
   hairlines and tick labels keep their real size instead of being scaled down
   with the svg. */
const PLOT_WIDE: Plot = { x0: 58, x1: 962, y0: 36, y1: 248, lo: 62, hi: 92 };
const PLOT_COMPACT: Plot = { x0: 46, x1: 476, y0: 44, y1: 236, lo: 62, hi: 92 };

const pxIn = (plot: Plot, i: number) => plot.x0 + ((plot.x1 - plot.x0) * i) / (SAMPLES - 1);
const pyIn = (plot: Plot, v: number) =>
  plot.y1 - ((v - plot.lo) / (plot.hi - plot.lo)) * (plot.y1 - plot.y0);

function line(plot: Plot, values: number[], upto: number) {
  let d = "";
  for (let i = 0; i <= upto; i += 1) {
    d += `${i === 0 ? "M" : "L"}${pxIn(plot, i).toFixed(1)} ${pyIn(plot, values[i]!).toFixed(2)}`;
  }
  return d;
}

/* Tank cross-section ------------------------------------------------------ */

const TANK = { x0: 34, x1: 266, top: 74, bottom: 208 };
const PROBE_X = 150;

function tankSurface(levelPct: number, tilt: number, phase: number) {
  const base = TANK.bottom - ((levelPct - 55) / 45) * (TANK.bottom - TANK.top - 6) - 4;
  const pts: string[] = [];
  const steps = 24;
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const x = TANK.x0 + (TANK.x1 - TANK.x0) * u;
    const env = Math.sin(Math.PI * (0.1 + 0.8 * u));
    const y =
      base +
      tilt * (u - 0.5) * 2 +
      Math.abs(tilt) * 0.28 * env * Math.sin(u * Math.PI * 2.1 + phase);
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(2)}`);
  }
  return { path: pts.join(" "), base };
}

function surfaceYAt(levelPct: number, tilt: number, phase: number, x: number) {
  const u = (x - TANK.x0) / (TANK.x1 - TANK.x0);
  const base = TANK.bottom - ((levelPct - 55) / 45) * (TANK.bottom - TANK.top - 6) - 4;
  const env = Math.sin(Math.PI * (0.1 + 0.8 * u));
  return (
    base + tilt * (u - 0.5) * 2 + Math.abs(tilt) * 0.28 * env * Math.sin(u * Math.PI * 2.1 + phase)
  );
}

/* --------------------------------------------------------------------------
 * Component
 * ----------------------------------------------------------------------- */

/** One full pass of the illustrative 100 s window, in ms. */
const RUN_MS = 4000;

export function SloshChapter() {
  const reduced = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  const pRef = useRef(0);
  const [inView, setInView] = useState(false);
  const [run, setRun] = useState(0); // bumping this restarts the pass
  const [compact, setCompact] = useState(false);

  /* Narrower plot geometry on small screens (SSR-safe: wide until measured). */
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 899px)");
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const commit = useCallback((value: number) => {
    // Quantised so we only re-render at the resolution the plot can show.
    const q = Math.round(Math.min(1, Math.max(0, value)) * 400) / 400;
    pRef.current = q;
    setP(q);
  }, []);

  /* Play only while the instrument is actually on screen. */
  useEffect(() => {
    const node = stageRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)), {
      threshold: 0.35,
    });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  /* Autoplay: a single rAF pass, paused (not reset) when off-screen. */
  useEffect(() => {
    if (reduced || !inView) return;

    let raf = 0;
    let start: number | null = null;
    const from = pRef.current >= 1 ? 0 : pRef.current;

    const tick = (now: number) => {
      if (start === null) start = now;
      const next = Math.min(1, from + (now - start) / RUN_MS);
      commit(next);
      if (next < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, inView, run, commit]);
  const replay = useCallback(() => {
    commit(0);
    setRun((n) => n + 1);
  }, [commit]);

  const series = useMemo(() => buildSeries(), []);
  const raws = useMemo(() => series.map((f) => f.raw), [series]);
  const stables = useMemo(() => series.map((f) => f.stable), [series]);

  const PLOT = compact ? PLOT_COMPACT : PLOT_WIDE;
  const traceW = compact ? 522 : 1000;
  const traceH = compact ? 268 : 280;
  const px = (i: number) => pxIn(PLOT, i);
  const py = (v: number) => pyIn(PLOT, v);
  const keyGap = compact ? 124 : 150;

  const progress = reduced ? 1 : p;
  const idx = Math.min(SAMPLES - 1, Math.max(1, Math.round(progress * (SAMPLES - 1))));
  const frame = series[idx]!;
  const beat = beatAt(progress);

  const tilt = Math.max(-16, Math.min(16, motionState(frame.t) * 46));
  const wobble = slosh(frame.t);
  const surface = tankSurface(frame.stable, tilt, frame.t * 0.9);
  const probeY = surfaceYAt(frame.stable, tilt, frame.t * 0.9, PROBE_X);
  const meanY = tankSurface(frame.stable, 0, 0).base;

  const dropConfirmed = progress > 0.9;
  const complete = progress >= 1;

  return (
    <div
      ref={stageRef}
      className={`slosh-stage ${reduced ? "slosh-stage--static" : ""}`}
      id="fuel-slosh"
    >
      <div className="slosh-stage__sticky">
        <div className="slosh-panel">
          {/* ---- header ------------------------------------------------- */}
          <header className="slosh-panel__head">
            <div>
              <span className="slosh-panel__mark">Signal integrity</span>
              <h3>Same fuel. Different reading.</h3>
            </div>

            <dl className="slosh-readout">
              <div>
                <dt>Motion</dt>
                <dd className="tabular-nums">
                  {frame.a >= 0 ? "+" : "−"}
                  {Math.abs(frame.a).toFixed(2)} g
                </dd>
              </div>
              <div>
                <dt>Raw reading</dt>
                <dd className="tabular-nums slosh-readout__raw">{frame.raw.toFixed(1)} %</dd>
              </div>
              <div>
                <dt>Motion-aware level</dt>
                <dd className="tabular-nums slosh-readout__stable">{frame.stable.toFixed(1)} %</dd>
              </div>
              <div>
                <dt>State</dt>
                <dd
                  className={`slosh-readout__state ${
                    beat.state === "TRANSIENT" ? "is-transient" : "is-change"
                  }`}
                >
                  {beat.state}
                </dd>
              </div>
            </dl>
          </header>

          {/* ---- instrument --------------------------------------------- */}
          <div className="slosh-panel__body">
            <figure className="slosh-tank">
              <svg
                viewBox="0 0 300 250"
                role="img"
                aria-label="Tank cross-section with an ultrasonic probe measuring the tilted fuel surface."
              >
                <defs>
                  <clipPath id="slosh-tank-window">
                    <rect
                      x={TANK.x0}
                      y={TANK.top}
                      width={TANK.x1 - TANK.x0}
                      height={TANK.bottom - TANK.top}
                      rx="10"
                    />
                  </clipPath>
                </defs>

                <g clipPath="url(#slosh-tank-window)">
                  <rect x="0" y="0" width="300" height="250" className="slosh-tank__void" />
                  <path
                    d={`${surface.path} L${TANK.x1} ${TANK.bottom + 20} L${TANK.x0} ${TANK.bottom + 20} Z`}
                    className="slosh-tank__fluid"
                  />
                  <path d={surface.path} className="slosh-tank__surface" />
                  <line
                    x1={TANK.x0}
                    y1={meanY}
                    x2={TANK.x1}
                    y2={meanY}
                    className="slosh-tank__mean"
                  />
                  <line
                    x1={PROBE_X}
                    y1={TANK.top}
                    x2={PROBE_X}
                    y2={probeY}
                    className="slosh-tank__beam"
                  />
                </g>

                <rect
                  x={TANK.x0}
                  y={TANK.top}
                  width={TANK.x1 - TANK.x0}
                  height={TANK.bottom - TANK.top}
                  rx="10"
                  className="slosh-tank__shell"
                />
                <rect
                  x={PROBE_X - 13}
                  y={TANK.top - 22}
                  width="26"
                  height="22"
                  rx="2"
                  className="slosh-tank__probe"
                />
                <circle cx={PROBE_X} cy={probeY} r="2.6" className="slosh-tank__hit" />

                <text x={TANK.x0} y={TANK.top - 12} className="slosh-tank__tag">
                  CROSS-SECTION
                </text>
                <text x={TANK.x1} y={meanY - 7} textAnchor="end" className="slosh-tank__tag">
                  h
                </text>
                <text x={TANK.x0} y={TANK.bottom + 24} className="slosh-tank__tag">
                  Δ SURFACE {wobble >= 0 ? "+" : "−"}
                  {Math.abs(wobble).toFixed(1)} %
                </text>
              </svg>
            </figure>

            <figure className="slosh-trace">
              <svg
                viewBox={`0 0 ${traceW} ${traceH}`}
                role="img"
                aria-label="Two traces over an illustrative 100-second window: the raw probe reading moves during manoeuvres while the motion-aware level stays steady until a modelled sustained drop."
              >
                {[92, 82, 72, 62].map((v) => (
                  <g key={v}>
                    <line
                      x1={PLOT.x0}
                      y1={py(v)}
                      x2={PLOT.x1}
                      y2={py(v)}
                      className="slosh-trace__grid"
                    />
                    <text
                      x={PLOT.x0 - 10}
                      y={py(v) + 3.5}
                      textAnchor="end"
                      className="slosh-trace__tick"
                    >
                      {v}
                    </text>
                  </g>
                ))}

                <path d={line(PLOT, raws, idx)} className="slosh-trace__raw" />
                <path d={line(PLOT, stables, idx)} className="slosh-trace__stable" />

                <line
                  x1={px(idx)}
                  y1={PLOT.y0 - 12}
                  x2={px(idx)}
                  y2={PLOT.y1 + 14}
                  className="slosh-trace__head"
                />
                <circle
                  cx={px(idx)}
                  cy={py(frame.raw)}
                  r="3.2"
                  className="slosh-trace__dot slosh-trace__dot--raw"
                />
                <circle
                  cx={px(idx)}
                  cy={py(frame.stable)}
                  r="3.6"
                  className="slosh-trace__dot slosh-trace__dot--stable"
                />

                <text x={PLOT.x0} y={PLOT.y1 + 32} className="slosh-trace__tick">
                  0 s
                </text>
                <text x={PLOT.x1} y={PLOT.y1 + 32} textAnchor="end" className="slosh-trace__tick">
                  100 s
                </text>

                <g className={`slosh-trace__event ${dropConfirmed ? "is-on" : ""}`}>
                  <line
                    x1={px(Math.round(SAMPLES * 0.79))}
                    y1={PLOT.y0 - 12}
                    x2={px(Math.round(SAMPLES * 0.79))}
                    y2={PLOT.y1}
                  />
                  <text x={px(Math.round(SAMPLES * 0.79)) - 10} y={PLOT.y0 - 16} textAnchor="end">
                    SUSTAINED LEVEL CHANGE
                  </text>
                </g>

                <g className="slosh-trace__key">
                  <line
                    x1={PLOT.x0}
                    y1={PLOT.y0 - 18}
                    x2={PLOT.x0 + 22}
                    y2={PLOT.y0 - 18}
                    className="slosh-trace__raw"
                  />
                  <text x={PLOT.x0 + 30} y={PLOT.y0 - 14.5}>
                    RAW READING
                  </text>
                  <line
                    x1={PLOT.x0 + keyGap}
                    y1={PLOT.y0 - 18}
                    x2={PLOT.x0 + keyGap + 22}
                    y2={PLOT.y0 - 18}
                    className="slosh-trace__stable"
                  />
                  <text x={PLOT.x0 + keyGap + 30} y={PLOT.y0 - 14.5}>
                    MOTION-AWARE LEVEL
                  </text>
                </g>
              </svg>
            </figure>
          </div>

          {/* ---- beats --------------------------------------------------- */}
          <ol className="slosh-beats">
            {BEATS.map((b, i) => (
              <li
                key={b.id}
                className={`slosh-beats__item ${reduced || b.id === beat.id ? "is-active" : ""}`}
              >
                <span className="slosh-beats__rule" aria-hidden="true">
                  <span
                    className="slosh-beats__fill"
                    style={{
                      transform: `scaleX(${
                        reduced
                          ? 1
                          : Math.max(0, Math.min(1, (progress - b.from) / (b.to - b.from)))
                      })`,
                    }}
                  />
                </span>
                <span className="slosh-beats__label">
                  {String(i + 1).padStart(2, "0")} · {b.label}
                </span>
                <p>{b.text}</p>
              </li>
            ))}
          </ol>

          <footer className="slosh-foot">
            <p className="slosh-note">
              Illustrative signal model · synthetic values · 100 s window
            </p>
            {!reduced && (
              <button
                type="button"
                onClick={replay}
                className={`slosh-replay ${complete ? "is-ready" : ""}`}
                aria-label="Replay the signal integrity sequence"
              >
                <span className="slosh-replay__dot" aria-hidden="true" />
                Replay
              </button>
            )}
          </footer>
        </div>
      </div>
    </div>
  );
}
