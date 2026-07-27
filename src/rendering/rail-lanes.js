(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RailLaneRouting = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const offsets = movement => movement === 'up'
    ? { movement: 'up', through: -1, stopping: -3 }
    : { movement: 'down', through: 1, stopping: 3 };
  const platformOffset = number => {
    const value = Math.max(1, Math.floor(Number(number) || 1));
    return value % 2 ? -3 - Math.floor((value - 1) / 2) * 2 : 3 + Math.floor((value - 2) / 2) * 2;
  };
  const clamp = value => Math.max(0, Math.min(1, value));
  const smoothstep = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

  function endpointBlend(progress, stepIndex, stepCount, transition = .2) {
    let weight = 0;
    if (stepIndex === 0) weight = Math.max(weight, 1 - smoothstep(progress / transition));
    if (stepIndex === stepCount - 1) weight = Math.max(weight, smoothstep((progress - (1 - transition)) / transition));
    return clamp(weight);
  }

  const roadAt = (progress, stepIndex, stepCount, movement) => {
    const lane = offsets(movement), blend = endpointBlend(progress, stepIndex, stepCount);
    return { ...lane, blend, offset: lane.through + (lane.stopping - lane.through) * blend, mode: blend > .5 ? 'stopping' : 'through' };
  };

  return { offsets, platformOffset, endpointBlend, roadAt };
});
