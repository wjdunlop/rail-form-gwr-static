(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RailPersistenceMigrations = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SAVE_FORMAT = 'rail-form-save';
  const SAVE_FORMAT_VERSION = 1;
  const MODEL_SCHEMA_VERSION = 1;

  const clone = value => JSON.parse(JSON.stringify(value));
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const array = value => Array.isArray(value) ? value : [];
  const number = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
  const integer = (value, fallback = 0) => Number.isSafeInteger(value) && value >= 0 ? value : fallback;

  function legacyStation(station) {
    return {
      id: String(station.id),
      name: station.name || String(station.id),
      kind: station.type === 'CITY' ? 'city-station' : 'station',
      x: number(station.x),
      y: number(station.y),
      area: object(station.area) ? clone(station.area) : null,
      platformIds: [],
      cityId: station.type === 'CITY' ? `city_${station.id}` : null
    };
  }

  function legacyService(line) {
    return {
      id: String(line.id),
      name: line.name || String(line.id),
      number: integer(line.number),
      stopIds: [line.a, line.b].filter(value => typeof value === 'string'),
      routedLegIds: [],
      trainIds: [`train_${line.id}`],
      operatingPattern: {
        mode: line.rule || 'full-or-timer',
        intervalTicks: integer(line.timer, 20)
      },
      active: !line.broken
    };
  }

  function legacyTrain(line) {
    return {
      id: `train_${line.id}`,
      serviceId: String(line.id),
      locomotiveId: line.locomotive ? `legacy_locomotive_${line.id}` : null,
      vehicleIds: Array.from({ length: integer(line.passengerCars) }, (_, index) => `legacy_coach_${line.id}_${index + 1}`),
      status: line.status === 'IN TRANSIT' ? 'moving' : 'idle',
      edgeId: null,
      stationId: line.status === 'IN TRANSIT' ? null : (line.direction === -1 ? line.b : line.a) || null,
      direction: line.direction === -1 ? -1 : 1,
      progress: number(line.progress),
      passengerJourneyIds: []
    };
  }

  function migrateLegacyCheckpointV3(legacy) {
    if (!object(legacy) || legacy.version !== 3 || !Array.isArray(legacy.stations) || !Array.isArray(legacy.lines)) {
      throw new TypeError('Not a supported legacy checkpoint version 3 document.');
    }
    const stations = legacy.stations.filter(station => object(station) && station.id != null);
    const lines = legacy.lines.filter(line => object(line) && line.id != null);
    return {
      schemaVersion: MODEL_SCHEMA_VERSION,
      id: `legacy_${legacy.scenario || 'checkpoint'}`,
      name: `Imported ${legacy.scenario || 'legacy'} railway`,
      tick: integer(legacy.tick),
      tickPhase: 'commands',
      seed: 'legacy-checkpoint-v3',
      rngState: null,
      paused: true,
      speed: 1,
      credits: number(legacy.credits),
      topologyRevision: 0,
      serviceRevision: 0,
      scheduleRevision: 0,
      grid: { cols: 28, rows: 18 },
      stations: stations.map(legacyStation),
      trackEdges: [],
      services: lines.map(legacyService),
      trains: lines.map(legacyTrain),
      journeys: [],
      cities: stations.filter(station => station.type === 'CITY').map(station => ({
        id: `city_${station.id}`,
        stationId: String(station.id),
        population: integer(station.population),
        waitingPassengers: object(station.passengers) ? clone(station.passengers) : {},
        completedTrips: integer(station.completedTrips),
        transferCount: integer(station.transferCount),
      })),
      commands: [],
      events: [],
      ledger: [],
      metrics: object(legacy.metrics) ? clone(legacy.metrics) : {},
      configuration: {
        importedFrom: 'legacy-checkpoint-v3',
        scenario: legacy.scenario || null,
        legacyTrackCells: array(legacy.tracks).slice(),
        fleet: object(legacy.fleet) ? clone(legacy.fleet) : {},
        lineSerial: integer(legacy.lineSerial)
      }
    };
  }

  function envelope(state, metadata) {
    return { format: SAVE_FORMAT, version: SAVE_FORMAT_VERSION, metadata: clone(metadata || {}), state };
  }

  function migrateDocument(document, metadata) {
    if (!object(document)) throw new TypeError('Save document must be an object.');
    if (document.format === SAVE_FORMAT) {
      if (document.version === SAVE_FORMAT_VERSION) return clone(document);
      if (document.version === 0 && object(document.payload)) {
        return envelope(clone(document.payload), { ...(object(document.metadata) ? clone(document.metadata) : {}), migratedFrom: 0 });
      }
      throw new RangeError(`Unsupported save format version: ${document.version}.`);
    }
    if (document.version === 3) {
      return envelope(migrateLegacyCheckpointV3(document), { ...(metadata || {}), migratedFrom: 'legacy-checkpoint-v3' });
    }
    if (Number.isSafeInteger(document.schemaVersion)) return envelope(clone(document), metadata || {});
    throw new TypeError('Unrecognized save document.');
  }

  return { SAVE_FORMAT, SAVE_FORMAT_VERSION, MODEL_SCHEMA_VERSION, migrateLegacyCheckpointV3, migrateDocument };
});
