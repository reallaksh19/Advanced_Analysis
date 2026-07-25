import { WORKSPACE_DATASET_SCHEMA } from './dataset-adapter.js';
import { freezeDeep } from './dataset-utils.js';
import { classifyEngineeringComponent } from './engineering-component-classifier.js';
import { resolveEngineeringDimensions } from './engineering-dimension-resolver.js';
import {
  buildCircularArcPath,
  calculatePrimitiveBounds,
  centroid3,
  distance3,
  midpoint3,
  symbolicDiameter,
  uniquePoints,
} from './engineering-geometry-math.js';

export const RESOLVED_ENGINEERING_GEOMETRY_SCHEMA = 'resolved-engineering-geometry/v1';
export const RESOLVED_ENGINEERING_ITEM_SCHEMA = 'resolved-engineering-item/v1';

export function buildResolvedEngineeringGeometry(dataset) {
  assertDataset(dataset);
  const items = [];
  const skipped = [];

  dataset.entities.forEach((entity) => {
    const resolved = resolveEntityGeometry(entity);
    if (resolved.resolutionStatus === 'skipped') skipped.push(resolved);
    else items.push(resolved);
  });

  const summary = summarize(items, skipped);
  return freezeDeep({
    schema: RESOLVED_ENGINEERING_GEOMETRY_SCHEMA,
    datasetId: dataset.datasetId,
    items,
    skipped,
    skippedEntityIds: skipped.map((item) => item.entityId),
    bounds: calculatePrimitiveBounds(items),
    summary,
  });
}

export function assertResolvedEngineeringGeometry(model) {
  if (!model || model.schema !== RESOLVED_ENGINEERING_GEOMETRY_SCHEMA || !Array.isArray(model.items)) {
    throw new TypeError(`Engineering viewport requires ${RESOLVED_ENGINEERING_GEOMETRY_SCHEMA}.`);
  }
}

function resolveEntityGeometry(entity) {
  const classification = classifyEngineeringComponent(entity);
  const dimensions = resolveEngineeringDimensions(entity);
  const geometry = entity?.properties?.geometry || {};
  const outcome = buildPrimitive(classification.kind, geometry, dimensions.values);
  return freezeDeep({
    schema: RESOLVED_ENGINEERING_ITEM_SCHEMA,
    entityId: entity.entityId,
    entityType: entity.entityType,
    category: entity.category,
    componentKind: classification.kind,
    classification,
    resolutionStatus: outcome.status,
    resolutionReason: outcome.reason,
    primitive: outcome.primitive,
    dimensions: dimensions.values,
    dimensionEvidence: dimensions.evidence,
    geometrySources: geometry.sources || {},
  });
}

function buildPrimitive(kind, geometry, dimensions) {
  if (kind === 'PIPE') return resolvePipe(geometry, dimensions);
  if (kind === 'ELBOW') return resolveElbow(geometry, dimensions);
  if (kind === 'TEE') return resolveTee(geometry, dimensions);
  if (kind === 'REDUCER') return resolveReducer(geometry, dimensions);
  if (kind === 'FLANGE') return resolveFlange(geometry, dimensions);
  if (kind === 'VALVE') return resolveValve(geometry, dimensions);
  if (kind === 'SUPPORT') return resolveSupport(geometry, dimensions);
  return resolveGeneric(geometry, dimensions);
}

function resolvePipe(geometry, dimensions) {
  if (hasSpan(geometry.start, geometry.end)) {
    const length = distance3(geometry.start, geometry.end);
    const diameter = dimensions.outerDiameterMm;
    return outcome(diameter ? 'resolved' : 'fallback', diameter ? '' : 'PIPE_DIAMETER_VISUAL_FALLBACK', {
      kind: 'tube',
      start: geometry.start,
      end: geometry.end,
      center: midpoint3(geometry.start, geometry.end),
      diameterMm: diameter,
      visualDiameterMm: symbolicDiameter(length, diameter || dimensions.nominalBoreMm),
    });
  }
  return markerFallback(geometry.center, dimensions.outerDiameterMm || dimensions.nominalBoreMm, 'PIPE_TOPOLOGY_INCOMPLETE');
}

function resolveElbow(geometry, dimensions) {
  const diameter = dimensions.outerDiameterMm;
  if (hasSpan(geometry.start, geometry.end) && geometry.explicitCenter && geometry.center) {
    const path = buildCircularArcPath(geometry.start, geometry.end, geometry.center);
    if (path) {
      return outcome(diameter ? 'resolved' : 'fallback', diameter ? '' : 'ELBOW_DIAMETER_VISUAL_FALLBACK', {
        kind: 'swept-path',
        path,
        start: geometry.start,
        end: geometry.end,
        center: geometry.center,
        diameterMm: diameter,
        visualDiameterMm: symbolicDiameter(pathLength(path), diameter || dimensions.nominalBoreMm),
      });
    }
  }
  if (hasSpan(geometry.start, geometry.end)) {
    const length = distance3(geometry.start, geometry.end);
    return outcome('fallback', 'ELBOW_ARC_EVIDENCE_INCOMPLETE', {
      kind: 'tube',
      start: geometry.start,
      end: geometry.end,
      center: midpoint3(geometry.start, geometry.end),
      diameterMm: diameter,
      visualDiameterMm: symbolicDiameter(length, diameter || dimensions.nominalBoreMm),
    });
  }
  return markerFallback(geometry.center, diameter || dimensions.nominalBoreMm, 'ELBOW_TOPOLOGY_INCOMPLETE');
}

function resolveTee(geometry, dimensions) {
  const endpoints = uniquePoints([
    ...(geometry.points || []),
    geometry.start,
    geometry.end,
    ...(geometry.branchPoints || []),
  ]);
  const center = geometry.center || centroid3(endpoints);
  const legs = center
    ? endpoints.filter((point) => distance3(point, center) > 1e-6).map((end, index) => ({
      start: center,
      end,
      diameterMm: index >= 2 ? dimensions.branchDiameterMm : dimensions.outerDiameterMm,
      visualDiameterMm: symbolicDiameter(
        distance3(center, end),
        index >= 2 ? dimensions.branchDiameterMm : dimensions.outerDiameterMm || dimensions.nominalBoreMm,
      ),
    }))
    : [];
  if (legs.length >= 3) {
    const hasMain = Boolean(dimensions.outerDiameterMm);
    const hasBranch = Boolean(dimensions.branchDiameterMm);
    return outcome(hasMain && hasBranch ? 'resolved' : 'fallback',
      hasMain && hasBranch ? '' : 'TEE_DIAMETER_VISUAL_FALLBACK', {
        kind: 'junction',
        center,
        legs,
        visualDiameterMm: Math.max(...legs.map((leg) => leg.visualDiameterMm)),
      });
  }
  if (hasSpan(geometry.start, geometry.end)) {
    return outcome('fallback', 'TEE_BRANCH_TOPOLOGY_INCOMPLETE', {
      kind: 'tube',
      start: geometry.start,
      end: geometry.end,
      center: midpoint3(geometry.start, geometry.end),
      diameterMm: dimensions.outerDiameterMm,
      visualDiameterMm: symbolicDiameter(distance3(geometry.start, geometry.end), dimensions.outerDiameterMm || dimensions.nominalBoreMm),
    });
  }
  return markerFallback(center, dimensions.outerDiameterMm || dimensions.nominalBoreMm, 'TEE_TOPOLOGY_INCOMPLETE');
}

function resolveReducer(geometry, dimensions) {
  if (!hasSpan(geometry.start, geometry.end)) {
    return markerFallback(geometry.center, dimensions.outerDiameterMm || dimensions.nominalBoreMm, 'REDUCER_TOPOLOGY_INCOMPLETE');
  }
  const length = distance3(geometry.start, geometry.end);
  const startDiameter = dimensions.inletDiameterMm;
  const endDiameter = dimensions.outletDiameterMm;
  const complete = Boolean(startDiameter && endDiameter);
  return outcome(complete ? 'resolved' : 'fallback', complete ? '' : 'REDUCER_DIAMETER_VISUAL_FALLBACK', {
    kind: 'frustum',
    start: geometry.start,
    end: geometry.end,
    center: midpoint3(geometry.start, geometry.end),
    startDiameterMm: startDiameter,
    endDiameterMm: endDiameter,
    visualStartDiameterMm: symbolicDiameter(length, startDiameter || dimensions.outerDiameterMm || dimensions.nominalBoreMm),
    visualEndDiameterMm: symbolicDiameter(length, endDiameter || dimensions.outerDiameterMm || dimensions.nominalBoreMm),
  });
}

function resolveFlange(geometry, dimensions) {
  const center = geometry.center || midpoint3(geometry.start, geometry.end);
  if (!center) return skipped('FLANGE_TOPOLOGY_MISSING');
  const outside = dimensions.flangeOutsideDiameterMm;
  const thickness = dimensions.flangeThicknessMm;
  const axisStart = geometry.start || center;
  const axisEnd = geometry.end || { x: center.x + 1, y: center.y, z: center.z };
  const resolved = Boolean(outside && thickness && hasSpan(geometry.start, geometry.end));
  const referenceLength = distance3(axisStart, axisEnd) || outside || 100;
  return outcome(resolved ? 'resolved' : 'fallback', resolved ? '' : 'FLANGE_DIMENSION_OR_AXIS_VISUAL_FALLBACK', {
    kind: 'disc',
    center,
    axisStart,
    axisEnd,
    outsideDiameterMm: outside,
    thicknessMm: thickness,
    visualOutsideDiameterMm: symbolicDiameter(referenceLength, outside),
    visualThicknessMm: thickness || Math.max(symbolicDiameter(referenceLength, outside) * 0.18, 2),
  });
}

function resolveValve(geometry, dimensions) {
  if (hasSpan(geometry.start, geometry.end)) {
    const length = distance3(geometry.start, geometry.end);
    const body = dimensions.valveBodyDiameterMm;
    return outcome(body ? 'resolved' : 'fallback', body ? '' : 'VALVE_BODY_VISUAL_FALLBACK', {
      kind: 'valve-body',
      start: geometry.start,
      end: geometry.end,
      center: midpoint3(geometry.start, geometry.end),
      bodyDiameterMm: body,
      visualBodyDiameterMm: symbolicDiameter(length, body || dimensions.outerDiameterMm || dimensions.nominalBoreMm),
    });
  }
  return markerFallback(geometry.center, dimensions.valveBodyDiameterMm || dimensions.outerDiameterMm || dimensions.nominalBoreMm, 'VALVE_TOPOLOGY_INCOMPLETE');
}

function resolveSupport(geometry, dimensions) {
  const center = geometry.center || geometry.start || geometry.end;
  if (!center) return skipped('SUPPORT_POSITION_MISSING');
  const size = dimensions.supportSizeMm;
  return outcome(size ? 'resolved' : 'fallback', size ? '' : 'SUPPORT_SIZE_VISUAL_FALLBACK', {
    kind: 'support-marker',
    center,
    sizeMm: size,
    visualSizeMm: symbolicDiameter(size || 100, size),
  });
}

function resolveGeneric(geometry, dimensions) {
  if (hasSpan(geometry.start, geometry.end)) {
    const length = distance3(geometry.start, geometry.end);
    return outcome('fallback', 'GENERIC_SEGMENT_SYMBOL', {
      kind: 'tube',
      start: geometry.start,
      end: geometry.end,
      center: midpoint3(geometry.start, geometry.end),
      diameterMm: dimensions.outerDiameterMm,
      visualDiameterMm: symbolicDiameter(length, dimensions.outerDiameterMm || dimensions.nominalBoreMm),
    });
  }
  return markerFallback(geometry.center, dimensions.outerDiameterMm || dimensions.nominalBoreMm, 'GENERIC_POINT_SYMBOL');
}

function markerFallback(center, diameter, reason) {
  if (!center) return skipped(reason);
  return outcome('fallback', reason, {
    kind: 'marker',
    center,
    diameterMm: diameter,
    visualDiameterMm: symbolicDiameter(diameter || 100, diameter),
  });
}

function outcome(status, reason, primitive) {
  return { status, reason, primitive: freezeDeep(primitive) };
}

function skipped(reason) {
  return { status: 'skipped', reason, primitive: null };
}

function summarize(items, skipped) {
  const byKind = {};
  const byStatus = { resolved: 0, fallback: 0, skipped: skipped.length };
  items.forEach((item) => {
    byKind[item.componentKind] = (byKind[item.componentKind] || 0) + 1;
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

function pathLength(path) {
  let total = 0;
  for (let index = 1; index < path.length; index += 1) total += distance3(path[index - 1], path[index]);
  return total;
}

function hasSpan(start, end) { return Boolean(start && end && distance3(start, end) > 1e-6); }
function assertDataset(dataset) {
  if (!dataset || dataset.schema !== WORKSPACE_DATASET_SCHEMA || !Array.isArray(dataset.entities)) {
    throw new TypeError(`Resolved engineering geometry requires ${WORKSPACE_DATASET_SCHEMA}.`);
  }
}
