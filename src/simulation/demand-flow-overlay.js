(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RailDemandFlowOverlay = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

  // Annual ODM demand describes every journey purpose. A bounded directional
  // component makes the weekday peak legible without removing off-peak travel.
  function directionalFactor(instant, originWeight, destinationWeight) {
    if (!instant || instant.dayIndex > 4) return 1;
    const hour = instant.secondOfDay / 3600;
    const bell = (centre, spread) => Math.exp(-0.5 * Math.pow((hour - centre) / spread, 2));
    const peakDirection = bell(8.25, 1.35) - bell(17.5, 1.65);
    const pull = Math.tanh(Math.log(Math.max(1, destinationWeight) / Math.max(1, originWeight)) / 2.5);
    return clamp(1 + peakDirection * pull * 0.55, 0.45, 1.55);
  }

  function aggregate(options = {}) {
    const demand = options.demand, instant = options.instant, routeFor = options.routeFor;
    if (!demand?.byOrigin || typeof routeFor !== 'function') return Object.freeze({ flows: Object.freeze([]), maximum: 0, totalPassengersPerHour: 0 });
    const stationById = new Map((options.stations || []).map(station => [station.id, station]));
    const temporal = Number(options.temporalMultiplier) || 0, segments = new Map();
    let totalPassengersPerHour = 0;
    for (const [originId, originFlows] of Object.entries(demand.byOrigin)) {
      const origin = stationById.get(originId), originFactor = Math.max(0, Number(options.originFactor?.(originId)) || 0);
      if (!origin || !originFactor) continue;
      for (const flow of originFlows) {
        const destination = stationById.get(flow.destinationId), journey = destination && routeFor(originId, flow.destinationId);
        if (!journey?.stations?.length || journey.stations.length < 2) continue;
        const rate = flow.passengersPerSecond * 3600 * temporal * originFactor * directionalFactor(instant, origin.population || 1, destination.population || 1);
        if (!(rate > 0)) continue;
        totalPassengersPerHour += rate;
        for (let index = 1; index < journey.stations.length; index += 1) {
          const fromId = journey.stations[index - 1], toId = journey.stations[index], classified = options.classifySegment?.({ fromId, toId, lineId: journey.lines?.[index - 1] || null, journey, index }), callingPattern = classified === 'nonstop' ? 'nonstop' : 'stopping', key = `${fromId}>${toId}|${callingPattern}`;
          const previous = segments.get(key);
          if (previous) previous.passengersPerHour += rate;
          else segments.set(key, { key, fromId, toId, callingPattern, passengersPerHour: rate, odFlows: 1 });
          if (previous) previous.odFlows += 1;
        }
      }
    }
    const flows = [...segments.values()].sort((a, b) => b.passengersPerHour - a.passengersPerHour || a.key.localeCompare(b.key));
    const maximum = flows[0]?.passengersPerHour || 0;
    return Object.freeze({
      flows: Object.freeze(flows.map(flow => Object.freeze({ ...flow, intensity: maximum ? flow.passengersPerHour / maximum : 0 }))),
      maximum,
      totalPassengersPerHour
    });
  }

  function colour(intensity) {
    const value = clamp(Number(intensity) || 0, 0, 1);
    if (value < 0.42) return '#3f7f8c';
    if (value < 0.72) return '#d18b32';
    return '#e95238';
  }

  return Object.freeze({ aggregate, directionalFactor, colour });
});
