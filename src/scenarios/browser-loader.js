(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RailScenarioLoader = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const catalog = Object.freeze([
    Object.freeze({ id:'paddington-west', name:'Paddington & the Western',
      description:'Analyse Great Western workings from Paddington through the Thames Valley, Cotswolds, Bristol, South Wales, West Wales, Devon and Cornwall.',
      difficulty:'advanced', learningGoals:Object.freeze(['Great Western trunk capacity','West of England service patterns','Devon and Cornwall operations','South Wales and Carmarthen flows','Passenger interchange resilience']),
      stationCount:120, serviceCount:14, deferred:true }),
    Object.freeze({ id:'euston-west-coast', name:'Avanti West Coast: Full Network',
      description:'Operate the complete Avanti West Coast calling-point network from Euston to the West Midlands, North West, North Wales and Scotland.',
      difficulty:'advanced', learningGoals:Object.freeze(['West Coast Main Line capacity','Branch and trunk regulation','Long-distance passenger connections','Real timetable operation']),
      stationCount:48, serviceCount:13, deferred:true }),
    Object.freeze({ id:'gb-national', name:'Great Britain: National Railway',
      description:'Run the complete geographic Great Britain railway with the national seven-day timetable and capacity-enforced train movements.',
      difficulty:'advanced', learningGoals:Object.freeze(['National timetable operation','Network-wide train movements','Infrastructure capacity','Passenger demand']),
      stationCount:2677, serviceCount:136844, serviceLabel:'TIMETABLE MOVEMENTS', deferred:true, runtime:'national' })
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
    ]) }),
    'euston-west-coast': Object.freeze({ global:'RailEustonWestCoastScenario', scripts:Object.freeze([
      'src/scenarios/maps/euston-west-coast.cif.js',
      'src/scenarios/maps/euston-west-coast.exact.js',
      'src/scenarios/euston-west-coast.js'
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
