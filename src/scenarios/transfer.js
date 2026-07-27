(function (root, factory) {
  const schema = typeof module === 'object' && module.exports ? require('./schema.js') : root.RailScenarioSchema;
  const value = factory(schema);
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.RailTransferScenario = value;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Schema) {
  'use strict';
  const cities = [
    ['westgate', 'city-westgate', 'Westgate', 'WG', 3, 9, 31000, '#4d846b', { x: 2, y: 8, w: 3, h: 3 }],
    ['brookside', 'city-brookside', 'Brookside', 'BS', 3, 3, 7200, '#a4698e', { x: 2, y: 2, w: 3, h: 3 }],
    ['grand-junction', 'city-grand-junction', 'Grand Junction', 'GJ', 14, 9, 44000, '#b6854e', { x: 12, y: 7, w: 5, h: 5 }],
    ['northfield', 'city-northfield', 'Northfield', 'NF', 14, 2, 11800, '#5d78b8', { x: 13, y: 1, w: 3, h: 3 }],
    ['eastport', 'city-eastport', 'Eastport', 'EP', 25, 9, 58000, '#ed5d37', { x: 24, y: 8, w: 3, h: 3 }],
    ['harbour-end', 'city-harbour-end', 'Harbour End', 'HE', 22, 15, 8900, '#81959a', { x: 21, y: 14, w: 3, h: 3 }],
    ['southbank', 'city-southbank', 'Southbank', 'SB', 14, 16, 6400, '#8b6f9e', { x: 13, y: 15, w: 3, h: 3 }]
  ];
  const stations = cities.map(([id, cityId, name, short, x, y, , color, area]) => ({ id, cityId, name, short, kind: 'city-station', x, y, area, color,
  }));
  const cityRecords = cities.map(([stationId, id, , , , , population]) => ({ id, stationId, population }));
  const overrides = { 'brookside>harbour-end': 40, 'northfield>southbank': 30, 'harbour-end>brookside': 35, 'southbank>westgate': 25 }, queues = [];
  cities.forEach(([origin]) => cities.forEach(([destination]) => {
    if (origin !== destination) queues.push({ id: `queue-transfer-${origin}-${destination}`, originStationId: origin, destinationStationId: destination, count: overrides[`${origin}>${destination}`] || 2 });
  }));
  const service = (id, number, name, a, b, coaches, timer, color) => ({ id, number, name, stopIds: [a, b], color,
    allocation: { locomotives: 1, passengerCars: coaches }, operatingPattern: { mode: 'full-or-timer', intervalTicks: timer * 4 } });
  return Schema.defineScenario({
    id: 'transfer', name: 'Interchange Network', description: 'Move passengers across feeders and core links through three interchanges.', seed: 'rail-form-transfer',
    grid: { cols: 28, rows: 18 }, credits: 1000, fleet: { locomotives: 6, passengerCars: 8 },
    stations, cities: cityRecords,
    trackPolylines: [
      [{ x: 3, y: 5 }, { x: 3, y: 7 }], [{ x: 4, y: 5 }, { x: 4, y: 7 }],
      [{ x: 5, y: 9 }, { x: 11, y: 9 }], [{ x: 5, y: 10 }, { x: 11, y: 10 }],
      [{ x: 14, y: 4 }, { x: 14, y: 6 }], [{ x: 15, y: 4 }, { x: 15, y: 6 }],
      [{ x: 17, y: 9 }, { x: 23, y: 9 }], [{ x: 17, y: 10 }, { x: 23, y: 10 }],
      [{ x: 14, y: 12 }, { x: 14, y: 14 }], [{ x: 15, y: 12 }, { x: 15, y: 14 }],
      [{ x: 25, y: 11 }, { x: 25, y: 13 }, { x: 22, y: 13 }]
    ],
    services: [
      service('transfer-line-1', 1, 'FEEDER 1', 'brookside', 'westgate', 1, 6, '#ed5d37'),
      service('transfer-line-2', 2, 'CORE LINK', 'westgate', 'grand-junction', 2, 4, '#5d78b8'),
      service('transfer-line-3', 3, 'FEEDER 3', 'northfield', 'grand-junction', 1, 6, '#4d846b'),
      service('transfer-line-4', 4, 'CORE LINK', 'grand-junction', 'eastport', 2, 4, '#b06ca3'),
      service('transfer-line-5', 5, 'FEEDER 5', 'grand-junction', 'southbank', 1, 6, '#d49a32'),
      service('transfer-line-6', 6, 'FEEDER 6', 'eastport', 'harbour-end', 1, 6, '#ed5d37')
    ],
    initialQueues: queues
  });
});
