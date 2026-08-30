import { Item, MediaReveal, Reveal, Sequence } from "@/components/shared/Reveal";
import { SurfaceFade } from "@/components/shared/SurfaceFade";
import { SectionMark } from "@/components/shared/SectionMark";

const traits = [
  {
    title: "Vehicle-side unit",
    body: "An ESP32-based edge controller that reads the fuel-level probe together with ignition and motion context.",
  },
  {
    title: "Telemetry link",
    body: "Telemetry records move from the vehicle-side unit to the SmartT service with report timing preserved for review.",
  },
  {
    title: "Contextual review",
    body: "Fuel events are reviewed with surrounding vehicle context, not as isolated level changes.",
  },
];

const buildNotes = [
  {
    label: "Sensing inputs",
    body: "Ultrasonic fuel-level probe, ignition state and motion context, read together.",
  },
  {
    label: "Edge controller",
    body: "ESP32-class microcontroller for data acquisition and uplink to the SmartT service.",
  },
  {
    label: "Build status",
    body: "Working bench prototype. Enclosure, wiring harness and component mix are being refined ahead of vehicle integration.",
  },
];

export function ProductSection() {
  return (
    <section id="product" className="surface-blend scroll-mt-24 bg-background">
      <SurfaceFade side="top" from="var(--surface-stone)" />
      <div className="mx-auto max-w-[1600px] px-8 pt-24 pb-20 md:px-14 md:pt-32">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_.95fr] lg:items-end lg:gap-20">
          <div>
            <Reveal>
              <SectionMark label="Product" />
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="section-title">
                One connected system,
                <br />
                built around the vehicle.
              </h2>
            </Reveal>
          </div>
          <Reveal delay={0.16}>
            <p className="lead max-w-[44ch]">
              SmartT connects vehicle sensing, motion-aware signal processing and focused software
              for fuel-event review.
            </p>
          </Reveal>
        </div>

        <div className="hardware-panel">
          {/* The artefact gets the page's most physical reveal: the plate
              unmasks upward while the photograph releases its overscale. */}
          <MediaReveal as="figure" className="hardware-panel__figure media-frame">
            <img
              src="/prototype/edge-device-annotated.png"
              alt="Annotated photograph of the SmartT vehicle-side unit prototype showing the microcontroller board, wiring and ultrasonic fuel-level probe."
              width={800}
              height={450}
              loading="lazy"
              decoding="async"
            />
            <figcaption>
              <span className="mono text-brand-teal">Assembled prototype</span>
              <p>Vehicle-side unit prototype, photographed as assembled — not a render.</p>
            </figcaption>
          </MediaReveal>

          <Sequence className="hardware-panel__spec" as="dl" step={0.1} delay={0.2}>
            {buildNotes.map((note) => (
              <Item key={note.label}>
                <dt>{note.label}</dt>
                <dd>{note.body}</dd>
              </Item>
            ))}
          </Sequence>
        </div>

        <Sequence className="product-traits" step={0.1}>
          {traits.map((trait) => (
            <Item key={trait.title} variant="settle" as="article" className="product-traits__item">
              <h3>{trait.title}</h3>
              <p>{trait.body}</p>
            </Item>
          ))}
        </Sequence>

        <Reveal delay={0.08}>
          <p className="product-note">Vehicle integration and field validation come next.</p>
        </Reveal>
      </div>
    </section>
  );
}
