(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RailEventLog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SEVERITIES = Object.freeze(['info', 'warning', 'error', 'critical']);
  const ROUTINE_TYPES = new Set(['train.arrived', 'train.departed', 'passenger.completed']);
  const ERROR_TYPES = new Set(['train.deadlock', 'service.blocked', 'platform.conflict', 'validation.error']);
  const WARNING_TYPES = new Set(['passenger.denied', 'passenger.abandoned', 'signal.wait', 'connection.missed']);
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  const data = event => ({ ...event, ...(event.payload || {}) });

  function severityOf(event) {
    const explicit = event.severity || event.payload?.severity;
    if (SEVERITIES.includes(explicit)) return explicit;
    const code = String(event.code || event.payload?.code || '');
    if (/(?:BLOCKED|CONFLICT|DEADLOCK|ERROR|DEFAULT)/.test(code)) return 'error';
    if (/(?:STARV|CONGEST|DENIED|ABANDON|MISSED|WAIT)/.test(code)) return 'warning';
    if (ERROR_TYPES.has(event.type) || /(?:^|\.)(?:error|blocked|deadlock|conflict|default)$/.test(event.type || '')) return 'error';
    if (WARNING_TYPES.has(event.type) || /(?:starved|starvation|congestion|denied|abandoned|missed|wait)$/.test(event.type || '')) return 'warning';
    return 'info';
  }

  function eventCopy(event) {
    const item = data(event), count = Number(item.count ?? item.amount ?? 1) || 1;
    const titles = {
      'train.arrived': 'Train arrived', 'train.departed': 'Train departed', 'passenger.completed': 'Passenger journey completed',
      'passenger.denied': 'Passengers left behind', 'passenger.abandoned': 'Passengers abandoned journey',
      'signal.wait': 'Train held at signal', 'platform.conflict': 'Platform conflict',
      'train.deadlock': 'Train deadlock', 'connection.missed': 'Connection missed'
    };
    const location = item.stationName || item.stationId || item.blockId || item.signalId || null;
    return { id: String(event.id || `${event.type}:${event.tick || 0}`), type: event.type || 'event', tick: Number(event.tick) || 0,
      severity: severityOf(event), title: item.title || titles[event.type] || String(event.type || 'Event').replaceAll('.', ' '), location,
      serviceId: item.serviceId || item.lineId || null, trainId: item.trainId || null, count, message: item.message || null,
      actionable: severityOf(event) !== 'info' && !ROUTINE_TYPES.has(event.type), sourceEventIds: [String(event.id || `${event.type}:${event.tick || 0}`)] };
  }

  function coalesceKey(item) {
    if (!ROUTINE_TYPES.has(item.type)) return null;
    return `${item.type}|${item.serviceId || ''}|${item.location || ''}`;
  }

  function coalesceEvents(events, options = {}) {
    const span = Math.max(0, Number(options.coalesceWindowTicks ?? 10)), groups = [], latestByKey = new Map();
    [...(events || [])].sort((a, b) => (a.tick || 0) - (b.tick || 0) || String(a.id || '').localeCompare(String(b.id || ''))).forEach(event => {
      const item = eventCopy(event), key = coalesceKey(item), existing = key ? latestByKey.get(key) : null;
      if (existing && item.tick - existing.toTick <= span) {
        existing.toTick = item.tick;
        existing.tick = item.tick;
        existing.count += item.count;
        existing.occurrences += 1;
        existing.sourceEventIds.push(...item.sourceEventIds);
        existing.title = `${existing.occurrences} × ${item.title}`;
      } else {
        item.fromTick = item.tick; item.toTick = item.tick; item.occurrences = 1;
        groups.push(item);
        if (key) latestByKey.set(key, item);
      }
    });
    return groups;
  }

  function createEventLog(events, options = {}) {
    const enabled = new Set(options.severities || SEVERITIES), minimum = Math.max(0, SEVERITIES.indexOf(options.minimumSeverity || 'info'));
    const fromTick = Number.isFinite(options.fromTick) ? options.fromTick : -Infinity, toTick = Number.isFinite(options.toTick) ? options.toTick : Infinity;
    const query = String(options.query || '').trim().toLowerCase();
    let items = coalesceEvents((events || []).filter(event => (event.tick || 0) >= fromTick && (event.tick || 0) <= toTick), options)
      .filter(item => enabled.has(item.severity) && SEVERITIES.indexOf(item.severity) >= minimum)
      .filter(item => !options.actionableOnly || item.actionable)
      .filter(item => !query || `${item.title} ${item.location || ''} ${item.serviceId || ''} ${item.message || ''}`.toLowerCase().includes(query))
      .sort((a, b) => b.tick - a.tick || SEVERITIES.indexOf(b.severity) - SEVERITIES.indexOf(a.severity) || a.id.localeCompare(b.id));
    if (Number.isSafeInteger(options.limit)) items = items.slice(0, Math.max(0, options.limit));
    const severityCounts = Object.fromEntries(SEVERITIES.map(severity => [severity, items.filter(item => item.severity === severity).length]));
    return freeze({ items, filters: { severities: [...enabled].sort((a, b) => SEVERITIES.indexOf(a) - SEVERITIES.indexOf(b)), minimumSeverity: options.minimumSeverity || 'info',
      actionableOnly: Boolean(options.actionableOnly), query: options.query || '' }, severityCounts,
      alertCount: items.filter(item => item.actionable).length, compact: options.compact !== false,
      configuration: { fromTick: options.fromTick ?? null, toTick: options.toTick ?? null, coalesceWindowTicks: options.coalesceWindowTicks ?? 10,
        limit: options.limit ?? null, compact: options.compact !== false } });
  }

  function reduceEventLog(model, action, events) {
    const options = { ...clone(model.configuration), ...clone(model.filters) };
    if (options.fromTick === null) delete options.fromTick;
    if (options.toTick === null) delete options.toTick;
    if (options.limit === null) delete options.limit;
    if (action?.type === 'TOGGLE_SEVERITY') options.severities = model.filters.severities.includes(action.severity) ?
      model.filters.severities.filter(item => item !== action.severity) : [...model.filters.severities, action.severity];
    else if (action?.type === 'SET_MINIMUM_SEVERITY') options.minimumSeverity = action.severity;
    else if (action?.type === 'SET_ACTIONABLE_ONLY') options.actionableOnly = Boolean(action.value);
    else if (action?.type === 'SEARCH') options.query = action.value;
    else return model;
    return createEventLog(events, options);
  }

  return { SEVERITIES, ROUTINE_TYPES, severityOf, eventCopy, coalesceEvents, createEventLog, reduceEventLog };
});
