import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';

export const STAGE_ID = 'LAFEA.3';
export const TEMPLATE_ID = 'C2D-LUG-PINHOLE';
export const LAFEA_LUG_PINHOLE_PHYSICAL_PROBLEM_SCHEMA =
  'lafea-lug-pinhole-physical-problem/v1';
export const LAFEA_LUG_PINHOLE_FEATURE_PROJECTION_SCHEMA =
  'lafea-lug-pinhole-feature-projection/v1';
export const LAFEA_LUG_PINHOLE_PROJECTION_INTAKE_SCHEMA =
  'lafea-lug-pinhole-physical-problem-projection-intake/v1';
export const LAFEA_LUG_PINHOLE_PROJECTION_SCHEMA =
  'lafea-lug-pinhole-physical-problem-projection/v1';
export const LAFEA_LUG_PINHOLE_EXECUTION_INTAKE_SCHEMA =
  'lafea-lug-pinhole-physical-problem-execution-intake/v1';
export const LAFEA_LUG_PINHOLE_EXECUTION_SCHEMA =
  'lafea-lug-pinhole-physical-problem-execution/v1';
export const LAFEA_LUG_PINHOLE_PHYSICAL_PROBLEM_PRODUCER_REVISION = 'NB-T6C.1';

const FEATURE_ROLES = Object.freeze([
  'HOLE_BOUNDARY', 'OUTER_BOUNDARY',
  'RADIAL_QUARTER_0', 'RADIAL_QUARTER_1',
  'RADIAL_QUARTER_2', 'RADIAL_QUARTER_3',
]);

export function canonicalProjectionInput(value) {
  exactKeys(value, [
    'schema', 'releaseRecord', 'compatibilityReceipt', 'canonicalModelHash',
    'geometry', 'levels', 'physicalProblem', 'featureProjection',
    'applicationEvidence', 'producerRef', 'sourceAuthorityOriginRef',
  ], 'projection intake');
  if (value.schema !== LAFEA_LUG_PINHOLE_PROJECTION_INTAKE_SCHEMA) {
    throw batchError('LAFEA_NB_T6C_PROJECTION_INTAKE_SCHEMA_INVALID');
  }
  return deepFreeze({
    ...structuredClone(value),
    canonicalModelHash: sha256(value.canonicalModelHash, 'canonicalModelHash'),
    geometry: canonicalGeometry(value.geometry),
    levels: canonicalLevels(value.levels),
    physicalProblem: canonicalPhysicalProblem(value.physicalProblem),
    featureProjection: canonicalFeatureProjection(value.featureProjection),
    applicationEvidence: canonicalApplicationEvidence(value.applicationEvidence),
    producerRef: text(value.producerRef, 'producerRef'),
    sourceAuthorityOriginRef: text(
      value.sourceAuthorityOriginRef,
      'sourceAuthorityOriginRef',
    ),
  });
}

export function canonicalExecutionInput(value, projection) {
  exactKeys(value, [
    'schema', 'projection', 'benchmarkQualification', 'requestId',
    'recoveryProfileHash', 'convergenceRequest',
  ], 'execution intake');
  if (value.schema !== LAFEA_LUG_PINHOLE_EXECUTION_INTAKE_SCHEMA) {
    throw batchError('LAFEA_NB_T6C_EXECUTION_INTAKE_SCHEMA_INVALID');
  }
  const request = canonicalConvergenceRequest(
    value.convergenceRequest,
    projection.physicalProblem.loadCase.loadCaseId,
  );
  return deepFreeze({
    requestId: text(value.requestId, 'requestId'),
    recoveryProfileHash: sha256(value.recoveryProfileHash, 'recoveryProfileHash'),
    convergenceRequest: request,
  });
}

export function physicalProblemHash(value) {
  return canonicalLafeaSha256({
    schema: 'lafea-nb-t6c-physical-problem-hash-input/v1',
    physicalProblem: canonicalPhysicalProblem(value),
  });
}

export function featureProjectionHash(value) {
  return canonicalLafeaSha256({
    schema: 'lafea-nb-t6c-feature-projection-hash-input/v1',
    featureProjection: canonicalFeatureProjection(value),
  });
}

export function projectionSemanticHash(value) {
  return canonicalLafeaSha256({
    schema: 'lafea-nb-t6c-projection-hash-input/v1',
    releaseRecordHash: value.releaseRecordHash,
    compatibilityReceiptHash: value.compatibilityReceiptHash,
    sourceAuthorityHash: value.sourceAuthorityHash,
    canonicalModelHash: value.canonicalModelHash,
    analysisGeometryHash: value.analysisGeometryHash,
    ladderHash: value.ladderHash,
    mappingPackageHash: value.mappingPackageHash,
    physicalProblemHash: value.physicalProblemHash,
    featureProjectionHash: value.featureProjectionHash,
    levelParents: value.levels.map((level) => ({
      ordinal: level.ordinal,
      documentRevisionDigest: level.documentRevisionDigest,
      meshHash: level.meshEvidence.meshHash,
      meshProfileHash: level.meshEvidence.meshProfileHash,
      loadEdgeNodeIds: level.loadEdgeNodeIds,
      boundaryEdgeNodeIds: level.boundaryEdgeNodeIds,
      loadResultant: level.loadResultant,
    })),
  });
}

export function pendingMapping() {
  return Object.freeze({
    applicability: 'REQUIRED', evidenceHash: null, qualification: 'PENDING',
  });
}

export function batchError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

export function requireValid(validation, code) {
  if (!validation?.ok) {
    throw batchError(code, `${code}: ${(validation?.errors ?? []).join(' ')}`);
  }
}

export function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw batchError('LAFEA_NB_T6C_SHA256_REQUIRED', `${label} must be SHA-256.`);
  }
  return value;
}

export function exactKeys(value, expected, label) {
  if (!isPlainRecord(value)) {
    throw batchError('LAFEA_NB_T6C_RECORD_INVALID', `${label} must be a record.`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw batchError('LAFEA_NB_T6C_EXACT_KEYS_INVALID', `${label} keys differ.`);
  }
}

export function isPlainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function canonicalGeometry(value) {
  exactKeys(value, ['center', 'holeRadius', 'outerRadius', 'startAngleDegrees'], 'geometry');
  exactKeys(value.center, ['x', 'y'], 'geometry.center');
  const result = {
    center: {
      x: finite(value.center.x, 'geometry.center.x'),
      y: finite(value.center.y, 'geometry.center.y'),
    },
    holeRadius: positive(value.holeRadius, 'geometry.holeRadius'),
    outerRadius: positive(value.outerRadius, 'geometry.outerRadius'),
    startAngleDegrees: finite(value.startAngleDegrees, 'geometry.startAngleDegrees'),
  };
  if (!(result.outerRadius > result.holeRadius)) {
    throw batchError('LAFEA_NB_T6C_GEOMETRY_RADIUS_INVALID');
  }
  return deepFreeze(result);
}

function canonicalLevels(value) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw batchError('LAFEA_NB_T6C_THREE_LEVELS_REQUIRED');
  }
  return deepFreeze([...value].sort((a, b) => a.ordinal - b.ordinal)
    .map((row, index) => {
      exactKeys(row, [
        'ordinal', 'meshIdentity', 'radialDivisions',
        'circumferentialDivisions', 'meshProfile',
      ], `levels[${index}]`);
      if (row.ordinal !== index + 1
        || !Number.isInteger(row.radialDivisions) || row.radialDivisions < 1
        || !Number.isInteger(row.circumferentialDivisions)
        || row.circumferentialDivisions < 8
        || !isPlainRecord(row.meshProfile)) {
        throw batchError('LAFEA_NB_T6C_LEVEL_INVALID');
      }
      text(row.meshIdentity, 'meshIdentity');
      return structuredClone(row);
    }));
}

function canonicalPhysicalProblem(value) {
  exactKeys(value, [
    'schema', 'modelIdentity', 'modelVersion', 'sourceAncestry', 'units',
    'material', 'thickness', 'loadCase', 'resultRequests',
    'qualificationProfile', 'limitations', 'kinematics',
  ], 'physicalProblem');
  if (value.schema !== LAFEA_LUG_PINHOLE_PHYSICAL_PROBLEM_SCHEMA) {
    throw batchError('LAFEA_NB_T6C_PHYSICAL_PROBLEM_SCHEMA_INVALID');
  }
  exactKeys(value.sourceAncestry, [
    'sourceModelIdentity', 'sourceVersion', 'adapterIdentity', 'adapterVersion',
  ], 'sourceAncestry');
  exactKeys(value.units, ['length', 'force', 'stress', 'modulus'], 'units');
  exactKeys(value.material, [
    'materialId', 'elasticModulus', 'poissonRatio', 'sourceReference',
  ], 'material');
  exactKeys(value.loadCase, [
    'loadCaseId', 'loadIdPrefix', 'resultant', 'sourceReference',
  ], 'loadCase');
  exactKeys(value.resultRequests, ['loadCaseIds'], 'resultRequests');
  exactKeys(value.kinematics, ['mode', 'ux', 'uy'], 'kinematics');
  for (const field of [value.kinematics.ux, value.kinematics.uy]) {
    exactKeys(field, ['xCoefficient', 'yCoefficient', 'constant'], 'kinematic field');
    Object.values(field).forEach((number) => finite(number, 'kinematic coefficient'));
  }
  text(value.modelIdentity, 'modelIdentity');
  text(value.modelVersion, 'modelVersion');
  Object.values(value.sourceAncestry).forEach((item) => text(item, 'source ancestry'));
  Object.values(value.units).forEach((item) => text(item, 'unit'));
  text(value.material.materialId, 'materialId');
  positive(value.material.elasticModulus, 'elasticModulus');
  if (!(finite(value.material.poissonRatio, 'poissonRatio') > -1
    && value.material.poissonRatio < 0.5)) {
    throw batchError('LAFEA_NB_T6C_POISSON_RATIO_INVALID');
  }
  text(value.material.sourceReference, 'material sourceReference');
  positive(value.thickness, 'thickness');
  text(value.loadCase.loadCaseId, 'loadCaseId');
  text(value.loadCase.loadIdPrefix, 'loadIdPrefix');
  vector2(value.loadCase.resultant, 'resultant');
  text(value.loadCase.sourceReference, 'load sourceReference');
  if (!Array.isArray(value.resultRequests.loadCaseIds)
    || value.resultRequests.loadCaseIds.length !== 1
    || value.resultRequests.loadCaseIds[0] !== value.loadCase.loadCaseId
    || !isPlainRecord(value.qualificationProfile)
    || !Array.isArray(value.limitations)
    || value.limitations.some((item) => typeof item !== 'string')) {
    throw batchError('LAFEA_NB_T6C_PHYSICAL_PROBLEM_INVALID');
  }
  if (!['BOUNDARY_ZERO', 'AFFINE_FULL_FIELD'].includes(value.kinematics.mode)) {
    throw batchError('LAFEA_NB_T6C_KINEMATICS_MODE_INVALID');
  }
  if (value.kinematics.mode === 'BOUNDARY_ZERO'
    && [...Object.values(value.kinematics.ux), ...Object.values(value.kinematics.uy)]
      .some((number) => number !== 0)) {
    throw batchError('LAFEA_NB_T6C_BOUNDARY_ZERO_FIELD_NONZERO');
  }
  return deepFreeze(structuredClone(value));
}

function canonicalFeatureProjection(value) {
  exactKeys(value, ['schema', 'loadFeature', 'boundaryFeature', 'loadTolerance'], 'featureProjection');
  if (value.schema !== LAFEA_LUG_PINHOLE_FEATURE_PROJECTION_SCHEMA) {
    throw batchError('LAFEA_NB_T6C_FEATURE_PROJECTION_SCHEMA_INVALID');
  }
  const loadFeature = canonicalFeature(value.loadFeature, 'LOAD-EDGE');
  const boundaryFeature = canonicalFeature(value.boundaryFeature, 'ROOT-REGION');
  if (loadFeature.role === boundaryFeature.role
    && loadFeature.baseStartEdge === boundaryFeature.baseStartEdge) {
    throw batchError('LAFEA_NB_T6C_LOAD_BOUNDARY_FEATURE_COLLISION');
  }
  exactKeys(value.loadTolerance, ['absolute', 'relative'], 'loadTolerance');
  return deepFreeze({
    schema: value.schema,
    loadFeature,
    boundaryFeature,
    loadTolerance: {
      absolute: nonNegative(value.loadTolerance.absolute, 'absolute tolerance'),
      relative: nonNegative(value.loadTolerance.relative, 'relative tolerance'),
    },
  });
}

function canonicalFeature(value, featureId) {
  exactKeys(value, ['featureId', 'role', 'baseStartEdge', 'baseEdgeCount'], featureId);
  if (value.featureId !== featureId || !FEATURE_ROLES.includes(value.role)
    || !Number.isInteger(value.baseStartEdge) || value.baseStartEdge < 0
    || value.baseEdgeCount !== 1) {
    throw batchError('LAFEA_NB_T6C_FEATURE_DECLARATION_INVALID');
  }
  return deepFreeze({ ...value });
}

function canonicalApplicationEvidence(value) {
  exactKeys(value, [
    'geometryClass', 'declarationBasis', 'featureIds', 'sourceReference',
  ], 'applicationEvidence');
  if (value.geometryClass !== 'LUG_PINHOLE'
    || value.declarationBasis !== 'CALLER_ENGINEERING_CLASSIFICATION'
    || !Array.isArray(value.featureIds)
    || !value.featureIds.includes('LOAD-EDGE')
    || !value.featureIds.includes('ROOT-REGION')) {
    throw batchError('LAFEA_NB_T6C_APPLICATION_EVIDENCE_INVALID');
  }
  text(value.sourceReference, 'application sourceReference');
  return deepFreeze(structuredClone(value));
}

function canonicalConvergenceRequest(value, loadCaseId) {
  exactKeys(value, [
    'quantityId', 'units', 'tolerance', 'loadCaseId', 'component', 'reducer',
  ], 'convergenceRequest');
  text(value.quantityId, 'quantityId');
  text(value.units, 'units');
  text(value.component, 'component');
  positive(value.tolerance, 'convergence tolerance');
  if (value.loadCaseId !== loadCaseId || value.reducer !== 'MAXIMUM_SIGNED') {
    throw batchError('LAFEA_NB_T6C_CONVERGENCE_REQUEST_INVALID');
  }
  return deepFreeze(structuredClone(value));
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw batchError('LAFEA_NB_T6C_TEXT_REQUIRED', `${label} is required.`);
  }
  return value;
}
function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw batchError('LAFEA_NB_T6C_FINITE_NUMBER_REQUIRED', `${label} must be finite.`);
  }
  return Object.is(value, -0) ? 0 : value;
}
function positive(value, label) {
  const number = finite(value, label);
  if (!(number > 0)) throw batchError('LAFEA_NB_T6C_POSITIVE_NUMBER_REQUIRED');
  return number;
}
function nonNegative(value, label) {
  const number = finite(value, label);
  if (number < 0) throw batchError('LAFEA_NB_T6C_NONNEGATIVE_NUMBER_REQUIRED');
  return number;
}
function vector2(value, label) {
  if (!Array.isArray(value) || value.length !== 2) {
    throw batchError('LAFEA_NB_T6C_VECTOR2_REQUIRED', `${label} must be a 2-vector.`);
  }
  return value.map((number, index) => finite(number, `${label}[${index}]`));
}
