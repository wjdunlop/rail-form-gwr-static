(function (root, factory) {
  const schema = typeof module === 'object' && module.exports ? require('./schema.js') : root.RailScenarioSchema;
  const value = factory(schema);
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.RailTrunkScenario = value;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Schema) {
  'use strict';
  const cities = [
    ['westhaven', 'city-westhaven', 'Westhaven', 'WH', 2, 9, 52000, '#4d846b'],
    ['hillford', 'city-hillford', 'Hillford', 'HF', 8, 3, 6800, '#a4698e'],
    ['alder-junction', 'city-alder', 'Alder Junction', 'AJ', 8, 9, 12500, '#b6854e'],
    ['kingsmead', 'city-kingsmead', 'Kingsmead', 'KM', 14, 9, 21000, '#5d78b8'],
    ['march-cross', 'city-march', 'March Cross', 'MC', 20, 9, 14800, '#81959a'],
    ['eastborough', 'city-eastborough', 'Eastborough', 'EB', 25, 9, 71000, '#ed5d37'],
    ['southmere', 'city-southmere', 'Southmere', 'SM', 20, 15, 4900, '#8b6f9e']
  ];
  const stations = cities.map(([id, cityId, name, short, x, y, , color]) => ({ id, cityId, name, short, kind: 'city-station', x, y,
    area: { x: x - 1, y: y - 1, w: 3, h: 3 }, color }));
  const cityRecords = cities.map(([stationId, id, , , , , population]) => ({ id, stationId, population }));
  const queues = [];
  cities.forEach(([origin, , , , , , population]) => cities.forEach(([destination]) => {
    if (origin !== destination) queues.push({ id: `queue-trunk-${origin}-${destination}`, originStationId: origin, destinationStationId: destination, count: Math.max(2, Math.round(population / 8000)) });
  }));
  const service = (id, number, name, a, b, coaches, timer, color) => ({ id, number, name, stopIds: [a, b], color,
    allocation: { locomotives: 1, passengerCars: coaches }, operatingPattern: { mode: 'full-or-timer', intervalTicks: timer * 4 } });
  return Schema.defineScenario({
    id: 'trunk', name: 'Core Trunk and Branches', description: 'Operate a high-capacity trunk between two major cities with local branches.', seed: 'rail-form-trunk',
    grid: { cols: 28, rows: 18 }, credits: 1200, fleet: { locomotives: 6, passengerCars: 10 },
    stations, cities: cityRecords,
    trackPolylines: [
      [{ x: 4, y: 9 }, { x: 6, y: 9 }], [{ x: 4, y: 10 }, { x: 6, y: 10 }],
      [{ x: 10, y: 9 }, { x: 12, y: 9 }], [{ x: 10, y: 10 }, { x: 12, y: 10 }],
      [{ x: 16, y: 9 }, { x: 18, y: 9 }], [{ x: 16, y: 10 }, { x: 18, y: 10 }],
      [{ x: 22, y: 9 }, { x: 23, y: 9 }], [{ x: 22, y: 10 }, { x: 23, y: 10 }],
      [{ x: 8, y: 5 }, { x: 8, y: 7 }], [{ x: 9, y: 5 }, { x: 9, y: 7 }],
      [{ x: 20, y: 11 }, { x: 20, y: 13 }], [{ x: 21, y: 11 }, { x: 21, y: 13 }]
    ],
    services: [
      service('trunk-line-1', 1, 'TRUNK 1', 'westhaven', 'alder-junction', 2, 4, '#5d78b8'),
      service('trunk-line-2', 2, 'TRUNK 2', 'alder-junction', 'kingsmead', 2, 4, '#5d78b8'),
      service('trunk-line-3', 3, 'TRUNK 3', 'kingsmead', 'march-cross', 2, 4, '#5d78b8'),
      service('trunk-line-4', 4, 'TRUNK 4', 'march-cross', 'eastborough', 2, 4, '#5d78b8'),
      service('trunk-line-5', 5, 'BRANCH 1', 'alder-junction', 'hillford', 1, 7, '#d49a32'),
      service('trunk-line-6', 6, 'BRANCH 2', 'march-cross', 'southmere', 1, 7, '#ed5d37')
    ],
    initialQueues: queues
  });
});
