(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RailViewport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

  function clampZoom(zoom, minZoom = 0.25, maxZoom = 4) {
    const low = Math.min(finite(minZoom, 0.25), finite(maxZoom, 4));
    const high = Math.max(finite(minZoom, 0.25), finite(maxZoom, 4));
    return Math.min(high, Math.max(low, finite(zoom, 1)));
  }

  function createViewport(options = {}) {
    const minZoom = Math.max(Number.EPSILON, finite(options.minZoom, 0.25));
    const maxZoom = Math.max(minZoom, finite(options.maxZoom, 4));
    return Object.freeze({
      x: finite(options.x, 0),
      y: finite(options.y, 0),
      zoom: clampZoom(options.zoom, minZoom, maxZoom),
      minZoom,
      maxZoom,
      width: Math.max(0, finite(options.width, 0)),
      height: Math.max(0, finite(options.height, 0))
    });
  }

  function gridToScreen(viewport, point) {
    return {
      x: (finite(point.x, 0) - viewport.x) * viewport.zoom,
      y: (finite(point.y, 0) - viewport.y) * viewport.zoom
    };
  }

  function screenToGrid(viewport, point) {
    return {
      x: finite(point.x, 0) / viewport.zoom + viewport.x,
      y: finite(point.y, 0) / viewport.zoom + viewport.y
    };
  }

  // Positive screen deltas move the map with the pointer, so the world-space
  // camera origin moves in the opposite direction.
  function pan(viewport, dx, dy) {
    return createViewport({
      ...viewport,
      x: viewport.x - finite(dx, 0) / viewport.zoom,
      y: viewport.y - finite(dy, 0) / viewport.zoom
    });
  }

  function zoomAt(viewport, requestedZoom, screenPoint) {
    const anchor = screenToGrid(viewport, screenPoint);
    const zoom = clampZoom(requestedZoom, viewport.minZoom, viewport.maxZoom);
    return createViewport({
      ...viewport,
      zoom,
      x: anchor.x - finite(screenPoint.x, 0) / zoom,
      y: anchor.y - finite(screenPoint.y, 0) / zoom
    });
  }

  function normalizeBounds(bounds) {
    const x1 = finite(bounds.x, 0);
    const y1 = finite(bounds.y, 0);
    const x2 = Number.isFinite(bounds.maxX) ? bounds.maxX : x1 + Math.max(0, finite(bounds.width, 0));
    const y2 = Number.isFinite(bounds.maxY) ? bounds.maxY : y1 + Math.max(0, finite(bounds.height, 0));
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1)
    };
  }

  function fitBounds(viewport, bounds, options = {}) {
    const normalized = normalizeBounds(bounds || {});
    const padding = Math.max(0, finite(options.padding, 0));
    const availableWidth = Math.max(0, viewport.width - padding * 2);
    const availableHeight = Math.max(0, viewport.height - padding * 2);
    const xZoom = normalized.width > 0 ? availableWidth / normalized.width : Infinity;
    const yZoom = normalized.height > 0 ? availableHeight / normalized.height : Infinity;
    const candidate = Math.min(xZoom, yZoom);
    const zoom = clampZoom(Number.isFinite(candidate) ? candidate : viewport.maxZoom, viewport.minZoom, viewport.maxZoom);
    const visibleWidth = viewport.width / zoom;
    const visibleHeight = viewport.height / zoom;
    return createViewport({
      ...viewport,
      zoom,
      x: normalized.x + normalized.width / 2 - visibleWidth / 2,
      y: normalized.y + normalized.height / 2 - visibleHeight / 2
    });
  }

  function constrain(viewport, bounds, options = {}) {
    const normalized = normalizeBounds(bounds || {});
    const screenPadding = Math.max(0, finite(options.screenPadding, 0));
    const worldPadding = screenPadding / viewport.zoom;
    const visibleWidth = viewport.width / viewport.zoom;
    const visibleHeight = viewport.height / viewport.zoom;
    const constrainAxis = (origin, extent, visible, current) => {
      const low = origin - worldPadding;
      const high = origin + extent + worldPadding - visible;
      return high < low ? origin + extent / 2 - visible / 2 : Math.min(high, Math.max(low, current));
    };
    return createViewport({
      ...viewport,
      x: constrainAxis(normalized.x, normalized.width, visibleWidth, viewport.x),
      y: constrainAxis(normalized.y, normalized.height, visibleHeight, viewport.y)
    });
  }

  function screenBoxVisible(viewport, box, options = {}) {
    const x = finite(box?.x, 0), y = finite(box?.y, 0), width = Math.max(0, finite(box?.width, 0)), height = Math.max(0, finite(box?.height, 0));
    if (options.fully) return x >= 0 && y >= 0 && x + width <= viewport.width && y + height <= viewport.height;
    return x + width >= 0 && y + height >= 0 && x <= viewport.width && y <= viewport.height;
  }

  return { createViewport, clampZoom, gridToScreen, screenToGrid, pan, zoomAt, fitBounds, constrain, screenBoxVisible };
});
