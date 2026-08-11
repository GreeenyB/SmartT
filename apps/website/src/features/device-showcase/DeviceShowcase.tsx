import { useState, type ReactNode } from "react";

import "./device-showcase.css";
import { DASHBOARD_URL } from "@/lib/dashboard-url";
import {
  FleetMapPhoneScreen,
  IncidentEvidencePhoneScreen,
  VehicleTimelinePhoneScreen,
} from "./PhoneWorkflow";

/** Official SmartT console — single source of truth for every product screen. */

/**
 * The laptop shows a faithful capture of the console rendered at 1440x900 and
 * scaled uniformly into the calibrated screen cutout (1008 x 662, same ratio),
 * so the desktop sidebar, header and card grid keep their real proportions.
 */
function RenderedLaptop() {
  const [hovered, setHovered] = useState(false);

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
        <a
          className="dashboard-portal"
          href={DASHBOARD_URL}
          target="_blank"
          rel="noreferrer"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
        >
          <span className="dashboard-portal__veil" aria-hidden="true" />
          <span className="dashboard-portal__copy" aria-hidden={!hovered}>
            <strong>Open SmartT Console</strong>
            <span aria-hidden="true">↗</span>
          </span>
        </a>
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
      <section className="showcase-section showcase-section--desktop">
        <div className="showcase-heading">
          <span>Desktop console</span>
          <h2>Fuel and fleet context in one operations workspace.</h2>
          <p>
            Fleet fuel efficiency against baseline, suspected fuel loss, idle waste and open alerts
            — reviewed across 28 telemetry units.
          </p>
        </div>
        <RenderedLaptop />
      </section>

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
