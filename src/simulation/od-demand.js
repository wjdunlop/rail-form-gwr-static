(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RailODDemand = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FORMAT = 'rail-form-orr-origin-destination-demand';
  const VERSION = 1;
  const DEFAULT_SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;
  const RAW_HOURLY_DEMAND = Object.freeze([.08,.05,.04,.05,.12,.35,.95,1.85,2.15,1.45,1.05,1,1.1,1.15,1.05,1.1,1.45,2.05,1.95,1.35,.85,.55,.32,.18]);
  const RAW_WEEKDAY_DEMAND = Object.freeze([1.05,1.07,1.07,1.07,1.03,.78,.63]);
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const normalize = values => Object.freeze(values.map(value => value / (values.reduce((sum, item) => sum + item, 0) / values.length)));
  const HOURLY_DEMAND = normalize(RAW_HOURLY_DEMAND);
  const WEEKDAY_DEMAND = normalize(RAW_WEEKDAY_DEMAND);

  function validate(product, stationIds = null) {
    const errors = [];
    if (product?.format !== FORMAT || product?.version !== VERSION) errors.push('Unsupported passenger demand product.');
    if (!Number.isFinite(product?.secondsPerYear) || product.secondsPerYear <= 0) errors.push('Passenger demand requires a valid year length.');
    if (!Array.isArray(product?.flows)) errors.push('Passenger demand flows must be an array.');
    const allowed = stationIds ? new Set(stationIds) : null, seen = new Set();
    for (const row of product?.flows || []) {
      const [originId, destinationId, annualJourneys] = row || [], key = `${originId}>${destinationId}`;
      if (!originId || !destinationId || originId === destinationId) errors.push(`Invalid passenger flow ${key}.`);
      if (!Number.isSafeInteger(annualJourneys) || annualJourneys < 0) errors.push(`Invalid annual journeys for ${key}.`);
      if (allowed && (!allowed.has(originId) || !allowed.has(destinationId))) errors.push(`Unknown station in passenger flow ${key}.`);
      if (seen.has(key)) errors.push(`Duplicate passenger flow ${key}.`);
      seen.add(key);
    }
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
  }

  function compile(product, stationIds = null) {
    const result = validate(product, stationIds);
    if (!result.valid) throw new TypeError(result.errors.join(' '));
    const secondsPerYear = product.secondsPerYear || DEFAULT_SECONDS_PER_YEAR, byOrigin = {}, annualByOrigin = {};
    for (const [originId, destinationId, annualJourneys] of product.flows) {
      (byOrigin[originId] ||= []).push(Object.freeze({ destinationId, annualJourneys, passengersPerSecond: annualJourneys / secondsPerYear }));
      annualByOrigin[originId] = (annualByOrigin[originId] || 0) + annualJourneys;
    }
    Object.values(byOrigin).forEach(flows => Object.freeze(flows));
    return Object.freeze({ source: product.source, summary: product.summary, secondsPerYear, byOrigin: Object.freeze(byOrigin), annualByOrigin: Object.freeze(annualByOrigin) });
  }

  // The ODM is the observed baseline. Service availability and completed travel
  // can induce a bounded uplift without replacing that evidence with population gravity.
  function inducedDemandFactor(activeServices, completedTrips, annualOriginJourneys) {
    if (!activeServices) return 0.25;
    const serviceUplift = clamp((activeServices - 1) * 0.015, 0, 0.15);
    const completionUplift = clamp((completedTrips / Math.max(1, annualOriginJourneys)) * 52, 0, 0.10);
    return 1 + serviceUplift + completionUplift;
  }

  // A normalized weekly commuter/leisure profile turns the annual ODM into a
  // clock-aware generation rate without changing its annual journey total.
  function temporalMultiplier(dayIndex, secondOfDay) {
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) throw new RangeError('Passenger demand dayIndex must be between 0 and 6.');
    if (!Number.isFinite(secondOfDay) || secondOfDay < 0 || secondOfDay >= 86400) throw new RangeError('Passenger demand secondOfDay must be within one day.');
    const hour = Math.floor(secondOfDay / 3600), fraction = (secondOfDay % 3600) / 3600;
    const hourly = HOURLY_DEMAND[hour] + (HOURLY_DEMAND[(hour + 1) % 24] - HOURLY_DEMAND[hour]) * fraction;
    return hourly * WEEKDAY_DEMAND[dayIndex];
  }

  function demandRate(annualJourneys, instant, factor = 1, secondsPerYear = DEFAULT_SECONDS_PER_YEAR) {
    if (!Number.isFinite(annualJourneys) || annualJourneys < 0) throw new RangeError('Annual passenger journeys must be non-negative.');
    if (!Number.isFinite(factor) || factor < 0) throw new RangeError('Passenger demand factor must be non-negative.');
    const multiplier = temporalMultiplier(instant?.dayIndex, instant?.secondOfDay);
    const passengersPerSecond = annualJourneys / secondsPerYear * factor * multiplier;
    return Object.freeze({ multiplier, passengersPerSecond, passengersPerHour: passengersPerSecond * 3600 });
  }

  function dailyProfile(annualJourneys, dayIndex, options = {}) {
    const stepMinutes = Number(options.stepMinutes || 30), factor = Number(options.factor ?? 1), secondsPerYear = Number(options.secondsPerYear || DEFAULT_SECONDS_PER_YEAR);
    if (!Number.isInteger(stepMinutes) || stepMinutes <= 0 || 1440 % stepMinutes) throw new RangeError('Passenger demand profile stepMinutes must divide one day.');
    const points = [];
    for (let minuteOfDay = 0; minuteOfDay <= 1440; minuteOfDay += stepMinutes) {
      const wrappedMinute = minuteOfDay % 1440, rate = demandRate(annualJourneys, { dayIndex, secondOfDay: wrappedMinute * 60 }, factor, secondsPerYear);
      points.push(Object.freeze({ minuteOfDay, multiplier: rate.multiplier, passengersPerHour: rate.passengersPerHour }));
    }
    return Object.freeze(points);
  }

  function seedQueues(product, windowSeconds = 300) {
    if (!Number.isFinite(windowSeconds) || windowSeconds < 0) throw new RangeError('Queue seed window must be non-negative.');
    const secondsPerYear = product.secondsPerYear || DEFAULT_SECONDS_PER_YEAR;
    return product.flows.map(([originStationId, destinationStationId, annualJourneys]) => ({
      id: `queue-odm-${originStationId}-${destinationStationId}`,
      originStationId,
      destinationStationId,
      count: Math.round(annualJourneys / secondsPerYear * windowSeconds)
    })).filter(queue => queue.count > 0);
  }

  return Object.freeze({ FORMAT, VERSION, DEFAULT_SECONDS_PER_YEAR, HOURLY_DEMAND, WEEKDAY_DEMAND, validate, compile, inducedDemandFactor, temporalMultiplier, demandRate, dailyProfile, seedQueues });
});
