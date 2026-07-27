(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RailRng = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function seedFrom(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return (value >>> 0) || 0x6d2b79f5;
    const text = String(value ?? 'rail-form');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) || 0x6d2b79f5;
  }

  function createRng(seed) {
    let state = seedFrom(seed);
    const api = {
      nextUint32() {
        state += 0x6d2b79f5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return (value ^ (value >>> 14)) >>> 0;
      },
      nextFloat() {
        return api.nextUint32() / 4294967296;
      },
      int(min, max) {
        if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max <= min) {
          throw new RangeError('RNG integer bounds must be safe integers with max greater than min.');
        }
        return min + Math.floor(api.nextFloat() * (max - min));
      },
      chance(probability) {
        if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
          throw new RangeError('Probability must be between 0 and 1.');
        }
        return api.nextFloat() < probability;
      },
      pick(values) {
        if (!values || !values.length) return undefined;
        return values[api.int(0, values.length)];
      },
      shuffle(values) {
        const result = Array.from(values || []);
        for (let index = result.length - 1; index > 0; index -= 1) {
          const other = api.int(0, index + 1);
          [result[index], result[other]] = [result[other], result[index]];
        }
        return result;
      },
      snapshot() {
        return state >>> 0;
      },
      restore(snapshot) {
        if (!Number.isSafeInteger(snapshot) || snapshot < 0 || snapshot > 0xffffffff) {
          throw new TypeError('RNG snapshot must be an unsigned 32-bit integer.');
        }
        state = snapshot >>> 0;
        return api;
      },
      fork(label) {
        return createRng(`${state >>> 0}:${String(label)}`);
      }
    };
    return Object.freeze(api);
  }

  return { seedFrom, createRng };
});
