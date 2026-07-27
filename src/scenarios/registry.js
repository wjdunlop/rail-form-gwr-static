(function (root, factory) {
  const common = typeof module === 'object' && module.exports;
  const api = factory(
    common ? require('./schema.js') : root.RailScenarioSchema,
    null,
    null,
    common ? require('./paddington-west.js') : root.RailPaddingtonWestScenario,
    null,
    common ? [] : (root.RailScenarioLoader?.metadata() || [])
  );
  if (common) module.exports = api;
  else root.RailScenarioRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Schema, Trunk, Transfer, PaddingtonWest, EustonWestCoast, DeferredMetadata) {
  'use strict';
  const order = ['paddington-west'];
  const byId = new Map();
  for (const scenario of [Trunk, Transfer, PaddingtonWest, EustonWestCoast].filter(Boolean)) byId.set(scenario.id, scenario);
  for (const metadata of DeferredMetadata || []) if (!byId.has(metadata.id)) byId.set(metadata.id, metadata);

  function list() { return Object.freeze(order.map(id => byId.get(id)).filter(Boolean)); }
  function get(id) { return byId.get(id) || null; }
  function isLoaded(id) { const scenario = get(id); return Boolean(scenario && scenario.deferred !== true); }
  function register(scenario) {
    if (!scenario?.id || !order.includes(scenario.id)) throw new RangeError(`Unknown scenario registration: ${scenario?.id || '<missing>'}.`);
    byId.set(scenario.id, scenario);
    return scenario;
  }
  function instantiate(id) {
    const scenario = get(id);
    if (!scenario) throw new RangeError(`Unknown scenario: ${id}.`);
    if (scenario.deferred === true) throw new RangeError(`Scenario ${id} has not been loaded.`);
    return Schema.instantiateScenario(scenario);
  }
  function validateAll() {
    return list().filter(scenario => scenario.deferred !== true).map(scenario => ({ id: scenario.id, ...Schema.validateScenario(scenario) }));
  }

  return Object.freeze({ list, get, isLoaded, register, instantiate, validateAll });
});
