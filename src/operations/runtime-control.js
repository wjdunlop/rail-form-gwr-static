(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RailRuntimeControl = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const groupId = line => String(line.serviceGroup || line.serviceId || line.id);
  const segmentKey = line => [line.a?.id || line.aId, line.b?.id || line.bId].sort().join('|');
  const platformReferences = station => station?.platformRefs?.length ? [...station.platformRefs] :
    Array.from({ length: Math.max(1, Number(station?.platformCount) || Math.min(station?.area?.w || 1, station?.area?.h || 1)) }, (_, index) => String(index + 1));
  const platformCapacity = station => platformReferences(station).length;

  function platformNumber(station, line, lines, options = {}) {
    const groups = [...new Map((lines || []).filter(candidate => candidate.a?.id === station.id || candidate.b?.id === station.id)
      .sort((a, b) => (a.number || 0) - (b.number || 0) || String(a.id).localeCompare(String(b.id)))
      .map(candidate => [groupId(candidate), candidate])).keys()];
    const index = Math.max(0, groups.indexOf(groupId(line)));
    return index % platformCapacity(station) + 1;
  }

  const platformReference = (station, line, lines, options = {}) => platformReferences(station)[platformNumber(station,line,lines,options)-1];
  const platformId = (station, line, lines, options = {}) => `${station.id}:P${platformReference(station,line,lines,options)}`;

  function claimPlatform(occupancy, id, trainId) {
    const current = occupancy?.[id];
    if (current && current !== trainId) return { ok: false, occupancy, occupiedBy: current };
    const next = releasePlatform(occupancy, trainId);
    next[id] = trainId;
    return { ok: true, occupancy: next, occupiedBy: trainId };
  }

  function releasePlatform(occupancy, trainId) {
    const next = Object.fromEntries(Object.entries(occupancy || {}).filter(([, owner]) => owner !== trainId));
    return next;
  }

  function validateExclusive(occupancy) {
    const issues = [], byOwner = new Map();
    for (const [id, owner] of Object.entries(occupancy || {})) {
      if (!id || !owner) {
        issues.push({ code: 'INVALID_PLATFORM_OCCUPANCY', platformId: id });
        continue;
      }
      if (!byOwner.has(owner)) byOwner.set(owner, []);
      byOwner.get(owner).push(id);
    }
    for (const [trainId, platformIds] of byOwner) {
      if (platformIds.length > 1) issues.push({ code: 'TRAIN_OCCUPIES_MULTIPLE_PLATFORMS', trainId, platformIds: platformIds.sort() });
    }
    return issues;
  }

  function movementLabel(current, target, anchor) {
    if (!anchor || !current || !target) return 'down';
    const distance = station => Math.abs(station.x - anchor.x) + Math.abs(station.y - anchor.y);
    return distance(target) < distance(current) ? 'up' : 'down';
  }

  function directionAllowed(mode, movement) {
    return (mode || 'both') === 'both' || mode === movement;
  }

  return { groupId, segmentKey, platformReferences, platformCapacity, platformNumber, platformReference, platformId, claimPlatform, releasePlatform, validateExclusive, movementLabel, directionAllowed };
});
