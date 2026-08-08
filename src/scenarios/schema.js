(function (root, factory) {
  const mapping=typeof module==='object'&&module.exports?require('./geographic-mapping.js'):root.RailGeographicMapping;
  const stationMapping=typeof module==='object'&&module.exports?require('./station-geographic-mapping.js'):root.RailStationGeographicMapping;
  const sectionalAppendix=typeof module==='object'&&module.exports?require('./sectional-appendix.js'):root.RailSectionalAppendix;
  const api = factory(mapping,stationMapping,sectionalAppendix);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RailScenarioSchema = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Mapping,StationMapping,SectionalAppendix) {
  'use strict';

  const SCENARIO_SCHEMA_VERSION = 1;
  const clone = value => JSON.parse(JSON.stringify(value));
  const plain = value => value && typeof value === 'object' && !Array.isArray(value);
  const key = cell => `${cell.x},${cell.y}`;

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(property => deepFreeze(value[property]));
    return Object.freeze(value);
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!plain(value)) return value;
    const result = {};
    Object.keys(value).sort().forEach(property => { result[property] = canonicalize(value[property]); });
    return result;
  }

  function canonicalSnapshot(value) { return JSON.stringify(canonicalize(value)); }

  function trackCellsFromPolylines(polylines, stationAreas = []) {
    const cells = new Map(), occupied = (x, y) => stationAreas.some(area => x >= area.x && y >= area.y && x < area.x + area.w && y < area.y + area.h);
    const add = (x, y) => { if (!occupied(x, y)) cells.set(`${x},${y}`, { x, y }); };
    (polylines || []).forEach(points => {
      for (let index = 0; index < points.length - 1; index++) {
        let { x, y } = points[index];
        const target = points[index + 1];
        add(x, y);
        while (x !== target.x) { x += Math.sign(target.x - x); add(x, y); }
        while (y !== target.y) { y += Math.sign(target.y - y); add(x, y); }
      }
    });
    return [...cells.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  }

  function defineScenario(input) {
    const scenario = { ...input,
      grid:clone(input.grid), fleet:clone(input.fleet), stations:clone(input.stations), cities:clone(input.cities),
      services:clone(input.services), initialQueues:clone(input.initialQueues),
      sources:clone(input.sources || []), schemaVersion:SCENARIO_SCHEMA_VERSION };
    scenario.trackCells = trackCellsFromPolylines(input.trackPolylines || [], scenario.stations.map(station => station.area));
    delete scenario.trackPolylines;
    return deepFreeze(scenario);
  }

  function validateScenario(scenario) {
    const errors = [];
    if (!plain(scenario)) return { valid: false, errors: ['Scenario must be an object.'] };
    if (scenario.schemaVersion !== SCENARIO_SCHEMA_VERSION) errors.push(`Unsupported scenario schema version: ${scenario.schemaVersion}.`);
    if (typeof scenario.id !== 'string' || !scenario.id) errors.push('Scenario requires an ID.');
    if (!Number.isSafeInteger(scenario.grid?.cols) || !Number.isSafeInteger(scenario.grid?.rows) || scenario.grid.cols < 1 || scenario.grid.rows < 1) errors.push('Grid dimensions must be positive integers.');
    for (const collection of ['stations', 'cities', 'trackCells', 'services', 'initialQueues']) {
      if (!Array.isArray(scenario[collection])) errors.push(`${collection} must be an array.`);
    }
    if (errors.length) return { valid: false, errors };

    const allIds = new Set(), register = (record, collection) => {
      if (!record?.id) errors.push(`${collection} contains a record without an ID.`);
      else if (allIds.has(record.id)) errors.push(`Duplicate scenario ID: ${record.id}.`);
      else allIds.add(record.id);
    };
    scenario.stations.forEach(record => register(record, 'stations'));
    scenario.cities.forEach(record => register(record, 'cities'));
    scenario.services.forEach(record => register(record, 'services'));
    scenario.initialQueues.forEach(record => register(record, 'initialQueues'));

    const stations = new Map(scenario.stations.map(station => [station.id, station]));
    const cities = new Map(scenario.cities.map(city => [city.id, city]));
    scenario.stations.forEach(station => {
      if (!Number.isInteger(station.x) || !Number.isInteger(station.y) || station.x < 0 || station.y < 0 || station.x >= scenario.grid.cols || station.y >= scenario.grid.rows) errors.push(`Station ${station.id} is outside the grid.`);
      if (!plain(station.area) || station.area.w < 2 || station.area.h < 2) errors.push(`Station ${station.id} requires a valid area.`);
      if (station.cityId && !cities.has(station.cityId)) errors.push(`Station ${station.id} references missing city ${station.cityId}.`);
    });
    if(scenario.visualTrackGeometry){const mappingResult=Mapping.validateNormalized(scenario.visualTrackGeometry,[...stations.keys()]);mappingResult.errors.forEach(error=>errors.push(`Geographic mapping: ${error}`));}
    if(scenario.visualStationGeometry){const mappingResult=StationMapping.validateNormalized(scenario.visualStationGeometry,scenario.visualTrackGeometry,[...stations.keys()]);mappingResult.errors.forEach(error=>errors.push(`Station mapping: ${error}`));}
    if(scenario.operationalTopology){
      if(scenario.operationalTopology.format!==SectionalAppendix.FORMAT||scenario.operationalTopology.version!==SectionalAppendix.VERSION)errors.push('Operational topology has an unsupported Sectional Appendix format or version.');
      const corridorIds=(scenario.visualTrackGeometry?.corridors||[]).map(corridor=>[corridor.aId,corridor.bId].sort().join('|')).sort();
      const ruleIds=(scenario.operationalTopology.corridorRules||[]).map(rule=>rule.id).sort();
      if(JSON.stringify(corridorIds)!==JSON.stringify(ruleIds))errors.push('Operational topology does not classify every geographic corridor exactly once.');
    }
    if(scenario.workingTimetable){
      const timetable=scenario.workingTimetable;
      if(!['rail-form-great-western-working-plan','rail-form-network-rail-cif-working-plan'].includes(timetable.format)||timetable.version!==1)errors.push('Working timetable has an unsupported format or version.');
      if(typeof timetable.source?.sha256!=='string'||timetable.source.sha256.length!==64)errors.push('Working timetable lacks a pinned source digest.');
      if(!Array.isArray(timetable.runs)||!timetable.runs.length)errors.push('Working timetable requires imported train runs.');
      else timetable.runs.forEach(run=>{
        if(!run.id||!run.uid||!run.headcode)errors.push('Working timetable contains an unidentified train run.');
        if(!Array.isArray(run.calls)||new Set((run.calls||[]).map(call=>call.stationId)).size<2)errors.push(`Working timetable run ${run.id||'<unknown>'} does not cross two modeled stations.`);
        (run.calls||[]).forEach(call=>{if(!stations.has(call.stationId))errors.push(`Working timetable run ${run.id||'<unknown>'} references missing station ${call.stationId}.`);});
      });
    }
    scenario.cities.forEach(city => { if (!stations.has(city.stationId)) errors.push(`City ${city.id} references missing station ${city.stationId}.`); });

    const trackKeys = new Set();
    scenario.trackCells.forEach(cell => {
      const id = key(cell);
      if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y) || cell.x < 0 || cell.y < 0 || cell.x >= scenario.grid.cols || cell.y >= scenario.grid.rows) errors.push(`Track cell ${id} is outside the grid.`);
      if (trackKeys.has(id)) errors.push(`Duplicate track cell: ${id}.`);
      trackKeys.add(id);
      if (scenario.stations.some(station => cell.x >= station.area.x && cell.y >= station.area.y && cell.x < station.area.x + station.area.w && cell.y < station.area.y + station.area.h)) errors.push(`Track cell ${id} overlaps a station area.`);
    });
    scenario.services.forEach(service => {
      if (!Array.isArray(service.stopIds) || service.stopIds.length < 2) errors.push(`Service ${service.id} requires at least two stops.`);
      (service.stopIds || []).forEach(stationId => { if (!stations.has(stationId)) errors.push(`Service ${service.id} references missing station ${stationId}.`); });
      for (const field of ['locomotives', 'passengerCars']) if (!Number.isSafeInteger(service.allocation?.[field] || 0) || (service.allocation?.[field] || 0) < 0) errors.push(`Service ${service.id} has invalid ${field} allocation.`);
    });
    const allocated = field => scenario.services.reduce((sum, service) => sum + (service.allocation?.[field] || 0), 0);
    for (const field of ['locomotives', 'passengerCars']) {
      if (!Number.isSafeInteger(scenario.fleet?.[field]) || scenario.fleet[field] < allocated(field)) errors.push(`Fleet ${field} cannot cover service allocations.`);
    }
    scenario.initialQueues.forEach(queue => {
      const cityStations = new Set(scenario.cities.map(city => city.stationId));
      if (!cityStations.has(queue.originStationId) || !cityStations.has(queue.destinationStationId)) errors.push('Initial queue references a missing city station.');
      if (queue.originStationId === queue.destinationStationId) errors.push('Initial queue endpoints must differ.');
      if (!Number.isSafeInteger(queue.count) || queue.count < 0) errors.push('Initial queue count must be a non-negative integer.');
    });
    return { valid: errors.length === 0, errors };
  }

  function requireValid(scenario) {
    const result = validateScenario(scenario);
    if (!result.valid) throw new TypeError(`Invalid scenario ${scenario?.id || '<unknown>'}: ${result.errors.join(' ')}`);
  }

  function buildTrackEdges(trackCells) {
    const cells = new Set(trackCells.map(key)), edges = [];
    trackCells.forEach(cell => [[1, 0], [0, 1]].forEach(([dx, dy]) => {
      const adjacent = { x: cell.x + dx, y: cell.y + dy };
      if (cells.has(key(adjacent))) edges.push({ a: `track:${cell.x},${cell.y}`, b: `track:${adjacent.x},${adjacent.y}` });
    }));
    return edges.sort((a, b) => `${a.a}|${a.b}`.localeCompare(`${b.a}|${b.b}`)).map((edge, index) => ({ id: `track-edge_${String(index + 1).padStart(6, '0')}`, ...edge, length: 1, kind: 'rail', direction: 'both' }));
  }

  function instantiateScenario(scenario) {
    requireValid(scenario);
    const definition = { id:scenario.id,name:scenario.name,seed:scenario.seed,credits:scenario.credits,
      grid:clone(scenario.grid),fleet:clone(scenario.fleet),stations:clone(scenario.stations),cities:clone(scenario.cities),
      services:clone(scenario.services),initialQueues:clone(scenario.initialQueues),
      trackCells:clone(scenario.trackCells),workingTimetable:scenario.workingTimetable }, queuesByOrigin = new Map();
    definition.initialQueues.forEach(queue => {
      if (!queuesByOrigin.has(queue.originStationId)) queuesByOrigin.set(queue.originStationId, {});
      queuesByOrigin.get(queue.originStationId)[queue.destinationStationId] = queue.count;
    });
    const cities = definition.cities.map(city => ({ ...city, waitingPassengers: queuesByOrigin.get(city.stationId) || {}, completedTrips: 0, transferCount: 0 }));
    const stations = definition.stations.map(station => ({ id: station.id, name: station.name, kind: station.kind, x: station.x, y: station.y,
      area: station.area, ...(station.layout?{layout:station.layout}:{}), ...(station.geography?{geography:station.geography}:{}), platformRefs:[...(station.platformRefs||[])],platformIds:(station.platformRefs||[]).map(ref=>`${station.id}:P${ref}`), cityId: station.cityId || null }));
    let locomotiveIndex = 0, coachIndex = 0;
    const locomotiveIds = Array.from({ length: definition.fleet.locomotives }, (_, index) => `locomotive-${definition.id}_${String(index + 1).padStart(6, '0')}`);
    const coachIds = Array.from({ length: definition.fleet.passengerCars }, (_, index) => `coach-${definition.id}_${String(index + 1).padStart(6, '0')}`);
    const trains = [], services = definition.services.map(service => {
      const trainId = `train-${service.id}`, allocation = service.allocation;
      const vehicleIds = coachIds.slice(coachIndex, coachIndex += allocation.passengerCars);
      trains.push({ id: trainId, serviceId: service.id, locomotiveId: allocation.locomotives ? locomotiveIds[locomotiveIndex++] : null,
        vehicleIds, status: 'idle', edgeId: null, stationId: service.stopIds[0], direction: 1, progress: 0, passengerJourneyIds: [] });
      return { id: service.id, name: service.name, number: service.number, stopIds: service.stopIds, routedLegIds: [], trainIds: [trainId],
        operatingPattern: service.operatingPattern, active: service.active !== false, color: service.color };
    });
    return {
      schemaVersion: 1, id: `game-${definition.id}`, name: definition.name, tick: 0, tickPhase: 'commands', seed: definition.seed,
      rngState: null, paused: true, speed: 1, credits: definition.credits, topologyRevision: 0, serviceRevision: 0, scheduleRevision: 0,
      grid: definition.grid, stations, trackEdges: buildTrackEdges(definition.trackCells), services, trains, journeys: [], cities,
      commands: [], events: [], ledger: [], metrics: { passengersMoved: 0, transfers: 0,
        movingTicks: 0, assignedTicks: 0, history: [] },
      configuration: { scenarioId: definition.id, trackCells: definition.trackCells,
        fleet: { ...definition.fleet, locomotiveIds, coachIds }, initialQueues: definition.initialQueues,
        ...(definition.workingTimetable?{workingTimetable:definition.workingTimetable}: {}) }
    };
  }

  return { SCENARIO_SCHEMA_VERSION, deepFreeze, canonicalSnapshot, trackCellsFromPolylines, defineScenario,
    validateScenario, instantiateScenario };
});
