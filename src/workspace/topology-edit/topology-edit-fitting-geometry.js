/** Pure fitting and component visual derivation for Wave 2. */
import { semanticHash, stringValue } from '../../core/shared-piping-model/index.js';
import { DIMENSION_STATUS } from './dimension-authority.js';
import {
  createVisualComponent,
  createVisualDiagnostic,
  createVisualPrimitive,
  visualPrimitiveId,
} from './visual-geometry-contract.js';
import {
  addPoint,
  averagePoints,
  clampNumber,
  crossProduct,
  distance,
  dotProduct,
  finitePoint,
  midpoint,
  nearlyEqual,
  positiveNumber,
  sampleCircularArc,
  scaleVector,
  unitVector,
  vector,
} from './topology-edit-geometry-math.js';
import {
  authoritativeCanonicalDiameter,
  canonicalType,
  componentEvidence,
  sourcePaths,
  workspaceEntityIds,
} from './topology-edit-visual-policy.js';

export function deriveVisualComponents(input, policy) {
  const topology = input.canonicalTopology;
  const nodes = new Map((topology.nodes || []).map((node) => [stringValue(node.id), finitePoint(node.position)]));
  return [
    ...(topology.edges || []).map((edge) => deriveEdge(edge, nodes, input, policy)),
    ...(topology.junctions || []).map((junction) => deriveJunction(junction, nodes, input, policy)),
  ];
}

function deriveEdge(edge, nodes, input, policy) {
  const start = nodes.get(stringValue(edge.fromNodeId));
  const end = nodes.get(stringValue(edge.toNodeId));
  const type = canonicalType(edge.entityType || 'PIPE');
  const evidence = componentEvidence(input.componentEvidence, edge.id, edge.componentKey);
  if (!start || !end) return unresolved(edge, type, evidence, 'EDGE_ENDPOINT_MISSING', 'Edge endpoint evidence is incomplete.');
  if (type === 'ELBOW') return deriveElbow(edge, start, end, evidence, input.dimensionAuthority, policy);
  if (type === 'REDUCER') return deriveReducer(edge, start, end, evidence, input.dimensionAuthority, policy);
  if (['FLANGE', 'VALVE', 'GASKET', 'INSTRUMENT'].includes(type)) {
    return deriveInlineSymbol(edge, type, start, end, evidence, input.dimensionAuthority, policy);
  }
  if (['PIPE', 'STRAIGHT', 'STRAIGHT_ELEMENT'].includes(type)) {
    return derivePipe(edge, start, end, evidence, input.dimensionAuthority, policy);
  }
  return component(edge, type, evidence, [diagnosticLine(edge, type, start, end, evidence, policy, 'UNSUPPORTED_COMPONENT_TYPE')], [
    diagnostic(edge.id, 'VISUAL_COMPONENT_TYPE_UNSUPPORTED', `No governed visual derivation exists for ${type}.`),
  ]);
}

function derivePipe(edge, start, end, evidence, authority, policy) {
  const diameter = authority.resolveOutsideDiameter(
    { ...evidence, diameterMm: authoritativeCanonicalDiameter(edge) },
    { componentId: edge.id, componentType: 'PIPE' },
  );
  const diagnostics = dimensionDiagnostics(edge.id, diameter);
  const primitives = diameter.status === DIMENSION_STATUS.RESOLVED
    ? [primitive(edge, 'PIPE', 'body', 'PIPE_CYLINDER', {
      start,
      end,
      outsideDiameterMm: diameter.valueMm,
      radialSegments: policy.radialSegments,
    }, evidence, policy)]
    : [diagnosticLine(edge, 'PIPE', start, end, evidence, policy, diameter.status)];
  return component(edge, 'PIPE', evidence, primitives, diagnostics);
}

function deriveElbow(edge, start, end, evidence, authority, policy) {
  const diameter = authority.resolveOutsideDiameter(
    { ...evidence, diameterMm: authoritativeCanonicalDiameter(edge) },
    { componentId: edge.id, componentType: 'ELBOW' },
  );
  const center = finitePoint(evidence.center);
  const radius = positiveNumber(evidence.centerlineRadiusMm) ?? (center ? distance(center, start) : null);
  const validArc = center && radius && nearlyEqual(distance(center, end), radius, policy.chordErrorMm);
  const diagnostics = dimensionDiagnostics(edge.id, diameter);
  if (!validArc) diagnostics.push(diagnostic(edge.id, 'ELBOW_ARC_EVIDENCE_MISSING', 'Elbow center/radius evidence is missing or inconsistent.'));
  const resolved = diameter.status === DIMENSION_STATUS.RESOLVED && validArc;
  const primitives = resolved
    ? [primitive(edge, 'ELBOW', 'arc', 'ELBOW_ARC', elbowParameters(
      start, end, center, radius, diameter.valueMm, policy,
    ), evidence, policy)]
    : [diagnosticLine(edge, 'ELBOW', start, end, evidence, policy, 'UNRESOLVED_ELBOW')];
  return component(edge, 'ELBOW', evidence, primitives, diagnostics);
}

function deriveReducer(edge, start, end, evidence, authority, policy) {
  const startDiameter = authority.resolveOutsideDiameter(reducerEvidence(evidence, 'start'), {
    componentId: edge.id, componentType: 'REDUCER', end: 'start',
  });
  const endDiameter = authority.resolveOutsideDiameter(reducerEvidence(evidence, 'end'), {
    componentId: edge.id, componentType: 'REDUCER', end: 'end',
  });
  const eccentric = String(evidence.reducerType || evidence.type || '').toUpperCase().includes('ECCENTRIC');
  const offsetDirection = unitVector(evidence.eccentricOffsetDirection);
  const diagnostics = [...dimensionDiagnostics(edge.id, startDiameter), ...dimensionDiagnostics(edge.id, endDiameter)];
  if (eccentric && !offsetDirection) diagnostics.push(diagnostic(edge.id, 'ECCENTRIC_DIRECTION_MISSING', 'Eccentric reducer direction evidence is required.'));
  const resolved = startDiameter.status === DIMENSION_STATUS.RESOLVED
    && endDiameter.status === DIMENSION_STATUS.RESOLVED
    && (!eccentric || offsetDirection);
  const offsetMm = eccentric && resolved ? Math.abs(startDiameter.valueMm - endDiameter.valueMm) / 2 : 0;
  const adjustedEnd = eccentric && offsetDirection ? addPoint(end, scaleVector(offsetDirection, offsetMm)) : end;
  const parameters = {
    start,
    end: adjustedEnd,
    sourceEnd: end,
    startOutsideDiameterMm: startDiameter.valueMm,
    endOutsideDiameterMm: endDiameter.valueMm,
    eccentricOffsetDirection: offsetDirection,
    eccentricOffsetMm: offsetMm,
    radialSegments: policy.radialSegments,
  };
  const kind = eccentric ? 'ECCENTRIC_REDUCER' : 'CONICAL_REDUCER';
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
  const kinds = {
    FLANGE: 'FLANGE_DISC',
    VALVE: 'VALVE_BODY',
    GASKET: 'GASKET_DISC',
    INSTRUMENT: 'INSTRUMENT_MARKER',
  };
  const parameters = {
    start,
    end,
    center: midpoint(start, end),
    axis: unitVector(vector(start, end)),
    outsideDiameterMm: diameter.valueMm,
  };
  const primitives = diameter.status === DIMENSION_STATUS.RESOLVED
    ? [primitive(edge, type, 'body', kinds[type], parameters, evidence, policy)]
    : [diagnosticLine(edge, type, start, end, evidence, policy, diameter.status)];
  return component(edge, type, evidence, primitives, dimensionDiagnostics(edge.id, diameter));
}

function deriveJunction(junction, nodes, input, policy) {
  const type = canonicalType(junction.entityType || 'JUNCTION');
  const evidence = componentEvidence(input.componentEvidence, junction.id, junction.componentKey);
  const positions = (junction.nodeIds || []).map((id) => nodes.get(stringValue(id))).filter(Boolean);
  if (!positions.length) return unresolved(junction, type, evidence, 'JUNCTION_POSITION_MISSING', 'Junction position evidence is missing.');
  const center = finitePoint(evidence.center) || averagePoints(positions);
  if (type === 'TEE') return deriveTee(junction, center, nodes, evidence, input.dimensionAuthority, policy);
  if (type === 'OLET') return deriveOlet(junction, center, nodes, evidence, input.dimensionAuthority, policy);
  return component(junction, type, evidence, [
    primitive(junction, type, 'marker', 'JUNCTION_MARKER', { position: center }, evidence, policy),
  ], []);
}

function deriveTee(junction, center, nodes, evidence, authority, policy) {
  const runIds = Array.isArray(evidence.runNodeIds) ? evidence.runNodeIds.map(stringValue) : [];
  const branchId = stringValue(evidence.branchNodeId);
  const runPoints = runIds.map((id) => nodes.get(id));
  const branchPoint = nodes.get(branchId);
  const runDiameter = authority.resolveOutsideDiameter(evidence, { componentId: junction.id, componentType: 'TEE' });
  const branchDiameter = authority.resolveBranchOutsideDiameter(evidence, { componentId: junction.id, componentType: 'TEE' });
  const diagnostics = [...dimensionDiagnostics(junction.id, runDiameter), ...dimensionDiagnostics(junction.id, branchDiameter)];
  if (runPoints.length !== 2 || runPoints.some((row) => !row) || !branchPoint) {
    diagnostics.push(diagnostic(junction.id, 'TEE_PORT_ROLES_MISSING', 'TEE run and branch node identities are required.'));
  }
  const parameters = {
    center,
    runNodeIds: runIds,
    branchNodeId: branchId,
    runDirections: runPoints.map((row) => row ? unitVector(vector(center, row)) : null),
    branchDirection: branchPoint ? unitVector(vector(center, branchPoint)) : null,
    runOutsideDiameterMm: runDiameter.valueMm,
    branchOutsideDiameterMm: branchDiameter.valueMm,
  };
  const kind = diagnostics.length ? 'JUNCTION_MARKER' : 'TEE_JUNCTION';
  const role = diagnostics.length ? 'marker' : 'body';
  return component(junction, 'TEE', evidence, [primitive(junction, 'TEE', role, kind,
    diagnostics.length ? { position: center } : parameters, evidence, policy)], diagnostics);
}

function deriveOlet(junction, center, nodes, evidence, authority, policy) {
  const branchId = stringValue(evidence.branchNodeId);
  const branchPoint = nodes.get(branchId);
  const hostEntityId = stringValue(evidence.hostEntityId);
  const diameter = authority.resolveBranchOutsideDiameter(evidence, {
    componentId: junction.id, componentType: 'OLET',
  });
  const diagnostics = dimensionDiagnostics(junction.id, diameter);
  if (!hostEntityId) diagnostics.push(diagnostic(junction.id, 'OLET_HOST_MISSING', 'OLET host entity identity is required.'));
  if (!branchPoint) diagnostics.push(diagnostic(junction.id, 'OLET_BRANCH_AXIS_MISSING', 'OLET branch node identity is required.'));
  const parameters = {
    center,
    hostEntityId,
    branchNodeId: branchId,
    branchDirection: branchPoint ? unitVector(vector(center, branchPoint)) : null,
    branchOutsideDiameterMm: diameter.valueMm,
  };
  const kind = diagnostics.length ? 'JUNCTION_MARKER' : 'OLET_BRANCH';
  const role = diagnostics.length ? 'marker' : 'body';
  return component(junction, 'OLET', evidence, [primitive(junction, 'OLET', role, kind,
    diagnostics.length ? { position: center } : parameters, evidence, policy)], diagnostics);
}

function primitive(entity, type, partRole, kind, parameters, evidence, policy) {
  return createVisualPrimitive({
    primitiveId: visualPrimitiveId(entity.id, partRole, policy.policyHash),
    canonicalEntityId: entity.id,
    canonicalType: type,
    modelRole: policy.modelRole,
    partRole,
    kind,
    sourcePaths: sourcePaths(entity, evidence),
    workspaceEntityIds: workspaceEntityIds(entity, evidence),
    parameters,
  });
}

function component(entity, type, evidence, primitives, diagnostics) {
  return createVisualComponent({
    canonicalEntityId: entity.id,
    canonicalType: type,
    sourcePaths: sourcePaths(entity, evidence),
    workspaceEntityIds: workspaceEntityIds(entity, evidence),
    primitives,
    diagnostics,
  });
}

function unresolved(entity, type, evidence, code, message) {
  return component(entity, type, evidence, [], [diagnostic(entity.id, code, message)]);
}

function diagnosticLine(entity, type, start, end, evidence, policy, reason) {
  return primitive(entity, type, 'diagnostic-centerline', 'DIAGNOSTIC_CENTERLINE', {
    start, end, radiusMm: policy.diagnosticRadiusMm, reason,
  }, evidence, policy);
}

function diagnostic(entityId, code, message) {
  return createVisualDiagnostic({ code, severity: 'ERROR', message, canonicalEntityId: entityId });
}

function dimensionDiagnostics(entityId, result) {
  return (result?.diagnostics || []).map((row) => createVisualDiagnostic({
    ...row,
    canonicalEntityId: entityId,
    sourceEvidenceIds: row.evidenceIds || row.sourceEvidenceIds || [],
  }));
}

function elbowParameters(start, end, center, radius, outsideDiameterMm, policy) {
  const startVector = unitVector(vector(center, start));
  const endVector = unitVector(vector(center, end));
  const angleRad = Math.acos(clampNumber(dotProduct(startVector, endVector), -1, 1));
  const normal = unitVector(crossProduct(startVector, endVector));
  const ratio = clampNumber(1 - (policy.chordErrorMm / radius), -1, 1);
  const step = 2 * Math.acos(ratio);
  const calculated = step > 0 ? Math.ceil(Math.abs(angleRad) / step) : policy.maximumArcSegments;
  const segmentCount = clampNumber(calculated, policy.minimumArcSegments, policy.maximumArcSegments);
  return {
    start, end, center, centerlineRadiusMm: radius, outsideDiameterMm, angleRad,
    segmentCount, bendPlaneNormal: normal,
    arcPoints: sampleCircularArc(center, startVector, normal, radius, angleRad, segmentCount),
  };
}

function reducerEvidence(evidence, end) {
  const key = end === 'start' ? 'startOutsideDiameterMm' : 'endOutsideDiameterMm';
  const nested = end === 'start' ? evidence.startDimensions : evidence.endDimensions;
  return {
    ...nested,
    outsideDiameterMm: evidence[key] ?? nested?.outsideDiameterMm,
    sourceEvidenceId: evidence.sourceEvidenceId,
  };
}
