import { ArrowDownRight } from "lucide-react";

import { Reveal } from "@/components/shared/Reveal";

const disciplines = [
  { label: "Embedded systems", detail: "Vehicle-side sensing" },
  { label: "Software", detail: "Dashboard and mobile review" },
  { label: "Product", detail: "Fleet workflow design" },
  { label: "Business", detail: "Operational validation" },
];

export function AboutSection() {
  return (
    <section
      id="about"
      className="mx-auto max-w-[1600px] scroll-mt-24 px-8 py-28 md:px-14 md:py-36"
    >
      <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-24">
        <div>
          <Reveal>
            <p className="section-label">About</p>
          </Reveal>
          <Reveal delay={0.1}>
            <h2 className="section-title section-title--sm">Built by Team BKUIT.</h2>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="lead mt-7 max-w-[42ch]">
              SmartT is a five-person university innovation project developed in Ho Chi Minh City
              for BKI 2026, combining embedded engineering, software, product thinking and business
              research around one fleet-operations problem.
            </p>
          </Reveal>
          <Reveal delay={0.3}>
            <a
              href="#contact"
              className="mt-9 inline-flex items-center gap-2 border-b border-foreground/25 pb-1 text-[0.78rem] tracking-[0.2em] transition-colors hover:border-foreground"
            >
              START A CONVERSATION <ArrowDownRight className="h-4 w-4" />
            </a>
          </Reveal>
        </div>
        <Reveal delay={0.15}>
          <div className="about-context">
            <figure className="about-context__media" aria-label="Fleet depot scale">
              <img
                src="/smartt-photos/fleet-scale-aerial-depot.jpg"
                alt="Aerial view of a large logistics depot with rows of trucks."
                loading="lazy"
                decoding="async"
              />
              <figcaption>Deployment context — depot-scale fleets</figcaption>
            </figure>
            <div className="about-context__disciplines">
              {disciplines.map(({ label, detail }, index) => (
                <div key={label} className="about-context__discipline">
                  <span>0{index + 1}</span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
