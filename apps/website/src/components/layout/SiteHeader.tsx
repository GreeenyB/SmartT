import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

import { BrandLogo } from "@/components/layout/BrandLogo";

const navigation = [
  { label: "Product", href: "#product" },
  { label: "Platform", href: "#platform" },
  { label: "Technology", href: "#technology" },
  { label: "Roadmap", href: "#roadmap" },
  { label: "Team", href: "#about" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [condensed, setCondensed] = useState(false);
  const [active, setActive] = useState<string>("");

  /* The bar tightens once you leave the hero — a small signal that you are
     reading, not landing. */
  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > 120);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Scroll spy: the nav reflects where the reader actually is. */
  useEffect(() => {
    const ids = navigation.map((item) => item.href.slice(1));
    const targets = ids
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => node !== null);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(`#${visible.target.id}`);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  return (
    <header className={`site-header ${condensed ? "is-condensed" : ""}`}>
      <div className="site-header__bar">
        <a href="#top" className="site-header__logo" aria-label="SmartT home">
          <BrandLogo />
        </a>
        <nav className="site-header__nav" aria-label="Primary navigation">
          {navigation.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`nav-link nav-link--tracked ${active === item.href ? "is-active" : ""}`}
              aria-current={active === item.href ? "true" : undefined}
            >
              {item.label}
            </a>
          ))}
          <a href="#contact" className="site-header__contact">
            Contact
          </a>
        </nav>
        <button
          type="button"
          className="site-header__toggle"
          aria-expanded={open}
          aria-controls="mobile-navigation"
          aria-label={open ? "Close navigation" : "Open navigation"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      <nav
        id="mobile-navigation"
        className={`site-header__mobile ${open ? "is-open" : ""}`}
        aria-label="Mobile navigation"
      >
        {navigation.map((item) => (
          <a key={item.href} href={item.href} onClick={() => setOpen(false)}>
            {item.label}
          </a>
        ))}
        <a href="#contact" onClick={() => setOpen(false)}>
          Contact
        </a>
      </nav>
    </header>
  );
}
