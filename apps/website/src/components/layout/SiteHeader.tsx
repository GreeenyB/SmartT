import { Menu, X } from "lucide-react";
import { useState } from "react";

import { BrandLogo } from "@/components/layout/BrandLogo";

const navigation = [
  { label: "Product", href: "#product" },
  { label: "Platform", href: "#platform" },
  { label: "Technology", href: "#technology" },
  { label: "About", href: "#about" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="site-header__bar">
        <a href="#top" className="site-header__logo" aria-label="SmartT home">
          <BrandLogo />
        </a>
        <nav className="site-header__nav" aria-label="Primary navigation">
          {navigation.map((item) => (
            <a key={item.href} href={item.href} className="nav-link">
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
