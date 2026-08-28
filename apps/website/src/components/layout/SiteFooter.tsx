import { BrandLogo } from "@/components/layout/BrandLogo";

const links = [
  { label: "Product", href: "#product" },
  { label: "Platform", href: "#platform" },
  { label: "Technology", href: "#technology" },
  { label: "Team", href: "#about" },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="mx-auto max-w-[1600px] px-8 pt-14 pb-12 md:px-14">
        <div className="site-footer__rule" aria-hidden="true" />
        <div className="mt-10 flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
          <div>
            <BrandLogo inverse />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/60">
              Fuel monitoring and fleet telemetry developed in Ho Chi Minh City by Team BKUIT.
            </p>
          </div>
          <div className="flex flex-wrap gap-8">
            {links.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="mono text-white/60 transition-colors hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </div>
          <div className="mono text-white/40">© {new Date().getFullYear()} SmartT</div>
        </div>
      </div>
    </footer>
  );
}
