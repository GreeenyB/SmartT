import { Reveal } from "@/components/shared/Reveal";
import { SmartTDeviceShowcase } from "@/features/device-showcase/DeviceShowcase";

export function PlatformSection() {
  return (
    <section id="platform" className="scroll-mt-24 border-t border-border bg-background">
      <div className="mx-auto max-w-[1600px] px-8 pt-28 pb-8 md:px-14 md:pt-36">
        <Reveal>
          <p className="section-label">Platform</p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="section-title">
            Operational clarity,
            <br />
            from desk to field.
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="lead mt-7 max-w-[46ch]">
            The desktop console brings fleet context together for review. The mobile experience
            reshapes the same information around status, fuel trends and incident evidence.
          </p>
        </Reveal>
      </div>
      <SmartTDeviceShowcase />
    </section>
  );
}
