(function (root, factory) {
  const core = typeof module === 'object' && module.exports ? require('../../rail-core.js') : root.RailCore;
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RailLegacyScenarioAdapter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (RailCore) {
  'use strict';

  const LINE_COLORS = Object.freeze(['#ed5d37', '#5d78b8', '#4d846b', '#b06ca3', '#d49a32', '#81959a', '#8b6f9e']);
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const serviceStops = service => (service.stopIds || service.calls || [])
    .map(stop => typeof stop === 'string' ? stop : stop?.stationId).filter(Boolean);
  const trackKey = cell => `${cell.x},${cell.y}`;

  function assertDefinition(definition) {
    if (!definition || typeof definition !== 'object') throw new TypeError('Scenario definition is required.');
    if (!definition.id || !Array.isArray(definition.stations) || !Array.isArray(definition.services) || !Array.isArray(definition.trackCells)) {
      throw new TypeError('Scenario definition requires ID, stations, services, and track cells.');
    }
    const ids = new Set();
    definition.stations.forEach(station => {
      if (!station.id || ids.has(station.id)) throw new TypeError(`Duplicate or missing station ID: ${station.id}.`);
      ids.add(station.id);
    });
    definition.services.forEach(service => serviceStops(service).forEach(stationId => {
      if (!ids.has(stationId)) throw new TypeError(`Service ${service.id} references missing station ${stationId}.`);
    }));
  }

  function adaptStations(definition) {
    assertDefinition(definition);
    const cities = new Map((definition.cities || []).map(city => [city.stationId, city]));
    const queues = new Map();
    (definition.initialQueues || []).forEach(queue => {
      if (!queues.has(queue.originStationId)) queues.set(queue.originStationId, {});
      queues.get(queue.originStationId)[queue.destinationStationId] = (queues.get(queue.originStationId)[queue.destinationStationId] || 0) + queue.count;
    });
    const serviceCounts=new Map();definition.services.forEach(service=>new Set(serviceStops(service)).forEach(stationId=>serviceCounts.set(stationId,(serviceCounts.get(stationId)||0)+1)));
    return definition.stations.map(source => {
      const city = cities.get(source.id), station = {
        id: source.id, name: source.name || source.id, short: source.short || source.name?.slice(0, 2).toUpperCase() || source.id.slice(0, 2).toUpperCase(),
        type: city ? 'CITY' : source.type || 'STATION',
        x: source.x, y: source.y, area: clone(source.area || null), layout:clone(source.layout||null), geography:clone(source.geography||null), platformRefs:clone(source.platformRefs||[]), platformCount:source.platformCount||Math.max(Math.min(source.area?.w||1,source.area?.h||1),serviceCounts.get(source.id)||1), timetableManaged:Boolean(source.timetableManaged), allowThroughRouting:Boolean(source.allowThroughRouting), color: source.color || '#74766f'
      };
      if (city) Object.assign(station, { population: city.population || 0, passengers: clone(queues.get(source.id) || {}), spawnBuffer: {},
        completedTrips: city.completedTrips || 0, transferCount: city.transferCount || 0 });
      return station;
    });
  }

  function legacyRule(pattern) {
    const mode = pattern?.mode || pattern?.type || 'full-or-timer';
    return mode === 'full' ? 'full' : mode === 'timer' ? 'timer' : 'either';
  }

  function adjacentPairs(service) {
    const stops = serviceStops(service), pairs = stops.slice(1).map((stationId, index) => [stops[index], stationId]);
    if ((service.operatingMode === 'loop' || service.loop === true) && stops.length > 2) pairs.push([stops.at(-1), stops[0]]);
    return { stops, pairs };
  }

  function adaptLines(definition, stations, tracks, options = {}) {
    const stationById = new Map(stations.map(station => [station.id, station])), lines = [];
    definition.services.forEach((service, serviceIndex) => {
      const { stops, pairs } = adjacentPairs(service), allocation = service.allocation || {};
      pairs.forEach(([aId, bId], sequenceIndex) => {
        const a = stationById.get(aId), b = stationById.get(bId);
        const path = options.findPath ? options.findPath(a, b, tracks, definition.grid, stations) : RailCore.findRailPath(a, b, tracks, definition.grid || { cols: 28, rows: 18 }, stations);
        const multiStop = pairs.length > 1, id = multiStop ? `${service.id}::segment:${String(sequenceIndex + 1).padStart(2, '0')}` : service.id;
        const locomotives = allocation.locomotives ?? (service.trainIds?.length ? 1 : 0);
        const passengerCars = allocation.passengerCars ?? service.passengerCars ?? 0;
        const intervalTicks = service.operatingPattern?.intervalTicks ?? service.dispatchRule?.intervalTicks ?? 20;
        lines.push({ id, number: service.number || serviceIndex + 1, name: service.name || `LINE ${serviceIndex + 1}`, a, b, aId, bId, path,
          color: service.color || LINE_COLORS[serviceIndex % LINE_COLORS.length], locomotive: locomotives > 0 ? 1 : 0, passengerCars,
          rule: legacyRule(service.operatingPattern || service.dispatchRule), timer: intervalTicks / 4, passengers: {}, direction: 1,
          pathPos: 0, status: path && locomotives > 0 && passengerCars > 0 ? 'LOADING' : path ? 'NO TRAIN' : 'LINE BROKEN',
          wait: 0, broken: !path, serviceId: service.id, serviceGroup: service.serviceGroup || service.id,
          serviceStopSequence: [...stops], sequenceIndex, fromStopIndex: sequenceIndex, toStopIndex: sequenceIndex === stops.length - 1 ? 0 : sequenceIndex + 1,
          continuesFromPrevious: sequenceIndex > 0, continuesToNext: sequenceIndex < pairs.length - 1, operatingMode: service.operatingMode || (service.loop ? 'loop' : 'reverse') });
      });
    });
    return lines;
  }

  function initialMetrics() {
    return { passengersMoved: 0, transfers: 0,
      movingTicks: 0, assignedTicks: 0, history: [] };
  }

  function adaptScenario(definition, options = {}) {
    assertDefinition(definition);
    const stations = adaptStations(definition), tracks = new Set(definition.trackCells.map(trackKey));
    const lines = adaptLines(definition, stations, tracks, options);
    return {
      scenario: definition.id, scenarioId: definition.id, scenarioName: definition.name || definition.id, grid: clone(definition.grid || { cols: 28, rows: 18 }),
      stations, tracks, lines, credits: definition.credits || 0, tick: 0, accumulator: 0,
      lineSerial: definition.services.length + 1, fleet: clone(definition.fleet || { locomotives: 0, passengerCars: 0 }),
      metrics: initialMetrics(), seed: definition.seed || definition.id,
      visualTrackCurves: definition.visualTrackCurves || [],visualTrackGeometry:definition.visualTrackGeometry||null,visualStationGeometry:definition.visualStationGeometry||null,operationalTopology:definition.operationalTopology||null,passengerDemand:definition.passengerDemand||null,sourceDefinition: definition
    };
  }

  function isSameServiceContinuation(first, second) {
    if (!first || !second || first.serviceGroup !== second.serviceGroup) return false;
    const shared = first.aId === second.aId || first.aId === second.bId || first.bId === second.aId || first.bId === second.bId;
    return shared && Math.abs(first.sequenceIndex - second.sequenceIndex) === 1;
  }

  function trueTransferCount(lineIds, lines) {
    const byId = new Map((lines || []).map(line => [line.id, line])), groups = [];
    (lineIds || []).forEach(id => {
      const group = byId.get(id)?.serviceGroup || byId.get(id)?.serviceId || id;
      if (groups.at(-1) !== group) groups.push(group);
    });
    return Math.max(0, groups.length - 1);
  }

  return { LINE_COLORS, serviceStops, adaptStations, adaptLines, adaptScenario, isSameServiceContinuation, trueTransferCount };
});
