import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import { inspectBucket01MeshGeometry } from './lafea-bucket-01-mesh-geometry.js';
import { inspectBucket01MeshTopology } from './lafea-bucket-01-mesh-topology.js';
import { inspectBucket01MeshValidity } from './lafea-bucket-01-mesh-validity.js';

export const LAFEA_BUCKET_01_MESH_QUALIFICATION_INPUT_SCHEMA =
  'lafea-bucket-01-mesh-qualification-input/v1';
export const LAFEA_BUCKET_01_MESH_QUALIFICATION_EVIDENCE_SCHEMA =
  'lafea-bucket-01-mesh-qualification-evidence/v1';
export const LAFEA_BUCKET_01_MESH_QUALIFICATION_REVISION = 'B01-MESH.1';

const INPUT_KEYS = Object.freeze([
  'schema', 'exactHeadSha', 'meshPackageHash', 'qualificationProfileHash',
  'meshPackage', 'tolerances',
]);
const TOLERANCE_KEYS = Object.freeze([
  'areaRelative', 'holeRadiusRelative', 'holeCenterOverRadius',
  'criticalLigamentRelative', 'perimeterRelative',
  'boundaryDeviationOverRadius', 'midsideOverReference',
  'rotationalSymmetryOverReference', 'duplicateNodeDistance',
]);

export function qualifyLafeaBucket01Mesh(inputValue) {
  exactKeys(inputValue, INPUT_KEYS, 'mesh qualification input');
  if (inputValue.schema !== LAFEA_BUCKET_01_MESH_QUALIFICATION_INPUT_SCHEMA) {
    throw meshError('LAFEA_B01_MESH_INPUT_SCHEMA_INVALID');
  }
  exactKeys(inputValue.tolerances, TOLERANCE_KEYS, 'mesh tolerances');
  const exactHeadSha = gitSha(inputValue.exactHeadSha);
  const meshPackageHash = sha256(inputValue.meshPackageHash, 'meshPackageHash');
  const qualificationProfileHash = sha256(
    inputValue.qualificationProfileHash,
    'qualificationProfileHash',
  );
  const tolerances = normalizeTolerances(inputValue.tolerances);
  const meshPackage = requirePackage(inputValue.meshPackage);
  const { spec, mesh, featureSets } = meshPackage;
  const nodeById = new Map(mesh.nodes.map((node) => [node.nodeId, node]));
  const topology = inspectBucket01MeshTopology(mesh, featureSets, nodeById);
  const geometry = inspectBucket01MeshGeometry(spec, mesh, featureSets, nodeById);
  const validity = inspectBucket01MeshValidity(
    mesh,
    nodeById,
    tolerances.duplicateNodeDistance,
  );
  const reasons = acceptanceReasons(spec, geometry, topology, validity, tolerances);
  const status = reasons.length === 0 ? 'PASS' : 'BLOCKED';
  const base = {
    schema: LAFEA_BUCKET_01_MESH_QUALIFICATION_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_MESH_QUALIFICATION_REVISION,
    exactHeadSha,
    meshPackageHash,
    qualificationProfileHash,
    meshIdentity: spec.meshIdentity,
    geometryClass: 'CONCENTRIC_ANNULAR_LUG_PINHOLE',
    elementType: 'T6',
    tolerances,
    geometry,
    topology,
    validity,
    status,
    reasons,
    authority: {
      productionMeshGeometryQualified: status === 'PASS',
      materialCoverageQualified: false,
      loadCoverageQualified: false,
      restraintCoverageQualified: false,
      arbitraryOuterProfileSupported: false,
      arbitraryHoleTopologySupported: false,
      solverExecuted: false,
      recoveryProduced: false,
      codeAssessmentProduced: false,
      releaseQualified: false,
    },
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

export function validateLafeaBucket01MeshQualificationEvidence(value, meshPackage) {
  try {
    if (!value
      || value.schema !== LAFEA_BUCKET_01_MESH_QUALIFICATION_EVIDENCE_SCHEMA
      || value.producerRevision !== LAFEA_BUCKET_01_MESH_QUALIFICATION_REVISION) {
      throw meshError('LAFEA_B01_MESH_EVIDENCE_CONTRACT_INVALID');
    }
    const rebuilt = qualifyLafeaBucket01Mesh({
      schema: LAFEA_BUCKET_01_MESH_QUALIFICATION_INPUT_SCHEMA,
      exactHeadSha: value.exactHeadSha,
      meshPackageHash: value.meshPackageHash,
      qualificationProfileHash: value.qualificationProfileHash,
      meshPackage,
      tolerances: value.tolerances,
    });
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
      throw meshError('LAFEA_B01_MESH_EVIDENCE_REBUILD_MISMATCH');
    }
    if (!isDeepFrozen(value)) {
      throw meshError('LAFEA_B01_MESH_EVIDENCE_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_B01_MESH_EVIDENCE_INVALID'],
    });
  }
}

function acceptanceReasons(spec, geometry, topology, validity, tolerances) {
  const checks = [
    ['AREA_ERROR_EXCEEDS_TOLERANCE',
      geometry.areaRelativeError <= tolerances.areaRelative],
    ['HOLE_RADIUS_ERROR_EXCEEDS_TOLERANCE',
      geometry.holeBoundaryMaximumRadiusError / spec.holeRadius
        <= tolerances.holeRadiusRelative],
    ['HOLE_CENTER_ERROR_EXCEEDS_TOLERANCE',
      geometry.holeCenterError / spec.holeRadius
        <= tolerances.holeCenterOverRadius],
    ['CRITICAL_LIGAMENT_ERROR_EXCEEDS_TOLERANCE',
      geometry.criticalLigamentRelativeError
        <= tolerances.criticalLigamentRelative],
    ['PERIMETER_ERROR_EXCEEDS_TOLERANCE',
      geometry.totalPerimeterRelativeError <= tolerances.perimeterRelative],
    ['BOUNDARY_DEVIATION_EXCEEDS_TOLERANCE',
      geometry.maximumBoundaryDeviation / spec.holeRadius
        <= tolerances.boundaryDeviationOverRadius],
    ['MIDSIDE_PLACEMENT_ERROR_EXCEEDS_TOLERANCE',
      geometry.maximumMidsidePlacementError / geometry.referenceLength
        <= tolerances.midsideOverReference],
    ['ROTATIONAL_SYMMETRY_ERROR_EXCEEDS_TOLERANCE',
      geometry.rotationalSymmetryError / geometry.referenceLength
        <= tolerances.rotationalSymmetryOverReference],
  ];
  return Object.freeze([
    ...checks.filter(([, accepted]) => !accepted).map(([code]) => code),
    ...topology.errors,
    ...validity.errors,
  ].filter((code, index, rows) => rows.indexOf(code) === index).sort());
}

function requirePackage(value) {
  if (!value
    || value.schema !== 'lafea-lug-pinhole-t6-mesh-package/v1'
    || value.generatorRevision !== 'NB-T6B.1'
    || !value.spec || !value.mesh || !value.featureSets) {
    throw meshError('LAFEA_B01_MESH_PACKAGE_INVALID');
  }
  const spec = value.spec;
  if (spec.schema !== 'lafea-lug-pinhole-t6-mesh-spec/v1'
    || !Number.isFinite(spec.center?.x) || !Number.isFinite(spec.center?.y)
    || !(spec.holeRadius > 0) || !(spec.outerRadius > spec.holeRadius)
    || !Number.isInteger(spec.radialDivisions) || spec.radialDivisions < 1
    || !Number.isInteger(spec.circumferentialDivisions)
    || spec.circumferentialDivisions < 8
    || spec.circumferentialDivisions % 4 !== 0) {
    throw meshError('LAFEA_B01_MESH_SPEC_INVALID');
  }
  if (value.mesh.schema !== 'lafea-analysis-mesh/v1'
    || !Array.isArray(value.mesh.nodes) || !value.mesh.nodes.length
    || !Array.isArray(value.mesh.elements) || !value.mesh.elements.length) {
    throw meshError('LAFEA_B01_ANALYSIS_MESH_INVALID');
  }
  if (value.featureSets.schema !== 'lafea-lug-pinhole-feature-sets/v1') {
    throw meshError('LAFEA_B01_FEATURE_SETS_INVALID');
  }
  return value;
}

function normalizeTolerances(value) {
  return deepFreeze(Object.fromEntries(
    TOLERANCE_KEYS.map((key) => [key, nonNegative(value[key], key)]),
  ));
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw meshError('LAFEA_B01_MESH_RECORD_INVALID', `${label} invalid.`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw meshError('LAFEA_B01_MESH_EXACT_KEYS_INVALID', `${label} keys differ.`);
  }
}

function gitSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw meshError('LAFEA_B01_MESH_EXACT_HEAD_INVALID');
  }
  return value;
}

function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw meshError('LAFEA_B01_MESH_SHA256_REQUIRED', `${label} invalid.`);
  }
  return value;
}

function nonNegative(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw meshError('LAFEA_B01_MESH_NONNEGATIVE_REQUIRED', `${label} invalid.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function meshError(code, message = code) {
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
