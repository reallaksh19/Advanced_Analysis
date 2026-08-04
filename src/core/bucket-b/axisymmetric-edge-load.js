import { deepFreeze } from '../shared-piping-model/index.js';
import { GAUSS_1D } from './q8-kernel.js';
import { DEFAULT_AXIS_RADIUS_TOLERANCE } from './axisymmetric-q8-kernel.js';

export const AXISYMMETRIC_EDGE_LOAD_PROFILE_ID =
  'AXI_Q8_FULL_CIRCUMFERENCE_LOAD_INTEGRATION_V1';

export function integrateAxisymmetricQuadraticEdgeLoad({
  edgeId,
  nodes,
  tractionAt,
  pressureAt,
  outwardNormalAt,
  radiusTolerance = DEFAULT_AXIS_RADIUS_TOLERANCE,
} = {}) {
  const edgeNodes = requireEdgeNodes(nodes);
  const hasTraction = typeof tractionAt === 'function';
  const hasPressure = typeof pressureAt === 'function' || Number.isFinite(pressureAt);
  if (hasTraction === hasPressure) {
    throw new TypeError('AXI_EDGE_REQUIRES_EXACTLY_ONE_TRACTION_OR_PRESSURE');
  }
  if (hasPressure && typeof outwardNormalAt !== 'function') {
    throw new TypeError('AXI_EDGE_PRESSURE_REQUIRES_DECLARED_OUTWARD_NORMAL');
  }
  const tolerance = finiteNonnegative(radiusTolerance, 'radiusTolerance');
  const nodal = edgeNodes.map((node) => ({ nodeId: node.nodeId, radial: 0, axial: 0 }));
  const stations = [];
  let generalizedRadial = 0;
  let generalizedAxial = 0;
  for (const quadrature of GAUSS_1D) {
    const shape = quadraticEdgeShape(quadrature.point);
    const mapped = mapEdge(edgeNodes, shape);
    if (!(mapped.radius > tolerance)) throw new RangeError('AXI_EDGE_INVALID_RADIUS');
    if (!(mapped.jacobian > 0) || !Number.isFinite(mapped.jacobian)) {
      throw new RangeError('AXI_EDGE_INVALID_JACOBIAN');
    }
    let traction;
    let normal = null;
    let pressure = null;
    if (hasTraction) {
      traction = requireVector(
        tractionAt(quadrature.point, mapped.radius, mapped.z),
        'AXI_EDGE_INVALID_TRACTION',
      );
    } else {
      normal = requireUnitVector(
        outwardNormalAt(quadrature.point, mapped.radius, mapped.z),
        'AXI_EDGE_INVALID_PRESSURE_NORMAL',
      );
      pressure = typeof pressureAt === 'function'
        ? Number(pressureAt(quadrature.point, mapped.radius, mapped.z))
        : Number(pressureAt);
      if (!Number.isFinite(pressure) || pressure < 0) {
        throw new RangeError('AXI_EDGE_INVALID_PRESSURE');
      }
      traction = [-pressure * normal[0], -pressure * normal[1]];
    }
    const circumferenceFactor = 2 * Math.PI * mapped.radius;
    const integrationFactor = quadrature.weight * circumferenceFactor * mapped.jacobian;
    if (!Number.isFinite(integrationFactor) || !(integrationFactor > 0)) {
      throw new RangeError('AXI_EDGE_INVALID_INTEGRATION_FACTOR');
    }
    for (let index = 0; index < 3; index += 1) {
      nodal[index].radial += shape.N[index] * traction[0] * integrationFactor;
      nodal[index].axial += shape.N[index] * traction[1] * integrationFactor;
    }
    generalizedRadial += traction[0] * integrationFactor;
    generalizedAxial += traction[1] * integrationFactor;
    stations.push(deepFreeze({
      stationId: quadrature.id,
      s: quadrature.point,
      quadratureWeight: quadrature.weight,
      shapeFunctions: [...shape.N],
      mappedCoordinates: { r: mapped.radius, z: mapped.z },
      edgeRadius: mapped.radius,
      edgeJacobian: mapped.jacobian,
      circumferenceFactor,
      integrationFactor,
      tangent: [...mapped.unitTangent],
      outwardNormal: normal,
      pressure,
      tractionVector: { radial: traction[0], axial: traction[1] },
      consistentNodalContributions: edgeNodes.map((node, index) => ({
        nodeId: node.nodeId,
        radial: shape.N[index] * traction[0] * integrationFactor,
        axial: shape.N[index] * traction[1] * integrationFactor,
      })),
    }));
  }
  const nodalRadial = nodal.reduce((sum, row) => sum + row.radial, 0);
  const nodalAxial = nodal.reduce((sum, row) => sum + row.axial, 0);
  const result = {
    loadIntegrationProfileId: AXISYMMETRIC_EDGE_LOAD_PROFILE_ID,
    edgeId: requiredText(edgeId ?? 'AXI-EDGE', 'edgeId'),
    nodeOrder: edgeNodes.map((row) => row.nodeId),
    stations,
    consistentNodalForces: nodal.map((row) => deepFreeze({
      nodeId: row.nodeId,
      radial: cleanNumber(row.radial),
      axial: cleanNumber(row.axial),
    })),
    quadratureGeneralizedResultant: {
      radial: cleanNumber(generalizedRadial),
      axial: cleanNumber(generalizedAxial),
    },
    nodalReconstructedResultant: {
      radial: cleanNumber(nodalRadial),
      axial: cleanNumber(nodalAxial),
    },
    normalizationResidual: {
      radial: cleanNumber(nodalRadial - generalizedRadial),
      axial: cleanNumber(nodalAxial - generalizedAxial),
    },
    authority: {
      fullCircumferenceMeasureAppliedExactlyOnce: true,
      quadratureRadiusUsed: true,
      representativeRadiusUsed: false,
      globalCartesianRadialForceClaimed: false,
      generalizedAxisymmetricRadialLoad: true,
    },
  };
  return deepFreeze(result);
}

export function evaluateAxisymmetricEdgeVirtualWork({
  loadEvidence,
  virtualNodalDisplacements,
} = {}) {
  if (loadEvidence?.loadIntegrationProfileId !== AXISYMMETRIC_EDGE_LOAD_PROFILE_ID) {
    throw new TypeError('AXI_EDGE_REGISTERED_LOAD_EVIDENCE_REQUIRED');
  }
  const virtualByNode = new Map();
  if (!Array.isArray(virtualNodalDisplacements) || virtualNodalDisplacements.length !== 3) {
    throw new TypeError('AXI_EDGE_REQUIRES_THREE_VIRTUAL_NODAL_DISPLACEMENTS');
  }
  virtualNodalDisplacements.forEach((row) => {
    if (virtualByNode.has(row?.nodeId)) throw new TypeError('AXI_EDGE_DUPLICATE_VIRTUAL_NODE');
    virtualByNode.set(row.nodeId, requireVector([row.radial, row.axial], 'AXI_EDGE_INVALID_VIRTUAL_DISPLACEMENT'));
  });
  const nodalWork = loadEvidence.consistentNodalForces.reduce((sum, force) => {
    const displacement = virtualByNode.get(force.nodeId);
    if (!displacement) throw new TypeError(`AXI_EDGE_MISSING_VIRTUAL_NODE:${force.nodeId}`);
    return sum + force.radial * displacement[0] + force.axial * displacement[1];
  }, 0);
  const quadratureWork = loadEvidence.stations.reduce((sum, station) => {
    const interpolated = [0, 0];
    station.shapeFunctions.forEach((shape, index) => {
      const displacement = virtualByNode.get(loadEvidence.nodeOrder[index]);
      interpolated[0] += shape * displacement[0];
      interpolated[1] += shape * displacement[1];
    });
    return sum + (
      station.tractionVector.radial * interpolated[0]
      + station.tractionVector.axial * interpolated[1]
    ) * station.integrationFactor;
  }, 0);
  const residual = nodalWork - quadratureWork;
  const scale = Math.max(1, Math.abs(nodalWork), Math.abs(quadratureWork));
  return deepFreeze({
    nodalWork: cleanNumber(nodalWork),
    quadratureWork: cleanNumber(quadratureWork),
    residual: cleanNumber(residual),
    relativeResidual: Math.abs(residual) / scale,
    accepted: Math.abs(residual) <= 1e-11 * scale,
  });
}

export function quadraticEdgeShape(s) {
  if (!Number.isFinite(s)) throw new TypeError('AXI_EDGE_INVALID_NATURAL_COORDINATE');
  return {
    N: [0.5 * s * (s - 1), 1 - s * s, 0.5 * s * (s + 1)],
    dNds: [s - 0.5, -2 * s, s + 0.5],
  };
}

function mapEdge(nodes, shape) {
  let radius = 0; let z = 0; let drDs = 0; let dzDs = 0;
  for (let index = 0; index < 3; index += 1) {
    radius += shape.N[index] * nodes[index].r;
    z += shape.N[index] * nodes[index].z;
    drDs += shape.dNds[index] * nodes[index].r;
    dzDs += shape.dNds[index] * nodes[index].z;
  }
  const jacobian = Math.hypot(drDs, dzDs);
  const unitTangent = jacobian > 0 ? [drDs / jacobian, dzDs / jacobian] : [0, 0];
  return { radius, z, drDs, dzDs, jacobian, unitTangent };
}
function requireEdgeNodes(nodes) {
  if (!Array.isArray(nodes) || nodes.length !== 3) throw new TypeError('AXI_EDGE_REQUIRES_THREE_NODES');
  return nodes.map((node, index) => {
    const r = Number(node?.r); const z = Number(node?.z);
    if (!Number.isFinite(r) || !Number.isFinite(z)) throw new TypeError(`AXI_EDGE_INVALID_NODE_${index + 1}`);
    return { nodeId: requiredText(node.nodeId ?? `E${index + 1}`, 'nodeId'), r, z };
  });
}
function requireUnitVector(value, code) {
  const vector = requireVector(value, code);
  const norm = Math.hypot(vector[0], vector[1]);
  if (!(norm > 0) || Math.abs(norm - 1) > 1e-10) throw new RangeError(code);
  return [vector[0] / norm, vector[1] / norm];
}
function requireVector(value, code) {
  if (!Array.isArray(value) || value.length !== 2 || value.some((row) => !Number.isFinite(Number(row)))) {
    throw new TypeError(code);
  }
  return [Number(value[0]), Number(value[1])];
}
function finiteNonnegative(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new RangeError(`AXI_EDGE_INVALID_${label.toUpperCase()}`);
  return number;
}
function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`AXI_EDGE_INVALID_${label.toUpperCase()}`);
  return value;
}
function cleanNumber(value) { return Object.is(value, -0) || Math.abs(value) < 1e-15 ? 0 : value; }
