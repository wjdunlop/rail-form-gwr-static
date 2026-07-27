(function (root, factory) {
  const migrations = typeof module === 'object' && module.exports ? require('./migrations.js') : root.RailPersistenceMigrations;
  const api = factory(migrations);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RailPersistenceCodec = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Migrations) {
  'use strict';

  const MAX_SAVE_BYTES = 8 * 1024 * 1024;
  const dangerousKeys = new Set(['__proto__', 'prototype', 'constructor']);

  class SaveValidationError extends Error {
    constructor(message, cause) { super(message, { cause }); this.name = 'SaveValidationError'; }
  }

  const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

  function validateJsonValue(value, currentPath = '$', ancestors = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new SaveValidationError(`${currentPath} must be a finite number.`);
      return;
    }
    if (typeof value !== 'object') throw new SaveValidationError(`${currentPath} is not JSON serializable.`);
    if (ancestors.has(value)) throw new SaveValidationError(`${currentPath} contains a cycle.`);
    if (!Array.isArray(value) && !plainObject(value)) throw new SaveValidationError(`${currentPath} must contain only plain JSON objects.`);
    ancestors.add(value);
    if (Array.isArray(value)) value.forEach((item, index) => validateJsonValue(item, `${currentPath}[${index}]`, ancestors));
    else Object.keys(value).forEach(key => {
      if (dangerousKeys.has(key)) throw new SaveValidationError(`${currentPath} contains forbidden key ${key}.`);
      validateJsonValue(value[key], `${currentPath}.${key}`, ancestors);
    });
    ancestors.delete(value);
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!plainObject(value)) return value;
    const result = {};
    Object.keys(value).sort().forEach(key => { result[key] = canonicalize(value[key]); });
    return result;
  }

  function canonicalStringify(value) {
    validateJsonValue(value);
    return JSON.stringify(canonicalize(value));
  }

  function utf8Bytes(text) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).byteLength;
    return unescape(encodeURIComponent(text)).length;
  }

  function validateEnvelope(save) {
    validateJsonValue(save);
    if (!plainObject(save) || save.format !== Migrations.SAVE_FORMAT || save.version !== Migrations.SAVE_FORMAT_VERSION) {
      throw new SaveValidationError('Save envelope has an unsupported format or version.');
    }
    if (!plainObject(save.metadata)) throw new SaveValidationError('Save metadata must be an object.');
    if (!plainObject(save.state)) throw new SaveValidationError('Save state must be an object.');
    if (!Number.isSafeInteger(save.state.schemaVersion) || save.state.schemaVersion < 1) {
      throw new SaveValidationError('State schemaVersion must be a positive integer.');
    }
    if (save.state.tick !== undefined && (!Number.isSafeInteger(save.state.tick) || save.state.tick < 0)) {
      throw new SaveValidationError('State tick must be a non-negative integer.');
    }
    return save;
  }

  function encode(state, metadata = {}) {
    validateJsonValue(state, '$.state');
    validateJsonValue(metadata, '$.metadata');
    const save = Migrations.migrateDocument(state?.format ? state : { ...state }, metadata);
    validateEnvelope(save);
    const encoded = canonicalStringify(save);
    if (utf8Bytes(encoded) > MAX_SAVE_BYTES) throw new SaveValidationError(`Encoded save exceeds ${MAX_SAVE_BYTES} bytes.`);
    return encoded;
  }

  function decode(text, options = {}) {
    if (typeof text !== 'string') throw new SaveValidationError('Encoded save must be a string.');
    const maxBytes = options.maxBytes || MAX_SAVE_BYTES;
    if (utf8Bytes(text) > maxBytes) throw new SaveValidationError(`Encoded save exceeds ${maxBytes} bytes.`);
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (error) { throw new SaveValidationError('Encoded save is not valid JSON.', error); }
    try {
      validateJsonValue(parsed);
      const migrated = Migrations.migrateDocument(parsed, options.metadata);
      return validateEnvelope(migrated);
    } catch (error) {
      if (error instanceof SaveValidationError) throw error;
      throw new SaveValidationError(error.message, error);
    }
  }

  return { MAX_SAVE_BYTES, SaveValidationError, validateJsonValue, validateEnvelope, canonicalStringify, encode, decode };
});
