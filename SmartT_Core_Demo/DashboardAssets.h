#pragma once

#include <Arduino.h>
#include <pgmspace.h>

const char DASHBOARD_HTML[] PROGMEM = R"SMARTT_HTML(
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>SmartT Fleet Fuel Intelligence</title>
    <link rel="stylesheet" href="style.css">
    <script src="app.js" defer></script>
  </head>
  <body>
    <div class="app-shell">
      <header class="app-header">
        <a class="brand" href="#overview" aria-label="SmartT home">
          <span class="brand-mark" aria-hidden="true">ST</span>
          <span>
            <strong>SmartT</strong>
            <small>Fuel Intelligence</small>
          </span>
        </a>

        <nav class="section-tabs" aria-label="Dashboard sections">
          <a href="#overview" class="tab-link is-active" data-section="overview" aria-current="page">Overview</a>
          <a href="#evidence" class="tab-link" data-section="evidence">Evidence</a>
          <a href="#telemetry" class="tab-link" data-section="telemetry">Telemetry</a>
          <a href="#events" class="tab-link" data-section="events">Events</a>
        </nav>

        <div class="header-status" aria-label="Current monitored asset">
          <div>
            <span>Vehicle</span>
            <strong id="vehicleId">TRUCK_01</strong>
          </div>
          <div>
            <span>Updated</span>
            <strong id="lastUpdate">--:--</strong>
          </div>
        </div>

        <div class="online-status" id="connectionStatus" aria-label="Connection status">
          <span class="status-dot" aria-hidden="true"></span>
          <span>Online</span>
        </div>
      </header>

      <main class="content">
        <section class="page-section overview-grid nav-section" id="overview" aria-label="Fleet overview">
          <article class="panel fuel-overview">
            <div class="panel-heading fuel-heading">
              <h2>Fuel Level</h2>
              <span class="state-badge" id="fuelStatus">Normal</span>
            </div>

            <div class="fuel-summary">
              <div class="fuel-value" aria-label="Current fuel percentage">
                <strong id="fuelPercent">--</strong>
                <span>%</span>
              </div>
              <div class="fuel-side">
                <dl>
                  <div>
                    <dt>Estimated volume</dt>
                    <dd id="fuelLiters">-- L</dd>
                  </div>
                  <div>
                    <dt>Tank capacity</dt>
                    <dd id="tankCapacity">-- L</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div class="tank-track" aria-hidden="true">
              <div class="tank-fill" id="fuelBar"></div>
              <span style="left:25%"></span>
              <span style="left:50%"></span>
              <span style="left:75%"></span>
            </div>

            <div class="decision-strip" id="decisionStrip">
              <div>
                <span>Decision</span>
                <strong id="decisionTitle">Normal</strong>
              </div>
              <div>
                <span>Rule</span>
                <strong id="ruleResult">Stable trend</strong>
              </div>
              <div>
                <span>Confidence</span>
                <strong id="confidenceValue">--%</strong>
              </div>
            </div>
          </article>

          <article class="panel context-panel">
            <div class="panel-heading simple">
              <h2>Vehicle context</h2>
              <button class="state-toggle" id="ignitionToggle" type="button" aria-pressed="false">Ignition OFF</button>
            </div>

            <dl class="context-list">
              <div>
                <dt>Ignition</dt>
                <dd id="ignitionState">--</dd>
              </div>
              <div>
                <dt>Speed</dt>
                <dd id="speedValue">-- km/h</dd>
              </div>
              <div>
                <dt>GPS state</dt>
                <dd id="gpsState">--</dd>
              </div>
              <div>
                <dt>Motion</dt>
                <dd id="gpsMotion">--</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd id="gpsLocation">--</dd>
              </div>
              <div>
                <dt>GPS decision</dt>
                <dd id="gpsDecisionContext">--</dd>
              </div>
              <div>
                <dt>Zone</dt>
                <dd id="geoZone">--</dd>
              </div>
              <div>
                <dt>Fuel source</dt>
                <dd id="dataSource">Fuel Sensor</dd>
              </div>
            </dl>
          </article>
        </section>

        <section class="page-section nav-section" id="evidence" aria-label="Anomaly evidence">
          <article class="panel evidence-panel">
            <div class="panel-heading simple">
              <h2>Evidence</h2>
              <span class="alert-code" id="alertCode">NORMAL</span>
            </div>

            <div class="evidence-table" role="table" aria-label="Anomaly evidence table">
              <div class="evidence-row header" role="row">
                <span role="columnheader">Fuel delta</span>
                <span role="columnheader">Ignition</span>
                <span role="columnheader">Speed</span>
                <span role="columnheader">GPS</span>
                <span role="columnheader">Motion</span>
                <span role="columnheader">GPS used</span>
                <span role="columnheader">Location</span>
                <span role="columnheader">Result</span>
              </div>
              <div class="evidence-row" role="row">
                <strong id="evidenceFuelDelta" role="cell">--</strong>
                <strong id="evidenceIgnitionText" role="cell">--</strong>
                <strong id="evidenceSpeedText" role="cell">--</strong>
                <strong id="evidenceGpsText" role="cell">--</strong>
                <strong id="evidenceGpsMotionText" role="cell">--</strong>
                <strong id="evidenceGpsUsedText" role="cell">--</strong>
                <strong id="evidenceLocationText" role="cell">--</strong>
                <strong id="evidenceResult" role="cell">--</strong>
              </div>
            </div>
          </article>
        </section>

        <section class="page-section nav-section" id="telemetry" aria-label="Fuel telemetry">
          <article class="panel telemetry-panel">
            <div class="panel-heading simple">
              <h2>Fuel signal</h2>
              <div class="legend" aria-label="Signal legend">
                <span><i class="raw-key"></i>Raw</span>
                <span><i class="filtered-key"></i>Filtered</span>
              </div>
            </div>

            <div class="telemetry-meta">
              <dl>
                <div>
                  <dt>Filtered</dt>
                  <dd id="filteredFuelValue">--%</dd>
                </div>
                <div>
                  <dt>Raw</dt>
                  <dd id="rawFuelValue">--%</dd>
                </div>
                <div>
                  <dt>Change</dt>
                  <dd id="fuelDelta">-- L</dd>
                </div>
                <div>
                  <dt>Signal stability</dt>
                  <dd id="signalStability">--</dd>
                </div>
              </dl>
            </div>

            <div class="chart-shell" aria-label="Recent fuel signal trend">
              <svg id="signalChart" viewBox="0 0 760 260" role="img">
                <defs>
                  <linearGradient id="fuelAreaGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="#11aebc" stop-opacity="0.16"></stop>
                    <stop offset="100%" stop-color="#11aebc" stop-opacity="0.01"></stop>
                  </linearGradient>
                </defs>
                <line class="chart-grid" x1="0" y1="52" x2="760" y2="52"></line>
                <line class="chart-grid" x1="0" y1="104" x2="760" y2="104"></line>
                <line class="chart-grid" x1="0" y1="156" x2="760" y2="156"></line>
                <line class="chart-grid" x1="0" y1="208" x2="760" y2="208"></line>
                <polygon id="filteredArea" class="filtered-area" points=""></polygon>
                <polyline id="rawLine" class="raw-line" points=""></polyline>
                <polyline id="filteredLine" class="filtered-line" points=""></polyline>
              </svg>
            </div>
          </article>
        </section>

        <section class="page-section events-grid nav-section" id="events" aria-label="Events and actions">
          <article class="panel events-panel">
            <div class="panel-heading simple">
              <h2>Events</h2>
            </div>
            <ol class="event-log" id="eventLog"></ol>
          </article>

          <article class="panel actions-panel">
            <div class="panel-heading simple">
              <h2>Event review</h2>
            </div>
            <div class="action-grid">
              <button class="action-btn" id="normalBtn" type="button">Mark normal</button>
              <button class="action-btn" id="refuelBtn" type="button">Mark refuel</button>
              <button class="action-btn" id="noiseBtn" type="button">Mark sloshing</button>
              <button class="action-btn danger" id="theftBtn" type="button">Flag theft</button>
              <button class="action-btn" id="resetBtn" type="button">Clear</button>
            </div>
          </article>
        </section>
      </main>
    </div>
  </body>
</html>

)SMARTT_HTML";

const char DASHBOARD_CSS[] PROGMEM = R"SMARTT_CSS(
:root {
  color-scheme: light;
  --bg: #f4f8fb;
  --surface: #ffffff;
  --surface-subtle: #f8fbfc;
  --text: #123044;
  --navy: #061f33;
  --muted: #607788;
  --muted-2: #8ba0ad;
  --line: #dbe8ee;
  --line-soft: #edf3f6;
  --accent: #0c8fa2;
  --accent-2: #11aebc;
  --accent-soft: #e5f8fa;
  --success: #0f7b5d;
  --success-soft: #e8f7f0;
  --warning: #af6b00;
  --warning-soft: #fff5e4;
  --danger: #c43c36;
  --danger-soft: #fff1f0;
  --shadow: 0 18px 46px rgba(9, 39, 58, 0.08);
  --radius-lg: 18px;
  --radius-md: 14px;
}

* { box-sizing: border-box; }

html {
  min-height: 100%;
  background: linear-gradient(180deg, #eef8fb 0%, var(--bg) 420px, #f7fafc 100%);
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-height: 100%;
  color: var(--text);
  background: transparent;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
  line-height: 1.45;
}

button { font: inherit; cursor: pointer; }

.app-shell {
  width: min(1360px, 100%);
  margin: 0 auto;
  padding: 22px;
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: auto minmax(280px, 1fr) auto auto;
  align-items: center;
  gap: 22px;
  min-height: 74px;
  padding: 10px 0 14px;
  border-bottom: 1px solid rgba(219, 232, 238, 0.88);
  background: rgba(244, 248, 251, 0.9);
  backdrop-filter: blur(16px);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 11px;
  color: inherit;
  text-decoration: none;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 60px;
  height: 60px;
  border-radius: 18px;
  color: #ffffff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  box-shadow: 0 12px 24px rgba(17, 174, 188, 0.20);
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 0;
}

.brand span { display: grid; gap: 1px; }
.brand strong { color: var(--navy); font-size: 24px; line-height: 1; letter-spacing: -0.04em; }
.brand small { color: var(--muted); font-size: 12px; font-weight: 800; letter-spacing: 0.11em; text-transform: uppercase; }

.section-tabs {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.tab-link {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-height: 42px;
  padding: 0 14px;
  color: var(--muted);
  font-size: 14px;
  font-weight: 760;
  text-decoration: none;
}

.tab-link::after {
  content: "";
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 0;
  height: 2px;
  background: transparent;
}

.tab-link:hover,
.tab-link:focus-visible,
.tab-link.is-active { color: var(--navy); outline: none; }
.tab-link.is-active::after { background: var(--accent-2); }

.header-status {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 22px;
}

.header-status > div {
  display: grid;
  gap: 1px;
  min-width: 72px;
}

.header-status span,
dt,
.section-kicker {
  color: var(--muted-2);
  font-size: 11px;
  font-weight: 780;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.header-status strong { color: var(--navy); font-size: 14px; font-weight: 850; }
.online-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  justify-self: end;
  gap: 10px;
  min-height: 36px;
  padding: 7px 13px;
  color: var(--success);
  background: var(--success-soft);
  border: 1px solid rgba(15, 123, 93, 0.22);
  border-radius: 999px;
  font-size: 14px;
  font-weight: 850;
  white-space: nowrap;
}

.status-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  background: var(--success);
  border-radius: 50%;
  box-shadow: 0 0 0 4px rgba(15, 123, 93, 0.13);
}

.content { padding-top: 26px; }

.page-section { scroll-margin-top: 96px; margin-bottom: 18px; }

.overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(330px, 0.8fr);
  gap: 18px;
}

.events-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.55fr);
  gap: 18px;
}

.panel {
  min-width: 0;
  padding: 24px;
  border: 1px solid rgba(219, 232, 238, 0.92);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: var(--shadow);
}

.fuel-overview { min-height: 438px; }
.context-panel { min-height: 438px; }

.panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}

.panel-heading.simple { align-items: center; margin-bottom: 18px; }
.fuel-heading {
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.panel-heading h1,
.panel-heading h2 { margin: 0; color: var(--navy); line-height: 1.08; letter-spacing: -0.045em; }
.panel-heading h1 { margin-top: 5px; font-size: clamp(30px, 4vw, 48px); }
.panel-heading h2 { font-size: 21px; }

.state-badge,
.alert-code {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 6px 11px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  background: var(--surface-subtle);
  font-size: 12px;
  font-weight: 850;
  white-space: nowrap;
}

.state-badge.normal,
.alert-code.normal { color: var(--success); border-color: rgba(15, 123, 93, 0.20); background: var(--success-soft); }
.state-badge.refuel,
.state-badge.noise,
.alert-code.refuel,
.alert-code.noise { color: var(--warning); border-color: rgba(175, 107, 0, 0.22); background: var(--warning-soft); }
.state-badge.theft,
.alert-code.theft { color: var(--danger); border-color: rgba(196, 60, 54, 0.24); background: var(--danger-soft); }

.fuel-summary {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 28px;
  margin: 6px 0 24px;
}

.fuel-value {
  display: flex;
  align-items: baseline;
  gap: 28px;
}

.fuel-value strong {
  color: var(--navy);
  font-size: clamp(90px, 12vw, 136px);
  line-height: 0.86;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
}

.fuel-value span {
  color: var(--muted);
  font-size: 32px;
  font-weight: 850;
  transform: translateY(-0.10em);
}

.fuel-side { min-width: 210px; }
.fuel-side dl,
.telemetry-meta dl {
  display: grid;
  gap: 0;
  margin: 0;
}

.fuel-side dl div,
.context-list div,
.telemetry-meta dl div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line-soft);
}

.fuel-side dl div:first-child,
.context-list div:first-child,
.telemetry-meta dl div:first-child { border-top: 1px solid var(--line-soft); }

dd { margin: 0; color: var(--navy); font-size: 17px; font-weight: 850; text-align: right; }

.tank-track {
  position: relative;
  height: 34px;
  overflow: hidden;
  border: 1px solid #cde2e8;
  border-radius: 999px;
  background: #eaf3f7;
}

.tank-fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: 0%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
  transition: width 240ms ease;
}

.tank-track span {
  position: absolute;
  top: 7px;
  bottom: 7px;
  width: 1px;
  background: rgba(6, 31, 51, 0.15);
}

.decision-strip {
  display: grid;
  grid-template-columns: 1.1fr 1fr 0.75fr;
  gap: 0;
  margin-top: 22px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-left: 4px solid var(--success);
  border-radius: var(--radius-md);
  background: var(--surface-subtle);
}

.decision-strip.refuel,
.decision-strip.noise { border-left-color: var(--warning); }
.decision-strip.theft { border-left-color: var(--danger); }

.decision-strip div { padding: 14px 16px; border-left: 1px solid var(--line-soft); }
.decision-strip div:first-child { border-left: 0; }
.decision-strip span { display: block; color: var(--muted-2); font-size: 11px; font-weight: 780; letter-spacing: 0.08em; text-transform: uppercase; }
.decision-strip strong { display: block; margin-top: 5px; color: var(--navy); font-size: 18px; line-height: 1.15; }

.state-toggle {
  min-height: 34px;
  padding: 6px 11px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  background: var(--surface-subtle);
  font-size: 12px;
  font-weight: 850;
}
.state-toggle.is-on { color: var(--accent); border-color: rgba(17, 174, 188, 0.32); background: var(--accent-soft); }
.state-toggle:hover,
.state-toggle:focus-visible,
.action-btn:hover,
.action-btn:focus-visible { outline: 3px solid rgba(17, 174, 188, 0.18); outline-offset: 1px; }

.context-list { display: grid; gap: 0; margin: 0; }

.evidence-table {
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
}

.evidence-row {
  display: grid;
  grid-template-columns: 0.8fr 0.65fr 0.65fr 0.75fr 0.9fr 0.75fr 1fr 1.15fr;
  min-width: 1120px;
}

.evidence-row > * {
  min-width: 0;
  padding: 15px 16px;
  border-left: 1px solid var(--line-soft);
}
.evidence-row > *:first-child { border-left: 0; }
.evidence-row.header { background: #f8fbfc; border-bottom: 1px solid var(--line); }
.evidence-row.header span { color: var(--muted-2); font-size: 11px; font-weight: 780; letter-spacing: 0.08em; text-transform: uppercase; }
.evidence-row strong { color: var(--navy); font-size: 16px; font-weight: 850; }
.evidence-row.refuel strong:first-child,
.evidence-row.noise strong:first-child { color: var(--warning); }
.evidence-row.theft strong { color: var(--danger); }
.evidence-row.normal strong:first-child { color: var(--success); }

.telemetry-panel { padding-bottom: 20px; }
.legend { display: inline-flex; align-items: center; gap: 14px; color: var(--muted); font-size: 13px; font-weight: 760; }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend i { width: 18px; height: 3px; border-radius: 99px; }
.raw-key { background: #98aab4; }
.filtered-key { background: var(--accent-2); }

.telemetry-meta dl {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 26px;
  margin-bottom: 16px;
}
.telemetry-meta dl div { display: block; border-top: 0 !important; padding: 0 0 12px; }
.telemetry-meta dd { margin-top: 4px; text-align: left; }

.chart-shell {
  height: 340px;
  padding: 12px 0 0;
}
svg { display: block; width: 100%; height: 100%; overflow: visible; }
.chart-grid { stroke: #e2edf2; stroke-width: 1; }
.filtered-area { fill: url(#fuelAreaGradient); }
.raw-line,
.filtered-line { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.raw-line { stroke: #98aab4; stroke-width: 1.8; opacity: 0.82; }
.filtered-line { stroke: var(--accent-2); stroke-width: 3; }

.event-log { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.event-log li { display: grid; grid-template-columns: 86px 1fr; gap: 14px; align-items: center; min-height: 50px; padding: 12px 0; border-bottom: 1px solid var(--line-soft); }
.event-log li:first-child { border-top: 1px solid var(--line-soft); }
.event-log time { color: var(--muted-2); font-size: 12px; font-weight: 780; }
.event-log span { min-width: 0; color: var(--text); font-size: 14px; font-weight: 760; }

.action-grid { display: grid; grid-template-columns: 1fr; gap: 9px; }
.action-btn {
  min-height: 42px;
  padding: 9px 13px;
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--text);
  background: #f9fcfd;
  font-size: 14px;
  font-weight: 800;
  text-align: left;
}
.action-btn.is-active { color: var(--accent); border-color: rgba(17, 174, 188, 0.35); background: var(--accent-soft); }
.action-btn.danger.is-active { color: var(--danger); border-color: rgba(196, 60, 54, 0.25); background: var(--danger-soft); }

@media (max-width: 1040px) {
  .app-header { grid-template-columns: 1fr; align-items: start; }
  .section-tabs { justify-content: flex-start; overflow-x: auto; padding-bottom: 3px; }
  .header-status { justify-content: flex-start; flex-wrap: wrap; }
  .overview-grid,
  .events-grid { grid-template-columns: 1fr; }
  .fuel-overview,
  .context-panel { min-height: auto; }
}

@media (max-width: 720px) {
  .app-shell { padding: 14px; }
  .app-header { min-height: auto; gap: 12px; padding-bottom: 12px; }
  .brand-mark { width: 48px; height: 48px; border-radius: 15px; font-size: 16px; }
  .header-status { gap: 12px; }
  .content { padding-top: 16px; }
  .panel { padding: 18px; border-radius: 16px; }
  .panel-heading { align-items: flex-start; flex-direction: column; }
  .fuel-summary { align-items: flex-start; flex-direction: column; gap: 16px; }
  .fuel-side { width: 100%; min-width: 0; }
  .fuel-value strong { font-size: clamp(78px, 24vw, 108px); }
  .decision-strip { grid-template-columns: 1fr; }
  .decision-strip div { border-left: 0; border-top: 1px solid var(--line-soft); }
  .decision-strip div:first-child { border-top: 0; }
  .telemetry-meta dl { grid-template-columns: 1fr; gap: 8px; }
  .chart-shell { height: 250px; }
}

.online-status.offline {
  color: var(--danger);
  background: var(--danger-soft);
  border-color: rgba(196, 60, 54, 0.24);
}

.online-status.offline .status-dot {
  background: var(--danger);
  box-shadow: 0 0 0 4px rgba(196, 60, 54, 0.13);
}

.state-toggle[aria-disabled="true"] {
  cursor: default;
}
)SMARTT_CSS";

const char DASHBOARD_JS[] PROGMEM = R"SMARTT_JS(
(function () {
  "use strict";

  var config = {
    vehicleId: "TRUCK_01",
    tankLiters: 180,
    dataSource: "Fuel Sensor",
    maxLogItems: 6,
    historySize: 68,
    chartWidth: 760,
    chartHeight: 260
  };

  var copy = {
    normal: {
      status: "Normal",
      code: "NORMAL",
      decision: "Normal",
      rule: "Stable trend",
      result: "No anomaly",
      confidence: 94
    },
    refuel: {
      status: "Refuel",
      code: "REFUEL",
      decision: "Refuel",
      rule: "Positive delta",
      result: "Fuel added",
      confidence: 91
    },
    noise: {
      status: "Sloshing",
      code: "NOISE",
      decision: "Sloshing",
      rule: "Filtered fluctuation",
      result: "Signal noise",
      confidence: 79
    },
    theft: {
      status: "Theft suspected",
      code: "THEFT",
      decision: "Theft suspected",
      rule: "Stationary drop",
      result: "Fuel drop confirmed",
      confidence: 96
    }
  };

  var state = {
    mode: "normal",
    active: copy.normal,
    vehicleId: config.vehicleId,
    ignitionOn: false,
    speedKmh: 0,
    gpsState: "Unavailable",
    gpsMotion: "UNKNOWN",
    gpsDecisionContext: "GPS_NOT_USED",
    gpsUsedInDecision: false,
    gpsLocation: "--",
    geoZone: "--",
    dataSource: config.dataSource,
    tankLiters: config.tankLiters,
    fuelLiters: 0,
    baselinePct: 0,
    deltaPct: 0,
    deltaLiters: 0,
    signalStability: 100,
    sloshingScore: 0,
    rawFuelPct: 0,
    filteredFuelPct: 0,
    history: [],
    events: [],
    reviewMode: "",
    lastEventKey: "",
    online: false,
    initialized: false
  };

  var elements = {};
  var navLinks = [];
  var pollTimer = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function numberOr(value, fallback) {
    var number = Number(value);
    return isFinite(number) ? number : fallback;
  }

  function pct(value) {
    return clamp(numberOr(value, 0), 0, 100);
  }

  function formatNumber(value, digits) {
    return numberOr(value, 0).toFixed(digits);
  }

  function nowTime() {
    return new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function shortTime() {
    return new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function litersFromPercent(percent) {
    return percent * state.tankLiters / 100;
  }

  function signedLiters(value) {
    var sign = value > 0 ? "+" : "";
    return sign + formatNumber(value, 1) + " L";
  }

  function addEvent(message) {
    if (!message) return;

    state.events.unshift({
      time: nowTime(),
      message: message
    });

    if (state.events.length > config.maxLogItems) {
      state.events.length = config.maxLogItems;
    }
  }

  function classByMode(mode) {
    if (mode === "theft") return "theft";
    if (mode === "refuel") return "refuel";
    if (mode === "noise") return "noise";
    return "normal";
  }

  function applyClass(element, baseClass, modifier) {
    element.className = baseClass;
    if (modifier) element.classList.add(modifier);
  }

  function cleanText(value, fallback) {
    var text = String(value || fallback || "--");
    if (/prototype|mvp|demo|simulation|local mock|round 2|arduino|esp32|ads1115|oled-ready/i.test(text)) {
      return fallback || "--";
    }
    return text;
  }

  function displayVehicleId(value) {
    return cleanText(value, config.vehicleId);
  }

  function friendlyEvent(code) {
    var map = {
      BOOT: "Starting",
      NORMAL: "Normal",
      ADS1115_MISSING: "Fuel signal unavailable",
      SENSOR_FAULT: "Fuel signal check",
      PARKED_SETTLING: "Parked settling",
      PARKED_MONITORING: "Parked monitor",
      SLOSHING_DETECTED: "Sloshing detected",
      FUEL_DROP_CANDIDATE: "Drop candidate",
      REFUEL_CANDIDATE: "Refuel candidate",
      REFUEL_EVENT: "Refuel detected",
      FAST_DROP_IGN_ON: "Fast drop",
      FUEL_DROP_WHILE_MOVING: "Fuel drop while moving",
      GPS_MOVING_IGN_OFF: "GPS moving, ignition off",
      GPS_UNAVAILABLE_FALLBACK: "GPS unavailable fallback",
      SUSPICIOUS_DROP: "Suspicious drop",
      TEST_BUTTON: "Manual alert"
    };

    code = String(code || "NORMAL");
    if (map[code]) return map[code];
    return code.replace(/ADS1115/g, "Fuel signal").replace(/OLED/g, "Display").replace(/ESP32|ARDUINO/g, "Device").replace(/_/g, " ");
  }

  function friendlyAlert(code) {
    var map = {
      NONE: "No alert",
      FUEL_THEFT_ANOMALY: "Fuel theft alert",
      FUEL_THEFT_TEST: "Fuel theft alert",
      DROP_TEST_IGN_ON: "Fuel drop alert"
    };

    code = String(code || "NONE");
    if (map[code]) return map[code];
    return code.replace(/_/g, " ");
  }

  function modeFromTelemetry(data) {
    var alert = String(data.alert || "NONE");
    var event = String(data.event || "NORMAL");

    if (alert !== "NONE") return "theft";
    if (event === "SUSPICIOUS_DROP" || event === "FUEL_DROP_CANDIDATE") return "theft";
    if (event === "REFUEL_EVENT" || event === "REFUEL_CANDIDATE") return "refuel";
    if (event === "SLOSHING_DETECTED" || event === "SENSOR_FAULT" || event === "ADS1115_MISSING" || event === "FUEL_DROP_WHILE_MOVING" || event === "GPS_MOVING_IGN_OFF") return "noise";
    return "normal";
  }

  function copyForTelemetry(data, mode) {
    var active = {
      status: copy[mode].status,
      code: copy[mode].code,
      decision: copy[mode].decision,
      rule: copy[mode].rule,
      result: copy[mode].result,
      confidence: copy[mode].confidence
    };
    var event = String(data.event || "NORMAL");
    var alert = String(data.alert || "NONE");
    var confidence = clamp(numberOr(data.anomaly_confidence, active.confidence), 0, 100);

    active.confidence = Math.round(confidence);

    if (alert !== "NONE") {
      active.status = friendlyAlert(alert);
      active.code = "THEFT";
      active.decision = friendlyAlert(alert);
      active.rule = data.ignition === "ON" ? "Rapid drop" : "Stationary drop";
      active.result = "Fuel drop confirmed";
      return active;
    }

    if (event === "SENSOR_FAULT" || event === "ADS1115_MISSING") {
      active.status = "Signal check";
      active.code = "SIGNAL";
      active.decision = "Signal check";
      active.rule = "Sensor availability";
      active.result = "Needs inspection";
      active.confidence = 0;
      return active;
    }

    if (event === "FUEL_DROP_WHILE_MOVING" || event === "GPS_MOVING_IGN_OFF") {
      active.status = "Motion context";
      active.code = "GPS";
      active.decision = friendlyEvent(event);
      active.rule = "GPS motion context";
      active.result = cleanText(data.gps_decision_context, "Parked theft suppressed");
      active.confidence = 0;
      return active;
    }

    if (event === "SLOSHING_DETECTED") {
      active.status = "Sloshing";
      active.code = "NOISE";
      active.decision = "Sloshing detected";
      active.rule = cleanText(data.rule_result, "Signal unstable");
      active.result = "Signal noise";
      return active;
    }

    if (mode === "normal" && event !== "NORMAL") {
      active.decision = friendlyEvent(event);
      active.result = "Monitoring";
    }

    return active;
  }

  function buildPolyline(values, key) {
    if (!values.length) return "";

    var lastIndex = Math.max(values.length - 1, 1);
    return values.map(function (item, index) {
      var x = (index / lastIndex) * config.chartWidth;
      var y = config.chartHeight - (clamp(item[key], 0, 100) / 100) * config.chartHeight;
      return formatNumber(x, 1) + "," + formatNumber(y, 1);
    }).join(" ");
  }

  function buildArea(values, key) {
    var line = buildPolyline(values, key);
    if (!line) return "";
    return "0," + config.chartHeight + " " + line + " " + config.chartWidth + "," + config.chartHeight;
  }

  function renderLog() {
    elements.eventLog.innerHTML = "";

    state.events.forEach(function (event) {
      var item = document.createElement("li");
      var time = document.createElement("time");
      var text = document.createElement("span");

      time.textContent = event.time;
      text.textContent = event.message;
      item.appendChild(time);
      item.appendChild(text);
      elements.eventLog.appendChild(item);
    });
  }

  function renderActions() {
    var buttonMap = {
      normal: elements.normalBtn,
      refuel: elements.refuelBtn,
      noise: elements.noiseBtn,
      theft: elements.theftBtn
    };
    var activeMode = state.reviewMode || state.mode;

    Object.keys(buttonMap).forEach(function (key) {
      buttonMap[key].classList.toggle("is-active", key === activeMode);
    });

    elements.ignitionToggle.classList.toggle("is-on", state.ignitionOn);
    elements.ignitionToggle.setAttribute("aria-pressed", String(state.ignitionOn));
    elements.ignitionToggle.setAttribute("aria-disabled", "true");
    elements.ignitionToggle.textContent = state.ignitionOn ? "Ignition ON" : "Ignition OFF";
  }

  function renderConnection() {
    elements.connectionStatus.classList.toggle("offline", !state.online);
    elements.connectionStatus.children[1].textContent = state.online ? "Online" : "Offline";
  }

  function render() {
    var active = state.active;
    var mode = classByMode(state.mode);
    var filtered = clamp(state.filteredFuelPct, 0, 100);

    renderConnection();

    elements.vehicleId.textContent = state.vehicleId;
    elements.lastUpdate.textContent = state.online ? shortTime() : "--:--";
    elements.fuelPercent.textContent = Math.round(filtered);
    elements.fuelLiters.textContent = formatNumber(state.fuelLiters, 1) + " L";
    elements.tankCapacity.textContent = formatNumber(state.tankLiters, 0) + " L";
    elements.fuelBar.style.width = filtered + "%";

    elements.fuelStatus.textContent = active.status;
    applyClass(elements.fuelStatus, "state-badge", mode);

    elements.decisionTitle.textContent = active.decision;
    elements.ruleResult.textContent = active.rule;
    elements.confidenceValue.textContent = active.confidence + "%";
    applyClass(elements.decisionStrip, "decision-strip", mode);

    elements.ignitionState.textContent = state.ignitionOn ? "ON" : "OFF";
    elements.speedValue.textContent = Math.round(state.speedKmh) + " km/h";
    elements.gpsState.textContent = state.gpsState;
    elements.gpsMotion.textContent = state.gpsMotion;
    elements.gpsLocation.textContent = state.gpsLocation;
    elements.gpsDecisionContext.textContent = state.gpsDecisionContext;
    elements.geoZone.textContent = state.geoZone;
    elements.dataSource.textContent = state.dataSource;

    elements.alertCode.textContent = active.code;
    applyClass(elements.alertCode, "alert-code", mode);

    elements.evidenceFuelDelta.textContent = signedLiters(state.deltaLiters);
    elements.evidenceIgnitionText.textContent = state.ignitionOn ? "ON" : "OFF";
    elements.evidenceSpeedText.textContent = Math.round(state.speedKmh) + " km/h";
    elements.evidenceGpsText.textContent = state.gpsState;
    elements.evidenceGpsMotionText.textContent = state.gpsMotion;
    elements.evidenceGpsUsedText.textContent = state.gpsUsedInDecision ? "YES" : "NO";
    elements.evidenceLocationText.textContent = state.geoZone;
    elements.evidenceResult.textContent = active.result;
    applyClass(elements.evidenceRow, "evidence-row", mode);

    elements.filteredFuelValue.textContent = formatNumber(state.filteredFuelPct, 1) + "%";
    elements.rawFuelValue.textContent = formatNumber(state.rawFuelPct, 1) + "%";
    elements.fuelDelta.textContent = signedLiters(state.deltaLiters);
    elements.signalStability.textContent = Math.round(state.signalStability) + "%";

    elements.rawLine.setAttribute("points", buildPolyline(state.history, "raw"));
    elements.filteredLine.setAttribute("points", buildPolyline(state.history, "filtered"));
    elements.filteredArea.setAttribute("points", buildArea(state.history, "filtered"));

    renderActions();
    renderLog();
  }

  function setActiveNav(sectionId) {
    navLinks.forEach(function (link) {
      var isActive = link.getAttribute("data-section") === sectionId;
      link.classList.toggle("is-active", isActive);

      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function setupNavigation() {
    navLinks = Array.prototype.slice.call(document.querySelectorAll(".tab-link[data-section]"));

    navLinks.forEach(function (link) {
      link.addEventListener("click", function (event) {
        var sectionId = link.getAttribute("data-section");
        var target = document.getElementById(sectionId);
        if (!target) return;

        event.preventDefault();
        setActiveNav(sectionId);
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    if ("IntersectionObserver" in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            setActiveNav(entry.target.id);
          }
        });
      }, {
        root: null,
        rootMargin: "-36% 0px -54% 0px",
        threshold: 0
      });

      document.querySelectorAll(".nav-section").forEach(function (section) {
        observer.observe(section);
      });
    }
  }

  function noteTelemetryEvent(data, active) {
    if (Array.isArray(data.recent_events)) {
      return;
    }

    var alert = String(data.alert || "NONE");
    var event = String(data.event || "NORMAL");
    var key = alert + ":" + event + ":" + active.code;
    var message = alert !== "NONE" ? friendlyAlert(alert) : friendlyEvent(event);

    if (!state.initialized) {
      addEvent("Telemetry online");
      state.initialized = true;
      state.lastEventKey = key;
      return;
    }

    if (key !== state.lastEventKey && message !== "Normal") {
      addEvent(message);
      state.lastEventKey = key;
    }
  }

  function applyServerEvents(data) {
    if (!Array.isArray(data.recent_events)) return false;

    state.events = data.recent_events.slice(0, config.maxLogItems).map(function (event) {
      var seconds = Math.round(numberOr(event.timestamp_ms, 0) / 1000);
      return {
        time: seconds > 0 ? seconds + "s" : "--",
        message: cleanText(event.message, "Fuel stable")
      };
    });

    return true;
  }

  function applyTelemetry(data) {
    var filtered = pct(data.fuel_percent_filtered);
    var raw = pct(data.fuel_percent_raw);
    var capacity = numberOr(data.tank_capacity_liters, config.tankLiters);
    var deltaPct = numberOr(data.fuel_delta_window, 0);
    var eventDeltaPct = numberOr(data.fuel_delta_percent, deltaPct);
    var mode = modeFromTelemetry(data);
    var active = copyForTelemetry(data, mode);

    state.mode = mode;
    state.active = active;
    state.vehicleId = displayVehicleId(data.vehicle_id);
    state.ignitionOn = String(data.ignition || "").toUpperCase() === "ON";
    state.speedKmh = Math.max(0, numberOr(data.speed_kmh, 0));
    state.gpsState = cleanText(data.gps_state, "Unavailable");
    state.gpsMotion = cleanText(data.gps_motion_state, "UNKNOWN");
    state.gpsDecisionContext = cleanText(data.gps_decision_context, "GPS_NOT_USED");
    state.gpsUsedInDecision = Boolean(data.gps_used_in_decision);
    state.gpsLocation = cleanText(data.gps_location, "--");
    state.geoZone = cleanText(data.geo_zone, "--");
    state.dataSource = cleanText(data.data_source, config.dataSource);
    state.tankLiters = capacity > 0 ? capacity : config.tankLiters;
    state.filteredFuelPct = filtered;
    state.rawFuelPct = raw;
    state.fuelLiters = numberOr(data.fuel_liters, litersFromPercent(filtered));
    state.baselinePct = numberOr(data.parked_baseline_pct, filtered - deltaPct);
    state.deltaPct = eventDeltaPct;
    state.deltaLiters = numberOr(data.fuel_delta_liters, eventDeltaPct * state.tankLiters / 100);
    state.signalStability = clamp(numberOr(data.signal_stability, 100), 0, 100);
    state.sloshingScore = clamp(numberOr(data.sloshing_score, 0), 0, 100);
    state.online = true;

    state.history.push({
      raw: raw,
      filtered: filtered
    });

    if (state.history.length > config.historySize) {
      state.history.shift();
    }

    if (!applyServerEvents(data)) {
      noteTelemetryEvent(data, active);
    }
  }

  function markOffline() {
    if (state.online) {
      addEvent("Telemetry offline");
    }
    state.online = false;
    render();
  }

  function selectReview(mode) {
    state.reviewMode = state.reviewMode === mode ? "" : mode;
    if (state.reviewMode) {
      addEvent("Review marked " + copy[state.reviewMode].decision.toLowerCase());
    }
    render();
  }

  function clearReview() {
    state.reviewMode = "";
    state.events = [];
    addEvent("Event review cleared");
    render();
  }

  function cacheElements() {
    [
      "vehicleId",
      "connectionStatus",
      "lastUpdate",
      "fuelStatus",
      "fuelPercent",
      "fuelLiters",
      "tankCapacity",
      "fuelBar",
      "decisionStrip",
      "decisionTitle",
      "ruleResult",
      "confidenceValue",
      "ignitionToggle",
      "ignitionState",
      "speedValue",
      "gpsState",
      "gpsMotion",
      "gpsLocation",
      "gpsDecisionContext",
      "geoZone",
      "dataSource",
      "alertCode",
      "evidenceFuelDelta",
      "evidenceIgnitionText",
      "evidenceSpeedText",
      "evidenceGpsText",
      "evidenceGpsMotionText",
      "evidenceGpsUsedText",
      "evidenceLocationText",
      "evidenceResult",
      "filteredFuelValue",
      "rawFuelValue",
      "fuelDelta",
      "signalStability",
      "filteredArea",
      "rawLine",
      "filteredLine",
      "eventLog",
      "normalBtn",
      "refuelBtn",
      "noiseBtn",
      "theftBtn",
      "resetBtn"
    ].forEach(function (id) {
      elements[id] = document.getElementById(id);
      if (!elements[id]) {
        throw new Error("Missing UI element: " + id);
      }
    });

    elements.evidenceRow = document.querySelector(".evidence-row:not(.header)");
    if (!elements.evidenceRow) {
      throw new Error("Missing evidence row");
    }
  }

  function bindEvents() {
    elements.normalBtn.addEventListener("click", function () { selectReview("normal"); });
    elements.refuelBtn.addEventListener("click", function () { selectReview("refuel"); });
    elements.noiseBtn.addEventListener("click", function () { selectReview("noise"); });
    elements.theftBtn.addEventListener("click", function () { selectReview("theft"); });
    elements.resetBtn.addEventListener("click", clearReview);
  }

  function fetchTelemetry() {
    fetch("/api/telemetry", { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("Telemetry unavailable");
        return response.json();
      })
      .then(function (data) {
        applyTelemetry(data);
        render();
      })
      .catch(markOffline);
  }

  function init() {
    cacheElements();
    setupNavigation();
    bindEvents();
    addEvent("Waiting for telemetry");
    render();
    fetchTelemetry();
    pollTimer = window.setInterval(fetchTelemetry, 800);
  }

  window.addEventListener("beforeunload", function () {
    if (pollTimer) window.clearInterval(pollTimer);
  });

  document.addEventListener("DOMContentLoaded", init);
}());
)SMARTT_JS";

