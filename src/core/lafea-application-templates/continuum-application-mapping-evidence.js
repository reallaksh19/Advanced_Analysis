import {
  validateTemplateCallerMeshBinding,
} from './caller-mesh-binding.js';
import {
  LAFEA_TEMPLATE_RELEASE_HASH_PROFILE,
  templateReleaseSha256,
} from './release-record-v2-hash.js';

export const LAFEA_CONTINUUM_MAPPING_EVIDENCE_SCHEMA =
  'lafea-continuum-application-mapping-evidence/v1';
export const LAFEA_CONTINUUM_PATH_MAPPING_EVIDENCE_SCHEMA =
  'lafea-continuum-application-path-mapping-evidence/v1';
export const LAFEA_LUG_PINHOLE_MAPPING_PACKAGE_SCHEMA =
  'lafea-lug-pinhole-mapping-package/v1';
export const LAFEA_CONTINUUM_MAPPING_KINDS = Object.freeze([
  'MATERIAL_REGION',
  'LOAD_EDGE',
  'BOUNDARY_EDGE',
]);
export const LAFEA_CONTINUUM_MAPPING_QUALIFICATIONS = Object.freeze([
  'PASS',
  'BLOCK',
]);
export const LAFEA_LUG_PINHOLE_MAPPING_PACKAGE_STATUSES = Object.freeze([
  'MAPPING_EVIDENCE_QUALIFIED',
  'MAPPING_EVIDENCE_BLOCKED',
]);

const SHA = /^sha256:[0-9a-f]{64}$/u;
const ENGINEERING_HASH = /^(?:sha256:[0-9a-f]{64}|fnv1a64:[0-9a-f]{16})$/u;
const EVIDENCE_KEYS = Object.freeze([
  'schema', 'templateId', 'stageId', 'kind', 'sourceHash',
  'canonicalModelHash', 'analysisGeometryHash', 'meshProfileHash',
  'meshHash', 'stageSourceHash', 'applicationEvidenceHash',
  'declarationHash', 'qualification', 'metrics', 'reasons',
  'hashProfile', 'semanticHash',
]);
const EVIDENCE_CREATE_KEYS = Object.freeze(EVIDENCE_KEYS.filter((key) =>
  !['schema', 'hashProfile', 'semanticHash'].includes(key)));
const PACKAGE_KEYS = Object.freeze([
  'schema', 'producerRevision', 'templateId', 'stageId',
  'pendingBindingHash', 'sourceHash', 'canonicalModelHash',
  'analysisGeometryHash', 'meshProfileHash', 'meshHash',
  'stageSourceHash', 'applicationEvidenceHash', 'declarationHash',
  'materialRegionEvidence', 'loadEdgeEvidence', 'boundaryEdgeEvidence',
  'boundBinding', 'status', 'engineExecutionAuthorized',
  'recoveryProduced', 'convergenceProduced', 'codeAssessmentProduced',
  'releaseQualified', 'hashProfile', 'semanticHash',
]);
const PACKAGE_CREATE_KEYS = Object.freeze(PACKAGE_KEYS.filter((key) =>
  !['schema', 'status', 'engineExecutionAuthorized', 'recoveryProduced',
    'convergenceProduced', 'codeAssessmentProduced', 'releaseQualified',
    'hashProfile', 'semanticHash'].includes(key)));
const METRIC_KEYS = Object.freeze({
  MATERIAL_REGION: Object.freeze([
    'materialId', 'elementIds', 'coveredElementCount', 'totalElementCount',
    'completeCoverage',
  ]),
  LOAD_EDGE: Object.freeze([
    'featureId', 'loadCaseId', 'edgeNodeIds', 'loadIds',
    'expectedResultant', 'observedResultant', 'residual', 'tolerance',
    'closureAccepted',
  ]),
  BOUNDARY_EDGE: Object.freeze([
    'featureId', 'edgeNodeIds', 'constraintIds', 'rigidBodyRank',
    'requiredRank', 'restraintSufficient',
  ]),
});
const PATH_METRIC_KEYS = Object.freeze({
  LOAD_EDGE: Object.freeze([
    'featureId', 'loadCaseId', 'edgeNodePaths', 'pathNodeIds',
    'radialStart', 'radialEnd', 'mappingWindowHash', 'loadIds',
    'expectedResultant', 'observedResultant', 'residual', 'tolerance',
    'closureAccepted',
  ]),
  BOUNDARY_EDGE: Object.freeze([
    'featureId', 'edgeNodePaths', 'pathNodeIds', 'radialStart',
    'radialEnd', 'mappingWindowHash', 'constraintIds', 'rigidBodyRank',
    'requiredRank', 'restraintSufficient',
  ]),
});

export function createContinuumApplicationMappingEvidence(input) {
  return createMappingEvidence(
    input,
    LAFEA_CONTINUUM_MAPPING_EVIDENCE_SCHEMA,
    normalizeMetrics,
    'Continuum mapping evidence input',
  );
}

export function validateContinuumApplicationMappingEvidence(value) {
  return validateRebuild(
    value,
    EVIDENCE_KEYS,
    EVIDENCE_CREATE_KEYS,
    createContinuumApplicationMappingEvidence,
    'Continuum mapping evidence',
  );
}

export function createContinuumApplicationPathMappingEvidence(input) {
  if (input.kind === 'MATERIAL_REGION') {
    throw new TypeError('Path mapping evidence is restricted to load and boundary paths.');
  }
  return createMappingEvidence(
    input,
    LAFEA_CONTINUUM_PATH_MAPPING_EVIDENCE_SCHEMA,
    normalizePathMetrics,
    'Continuum path mapping evidence input',
  );
}

export function validateContinuumApplicationPathMappingEvidence(value) {
  return validateRebuild(
    value,
    EVIDENCE_KEYS,
    EVIDENCE_CREATE_KEYS,
    createContinuumApplicationPathMappingEvidence,
    'Continuum path mapping evidence',
  );
}

function createMappingEvidence(input, schema, normalize, label) {
  exactKeys(input, EVIDENCE_CREATE_KEYS, label);
  requireIdentity(input.templateId, input.stageId);
  if (!LAFEA_CONTINUUM_MAPPING_KINDS.includes(input.kind)) {
    throw new TypeError(`Unsupported continuum mapping kind: ${input.kind}.`);
  }
  if (!LAFEA_CONTINUUM_MAPPING_QUALIFICATIONS.includes(input.qualification)) {
    throw new TypeError('Continuum mapping qualification is invalid.');
  }
  const reasons = normalizeReasons(input.reasons);
  if (input.qualification === 'PASS' && reasons.length !== 0) {
    throw new TypeError('PASS mapping evidence must not retain blocking reasons.');
  }
  if (input.qualification === 'BLOCK' && reasons.length === 0) {
    throw new TypeError('BLOCK mapping evidence requires at least one reason.');
  }
  const metrics = normalize(input.kind, input.metrics, input.qualification);
  const base = {
    schema,
    templateId: input.templateId,
    stageId: input.stageId,
    kind: input.kind,
    sourceHash: sha256(input.sourceHash, 'sourceHash'),
    canonicalModelHash: sha256(input.canonicalModelHash, 'canonicalModelHash'),
    analysisGeometryHash: sha256(input.analysisGeometryHash, 'analysisGeometryHash'),
    meshProfileHash: engineeringHash(input.meshProfileHash, 'meshProfileHash'),
    meshHash: sha256(input.meshHash, 'meshHash'),
    stageSourceHash: sha256(input.stageSourceHash, 'stageSourceHash'),
    applicationEvidenceHash: sha256(
      input.applicationEvidenceHash,
      'applicationEvidenceHash',
    ),
    declarationHash: sha256(input.declarationHash, 'declarationHash'),
    qualification: input.qualification,
    metrics,
    reasons,
    hashProfile: LAFEA_TEMPLATE_RELEASE_HASH_PROFILE,
  };
  return deepFreeze({ ...base, semanticHash: templateReleaseSha256(base) });
}

export function createLafeaLugPinholeMappingPackage(input) {
  exactKeys(input, PACKAGE_CREATE_KEYS, 'Lug-pinhole mapping package input');
  requireIdentity(input.templateId, input.stageId);
  const parents = {
    sourceHash: sha256(input.sourceHash, 'sourceHash'),
    canonicalModelHash: sha256(input.canonicalModelHash, 'canonicalModelHash'),
    analysisGeometryHash: sha256(input.analysisGeometryHash, 'analysisGeometryHash'),
    meshProfileHash: engineeringHash(input.meshProfileHash, 'meshProfileHash'),
    meshHash: sha256(input.meshHash, 'meshHash'),
    stageSourceHash: sha256(input.stageSourceHash, 'stageSourceHash'),
    applicationEvidenceHash: sha256(
      input.applicationEvidenceHash,
      'applicationEvidenceHash',
    ),
    declarationHash: sha256(input.declarationHash, 'declarationHash'),
  };
  const materialRegionEvidence = requireEvidence(
    input.materialRegionEvidence,
    'MATERIAL_REGION',
    parents,
  );
  const loadEdgeEvidence = requireEvidence(
    input.loadEdgeEvidence,
    'LOAD_EDGE',
    parents,
  );
  const boundaryEdgeEvidence = requireEvidence(
    input.boundaryEdgeEvidence,
    'BOUNDARY_EDGE',
    parents,
  );
  const validation = validateTemplateCallerMeshBinding(input.boundBinding);
  if (!validation.ok) {
    throw new TypeError(`Bound caller-mesh binding is invalid: ${validation.errors.join(' ')}`);
  }
  const qualified = [
    materialRegionEvidence,
    loadEdgeEvidence,
    boundaryEdgeEvidence,
  ].every((row) => row.qualification === 'PASS');
  const expectedBindingStatus = qualified ? 'BOUND' : 'BLOCKED';
  if (input.boundBinding.templateId !== input.templateId
    || input.boundBinding.targetStageId !== input.stageId
    || input.boundBinding.sourceHash !== parents.sourceHash
    || input.boundBinding.canonicalModelHash !== parents.canonicalModelHash
    || input.boundBinding.analysisGeometryHash !== parents.analysisGeometryHash
    || input.boundBinding.meshProfileHash !== parents.meshProfileHash
    || input.boundBinding.meshHash !== parents.meshHash
    || input.boundBinding.materialRegionEvidence.evidenceHash
      !== materialRegionEvidence.semanticHash
    || input.boundBinding.loadEdgeEvidence.evidenceHash
      !== loadEdgeEvidence.semanticHash
    || input.boundBinding.boundaryEdgeEvidence.evidenceHash
      !== boundaryEdgeEvidence.semanticHash
    || input.boundBinding.status !== expectedBindingStatus) {
    throw new TypeError('Bound caller-mesh binding does not match mapping evidence.');
  }
  const base = {
    schema: LAFEA_LUG_PINHOLE_MAPPING_PACKAGE_SCHEMA,
    producerRevision: requireText(input.producerRevision, 'producerRevision'),
    templateId: input.templateId,
    stageId: input.stageId,
    pendingBindingHash: sha256(input.pendingBindingHash, 'pendingBindingHash'),
    ...parents,
    materialRegionEvidence,
    loadEdgeEvidence,
    boundaryEdgeEvidence,
    boundBinding: input.boundBinding,
    status: qualified
      ? 'MAPPING_EVIDENCE_QUALIFIED'
      : 'MAPPING_EVIDENCE_BLOCKED',
    engineExecutionAuthorized: false,
    recoveryProduced: false,
    convergenceProduced: false,
    codeAssessmentProduced: false,
    releaseQualified: false,
    hashProfile: LAFEA_TEMPLATE_RELEASE_HASH_PROFILE,
  };
  return deepFreeze({ ...base, semanticHash: templateReleaseSha256(base) });
}

export function validateLafeaLugPinholeMappingPackage(value) {
  return validateRebuild(
    value,
    PACKAGE_KEYS,
    PACKAGE_CREATE_KEYS,
    createLafeaLugPinholeMappingPackage,
    'Lug-pinhole mapping package',
  );
}

function requireIdentity(templateId, stageId) {
  if (templateId !== 'C2D-LUG-PINHOLE' || stageId !== 'LAFEA.3') {
    throw new TypeError('B7A mapping evidence is restricted to C2D-LUG-PINHOLE -> LAFEA.3.');
  }
}

function requireEvidence(value, kind, parents) {
  const validation = value?.schema === LAFEA_CONTINUUM_PATH_MAPPING_EVIDENCE_SCHEMA
    ? validateContinuumApplicationPathMappingEvidence(value)
    : validateContinuumApplicationMappingEvidence(value);
  if (!validation.ok) {
    throw new TypeError(`${kind} evidence is invalid: ${validation.errors.join(' ')}`);
  }
  if (value.kind !== kind || value.templateId !== 'C2D-LUG-PINHOLE'
    || value.stageId !== 'LAFEA.3'
    || (kind === 'MATERIAL_REGION'
      && value.schema !== LAFEA_CONTINUUM_MAPPING_EVIDENCE_SCHEMA)) {
    throw new TypeError(`${kind} evidence identity is invalid.`);
  }
  for (const [key, expected] of Object.entries(parents)) {
    if (value[key] !== expected) {
      throw new TypeError(`${kind} evidence parent ${key} is stale.`);
    }
  }
  return value;
}

function normalizeMetrics(kind, value, qualification) {
  exactKeys(value, METRIC_KEYS[kind], `${kind} metrics`);
  if (kind === 'MATERIAL_REGION') {
    requireText(value.materialId, 'metrics.materialId');
    const elementIds = textArray(value.elementIds, 'metrics.elementIds');
    integer(value.coveredElementCount, 'metrics.coveredElementCount');
    integer(value.totalElementCount, 'metrics.totalElementCount');
    boolean(value.completeCoverage, 'metrics.completeCoverage');
    if (value.coveredElementCount !== elementIds.length
      || value.totalElementCount < value.coveredElementCount
      || (qualification === 'PASS' && !value.completeCoverage)) {
      throw new TypeError('Material-region metrics are inconsistent.');
    }
    return { ...value, elementIds };
  }
  if (kind === 'LOAD_EDGE') {
    requireText(value.featureId, 'metrics.featureId');
    requireText(value.loadCaseId, 'metrics.loadCaseId');
    const edgeNodeIds = exactTextArray(
      value.edgeNodeIds,
      3,
      'metrics.edgeNodeIds',
    );
    const loadIds = textArray(value.loadIds, 'metrics.loadIds');
    const expectedResultant = vector2(
      value.expectedResultant,
      'metrics.expectedResultant',
    );
    const observedResultant = vector2(
      value.observedResultant,
      'metrics.observedResultant',
    );
    const residual = vector2(value.residual, 'metrics.residual');
    finite(value.tolerance, 'metrics.tolerance');
    boolean(value.closureAccepted, 'metrics.closureAccepted');
    if (qualification === 'PASS' && !value.closureAccepted) {
      throw new TypeError('PASS load-edge evidence requires accepted resultant closure.');
    }
    return {
      ...value,
      edgeNodeIds,
      loadIds,
      expectedResultant,
      observedResultant,
      residual,
    };
  }
  requireText(value.featureId, 'metrics.featureId');
  const edgeNodeIds = exactTextArray(
    value.edgeNodeIds,
    3,
    'metrics.edgeNodeIds',
  );
  const constraintIds = textArray(value.constraintIds, 'metrics.constraintIds');
  integer(value.rigidBodyRank, 'metrics.rigidBodyRank');
  integer(value.requiredRank, 'metrics.requiredRank');
  boolean(value.restraintSufficient, 'metrics.restraintSufficient');
  if (value.requiredRank !== 3 || value.rigidBodyRank > 3
    || (qualification === 'PASS'
      && (!value.restraintSufficient || value.rigidBodyRank !== 3))) {
    throw new TypeError('Boundary-edge restraint metrics are inconsistent.');
  }
  return { ...value, edgeNodeIds, constraintIds };
}

function normalizePathMetrics(kind, value, qualification) {
  if (!PATH_METRIC_KEYS[kind]) {
    throw new TypeError(`Path mapping does not support ${kind}.`);
  }
  exactKeys(value, PATH_METRIC_KEYS[kind], `${kind} path metrics`);
  requireText(value.featureId, 'metrics.featureId');
  const edgeNodePaths = quadraticEdgePath(
    value.edgeNodePaths,
    'metrics.edgeNodePaths',
  );
  const pathNodeIds = textArray(value.pathNodeIds, 'metrics.pathNodeIds');
  const expectedPathNodes = [...new Set(edgeNodePaths.flat())];
  if (JSON.stringify(pathNodeIds) !== JSON.stringify(expectedPathNodes)) {
    throw new TypeError('Path-node metrics do not match the retained edge path.');
  }
  finite(value.radialStart, 'metrics.radialStart');
  finite(value.radialEnd, 'metrics.radialEnd');
  if (!(value.radialEnd > value.radialStart)) {
    throw new TypeError('Path radial window is invalid.');
  }
  sha256(value.mappingWindowHash, 'metrics.mappingWindowHash');
  if (kind === 'LOAD_EDGE') {
    requireText(value.loadCaseId, 'metrics.loadCaseId');
    const loadIds = textArray(value.loadIds, 'metrics.loadIds');
    const expectedResultant = vector2(
      value.expectedResultant,
      'metrics.expectedResultant',
    );
    const observedResultant = vector2(
      value.observedResultant,
      'metrics.observedResultant',
    );
    const residual = vector2(value.residual, 'metrics.residual');
    finite(value.tolerance, 'metrics.tolerance');
    boolean(value.closureAccepted, 'metrics.closureAccepted');
    if (qualification === 'PASS' && !value.closureAccepted) {
      throw new TypeError('PASS load-path evidence requires accepted resultant closure.');
    }
    return {
      ...value,
      edgeNodePaths,
      pathNodeIds,
      loadIds,
      expectedResultant,
      observedResultant,
      residual,
    };
  }
  const constraintIds = textArray(value.constraintIds, 'metrics.constraintIds');
  integer(value.rigidBodyRank, 'metrics.rigidBodyRank');
  integer(value.requiredRank, 'metrics.requiredRank');
  boolean(value.restraintSufficient, 'metrics.restraintSufficient');
  if (value.requiredRank !== 3 || value.rigidBodyRank > 3
    || (qualification === 'PASS'
      && (!value.restraintSufficient || value.rigidBodyRank !== 3))) {
    throw new TypeError('Boundary-path restraint metrics are inconsistent.');
  }
  return { ...value, edgeNodePaths, pathNodeIds, constraintIds };
}

function quadraticEdgePath(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty edge path.`);
  }
  const edges = value.map((edge, index) =>
    exactTextArray(edge, 3, `${label}[${index}]`));
  for (let index = 1; index < edges.length; index += 1) {
    if (edges[index - 1][2] !== edges[index][0]) {
      throw new TypeError(`${label} must be an ordered connected path.`);
    }
  }
  return edges;
}

function validateRebuild(value, keys, createKeys, create, label) {
  const errors = [];
  try {
    exactKeys(value, keys, label);
    if (value.hashProfile !== LAFEA_TEMPLATE_RELEASE_HASH_PROFILE) {
      throw new TypeError(`${label} hash profile is invalid.`);
    }
    const input = {};
    for (const key of createKeys) input[key] = value[key];
    const rebuilt = create(input);
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
      throw new TypeError(`${label} is stale or tampered.`);
    }
    if (!isDeepFrozen(value)) {
      throw new TypeError(`${label} must be deeply frozen.`);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function normalizeReasons(value) {
  if (!Array.isArray(value)) {
    throw new TypeError('Mapping reasons must be an array.');
  }
  return [...new Set(value.map((row, index) =>
    requireText(row, `reasons[${index}]`)))].sort();
}
function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new TypeError(`${label} exact-key contract mismatch.`);
  }
}
function textArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty array.`);
  }
  const result = value.map((row, index) =>
    requireText(row, `${label}[${index}]`));
  if (new Set(result).size !== result.length) {
    throw new TypeError(`${label} must contain unique values.`);
  }
  return result;
}
function exactTextArray(value, count, label) {
  const result = textArray(value, label);
  if (result.length !== count) {
    throw new TypeError(`${label} must contain ${count} values.`);
  }
  return result;
}
function vector2(value, label) {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new TypeError(`${label} must be a two-component vector.`);
  }
  return value.map((row, index) => finite(row, `${label}[${index}]`));
}
function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} is required.`);
  }
  return value;
}
function sha256(value, label) {
  if (typeof value !== 'string' || !SHA.test(value)) {
    throw new TypeError(`${label} must be canonical SHA-256.`);
  }
  return value;
}
function engineeringHash(value, label) {
  if (typeof value !== 'string' || !ENGINEERING_HASH.test(value)) {
    throw new TypeError(`${label} must be an engineering hash.`);
  }
  return value;
}
function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite.`);
  }
  return Object.is(value, -0) ? 0 : value;
}
function integer(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer.`);
  }
  return value;
}
function boolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${label} must be boolean.`);
  }
  return value;
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
