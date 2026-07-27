(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RailSemanticZoom = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function profile(zoom) {
    const value = Number(zoom) || 0;
    if (value < 10) return Object.freeze({ level: 'overview', gridStep: 4, corridorOffsets: Object.freeze([-1, 1]), railDetail: false,
      stationMode: 'tick', showThroats: false, trainVehicles: 0 });
    if (value < 20) return Object.freeze({ level: 'network', gridStep: 2, corridorOffsets: Object.freeze([-3, -1, 1, 3]), railDetail: false,
      stationMode: 'platform', showThroats: true, trainVehicles: 1 });
    return Object.freeze({ level: 'detail', gridStep: 1, corridorOffsets: Object.freeze([-3, -1, 1, 3]), railDetail: true,
      stationMode: 'panel', showThroats: true, trainVehicles: 3 });
  }

  return { profile };
});
