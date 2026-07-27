(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RailScenarioBrowser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const defaults = Object.freeze({
    trunk: { difficulty: 'intermediate', learningGoals: ['Trunk and branch planning', 'Passenger capacity', 'Service frequency'] },
    transfer: { difficulty: 'advanced', learningGoals: ['Passenger transfers', 'Interchange design', 'Network connectivity'] }
  });

  function scenarioCards(registry, options = {}) {
    const query = String(options.search || '').trim().toLowerCase(), difficulty = options.difficulty || 'all';
    return Object.freeze(registry.list().map(scenario => {
      const fallback = defaults[scenario.id] || {}, learningGoals = scenario.learningGoals || fallback.learningGoals || [];
      return { id: scenario.id, key: `scenario:${scenario.id}`, name: scenario.name, description: scenario.description,
        difficulty: scenario.difficulty || fallback.difficulty || 'intermediate', learningGoals: [...learningGoals],
        stationCount: scenario.stations?.length || scenario.stationCount || 0,
        serviceCount: scenario.services?.length || scenario.serviceCount || 0, serviceLabel:scenario.serviceLabel || 'SERVICES', selected: scenario.id === options.selectedScenarioId };
    }).filter(card => difficulty === 'all' || card.difficulty === difficulty)
      .filter(card => !query || `${card.name} ${card.description} ${card.difficulty} ${card.learningGoals.join(' ')}`.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name)).map(Object.freeze));
  }

  function createBrowserModel(registry, options = {}) {
    const cards = scenarioCards(registry, options), selectedScenarioId = cards.some(card => card.id === options.selectedScenarioId) ?
      options.selectedScenarioId : cards[0]?.id || null;
    return Object.freeze({ search: options.search || '', difficulty: options.difficulty || 'all', cards,
      selectedScenarioId, effect: null, status: cards.length ? 'ready' : 'empty' });
  }

  function reduceScenarioBrowser(model, action, registry) {
    if (action?.type === 'SEARCH') return createBrowserModel(registry, { ...model, search: action.value, selectedScenarioId: model.selectedScenarioId });
    if (action?.type === 'FILTER_DIFFICULTY') return createBrowserModel(registry, { ...model, difficulty: action.value, selectedScenarioId: model.selectedScenarioId });
    const next = { ...model, effect: null }, ids = model.cards.map(card => card.id), current = Math.max(0, ids.indexOf(model.selectedScenarioId));
    if (action?.type === 'SELECT') next.selectedScenarioId = action.scenarioId;
    if (action?.type === 'KEYBOARD') {
      if ((action.key === 'ArrowDown' || action.key === 'ArrowRight') && ids.length) next.selectedScenarioId = ids[Math.min(ids.length - 1, current + 1)];
      else if ((action.key === 'ArrowUp' || action.key === 'ArrowLeft') && ids.length) next.selectedScenarioId = ids[Math.max(0, current - 1)];
      else if (action.key === 'Enter' && next.selectedScenarioId) next.effect = { type: 'START_SCENARIO', scenarioId: next.selectedScenarioId };
      else if (action.key === '/') next.effect = { type: 'FOCUS_SEARCH' };
      else if (action.key === 'Escape') next.effect = { type: 'CLOSE' };
    }
    return Object.freeze(next);
  }

  function requestStart(registry, scenarioId, options = {}) {
    const scenario = registry.get(scenarioId);
    if (!scenario) return { status: 'error', error: { code: 'UNKNOWN_SCENARIO', scenarioId } };
    if (options.hasUnsavedProgress && !options.confirmed) return { status: 'confirmation-required', confirmation: Object.freeze({
      kind: 'replace-current-game', title: `Start “${scenario.name}”?`, body: 'Unsaved progress in the current game will be replaced.',
      destructive: true, payload: Object.freeze({ scenarioId }) }) };
    try { return { status: 'started', scenarioId, state: registry.instantiate(scenarioId) }; }
    catch (error) { return { status: 'error', error: { code: 'SCENARIO_INVALID', message: error.message } }; }
  }

  return { scenarioCards, createBrowserModel, reduceScenarioBrowser, requestStart };
});
