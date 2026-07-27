(function (root, factory) {
  const codec = typeof module === 'object' && module.exports ? require('./codec.js') : root.RailPersistenceCodec;
  const api = factory(codec);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RailPersistenceRepository = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DefaultCodec) {
  'use strict';

  class PersistenceError extends Error {
    constructor(message, cause) { super(message, { cause }); this.name = 'PersistenceError'; }
  }
  class SaveNotFoundError extends PersistenceError { constructor(name) { super(`Save not found: ${name}.`); this.name = 'SaveNotFoundError'; } }

  const validName = name => {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 64) throw new PersistenceError('Save slot name must contain 1–64 characters.');
    return name.trim();
  };
  const clone = value => JSON.parse(JSON.stringify(value));

  class SaveRepository {
    constructor(options = {}) {
      const storage = options.storage;
      if (!storage || ['getItem', 'setItem', 'removeItem'].some(method => typeof storage[method] !== 'function')) {
        throw new TypeError('A storage adapter with getItem, setItem, and removeItem is required.');
      }
      this.storage = storage;
      this.codec = options.codec || DefaultCodec;
      this.namespace = options.namespace || 'railform:saves';
      this.autosaveLimit = Math.max(1, Number.isSafeInteger(options.autosaveLimit) ? options.autosaveLimit : 5);
      this.clock = options.clock || (() => new Date());
      this.sequence = 0;
    }

    key(kind, id) { return `${this.namespace}:${kind}${id === undefined ? '' : `:${encodeURIComponent(id)}`}`; }
    now() {
      const value = this.clock();
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) throw new PersistenceError('Persistence clock returned an invalid date.');
      return date.toISOString();
    }
    readIndex(kind) {
      const raw = this.storage.getItem(this.key(`${kind}-index`));
      if (raw === null) return [];
      try {
        const value = JSON.parse(raw);
        if (!Array.isArray(value) || value.some(entry => !entry || typeof entry.id !== 'string' || typeof entry.savedAt !== 'string')) throw new Error('invalid index shape');
        return value;
      } catch (error) { throw new PersistenceError(`${kind} index is corrupted.`, error); }
    }
    writeIndex(kind, entries) { this.storage.setItem(this.key(`${kind}-index`), this.codec.canonicalStringify(entries)); }

    saveSlot(name, state, metadata = {}) {
      const id = validName(name), savedAt = this.now();
      const encoded = this.codec.encode(state, { ...clone(metadata), name: id, savedAt });
      const index = this.readIndex('slot').filter(entry => entry.id !== id);
      this.storage.setItem(this.key('slot', id), encoded);
      index.push({ id, savedAt });
      index.sort((a, b) => a.id.localeCompare(b.id));
      this.writeIndex('slot', index);
      return { id, savedAt };
    }
    loadSlot(name) {
      const id = validName(name), raw = this.storage.getItem(this.key('slot', id));
      if (raw === null) throw new SaveNotFoundError(id);
      return this.codec.decode(raw);
    }
    listSlots() { return clone(this.readIndex('slot')); }
    deleteSlot(name) {
      const id = validName(name), existed = this.storage.getItem(this.key('slot', id)) !== null;
      const index = this.readIndex('slot').filter(entry => entry.id !== id);
      this.storage.removeItem(this.key('slot', id));
      this.writeIndex('slot', index);
      return existed;
    }
    exportSlot(name) { return this.codec.canonicalStringify(this.loadSlot(name)); }
    importSlot(name, encoded, metadata = {}) {
      const save = this.codec.decode(encoded);
      return this.saveSlot(name, save.state, { ...save.metadata, ...clone(metadata), imported: true });
    }
    exportState(state, metadata = {}) { return this.codec.encode(state, { ...clone(metadata), exportedAt: this.now() }); }
    importState(encoded) { return this.codec.decode(encoded).state; }

    autosave(state, metadata = {}) {
      const savedAt = this.now();
      const index = this.readIndex('autosave');
      let id;
      do { id = `${savedAt}_${String(++this.sequence).padStart(4, '0')}`; }
      while (index.some(entry => entry.id === id));
      const encoded = this.codec.encode(state, { ...clone(metadata), autosave: true, savedAt });
      this.storage.setItem(this.key('autosave', id), encoded);
      index.unshift({ id, savedAt });
      const removed = index.splice(this.autosaveLimit);
      this.writeIndex('autosave', index);
      removed.forEach(entry => this.storage.removeItem(this.key('autosave', entry.id)));
      return { id, savedAt };
    }
    listAutosaves() { return clone(this.readIndex('autosave')); }
    loadAutosave(id) {
      const safeId = validName(id), raw = this.storage.getItem(this.key('autosave', safeId));
      if (raw === null) throw new SaveNotFoundError(safeId);
      return this.codec.decode(raw);
    }
    loadLatestAutosave() {
      const latest = this.readIndex('autosave')[0];
      if (!latest) throw new SaveNotFoundError('latest autosave');
      return this.loadAutosave(latest.id);
    }
  }

  return { PersistenceError, SaveNotFoundError, SaveRepository };
});
