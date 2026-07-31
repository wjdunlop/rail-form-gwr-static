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

  function pathLength(path) {
    if (Number.isFinite(path?.length)) return path.length;
    const points = path?.points || [];
    return points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
  }

  function pointToSegmentDistance(point, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, squared = dx * dx + dy * dy;
    if (!squared) return Math.hypot(point.x - a.x, point.y - a.y);
    const amount = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / squared));
    return Math.hypot(point.x - a.x - dx * amount, point.y - a.y - dy * amount);
  }

  function corridorPath(corridor) {
    return corridor?.paths?.find(path => path.flow === 'down') || corridor?.paths?.[0] || null;
  }

  function shortestDistance(graph, fromId, toId, maximum) {
    const distances = new Map([[fromId, 0]]), queue = [{ id: fromId, distance: 0 }];
    while (queue.length) {
      queue.sort((a, b) => a.distance - b.distance);
      const current = queue.shift();
      if (current.distance !== distances.get(current.id)) continue;
      if (current.id === toId) return current.distance;
      for (const edge of graph.get(current.id) || []) {
        const distance = current.distance + edge.length;
        if (distance > maximum || distance >= (distances.get(edge.to) ?? Infinity)) continue;
        distances.set(edge.to, distance);
        queue.push({ id: edge.to, distance });
      }
    }
    return Infinity;
  }

  // Timetable corridors include express station pairs as well as atomic pieces of
  // railway. Drawing both at overview scale produces doubled lines whose shapes
  // diverge slightly. Keep routing data intact, but remove a corridor from the
  // overview when it passes an intermediate station and a comparable chain of
  // shorter corridors connects the same endpoints.
  function selectPhysicalCorridors(geometry, options = {}) {
    const tolerance = Number.isFinite(options.stationTolerance) ? options.stationTolerance : 0.065;
    const detourFactor = Number.isFinite(options.detourFactor) ? options.detourFactor : 1.18;
    const corridors = (geometry?.corridors || []).map(corridor => {
      const path = corridorPath(corridor);
      return { corridor, path, length: pathLength(path) };
    }).filter(item => item.path?.points?.length > 1 && item.length > 0);
    const stations = (geometry?.stations || []).filter(station => station?.point);
    const graph = new Map();
    const add = (from, to, length, corridor) => {
      if (!graph.has(from)) graph.set(from, []);
      graph.get(from).push({ to, length, corridor });
    };
    for (const item of corridors) {
      add(item.corridor.aId, item.corridor.bId, item.length, item.corridor);
      add(item.corridor.bId, item.corridor.aId, item.length, item.corridor);
    }
    return corridors.filter(item => {
      const { corridor, path, length } = item, points = path.points;
      const bounds = points.reduce((value, point) => ({
        minX: Math.min(value.minX, point.x), minY: Math.min(value.minY, point.y),
        maxX: Math.max(value.maxX, point.x), maxY: Math.max(value.maxY, point.y)
      }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
      const passesIntermediate = stations.some(station => {
        if (station.id === corridor.aId || station.id === corridor.bId) return false;
        const point = station.point;
        if (point.x < bounds.minX - tolerance || point.x > bounds.maxX + tolerance || point.y < bounds.minY - tolerance || point.y > bounds.maxY + tolerance) return false;
        return points.slice(1).some((end, index) => pointToSegmentDistance(point, points[index], end) <= tolerance);
      });
      if (!passesIntermediate) return true;
      const shorter = new Map();
      for (const [from, edges] of graph) shorter.set(from, edges.filter(edge => edge.corridor !== corridor && edge.length < length * 0.999));
      return shortestDistance(shorter, corridor.aId, corridor.bId, length * detourFactor) === Infinity;
    }).map(item => item.corridor);
  }

  return { profile, selectPhysicalCorridors, selectOverviewCorridors: selectPhysicalCorridors };
});
