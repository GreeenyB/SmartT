import { Item, MediaReveal, Reveal, Rule, Sequence } from "@/components/shared/Reveal";
import { SurfaceFade } from "@/components/shared/SurfaceFade";
import { SectionMark } from "@/components/shared/SectionMark";

const problems = [
  {
    key: "Motion",
    title: "Signals move",
    body: "Fuel readings shift with vehicle motion, tank geometry and probe behaviour. A changing value does not necessarily indicate a meaningful fuel event.",
  },
  {
    key: "Fragmentation",
    title: "Context is scattered",
    body: "Fuel level, ignition state, location and event history often sit in separate records, slowing review and making it less consistent.",
  },
  {
    key: "Latency",
    title: "Evidence arrives late",
    body: "Without a structured event trail, operations teams may have to reconstruct what happened long after the event.",
  },
];

export function ProblemSection() {
  return (
    <section id="problem" className="section-cool surface-blend scroll-mt-24">
      <SurfaceFade side="top" from="var(--background)" />
      <div className="mx-auto max-w-[1600px] px-8 py-24 md:px-14 md:py-32">
        <Reveal>
          <SectionMark label="Problem" />
        </Reveal>
        <div className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_.95fr] lg:items-end lg:gap-20">
          <Reveal delay={0.08}>
            <h2 className="section-title section-title--flush">
              Fuel is measurable.
              <br />
              The story behind it is harder.
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="lead max-w-[44ch]">
              Fuel data alone rarely explains what happened around a reading. Operations teams also
              need to know when, where and under what vehicle conditions it changed.
            </p>
          </Reveal>
        </div>

        {/* Premise reads as three separate observations: each one measures
            itself out with a short rule, then drifts in from the margin. */}
        <Sequence className="premise" step={0.12}>
          {problems.map((item) => (
            <Item key={item.title} variant="drift" className="premise__item">
              <Rule className="premise__rule" />
              <span className="premise__key">{item.key}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </Item>
          ))}
        </Sequence>

        <div className="evidence">
          <MediaReveal direction="in" as="figure" className="evidence__media media-frame">
            <img
              src="/smartt-photos/fuel-context-truck-petrol-station.jpg"
              alt="Delivery truck parked beside fuel pumps at a petrol station."
              loading="lazy"
              decoding="async"
            />
            <figcaption className="evidence__stamp">Field context</figcaption>
          </MediaReveal>
          <Sequence className="evidence__copy" step={0.08} delay={0.18}>
            <Item as="span" className="mono text-brand-teal">
              Fuel event
            </Item>
            <Item as="h3">A refuelling stop is more than a transaction.</Item>
            <Item as="p">
              Within a short window, a vehicle may refuel, idle, move or show a sudden level change.
              SmartT links fuel events with ignition, motion and location context for later review.
            </Item>
          </Sequence>
        </div>
      </div>
    </section>
  );
}
