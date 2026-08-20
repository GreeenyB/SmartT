import { Cpu, Radio, ShieldCheck } from "lucide-react";

import { Reveal } from "@/components/shared/Reveal";

const traits = [
  {
    icon: Cpu,
    title: "Vehicle-side unit",
    body: "An edge controller that samples the fuel sender together with ignition and motion context.",
  },
  {
    icon: Radio,
    title: "Resilient link",
    body: "Telemetry is buffered locally and synchronised when connectivity allows, so gaps don't erase history.",
  },
  {
    icon: ShieldCheck,
    title: "Evidence first",
    body: "Every event keeps the surrounding signal window, so a flagged drop can always be reviewed in context.",
  },
];

export function ProductSection() {
  return (
    <section
      id="product"
      className="section-tinted scroll-mt-24 border-t border-border bg-background"
    >
      <div className="mx-auto max-w-[1600px] px-8 pt-28 pb-24 md:px-14 md:pt-36">
        <Reveal>
          <p className="section-label">Product</p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="section-title">
            One connected system,
            <br />
            built around the vehicle.
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="lead mt-7 max-w-[46ch]">
            SmartT is an edge-to-interface system: vehicle-side sensing, signal-aware event logic,
            and focused software for reviewing what happened.
          </p>
        </Reveal>
        <div className="product-showcase">
          <Reveal delay={0.12}>
            <figure className="product-showcase__media product-showcase__media--wide">
              <img
                src="/smartt-photos/fuel-context-truck-petrol-station.jpg"
                alt="A truck refuelling at a petrol station, the moment SmartT records as a refill event."
                loading="lazy"
                decoding="async"
              />
              <figcaption>
                <span className="eyebrow eyebrow--accent">In the field</span>
                <p>
                  Sensing starts at the vehicle: refills, idling and drops are captured where they
                  happen, not reconstructed afterwards.
                </p>
              </figcaption>
            </figure>
          </Reveal>

          <Reveal delay={0.2}>
            <figure className="product-showcase__media product-showcase__media--tall">
              <img
                src="/smartt-photos/fleet-scale-aerial-depot.jpg"
                alt="Aerial view of a depot with a fleet of trucks parked in rows."
                loading="lazy"
                decoding="async"
              />
              <figcaption>
                <span className="eyebrow eyebrow--accent">At fleet scale</span>
                <p>One consistent record per vehicle, from a single truck to a full depot.</p>
              </figcaption>
            </figure>
          </Reveal>
        </div>

        <div className="product-traits">
          {traits.map((trait, index) => (
            <Reveal key={trait.title} delay={0.1 + index * 0.08}>
              <article className="product-traits__item">
                <trait.icon className="h-5 w-5" strokeWidth={1.5} />
                <h3>{trait.title}</h3>
                <p>{trait.body}</p>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.15}>
          <p className="product-note">
            Enclosure, interfaces and component mix continue to be refined against real vehicle
            installations.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
