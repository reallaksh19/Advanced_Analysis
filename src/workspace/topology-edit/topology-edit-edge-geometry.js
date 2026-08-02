/** Pure edge and inline-fitting visual derivation. */
import { DIMENSION_STATUS } from './dimension-authority.js';
import {
  addPoint,
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
import { authoritativeCanonicalDiameter } from './topology-edit-visual-policy.js';
import {
  diagnosticLinePrimitive,
  dimensionVisualDiagnostics,
  unresolvedVisualComponent,
  visualComponent,
  visualDiagnostic,
  visualPrimitive,
} from './topology-edit-visual-component-factory.js';

export function deriveVisualEdge(edge, nodes, evidence, dimensionAuthority, policy) {
  const start = nodes.get(String(edge.fromNodeId));
  const end = nodes.get(String(edge.toNodeId));
  const type = String(edge.entityType || 'PIPE').toUpperCase();
  if (!start || !end) {
    return unresolvedVisualComponent(
      edge,
      type,
      evidence,
      'EDGE_ENDPOINT_MISSING',
      'Edge endpoint evidence is incomplete.',
    );
  }
  if (type === 'ELBOW') return deriveElbow(edge, start, end, evidence, dimensionAuthority, policy);
  if (type === 'REDUCER') return deriveReducer(edge, start, end, evidence, dimensionAuthority, policy);
  if (['FLANGE', 'VALVE', 'GASKET', 'INSTRUMENT'].includes(type)) {
    return deriveInlineSymbol(edge, type, start, end, evidence, dimensionAuthority, policy);
  }
  if (['PIPE', 'STRAIGHT', 'STRAIGHT_ELEMENT'].includes(type)) {
    return derivePipe(edge, start, end, evidence, dimensionAuthority, policy);
  }
  return visualComponent(edge, type, evidence, [
    diagnosticLinePrimitive(edge, type, start, end, evidence, policy, 'UNSUPPORTED_COMPONENT_TYPE'),
  ], [visualDiagnostic(
    edge.id,
    'VISUAL_COMPONENT_TYPE_UNSUPPORTED',
    `No governed visual derivation exists for ${type}.`,
  )]);
}

function derivePipe(edge, start, end, evidence, authority, policy) {
  const diameter = resolveDiameter(edge, evidence, authority, 'PIPE');
  const diagnostics = dimensionVisualDiagnostics(edge.id, diameter);
  const primitives = diameter.status === DIMENSION_STATUS.RESOLVED
    ? [visualPrimitive(edge, 'PIPE', 'body', 'PIPE_CYLINDER', {
      start,
      end,
      outsideDiameterMm: diameter.valueMm,
      radialSegments: policy.radialSegments,
    }, evidence, policy)]
    : [diagnosticLinePrimitive(edge, 'PIPE', start, end, evidence, policy, diameter.status)];
  return visualComponent(edge, 'PIPE', evidence, primitives, diagnostics);
}

function deriveElbow(edge, start, end, evidence, authority, policy) {
  const diameter = resolveDiameter(edge, evidence, authority, 'ELBOW');
  const center = finitePoint(evidence.center);
  const radius = positiveNumber(evidence.centerlineRadiusMm)
    ?? (center ? distance(center, start) : null);
  const validArc = center && radius
    && nearlyEqual(distance(center, end), radius, policy.chordErrorMm);
  const diagnostics = dimensionVisualDiagnostics(edge.id, diameter);
  if (!validArc) diagnostics.push(visualDiagnostic(
    edge.id,
    'ELBOW_ARC_EVIDENCE_MISSING',
    'Elbow center/radius evidence is missing or inconsistent.',
  ));
  const resolved = diameter.status === DIMENSION_STATUS.RESOLVED && validArc;
  const primitives = resolved
    ? [visualPrimitive(edge, 'ELBOW', 'arc', 'ELBOW_ARC', elbowParameters(
      start,
      end,
      center,
      radius,
      diameter.valueMm,
      policy,
    ), evidence, policy)]
    : [diagnosticLinePrimitive(edge, 'ELBOW', start, end, evidence, policy, 'UNRESOLVED_ELBOW')];
  return visualComponent(edge, 'ELBOW', evidence, primitives, diagnostics);
}

function deriveReducer(edge, start, end, evidence, authority, policy) {
  const startDiameter = authority.resolveOutsideDiameter(reducerEvidence(evidence, 'start'), {
    componentId: edge.id,
    componentType: 'REDUCER',
    end: 'start',
  });
  const endDiameter = authority.resolveOutsideDiameter(reducerEvidence(evidence, 'end'), {
    componentId: edge.id,
    componentType: 'REDUCER',
    end: 'end',
  });
  const eccentric = String(evidence.reducerType || evidence.type || '').toUpperCase().includes('ECCENTRIC');
  const direction = unitVector(evidence.eccentricOffsetDirection);
  const diagnostics = [
    ...dimensionVisualDiagnostics(edge.id, startDiameter),
    ...dimensionVisualDiagnostics(edge.id, endDiameter),
  ];
  if (eccentric && !direction) diagnostics.push(visualDiagnostic(
    edge.id,
    'ECCENTRIC_DIRECTION_MISSING',
    'Eccentric reducer direction evidence is required.',
  ));
  const resolved = startDiameter.status === DIMENSION_STATUS.RESOLVED
    && endDiameter.status === DIMENSION_STATUS.RESOLVED
    && (!eccentric || direction);
  const parameters = reducerParameters(start, end, direction, startDiameter, endDiameter, policy, eccentric);
  const kind = eccentric ? 'ECCENTRIC_REDUCER' : 'CONICAL_REDUCER';
  const primitives = resolved
    ? [visualPrimitive(edge, 'REDUCER', 'body', kind, parameters, evidence, policy)]
    : [diagnosticLinePrimitive(edge, 'REDUCER', start, end, evidence, policy, 'UNRESOLVED_REDUCER')];
  return visualComponent(edge, 'REDUCER', evidence, primitives, diagnostics);
}

function deriveInlineSymbol(edge, type, start, end, evidence, authority, policy) {
  const diameter = resolveDiameter(edge, evidence, authority, type);
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
    ? [visualPrimitive(edge, type, 'body', kinds[type], parameters, evidence, policy)]
    : [diagnosticLinePrimitive(edge, type, start, end, evidence, policy, diameter.status)];
  return visualComponent(edge, type, evidence, primitives, dimensionVisualDiagnostics(edge.id, diameter));
}

function resolveDiameter(edge, evidence, authority, componentType) {
  return authority.resolveOutsideDiameter({
    ...evidence,
    diameterMm: authoritativeCanonicalDiameter(edge),
  }, { componentId: edge.id, componentType });
}

function reducerParameters(start, end, direction, startDiameter, endDiameter, policy, eccentric) {
  const offsetMm = eccentric
    ? Math.abs(startDiameter.valueMm - endDiameter.valueMm) / 2
    : 0;
  return {
    start,
    end: eccentric && direction ? addPoint(end, scaleVector(direction, offsetMm)) : end,
    sourceEnd: end,
    startOutsideDiameterMm: startDiameter.valueMm,
    endOutsideDiameterMm: endDiameter.valueMm,
    eccentricOffsetDirection: direction,
    eccentricOffsetMm: offsetMm,
    radialSegments: policy.radialSegments,
  };
}

function elbowParameters(start, end, center, radius, outsideDiameterMm, policy) {
  const startVector = unitVector(vector(center, start));
  const endVector = unitVector(vector(center, end));
  const angleRad = Math.acos(clampNumber(dotProduct(startVector, endVector), -1, 1));
  const normal = unitVector(crossProduct(startVector, endVector));
  const ratio = clampNumber(1 - (policy.chordErrorMm / radius), -1, 1);
  const step = 2 * Math.acos(ratio);
  const calculated = step > 0
    ? Math.ceil(Math.abs(angleRad) / step)
    : policy.maximumArcSegments;
  const segmentCount = clampNumber(
    calculated,
    policy.minimumArcSegments,
    policy.maximumArcSegments,
  );
  return {
    start,
    end,
    center,
    centerlineRadiusMm: radius,
    outsideDiameterMm,
    angleRad,
    segmentCount,
    bendPlaneNormal: normal,
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
