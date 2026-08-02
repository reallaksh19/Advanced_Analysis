import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_CONVERGENCE_INPUT_SCHEMA,
  evaluateLafeaBucket01Convergence,
} from './lafea-bucket-01-convergence.js';
import {
  LAFEA_BUCKET_01_FIXED_PROBE_EVIDENCE_SCHEMA,
  LAFEA_BUCKET_01_FIXED_PROBE_REVISION,
} from './lafea-bucket-01-fixed-probe.js';

export const LAFEA_BUCKET_01_STRESS_CONVERGENCE_INPUT_SCHEMA =
  'lafea-bucket-01-stress-convergence-input/v1';
export const LAFEA_BUCKET_01_STRESS_CONVERGENCE_EVIDENCE_SCHEMA =
  'lafea-bucket-01-stress-convergence-evidence/v1';
export const LAFEA_BUCKET_01_STRESS_CONVERGENCE_REVISION = 'B01-STRESS-CONV.1';

const INPUT_KEYS = Object.freeze([
  'schema', 'exactHeadSha', 'probeEvidences', 'meshSizes', 'gciTolerance',
  'minimumObservedOrder', 'asymptoticRatioBounds',
]);

export function evaluateLafeaBucket01StressConvergence(inputValue) {
  exactKeys(inputValue, INPUT_KEYS, 'stress-convergence input');
  if (inputValue.schema !== LAFEA_BUCKET_01_STRESS_CONVERGENCE_INPUT_SCHEMA) {
    throw stressError('LAFEA_B01_STRESS_CONVERGENCE_SCHEMA_INVALID');
  }
  const exactHeadSha = gitSha(inputValue.exactHeadSha);
  if (!Array.isArray(inputValue.probeEvidences)
    || inputValue.probeEvidences.length !== 3) {
    throw stressError('LAFEA_B01_STRESS_CONVERGENCE_THREE_PROBES_REQUIRED');
  }
  const probes = inputValue.probeEvidences.map((row) =>
    validateProbeEnvelope(row, exactHeadSha));
  const reference = probes[0];
  for (const probe of probes.slice(1)) {
    const identityFields = [
      ['probeId', probe.probe.probeId, reference.probe.probeId],
      ['loadCaseId', probe.probe.loadCaseId, reference.probe.loadCaseId],
      ['component', probe.probe.component, reference.probe.component],
      ['units', probe.probe.units, reference.probe.units],
      [
        'locationDefinitionHash',
        probe.probe.locationDefinitionHash,
        reference.probe.locationDefinitionHash,
      ],
      ['x', probe.probe.x, reference.probe.x],
      ['y', probe.probe.y, reference.probe.y],
    ];
    if (identityFields.some(([, actual, expected]) => actual !== expected)) {
      throw stressError('LAFEA_B01_STRESS_PROBE_IDENTITY_DRIFT');
    }
  }
  if (new Set(probes.map((row) => row.meshHash)).size !== 3) {
    throw stressError('LAFEA_B01_STRESS_DISTINCT_MESH_HASHES_REQUIRED');
  }
  if (new Set(probes.map((row) => row.recoveryHash)).size !== 3) {
    throw stressError('LAFEA_B01_STRESS_DISTINCT_RECOVERY_HASHES_REQUIRED');
  }
  const convergence = evaluateLafeaBucket01Convergence({
    schema: LAFEA_BUCKET_01_CONVERGENCE_INPUT_SCHEMA,
    quantityId: reference.probe.component,
    samplingAuthority: 'FIXED_PHYSICAL_PROBE',
    locationId: reference.probe.probeId,
    locationDefinitionHash: reference.probe.locationDefinitionHash,
    units: reference.probe.units,
    meshSizes: inputValue.meshSizes,
    observations: probes.map((row) => row.authoritativeValue),
    gciTolerance: inputValue.gciTolerance,
    minimumObservedOrder: inputValue.minimumObservedOrder,
    asymptoticRatioBounds: inputValue.asymptoticRatioBounds,
  });
  const base = {
    schema: LAFEA_BUCKET_01_STRESS_CONVERGENCE_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_STRESS_CONVERGENCE_REVISION,
    exactHeadSha,
    probeId: reference.probe.probeId,
    loadCaseId: reference.probe.loadCaseId,
    component: reference.probe.component,
    units: reference.probe.units,
    physicalCoordinates: { x: reference.probe.x, y: reference.probe.y },
    locationDefinitionHash: reference.probe.locationDefinitionHash,
    probeEvidenceHashes: probes.map((row) => row.semanticHash),
    meshHashes: probes.map((row) => row.meshHash),
    recoveryHashes: probes.map((row) => row.recoveryHash),
    convergence,
    status: convergence.status,
    reasons: convergence.reasons,
    authority: {
      integrationPointAuthorityRetained: true,
      fixedPhysicalLocation: true,
      movingMaximumUsed: false,
      nodalProjectionUsed: false,
      crossElementAveragingUsed: false,
    },
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

export function validateLafeaBucket01StressConvergenceEvidence(value, probes) {
  try {
    if (!value
      || value.schema !== LAFEA_BUCKET_01_STRESS_CONVERGENCE_EVIDENCE_SCHEMA
      || value.producerRevision !== LAFEA_BUCKET_01_STRESS_CONVERGENCE_REVISION) {
      throw stressError('LAFEA_B01_STRESS_CONVERGENCE_EVIDENCE_INVALID');
    }
    const rebuilt = evaluateLafeaBucket01StressConvergence({
      schema: LAFEA_BUCKET_01_STRESS_CONVERGENCE_INPUT_SCHEMA,
      exactHeadSha: value.exactHeadSha,
      probeEvidences: probes,
      meshSizes: value.convergence.meshSizes,
      gciTolerance: value.convergence.gciTolerance,
      minimumObservedOrder: value.convergence.minimumObservedOrder,
      asymptoticRatioBounds: value.convergence.asymptoticRatioBounds,
    });
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
      throw stressError('LAFEA_B01_STRESS_CONVERGENCE_REBUILD_MISMATCH');
    }
    if (!isDeepFrozen(value)) {
      throw stressError('LAFEA_B01_STRESS_CONVERGENCE_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_B01_STRESS_CONVERGENCE_INVALID'],
    });
  }
}

function validateProbeEnvelope(value, exactHeadSha) {
  if (!value
    || value.schema !== LAFEA_BUCKET_01_FIXED_PROBE_EVIDENCE_SCHEMA
    || value.producerRevision !== LAFEA_BUCKET_01_FIXED_PROBE_REVISION
    || value.exactHeadSha !== exactHeadSha
    || value.status !== 'PASS'
    || value.samplingAuthority !== 'FIXED_PHYSICAL_PROBE'
    || value.recoveryAuthority
      !== 'ELEMENT_LOCAL_INTEGRATION_POINT_RECONSTRUCTION'
    || value.nodalProjectionUsed !== false
    || value.crossElementAveragingUsed !== false
    || typeof value.authoritativeValue !== 'number'
    || !Number.isFinite(value.authoritativeValue)) {
    throw stressError('LAFEA_B01_STRESS_PROBE_EVIDENCE_INVALID');
  }
  const basis = { ...value };
  delete basis.semanticHash;
  if (canonicalLafeaSha256(basis) !== value.semanticHash) {
    throw stressError('LAFEA_B01_STRESS_PROBE_EVIDENCE_HASH_TAMPERED');
  }
  return value;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw stressError('LAFEA_B01_STRESS_RECORD_INVALID', `${label} invalid.`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw stressError('LAFEA_B01_STRESS_EXACT_KEYS_INVALID', `${label} keys differ.`);
  }
}

function gitSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw stressError('LAFEA_B01_STRESS_EXACT_HEAD_INVALID');
  }
  return value;
}

function stressError(code, message = code) {
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
