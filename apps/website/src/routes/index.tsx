import { createFileRoute } from "@tanstack/react-router";

import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ScrollProgress } from "@/components/shared/ScrollProgress";
import { AboutSection } from "@/sections/home/AboutSection";
import { ContactSection } from "@/sections/home/ContactSection";
import { HeroSection } from "@/sections/home/HeroSection";
import { PlatformSection } from "@/sections/home/PlatformSection";
import { ProblemSection } from "@/sections/home/ProblemSection";
import { ProductSection } from "@/sections/home/ProductSection";
import { SolutionSection } from "@/sections/home/SolutionSection";
import { TechnologySection } from "@/sections/home/TechnologySection";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SmartT — Fuel Intelligence Built on Trustworthy Signals" },
      {
        name: "description",
        content:
          "SmartT is a developing fuel-monitoring and fleet-telemetry system that turns noisy vehicle signals into clear operational context.",
      },
      {
        property: "og:title",
        content: "SmartT — Fuel Intelligence Built on Trustworthy Signals",
      },
      {
        property: "og:description",
        content: "A developing fuel-monitoring and fleet-telemetry system by Team BKUIT.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&family=Inter:wght@300;400;500;600;700&family=Manrope:wght@400;500;600;700&family=Sora:wght@500;600&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <ScrollProgress />
      <SiteHeader />
      <main>
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <ProductSection />
        <PlatformSection />
        <TechnologySection />
        <AboutSection />
        <ContactSection />
      </main>
      <SiteFooter />
    </div>
  );
}
