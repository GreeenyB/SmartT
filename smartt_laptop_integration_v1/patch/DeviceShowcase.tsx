import { useEffect, useRef, useState, type ReactNode } from "react";

import "./device-showcase.css";
import "./laptop-scroll.css";
import { DASHBOARD_URL } from "@/lib/dashboard-url";
import {
  FleetMapPhoneScreen,
  IncidentEvidencePhoneScreen,
  VehicleTimelinePhoneScreen,
} from "./PhoneWorkflow";

/** Official SmartT console — single source of truth for every product screen. */

const LAPTOP_SCROLL = {
  closedTime: 0.14,
  openingStartTime: 0.18,
  openTime: 2.28,
  closedHoldEnd: 0.3,
  openingEnd: 0.84,
  interactiveStart: 0.88,
} as const;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number) {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
}

function laptopTimeForProgress(progress: number) {
  const p = clamp01(progress);
  if (p <= LAPTOP_SCROLL.closedHoldEnd) return LAPTOP_SCROLL.closedTime;
  if (p >= LAPTOP_SCROLL.openingEnd) return LAPTOP_SCROLL.openTime;

  const local =
    (p - LAPTOP_SCROLL.closedHoldEnd) /
    (LAPTOP_SCROLL.openingEnd - LAPTOP_SCROLL.closedHoldEnd);
  const eased = smoothstep(local);

  return (
    LAPTOP_SCROLL.openingStartTime +
    (LAPTOP_SCROLL.openTime - LAPTOP_SCROLL.openingStartTime) * eased
  );
}

function DashboardPortal({
  interactive = true,
  scrollCalibrated = false,
}: {
  interactive?: boolean;
  scrollCalibrated?: boolean;
}) {
  return (
    <a
      className={`dashboard-portal${scrollCalibrated ? " scroll-laptop__portal" : ""}`}
      href={DASHBOARD_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Open SmartT Console in a new tab"
      aria-hidden={interactive ? undefined : true}
      tabIndex={interactive ? 0 : -1}
    >
      <span className="dashboard-portal__veil" aria-hidden="true" />
      <span className="dashboard-portal__copy" aria-hidden="true">
        <strong>Open SmartT Console</strong>
        <span aria-hidden="true">↗</span>
      </span>
    </a>
  );
}

/**
 * High-quality static fallback for browsers that cannot decode the alpha WebM.
 * Keeping this path also preserves the existing no-motion experience.
 */
function StaticLaptopFallback() {
  return (
    <div
      className="rendered-laptop rendered-laptop--portal"
      aria-label="The SmartT operations console shown on a laptop"
    >
      <div className="rendered-laptop__screen">
        <img
          className="console-snapshot"
          src="/dashboard/console-overview.webp"
          alt="SmartT console — Fuel & Fleet Overview with fleet efficiency, suspected fuel loss, idle waste and open alerts"
          width={2016}
          height={1324}
          loading="lazy"
          decoding="async"
        />
        <DashboardPortal />
      </div>
      <img
        className="rendered-laptop__hardware"
        src="/hardware/laptop-hardware.png"
        alt=""
        aria-hidden="true"
      />
    </div>
  );
}

/**
 * Desktop heading + laptop form one sticky composition. Scroll progress is
 * divided into a deliberate closed hold, lid opening, and open settle. The
 * composition then leaves as one unit before the mobile showcase enters.
 */
function DesktopConsoleReveal() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const track = trackRef.current;
    const sticky = stickyRef.current;
    if (!video || !track || !sticky || mediaFailed) return;

    let raf = 0;
    let metadataReady = video.readyState >= 1;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compactLayout = window.matchMedia("(max-width: 680px)");

    const setInteractive = (nextReady: boolean) => {
      if (readyRef.current === nextReady) return;
      readyRef.current = nextReady;
      setReady(nextReady);
    };

    const sync = () => {
      raf = 0;
      if (!metadataReady) return;

      if (reducedMotion.matches || compactLayout.matches) {
        if (Math.abs(video.currentTime - LAPTOP_SCROLL.openTime) > 1 / 120) {
          video.currentTime = LAPTOP_SCROLL.openTime;
        }
        setInteractive(true);
        return;
      }

      const stickyTop = Number.parseFloat(window.getComputedStyle(sticky).top) || 0;
      const trackRect = track.getBoundingClientRect();
      const runway = Math.max(1, track.offsetHeight - sticky.offsetHeight);
      const progress = clamp01((stickyTop - trackRect.top) / runway);
      const targetTime = laptopTimeForProgress(progress);

      if (Math.abs(video.currentTime - targetTime) > 1 / 120) {
        video.currentTime = targetTime;
      }

      setInteractive(progress >= LAPTOP_SCROLL.interactiveStart);
    };

    const requestSync = () => {
      if (!raf) raf = window.requestAnimationFrame(sync);
    };

    const onMetadata = () => {
      metadataReady = true;
      video.pause();
      sync();
    };

    video.addEventListener("loadedmetadata", onMetadata);
    window.addEventListener("scroll", requestSync, { passive: true });
    window.addEventListener("resize", requestSync);
    reducedMotion.addEventListener("change", requestSync);
    compactLayout.addEventListener("change", requestSync);
    requestSync();

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      video.removeEventListener("loadedmetadata", onMetadata);
      window.removeEventListener("scroll", requestSync);
      window.removeEventListener("resize", requestSync);
      reducedMotion.removeEventListener("change", requestSync);
      compactLayout.removeEventListener("change", requestSync);
    };
  }, [mediaFailed]);

  return (
    <section className="showcase-section showcase-section--desktop">
      <div ref={trackRef} className="desktop-reveal-track">
        <div ref={stickyRef} className="desktop-reveal-sticky">
          <div className="showcase-heading">
            <span>Desktop console</span>
            <h2>Fuel and fleet context in one operations workspace.</h2>
            <p>
              Fleet fuel efficiency against baseline, suspected fuel loss, idle waste and open alerts
              — reviewed across 28 telemetry units.
            </p>
          </div>

          {mediaFailed ? (
            <StaticLaptopFallback />
          ) : (
            <div
              className={`scroll-laptop${ready ? " is-ready" : ""}`}
              aria-label="The SmartT operations console shown on an opening laptop"
            >
              <video
                ref={videoRef}
                className="scroll-laptop__video"
                poster="/showcase/laptop-open-poster.webp"
                muted
                playsInline
                preload="auto"
                disablePictureInPicture
                aria-hidden="true"
                onError={() => setMediaFailed(true)}
              >
                <source src="/showcase/laptop-open-scroll.webm" type="video/webm" />
              </video>

              <DashboardPortal interactive={ready} scrollCalibrated />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function RenderedPhone({ children, label }: { children: ReactNode; label: string }) {
  return (
    <article className="phone-presentation">
      <div className="rendered-phone" aria-label={`${label} in the SmartT mobile app`}>
        <div className="rendered-phone__screen">{children}</div>
        <img
          className="rendered-phone__hardware"
          src="/hardware/phone-hardware.png"
          alt=""
          aria-hidden="true"
        />
      </div>
      <p className="phone-presentation__caption">{label}</p>
    </article>
  );
}

export function SmartTDeviceShowcase() {
  return (
    <div className="device-showcase-v2" aria-label="The SmartT console across desktop and mobile">
      <DesktopConsoleReveal />

      <section className="showcase-section showcase-section--mobile">
        <div className="showcase-heading">
          <span>Mobile application</span>
          <h2>The same console, carried into the field.</h2>
          <p>
            Live map with selected-vehicle telemetry, vehicle tank history, and the evidence behind
            a critical fuel-loss event.
          </p>
        </div>
        <div className="phone-gallery">
          <RenderedPhone label="Live Map — vehicle selected">
            <FleetMapPhoneScreen />
          </RenderedPhone>
          <RenderedPhone label="Vehicle detail — 67LD-401.45">
            <VehicleTimelinePhoneScreen />
          </RenderedPhone>
          <RenderedPhone label="Alert evidence — EV-9731">
            <IncidentEvidencePhoneScreen />
          </RenderedPhone>
        </div>
      </section>
    </div>
  );
}
