(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RailIds = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ID_PATTERN = /^([a-z][a-z0-9-]*)_([0-9a-z]+)$/;

  function normalizePrefix(prefix) {
    const normalized = String(prefix || 'entity')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return /^[a-z]/.test(normalized) ? normalized : `entity-${normalized || 'id'}`;
  }

  function createId(prefix, sequence) {
    if (!Number.isSafeInteger(sequence) || sequence < 0) {
      throw new TypeError('ID sequence must be a non-negative safe integer.');
    }
    return `${normalizePrefix(prefix)}_${sequence.toString(36).padStart(6, '0')}`;
  }

  function parseId(id) {
    const match = ID_PATTERN.exec(String(id));
    if (!match) return null;
    const sequence = Number.parseInt(match[2], 36);
    return Number.isSafeInteger(sequence)
      ? Object.freeze({ id: String(id), prefix: match[1], sequence })
      : null;
  }

  function isId(id, prefix) {
    const parsed = parseId(id);
    return Boolean(parsed && (prefix === undefined || parsed.prefix === normalizePrefix(prefix)));
  }

  function compareIds(a, b) {
    return String(a).localeCompare(String(b), 'en', { numeric: true });
  }

  function createIdFactory(initialCounters) {
    const counters = Object.create(null);
    Object.entries(initialCounters || {}).forEach(([prefix, value]) => {
      if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('ID counters must be non-negative safe integers.');
      counters[normalizePrefix(prefix)] = value;
    });
    return Object.freeze({
      next(prefix) {
        const key = normalizePrefix(prefix);
        const sequence = counters[key] || 0;
        counters[key] = sequence + 1;
        return createId(key, sequence);
      },
      reserve(id) {
        const parsed = parseId(id);
        if (!parsed) throw new TypeError(`Invalid canonical ID: ${id}`);
        counters[parsed.prefix] = Math.max(counters[parsed.prefix] || 0, parsed.sequence + 1);
        return id;
      },
      snapshot() {
        return Object.freeze({ ...counters });
      }
    });
  }

  return { ID_PATTERN, normalizePrefix, createId, parseId, isId, compareIds, createIdFactory };
});
