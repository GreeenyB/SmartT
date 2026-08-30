import { createFileRoute } from "@tanstack/react-router";

import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ScrollProgress } from "@/components/shared/ScrollProgress";
import { AboutSection } from "@/sections/home/AboutSection";
import { ContactSection } from "@/sections/home/ContactSection";
import { HeroSection } from "@/sections/home/HeroSection";
import { MetricsBand } from "@/sections/home/MetricsBand";
import { PlatformSection } from "@/sections/home/PlatformSection";
import { ProblemSection } from "@/sections/home/ProblemSection";
import { ProductSection } from "@/sections/home/ProductSection";
import { RoadmapSection } from "@/sections/home/RoadmapSection";
import { SolutionSection } from "@/sections/home/SolutionSection";
import { TechnologySection } from "@/sections/home/TechnologySection";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SmartT — Fuel Monitoring & Fleet Telemetry" },
      {
        name: "description",
        content:
          "SmartT combines fuel-level sensing, vehicle motion and operating context for clearer fuel-event review.",
      },
      {
        property: "og:title",
        content: "SmartT — Fuel Monitoring & Fleet Telemetry",
      },
      {
        property: "og:description",
        content:
          "SmartT brings fuel monitoring, fleet telemetry and vehicle context together from sensing through review.",
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
        <MetricsBand />
        <ProductSection />
        <PlatformSection />
        <TechnologySection />
        <RoadmapSection />
        <AboutSection />
        <ContactSection />
      </main>
      <SiteFooter />
    </div>
  );
}
