import { Reveal } from "@/components/shared/Reveal";
import { SectionMark } from "@/components/shared/SectionMark";
import { SmartTDeviceShowcase } from "@/features/device-showcase/DeviceShowcase";

export function PlatformSection() {
  return (
    <section id="platform" className="scroll-mt-24 border-t border-border bg-background">
      <div className="mx-auto max-w-[1600px] px-8 pt-24 pb-6 md:px-14 md:pt-32">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_.95fr] lg:items-end lg:gap-20">
          <div>
            <Reveal>
              <SectionMark label="Platform" />
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="section-title">
                Operational clarity,
                <br />
                from desk to field.
              </h2>
            </Reveal>
          </div>
          <Reveal delay={0.16}>
            <p className="lead max-w-[44ch]">
              The desktop console brings fleet context together for review. Mobile views keep
              status, fuel trends and incident evidence accessible in the field.
            </p>
          </Reveal>
        </div>
      </div>
      <SmartTDeviceShowcase />
    </section>
  );
}
