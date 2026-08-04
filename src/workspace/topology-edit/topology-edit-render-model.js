import { semanticHash, stringValue } from '../../core/shared-piping-model/index.js';
import { DIMENSION_STATUS } from './dimension-authority.js';
import {
  createTopologyVisualGeometryModel,
  createVisualComponent,
  createVisualDiagnostic,
  createVisualPrimitive,
  visualPrimitiveId,
} from './visual-geometry-contract.js';

export const TOPOLOGY_EDIT_RENDER_MODEL = 'advanced-topology-edit-render-model/v1';
export const TOPOLOGY_EDIT_VISUAL_POLICY = 'TopologyEditVisualPolicy.v1';

export const DEFAULT_TOPOLOGY_VISUAL_POLICY = Object.freeze({
  schema: TOPOLOGY_EDIT_VISUAL_POLICY,
  chordErrorMm: 1,
  minimumArcSegments: 6,
  maximumArcSegments: 256,
  diagnosticRadiusMm: 2,
  radialSegments: 16,
  modelRole: 'DRAFT',
});

export function createTopologyEditRenderModel(input = {}) {
  return Object.freeze({
    schema: TOPOLOGY_EDIT_RENDER_MODEL,
    documentId: input.documentId || 'doc-draft-active',
    sessionVersion: input.sessionVersion || 1,
    sourceHash: input.sourceHash || '',
    baseCanonicalHash: input.baseCanonicalHash || '',
    draftCanonicalHash: input.draftCanonicalHash || '',
    verticalAxis: input.verticalAxis || 'Z',
    units: 'MM',
    source: Object.freeze(input.sourceVisualModel || { nodes: [], elements: [] }),
    draft: Object.freeze(input.draftVisualModel || { nodes: [], elements: [] }),
    ghost: input.ghostVisualModel ? Object.freeze(input.ghostVisualModel) : null,
    connectors: Object.freeze(input.connectors || []),
    transient: Object.freeze(input.transient || []),
    measurements: Object.freeze(input.measurements || []),
    issues: Object.freeze(input.issues || []),
    supports: Object.freeze(input.supports || []),
    selection: Object.freeze(input.selection || []),
    visibility: Object.freeze({ source: true, draft: true, ghost: false, connectors: false,
      transient: true, measurement: true, issues: true, supports: true, ...(input.visibility || {}) }),
    bounds: Object.freeze(input.bounds || { minimum: { x: 0, y: 0, z: 0 }, maximum: { x: 10, y: 10, z: 10 } }),
  });
}

export function deriveTopologyVisualGeometry(input = {}) {
  const topology = input.canonicalTopology;
  if (!topology?.canonicalTopologyHash) throw new TypeError('deriveTopologyVisualGeometry requires canonical topology authority.');
  if (!input.dimensionAuthority) throw new TypeError('deriveTopologyVisualGeometry requires dimension authority.');
  const policy = normalizePolicy(input.visualPolicy);
  const nodes = new Map((topology.nodes || []).map((node) => [stringValue(node.id), node.position]));
  const components = [
    ...(topology.edges || []).map((edge) => deriveEdge(edge, nodes, input, policy)),
    ...(topology.junctions || []).map((junction) => deriveJunction(junction, nodes, input, policy)),
  ];
  return createTopologyVisualGeometryModel({
    canonicalTopologyHash: topology.canonicalTopologyHash,
    geometryPolicyHash: semanticHash(policy),
    modelRole: policy.modelRole,
    components,
  });
}

export function projectVisualGeometryToViewport(model, canonicalTopology) {
  const nodes = (canonicalTopology?.nodes || []).map((node) => ({
    id: node.id, entityId: node.id, type: 'node', x: node.position.x, y: node.position.y, z: node.position.z,
    pickTarget: { objectKind: 'node', objectId: node.id, nodeId: node.id },
  }));
  const primitives = (model?.components || []).flatMap((component) => component.primitives);
  const segments = primitives.flatMap(primitiveToSegments);
  const elements = [...nodes, ...primitives.flatMap(primitiveToElements)];
  return Object.freeze({ elements: Object.freeze(elements), segments: Object.freeze(segments) });
}

export function visualPolicySummary(policy = DEFAULT_TOPOLOGY_VISUAL_POLICY) {
  const normalized = normalizePolicy(policy);
  return `Visual policy: ${normalized.chordErrorMm} mm chord error, ${normalized.radialSegments} radial segments, diagnostic radius ${normalized.diagnosticRadiusMm} mm.`;
}

function deriveEdge(edge, nodes, input, policy) {
  const start = pointFor(nodes, edge.fromNodeId);
  const end = pointFor(nodes, edge.toNodeId);
  const type = normalizedType(edge.entityType || 'PIPE');
  const evidence = evidenceFor(input.componentEvidence, edge.id, edge.componentKey);
  if (!start || !end) return unresolvedComponent(edge, type, evidence, 'EDGE_ENDPOINT_MISSING', 'Edge endpoint evidence is incomplete.');
  if (type === 'ELBOW') return deriveElbow(edge, start, end, evidence, input.dimensionAuthority, policy);
  if (type === 'REDUCER') return deriveReducer(edge, start, end, evidence, input.dimensionAuthority, policy);
  if (['FLANGE', 'VALVE', 'GASKET', 'INSTRUMENT'].includes(type)) {
    return deriveInlineSymbol(edge, type, start, end, evidence, input.dimensionAuthority, policy);
  }
  if (['PIPE', 'STRAIGHT', 'STRAIGHT_ELEMENT'].includes(type)) {
    return derivePipe(edge, 'PIPE', start, end, evidence, input.dimensionAuthority, policy);
  }
  return component(edge, type, evidence,
    [diagnosticLine(edge, type, start, end, evidence, policy, 'UNSUPPORTED_COMPONENT_TYPE')],
    [diagnostic(edge.id, 'VISUAL_COMPONENT_TYPE_UNSUPPORTED', `No governed visual derivation exists for ${type}.`)]);
}

function derivePipe(edge, type, start, end, evidence, authority, policy) {
  const diameter = authority.resolveOutsideDiameter(
    { ...evidence, diameterMm: authoritativeCanonicalDiameter(edge) },
    { componentId: edge.id, componentType: type },
  );
  const diagnostics = diagnosticsFromDimension(edge.id, diameter);
  const primitives = diameter.status === DIMENSION_STATUS.RESOLVED
    ? [primitive(edge, type, 'body', 'PIPE_CYLINDER', {
      start, end, outsideDiameterMm: diameter.valueMm, radialSegments: policy.radialSegments,
    }, evidence, policy)]
    : [diagnosticLine(edge, type, start, end, evidence, policy, diameter.status)];
  return component(edge, type, evidence, primitives, diagnostics);
}

function deriveElbow(edge, start, end, evidence, authority, policy) {
  const diameter = authority.resolveOutsideDiameter(
    { ...evidence, diameterMm: authoritativeCanonicalDiameter(edge) },
    { componentId: edge.id, componentType: 'ELBOW' },
  );
  const center = finitePoint(evidence.center);
  const radius = positive(evidence.centerlineRadiusMm) || (center ? distance(center, start) : null);
  const validArc = center && radius && nearlyEqual(distance(center, end), radius, policy.chordErrorMm);
  const diagnostics = diagnosticsFromDimension(edge.id, diameter);
  if (!validArc) diagnostics.push(diagnostic(edge.id, 'ELBOW_ARC_EVIDENCE_MISSING', 'Elbow center/radius evidence is missing or inconsistent.'));
  const primitives = diameter.status === DIMENSION_STATUS.RESOLVED && validArc
    ? [primitive(edge, 'ELBOW', 'arc', 'ELBOW_ARC',
      elbowParameters(start, end, center, radius, diameter.valueMm, policy), evidence, policy)]
    : [diagnosticLine(edge, 'ELBOW', start, end, evidence, policy, 'UNRESOLVED_ELBOW')];
  return component(edge, 'ELBOW', evidence, primitives, diagnostics);
}

function deriveReducer(edge, start, end, evidence, authority, policy) {
  const startDiameter = authority.resolveOutsideDiameter(
    reducerEndEvidence(evidence, 'start'),
    { componentId: edge.id, componentType: 'REDUCER', end: 'start' },
  );
  const endDiameter = authority.resolveOutsideDiameter(
    reducerEndEvidence(evidence, 'end'),
    { componentId: edge.id, componentType: 'REDUCER', end: 'end' },
  );
  const eccentric = String(evidence.reducerType || evidence.type || '').toUpperCase().includes('ECCENTRIC');
  const offsetDirection = unit(evidence.eccentricOffsetDirection);
  const diagnostics = [...diagnosticsFromDimension(edge.id, startDiameter), ...diagnosticsFromDimension(edge.id, endDiameter)];
  if (eccentric && !offsetDirection) diagnostics.push(diagnostic(edge.id, 'ECCENTRIC_DIRECTION_MISSING', 'Eccentric reducer direction evidence is required.'));
  const resolved = startDiameter.status === DIMENSION_STATUS.RESOLVED
    && endDiameter.status === DIMENSION_STATUS.RESOLVED
    && (!eccentric || offsetDirection);
  const kind = eccentric ? 'ECCENTRIC_REDUCER' : 'CONICAL_REDUCER';
  const eccentricOffsetMm = eccentric && resolved ? Math.abs(startDiameter.valueMm - endDiameter.valueMm) / 2 : 0;
  const adjustedEnd = eccentric && offsetDirection ? addPoint(end, scaleVector(offsetDirection, eccentricOffsetMm)) : end;
  const parameters = {
    start, end: adjustedEnd, sourceEnd: end,
    startOutsideDiameterMm: startDiameter.valueMm,
    endOutsideDiameterMm: endDiameter.valueMm,
    eccentricOffsetDirection: offsetDirection,
    eccentricOffsetMm,
    radialSegments: policy.radialSegments,
  };
  const primitives = resolved
    ? [primitive(edge, 'REDUCER', 'body', kind, parameters, evidence, policy)]
    : [diagnosticLine(edge, 'REDUCER', start, end, evidence, policy, 'UNRESOLVED_REDUCER')];
  return component(edge, 'REDUCER', evidence, primitives, diagnostics);
}

function deriveInlineSymbol(edge, type, start, end, evidence, authority, policy) {
  const diameter = authority.resolveOutsideDiameter(
    { ...evidence, diameterMm: authoritativeCanonicalDiameter(edge) },
    { componentId: edge.id, componentType: type },
  );
  const diagnostics = diagnosticsFromDimension(edge.id, diameter);
  const symbolDiameterMm = diameter.status === DIMENSION_STATUS.RESOLVED
    ? diameter.valueMm
    : positive(evidence.boreMm);
  if (diameter.status !== DIMENSION_STATUS.RESOLVED && symbolDiameterMm !== null) {
    diagnostics.push(warning(
      edge.id,
      'VISUAL_SYMBOL_USES_NOMINAL_BORE',
      `${type} visual symbol uses source nominal bore because outside diameter is unresolved.`,
      { nominalBoreMm: symbolDiameterMm },
    ));
  }
  const kinds = {
    FLANGE: 'FLANGE_DISC', VALVE: 'VALVE_BODY', GASKET: 'GASKET_DISC', INSTRUMENT: 'INSTRUMENT_MARKER',
  };
  const parameters = {
    start,
    end,
    center: midpoint(start, end),
    axis: unit(vector(start, end)),
    outsideDiameterMm: symbolDiameterMm,
    dimensionBasis: diameter.status === DIMENSION_STATUS.RESOLVED
      ? 'OUTSIDE_DIAMETER'
      : 'NOMINAL_BORE_VISUAL_PROXY',
  };
  const primitives = symbolDiameterMm !== null
    ? [primitive(edge, type, 'body', kinds[type], parameters, evidence, policy)]
    : [diagnosticLine(edge, type, start, end, evidence, policy, diameter.status)];
  return component(edge, type, evidence, primitives, diagnostics);
}

function deriveJunction(junction, nodes, input, policy) {
  const type = normalizedType(junction.entityType || 'JUNCTION');
  const evidence = evidenceFor(input.componentEvidence, junction.id, junction.componentKey);
  const positions = (junction.nodeIds || []).map((id) => pointFor(nodes, id)).filter(Boolean);
  if (!positions.length) return unresolvedComponent(
    junction, type, evidence, 'JUNCTION_POSITION_MISSING', 'Junction position evidence is missing.',
  );
  const center = finitePoint(evidence.center) || average(positions);
  if (type === 'TEE') return deriveTee(junction, center, nodes, evidence, input.dimensionAuthority, policy);
  if (type === 'OLET') return deriveOlet(junction, center, nodes, evidence, input.dimensionAuthority, policy);
  return component(junction, type, evidence,
    [primitive(junction, type, 'marker', 'JUNCTION_MARKER', { position: center }, evidence, policy)], []);
}

function deriveTee(junction, center, nodes, evidence, authority, policy) {
  const runIds = Array.isArray(evidence.runNodeIds) ? evidence.runNodeIds.map(stringValue) : [];
  const branchId = stringValue(evidence.branchNodeId);
  const runPoints = runIds.map((id) => pointFor(nodes, id));
  const branchPoint = pointFor(nodes, branchId);
  const runDiameter = authority.resolveOutsideDiameter(evidence, { componentId: junction.id, componentType: 'TEE' });
  const branchDiameter = authority.resolveBranchOutsideDiameter(evidence, { componentId: junction.id, componentType: 'TEE' });
  const diagnostics = [
    ...diagnosticsFromDimension(junction.id, runDiameter),
    ...diagnosticsFromDimension(junction.id, branchDiameter),
  ];
  if (runPoints.length !== 2 || runPoints.some((row) => !row) || !branchPoint) {
    diagnostics.push(diagnostic(junction.id, 'TEE_PORT_ROLES_MISSING', 'TEE run and branch node identities are required.'));
  }
  const resolved = diagnostics.length === 0;
  const parameters = {
    center,
    runNodeIds: runIds,
    branchNodeId: branchId,
    runDirections: runPoints.map((row) => row ? unit(vector(center, row)) : null),
    branchDirection: branchPoint ? unit(vector(center, branchPoint)) : null,
    runOutsideDiameterMm: runDiameter.valueMm,
    branchOutsideDiameterMm: branchDiameter.valueMm,
  };
  const primitives = resolved
    ? [primitive(junction, 'TEE', 'body', 'TEE_JUNCTION', parameters, evidence, policy)]
    : [primitive(junction, 'TEE', 'marker', 'JUNCTION_MARKER', { position: center }, evidence, policy)];
  return component(junction, 'TEE', evidence, primitives, diagnostics);
}

function deriveOlet(junction, center, nodes, evidence, authority, policy) {
  const branchId = stringValue(evidence.branchNodeId);
  const branchPoint = pointFor(nodes, branchId);
  const hostEntityId = stringValue(evidence.hostEntityId);
  const branchDiameter = authority.resolveBranchOutsideDiameter(evidence, {
    componentId: junction.id, componentType: 'OLET',
  });
  const diagnostics = diagnosticsFromDimension(junction.id, branchDiameter);
  if (!hostEntityId) diagnostics.push(diagnostic(junction.id, 'OLET_HOST_MISSING', 'OLET host entity identity is required.'));
  if (!branchPoint) diagnostics.push(diagnostic(junction.id, 'OLET_BRANCH_AXIS_MISSING', 'OLET branch node identity is required.'));
  const parameters = {
    center, hostEntityId, branchNodeId: branchId,
    branchDirection: branchPoint ? unit(vector(center, branchPoint)) : null,
    branchOutsideDiameterMm: branchDiameter.valueMm,
  };
  const primitives = diagnostics.length === 0
    ? [primitive(junction, 'OLET', 'body', 'OLET_BRANCH', parameters, evidence, policy)]
    : [primitive(junction, 'OLET', 'marker', 'JUNCTION_MARKER', { position: center }, evidence, policy)];
  return component(junction, 'OLET', evidence, primitives, diagnostics);
}

function primitive(entity, type, partRole, kind, parameters, evidence, policy) {
  return createVisualPrimitive({
    primitiveId: visualPrimitiveId(entity.id, partRole, semanticHash(policy)),
    canonicalEntityId: entity.id,
    canonicalType: type,
    modelRole: policy.modelRole,
    partRole,
    kind,
    sourcePaths: sourcePaths(entity, evidence),
    workspaceEntityIds: workspaceIds(entity, evidence),
    parameters,
  });
}

function component(entity, type, evidence, primitives, diagnostics) {
  return createVisualComponent({
    canonicalEntityId: entity.id,
    canonicalType: type,
    sourcePaths: sourcePaths(entity, evidence),
    workspaceEntityIds: workspaceIds(entity, evidence),
    primitives,
    diagnostics,
  });
}

function unresolvedComponent(entity, type, evidence, code, message) {
  return component(entity, type, evidence, [], [diagnostic(entity.id, code, message)]);
}

function diagnosticLine(entity, type, start, end, evidence, policy, reason) {
  return primitive(entity, type, 'diagnostic-centerline', 'DIAGNOSTIC_CENTERLINE', {
    start, end, radiusMm: policy.diagnosticRadiusMm, reason,
  }, evidence, policy);
}

function diagnostic(entityId, code, message, details = {}) {
  return createVisualDiagnostic({ code, severity: 'ERROR', message, canonicalEntityId: entityId, details });
}

function warning(entityId, code, message, details = {}) {
  return createVisualDiagnostic({ code, severity: 'WARNING', message, canonicalEntityId: entityId, details });
}

function diagnosticsFromDimension(entityId, result) {
  return (result?.diagnostics || []).map((row) => createVisualDiagnostic({
    ...row,
    canonicalEntityId: entityId,
    sourceEvidenceIds: row.evidenceIds || row.sourceEvidenceIds || [],
  }));
}

function primitiveToSegments(primitive) {
  const parameters = primitive.parameters;
  if (!parameters.start || !parameters.end) return [];
  const diagnosticDiameter = primitive.kind === 'DIAGNOSTIC_CENTERLINE'
    ? positive(parameters.radiusMm) * 2
    : null;
  const diameter = positive(parameters.outsideDiameterMm)
    || positive(parameters.startOutsideDiameterMm)
    || diagnosticDiameter;
  if (!diameter) return [];
  return [{
    id: primitive.primitiveId,
    entityId: primitive.canonicalEntityId,
    type: primitive.kind,
    start: parameters.start,
    end: parameters.end,
    points: parameters.arcPoints || null,
    radiusMm: diameter / 2,
    endRadiusMm: positive(parameters.endOutsideDiameterMm) ? parameters.endOutsideDiameterMm / 2 : null,
    pickTarget: pickTarget(primitive),
  }];
}

function primitiveToElements(primitive) {
  const position = primitive.parameters.center || primitive.parameters.position;
  return position ? [{
    id: primitive.primitiveId,
    entityId: primitive.canonicalEntityId,
    type: primitive.kind,
    x: position.x,
    y: position.y,
    z: position.z,
    pickTarget: pickTarget(primitive),
  }] : [];
}

function pickTarget(primitive) {
  return {
    objectKind: 'component',
    objectId: primitive.canonicalEntityId,
    sourcePaths: primitive.sourcePaths,
    workspaceEntityIds: primitive.workspaceEntityIds,
    partRole: primitive.partRole,
  };
}

function elbowParameters(start, end, center, radius, outsideDiameterMm, policy) {
  const startVector = unit(vector(center, start));
  const endVector = unit(vector(center, end));
  const angleRad = Math.acos(clamp(dot(startVector, endVector), -1, 1));
  const bendPlaneNormal = unit(cross(startVector, endVector));
  const segmentCount = arcSegments(radius, angleRad, policy);
  return {
    start, end, center, centerlineRadiusMm: radius, outsideDiameterMm, angleRad, segmentCount,
    bendPlaneNormal,
    arcPoints: sampleArc(center, startVector, bendPlaneNormal, radius, angleRad, segmentCount),
  };
}

function arcSegments(radius, angle, policy) {
  const ratio = clamp(1 - (policy.chordErrorMm / radius), -1, 1);
  const step = 2 * Math.acos(ratio);
  const calculated = step > 0 ? Math.ceil(Math.abs(angle) / step) : policy.maximumArcSegments;
  return clamp(calculated, policy.minimumArcSegments, policy.maximumArcSegments);
}

function reducerEndEvidence(evidence, end) {
  const key = end === 'start' ? 'startOutsideDiameterMm' : 'endOutsideDiameterMm';
  const nested = end === 'start' ? evidence.startDimensions : evidence.endDimensions;
  return {
    ...nested,
    outsideDiameterMm: evidence[key] ?? nested?.outsideDiameterMm,
    sourceEvidenceId: evidence.sourceEvidenceId,
  };
}

function normalizePolicy(policy = {}) {
  const merged = { ...DEFAULT_TOPOLOGY_VISUAL_POLICY, ...policy };
  return Object.freeze({
    ...merged,
    chordErrorMm: positive(merged.chordErrorMm) || 1,
    minimumArcSegments: integerAtLeast(merged.minimumArcSegments, 3),
    maximumArcSegments: integerAtLeast(merged.maximumArcSegments, 3),
    diagnosticRadiusMm: positive(merged.diagnosticRadiusMm) || 2,
    radialSegments: integerAtLeast(merged.radialSegments, 8),
    modelRole: stringValue(merged.modelRole || 'DRAFT').toUpperCase(),
  });
}

function evidenceFor(source, id, componentKey) {
  return source instanceof Map
    ? (source.get(id) || source.get(componentKey) || {})
    : (source?.[id] || source?.[componentKey] || {});
}
function sourcePaths(entity, evidence) {
  return [...new Set([
    entity.sourcePath, ...(entity.sourcePaths || []), evidence.sourcePath, ...(evidence.sourcePaths || []),
  ].map(stringValue).filter(Boolean))].sort();
}
function workspaceIds(entity, evidence) {
  return [...new Set([
    entity.componentKey, entity.entityId, ...(evidence.workspaceEntityIds || []),
  ].map(stringValue).filter(Boolean))].sort();
}
function authoritativeCanonicalDiameter(edge) {
  return edge.diameterAuthority === 'OUTSIDE_DIAMETER'
    ? positive(edge.outsideDiameterMm)
    : undefined;
}
function normalizedType(value) {
  const token = stringValue(value).toUpperCase().replace(/[\s/-]+/g, '_');
  return ({
    BEND: 'ELBOW', ELBO: 'ELBOW', REDUCING_TEE: 'TEE',
    WELDOLET: 'OLET', SOCKOLET: 'OLET', INST: 'INSTRUMENT',
  })[token] || token;
}
function pointFor(nodes, id) { return finitePoint(nodes.get(stringValue(id))); }
function finitePoint(value) {
  return value && [value.x, value.y, value.z].every((row) => Number.isFinite(Number(row)))
    ? Object.freeze({ x: Number(value.x), y: Number(value.y), z: Number(value.z) })
    : null;
}
function positive(value) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : null; }
function integerAtLeast(value, minimum) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= minimum ? number : minimum;
}
function vector(from, to) { return { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z }; }
function addPoint(point, offset) { return { x: point.x + offset.x, y: point.y + offset.y, z: point.z + offset.z }; }
function scaleVector(value, scalar) { return { x: value.x * scalar, y: value.y * scalar, z: value.z * scalar }; }
function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }; }
function average(rows) {
  return rows.reduce((sum, row) => ({
    x: sum.x + row.x / rows.length,
    y: sum.y + row.y / rows.length,
    z: sum.z + row.z / rows.length,
  }), { x: 0, y: 0, z: 0 });
}
function distance(a, b) { return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); }
function unit(value) {
  if (!value) return null;
  const length = Math.hypot(value.x, value.y, value.z);
  return length > 1e-12 ? { x: value.x / length, y: value.y / length, z: value.z / length } : null;
}
function dot(a, b) { return a && b ? (a.x * b.x) + (a.y * b.y) + (a.z * b.z) : 0; }
function cross(a, b) {
  return a && b ? {
    x: (a.y * b.z) - (a.z * b.y),
    y: (a.z * b.x) - (a.x * b.z),
    z: (a.x * b.y) - (a.y * b.x),
  } : null;
}
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
function nearlyEqual(a, b, tolerance) { return Math.abs(a - b) <= Math.max(tolerance, 1e-9); }
function sampleArc(center, startVector, normal, radius, angle, count) {
  if (!normal) return [];
  return Array.from({ length: count + 1 }, (_, index) => {
    const theta = angle * (index / count);
    const rotated = rodrigues(startVector, normal, theta);
    return addPoint(center, scaleVector(rotated, radius));
  });
}
function rodrigues(value, axis, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return addPoint(
    addPoint(scaleVector(value, cosine), scaleVector(cross(axis, value), sine)),
    scaleVector(axis, dot(axis, value) * (1 - cosine)),
  );
}
