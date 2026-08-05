import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import {
  AXISYMMETRIC_EDGE_LOAD_PROFILE_ID,
  integrateAxisymmetricQuadraticEdgeLoad,
} from './axisymmetric-edge-load.js';
import { FLANGE_HUB_FROZEN_INPUT } from './flange-hub-geometry.js';

export const FLANGE_HUB_LOAD_POLICY_ID = 'BKT-B-FLANGE-HUB-LOAD-POLICY-V1';
export const FLANGE_HUB_LOAD_CASES = deepFreeze({
  'FH-PRES-001': {
    loadCaseId: 'FH-PRES-001',
    internalPressure: 10,
    axialResultant: null,
    endThrustMode: 'EQUIVALENT_CLOSED_END_AXIAL_THRUST',
    axialSupport: 'GASKET_SUPPORT_ANNULUS',
  },
  'FH-AXIAL-001': {
    loadCaseId: 'FH-AXIAL-001',
    internalPressure: 0,
    axialResultant: -100000,
    endThrustMode: 'NONE',
    axialSupport: 'GASKET_SUPPORT_ANNULUS',
  },
  'FH-GASKET-001': {
    loadCaseId: 'FH-GASKET-001',
    faceCompression: 20,
    loadAnnulus: [65, 95],
    endThrustMode: 'NONE',
    axialSupport: 'REMOTE_PIPE_END',
  },
});

export function pressureEndThrust({ pressure, boreRadius } = {}) {
  const p = nonnegative(pressure, 'pressure');
  const radius = positive(boreRadius, 'boreRadius');
  return p * Math.PI * radius ** 2;
}

export function annularArea(innerRadius, outerRadius) {
  const inner = nonnegative(innerRadius, 'innerRadius');
  const outer = positive(outerRadius, 'outerRadius');
  if (!(outer > inner)) throw new RangeError('FH_ANNULAR_RADIUS_ORDER_INVALID');
  return Math.PI * (outer ** 2 - inner ** 2);
}

export function uniformAxialTractionForResultant({ resultant, innerRadius, outerRadius } = {}) {
  const force = finite(resultant, 'resultant');
  return force / annularArea(innerRadius, outerRadius);
}

export function createFlangeHubLoadDefinition(loadCaseId, geometryInput = FLANGE_HUB_FROZEN_INPUT) {
  const registered = FLANGE_HUB_LOAD_CASES[loadCaseId];
  if (!registered) throw new TypeError(`FH_UNREGISTERED_LOAD_CASE:${loadCaseId}`);
  const pipeArea = annularArea(geometryInput.boreRadius, geometryInput.pipeOutsideRadius);
  let definition;
  if (loadCaseId === 'FH-PRES-001') {
    const endThrust = pressureEndThrust({
      pressure: registered.internalPressure,
      boreRadius: geometryInput.boreRadius,
    });
    definition = {
      ...registered,
      pressureBoundaryId: 'FH-BOUNDARY-BORE',
      pressureOutwardNormal: [-1, 0],
      equivalentEndThrust: -endThrust,
      equivalentEndTraction: -endThrust / pipeArea,
      remoteEndBoundaryId: 'FH-BOUNDARY-PIPE-END',
      supportRange: [geometryInput.gasketSupportInnerRadius, geometryInput.gasketSupportOuterRadius],
    };
  } else if (loadCaseId === 'FH-AXIAL-001') {
    definition = {
      ...registered,
      remoteEndBoundaryId: 'FH-BOUNDARY-PIPE-END',
      equivalentEndTraction: registered.axialResultant / pipeArea,
      supportRange: [geometryInput.gasketSupportInnerRadius, geometryInput.gasketSupportOuterRadius],
    };
  } else {
    definition = {
      ...registered,
      gasketFaceBoundaryId: 'FH-BOUNDARY-GASKET-FACE',
      faceOutwardNormal: [0, 1],
      faceTraction: [0, -registered.faceCompression],
      remoteSupportRange: [geometryInput.boreRadius, geometryInput.pipeOutsideRadius],
      expectedFaceResultant: -registered.faceCompression
        * annularArea(registered.loadAnnulus[0], registered.loadAnnulus[1]),
    };
  }
  const payload = {
    loadPolicyId: FLANGE_HUB_LOAD_POLICY_ID,
    loadIntegrationProfileId: AXISYMMETRIC_EDGE_LOAD_PROFILE_ID,
    unitSystem: 'MM_N_MPA',
    ...definition,
    authority: {
      fullCircumferenceMeasureAppliedByRegisteredEdgeRoutine: true,
      representativeRadiusProhibited: true,
      pressureEndThrustDeclaredSeparately: loadCaseId === 'FH-PRES-001',
      gasketSeatingQualified: false,
      codeAssessmentQualified: false,
    },
  };
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}

export function integratePressureEdge(edge, pressure) {
  requireBoundaryEdge(edge);
  const p = nonnegative(pressure, 'pressure');
  return integrateAxisymmetricQuadraticEdgeLoad({
    edgeId: edge.edgeId,
    nodes: edge.nodes,
    pressureAt: p,
    outwardNormalAt: () => requireUnit(edge.outwardNormal),
  });
}

export function integrateAxialTractionEdge(edge, traction) {
  requireBoundaryEdge(edge);
  const value = finite(traction, 'traction');
  return integrateAxisymmetricQuadraticEdgeLoad({
    edgeId: edge.edgeId,
    nodes: edge.nodes,
    tractionAt: () => [0, value],
  });
}

export function verifyReversedEdgeInvariance({ edge, mode, value, tolerance = 1e-10 } = {}) {
  requireBoundaryEdge(edge);
  const original = mode === 'PRESSURE'
    ? integratePressureEdge(edge, value)
    : integrateAxialTractionEdge(edge, value);
  const reversedEdge = {
    ...edge,
    edgeId: `${edge.edgeId}:REVERSED`,
    nodes: [edge.nodes[2], edge.nodes[1], edge.nodes[0]],
  };
  const reversed = mode === 'PRESSURE'
    ? integratePressureEdge(reversedEdge, value)
    : integrateAxialTractionEdge(reversedEdge, value);
  const originalByNode = forceMap(original.consistentNodalForces);
  const reversedByNode = forceMap(reversed.consistentNodalForces);
  const nodeIds = [...originalByNode.keys()].sort();
  let maximumDifference = 0;
  let scale = 1;
  nodeIds.forEach((nodeId) => {
    const left = originalByNode.get(nodeId);
    const right = reversedByNode.get(nodeId);
    if (!right) throw new TypeError(`FH_REVERSED_EDGE_NODE_MISSING:${nodeId}`);
    maximumDifference = Math.max(
      maximumDifference,
      Math.abs(left.radial - right.radial),
      Math.abs(left.axial - right.axial),
    );
    scale = Math.max(scale, Math.abs(left.radial), Math.abs(left.axial));
  });
  const relativeDifference = maximumDifference / scale;
  if (relativeDifference > tolerance) throw new RangeError('FH_REVERSED_EDGE_PHYSICAL_MISMATCH');
  return deepFreeze({
    accepted: true,
    tolerance,
    maximumDifference,
    relativeDifference,
    originalResultant: original.quadratureGeneralizedResultant,
    reversedResultant: reversed.quadratureGeneralizedResultant,
  });
}

export function validateConstraintPattern({ loadCaseId, constrainedDofs } = {}) {
  const definition = createFlangeHubLoadDefinition(loadCaseId);
  if (!Array.isArray(constrainedDofs) || constrainedDofs.length === 0) {
    throw new TypeError('FH_AXIAL_TRANSLATION_UNDERCONSTRAINED');
  }
  constrainedDofs.forEach((row) => {
    if (row?.component !== 'UZ') throw new TypeError('FH_RADIAL_OR_UNKNOWN_CONSTRAINT_FORBIDDEN');
    if (row.value !== 0) throw new TypeError('FH_NONZERO_PRESCRIBED_DISPLACEMENT_NOT_REGISTERED');
    if (definition.axialSupport === 'GASKET_SUPPORT_ANNULUS' && row.boundaryId !== 'FH-BOUNDARY-GASKET-FACE') {
      throw new TypeError('FH_OVERCONSTRAINED_NON_GASKET_SUPPORT');
    }
    if (definition.axialSupport === 'REMOTE_PIPE_END' && row.boundaryId !== 'FH-BOUNDARY-PIPE-END') {
      throw new TypeError('FH_OVERCONSTRAINED_NON_PIPE_SUPPORT');
    }
  });
  return true;
}

function forceMap(rows) {
  const map = new Map();
  rows.forEach((row) => {
    if (map.has(row.nodeId)) throw new TypeError('FH_DUPLICATE_EDGE_FORCE_NODE');
    map.set(row.nodeId, row);
  });
  return map;
}
function requireBoundaryEdge(edge) {
  if (!edge || typeof edge.edgeId !== 'string' || !Array.isArray(edge.nodes) || edge.nodes.length !== 3) {
    throw new TypeError('FH_REGISTERED_BOUNDARY_EDGE_REQUIRED');
  }
}
function requireUnit(value) {
  if (!Array.isArray(value) || value.length !== 2) throw new TypeError('FH_EDGE_NORMAL_REQUIRED');
  const vector = value.map(Number);
  const length = Math.hypot(...vector);
  if (!Number.isFinite(length) || Math.abs(length - 1) > 1e-10) throw new RangeError('FH_EDGE_NORMAL_INVALID');
  return vector;
}
function positive(value, label) { const number = Number(value); if (!Number.isFinite(number) || !(number > 0)) throw new RangeError(`FH_INVALID_${label.toUpperCase()}`); return number; }
function nonnegative(value, label) { const number = Number(value); if (!Number.isFinite(number) || number < 0) throw new RangeError(`FH_INVALID_${label.toUpperCase()}`); return number; }
function finite(value, label) { const number = Number(value); if (!Number.isFinite(number)) throw new RangeError(`FH_INVALID_${label.toUpperCase()}`); return number; }
