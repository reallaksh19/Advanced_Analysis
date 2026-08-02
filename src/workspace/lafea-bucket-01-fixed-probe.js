import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';

export const LAFEA_BUCKET_01_FIXED_PROBE_INPUT_SCHEMA =
  'lafea-bucket-01-fixed-probe-input/v1';
export const LAFEA_BUCKET_01_FIXED_PROBE_EVIDENCE_SCHEMA =
  'lafea-bucket-01-fixed-probe-evidence/v1';
export const LAFEA_BUCKET_01_FIXED_PROBE_REVISION = 'B01-PROBE.1';

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
const GAUSS_POINT_COUNT = 3;
const NATURAL_TOLERANCE = 1e-9;
const NEWTON_LIMIT = 30;

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
  const elementResultById = new Map(
    loadCase.elementResults.map((row) => [row.elementId, row]),
  );
  const nodeById = new Map(mesh.nodes.map((row) => [row.nodeId, row]));
  const candidates = [];
  for (const element of mesh.elements) {
    if (element.elementType !== 'T6' || element.nodeIds.length !== 6) continue;
    const nodes = element.nodeIds.map((nodeId) => nodeById.get(nodeId));
    if (nodes.some((row) => !row)) {
      throw probeError('LAFEA_B01_PROBE_MESH_NODE_MISSING');
    }
    const natural = invertT6Mapping(nodes, probe.x, probe.y);
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
  const candidate = candidates[0];
  const elementResult = elementResultById.get(candidate.element.elementId);
  if (!elementResult
    || elementResult.elementType !== 'T6'
    || elementResult.recoveryLayer !== 'INTEGRATION_POINT'
    || !Array.isArray(elementResult.gaussPointResults)
    || elementResult.gaussPointResults.length !== GAUSS_POINT_COUNT) {
    throw probeError('LAFEA_B01_PROBE_INTEGRATION_POINT_RECOVERY_REQUIRED');
  }
  const components = reconstructTensor(
    elementResult.gaussPointResults,
    candidate.natural.xi,
    candidate.natural.eta,
  );
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
  const mapped = mapT6(
    candidate.nodes,
    candidate.natural.xi,
    candidate.natural.eta,
  );
  const base = {
    schema: LAFEA_BUCKET_01_FIXED_PROBE_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_FIXED_PROBE_REVISION,
    exactHeadSha,
    meshHash,
    recoveryHash,
    probe,
    samplingAuthority: 'FIXED_PHYSICAL_PROBE',
    recoveryAuthority: 'ELEMENT_LOCAL_INTEGRATION_POINT_RECONSTRUCTION',
    reconstructionMethod:
      'T6_THREE_POINT_LINEAR_NATURAL_COORDINATE_RECONSTRUCTION_V1',
    elementId: candidate.element.elementId,
    naturalCoordinates: {
      xi: normalizeZero(candidate.natural.xi),
      eta: normalizeZero(candidate.natural.eta),
    },
    mappedPhysicalCoordinates: {
      x: normalizeZero(mapped.x),
      y: normalizeZero(mapped.y),
    },
    mappingResidual: Math.hypot(mapped.x - probe.x, mapped.y - probe.y),
    tensorFrame: 'GLOBAL_XY',
    reconstructedComponents: components,
    principalMaximum: principal.maximum,
    principalMinimum: principal.minimum,
    vonMises,
    authoritativeValue: value,
    units: probe.units,
    supportingIntegrationPoints: elementResult.gaussPointResults.map((point) => ({
      pointId: point.pointId,
      xi: point.xi,
      eta: point.eta,
      stress: point.stress,
    })),
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
    || !Array.isArray(value.loadCaseResults)) {
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

function reconstructTensor(points, xi, eta) {
  return deepFreeze({
    sigmaX: reconstruct(points, xi, eta, (point) => point.stress?.sigmaX),
    sigmaY: reconstruct(points, xi, eta, (point) => point.stress?.sigmaY),
    sigmaZ: reconstruct(points, xi, eta, (point) => point.stress?.sigmaZ),
    tauXY: reconstruct(points, xi, eta, (point) => point.stress?.tauXY),
  });
}

function reconstruct(points, xi, eta, selector) {
  const matrix = points.map((point) => [1, point.xi, point.eta]);
  const values = points.map(selector);
  if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw probeError('LAFEA_B01_PROBE_STRESS_COMPONENT_INVALID');
  }
  const coefficients = solve3(matrix, values);
  return normalizeZero(coefficients[0] + coefficients[1] * xi + coefficients[2] * eta);
}

function solve3(matrix, vector) {
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let pivot = 0; pivot < 3; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < 3; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[best][pivot])) {
        best = row;
      }
    }
    [augmented[pivot], augmented[best]] = [augmented[best], augmented[pivot]];
    const scale = augmented[pivot][pivot];
    if (!(Math.abs(scale) > 1e-15)) {
      throw probeError('LAFEA_B01_PROBE_RECONSTRUCTION_SINGULAR');
    }
    for (let column = pivot; column < 4; column += 1) {
      augmented[pivot][column] /= scale;
    }
    for (let row = 0; row < 3; row += 1) {
      if (row === pivot) continue;
      const factor = augmented[row][pivot];
      for (let column = pivot; column < 4; column += 1) {
        augmented[row][column] -= factor * augmented[pivot][column];
      }
    }
  }
  return augmented.map((row) => row[3]);
}

function principalStress(sigmaX, sigmaY, tauXY) {
  const average = (sigmaX + sigmaY) / 2;
  const radius = Math.hypot((sigmaX - sigmaY) / 2, tauXY);
  return { maximum: average + radius, minimum: average - radius };
}

function vonMisesStress(sigmaX, sigmaY, sigmaZ, tauXY) {
  return Math.sqrt(0.5 * (
    (sigmaX - sigmaY) ** 2
    + (sigmaY - sigmaZ) ** 2
    + (sigmaZ - sigmaX) ** 2
  ) + 3 * tauXY ** 2);
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
