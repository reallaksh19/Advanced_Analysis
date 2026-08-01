import { WORKSPACE_DATASET_SCHEMA } from './dataset-adapter.js';
import { freezeDeep } from './dataset-utils.js';
import { classifyEngineeringComponent } from './engineering-component-classifier.js';
import { resolveEngineeringDimensions } from './engineering-dimension-resolver.js';
import { calculatePrimitiveBounds, centroid3, distance3, midpoint3 } from './engineering-geometry-math.js';
import { hasSpan, outcome, skipped, summarizeGeometry } from './resolved-engineering-outcomes.js';
import { projectDataValue } from './project-data/project-data-contract.js';

export const RESOLVED_ENGINEERING_GEOMETRY_SCHEMA = 'resolved-engineering-geometry/v1';
export const RESOLVED_ENGINEERING_ITEM_SCHEMA = 'resolved-engineering-item/v1';

/**
 * Resolves real source spans and approved visual dimensions. A missing body
 * diameter produces a source centerline, never a fabricated solid.
 */
export function buildResolvedEngineeringGeometry(dataset, profile, supportSiteModel) {
  assertDataset(dataset);
  const items = [];
  const skippedItems = [];
  dataset.entities.filter((entity) => classifyEngineeringComponent(entity).kind !== 'SUPPORT').forEach((entity) => {
    const resolved = resolveEntityGeometry(entity);
    if (resolved.resolutionStatus === 'skipped') skippedItems.push(resolved); else items.push(resolved);
  });
  resolveSupportSites(profile, supportSiteModel).forEach((resolved) => {
    if (resolved.resolutionStatus === 'skipped') skippedItems.push(resolved); else items.push(resolved);
  });
  return freezeDeep({
    schema: RESOLVED_ENGINEERING_GEOMETRY_SCHEMA,
    datasetId: dataset.datasetId,
    coordinateTransform: projectDataValue(profile, 'sourcesAndUnits.coordinateTransform'),
    webglNavigation: webglValues(profile),
    items,
    skipped: skippedItems,
    skippedEntityIds: skippedItems.map((item) => item.entityId),
    bounds: calculatePrimitiveBounds(items),
    summary: summarizeGeometry(items, skippedItems),
  });
}

export function assertResolvedEngineeringGeometry(model) {
  if (!model || model.schema !== RESOLVED_ENGINEERING_GEOMETRY_SCHEMA || !Array.isArray(model.items)) throw new TypeError(`Engineering viewport requires ${RESOLVED_ENGINEERING_GEOMETRY_SCHEMA}.`);
}

function resolveEntityGeometry(entity) {
  const classification = classifyEngineeringComponent(entity);
  const dimensions = resolveEngineeringDimensions(entity);
  const geometry = entity?.properties?.geometry || {};
  const resolved = buildPrimitive(classification.kind, geometry, dimensions.values);
  return freezeDeep({
    schema: RESOLVED_ENGINEERING_ITEM_SCHEMA,
    entityId: entity.entityId,
    entityType: entity.entityType,
    category: entity.category,
    componentKind: classification.kind,
    classification,
    resolutionStatus: resolved.status,
    resolutionReason: resolved.reason,
    primitives: resolved.primitives,
    dimensions: dimensions.values,
    dimensionEvidence: dimensions.evidence,
    geometrySources: geometry.sources || {},
  });
}

function buildPrimitive(kind, geometry, dimensions) {
  if (kind === 'TEE') return teePrimitive(geometry, dimensions);
  if (kind === 'REDUCER' || kind === 'OLET') return taperedPrimitive(kind, geometry, dimensions);
  if (kind === 'FLANGE') return componentSpan('FLANGE_DISC', geometry, dimensions.flangeOutsideDiameterMm, dimensions.componentLengthMm);
  if (kind === 'VALVE') return componentSpan('VALVE_BODY', geometry, dimensions.valveBodyDiameterMm || dimensions.outerDiameterMm, dimensions.componentLengthMm || dimensions.valveLengthMm);
  if (hasSpan(geometry.start, geometry.end)) return spanPrimitive(kind === 'ELBOW' ? 'BEND_CENTERLINE' : 'PIPE_TUBE', geometry.start, geometry.end, dimensions.outerDiameterMm);
  return skipped(`${kind}_SOURCE_TOPOLOGY_MISSING`);
}

function spanPrimitive(kind, start, end, diameterMm) {
  return outcome('resolved', diameterMm ? '' : 'SOURCE_CENTERLINE_ONLY', [{ kind, start, end, center: midpoint3(start, end), diameterMm, visualDiameterMm: diameterMm }]);
}

function componentSpan(kind, geometry, bodyDiameterMm, sourceLengthMm) {
  if (!hasSpan(geometry.start, geometry.end)) return skipped(`${kind}_SOURCE_PORTS_MISSING`);
  const sourceLength = distance3(geometry.start, geometry.end);
  const lengthQualified = !Number.isFinite(sourceLengthMm) || sourceLength === sourceLengthMm;
  return outcome('resolved', bodyDiameterMm ? '' : 'SOURCE_CENTERLINE_ONLY', [{
    kind,
    start: geometry.start,
    end: geometry.end,
    axisStart: geometry.start,
    axisEnd: geometry.end,
    center: midpoint3(geometry.start, geometry.end),
    bodyDiameterMm,
    outsideDiameterMm: bodyDiameterMm,
    visualBodyDiameterMm: bodyDiameterMm,
    visualOutsideDiameterMm: bodyDiameterMm,
    sourceLengthMm: sourceLength,
    declaredLengthMm: sourceLengthMm,
    lengthQualified,
  }]);
}

function taperedPrimitive(kind, geometry, dimensions) {
  if (!hasSpan(geometry.start, geometry.end)) return skipped(`${kind}_SOURCE_PORTS_MISSING`);
  const startDiameterMm = kind === 'REDUCER' ? dimensions.inletDiameterMm : dimensions.outerDiameterMm;
  const endDiameterMm = kind === 'REDUCER' ? dimensions.outletDiameterMm : dimensions.branchDiameterMm;
  return outcome('resolved', startDiameterMm && endDiameterMm ? '' : 'SOURCE_CENTERLINE_ONLY', [{
    kind: kind === 'REDUCER' ? 'REDUCER_FRUSTUM' : 'OLET_FRUSTUM',
    start: geometry.start,
    end: geometry.end,
    center: midpoint3(geometry.start, geometry.end),
    startDiameterMm,
    endDiameterMm,
    visualStartDiameterMm: startDiameterMm,
    visualEndDiameterMm: endDiameterMm,
  }]);
}

function teePrimitive(geometry, dimensions) {
  const points = exactPoints([...(geometry.points || []), geometry.start, geometry.end, ...(geometry.branchPoints || [])]);
  const center = geometry.center || centroid3(points);
  if (!center) return skipped('TEE_SOURCE_TOPOLOGY_MISSING');
  const endpoints = points.filter((point) => !samePoint(point, center));
  if (endpoints.length < 2) return skipped('TEE_SOURCE_PORTS_MISSING');
  return outcome('resolved', dimensions.outerDiameterMm ? '' : 'SOURCE_CENTERLINE_ONLY', endpoints.map((end, index) => ({
    kind: index >= 2 ? 'TEE_BRANCH' : 'TEE_LEG',
    start: center,
    end,
    diameterMm: index >= 2 ? dimensions.branchDiameterMm : dimensions.outerDiameterMm,
    visualDiameterMm: index >= 2 ? dimensions.branchDiameterMm : dimensions.outerDiameterMm,
  })));
}

function resolveSupportSites(profile, model) {
  const size = projectDataValue(profile, 'webglNavigation.supportMarkerSize');
  if (!model?.sites?.length) return [];
  return model.sites.map((site) => {
    const base = { schema: RESOLVED_ENGINEERING_ITEM_SCHEMA, entityId: site.primaryEntityId, entityType: 'SUPPORT_SITE', category: 'support', componentKind: 'SUPPORT', classification: { kind: 'SUPPORT' }, dimensions: { supportSizeMm: size }, dimensionEvidence: {}, geometrySources: { supportSiteId: site.siteId } };
    if (!Number.isFinite(size) || size <= 0) return freezeDeep({ ...base, resolutionStatus: 'skipped', resolutionReason: 'PROJECT_DATA_SUPPORT_MARKER_SIZE_MISSING', primitives: [] });
    return freezeDeep({ ...base, resolutionStatus: 'resolved', resolutionReason: '', primitives: [{ kind: 'SUPPORT_MARKER', center: site.positionMm, sizeMm: size, visualSizeMm: size, supportSiteId: site.siteId }] });
  });
}

function webglValues(profile) {
  return freezeDeep(Object.fromEntries(['supportMarkerSize', 'pickingRadius', 'cameraFitMargin', 'clickTimingMs', 'doubleClickTimingMs', 'clickTravelTolerancePx', 'zoomRate', 'navigationSensitivity', 'perspectiveFovDeg', 'meshRadialSegments', 'cameraNearMm', 'cameraFarMm'].map((key) => [key, projectDataValue(profile, `webglNavigation.${key}`)])));
}

function exactPoints(points) {
  const output = [];
  points.filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)).forEach((point) => {
    if (!output.some((candidate) => samePoint(candidate, point))) output.push(point);
  });
  return output;
}

function samePoint(left, right) { return left.x === right.x && left.y === right.y && left.z === right.z; }
function assertDataset(dataset) { if (!dataset || dataset.schema !== WORKSPACE_DATASET_SCHEMA || !Array.isArray(dataset.entities)) throw new TypeError(`Resolved engineering geometry requires ${WORKSPACE_DATASET_SCHEMA}.`); }
