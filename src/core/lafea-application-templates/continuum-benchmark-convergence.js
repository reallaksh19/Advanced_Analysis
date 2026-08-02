import {
  LAFEA_TEMPLATE_RELEASE_HASH_PROFILE,
  templateReleaseSha256,
} from './release-record-v2-hash.js';

export const LAFEA_CONTINUUM_BENCHMARK_MANIFEST_SCHEMA =
  'lafea-continuum-benchmark-manifest/v1';
export const LAFEA_CONTINUUM_BENCHMARK_OBSERVATION_SCHEMA =
  'lafea-continuum-benchmark-observation/v1';
export const LAFEA_CONTINUUM_BENCHMARK_QUALIFICATION_SCHEMA =
  'lafea-continuum-benchmark-qualification/v1';
export const LAFEA_CONVERGENCE_LIFECYCLE_PARENT_PROPOSAL_SCHEMA =
  'lafea-convergence-lifecycle-parent-proposal/v1';
export const LAFEA_CONTINUUM_BENCHMARK_KINDS = Object.freeze([
  'ASSEMBLED_Q8_PATCH',
  'KIRSCH_Q8_THREE_LEVEL',
]);
export const LAFEA_CONTINUUM_BENCHMARK_OBSERVATION_STATUSES = Object.freeze([
  'PASS', 'BLOCKED', 'STALE',
]);
export const LAFEA_CONTINUUM_BENCHMARK_QUALIFICATION_STATUSES = Object.freeze([
  'BENCHMARK_EVIDENCE_QUALIFIED',
  'BENCHMARK_EVIDENCE_BLOCKED',
  'BENCHMARK_EVIDENCE_STALE',
]);

const SHA = /^sha256:[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const TEMPLATE_ID = 'C2D-LUG-PINHOLE';
const STAGE_ID = 'LAFEA.3';
const MANIFEST_KEYS = Object.freeze([
  'schema', 'benchmarkId', 'templateId', 'stageId', 'kind',
  'sourcePath', 'sourceHash', 'expectedValueAuthority', 'expected',
  'tolerances', 'hashProfile', 'semanticHash',
]);
const MANIFEST_CREATE_KEYS = Object.freeze(MANIFEST_KEYS.filter((key) =>
  !['schema', 'hashProfile', 'semanticHash'].includes(key)));
const OBSERVATION_KEYS = Object.freeze([
  'schema', 'benchmarkId', 'templateId', 'stageId', 'kind',
  'manifestHash', 'sourceHash', 'observed', 'status', 'reasons',
  'recoverySetHash', 'hashProfile', 'semanticHash',
]);
const OBSERVATION_CREATE_KEYS = Object.freeze([
  'manifest', 'sourceHash', 'observed',
]);
const QUALIFICATION_KEYS = Object.freeze([
  'schema', 'producerRevision', 'exactHeadSha', 'templateId', 'stageId',
  'mappingPackageHash', 'patchManifest', 'patchObservation',
  'holeManifest', 'holeObservation', 'status', 'reasons',
  'lifecycleParentProposal', 'engineExecutionAuthorized',
  'recoveryProduced', 'convergenceRegistered', 'codeAssessmentProduced',
  'releaseQualified', 'generalT7dAuthorized', 'hashProfile', 'semanticHash',
]);
const QUALIFICATION_CREATE_KEYS = Object.freeze([
  'producerRevision', 'exactHeadSha', 'mappingPackageHash',
  'patchManifest', 'patchObservation', 'holeManifest', 'holeObservation',
]);
const TOLERANCE_KEYS = Object.freeze(['absolute', 'relative']);
const PATCH_EXPECTED_KEYS = Object.freeze([
  'elementType', 'elementCount', 'gaussPointsPerElement', 'freeNodeId',
  'displacement', 'strain', 'stress',
]);
const PATCH_TOLERANCE_KEYS = Object.freeze(['recovery']);
const KIRSCH_EXPECTED_KEYS = Object.freeze([
  'elementType', 'remoteStress', 'theoreticalPeakFactor',
  'outerBoundaryCondition', 'levels', 'requirements',
]);
const KIRSCH_TOLERANCE_KEYS = Object.freeze(['comparison']);
const LEVEL_KEYS = Object.freeze([
  'ordinal', 'radialElements', 'circumferentialElements',
]);
const REQUIREMENT_KEYS = Object.freeze([
  'peakFinestRelativeErrorMax', 'fullFieldFinestNormalizedErrorMax',
  'requirePeakImprovementFirstToFinest', 'requireStrictFieldMonotonicity',
]);
const PATCH_OBSERVED_KEYS = Object.freeze([
  'recoveryHash', 'meshHash', 'elementType', 'elementCount',
  'gaussPointsPerElement', 'freeNodeId', 'displacement', 'strain', 'stress',
]);
const KIRSCH_OBSERVED_KEYS = Object.freeze(['levels']);
const KIRSCH_LEVEL_OBSERVED_KEYS = Object.freeze([
  'ordinal', 'radialElements', 'circumferentialElements',
  'meshHash', 'recoveryHash', 'peakFactor', 'fullFieldNormalizedError',
]);

export function createContinuumBenchmarkManifest(input) {
  exactKeys(input, MANIFEST_CREATE_KEYS, 'Continuum benchmark manifest input');
  requireIdentity(input.templateId, input.stageId);
  if (!LAFEA_CONTINUUM_BENCHMARK_KINDS.includes(input.kind)) {
    throw new TypeError(`Unsupported continuum benchmark kind: ${input.kind}.`);
  }
  const benchmarkId = requireBenchmarkId(input.benchmarkId, input.kind);
  const expected = input.kind === 'ASSEMBLED_Q8_PATCH'
    ? normalizePatchExpected(input.expected)
    : normalizeKirschExpected(input.expected);
  const tolerances = normalizeTolerances(input.kind, input.tolerances);
  if (input.expectedValueAuthority
    !== 'FROZEN_BEFORE_OBSERVED_EVIDENCE_CONSUMPTION') {
    throw new TypeError('Benchmark expected-value authority is invalid.');
  }
  const base = {
    schema: LAFEA_CONTINUUM_BENCHMARK_MANIFEST_SCHEMA,
    benchmarkId,
    templateId: TEMPLATE_ID,
    stageId: STAGE_ID,
    kind: input.kind,
    sourcePath: requireSourcePath(input.sourcePath, input.kind),
    sourceHash: sha256(input.sourceHash, 'sourceHash'),
    expectedValueAuthority: input.expectedValueAuthority,
    expected,
    tolerances,
    hashProfile: LAFEA_TEMPLATE_RELEASE_HASH_PROFILE,
  };
  return deepFreeze({ ...base, semanticHash: templateReleaseSha256(base) });
}

export function validateContinuumBenchmarkManifest(value) {
  return validateRebuild(
    value, MANIFEST_KEYS, MANIFEST_CREATE_KEYS,
    createContinuumBenchmarkManifest, 'Continuum benchmark manifest',
  );
}

export function createContinuumBenchmarkObservation(input) {
  exactKeys(input, OBSERVATION_CREATE_KEYS, 'Continuum benchmark observation input');
  requireValid(
    validateContinuumBenchmarkManifest(input.manifest),
    'Continuum benchmark manifest is invalid.',
  );
  const manifest = input.manifest;
  const sourceHash = sha256(input.sourceHash, 'sourceHash');
  const stale = sourceHash !== manifest.sourceHash;
  const evaluation = manifest.kind === 'ASSEMBLED_Q8_PATCH'
    ? evaluatePatch(manifest, input.observed)
    : evaluateKirsch(manifest, input.observed);
  const status = stale ? 'STALE' : evaluation.reasons.length ? 'BLOCKED' : 'PASS';
  const reasons = stale
    ? [...new Set(['BENCHMARK_SOURCE_HASH_STALE', ...evaluation.reasons])].sort()
    : [...new Set(evaluation.reasons)].sort();
  const recoverySetHash = manifest.kind === 'KIRSCH_Q8_THREE_LEVEL'
    ? templateReleaseSha256({
      schema: 'lafea-continuum-recovery-set-hash-input/v1',
      benchmarkId: manifest.benchmarkId,
      levels: evaluation.observed.levels.map((row) => ({
        ordinal: row.ordinal,
        meshHash: row.meshHash,
        recoveryHash: row.recoveryHash,
      })),
    })
    : null;
  const base = {
    schema: LAFEA_CONTINUUM_BENCHMARK_OBSERVATION_SCHEMA,
    benchmarkId: manifest.benchmarkId,
    templateId: manifest.templateId,
    stageId: manifest.stageId,
    kind: manifest.kind,
    manifestHash: manifest.semanticHash,
    sourceHash,
    observed: evaluation.observed,
    status,
    reasons,
    recoverySetHash,
    hashProfile: LAFEA_TEMPLATE_RELEASE_HASH_PROFILE,
  };
  return deepFreeze({ ...base, semanticHash: templateReleaseSha256(base) });
}

export function validateContinuumBenchmarkObservation(value, manifest) {
  const errors = [];
  try {
    exactKeys(value, OBSERVATION_KEYS, 'Continuum benchmark observation');
    requireValid(
      validateContinuumBenchmarkManifest(manifest),
      'Continuum benchmark manifest is invalid.',
    );
    if (value.manifestHash !== manifest.semanticHash) {
      throw new TypeError('Continuum benchmark observation manifest is stale.');
    }
    const rebuilt = createContinuumBenchmarkObservation({
      manifest,
      sourceHash: value.sourceHash,
      observed: value.observed,
    });
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
      throw new TypeError('Continuum benchmark observation is stale or tampered.');
    }
    if (!isDeepFrozen(value)) {
      throw new TypeError('Continuum benchmark observation must be deeply frozen.');
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function createLafeaContinuumBenchmarkQualification(input) {
  exactKeys(input, QUALIFICATION_CREATE_KEYS, 'Continuum benchmark qualification input');
  const patchManifest = requireManifestKind(input.patchManifest, 'ASSEMBLED_Q8_PATCH');
  const holeManifest = requireManifestKind(input.holeManifest, 'KIRSCH_Q8_THREE_LEVEL');
  requireObservation(input.patchObservation, patchManifest);
  requireObservation(input.holeObservation, holeManifest);
  const statuses = [input.patchObservation.status, input.holeObservation.status];
  const status = statuses.includes('STALE')
    ? 'BENCHMARK_EVIDENCE_STALE'
    : statuses.every((row) => row === 'PASS')
      ? 'BENCHMARK_EVIDENCE_QUALIFIED'
      : 'BENCHMARK_EVIDENCE_BLOCKED';
  const reasons = [
    ...input.patchObservation.reasons.map((row) => `CONT-PATCH-01:${row}`),
    ...input.holeObservation.reasons.map((row) => `CONT-HOLE-01:${row}`),
  ].sort();
  const lifecycleParentProposal = deepFreeze({
    schema: LAFEA_CONVERGENCE_LIFECYCLE_PARENT_PROPOSAL_SCHEMA,
    stageId: STAGE_ID,
    recoveryHash: null,
    recoverySetHash: input.holeObservation.recoverySetHash,
    convergenceProfileHash: holeManifest.semanticHash,
    status: 'PILOT_RECOVERY_PARENT_REQUIRED',
    registrationAuthorized: false,
  });
  const base = {
    schema: LAFEA_CONTINUUM_BENCHMARK_QUALIFICATION_SCHEMA,
    producerRevision: requireText(input.producerRevision, 'producerRevision'),
    exactHeadSha: commitSha(input.exactHeadSha),
    templateId: TEMPLATE_ID,
    stageId: STAGE_ID,
    mappingPackageHash: sha256(input.mappingPackageHash, 'mappingPackageHash'),
    patchManifest,
    patchObservation: input.patchObservation,
    holeManifest,
    holeObservation: input.holeObservation,
    status,
    reasons,
    lifecycleParentProposal,
    engineExecutionAuthorized: false,
    recoveryProduced: false,
    convergenceRegistered: false,
    codeAssessmentProduced: false,
    releaseQualified: false,
    generalT7dAuthorized: false,
    hashProfile: LAFEA_TEMPLATE_RELEASE_HASH_PROFILE,
  };
  return deepFreeze({ ...base, semanticHash: templateReleaseSha256(base) });
}

export function validateLafeaContinuumBenchmarkQualification(value) {
  return validateRebuild(
    value, QUALIFICATION_KEYS, QUALIFICATION_CREATE_KEYS,
    createLafeaContinuumBenchmarkQualification,
    'Continuum benchmark qualification',
  );
}

function requireManifestKind(value, kind) {
  requireValid(validateContinuumBenchmarkManifest(value), `${kind} manifest is invalid.`);
  if (value.kind !== kind) throw new TypeError(`Expected ${kind} manifest.`);
  return value;
}

function requireObservation(value, manifest) {
  requireValid(
    validateContinuumBenchmarkObservation(value, manifest),
    `${manifest.benchmarkId} observation is invalid.`,
  );
}

function evaluatePatch(manifest, value) {
  exactKeys(value, PATCH_OBSERVED_KEYS, 'Patch observation');
  const observed = {
    recoveryHash: sha256(value.recoveryHash, 'observed.recoveryHash'),
    meshHash: sha256(value.meshHash, 'observed.meshHash'),
    elementType: requireText(value.elementType, 'observed.elementType'),
    elementCount: positiveInteger(value.elementCount, 'observed.elementCount'),
    gaussPointsPerElement: positiveInteger(
      value.gaussPointsPerElement, 'observed.gaussPointsPerElement',
    ),
    freeNodeId: requireText(value.freeNodeId, 'observed.freeNodeId'),
    displacement: vector(value.displacement, 2, 'observed.displacement'),
    strain: vector(value.strain, 3, 'observed.strain'),
    stress: vector(value.stress, 3, 'observed.stress'),
  };
  const expected = manifest.expected;
  const tolerance = manifest.tolerances.recovery;
  const reasons = [];
  compareScalar(observed.elementType, expected.elementType,
    'PATCH_ELEMENT_TYPE_MISMATCH', reasons);
  compareScalar(observed.elementCount, expected.elementCount,
    'PATCH_ELEMENT_COUNT_MISMATCH', reasons);
  compareScalar(observed.gaussPointsPerElement, expected.gaussPointsPerElement,
    'PATCH_GAUSS_POINT_COUNT_MISMATCH', reasons);
  compareScalar(observed.freeNodeId, expected.freeNodeId,
    'PATCH_FREE_NODE_MISMATCH', reasons);
  compareVector(observed.displacement, expected.displacement, tolerance,
    'PATCH_DISPLACEMENT_MISMATCH', reasons);
  compareVector(observed.strain, expected.strain, tolerance,
    'PATCH_STRAIN_MISMATCH', reasons);
  compareVector(observed.stress, expected.stress, tolerance,
    'PATCH_STRESS_MISMATCH', reasons);
  return { observed, reasons };
}

function evaluateKirsch(manifest, value) {
  exactKeys(value, KIRSCH_OBSERVED_KEYS, 'Kirsch observation');
  if (!Array.isArray(value.levels) || value.levels.length !== 3) {
    throw new TypeError('Kirsch observation requires exactly three levels.');
  }
  const levels = value.levels.map((row, index) => {
    exactKeys(row, KIRSCH_LEVEL_OBSERVED_KEYS, `Kirsch level[${index}]`);
    return {
      ordinal: positiveInteger(row.ordinal, `levels[${index}].ordinal`),
      radialElements: positiveInteger(
        row.radialElements, `levels[${index}].radialElements`,
      ),
      circumferentialElements: positiveInteger(
        row.circumferentialElements, `levels[${index}].circumferentialElements`,
      ),
      meshHash: sha256(row.meshHash, `levels[${index}].meshHash`),
      recoveryHash: sha256(row.recoveryHash, `levels[${index}].recoveryHash`),
      peakFactor: finite(row.peakFactor, `levels[${index}].peakFactor`),
      fullFieldNormalizedError: nonNegative(
        row.fullFieldNormalizedError,
        `levels[${index}].fullFieldNormalizedError`,
      ),
    };
  });
  const reasons = [];
  const declared = manifest.expected.levels;
  levels.forEach((row, index) => {
    if (row.ordinal !== declared[index].ordinal
      || row.radialElements !== declared[index].radialElements
      || row.circumferentialElements !== declared[index].circumferentialElements) {
      reasons.push(`KIRSCH_LEVEL_${index + 1}_MESH_DEFINITION_MISMATCH`);
    }
  });
  if (new Set(levels.map((row) => row.meshHash)).size !== 3) {
    reasons.push('KIRSCH_MESH_HASHES_NOT_DISTINCT');
  }
  if (new Set(levels.map((row) => row.recoveryHash)).size !== 3) {
    reasons.push('KIRSCH_RECOVERY_HASHES_NOT_DISTINCT');
  }
  const target = manifest.expected.theoreticalPeakFactor;
  const peakErrors = levels.map((row) => Math.abs(row.peakFactor - target) / target);
  const requirements = manifest.expected.requirements;
  if (requirements.requirePeakImprovementFirstToFinest
    && !(peakErrors[2] < peakErrors[0])) {
    reasons.push('KIRSCH_PEAK_ERROR_NOT_IMPROVED');
  }
  if (peakErrors[2] > requirements.peakFinestRelativeErrorMax) {
    reasons.push('KIRSCH_FINEST_PEAK_ERROR_EXCEEDS_LIMIT');
  }
  if (requirements.requireStrictFieldMonotonicity
    && !(levels[1].fullFieldNormalizedError < levels[0].fullFieldNormalizedError
      && levels[2].fullFieldNormalizedError < levels[1].fullFieldNormalizedError)) {
    reasons.push('KIRSCH_FIELD_ERROR_NOT_STRICTLY_MONOTONIC');
  }
  if (levels[2].fullFieldNormalizedError
    > requirements.fullFieldFinestNormalizedErrorMax) {
    reasons.push('KIRSCH_FINEST_FIELD_ERROR_EXCEEDS_LIMIT');
  }
  return { observed: { levels }, reasons };
}

function normalizePatchExpected(value) {
  exactKeys(value, PATCH_EXPECTED_KEYS, 'Patch expected values');
  if (value.elementType !== 'Q8') throw new TypeError('Patch benchmark requires Q8.');
  return {
    elementType: 'Q8',
    elementCount: positiveInteger(value.elementCount, 'expected.elementCount'),
    gaussPointsPerElement: positiveInteger(
      value.gaussPointsPerElement, 'expected.gaussPointsPerElement',
    ),
    freeNodeId: requireText(value.freeNodeId, 'expected.freeNodeId'),
    displacement: vector(value.displacement, 2, 'expected.displacement'),
    strain: vector(value.strain, 3, 'expected.strain'),
    stress: vector(value.stress, 3, 'expected.stress'),
  };
}

function normalizeKirschExpected(value) {
  exactKeys(value, KIRSCH_EXPECTED_KEYS, 'Kirsch expected values');
  if (value.elementType !== 'Q8') throw new TypeError('Kirsch benchmark requires Q8.');
  if (value.outerBoundaryCondition
    !== 'EXACT_KIRSCH_TRACTION_ON_TRUNCATED_OUTER_BOUNDARY') {
    throw new TypeError('Kirsch outer-boundary authority is invalid.');
  }
  if (!Array.isArray(value.levels) || value.levels.length !== 3) {
    throw new TypeError('Kirsch manifest requires exactly three levels.');
  }
  const levels = value.levels.map((row, index) => {
    exactKeys(row, LEVEL_KEYS, `expected.levels[${index}]`);
    return {
      ordinal: positiveInteger(row.ordinal, `expected.levels[${index}].ordinal`),
      radialElements: positiveInteger(
        row.radialElements, `expected.levels[${index}].radialElements`,
      ),
      circumferentialElements: positiveInteger(
        row.circumferentialElements,
        `expected.levels[${index}].circumferentialElements`,
      ),
    };
  });
  if (levels.some((row, index) => row.ordinal !== index + 1)
    || !(levels[1].radialElements > levels[0].radialElements
      && levels[2].radialElements > levels[1].radialElements
      && levels[1].circumferentialElements > levels[0].circumferentialElements
      && levels[2].circumferentialElements > levels[1].circumferentialElements)) {
    throw new TypeError('Kirsch refinement levels must be strictly increasing and ordered.');
  }
  exactKeys(value.requirements, REQUIREMENT_KEYS, 'Kirsch requirements');
  const requirements = {
    peakFinestRelativeErrorMax: fraction(
      value.requirements.peakFinestRelativeErrorMax,
      'requirements.peakFinestRelativeErrorMax',
    ),
    fullFieldFinestNormalizedErrorMax: fraction(
      value.requirements.fullFieldFinestNormalizedErrorMax,
      'requirements.fullFieldFinestNormalizedErrorMax',
    ),
    requirePeakImprovementFirstToFinest: requireTrue(
      value.requirements.requirePeakImprovementFirstToFinest,
      'requirements.requirePeakImprovementFirstToFinest',
    ),
    requireStrictFieldMonotonicity: requireTrue(
      value.requirements.requireStrictFieldMonotonicity,
      'requirements.requireStrictFieldMonotonicity',
    ),
  };
  return {
    elementType: 'Q8',
    remoteStress: positive(value.remoteStress, 'expected.remoteStress'),
    theoreticalPeakFactor: positive(
      value.theoreticalPeakFactor, 'expected.theoreticalPeakFactor',
    ),
    outerBoundaryCondition: value.outerBoundaryCondition,
    levels,
    requirements,
  };
}

function normalizeTolerances(kind, value) {
  const expectedKeys = kind === 'ASSEMBLED_Q8_PATCH'
    ? PATCH_TOLERANCE_KEYS : KIRSCH_TOLERANCE_KEYS;
  exactKeys(value, expectedKeys, 'Benchmark tolerances');
  const key = expectedKeys[0];
  exactKeys(value[key], TOLERANCE_KEYS, `${key} tolerance`);
  return {
    [key]: {
      absolute: nonNegative(value[key].absolute, `${key}.absolute`),
      relative: nonNegative(value[key].relative, `${key}.relative`),
    },
  };
}

function requireBenchmarkId(value, kind) {
  const expected = kind === 'ASSEMBLED_Q8_PATCH' ? 'CONT-PATCH-01' : 'CONT-HOLE-01';
  if (value !== expected) throw new TypeError(`Benchmark ID must be ${expected}.`);
  return value;
}

function requireSourcePath(value, kind) {
  const expected = kind === 'ASSEMBLED_Q8_PATCH'
    ? 'scripts/lafea.3-benchmark-cont-patch-01-check.mjs'
    : 'scripts/lafea.3-benchmark-cont-hole-01-check.mjs';
  if (value !== expected) throw new TypeError(`Benchmark source path must be ${expected}.`);
  return value;
}

function requireIdentity(templateId, stageId) {
  if (templateId !== TEMPLATE_ID || stageId !== STAGE_ID) {
    throw new TypeError('B7B is restricted to C2D-LUG-PINHOLE -> LAFEA.3.');
  }
}

function compareScalar(actual, expected, reason, reasons) {
  if (actual !== expected) reasons.push(reason);
}

function compareVector(actual, expected, tolerance, reason, reasons) {
  const failed = actual.some((value, index) => {
    const limit = tolerance.absolute
      + tolerance.relative * Math.max(1, Math.abs(value), Math.abs(expected[index]));
    return Math.abs(value - expected[index]) > limit;
  });
  if (failed) reasons.push(reason);
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
    if (!isDeepFrozen(value)) throw new TypeError(`${label} must be deeply frozen.`);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function requireValid(validation, message) {
  if (!validation.ok) throw new TypeError(`${message} ${validation.errors.join(' ')}`);
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

function vector(value, count, label) {
  if (!Array.isArray(value) || value.length !== count) {
    throw new TypeError(`${label} must have ${count} components.`);
  }
  return value.map((row, index) => finite(row, `${label}[${index}]`));
}

function sha256(value, label) {
  if (typeof value !== 'string' || !SHA.test(value)) {
    throw new TypeError(`${label} must be canonical SHA-256.`);
  }
  return value;
}

function commitSha(value) {
  if (typeof value !== 'string' || !COMMIT.test(value)) {
    throw new TypeError('exactHeadSha must be a 40-character commit SHA.');
  }
  return value;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} is required.`);
  }
  return value;
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function nonNegative(value, label) {
  const result = finite(value, label);
  if (result < 0) throw new TypeError(`${label} must be non-negative.`);
  return result;
}

function positive(value, label) {
  const result = finite(value, label);
  if (!(result > 0)) throw new TypeError(`${label} must be positive.`);
  return result;
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return value;
}

function fraction(value, label) {
  const result = finite(value, label);
  if (result < 0 || result > 1) throw new TypeError(`${label} must be within [0, 1].`);
  return result;
}

function requireTrue(value, label) {
  if (value !== true) throw new TypeError(`${label} must be true.`);
  return true;
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
