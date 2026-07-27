(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RailSelectors = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function readonly(value) {
    if (value === null || typeof value !== 'object') return value;
    const copy = Array.isArray(value) ? value.map(readonly) : Object.fromEntries(Object.entries(value).map(([key, child]) => [key, readonly(child)]));
    return Object.freeze(copy);
  }

  function collection(state, name) {
    return Array.isArray(state?.[name]) ? state[name] : [];
  }

  function byId(state, name, id) {
    const record = collection(state, name).find(item => item.id === id);
    return record ? readonly(record) : null;
  }

  function indexById(state, name) {
    return Object.freeze(Object.fromEntries(collection(state, name).map(item => [item.id, readonly(item)])));
  }

  function servicesAtStation(state, stationId) {
    return readonly(collection(state, 'services')
      .filter(service => service.stopIds?.includes(stationId))
      .sort((a, b) => (a.number || 0) - (b.number || 0) || String(a.id).localeCompare(String(b.id))));
  }

  function trainsForService(state, serviceId) {
    return readonly(collection(state, 'trains').filter(train => train.serviceId === serviceId).sort((a, b) => String(a.id).localeCompare(String(b.id))));
  }

  function waitingJourneysAt(state, stationId) {
    return readonly(collection(state, 'journeys').filter(journey => {
      if (!['waiting', 'transferring'].includes(journey.status)) return false;
      const leg = journey.legs?.[journey.currentLegIndex || 0];
      return leg?.boardStationId === stationId;
    }).sort((a, b) => (a.createdTick || 0) - (b.createdTick || 0) || String(a.id).localeCompare(String(b.id))));
  }


  function revisionKey(state) {
    return `${state?.topologyRevision || 0}:${state?.serviceRevision || 0}:${state?.scheduleRevision || 0}`;
  }

  function networkSummary(state) {
    return readonly({ tick: state?.tick || 0, credits: state?.credits || 0, stations: collection(state, 'stations').length,
      services: collection(state, 'services').length, trains: collection(state, 'trains').length,
      waitingJourneys: collection(state, 'journeys').filter(journey => ['waiting', 'transferring'].includes(journey.status)).length,
      revisionKey: revisionKey(state) });
  }

  return { readonly, collection: (state, name) => readonly(collection(state, name)), byId, indexById, servicesAtStation,
    trainsForService, waitingJourneysAt, revisionKey, networkSummary };
});
