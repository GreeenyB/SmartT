import type { CSSProperties } from "react";

type SurfaceFadeProps = {
  /** Which edge of the section the fade sits on. */
  side: "top" | "bottom";
  /**
   * Colour of the neighbouring section at that edge. The fade starts at this
   * exact value and eases to transparent, so two sections meet without a seam.
   */
  from: string;
  /** Optional override for the blend height. */
  height?: string;
};

/**
 * Seam eraser.
 *
 * Sections on this page change surface value often (paper → stone → slate →
 * deep navy). A hard edge between two of those values reads as a printing
 * mistake, and a plain linear fade bands. This paints an eased alpha ramp of
 * the *neighbouring* colour over the section's own background, which makes the
 * handover read as one continuous surface.
 *
 * Requires the host section to be `position: relative; isolation: isolate`
 * (the `.surface-blend` utility does both).
 */
export function SurfaceFade({ side, from, height }: SurfaceFadeProps) {
  return (
    <div
      aria-hidden
      className={`surface-fade surface-fade--${side}`}
      style={
        {
          "--fade-from": from,
          ...(height ? { "--fade-h": height } : {}),
        } as CSSProperties
      }
    />
  );
}
