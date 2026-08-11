type BrandLogoProps = {
  inverse?: boolean;
  compact?: boolean;
};

export function BrandLogo({ inverse = false, compact = false }: BrandLogoProps) {
  return (
    <span
      className={`site-brand ${inverse ? "site-brand--inverse" : ""} ${
        compact ? "site-brand--compact" : ""
      }`}
    >
      <img src="/smartt-logo.png" alt="" aria-hidden="true" />
      {!compact && <span>Fleet intelligence</span>}
    </span>
  );
}
