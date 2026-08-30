import { ArrowLeft, Bell, ChevronRight, Crosshair, Layers, MapPin, Search } from "lucide-react";

import "./phone-workflow.css";

/* --------------------------------------------------------------------------
 * Every value below mirrors the official SmartT console
 * routes: /live-map selection panel, /vehicles/V-1031 vehicle detail and
 * /alerts?event=EV-9731 evidence view.
 * -------------------------------------------------------------------------- */

/** One shared status bar for all three screens: same height, same tone,
 *  laid out around the camera cutout so nothing ever hides behind it. */
function StatusBar() {
  return (
    <div className="sm-status" aria-hidden="true">
      <span className="sm-status__time">09:41</span>
      <span className="sm-status__cutout" />
      <span className="sm-status__icons">
        <span className="sm-status__signal">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="sm-status__battery" />
      </span>
    </div>
  );
}

/** iOS home indicator — keeps the clipped screen bottom looking deliberate. */
function HomeIndicator() {
  return <span className="sm-home" aria-hidden="true" />;
}

/* ========================================================================== */
/* PHONE 1 — LIVE MAP (map-first, selection sheet)                            */
/* ========================================================================== */

const MAP_STATUS_FILTERS = ["All statuses", "Moving", "Idling", "Parked"];

const SELECTED_VEHICLE = [
  ["Driver", "Tran Quoc Bao"],
  ["Model", "Isuzu FVR34"],
  ["Tank level", "51% · 102 L"],
  ["Speed", "69 km/h"],
  ["Ignition", "On"],
  ["Last telemetry", "3 min ago"],
];

export function FleetMapPhoneScreen() {
  return (
    <div className="sm-screen sm-screen--map">
      <StatusBar />

      <header className="sm-map-top">
        <div className="sm-map-top__row">
          <div className="sm-map-top__title">
            <span className="sm-eyebrow">GPS tracking</span>
            <h3>Live Map</h3>
          </div>
          <div className="sm-map-top__tools" aria-hidden="true">
            <span className="sm-icon-btn">
              <Search className="sm-icon" />
            </span>
            <span className="sm-icon-btn">
              <Layers className="sm-icon" />
            </span>
          </div>
        </div>
        <p className="sm-map-top__meta">28 of 28 vehicles shown — demonstration GPS snapshot</p>
        <div className="sm-filter-row">
          {MAP_STATUS_FILTERS.map((filter, index) => (
            <span key={filter} className={`sm-filter ${index === 0 ? "is-active" : ""}`}>
              {filter}
            </span>
          ))}
        </div>
      </header>

      <div className="sm-map">
        <img
          className="sm-map__tiles"
          src="/dashboard/map-fleet.webp"
          alt="SmartT demonstration map showing 28 vehicles across Vietnam"
          loading="lazy"
          decoding="async"
        />
        <span className="sm-map__focus" aria-hidden="true">
          <span className="sm-map__focus-dot" />
        </span>
        <span className="sm-icon-btn sm-map__locate" aria-hidden="true">
          <Crosshair className="sm-icon" />
        </span>
        <div className="sm-map__legend" aria-hidden="true">
          <span>
            <i className="sm-dot sm-dot--moving" />
            Moving
          </span>
          <span>
            <i className="sm-dot sm-dot--idling" />
            Idling
          </span>
          <span>
            <i className="sm-dot sm-dot--parked" />
            Parked
          </span>
        </div>
      </div>

      <section className="sm-sheet" aria-label="Vehicle summary">
        <span className="sm-sheet__grip" aria-hidden="true" />
        <div className="sm-sheet__head">
          <div>
            <p className="sm-plate">67LD-401.45</p>
            <p className="sm-sheet__where">
              <MapPin className="sm-icon sm-icon--xs" />
              Song Than Industrial Park, Binh Duong
            </p>
          </div>
          <span className="sm-chip sm-chip--moving">Moving</span>
        </div>

        <dl className="sm-kv">
          {SELECTED_VEHICLE.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <div className="sm-cta">
          Open vehicle detail
          <ChevronRight className="sm-icon sm-icon--xs" />
        </div>
      </section>

      <HomeIndicator />
    </div>
  );
}

/* ========================================================================== */
/* PHONE 2 — VEHICLE DETAIL (V-1031)                                          */
/* ========================================================================== */

/** 24h tank-level trace: refuel step up, shift consumption slope down. */
const TANK_PATH =
  "M0 46 L26 49 L52 53 L74 56 L96 58 L96 22 L120 24 L146 28 L172 33 L198 37 L224 42 L250 47 L276 52 L300 56";
const TANK_AREA = `${TANK_PATH} L300 96 L0 96 Z`;

const TELEMETRY_ROWS = [
  ["Speed", "69 km/h"],
  ["Ignition", "On"],
  ["Odometer", "381,120 km"],
  ["Engine hours", "2,511 h"],
  ["Fuel-level probe", "Reporting normally"],
  ["Telemetry link", "Online"],
];

const EVENT_HISTORY = [
  {
    type: "Fuel anomaly — overconsumption",
    body: "Consumption ran at 33.4 L/100km against a 29.8 L/100km baseline for the shift.",
    when: "09 Aug 18:26 · Long An Depot Yard",
    status: "New",
  },
];

export function VehicleTimelinePhoneScreen() {
  return (
    <div className="sm-screen sm-screen--vehicle">
      <StatusBar />

      <header className="sm-vhead">
        <div className="sm-vhead__nav">
          <span className="sm-icon-btn sm-icon-btn--ghost" aria-hidden="true">
            <ArrowLeft className="sm-icon" />
          </span>
          <span className="sm-eyebrow">Vehicle V-1031</span>
        </div>
        <p className="sm-plate sm-plate--lg">67LD-401.45</p>
        <p className="sm-vhead__sub">Isuzu FVR34 · Tran Quoc Bao · Long An Depot</p>
        <div className="sm-vhead__strip">
          <span className="sm-chip sm-chip--moving">Moving</span>
          <span>Tank 51% · 102 L</span>
          <span>Updated 3 min ago</span>
        </div>
      </header>

      <main className="sm-vbody">
        <section className="sm-panel sm-panel--flush">
          <div className="sm-panel__head">
            <div>
              <h4>Tank level over the last 24 hours</h4>
              <p>Step changes mark refuelling or sudden drops</p>
            </div>
          </div>
          <div className="sm-chart">
            <svg viewBox="0 0 300 96" preserveAspectRatio="none" aria-hidden="true">
              {[24, 48, 72].map((y) => (
                <line key={y} className="sm-chart__grid" x1="0" y1={y} x2="300" y2={y} />
              ))}
              <path className="sm-chart__area" d={TANK_AREA} />
              <path className="sm-chart__line" d={TANK_PATH} />
              <circle className="sm-chart__node" cx="96" cy="22" r="3" />
            </svg>
            <div className="sm-chart__axis">
              <span>00:00</span>
              <span>08:00</span>
              <span>16:00</span>
              <span>20:00</span>
            </div>
          </div>
          <p className="sm-chart__note">Refuelling: 266 L added at 08:12</p>
        </section>

        <section className="sm-metrics">
          <div className="sm-metric">
            <span>Fuel efficiency</span>
            <strong>
              33.1 <em>L/100km</em>
            </strong>
            <small className="is-up">+3.3 vs baseline 29.8</small>
          </div>
          <div className="sm-metric">
            <span>Idle fuel waste</span>
            <strong>
              11.3 <em>L</em>
            </strong>
            <small>327 idle minutes</small>
          </div>
          <div className="sm-metric">
            <span>Suspected fuel loss</span>
            <strong>
              0.0 <em>L</em>
            </strong>
            <small>0 events in the last 7 days</small>
          </div>
        </section>

        <section className="sm-panel">
          <div className="sm-panel__head">
            <div>
              <h4>Telemetry snapshot</h4>
              <p>Updated 3 min ago</p>
            </div>
          </div>
          <dl className="sm-rows">
            {TELEMETRY_ROWS.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="sm-panel">
          <div className="sm-panel__head">
            <div>
              <h4>Event history</h4>
              <p>5 events in the last 7 days</p>
            </div>
          </div>
          <ul className="sm-events">
            {EVENT_HISTORY.map((event) => (
              <li key={event.when}>
                <div className="sm-events__top">
                  <span className="sm-tag sm-tag--warning">Warning</span>
                  <span className="sm-events__status">{event.status}</span>
                </div>
                <p className="sm-events__type">{event.type}</p>
                <p className="sm-events__body">{event.body}</p>
                <p className="sm-events__when">{event.when}</p>
              </li>
            ))}
          </ul>
          <p className="sm-events__more">View all 5 events</p>
        </section>
      </main>

      <HomeIndicator />
    </div>
  );
}

/* ========================================================================== */
/* PHONE 3 — ALERT EVIDENCE (EV-9731)                                         */
/* ========================================================================== */

/** Event-day trace for 63F-431.20: flat while parked, then a 14% cliff at 14:00. */
const EVENT_PATH = "M0 20 L60 21 L112 22 L150 23 L150 51 L188 52 L240 53 L300 55";
const EVENT_AREA = `${EVENT_PATH} L300 86 L0 86 Z`;

const EVIDENCE = [
  ["Measurement", "58.0 L unaccounted"],
  ["Fuel level before", "92%"],
  ["Fuel level after", "78%"],
  ["Ignition at detection", "Off"],
  ["Speed at detection", "0 km/h"],
  ["GPS position", "10.0214, 105.7734"],
];

export function IncidentEvidencePhoneScreen() {
  return (
    <div className="sm-screen sm-screen--alert">
      <StatusBar />

      <header className="sm-ahead">
        <div className="sm-ahead__nav">
          <span className="sm-icon-btn sm-icon-btn--ghost" aria-hidden="true">
            <ArrowLeft className="sm-icon" />
          </span>
          <span className="sm-eyebrow">Alerts</span>
          <span className="sm-icon-btn sm-icon-btn--ghost" aria-hidden="true">
            <Bell className="sm-icon" />
          </span>
        </div>
        <span className="sm-tag sm-tag--critical">Critical</span>
        <h3>Suspected fuel loss</h3>
        <p className="sm-ahead__meta">EV-9731 · 07 Aug 14:00 · 63F-431.20 · Mai Van Tien</p>
        <p className="sm-ahead__body">
          Tank level fell 58 L in under 9 minutes while the engine was off and the vehicle
          stationary.
        </p>
      </header>

      <main className="sm-abody">
        <dl className="sm-evidence">
          {EVIDENCE.map(([label, value], index) => (
            <div key={label} className={index === 0 ? "is-lead" : index === 5 ? "is-wide" : ""}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <section className="sm-panel sm-panel--flush">
          <div className="sm-panel__head">
            <div>
              <h4>Event-day fuel trend</h4>
              <p>63F-431.20 — 07 Aug evidence window</p>
            </div>
          </div>
          <div className="sm-chart sm-chart--alert">
            <svg viewBox="0 0 300 86" preserveAspectRatio="none" aria-hidden="true">
              {[22, 44, 66].map((y) => (
                <line key={y} className="sm-chart__grid" x1="0" y1={y} x2="300" y2={y} />
              ))}
              <path className="sm-chart__area" d={EVENT_AREA} />
              <path className="sm-chart__line" d={EVENT_PATH} />
              <line className="sm-chart__marker" x1="150" y1="8" x2="150" y2="80" />
              <circle className="sm-chart__node sm-chart__node--alert" cx="150" cy="51" r="3" />
            </svg>
            <div className="sm-chart__axis">
              <span>00:00</span>
              <span>08:00</span>
              <span>14:00</span>
              <span>20:00</span>
            </div>
          </div>
        </section>

        <figure className="sm-geo">
          <img
            src="/dashboard/map-event.webp"
            alt="GPS position recorded at detection time near Can Tho Depot Yard"
            loading="lazy"
            decoding="async"
          />
          <figcaption>
            <MapPin className="sm-icon sm-icon--xs" />
            Can Tho Depot Yard — GPS position at detection time
          </figcaption>
        </figure>

        <div className="sm-actions">
          <span className="sm-actions__primary">Mark verified</span>
          <span className="sm-actions__ghost">Dismiss</span>
        </div>
      </main>

      <HomeIndicator />
    </div>
  );
}
