import { t6BMatrixAt } from '../core/local-continuum/index.js';
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';

export const LAFEA_BUCKET_01_FIXED_PROBE_INPUT_SCHEMA =
  'lafea-bucket-01-fixed-probe-input/v1';
export const LAFEA_BUCKET_01_FIXED_PROBE_EVIDENCE_SCHEMA =
  'lafea-bucket-01-fixed-probe-evidence/v3';
export const LAFEA_BUCKET_01_FIXED_PROBE_REVISION = 'B01-PROBE.3';
export const LAFEA_BUCKET_01_PROBE_TOPOLOGY_OBSERVATION_SCHEMA =
  'lafea-bucket-01-probe-topology-observation/v1';

const INPUT_KEYS = Object.freeze([
  'schema', 'exactHeadSha', 'meshHash', 'recoveryHash', 'mesh', 'result', 'probe',
]);
const PROBE_KEYS = Object.freeze([
  'probeId', 'loadCaseId', 'x', 'y', 'component', 'units',
  'locationDefinitionHash',
]);
const COMPONENTS = Object.freeze(new Set([
  'SIGMA_X', 'SIGMA_Y', 'SIGMA_Z', 'TAU_XY',
  'PRINCIPAL_MAXIMUM', 'PRINCIPAL_MINIMUM', 'VON_MISES',
]));
const NATURAL_TOLERANCE = 1e-9;
const NEWTON_LIMIT = 30;
const ELEMENT_ID_PATTERN = /^E-R(?<ring>\d+)-S(?<sector>\d+)-(?<side>[AB])$/u;

export function observeLafeaBucket01ProbeTopology(meshValue, probeValue) {
  const mesh = requireMesh(meshValue);
  const x = finite(probeValue?.x, 'probe.x');
  const y = finite(probeValue?.y, 'probe.y');
  const probeId = text(probeValue?.probeId ?? 'UNSPECIFIED_PROBE', 'probe.probeId');
  const located = locateProbe(mesh, x, y);
  const base = topologyObservationBase(mesh, probeId, x, y, located);
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

export function recoverLafeaBucket01FixedProbe(inputValue) {
  exactKeys(inputValue, INPUT_KEYS, 'fixed-probe input');
  if (inputValue.schema !== LAFEA_BUCKET_01_FIXED_PROBE_INPUT_SCHEMA) {
    throw probeError('LAFEA_B01_PROBE_INPUT_SCHEMA_INVALID');
  }
  exactKeys(inputValue.probe, PROBE_KEYS, 'fixed-probe definition');
  const exactHeadSha = gitSha(inputValue.exactHeadSha);
  const meshHash = sha256(inputValue.meshHash, 'meshHash');
  const recoveryHash = sha256(inputValue.recoveryHash, 'recoveryHash');
  const probe = normalizeProbe(inputValue.probe);
  const mesh = requireMesh(inputValue.mesh);
  const result = requireResult(inputValue.result, mesh);
  const loadCase = result.loadCaseResults.find(
    (row) => row.loadCaseId === probe.loadCaseId,
  );
  if (!loadCase) throw probeError('LAFEA_B01_PROBE_LOAD_CASE_MISSING');
  if (!Array.isArray(loadCase.nodalDisplacements)) {
    throw probeError('LAFEA_B01_PROBE_NODAL_DISPLACEMENTS_REQUIRED');
  }

  const located = locateProbe(mesh, probe.x, probe.y);
  const topologyBase = topologyObservationBase(
    mesh,
    probe.probeId,
    probe.x,
    probe.y,
    located,
  );
  const topologyObservation = deepFreeze({
    ...topologyBase,
    semanticHash: canonicalLafeaSha256(topologyBase),
  });
  const displacementById = new Map(
    loadCase.nodalDisplacements.map((row) => [row.nodeId, row]),
  );
  const retainedElementById = new Map(
    result.meshEvidence.elementEvidence.map((row) => [row.elementId, row]),
  );
  const retainedElement = retainedElementById.get(located.element.elementId);
  if (!retainedElement
    || retainedElement.elementType !== 'T6'
    || !isMatrix(retainedElement.dMatrix, 3, 3)) {
    throw probeError('LAFEA_B01_PROBE_CONSTITUTIVE_MATRIX_REQUIRED');
  }
  const supportingNodalDisplacements = located.element.nodeIds.map((nodeId) => {
    const displacement = displacementById.get(nodeId);
    if (!displacement
      || !Number.isFinite(displacement.ux)
      || !Number.isFinite(displacement.uy)) {
      throw probeError('LAFEA_B01_PROBE_NODAL_DISPLACEMENT_INVALID');
    }
    return {
      nodeId,
      ux: normalizeZero(displacement.ux),
      uy: normalizeZero(displacement.uy),
    };
  });
  const localDisplacementVector = supportingNodalDisplacements.flatMap(
    (row) => [row.ux, row.uy],
  );
  const pointKinematics = t6BMatrixAt(
    located.nodes,
    located.natural.xi,
    located.natural.eta,
  );
  if (!isMatrix(pointKinematics.B, 3, 12)
    || !(pointKinematics.jacobianDeterminant > 0)) {
    throw probeError('LAFEA_B01_PROBE_POINT_KINEMATICS_INVALID');
  }
  const jacobianScale = Math.max(1, Math.abs(topologyObservation.jacobianDeterminant));
  if (Math.abs(
    pointKinematics.jacobianDeterminant - topologyObservation.jacobianDeterminant,
  ) > 1e-12 * jacobianScale) {
    throw probeError('LAFEA_B01_PROBE_JACOBIAN_RECONSTRUCTION_MISMATCH');
  }
  const strainVector = matrixVector(
    pointKinematics.B,
    localDisplacementVector,
  );
  const stressVector = matrixVector(
    retainedElement.dMatrix,
    strainVector,
  );
  const components = deepFreeze({
    sigmaX: normalizeZero(stressVector[0]),
    sigmaY: normalizeZero(stressVector[1]),
    sigmaZ: 0,
    tauXY: normalizeZero(stressVector[2]),
  });
  const principal = principalStress(
    components.sigmaX,
    components.sigmaY,
    components.tauXY,
  );
  const vonMises = vonMisesStress(
    components.sigmaX,
    components.sigmaY,
    components.sigmaZ,
    components.tauXY,
  );
  const value = componentValue(probe.component, components, principal, vonMises);
  const constitutiveMatrixHash = canonicalLafeaSha256({
    schema: 'lafea-bucket-01-probe-constitutive-matrix/v1',
    elementId: located.element.elementId,
    formulation: result.meshEvidence.formulation,
    dMatrix: retainedElement.dMatrix,
  });
  const base = {
    schema: LAFEA_BUCKET_01_FIXED_PROBE_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_FIXED_PROBE_REVISION,
    exactHeadSha,
    meshHash,
    recoveryHash,
    probe,
    samplingAuthority: 'FIXED_PHYSICAL_PROBE',
    recoveryAuthority: 'ELEMENT_LOCAL_DIRECT_DISPLACEMENT_GRADIENT',
    reconstructionMethod: 'T6_DIRECT_B_MATRIX_AT_FIXED_COORDINATE_V3',
    elementId: topologyObservation.elementId,
    meshTopology: topologyObservation.meshTopology,
    naturalCoordinates: topologyObservation.naturalCoordinates,
    minimumNaturalMargin: topologyObservation.minimumNaturalMargin,
    mappedPhysicalCoordinates: topologyObservation.mappedPhysicalCoordinates,
    mappingResidual: topologyObservation.mappingResidual,
    jacobianDeterminant: topologyObservation.jacobianDeterminant,
    signedCornerArea: topologyObservation.signedCornerArea,
    localElementSize: topologyObservation.localElementSize,
    probeToEdgeDistances: topologyObservation.probeToEdgeDistances,
    minimumPhysicalEdgeDistance: topologyObservation.minimumPhysicalEdgeDistance,
    topologySignature: topologyObservation.topologySignature,
    elementPhaseSignature: topologyObservation.elementPhaseSignature,
    topologyObservationHash: topologyObservation.semanticHash,
    topologyObservation,
    tensorFrame: 'GLOBAL_XY',
    strain: {
      epsilonX: normalizeZero(strainVector[0]),
      epsilonY: normalizeZero(strainVector[1]),
      gammaXY: normalizeZero(strainVector[2]),
    },
    reconstructedComponents: components,
    principalMaximum: principal.maximum,
    principalMinimum: principal.minimum,
    vonMises,
    authoritativeValue: value,
    units: probe.units,
    constitutiveMatrixHash,
    supportingNodalDisplacements,
    retainedIntegrationPointExtrapolationUsed: false,
    crossElementAveragingUsed: false,
    nodalProjectionUsed: false,
    status: 'PASS',
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

export function validateLafeaBucket01FixedProbeEvidence(value, mesh, result) {
  try {
    if (!value
      || value.schema !== LAFEA_BUCKET_01_FIXED_PROBE_EVIDENCE_SCHEMA
      || value.producerRevision !== LAFEA_BUCKET_01_FIXED_PROBE_REVISION) {
      throw probeError('LAFEA_B01_PROBE_EVIDENCE_CONTRACT_INVALID');
    }
    const rebuilt = recoverLafeaBucket01FixedProbe({
      schema: LAFEA_BUCKET_01_FIXED_PROBE_INPUT_SCHEMA,
      exactHeadSha: value.exactHeadSha,
      meshHash: value.meshHash,
      recoveryHash: value.recoveryHash,
      mesh,
      result,
      probe: value.probe,
    });
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
      throw probeError('LAFEA_B01_PROBE_EVIDENCE_REBUILD_MISMATCH');
    }
    if (!isDeepFrozen(value)) {
      throw probeError('LAFEA_B01_PROBE_EVIDENCE_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_B01_PROBE_EVIDENCE_INVALID'],
    });
  }
}

function topologyObservationBase(mesh, probeId, x, y, located) {
  const mapped = mapT6(located.nodes, located.natural.xi, located.natural.eta);
  const mapping = mapT6WithJacobian(
    located.nodes,
    located.natural.xi,
    located.natural.eta,
  );
  if (!(mapping.determinant > 0)) {
    throw probeError('LAFEA_B01_PROBE_POINT_KINEMATICS_INVALID');
  }
  const lambda1 = normalizeZero(1 - located.natural.xi - located.natural.eta);
  const lambda2 = normalizeZero(located.natural.xi);
  const lambda3 = normalizeZero(located.natural.eta);
  const minimumNaturalMargin = Math.min(lambda1, lambda2, lambda3);
  if (!(minimumNaturalMargin > NATURAL_TOLERANCE)) {
    throw probeError('LAFEA_B01_PROBE_ON_ELEMENT_BOUNDARY');
  }
  const signedCornerArea = signedTriangleArea(located.nodes.slice(0, 3));
  if (!(signedCornerArea > 0)) {
    throw probeError('LAFEA_B01_PROBE_ELEMENT_ORIENTATION_INVALID');
  }
  const meshTopology = deriveMeshTopology(mesh, located.element);
  const probeToEdgeDistances = deepFreeze({
    lambda1Zero: quadraticEdgeDistance(
      { x, y },
      located.nodes[1],
      located.nodes[4],
      located.nodes[2],
    ),
    lambda2Zero: quadraticEdgeDistance(
      { x, y },
      located.nodes[0],
      located.nodes[5],
      located.nodes[2],
    ),
    lambda3Zero: quadraticEdgeDistance(
      { x, y },
      located.nodes[0],
      located.nodes[3],
      located.nodes[1],
    ),
  });
  const minimumPhysicalEdgeDistance = Math.min(
    probeToEdgeDistances.lambda1Zero,
    probeToEdgeDistances.lambda2Zero,
    probeToEdgeDistances.lambda3Zero,
  );
  const naturalCoordinates = deepFreeze({
    xi: normalizeZero(located.natural.xi),
    eta: normalizeZero(located.natural.eta),
    lambda1,
    lambda2,
    lambda3,
  });
  const topologySignature = canonicalLafeaSha256({
    schema: 'lafea-bucket-01-probe-compatible-topology-signature/v1',
    elementFamily: 'ANNULAR_T6_TWO_TRIANGLE_CELL',
    triangleSide: meshTopology.triangleSide,
    orientation: meshTopology.orientation,
    edgeRoleOrder: ['LAMBDA1_ZERO', 'LAMBDA2_ZERO', 'LAMBDA3_ZERO'],
  });
  const elementPhaseSignature = canonicalLafeaSha256({
    schema: 'lafea-bucket-01-probe-element-phase-signature/v1',
    topologySignature,
    radialDivisions: meshTopology.radialDivisions,
    circumferentialDivisions: meshTopology.circumferentialDivisions,
    radialRingIndex: meshTopology.radialRingIndex,
    circumferentialSectorIndex: meshTopology.circumferentialSectorIndex,
    naturalCoordinates,
  });
  return {
    schema: LAFEA_BUCKET_01_PROBE_TOPOLOGY_OBSERVATION_SCHEMA,
    meshIdentity: text(mesh.meshIdentity, 'mesh.meshIdentity'),
    probeId,
    physicalCoordinates: { x, y },
    elementId: located.element.elementId,
    meshTopology,
    naturalCoordinates,
    minimumNaturalMargin,
    mappedPhysicalCoordinates: {
      x: normalizeZero(mapped.x),
      y: normalizeZero(mapped.y),
    },
    mappingResidual: Math.hypot(mapped.x - x, mapped.y - y),
    jacobianDeterminant: mapping.determinant,
    signedCornerArea,
    localElementSize: Math.sqrt(2 * signedCornerArea),
    probeToEdgeDistances,
    minimumPhysicalEdgeDistance,
    topologySignature,
    elementPhaseSignature,
    containmentCandidateCount: 1,
    edgeDistanceMethod: 'EXACT_T6_QUADRATIC_EDGE_STATIONARY_POINT_SEARCH',
    status: 'PASS',
  };
}

function locateProbe(mesh, x, y) {
  const nodeById = new Map(mesh.nodes.map((row) => [row.nodeId, row]));
  const candidates = [];
  for (const element of mesh.elements) {
    if (element.elementType !== 'T6' || element.nodeIds.length !== 6) continue;
    const nodes = element.nodeIds.map((nodeId) => nodeById.get(nodeId));
    if (nodes.some((row) => !row)) {
      throw probeError('LAFEA_B01_PROBE_MESH_NODE_MISSING');
    }
    const natural = invertT6Mapping(nodes, x, y);
    if (natural && insideNaturalTriangle(natural.xi, natural.eta)) {
      candidates.push({ element, nodes, natural });
    }
  }
  if (candidates.length === 0) {
    throw probeError('LAFEA_B01_PROBE_OUTSIDE_MESH');
  }
  if (candidates.length !== 1) {
    throw probeError('LAFEA_B01_PROBE_ELEMENT_AMBIGUOUS');
  }
  return candidates[0];
}

function deriveMeshTopology(mesh, element) {
  const parsed = parseElementId(element.elementId);
  if (!parsed) {
    return deepFreeze({
      metadataAvailable: false,
      radialDivisions: null,
      circumferentialDivisions: null,
      radialRingIndex: null,
      circumferentialSectorIndex: null,
      triangleSide: null,
      orientation: 'COUNTER_CLOCKWISE',
      parentCellLineage: [],
    });
  }
  const parsedElements = mesh.elements.map((row) => parseElementId(row.elementId));
  if (parsedElements.some((row) => !row)) {
    throw probeError('LAFEA_B01_PROBE_MESH_TOPOLOGY_METADATA_PARTIAL');
  }
  const radialDivisions = Math.max(...parsedElements.map((row) => row.ring)) + 1;
  const circumferentialDivisions = Math.max(
    ...parsedElements.map((row) => row.sector),
  ) + 1;
  if (mesh.elements.length !== 2 * radialDivisions * circumferentialDivisions) {
    throw probeError('LAFEA_B01_PROBE_MESH_TOPOLOGY_CARDINALITY_INVALID');
  }
  return deepFreeze({
    metadataAvailable: true,
    radialDivisions,
    circumferentialDivisions,
    radialRingIndex: parsed.ring,
    circumferentialSectorIndex: parsed.sector,
    triangleSide: parsed.side,
    orientation: 'COUNTER_CLOCKWISE',
    parentCellLineage: buildParentCellLineage(
      radialDivisions,
      circumferentialDivisions,
      parsed.ring,
      parsed.sector,
    ),
  });
}

function buildParentCellLineage(radialDivisions, circumferentialDivisions,
  ring, sector) {
  const lineage = [];
  let currentRadial = radialDivisions;
  let currentCircumferential = circumferentialDivisions;
  let factor = 1;
  while (true) {
    lineage.push(deepFreeze({
      radialDivisions: currentRadial,
      circumferentialDivisions: currentCircumferential,
      radialRingIndex: Math.floor(ring / factor),
      circumferentialSectorIndex: Math.floor(sector / factor),
      cellId: `C-R${Math.floor(ring / factor)}-S${Math.floor(sector / factor)}`,
    }));
    if (currentRadial % 2 !== 0 || currentCircumferential % 2 !== 0
      || currentRadial < 2 || currentCircumferential < 16) break;
    currentRadial /= 2;
    currentCircumferential /= 2;
    factor *= 2;
  }
  return deepFreeze(lineage);
}

function parseElementId(value) {
  const match = typeof value === 'string' ? ELEMENT_ID_PATTERN.exec(value) : null;
  if (!match) return null;
  return {
    ring: Number.parseInt(match.groups.ring, 10),
    sector: Number.parseInt(match.groups.sector, 10),
    side: match.groups.side,
  };
}

function quadraticEdgeDistance(point, first, middle, last) {
  const ax = 2 * first.x - 4 * middle.x + 2 * last.x;
  const ay = 2 * first.y - 4 * middle.y + 2 * last.y;
  const bx = -3 * first.x + 4 * middle.x - last.x;
  const by = -3 * first.y + 4 * middle.y - last.y;
  const cx = first.x - point.x;
  const cy = first.y - point.y;
  const coefficients = [
    2 * (ax * ax + ay * ay),
    3 * (ax * bx + ay * by),
    bx * bx + by * by + 2 * (ax * cx + ay * cy),
    bx * cx + by * cy,
  ];
  const candidates = [0, 1, ...polynomialRootsInUnitInterval(coefficients)];
  return Math.min(...candidates.map((t) => {
    const x = (ax * t + bx) * t + first.x;
    const y = (ay * t + by) * t + first.y;
    return Math.hypot(x - point.x, y - point.y);
  }));
}

function polynomialRootsInUnitInterval(coefficients) {
  const scale = Math.max(1, ...coefficients.map(Math.abs));
  const tolerance = 1e-13 * scale;
  let values = [...coefficients];
  while (values.length > 1 && Math.abs(values[0]) <= tolerance) values.shift();
  if (values.length === 1) return [];
  if (values.length === 2) {
    const root = -values[1] / values[0];
    return root >= 0 && root <= 1 ? [root] : [];
  }
  if (values.length === 3) return quadraticRootsInUnitInterval(values, tolerance);
  const [a, b, c] = values;
  const critical = quadraticRootsInUnitInterval([3 * a, 2 * b, c], tolerance);
  const points = [...new Set([0, ...critical, 1])].sort((left, right) => left - right);
  const roots = [];
  for (const point of points) {
    if (Math.abs(evaluatePolynomial(values, point)) <= tolerance) roots.push(point);
  }
  for (let index = 1; index < points.length; index += 1) {
    let left = points[index - 1];
    let right = points[index];
    let leftValue = evaluatePolynomial(values, left);
    const rightValue = evaluatePolynomial(values, right);
    if (leftValue === 0 || rightValue === 0 || Math.sign(leftValue) === Math.sign(rightValue)) {
      continue;
    }
    for (let iteration = 0; iteration < 80; iteration += 1) {
      const middle = (left + right) / 2;
      const middleValue = evaluatePolynomial(values, middle);
      if (Math.abs(middleValue) <= tolerance) {
        left = middle;
        right = middle;
        break;
      }
      if (Math.sign(leftValue) === Math.sign(middleValue)) {
        left = middle;
        leftValue = middleValue;
      } else {
        right = middle;
      }
    }
    roots.push((left + right) / 2);
  }
  return uniqueRoots(roots);
}

function quadraticRootsInUnitInterval([a, b, c], tolerance) {
  if (Math.abs(a) <= tolerance) {
    if (Math.abs(b) <= tolerance) return [];
    const root = -c / b;
    return root >= 0 && root <= 1 ? [root] : [];
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -tolerance) return [];
  if (Math.abs(discriminant) <= tolerance) {
    const root = -b / (2 * a);
    return root >= 0 && root <= 1 ? [root] : [];
  }
  const squareRoot = Math.sqrt(discriminant);
  return uniqueRoots([
    (-b - squareRoot) / (2 * a),
    (-b + squareRoot) / (2 * a),
  ].filter((root) => root >= 0 && root <= 1));
}

function uniqueRoots(values) {
  return values
    .sort((left, right) => left - right)
    .filter((value, index, all) => index === 0 || Math.abs(value - all[index - 1]) > 1e-11);
}

function evaluatePolynomial(coefficients, value) {
  return coefficients.reduce((result, coefficient) => result * value + coefficient, 0);
}

function signedTriangleArea([a, b, c]) {
  return 0.5 * ((b.x - a.x) * (c.y - a.y)
    - (c.x - a.x) * (b.y - a.y));
}

function normalizeProbe(value) {
  const component = text(value.component, 'component');
  if (!COMPONENTS.has(component)) {
    throw probeError('LAFEA_B01_PROBE_COMPONENT_INVALID');
  }
  return deepFreeze({
    probeId: text(value.probeId, 'probeId'),
    loadCaseId: text(value.loadCaseId, 'loadCaseId'),
    x: finite(value.x, 'x'),
    y: finite(value.y, 'y'),
    component,
    units: text(value.units, 'units'),
    locationDefinitionHash: sha256(
      value.locationDefinitionHash,
      'locationDefinitionHash',
    ),
  });
}

function requireMesh(value) {
  if (!value || value.schema !== 'lafea-analysis-mesh/v1'
    || !Array.isArray(value.nodes) || !Array.isArray(value.elements)
    || value.nodes.length === 0 || value.elements.length === 0) {
    throw probeError('LAFEA_B01_PROBE_MESH_INVALID');
  }
  const nodeIds = new Set(value.nodes.map((row) => row.nodeId));
  if (nodeIds.size !== value.nodes.length) {
    throw probeError('LAFEA_B01_PROBE_DUPLICATE_NODE_ID');
  }
  const elementIds = new Set(value.elements.map((row) => row.elementId));
  if (elementIds.size !== value.elements.length) {
    throw probeError('LAFEA_B01_PROBE_DUPLICATE_ELEMENT_ID');
  }
  return value;
}

function requireResult(value, mesh) {
  if (!value || value.schema !== 'local-continuum-result/v1'
    || value.qualification?.state !== 'ACCEPTED'
    || !Array.isArray(value.loadCaseResults)
    || value.meshEvidence?.formulation !== 'PLANE_STRESS') {
    throw probeError('LAFEA_B01_PROBE_RESULT_INVALID');
  }
  const retained = value.meshEvidence?.elementEvidence;
  if (!Array.isArray(retained) || retained.length !== mesh.elements.length) {
    throw probeError('LAFEA_B01_PROBE_RESULT_MESH_MISMATCH');
  }
  const expected = new Map(mesh.elements.map((row) => [row.elementId, row.nodeIds]));
  for (const row of retained) {
    if (JSON.stringify(expected.get(row.elementId)) !== JSON.stringify(row.nodeIds)) {
      throw probeError('LAFEA_B01_PROBE_RESULT_CONNECTIVITY_MISMATCH');
    }
  }
  return value;
}

function invertT6Mapping(nodes, x, y) {
  const initial = cornerNaturalGuess(nodes, x, y);
  if (!initial) return null;
  let xi = initial.xi;
  let eta = initial.eta;
  const scale = Math.max(
    1,
    ...nodes.flatMap((node) => [Math.abs(node.x), Math.abs(node.y)]),
  );
  for (let iteration = 0; iteration < NEWTON_LIMIT; iteration += 1) {
    const mapping = mapT6WithJacobian(nodes, xi, eta);
    const residualX = mapping.x - x;
    const residualY = mapping.y - y;
    if (Math.hypot(residualX, residualY) <= 1e-12 * scale) {
      return { xi, eta };
    }
    if (!(Math.abs(mapping.determinant) > 1e-18 * scale * scale)) return null;
    const deltaXi = (mapping.dyDeta * residualX
      - mapping.dxDeta * residualY) / mapping.determinant;
    const deltaEta = (-mapping.dyDxi * residualX
      + mapping.dxDxi * residualY) / mapping.determinant;
    xi -= deltaXi;
    eta -= deltaEta;
    if (!Number.isFinite(xi) || !Number.isFinite(eta)) return null;
  }
  const mapped = mapT6(nodes, xi, eta);
  return Math.hypot(mapped.x - x, mapped.y - y) <= 1e-9 * scale
    ? { xi, eta } : null;
}

function cornerNaturalGuess(nodes, x, y) {
  const [a, b, c] = nodes;
  const determinant = (b.x - a.x) * (c.y - a.y)
    - (c.x - a.x) * (b.y - a.y);
  if (determinant === 0) return null;
  const xi = ((x - a.x) * (c.y - a.y)
    - (c.x - a.x) * (y - a.y)) / determinant;
  const eta = ((b.x - a.x) * (y - a.y)
    - (x - a.x) * (b.y - a.y)) / determinant;
  return { xi, eta };
}

function insideNaturalTriangle(xi, eta) {
  return xi >= -NATURAL_TOLERANCE
    && eta >= -NATURAL_TOLERANCE
    && xi + eta <= 1 + NATURAL_TOLERANCE;
}

function mapT6(nodes, xi, eta) {
  const shape = t6Shape(xi, eta);
  return {
    x: shape.N.reduce((sum, value, index) => sum + value * nodes[index].x, 0),
    y: shape.N.reduce((sum, value, index) => sum + value * nodes[index].y, 0),
  };
}

function mapT6WithJacobian(nodes, xi, eta) {
  const shape = t6Shape(xi, eta);
  let x = 0; let y = 0;
  let dxDxi = 0; let dyDxi = 0; let dxDeta = 0; let dyDeta = 0;
  for (let index = 0; index < 6; index += 1) {
    x += shape.N[index] * nodes[index].x;
    y += shape.N[index] * nodes[index].y;
    dxDxi += shape.dNdXi[index] * nodes[index].x;
    dyDxi += shape.dNdXi[index] * nodes[index].y;
    dxDeta += shape.dNdEta[index] * nodes[index].x;
    dyDeta += shape.dNdEta[index] * nodes[index].y;
  }
  return {
    x, y, dxDxi, dyDxi, dxDeta, dyDeta,
    determinant: dxDxi * dyDeta - dxDeta * dyDxi,
  };
}

function t6Shape(xi, eta) {
  const l1 = 1 - xi - eta; const l2 = xi; const l3 = eta;
  return {
    N: [
      l1 * (2 * l1 - 1), l2 * (2 * l2 - 1), l3 * (2 * l3 - 1),
      4 * l1 * l2, 4 * l2 * l3, 4 * l3 * l1,
    ],
    dNdXi: [
      4 * xi + 4 * eta - 3, 4 * xi - 1, 0,
      4 * (1 - 2 * xi - eta), 4 * eta, -4 * eta,
    ],
    dNdEta: [
      4 * xi + 4 * eta - 3, 0, 4 * eta - 1,
      -4 * xi, 4 * xi, 4 * (1 - xi - 2 * eta),
    ],
  };
}

function matrixVector(matrix, vector) {
  return matrix.map((row) => normalizeZero(row.reduce(
    (sum, value, index) => sum + value * vector[index],
    0,
  )));
}

function isMatrix(value, rows, columns) {
  return Array.isArray(value)
    && value.length === rows
    && value.every((row) => Array.isArray(row)
      && row.length === columns
      && row.every((entry) => typeof entry === 'number'
        && Number.isFinite(entry)));
}

function principalStress(sigmaX, sigmaY, tauXY) {
  const average = (sigmaX + sigmaY) / 2;
  const radius = Math.hypot((sigmaX - sigmaY) / 2, tauXY);
  return {
    maximum: normalizeZero(average + radius),
    minimum: normalizeZero(average - radius),
  };
}

function vonMisesStress(sigmaX, sigmaY, sigmaZ, tauXY) {
  return normalizeZero(Math.sqrt(0.5 * (
    (sigmaX - sigmaY) ** 2
    + (sigmaY - sigmaZ) ** 2
    + (sigmaZ - sigmaX) ** 2
  ) + 3 * tauXY ** 2));
}

function componentValue(component, stress, principal, vonMises) {
  if (component === 'SIGMA_X') return stress.sigmaX;
  if (component === 'SIGMA_Y') return stress.sigmaY;
  if (component === 'SIGMA_Z') return stress.sigmaZ;
  if (component === 'TAU_XY') return stress.tauXY;
  if (component === 'PRINCIPAL_MAXIMUM') return principal.maximum;
  if (component === 'PRINCIPAL_MINIMUM') return principal.minimum;
  return vonMises;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw probeError('LAFEA_B01_PROBE_RECORD_INVALID', `${label} invalid.`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw probeError('LAFEA_B01_PROBE_EXACT_KEYS_INVALID', `${label} keys differ.`);
  }
}

function gitSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw probeError('LAFEA_B01_PROBE_EXACT_HEAD_INVALID');
  }
  return value;
}

function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw probeError('LAFEA_B01_PROBE_SHA256_REQUIRED', `${label} invalid.`);
  }
  return value;
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw probeError('LAFEA_B01_PROBE_TEXT_REQUIRED', `${label} required.`);
  }
  return value;
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw probeError('LAFEA_B01_PROBE_FINITE_REQUIRED', `${label} invalid.`);
  }
  return normalizeZero(value);
}

function normalizeZero(value) {
  return Object.is(value, -0) ? 0 : value;
}

function probeError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}
