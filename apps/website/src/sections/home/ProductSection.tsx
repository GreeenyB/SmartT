import { Reveal } from "@/components/shared/Reveal";
import { ProductCarousel3D } from "@/features/hardware-showcase/ProductCarousel3D";

export function ProductSection() {
  return (
    <section id="product" className="scroll-mt-24 border-t border-border bg-background">
      <div className="mx-auto max-w-[1600px] px-8 pt-28 pb-16 md:px-14 md:pt-36">
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
            SmartT is being developed as an edge-to-interface system: vehicle-side sensing,
            signal-aware event logic, and focused software for reviewing what happened.
          </p>
        </Reveal>
        <Reveal delay={0.25}>
          <div className="mt-7 max-w-[62ch] border-l border-brand-teal pl-5 text-sm leading-[1.7] text-muted-foreground">
            <span>
              The interactive objects below are an early system study. The final enclosure,
              interfaces and component mix will evolve with vehicle integration.
            </span>
          </div>
        </Reveal>
        <div className="mt-16">
          <Reveal delay={0.15}>
            <ProductCarousel3D />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
