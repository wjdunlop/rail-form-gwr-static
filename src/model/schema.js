(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RailModelSchema = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA_VERSION = 1;
  const TICK_PHASES = Object.freeze(['commands', 'demand', 'dispatch', 'movement', 'transfer', 'finance', 'metrics']);
  const JOURNEY_STATUSES = Object.freeze(['waiting', 'onboard', 'transferring', 'complete', 'abandoned']);
  const COLLECTIONS = Object.freeze(['stations', 'trackEdges', 'services', 'trains', 'journeys', 'cities']);

  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const integer = (value, fallback = 0) => Number.isSafeInteger(value) ? value : fallback;
  const revision = value => Math.max(0, integer(value));

  function createGameState(overrides) {
    const input = clone(overrides || {});
    const state = {
      schemaVersion: SCHEMA_VERSION,
      id: input.id || 'game_000000',
      name: input.name || 'Untitled railway',
      tick: revision(input.tick),
      tickPhase: TICK_PHASES.includes(input.tickPhase) ? input.tickPhase : TICK_PHASES[0],
      seed: input.seed ?? 'rail-form',
      rngState: input.rngState ?? null,
      paused: input.paused !== false,
      speed: Number.isFinite(input.speed) && input.speed > 0 ? input.speed : 1,
      credits: Number.isFinite(input.credits) ? input.credits : 0,
      topologyRevision: revision(input.topologyRevision),
      serviceRevision: revision(input.serviceRevision),
      scheduleRevision: revision(input.scheduleRevision),
      grid: { cols: integer(input.grid?.cols, 28), rows: integer(input.grid?.rows, 18) },
      stations: input.stations || [],
      trackEdges: input.trackEdges || [],
      services: input.services || [],
      trains: input.trains || [],
      journeys: input.journeys || [],
      cities: input.cities || [],
      commands: input.commands || [],
      events: input.events || [],
      ledger: input.ledger || [],
      metrics: input.metrics || {},
      configuration: input.configuration || {}
    };
    return state;
  }

  function createStation(input) {
    if (!input?.id) throw new TypeError('Station requires an ID.');
    return { id: input.id, name: input.name || input.id, kind: input.kind || 'station', x: input.x || 0, y: input.y || 0,
      area: input.area ? clone(input.area) : null, platformIds: [...(input.platformIds || [])], cityId: input.cityId || null };
  }

  function createService(input) {
    if (!input?.id) throw new TypeError('Service requires an ID.');
    return { id: input.id, name: input.name || input.id, number: integer(input.number),
      stopIds: [...(input.stopIds || [])], routedLegIds: [...(input.routedLegIds || [])], trainIds: [...(input.trainIds || [])],
      operatingPattern: clone(input.operatingPattern || { mode: 'full-or-timer', intervalTicks: 20 }), active: input.active !== false };
  }

  function createTrain(input) {
    if (!input?.id) throw new TypeError('Train requires an ID.');
    return { id: input.id, serviceId: input.serviceId || null, locomotiveId: input.locomotiveId || null,
      vehicleIds: [...(input.vehicleIds || [])], status: input.status || 'idle', edgeId: input.edgeId || null,
      stationId: input.stationId || null, direction: input.direction === -1 ? -1 : 1, progress: Number(input.progress) || 0,
      passengerJourneyIds: [...(input.passengerJourneyIds || [])] };
  }

  function createJourney(input) {
    if (!input?.id || !input.originStationId || !input.destinationStationId) throw new TypeError('Journey requires ID and station endpoints.');
    const status = JOURNEY_STATUSES.includes(input.status) ? input.status : JOURNEY_STATUSES[0];
    return { id: input.id, originStationId: input.originStationId, destinationStationId: input.destinationStationId,
      legs: (input.legs || []).map(leg => ({ serviceId: leg.serviceId, boardStationId: leg.boardStationId, alightStationId: leg.alightStationId })),
      generalizedCost: Number(input.generalizedCost) || 0, status, currentLegIndex: revision(input.currentLegIndex),
      createdTick: revision(input.createdTick), completedTick: input.completedTick ?? null };
  }

  function createCommand(input) {
    if (!input?.id || !input.type) throw new TypeError('Command requires ID and type.');
    return { id: input.id, type: input.type, issuedTick: revision(input.issuedTick), payload: clone(input.payload || {}) };
  }

  function createEvent(input) {
    if (!input?.id || !input.type) throw new TypeError('Event requires ID and type.');
    return { id: input.id, type: input.type, tick: revision(input.tick), payload: clone(input.payload || {}) };
  }

  function bumpRevision(state, kind) {
    const field = `${kind}Revision`;
    if (!['topologyRevision', 'serviceRevision', 'scheduleRevision'].includes(field)) throw new TypeError(`Unknown revision: ${kind}`);
    return { ...state, [field]: revision(state[field]) + 1 };
  }

  function serializabilityErrors(value) {
    const errors = [], ancestors = new Set();
    function visit(current, path) {
      if (current === undefined || typeof current === 'function' || typeof current === 'symbol' || typeof current === 'bigint') {
        errors.push(`${path} is not JSON serializable.`); return;
      }
      if (current === null || typeof current !== 'object') {
        if (typeof current === 'number' && !Number.isFinite(current)) errors.push(`${path} is not a finite number.`);
        return;
      }
      if (current instanceof Map || current instanceof Set || current instanceof Date) { errors.push(`${path} must use plain JSON data.`); return; }
      if (ancestors.has(current)) { errors.push(`${path} contains a cycle.`); return; }
      ancestors.add(current);
      Object.keys(current).forEach(key => visit(current[key], `${path}.${key}`));
      ancestors.delete(current);
    }
    visit(value, '$');
    return errors;
  }

  function validateGameState(state) {
    const errors = serializabilityErrors(state);
    if (!state || typeof state !== 'object') return { valid: false, errors: ['$ must be an object.', ...errors] };
    if (state.schemaVersion !== SCHEMA_VERSION) errors.push(`Unsupported schema version: ${state.schemaVersion}.`);
    for (const field of ['topologyRevision', 'serviceRevision', 'scheduleRevision']) {
      if (!Number.isSafeInteger(state[field]) || state[field] < 0) errors.push(`${field} must be a non-negative integer.`);
    }
    const allIds = new Set();
    COLLECTIONS.forEach(collection => {
      if (!Array.isArray(state[collection])) { errors.push(`${collection} must be an array.`); return; }
      state[collection].forEach(record => {
        if (!record?.id) errors.push(`${collection} contains a record without an ID.`);
        else if (allIds.has(record.id)) errors.push(`Duplicate canonical ID: ${record.id}.`);
        else allIds.add(record.id);
      });
    });
    (state.services || []).forEach(service => {
      (service.stopIds || []).forEach(id => { if (!(state.stations || []).some(station => station.id === id)) errors.push(`Service ${service.id} references missing station ${id}.`); });
      (service.trainIds || []).forEach(id => { if (!(state.trains || []).some(train => train.id === id)) errors.push(`Service ${service.id} references missing train ${id}.`); });
    });
    return { valid: errors.length === 0, errors };
  }

  return { SCHEMA_VERSION, TICK_PHASES, JOURNEY_STATUSES, COLLECTIONS, createGameState, createStation, createService,
    createTrain, createJourney, createCommand, createEvent, bumpRevision, serializabilityErrors, validateGameState };
});
