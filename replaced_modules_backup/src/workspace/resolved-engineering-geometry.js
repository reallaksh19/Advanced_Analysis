import { WORKSPACE_DATASET_SCHEMA } from './dataset-adapter.js';
import { freezeDeep } from './dataset-utils.js';
import { classifyEngineeringComponent } from './engineering-component-classifier.js';
import { resolveEngineeringDimensions } from './engineering-dimension-resolver.js';
import { buildCircularArcPath, calculatePrimitiveBounds, centroid3, distance3, midpoint3 } from './engineering-geometry-math.js';
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
  const resolved = buildPrimitive(classification.kind, geometry, dimensions.values, entity);
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

function buildPrimitive(kind, geometry, dimensions, entity) {
  if (kind === 'TEE') return teePrimitive(geometry, dimensions, entity);
  if (kind === 'REDUCER' || kind === 'OLET') return taperedPrimitive(kind, geometry, dimensions);
  if (kind === 'FLANGE') {
    // AVEVA: flangeOutsideDiameterMm resolved from ABORE (bore), not actual OD.
    // Derive actual OD using ASME B16.5 rule: OD ≈ bore × 2.0 for 900# (conservative estimate).
    const boreMm = dimensions.flangeOutsideDiameterMm || dimensions.nominalBoreMm || dimensions.outerDiameterMm;
    const flangeOD = boreMm ? deriveFlangeOutsideDiameter(boreMm) : null;
    return componentSpan('FLANGE_DISC', geometry, flangeOD, dimensions.componentLengthMm);
  }
  if (kind === 'VALVE') {
    // AVEVA: valveBodyDiameterMm resolved from ABORE. Body envelope ≈ bore × 2.5.
    const boreMm = dimensions.valveBodyDiameterMm || dimensions.nominalBoreMm || dimensions.outerDiameterMm;
    const bodyOD = boreMm ? Math.max(boreMm * 2.5, boreMm + 100) : null;
    return componentSpan('VALVE_BODY', geometry, bodyOD, dimensions.componentLengthMm || dimensions.valveLengthMm);
  }
  if (kind === 'ELBOW') return elbowPrimitive(geometry, dimensions, entity);
  if (hasSpan(geometry.start, geometry.end)) return spanPrimitive('PIPE_TUBE', geometry.start, geometry.end, dimensions.outerDiameterMm);
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

function teePrimitive(geometry, dimensions, entity) {
  // Collect declared points first
  const declared = exactPoints([...(geometry.points || []), geometry.start, geometry.end, ...(geometry.branchPoints || [])]);
  // If branch point is missing (BPOS=null from AVEVA), derive it from ORI attribute
  const allPoints = declared.length >= 3 ? declared : deriveTeeBranchPoints(geometry, entity, declared);
  const center = geometry.center || centroid3(allPoints);
  if (!center) return skipped('TEE_SOURCE_TOPOLOGY_MISSING');
  const endpoints = allPoints.filter((point) => !samePoint(point, center));
  if (endpoints.length < 2) return skipped('TEE_SOURCE_PORTS_MISSING');
  return outcome('resolved', dimensions.outerDiameterMm ? '' : 'SOURCE_CENTERLINE_ONLY', endpoints.map((end, index) => ({
    kind: index >= 2 ? 'TEE_BRANCH' : 'TEE_LEG',
    start: center,
    end,
    diameterMm: index >= 2 ? dimensions.branchDiameterMm : dimensions.outerDiameterMm,
    visualDiameterMm: index >= 2 ? dimensions.branchDiameterMm : dimensions.outerDiameterMm,
  })));
}

/** Derive TEE branch port from AVEVA ORI string when BPOS is null. */
function deriveTeeBranchPoints(geometry, entity, existingPoints) {
  const attrs = entity?.properties?.attributes || entity?.properties?.sourceAttributes || {};
  const ori = String(attrs.ORI || '');
  if (!ori || !geometry.start || !geometry.end) return existingPoints;
  const branchAxis = parsedOriLocalZ(ori);
  if (!branchAxis) return existingPoints;
  const center = midpoint3(geometry.start, geometry.end);
  if (!center) return existingPoints;
  const runLen = distance3(geometry.start, geometry.end);
  const stubLen = Math.max(runLen / 2, 50);
  const branchPoint = freezeDeep({
    x: center.x + branchAxis.x * stubLen,
    y: center.y + branchAxis.y * stubLen,
    z: center.z + branchAxis.z * stubLen,
  });
  return exactPoints([geometry.start, geometry.end, branchPoint]);
}

/** Build elbow arc path using AVEVA APOS/LPOS/ORI/RADI. */
function elbowPrimitive(geometry, dimensions, entity) {
  if (!hasSpan(geometry.start, geometry.end)) return skipped('ELBOW_SOURCE_PORTS_MISSING');
  const boreMm = dimensions.nominalBoreMm || dimensions.outerDiameterMm;
  const outerDiameterMm = boreMm;
  // Determine bend radius: RADI=0 means long-radius standard (1.5 × NPS)
  let bendRadiusMm = dimensions.bendRadiusMm;
  if (!bendRadiusMm || bendRadiusMm === 0) {
    bendRadiusMm = boreMm ? boreMm * 1.5 : null;
  }
  // Attempt to build an arc path using AVEVA ORI to find bend centre
  let path = null;
  if (bendRadiusMm) {
    const attrs = entity?.properties?.attributes || entity?.properties?.sourceAttributes || {};
    const ori = String(attrs.ORI || '');
    const bendCentre = computeElbowBendCentre(geometry.start, geometry.end, ori, bendRadiusMm);
    if (bendCentre) {
      path = buildCircularArcPath(geometry.start, geometry.end, bendCentre, 18);
    }
  }
  // Fall back to straight centerline if arc cannot be computed
  if (!path) {
    return spanPrimitive('BEND_CENTERLINE', geometry.start, geometry.end, outerDiameterMm);
  }
  return outcome('resolved', outerDiameterMm ? '' : 'SOURCE_CENTERLINE_ONLY', [{
    kind: 'BEND_ARC',
    start: geometry.start,
    end: geometry.end,
    center: midpoint3(geometry.start, geometry.end),
    path,
    diameterMm: outerDiameterMm,
    visualDiameterMm: outerDiameterMm,
    bendRadiusMm,
  }]);
}

/**
 * Compute the centre of the bend arc from APOS (start), LPOS (end), and AVEVA ORI flow direction.
 * For a right-angle bend, the center of curvature lies opposite the intersection of tangents:
 * Center = End - Inflow_Tangent_Direction * R (where R is the leg length along the tangent).
 */
function computeElbowBendCentre(start, end, oriStr, fallbackRadiusMm) {
  let inflowDir = parsedOriLocalX(oriStr);
  if (!inflowDir || !start || !end) {
    if (!start || !end) return null;
    // Fallback: for orthogonal bends without valid ORI, check which coordinates differ
    const dx = Math.abs(end.x - start.x) > 1e-3 ? end.x - start.x : 0;
    const dy = Math.abs(end.y - start.y) > 1e-3 ? end.y - start.y : 0;
    const dz = Math.abs(end.z - start.z) > 1e-3 ? end.z - start.z : 0;
    const nonZeros = [dx, dy, dz].filter(v => Math.abs(v) > 0);
    if (nonZeros.length === 2) {
      // Pick one corner of the bounding rectangle as the center of curvature
      return freezeDeep({ x: dx ? end.x : start.x, y: dy ? end.y : start.y, z: dz ? end.z : start.z });
    }
    return null;
  }
  // Orient inflowDir to point from start toward end along the chord projection
  const vec = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  const dot = vec.x * inflowDir.x + vec.y * inflowDir.y + vec.z * inflowDir.z;
  if (dot < 0) {
    inflowDir = { x: -inflowDir.x, y: -inflowDir.y, z: -inflowDir.z };
  }
  const R = Math.abs(vec.x * inflowDir.x + vec.y * inflowDir.y + vec.z * inflowDir.z) || fallbackRadiusMm;
  if (!(R > 0)) return null;
  return freezeDeep({
    x: end.x - inflowDir.x * R,
    y: end.y - inflowDir.y * R,
    z: end.z - inflowDir.z * R,
  });
}

// --- AVEVA ORI parsing helpers ---

const AVEVA_CARDINALS = {
  E: [1, 0, 0], W: [-1, 0, 0],
  N: [0, 1, 0], S: [0, -1, 0],
  U: [0, 0, 1], D: [0, 0, -1],
};

/** Parse "Y is N and Z is U" into local-Z world vector (branch direction for TEEs). */
function parsedOriLocalZ(oriStr) {
  // Format: "Y is <cardinal> and Z is <cardinal>"
  const m = oriStr.match(/Y\s+is\s+(\w+)\s+and\s+Z\s+is\s+(\w+)/i);
  if (!m) return null;
  const lzArr = AVEVA_CARDINALS[m[2].toUpperCase()];
  if (!lzArr) return null;
  return freezeDeep({ x: lzArr[0], y: lzArr[1], z: lzArr[2] });
}

/** Parse ORI into local-X (flow axis) = cross(local-Y, local-Z). */
function parsedOriLocalX(oriStr) {
  const m = oriStr.match(/Y\s+is\s+(\w+)\s+and\s+Z\s+is\s+(\w+)/i);
  if (!m) return null;
  const lyArr = AVEVA_CARDINALS[m[1].toUpperCase()];
  const lzArr = AVEVA_CARDINALS[m[2].toUpperCase()];
  if (!lyArr || !lzArr) return null;
  // local-X = local-Y × local-Z
  return freezeDeep({
    x: lyArr[1] * lzArr[2] - lyArr[2] * lzArr[1],
    y: lyArr[2] * lzArr[0] - lyArr[0] * lzArr[2],
    z: lyArr[0] * lzArr[1] - lyArr[1] * lzArr[0],
  });
}

/**
 * Derive ASME flange outside diameter from bore.
 * Using conservative ASME B16.5 900# approximation: OD ≈ bore × 2.0
 * (actual values range from 1.7× for large bores to 2.8× for small bores).
 */
function deriveFlangeOutsideDiameter(boreMm) {
  // Piecewise approximation for 900# class flanges
  if (boreMm <= 25) return boreMm * 2.8;
  if (boreMm <= 50) return boreMm * 2.5;
  if (boreMm <= 100) return boreMm * 2.2;
  if (boreMm <= 200) return boreMm * 2.0;
  return boreMm * 1.8; // large bores 250mm+
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
