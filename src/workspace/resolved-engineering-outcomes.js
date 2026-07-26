/**
 * Shared resolution outcomes and summary helpers for engineering geometry.
 */
import { freezeDeep } from './dataset-utils.js';
import {
  distance3,
  symbolicDiameter,
} from './engineering-geometry-math.js';

export function markerFallback(center, diameter, reason) {
  if (!center) return skipped(reason);
  return outcome('fallback', reason, [{
    kind: 'FALLBACK_MARKER',
    center,
    diameterMm: diameter,
    visualDiameterMm: symbolicDiameter(diameter || 100, diameter),
  }]);
}

export function outcome(status, reason, primitives) {
  return { status, reason, primitives: freezeDeep(primitives) };
}

export function skipped(reason) {
  return {
    status: 'skipped',
    reason,
    primitives: freezeDeep([]),
  };
}

export function summarizeGeometry(items, skippedItems) {
  const byKind = {};
  const byStatus = {
    resolved: 0,
    fallback: 0,
    skipped: skippedItems.length,
  };
  items.forEach((item) => {
    byKind[item.componentKind] =
      (byKind[item.componentKind] || 0) + 1;
    byStatus[item.resolutionStatus] += 1;
  });
  return freezeDeep({
    renderableCount: items.length,
    resolvedCount: byStatus.resolved,
    fallbackCount: byStatus.fallback,
    skippedCount: byStatus.skipped,
    byKind,
    byStatus,
  });
}

export function pathLength(path) {
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    total += distance3(path[index - 1], path[index]);
  }
  return total;
}

export function hasSpan(start, end) {
  return Boolean(start && end && distance3(start, end) > 1e-6);
}
