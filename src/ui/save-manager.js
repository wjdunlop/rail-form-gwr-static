(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RailSaveManager = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const errorModel = error => ({ name: error?.name || 'Error', message: error?.message || String(error) });
  const confirmation = (kind, title, body, payload) => Object.freeze({ kind, title, body, destructive: ['overwrite','delete','import-overwrite'].includes(kind), payload: clone(payload) });

  function refresh(repository, ui = {}) {
    let slots = [], autosaves = [], corruption = null;
    try { slots = repository.listSlots(); }
    catch (error) { corruption = { source: 'slot-index', error: errorModel(error) }; }
    try { autosaves = repository.listAutosaves(); }
    catch (error) { corruption ||= { source: 'autosave-index', error: errorModel(error) }; }
    const orderedSlots = slots.map(slot => ({ id: slot.id, key: `save-slot:${slot.id}`, name: slot.id, savedAt: slot.savedAt }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const selectedSlotId = orderedSlots.some(slot => slot.id === ui.selectedSlotId) ? ui.selectedSlotId : orderedSlots[0]?.id || null;
    const cards = orderedSlots.map(slot => ({ ...slot, selected: slot.id === selectedSlotId }));
    const history = autosaves.map((save, index) => ({ id: save.id, key: `autosave:${save.id}`, savedAt: save.savedAt,
      label: index === 0 ? 'Latest autosave' : `Autosave ${index + 1}` }));
    return Object.freeze({ status: corruption ? 'corrupt-index' : 'ready', cards: Object.freeze(cards.map(Object.freeze)),
      autosaveHistory: Object.freeze(history.map(Object.freeze)), selectedSlotId,
      corruption: corruption ? Object.freeze(corruption) : null });
  }

  function saveNamed(repository, name, state, options = {}) {
    const existing = repository.listSlots().some(slot => slot.id === String(name).trim());
    if (existing && !options.confirmed) return { status: 'confirmation-required', confirmation: confirmation('overwrite',
      `Overwrite “${String(name).trim()}”?`, 'The previous contents of this named save will be replaced.', { name, state, metadata: options.metadata || {} }) };
    try { return { status: 'saved', slot: repository.saveSlot(name, state, options.metadata) }; }
    catch (error) { return { status: 'error', error: errorModel(error) }; }
  }

  function deleteNamed(repository, name, options = {}) {
    if (!options.confirmed) return { status: 'confirmation-required', confirmation: confirmation('delete',
      `Delete “${name}”?`, 'This named save will be removed. Autosaves are unaffected.', { name }) };
    try { return { status: repository.deleteSlot(name) ? 'deleted' : 'not-found', id: name }; }
    catch (error) { return { status: 'error', error: errorModel(error) }; }
  }

  function autosave(repository, state, metadata = {}) {
    try { return { status: 'autosaved', save: repository.autosave(state, metadata) }; }
    catch (error) { return { status: 'error', error: errorModel(error) }; }
  }

  function loadWithRecovery(repository, name) {
    try { return { status: 'loaded', source: 'slot', id: name, save: repository.loadSlot(name) }; }
    catch (error) {
      try {
        const recovery = repository.loadLatestAutosave();
        return { status: 'recovery-available', failedSlotId: name, error: errorModel(error),
          recovery: { source: 'autosave', save: recovery, savedAt: recovery.metadata?.savedAt || null } };
      } catch (recoveryError) {
        return { status: 'unrecoverable', failedSlotId: name, error: errorModel(error), recoveryError: errorModel(recoveryError) };
      }
    }
  }

  function exportPayload(repository, name) {
    try { return { status: 'ready', filename: `${String(name).trim().replace(/[^a-z0-9_-]+/gi, '-')}.railform.json`,
      mimeType: 'application/json', text: repository.exportSlot(name) }; }
    catch (error) { return { status: 'error', error: errorModel(error) }; }
  }

  function prepareImport(repository, text, suggestedName = 'Imported save') {
    try {
      const envelope = repository.codec.decode(text);
      return { status: 'valid', name: suggestedName, envelope: clone(envelope), summary: { gameName: envelope.state.name || 'Unnamed railway',
        tick: envelope.state.tick || 0, schemaVersion: envelope.state.schemaVersion, exportedAt: envelope.metadata?.exportedAt || null } };
    } catch (error) { return { status: 'corrupt', error: errorModel(error), recovery: { canRetry: true, preserveCurrentGame: true } }; }
  }

  function importPrepared(repository, prepared, options = {}) {
    if (prepared.status !== 'valid') return { status: 'error', error: { name: 'ImportError', message: 'Import payload has not passed validation.' } };
    const exists = repository.listSlots().some(slot => slot.id === prepared.name);
    if (exists && !options.confirmed) return { status: 'confirmation-required', confirmation: confirmation('import-overwrite',
      `Replace “${prepared.name}” with imported data?`, 'The existing named save will be overwritten after the import is validated.', { name: prepared.name }) };
    try { return { status: 'imported', slot: repository.importSlot(prepared.name, JSON.stringify(prepared.envelope), { source: 'file-import' }) }; }
    catch (error) { return { status: 'error', error: errorModel(error) }; }
  }

  function reduceSaveUI(model, action) {
    const next = { ...clone(model), effect: null }, ids = (model.cards || []).map(card => card.id);
    const current = Math.max(0, ids.indexOf(model.selectedSlotId));
    if (action?.type === 'KEYBOARD') {
      if (action.key === 'ArrowDown' && ids.length) next.selectedSlotId = ids[Math.min(ids.length - 1, current + 1)];
      else if (action.key === 'ArrowUp' && ids.length) next.selectedSlotId = ids[Math.max(0, current - 1)];
      else if (action.key === 'Enter' && next.selectedSlotId) next.effect = { type: 'LOAD', slotId: next.selectedSlotId };
      else if (action.key === 'Delete' && next.selectedSlotId) next.effect = { type: 'CONFIRM_DELETE', slotId: next.selectedSlotId };
      else if ((action.ctrlKey || action.metaKey) && String(action.key).toLowerCase() === 's') next.effect = { type: 'SAVE_CURRENT' };
      else if (action.key === 'Escape') next.effect = { type: 'CLOSE' };
    } else if (action?.type === 'SELECT') next.selectedSlotId = action.slotId;
    return Object.freeze(next);
  }

  return { refresh, saveNamed, deleteNamed, autosave, loadWithRecovery, exportPayload, prepareImport, importPrepared, reduceSaveUI };
});
