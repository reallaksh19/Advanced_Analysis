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
import {
  hasSpan,
  markerFallback,
  outcome,
  pathLength,
  skipped,
  summarizeGeometry,
} from './resolved-engineering-outcomes.js';

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

  const summary = summarizeGeometry(items, skipped);
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
    primitives: outcome.primitives,
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
  if (kind === 'OLET') return resolveOlet(geometry, dimensions);
  return resolveGeneric(geometry, dimensions);
}

function resolvePipe(geometry, dimensions) {
  if (hasSpan(geometry.start, geometry.end)) {
    const length = distance3(geometry.start, geometry.end);
    const diameter = dimensions.outerDiameterMm;
    return outcome(diameter ? 'resolved' : 'fallback', diameter ? '' : 'PIPE_DIAMETER_VISUAL_FALLBACK', [{
      kind: 'PIPE_TUBE',
      start: geometry.start,
      end: geometry.end,
      center: midpoint3(geometry.start, geometry.end),
      diameterMm: diameter,
      visualDiameterMm: symbolicDiameter(length, diameter || dimensions.nominalBoreMm),
    }]);
  }
  return markerFallback(geometry.center, dimensions.outerDiameterMm || dimensions.nominalBoreMm, 'PIPE_TOPOLOGY_INCOMPLETE');
}

function resolveElbow(geometry, dimensions) {
  const diameter = dimensions.outerDiameterMm;
  if (hasSpan(geometry.start, geometry.end) && geometry.explicitCenter && geometry.center) {
    const path = buildCircularArcPath(geometry.start, geometry.end, geometry.center);
    if (path) {
      return outcome(diameter ? 'resolved' : 'fallback', diameter ? '' : 'ELBOW_DIAMETER_VISUAL_FALLBACK', [{
        kind: 'BEND_ARC',
        path,
        start: geometry.start,
        end: geometry.end,
        center: geometry.center,
        diameterMm: diameter,
        visualDiameterMm: symbolicDiameter(pathLength(path), diameter || dimensions.nominalBoreMm),
      }]);
    }
  }
  if (hasSpan(geometry.start, geometry.end)) {
    const length = distance3(geometry.start, geometry.end);
    return outcome('fallback', 'ELBOW_ARC_EVIDENCE_INCOMPLETE', [{
      kind: 'PIPE_TUBE',
      start: geometry.start,
      end: geometry.end,
      center: midpoint3(geometry.start, geometry.end),
      diameterMm: diameter,
      visualDiameterMm: symbolicDiameter(length, diameter || dimensions.nominalBoreMm),
    }]);
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
    const primitives = legs.map((leg, i) => ({
      kind: i >= 2 ? 'TEE_BRANCH' : 'TEE_LEG',
      start: leg.start,
      end: leg.end,
      diameterMm: leg.diameterMm,
      visualDiameterMm: leg.visualDiameterMm,
    }));
    return outcome(hasMain && hasBranch ? 'resolved' : 'fallback',
      hasMain && hasBranch ? '' : 'TEE_DIAMETER_VISUAL_FALLBACK', primitives);
  }
  if (hasSpan(geometry.start, geometry.end)) {
    return outcome('fallback', 'TEE_BRANCH_TOPOLOGY_INCOMPLETE', [{
      kind: 'PIPE_TUBE',
      start: geometry.start,
      end: geometry.end,
      center: midpoint3(geometry.start, geometry.end),
      diameterMm: dimensions.outerDiameterMm,
      visualDiameterMm: symbolicDiameter(distance3(geometry.start, geometry.end), dimensions.outerDiameterMm || dimensions.nominalBoreMm),
    }]);
  }
  return markerFallback(center, dimensions.outerDiameterMm || dimensions.nominalBoreMm, 'TEE_TOPOLOGY_INCOMPLETE');
}

function resolveOlet(geometry, dimensions) {
  if (hasSpan(geometry.start, geometry.end)) {
    const length = distance3(geometry.start, geometry.end);
    const runDiameter = dimensions.outerDiameterMm;
    const branchDiameter = dimensions.branchDiameterMm || dimensions.nominalBoreMm;
    return outcome(runDiameter && branchDiameter ? 'resolved' : 'fallback', runDiameter && branchDiameter ? '' : 'OLET_DIAMETER_VISUAL_FALLBACK', [{
      kind: 'OLET_FRUSTUM',
      start: geometry.start,
      end: geometry.end,
      center: midpoint3(geometry.start, geometry.end),
      startDiameterMm: runDiameter,
      endDiameterMm: branchDiameter,
      visualStartDiameterMm: symbolicDiameter(length, runDiameter || 100),
      visualEndDiameterMm: symbolicDiameter(length, branchDiameter || 50),
    }]);
  }
  return markerFallback(geometry.center, dimensions.branchDiameterMm || dimensions.nominalBoreMm, 'OLET_TOPOLOGY_INCOMPLETE');
}

function resolveReducer(geometry, dimensions) {
  if (!hasSpan(geometry.start, geometry.end)) {
    return markerFallback(geometry.center, dimensions.outerDiameterMm || dimensions.nominalBoreMm, 'REDUCER_TOPOLOGY_INCOMPLETE');
  }
  const length = distance3(geometry.start, geometry.end);
  const startDiameter = dimensions.inletDiameterMm;
  const endDiameter = dimensions.outletDiameterMm;
  const complete = Boolean(startDiameter && endDiameter);
  return outcome(complete ? 'resolved' : 'fallback', complete ? '' : 'REDUCER_DIAMETER_VISUAL_FALLBACK', [{
    kind: 'REDUCER_FRUSTUM',
    start: geometry.start,
    end: geometry.end,
    center: midpoint3(geometry.start, geometry.end),
    startDiameterMm: startDiameter,
    endDiameterMm: endDiameter,
    visualStartDiameterMm: symbolicDiameter(length, startDiameter || dimensions.outerDiameterMm || dimensions.nominalBoreMm),
    visualEndDiameterMm: symbolicDiameter(length, endDiameter || dimensions.outerDiameterMm || dimensions.nominalBoreMm),
  }]);
}

function resolveFlange(geometry, dimensions) {
  const center = geometry.center || geometry.start || geometry.end;
  if (!center) return skipped('FLANGE_TOPOLOGY_MISSING');
  const outside = dimensions.flangeOutsideDiameterMm || 150;
  const thickness = dimensions.flangeThicknessMm || 25;
  const axisStart = geometry.start && geometry.end && distance3(geometry.start, geometry.end) > 1e-3 ? geometry.start : { x: center.x - 15, y: center.y, z: center.z };
  const axisEnd = geometry.start && geometry.end && distance3(geometry.start, geometry.end) > 1e-3 ? geometry.end : { x: center.x + 15, y: center.y, z: center.z };
  return outcome('resolved', '', [{
    kind: 'FLANGE_DISC',
    center,
    axisStart,
    axisEnd,
    outsideDiameterMm: outside,
    thicknessMm: thickness,
    visualOutsideDiameterMm: Math.max(outside, 120),
    visualThicknessMm: Math.max(thickness, 20),
  }]);
}

function resolveValve(geometry, dimensions) {
  const center = geometry.center || (geometry.start && geometry.end ? midpoint3(geometry.start, geometry.end) : geometry.start || geometry.end);
  if (!center) return skipped('VALVE_TOPOLOGY_MISSING');
  const start = geometry.start && geometry.end && distance3(geometry.start, geometry.end) > 1e-3 ? geometry.start : { x: center.x - 60, y: center.y, z: center.z };
  const end = geometry.start && geometry.end && distance3(geometry.start, geometry.end) > 1e-3 ? geometry.end : { x: center.x + 60, y: center.y, z: center.z };
  const body = dimensions.valveBodyDiameterMm || dimensions.outerDiameterMm || 140;
  return outcome('resolved', '', [{
    kind: 'VALVE_BODY',
    start,
    end,
    center,
    bodyDiameterMm: body,
    visualBodyDiameterMm: Math.max(body, 100),
  }]);
}

function resolveSupport(geometry, dimensions) {
  const center = geometry.center || geometry.start || geometry.end;
  if (!center) return skipped('SUPPORT_POSITION_MISSING');
  const size = dimensions.supportSizeMm || 80;
  return outcome('resolved', '', [{
    kind: 'SUPPORT_MARKER',
    center,
    sizeMm: size,
    visualSizeMm: Math.max(size, 80),
  }]);
}

function resolveGeneric(geometry, dimensions) {
  if (hasSpan(geometry.start, geometry.end)) {
    const length = distance3(geometry.start, geometry.end);
    return outcome('fallback', 'GENERIC_SEGMENT_SYMBOL', [{
      kind: 'PIPE_TUBE',
      start: geometry.start,
      end: geometry.end,
      center: midpoint3(geometry.start, geometry.end),
      diameterMm: dimensions.outerDiameterMm,
      visualDiameterMm: symbolicDiameter(length, dimensions.outerDiameterMm || dimensions.nominalBoreMm),
    }]);
  }
  return markerFallback(geometry.center, dimensions.outerDiameterMm || dimensions.nominalBoreMm, 'GENERIC_POINT_SYMBOL');
}

function assertDataset(dataset) {
  if (!dataset || dataset.schema !== WORKSPACE_DATASET_SCHEMA || !Array.isArray(dataset.entities)) {
    throw new TypeError(`Resolved engineering geometry requires ${WORKSPACE_DATASET_SCHEMA}.`);
  }
}
