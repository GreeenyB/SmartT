import { BrandLogo } from "@/components/layout/BrandLogo";

const links = [
  { label: "Product", href: "#product" },
  { label: "Platform", href: "#platform" },
  { label: "Technology", href: "#technology" },
  { label: "About", href: "#about" },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-10 px-8 py-14 md:flex-row md:items-end md:justify-between md:px-14">
        <div>
          <BrandLogo inverse />
          <p className="mt-5 max-w-sm text-sm text-white/65">
            Fuel monitoring and fleet telemetry developed by Team BKUIT in Ho Chi Minh City.
          </p>
        </div>
        <div className="flex flex-wrap gap-8 text-sm text-white/65">
          {links.map((item) => (
            <a key={item.href} href={item.href} className="transition-colors hover:text-white">
              {item.label}
            </a>
          ))}
        </div>
        <div className="text-xs text-white/50">
          © {new Date().getFullYear()} SmartT · Team BKUIT
        </div>
      </div>
    </footer>
  );
}
