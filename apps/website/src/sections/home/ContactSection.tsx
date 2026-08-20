import { ArrowUpRight } from "lucide-react";

import { Reveal } from "@/components/shared/Reveal";

export function ContactSection() {
  return (
    <section id="contact" className="contact-surface scroll-mt-24">
      <div className="mx-auto max-w-[1600px] px-8 py-28 md:px-14 md:py-36">
        <Reveal>
          <p className="section-label">Contact</p>
        </Reveal>
        <div className="mt-6 grid gap-10 lg:grid-cols-[1.2fr_.8fr] lg:items-start">
          <Reveal delay={0.1}>
            <h2 className="section-title section-title--flush mt-2 max-w-[16ch] text-[clamp(2.75rem,5.4vw,5rem)]">
              Let&apos;s make fuel
              <br />
              data easier to trust.
            </h2>
          </Reveal>
          <Reveal delay={0.2}>
            <div>
              <p className="lead max-w-[40ch]">
                We welcome conversations around vehicle integration, field validation and product
                development.
              </p>
              <dl className="mt-8 grid gap-4 text-sm">
                <div>
                  <dt className="eyebrow">Email</dt>
                  <dd className="mt-1 font-medium">contact@smartt.example</dd>
                </div>
                <div>
                  <dt className="eyebrow">Phone</dt>
                  <dd className="mt-1 font-medium">+84 777 730 635</dd>
                </div>
                <div>
                  <dt className="eyebrow">Location</dt>
                  <dd className="mt-1 font-medium">Ho Chi Minh City, Vietnam</dd>
                </div>
              </dl>
              <a
                href="#about"
                className="btn-brand mt-8 inline-flex items-center gap-3 rounded-full px-6 py-3 text-sm font-medium transition-transform hover:-translate-y-0.5"
              >
                Meet Team BKUIT <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
