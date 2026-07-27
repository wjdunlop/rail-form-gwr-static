(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RailScenarioLoader = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const catalog = Object.freeze([
    Object.freeze({ id:'paddington-west', name:'Paddington & the Western',
      description:'Build capacity and manage passenger connections from Paddington to Oxford, the Cotswolds, Bristol and South Wales.',
      difficulty:'advanced', learningGoals:Object.freeze(['Great Western trunk capacity','Oxford and Cotswold connections','Bristol and South Wales routing','Passenger interchange resilience']),
      stationCount:65, serviceCount:10, deferred:true })
  ]);

  const specifications = Object.freeze({
    'paddington-west': Object.freeze({ global:'RailPaddingtonWestScenario', scripts:Object.freeze([
      'src/scenarios/maps/paddington-west.mapping.js',
      'src/scenarios/maps/paddington-west.gtcl-routed.js',
      'src/scenarios/maps/paddington-west.gtcl-topology.js',
      'src/scenarios/maps/paddington-west.stations.js',
      'src/scenarios/maps/paddington-west.cif.js',
      'src/scenarios/maps/paddington-west.nesa.js',
      'src/scenarios/maps/paddington-west.odm.js',
      'src/scenarios/maps/paddington-west.external-demand.js',
      'src/scenarios/paddington-west.js'
    ]) })
  });
  const pending = new Map();

  function metadata() { return catalog; }
  function specification(id) { return specifications[id] || null; }
  function initialScenarioId() {
    if (typeof location === 'undefined') return null;
    const id = new URLSearchParams(location.search).get('scenario');
    return specification(id) ? id : null;
  }
  function writeInitialScripts() {
    if (typeof document === 'undefined' || typeof document.write !== 'function') return;
    const spec = specification(initialScenarioId());
    if (!spec) return;
    document.write(spec.scripts.map(src => `<script src="${src}"><\/script>`).join(''));
  }
  function appendScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src; script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Unable to load scenario asset: ${src}`));
      document.head.appendChild(script);
    });
  }
  function load(id) {
    const spec = specification(id);
    if (!spec) return Promise.resolve(root.RailScenarioRegistry?.get(id) || null);
    if (root.RailScenarioRegistry?.isLoaded(id)) return Promise.resolve(root.RailScenarioRegistry.get(id));
    if (root[spec.global]) {
      root.RailScenarioRegistry?.register(root[spec.global]);
      return Promise.resolve(root[spec.global]);
    }
    if (!pending.has(id)) pending.set(id, (async () => {
      for (const src of spec.scripts) await appendScript(src);
      const scenario = root[spec.global];
      if (!scenario) throw new Error(`Scenario ${id} did not register after its assets loaded.`);
      root.RailScenarioRegistry?.register(scenario);
      return scenario;
    })().finally(() => pending.delete(id)));
    return pending.get(id);
  }

  const api = Object.freeze({ metadata, specification, initialScenarioId, load, writeInitialScripts });
  writeInitialScripts();
  return api;
});
