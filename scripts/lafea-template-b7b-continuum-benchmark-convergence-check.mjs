#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import {
  createContinuumBenchmarkManifest,
  createContinuumBenchmarkObservation,
  createLafeaContinuumBenchmarkQualification,
  validateContinuumBenchmarkManifest,
  validateContinuumBenchmarkObservation,
  validateLafeaContinuumBenchmarkQualification,
} from '../src/core/lafea-application-templates/continuum-benchmark-convergence.js';

const PATCH_PATH = 'scripts/lafea.3-benchmark-cont-patch-01-check.mjs';
const HOLE_PATH = 'scripts/lafea.3-benchmark-cont-hole-01-check.mjs';
const exactHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
let negativeCount = 0;

sourceGuards();

const patchManifest = createContinuumBenchmarkManifest({
  benchmarkId: 'CONT-PATCH-01',
  templateId: 'C2D-LUG-PINHOLE',
  stageId: 'LAFEA.3',
  kind: 'ASSEMBLED_Q8_PATCH',
  sourcePath: PATCH_PATH,
  sourceHash: fileHash(PATCH_PATH),
  expectedValueAuthority: 'FROZEN_BEFORE_OBSERVED_EVIDENCE_CONSUMPTION',
  expected: {
    elementType: 'Q8',
    elementCount: 2,
    gaussPointsPerElement: 9,
    freeNodeId: 'F',
    displacement: [0.05, -0.015],
    strain: [0.001, -0.0003, 0],
    stress: [200, 0, 0],
  },
  tolerances: { recovery: { absolute: 0, relative: 1e-10 } },
});

const holeManifest = createContinuumBenchmarkManifest({
  benchmarkId: 'CONT-HOLE-01',
  templateId: 'C2D-LUG-PINHOLE',
  stageId: 'LAFEA.3',
  kind: 'KIRSCH_Q8_THREE_LEVEL',
  sourcePath: HOLE_PATH,
  sourceHash: fileHash(HOLE_PATH),
  expectedValueAuthority: 'FROZEN_BEFORE_OBSERVED_EVIDENCE_CONSUMPTION',
  expected: {
    elementType: 'Q8',
    remoteStress: 50,
    theoreticalPeakFactor: 3,
    outerBoundaryCondition: 'EXACT_KIRSCH_TRACTION_ON_TRUNCATED_OUTER_BOUNDARY',
    levels: [
      { ordinal: 1, radialElements: 3, circumferentialElements: 6 },
      { ordinal: 2, radialElements: 6, circumferentialElements: 12 },
      { ordinal: 3, radialElements: 10, circumferentialElements: 20 },
    ],
    requirements: {
      peakFinestRelativeErrorMax: 0.05,
      fullFieldFinestNormalizedErrorMax: 0.05,
      requirePeakImprovementFirstToFinest: true,
      requireStrictFieldMonotonicity: true,
    },
  },
  tolerances: { comparison: { absolute: 0, relative: 0 } },
});

assert.equal(validateContinuumBenchmarkManifest(patchManifest).ok, true);
assert.equal(validateContinuumBenchmarkManifest(holeManifest).ok, true);
assert.equal(patchManifest.expected.stress[0], 200);
assert.equal(holeManifest.expected.theoreticalPeakFactor, 3);
assert.equal(holeManifest.expected.remoteStress, 50);
assert.equal(holeManifest.expected.levels.length, 3);

const patchObservation = patchPassObservation();
const holeObservation = holePassObservation();
assert.equal(patchObservation.status, 'PASS');
assert.equal(holeObservation.status, 'PASS');
assert.deepEqual(patchObservation.reasons, []);
assert.deepEqual(holeObservation.reasons, []);
assert.match(holeObservation.recoverySetHash, /^sha256:[0-9a-f]{64}$/u);
assert.equal(
  validateContinuumBenchmarkObservation(patchObservation, patchManifest).ok,
  true,
);
assert.equal(
  validateContinuumBenchmarkObservation(holeObservation, holeManifest).ok,
  true,
);

const qualification = createLafeaContinuumBenchmarkQualification({
  producerRevision: 'B7B.1',
  exactHeadSha: exactHead,
  mappingPackageHash: hash('B7A-MAPPING-PACKAGE'),
  patchManifest,
  patchObservation,
  holeManifest,
  holeObservation,
});
assert.equal(qualification.status, 'BENCHMARK_EVIDENCE_QUALIFIED');
assert.deepEqual(qualification.reasons, []);
assert.equal(qualification.lifecycleParentProposal.recoveryHash, null);
assert.equal(
  qualification.lifecycleParentProposal.recoverySetHash,
  holeObservation.recoverySetHash,
);
assert.equal(
  qualification.lifecycleParentProposal.convergenceProfileHash,
  holeManifest.semanticHash,
);
assert.equal(
  qualification.lifecycleParentProposal.status,
  'PILOT_RECOVERY_PARENT_REQUIRED',
);
assert.equal(qualification.lifecycleParentProposal.registrationAuthorized, false);
assert.equal(qualification.engineExecutionAuthorized, false);
assert.equal(qualification.recoveryProduced, false);
assert.equal(qualification.convergenceRegistered, false);
assert.equal(qualification.codeAssessmentProduced, false);
assert.equal(qualification.releaseQualified, false);
assert.equal(qualification.generalT7dAuthorized, false);
assert.equal(validateLafeaContinuumBenchmarkQualification(qualification).ok, true);
assert.ok(Object.isFrozen(qualification));
assert.ok(Object.isFrozen(qualification.holeObservation.observed.levels));

const stalePatch = createContinuumBenchmarkObservation({
  manifest: patchManifest,
  sourceHash: hash('STALE-PATCH-SOURCE'),
  observed: patchObservedValues(),
});
assert.equal(stalePatch.status, 'STALE');
assert.equal(stalePatch.reasons.includes('BENCHMARK_SOURCE_HASH_STALE'), true);

const patchStressFailure = createContinuumBenchmarkObservation({
  manifest: patchManifest,
  sourceHash: patchManifest.sourceHash,
  observed: { ...patchObservedValues(), stress: [199, 0, 0] },
});
assert.equal(patchStressFailure.status, 'BLOCKED');
assert.equal(patchStressFailure.reasons.includes('PATCH_STRESS_MISMATCH'), true);

const nonMonotonicHole = createContinuumBenchmarkObservation({
  manifest: holeManifest,
  sourceHash: holeManifest.sourceHash,
  observed: {
    levels: holeLevels().map((row, index) => ({
      ...row,
      fullFieldNormalizedError: [0.12, 0.13, 0.03][index],
    })),
  },
});
assert.equal(nonMonotonicHole.status, 'BLOCKED');
assert.equal(nonMonotonicHole.reasons
  .includes('KIRSCH_FIELD_ERROR_NOT_STRICTLY_MONOTONIC'), true);

const peakFailure = createContinuumBenchmarkObservation({
  manifest: holeManifest,
  sourceHash: holeManifest.sourceHash,
  observed: {
    levels: holeLevels().map((row, index) => ({
      ...row,
      peakFactor: [2.9, 2.8, 2.7][index],
    })),
  },
});
assert.equal(peakFailure.status, 'BLOCKED');
assert.equal(peakFailure.reasons.includes('KIRSCH_PEAK_ERROR_NOT_IMPROVED'), true);
assert.equal(peakFailure.reasons
  .includes('KIRSCH_FINEST_PEAK_ERROR_EXCEEDS_LIMIT'), true);

const fieldLimitFailure = createContinuumBenchmarkObservation({
  manifest: holeManifest,
  sourceHash: holeManifest.sourceHash,
  observed: {
    levels: holeLevels().map((row, index) => ({
      ...row,
      fullFieldNormalizedError: [0.12, 0.08, 0.06][index],
    })),
  },
});
assert.equal(fieldLimitFailure.status, 'BLOCKED');
assert.equal(fieldLimitFailure.reasons
  .includes('KIRSCH_FINEST_FIELD_ERROR_EXCEEDS_LIMIT'), true);

const blockedQualification = createLafeaContinuumBenchmarkQualification({
  producerRevision: 'B7B.1',
  exactHeadSha: exactHead,
  mappingPackageHash: hash('B7A-MAPPING-PACKAGE'),
  patchManifest,
  patchObservation: patchStressFailure,
  holeManifest,
  holeObservation,
});
assert.equal(blockedQualification.status, 'BENCHMARK_EVIDENCE_BLOCKED');
assert.equal(blockedQualification.reasons
  .includes('CONT-PATCH-01:PATCH_STRESS_MISMATCH'), true);

const staleQualification = createLafeaContinuumBenchmarkQualification({
  producerRevision: 'B7B.1',
  exactHeadSha: exactHead,
  mappingPackageHash: hash('B7A-MAPPING-PACKAGE'),
  patchManifest,
  patchObservation: stalePatch,
  holeManifest,
  holeObservation,
});
assert.equal(staleQualification.status, 'BENCHMARK_EVIDENCE_STALE');

negative('changed frozen patch expected stress', () => createContinuumBenchmarkManifest({
  ...manifestInput(patchManifest),
  expected: { ...structuredClone(patchManifest.expected), stress: [201, 0, 0] },
  expectedValueAuthority: 'OBSERVED_OUTPUT_DERIVED',
}));
negative('wrong Kirsch boundary authority', () => createContinuumBenchmarkManifest({
  ...manifestInput(holeManifest),
  expected: {
    ...structuredClone(holeManifest.expected),
    outerBoundaryCondition: 'UNIFORM_REMOTE_STRESS_APPROXIMATION',
  },
}));
negative('two-level Kirsch manifest', () => createContinuumBenchmarkManifest({
  ...manifestInput(holeManifest),
  expected: {
    ...structuredClone(holeManifest.expected),
    levels: structuredClone(holeManifest.expected.levels.slice(0, 2)),
  },
}));
negative('non-increasing Kirsch refinement', () => createContinuumBenchmarkManifest({
  ...manifestInput(holeManifest),
  expected: {
    ...structuredClone(holeManifest.expected),
    levels: structuredClone(holeManifest.expected.levels).map((row, index) =>
      index === 2 ? { ...row, radialElements: 6 } : row),
  },
}));
negative('missing Kirsch observation level', () => createContinuumBenchmarkObservation({
  manifest: holeManifest,
  sourceHash: holeManifest.sourceHash,
  observed: { levels: holeLevels().slice(0, 2) },
}));
negative('duplicate Kirsch mesh hashes', () => {
  const levels = holeLevels();
  levels[1].meshHash = levels[0].meshHash;
  const result = createContinuumBenchmarkObservation({
    manifest: holeManifest,
    sourceHash: holeManifest.sourceHash,
    observed: { levels },
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reasons.includes('KIRSCH_MESH_HASHES_NOT_DISTINCT'), true);
  throw new TypeError('expected adversarial rejection');
});
negative('tampered patch manifest', () => validateOrThrowManifest({
  ...patchManifest,
  semanticHash: hash('TAMPERED-MANIFEST'),
}));
negative('mutable patch observation', () => validateOrThrowObservation(
  structuredClone(patchObservation), patchManifest,
));
negative('tampered qualification', () => validateOrThrowQualification({
  ...qualification,
  releaseQualified: true,
}));
negative('mutable qualification', () => validateOrThrowQualification(
  structuredClone(qualification),
));
negative('invalid exact head', () => createLafeaContinuumBenchmarkQualification({
  ...qualificationInput(qualification),
  exactHeadSha: 'not-a-sha',
}));
negative('swapped benchmark kinds', () => createLafeaContinuumBenchmarkQualification({
  ...qualificationInput(qualification),
  patchManifest: holeManifest,
  patchObservation: holeObservation,
  holeManifest: patchManifest,
  holeObservation: patchObservation,
}));

console.log(JSON.stringify({
  schema: 'lafea-template-b7b-continuum-benchmark-convergence-check/v1',
  status: 'PASS',
  exactHead,
  benchmarkIds: ['CONT-PATCH-01', 'CONT-HOLE-01'],
  sourceHashes: [patchManifest.sourceHash, holeManifest.sourceHash],
  expectedValuesFrozenBeforeObservation: true,
  convergenceLevels: 3,
  observedValuesAreEvaluatorFixturesOnly: true,
  productionBenchmarkExecutedByThisCheck: false,
  negativeTestCount: negativeCount,
  qualificationStatus: qualification.status,
  lifecycleParentProposalStatus:
    qualification.lifecycleParentProposal.status,
  authority: {
    engineExecutionAuthorized: false,
    recoveryProduced: false,
    convergenceRegistered: false,
    codeAssessmentProduced: false,
    releaseQualified: false,
    generalT7dAuthorized: false,
  },
}));

function patchPassObservation() {
  return createContinuumBenchmarkObservation({
    manifest: patchManifest,
    sourceHash: patchManifest.sourceHash,
    observed: patchObservedValues(),
  });
}

function patchObservedValues() {
  return {
    recoveryHash: hash('PATCH-RECOVERY'),
    meshHash: hash('PATCH-MESH'),
    elementType: 'Q8',
    elementCount: 2,
    gaussPointsPerElement: 9,
    freeNodeId: 'F',
    displacement: [0.05, -0.015],
    strain: [0.001, -0.0003, 0],
    stress: [200, 0, 0],
  };
}

function holePassObservation() {
  return createContinuumBenchmarkObservation({
    manifest: holeManifest,
    sourceHash: holeManifest.sourceHash,
    observed: { levels: holeLevels() },
  });
}

function holeLevels() {
  return [
    level(1, 3, 6, 2.70, 0.12),
    level(2, 6, 12, 2.90, 0.07),
    level(3, 10, 20, 2.98, 0.03),
  ];
}

function level(ordinal, radialElements, circumferentialElements,
  peakFactor, fullFieldNormalizedError) {
  return {
    ordinal,
    radialElements,
    circumferentialElements,
    meshHash: hash(`HOLE-MESH-${ordinal}`),
    recoveryHash: hash(`HOLE-RECOVERY-${ordinal}`),
    peakFactor,
    fullFieldNormalizedError,
  };
}

function manifestInput(value) {
  return {
    benchmarkId: value.benchmarkId,
    templateId: value.templateId,
    stageId: value.stageId,
    kind: value.kind,
    sourcePath: value.sourcePath,
    sourceHash: value.sourceHash,
    expectedValueAuthority: value.expectedValueAuthority,
    expected: structuredClone(value.expected),
    tolerances: structuredClone(value.tolerances),
  };
}

function qualificationInput(value) {
  return {
    producerRevision: value.producerRevision,
    exactHeadSha: value.exactHeadSha,
    mappingPackageHash: value.mappingPackageHash,
    patchManifest: value.patchManifest,
    patchObservation: value.patchObservation,
    holeManifest: value.holeManifest,
    holeObservation: value.holeObservation,
  };
}

function fileHash(filePath) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function hash(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function sourceGuards() {
  const source = fs.readFileSync(
    'src/core/lafea-application-templates/continuum-benchmark-convergence.js',
    'utf8',
  );
  assert.doesNotMatch(source, /\bexecuteLafeaStage\s*\(/u);
  assert.doesNotMatch(source, /\bcalculateLocalContinuum\s*\(/u);
  assert.doesNotMatch(source, /\bregisterLafeaArtifact\s*\(/u);
  assert.doesNotMatch(source, /from ['"][^'"]*(?:workspace|local-continuum|recovery|render)[^'"]*['"]/u);
}

function validateOrThrowManifest(value) {
  const validation = validateContinuumBenchmarkManifest(value);
  if (!validation.ok) throw new TypeError(validation.errors.join(' '));
  return value;
}

function validateOrThrowObservation(value, manifest) {
  const validation = validateContinuumBenchmarkObservation(value, manifest);
  if (!validation.ok) throw new TypeError(validation.errors.join(' '));
  return value;
}

function validateOrThrowQualification(value) {
  const validation = validateLafeaContinuumBenchmarkQualification(value);
  if (!validation.ok) throw new TypeError(validation.errors.join(' '));
  return value;
}

function negative(label, body) {
  negativeCount += 1;
  assert.throws(body, undefined, label);
}
