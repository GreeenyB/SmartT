(function () {
  "use strict";

  var tankCapacityLiters = 180;
  var vehicle = {
    deviceId: "smartt-esp32-001",
    vehicleId: "SMT-001",
    vehicleLabel: "Light delivery truck",
    sourceType: "ANALOG_ADS1115",
    tankCapacityLiters: tankCapacityLiters,
    zone: "Ho Chi Minh City"
  };

  function liters(percent) {
    return Number((percent * tankCapacityLiters / 100).toFixed(1));
  }

  function telemetry(timestamp, fuelPercent, options) {
    options = options || {};
    return {
      timestamp: timestamp,
      created_at: timestamp,
      deviceId: vehicle.deviceId,
      vehicleId: vehicle.vehicleId,
      vehicleLabel: vehicle.vehicleLabel,
      sourceType: vehicle.sourceType,
      tankCapacityLiters: tankCapacityLiters,
      fuelPercent: fuelPercent,
      fuelLiters: options.fuelLiters !== undefined ? options.fuelLiters : liters(fuelPercent),
      fuelRatePercentPerSec: options.fuelRatePercentPerSec || 0,
      ignition: Boolean(options.ignition),
      gpsFix: options.gpsFix !== false,
      gpsLat: options.gpsLat,
      gpsLon: options.gpsLon,
      gpsState: options.gpsState || "Fresh",
      gpsMotionState: options.gpsMotionState || (options.ignition ? "MOVING" : "STATIONARY"),
      speedKmh: options.speedKmh || 0,
      detectorState: options.detectorState || "NORMAL_ON",
      currentEvent: options.currentEvent || "Fuel stable",
      confidence: options.confidence !== undefined ? options.confidence : 84,
      signalStability: options.signalStability !== undefined ? options.signalStability : 90,
      sloshingScore: options.sloshingScore !== undefined ? options.sloshingScore : 10,
      ruleResult: options.ruleResult || "Stable trend",
      fuelDeltaLiters: options.fuelDeltaLiters,
      fuelDeltaPercent: options.fuelDeltaPercent
    };
  }

  function event(timestamp, eventType, eventLabel, options) {
    options = options || {};
    return {
      eventId: options.eventId || eventType + "-" + timestamp,
      timestamp: timestamp,
      created_at: timestamp,
      deviceId: vehicle.deviceId,
      vehicleId: vehicle.vehicleId,
      eventType: eventType,
      eventLabel: eventLabel,
      fuelBeforePercent: options.fuelBeforePercent,
      fuelAfterPercent: options.fuelAfterPercent,
      fuelBeforeLiters: options.fuelBeforeLiters,
      fuelAfterLiters: options.fuelAfterLiters,
      fuelDeltaPercent: options.fuelDeltaPercent,
      fuelDeltaLiters: options.fuelDeltaLiters,
      ignition: Boolean(options.ignition),
      gpsState: options.gpsState || "Fresh",
      gpsMotionState: options.gpsMotionState || (options.ignition ? "MOVING" : "STATIONARY"),
      gpsLat: options.gpsLat,
      gpsLon: options.gpsLon,
      speedKmh: options.speedKmh || 0,
      signalStability: options.signalStability,
      sloshingScore: options.sloshingScore,
      confidence: options.confidence,
      ruleResult: options.ruleResult,
      evidenceSummary: options.evidenceSummary || options.ruleResult
    };
  }

  var sharedEvents = [
    event("2026-06-20T14:10:00+07:00", "SENSOR_FAULT", "Sensor fault", {
      fuelBeforePercent: 54.1,
      fuelAfterPercent: 54.0,
      fuelBeforeLiters: liters(54.1),
      fuelAfterLiters: liters(54.0),
      fuelDeltaPercent: -0.1,
      fuelDeltaLiters: -0.2,
      gpsLat: 10.7826,
      gpsLon: 106.6935,
      gpsState: "Fresh",
      signalStability: 36,
      sloshingScore: 12,
      confidence: 58,
      ruleResult: "Signal below stability threshold"
    }),
    event("2026-07-01T17:20:42+07:00", "REFUEL_EVENT", "Refuel detected", {
      fuelBeforePercent: 42.8,
      fuelAfterPercent: 62.1,
      fuelBeforeLiters: liters(42.8),
      fuelAfterLiters: liters(62.1),
      fuelDeltaPercent: 19.3,
      fuelDeltaLiters: 34.7,
      gpsLat: 10.8010,
      gpsLon: 106.6758,
      gpsState: "Fresh",
      signalStability: 82,
      sloshingScore: 24,
      confidence: 89,
      ruleResult: "Fuel rose while parked"
    })
  ];

  var normalTelemetry = [
    telemetry("2026-06-20T14:10:00+07:00", 54.0, {
      gpsLat: 10.7826,
      gpsLon: 106.6935,
      detectorState: "SENSOR_FAULT",
      currentEvent: "Sensor fault",
      confidence: 58,
      signalStability: 36,
      ruleResult: "Signal below stability threshold"
    }),
    telemetry("2026-07-01T17:20:42+07:00", 62.1, {
      gpsLat: 10.8010,
      gpsLon: 106.6758,
      detectorState: "REFUEL_EVENT",
      currentEvent: "Refuel detected",
      confidence: 89,
      signalStability: 82,
      fuelDeltaPercent: 19.3,
      fuelDeltaLiters: 34.7,
      ruleResult: "Fuel rose while parked"
    }),
    telemetry("2026-07-03T07:45:00+07:00", 61.8, { ignition: true, gpsLat: 10.8014, gpsLon: 106.6761, gpsMotionState: "MOVING", speedKmh: 18 }),
    telemetry("2026-07-03T08:10:00+07:00", 61.2, { ignition: true, gpsLat: 10.7948, gpsLon: 106.6821, gpsMotionState: "MOVING", speedKmh: 24 }),
    telemetry("2026-07-03T09:05:00+07:00", 60.5, { ignition: true, gpsLat: 10.7872, gpsLon: 106.6948, gpsMotionState: "MOVING", speedKmh: 31 }),
    telemetry("2026-07-03T10:18:22+07:00", 59.9, { ignition: false, gpsLat: 10.7822, gpsLon: 106.7008, gpsMotionState: "STATIONARY", speedKmh: 0, detectorState: "PARKED_MONITORING", ruleResult: "Parked baseline stable" }),
    telemetry("2026-07-03T12:10:19+07:00", 59.3, {
      ignition: true,
      gpsLat: 10.7768,
      gpsLon: 106.7033,
      gpsMotionState: "MOVING",
      speedKmh: 27,
      detectorState: "SLOSHING_DETECTED",
      currentEvent: "Sloshing detected",
      confidence: 74,
      signalStability: 54,
      sloshingScore: 61,
      fuelDeltaPercent: -0.7,
      fuelDeltaLiters: -1.3,
      ruleResult: "Filtered fluctuation while moving"
    }),
    telemetry("2026-07-03T12:42:18+07:00", 59.5, { ignition: true, gpsLat: 10.7724, gpsLon: 106.7049, gpsMotionState: "MOVING", speedKmh: 22, ruleResult: "Stable trend after filtering" })
  ];

  var refuelTelemetry = [
    telemetry("2026-06-20T14:10:00+07:00", 54.0, { gpsLat: 10.7826, gpsLon: 106.6935, detectorState: "SENSOR_FAULT", currentEvent: "Sensor fault", confidence: 58, signalStability: 36, ruleResult: "Signal below stability threshold" }),
    telemetry("2026-07-02T16:40:00+07:00", 37.8, { ignition: false, gpsLat: 10.8010, gpsLon: 106.6758, detectorState: "PARKED_MONITORING", currentEvent: "Fuel stable", ruleResult: "Parked baseline stable" }),
    telemetry("2026-07-03T09:00:00+07:00", 37.8, { ignition: false, gpsLat: 10.8010, gpsLon: 106.6758, detectorState: "PARKED_MONITORING", ruleResult: "Parked baseline stable", signalStability: 93 }),
    telemetry("2026-07-03T09:00:30+07:00", 39.6, { ignition: false, gpsLat: 10.8010, gpsLon: 106.6758, detectorState: "REFUEL_CANDIDATE", currentEvent: "Refuel candidate", confidence: 45, signalStability: 82, sloshingScore: 30, fuelDeltaPercent: 1.8, fuelDeltaLiters: 3.3, ruleResult: "Fuel rising" }),
    telemetry("2026-07-03T09:01:00+07:00", 45.2, { ignition: false, gpsLat: 10.8010, gpsLon: 106.6758, detectorState: "REFUEL_CANDIDATE", currentEvent: "Refuel candidate", confidence: 68, signalStability: 76, sloshingScore: 35, fuelDeltaPercent: 7.4, fuelDeltaLiters: 13.4, ruleResult: "Rise exceeds refuel threshold" }),
    telemetry("2026-07-03T09:01:30+07:00", 54.7, { ignition: false, gpsLat: 10.8010, gpsLon: 106.6758, detectorState: "REFUEL_EVENT", currentEvent: "Refuel detected", confidence: 88, signalStability: 80, sloshingScore: 25, fuelDeltaPercent: 16.9, fuelDeltaLiters: 30.5, ruleResult: "Refuel confirmed" }),
    telemetry("2026-07-03T09:02:00+07:00", 55.8, { ignition: false, gpsLat: 10.8010, gpsLon: 106.6758, detectorState: "REFUEL_EVENT", currentEvent: "Refuel detected", confidence: 82, signalStability: 89, sloshingScore: 14, fuelDeltaPercent: 18.0, fuelDeltaLiters: 32.4, ruleResult: "Refuel settling" }),
    telemetry("2026-07-03T09:18:18+07:00", 55.4, { ignition: true, gpsLat: 10.7974, gpsLon: 106.6841, gpsMotionState: "MOVING", speedKmh: 25, currentEvent: "Fuel stable", ruleResult: "Post-refuel stable" })
  ];

  var dropTelemetry = [
    telemetry("2026-06-20T14:10:00+07:00", 54.0, { gpsLat: 10.7826, gpsLon: 106.6935, detectorState: "SENSOR_FAULT", currentEvent: "Sensor fault", confidence: 58, signalStability: 36, ruleResult: "Signal below stability threshold" }),
    telemetry("2026-07-01T17:20:42+07:00", 62.1, { gpsLat: 10.8010, gpsLon: 106.6758, detectorState: "REFUEL_EVENT", currentEvent: "Refuel detected", confidence: 89, signalStability: 82, fuelDeltaPercent: 19.3, fuelDeltaLiters: 34.7, ruleResult: "Fuel rose while parked" }),
    telemetry("2026-07-03T08:05:00+07:00", 61.8, { ignition: true, gpsLat: 10.8014, gpsLon: 106.6761, gpsMotionState: "MOVING", speedKmh: 22 }),
    telemetry("2026-07-03T08:42:00+07:00", 61.0, { ignition: true, gpsLat: 10.7948, gpsLon: 106.6821, gpsMotionState: "MOVING", speedKmh: 29 }),
    telemetry("2026-07-03T09:10:11+07:00", 60.4, { ignition: true, gpsLat: 10.7903, gpsLon: 106.6903, gpsMotionState: "MOVING", speedKmh: 34, detectorState: "SLOSHING_DETECTED", currentEvent: "Sloshing detected", confidence: 72, signalStability: 56, sloshingScore: 58, fuelDeltaPercent: -0.6, fuelDeltaLiters: -1.1, ruleResult: "Filtered fluctuation while moving" }),
    telemetry("2026-07-03T10:10:00+07:00", 60.2, { ignition: false, gpsLat: 10.7875, gpsLon: 106.7052, gpsMotionState: "STATIONARY", speedKmh: 0, detectorState: "PARKED_MONITORING", ruleResult: "Parked baseline stable" }),
    telemetry("2026-07-03T10:21:00+07:00", 59.7, { ignition: false, gpsLat: 10.7875, gpsLon: 106.7052, gpsMotionState: "STATIONARY", speedKmh: 0, detectorState: "FUEL_DROP_CANDIDATE", currentEvent: "Drop candidate", confidence: 64, signalStability: 87, sloshingScore: 26, fuelDeltaPercent: -3.5, fuelDeltaLiters: -6.3, ruleResult: "Drop candidate while parked" }),
    telemetry("2026-07-03T10:21:20+07:00", 57.4, { ignition: false, gpsLat: 10.7875, gpsLon: 106.7052, gpsMotionState: "STATIONARY", speedKmh: 0, detectorState: "SUSPICIOUS_DROP", currentEvent: "Theft suspected", confidence: 91, signalStability: 84, sloshingScore: 21, fuelDeltaPercent: -5.8, fuelDeltaLiters: -10.5, ruleResult: "Stationary drop confirmed" }),
    telemetry("2026-07-03T10:42:18+07:00", 57.2, { ignition: false, gpsLat: 10.7875, gpsLon: 106.7052, gpsMotionState: "STATIONARY", speedKmh: 0, detectorState: "THEFT_ALERT", currentEvent: "Theft suspected", confidence: 86, signalStability: 91, sloshingScore: 16, fuelDeltaPercent: -6.0, fuelDeltaLiters: -10.8, ruleResult: "Alert hold" })
  ];

  var refuelEvents = [
    sharedEvents[0],
    event("2026-07-03T09:00:30+07:00", "REFUEL_CANDIDATE", "Refuel candidate", {
      fuelBeforePercent: 37.8,
      fuelAfterPercent: 39.6,
      fuelBeforeLiters: liters(37.8),
      fuelAfterLiters: liters(39.6),
      fuelDeltaPercent: 1.8,
      fuelDeltaLiters: 3.3,
      gpsLat: 10.8010,
      gpsLon: 106.6758,
      confidence: 45,
      signalStability: 82,
      sloshingScore: 30,
      ruleResult: "Fuel rising"
    }),
    event("2026-07-03T09:01:30+07:00", "REFUEL_EVENT", "Refuel detected", {
      fuelBeforePercent: 37.8,
      fuelAfterPercent: 54.7,
      fuelBeforeLiters: liters(37.8),
      fuelAfterLiters: liters(54.7),
      fuelDeltaPercent: 16.9,
      fuelDeltaLiters: 30.5,
      gpsLat: 10.8010,
      gpsLon: 106.6758,
      confidence: 88,
      signalStability: 80,
      sloshingScore: 25,
      ruleResult: "Refuel confirmed"
    })
  ];

  var dropEvents = sharedEvents.concat([
    event("2026-07-03T09:10:11+07:00", "SLOSHING_DETECTED", "Sloshing detected", {
      ignition: true,
      fuelBeforePercent: 61.0,
      fuelAfterPercent: 60.4,
      fuelBeforeLiters: liters(61.0),
      fuelAfterLiters: liters(60.4),
      fuelDeltaPercent: -0.6,
      fuelDeltaLiters: -1.1,
      gpsLat: 10.7903,
      gpsLon: 106.6903,
      speedKmh: 34,
      gpsMotionState: "MOVING",
      confidence: 72,
      signalStability: 56,
      sloshingScore: 58,
      ruleResult: "Filtered fluctuation while moving"
    }),
    event("2026-07-03T10:21:00+07:00", "FUEL_DROP_CANDIDATE", "Drop candidate", {
      fuelBeforePercent: 60.2,
      fuelAfterPercent: 59.7,
      fuelBeforeLiters: liters(60.2),
      fuelAfterLiters: liters(59.7),
      fuelDeltaPercent: -3.5,
      fuelDeltaLiters: -6.3,
      gpsLat: 10.7875,
      gpsLon: 106.7052,
      confidence: 64,
      signalStability: 87,
      sloshingScore: 26,
      ruleResult: "Drop candidate while parked"
    }),
    event("2026-07-03T10:21:20+07:00", "SUSPICIOUS_DROP", "Theft suspected", {
      fuelBeforePercent: 60.2,
      fuelAfterPercent: 57.4,
      fuelBeforeLiters: liters(60.2),
      fuelAfterLiters: liters(57.4),
      fuelDeltaPercent: -5.8,
      fuelDeltaLiters: -10.5,
      gpsLat: 10.7875,
      gpsLon: 106.7052,
      confidence: 91,
      signalStability: 84,
      sloshingScore: 21,
      ruleResult: "Stationary drop confirmed"
    })
  ]);

  window.SMARTT_SAMPLE = {
    defaultScenario: "parked_drop",
    tankCapacityLiters: tankCapacityLiters,
    scenarios: {
      normal: {
        label: "Normal day",
        vehicle: vehicle,
        telemetry: normalTelemetry,
        events: sharedEvents.concat([
          event("2026-07-03T12:10:19+07:00", "SLOSHING_DETECTED", "Sloshing detected", {
            ignition: true,
            fuelBeforePercent: 60.5,
            fuelAfterPercent: 59.3,
            fuelBeforeLiters: liters(60.5),
            fuelAfterLiters: liters(59.3),
            fuelDeltaPercent: -0.7,
            fuelDeltaLiters: -1.3,
            gpsLat: 10.7768,
            gpsLon: 106.7033,
            speedKmh: 27,
            gpsMotionState: "MOVING",
            confidence: 74,
            signalStability: 54,
            sloshingScore: 61,
            ruleResult: "Filtered fluctuation while moving"
          })
        ])
      },
      refuel: {
        label: "Refuel event",
        vehicle: vehicle,
        telemetry: refuelTelemetry,
        events: refuelEvents
      },
      parked_drop: {
        label: "Parked drop event",
        vehicle: vehicle,
        telemetry: dropTelemetry,
        events: dropEvents
      }
    }
  };
}());
