import { Reveal } from "@/components/shared/Reveal";
import { SectionMark } from "@/components/shared/SectionMark";

export function ContactSection() {
  return (
    <section id="contact" className="contact-surface scroll-mt-24">
      <div className="mx-auto max-w-[1600px] px-8 py-24 md:px-14 md:py-32">
        <Reveal>
          <SectionMark label="Contact" inverse />
        </Reveal>
        <div className="mt-8 grid gap-12 lg:grid-cols-[1.1fr_.9fr] lg:items-start lg:gap-24">
          <Reveal delay={0.08}>
            <h2 className="section-title section-title--flush max-w-[16ch] text-[clamp(2.5rem,4.8vw,4.4rem)] text-white">
              Let&apos;s make fuel
              <br />
              data easier to trust.
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <div>
              <p className="max-w-[40ch] text-base leading-[1.8] text-white/60">
                We welcome conversations around vehicle integration, field validation and product
                development.
              </p>
              <dl className="contact-lines">
                <div>
                  <dt>Team</dt>
                  <dd className="contact-lines__value">BKUIT · SmartT</dd>
                </div>
                <div>
                  <dt>Team lead</dt>
                  <dd className="contact-lines__value">Nguyễn Hữu Phước</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd className="contact-lines__value">
                    <a href="mailto:phuoc.nguyenhuu@hcmut.edu.vn" className="hover:underline">
                      phuoc.nguyenhuu@hcmut.edu.vn
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd className="contact-lines__value">
                    <a href="tel:+84814255365" className="hover:underline">
                      +84 814 255 365
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd className="contact-lines__value">Ho Chi Minh City, Vietnam</dd>
                </div>
              </dl>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
