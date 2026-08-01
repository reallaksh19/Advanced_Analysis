#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  LAFEA_LEGACY_ARTIFACT_KINDS,
  LAFEA_LEGACY_ARTIFACT_RECORD_SCHEMA,
  LAFEA_LEGACY_LIFECYCLE_SCHEMA,
  LAFEA_LIFECYCLE_SCHEMA,
  createLafeaArtifactRecord,
  createLafeaLifecycle,
  lafeaLifecycleReadiness,
  migrateLafeaLifecycleV1,
  registerLafeaArtifact,
} from '../src/workspace/lafea-lifecycle.js';
import {
  LAFEA_LIFECYCLE_PROFILE_SCHEMA,
  LAFEA_STAGE_LIFECYCLE_PROFILE_IDS,
  lafeaLifecycleArtifactKinds,
  requireLafeaLifecycleProfileForStage,
} from '../src/workspace/lafea-lifecycle-profiles.js';

const EXPECTED = Object.freeze({
  'LAFEA.1': 'ANALYTICAL_FOUNDATION_V1',
  'LAFEA.2': 'ANALYTICAL_SCREENING_V1',
  'LAFEA.3': 'FEA_MESH_RECOVERY_V1',
  'LAFEA.4': 'FEA_MESH_RECOVERY_V1',
  'LAFEA.5': 'FEA_MESH_RECOVERY_V1',
  'LAFEA.6': 'UNSUPPORTED_STAGE_V1',
});
const LEGACY_PARENT_KEYS = {
  CANONICAL_MODEL: ['sourceHash'],
  ANALYSIS_GEOMETRY: ['sourceHash', 'canonicalModelHash'],
  ANALYSIS_MESH: ['analysisGeometryHash', 'meshProfileHash'],
  EXECUTION: ['canonicalModelHash', 'meshHash', 'physicalLoadCaseHash', 'solverProfileHash'],
  RECOVERY: ['executionHash', 'meshHash', 'recoveryProfileHash'],
  CONVERGENCE: ['recoveryHash', 'recoverySetHash', 'convergenceProfileHash'],
  CODE_ASSESSMENT: [
    'sourceHash', 'canonicalModelHash', 'meshHash', 'executionHash', 'recoveryHash',
    'convergenceHash', 'codeProfileHash', 'allowableSourceHash', 'classificationProfileHash',
  ],
  REPORT_EVIDENCE: [
    'sourceHash', 'canonicalModelHash', 'meshHash', 'executionHash', 'recoveryHash',
    'convergenceHash', 'codeAssessmentHash', 'reportProfileHash',
  ],
};

assert.deepEqual(LAFEA_STAGE_LIFECYCLE_PROFILE_IDS, EXPECTED);
for (const [stageId, profileId] of Object.entries(EXPECTED)) {
  const profile = requireLafeaLifecycleProfileForStage(stageId);
  assert.equal(profile.schema, LAFEA_LIFECYCLE_PROFILE_SCHEMA);
  assert.equal(profile.profileId, profileId);
  assert.deepEqual(lafeaLifecycleArtifactKinds(stageId), profile.artifactKinds);
}
assert.deepEqual(lafeaLifecycleArtifactKinds('LAFEA.1'), [
  'CANONICAL_MODEL', 'EXECUTION', 'RESULT_EVIDENCE',
  'FOUNDATION_DISTRIBUTION', 'REPORT_EVIDENCE',
]);
assert.deepEqual(lafeaLifecycleArtifactKinds('LAFEA.2'), [
  'CANONICAL_MODEL', 'EXECUTION', 'RESULT_EVIDENCE',
  'SCREENING_ASSESSMENT', 'REPORT_EVIDENCE',
]);
assert.deepEqual(lafeaLifecycleArtifactKinds('LAFEA.3'), [
  'CANONICAL_MODEL', 'ANALYSIS_GEOMETRY', 'ANALYSIS_MESH',
  'EXECUTION', 'RECOVERY', 'CONVERGENCE', 'REPORT_EVIDENCE',
]);
assert.deepEqual(lafeaLifecycleArtifactKinds('LAFEA.6'), []);

let lifecycle = createLafeaLifecycle('LAFEA.1', 'sha256:f-source');
lifecycle = add(lifecycle, 'CANONICAL_MODEL', 'sha256:f-model', { sourceHash: 'sha256:f-source' });
lifecycle = add(lifecycle, 'EXECUTION', 'sha256:f-exec', {
  canonicalModelHash: 'sha256:f-model', physicalLoadCaseHash: 'sha256:f-loads',
  solverProfileHash: 'sha256:f-solver',
});
lifecycle = add(lifecycle, 'RESULT_EVIDENCE', 'sha256:f-result', {
  canonicalModelHash: 'sha256:f-model', executionHash: 'sha256:f-exec',
  resultProfileHash: 'sha256:f-result-profile',
});
lifecycle = add(lifecycle, 'FOUNDATION_DISTRIBUTION', 'sha256:f-distribution', {
  sourceHash: 'sha256:f-source', canonicalModelHash: 'sha256:f-model',
  executionHash: 'sha256:f-exec', resultEvidenceHash: 'sha256:f-result',
  productProfileHash: 'sha256:f-product-profile',
});
lifecycle = add(lifecycle, 'REPORT_EVIDENCE', 'sha256:f-report', {
  sourceHash: 'sha256:f-source', canonicalModelHash: 'sha256:f-model',
  executionHash: 'sha256:f-exec', resultEvidenceHash: 'sha256:f-result',
  reportProfileHash: 'sha256:f-report-profile',
});
let readiness = lafeaLifecycleReadiness(lifecycle);
assert.equal(readiness.meshApplicable, false);
assert.equal(readiness.resultReady, true);
assert.equal(readiness.codeAssessmentApplicable, false);
assert.equal(readiness.codeReady, false);
assert.equal(readiness.reportQualified, true);
assert.equal(lifecycle.artifacts.FOUNDATION_DISTRIBUTION.status, 'CURRENT');

let screening = createLafeaLifecycle('LAFEA.2', 'sha256:s-source');
screening = add(screening, 'CANONICAL_MODEL', 'sha256:s-model', { sourceHash: 'sha256:s-source' });
screening = add(screening, 'EXECUTION', 'sha256:s-exec', {
  canonicalModelHash: 'sha256:s-model', physicalLoadCaseHash: 'sha256:s-loads',
  solverProfileHash: 'sha256:s-solver',
});
screening = add(screening, 'RESULT_EVIDENCE', 'sha256:s-result', {
  canonicalModelHash: 'sha256:s-model', executionHash: 'sha256:s-exec',
  resultProfileHash: 'sha256:s-result-profile',
});
screening = add(screening, 'SCREENING_ASSESSMENT', 'sha256:s-assess', {
  sourceHash: 'sha256:s-source', canonicalModelHash: 'sha256:s-model',
  executionHash: 'sha256:s-exec', resultEvidenceHash: 'sha256:s-result',
  productProfileHash: 'sha256:s-profile',
});
readiness = lafeaLifecycleReadiness(screening);
assert.equal(readiness.resultReady, true);
assert.equal(readiness.assessmentApplicable, true);
assert.equal(readiness.assessmentReady, true);

let fea = createLafeaLifecycle('LAFEA.3', 'sha256:e-source');
fea = add(fea, 'CANONICAL_MODEL', 'sha256:e-model', { sourceHash: 'sha256:e-source' });
fea = add(fea, 'ANALYSIS_GEOMETRY', 'sha256:e-geometry', {
  sourceHash: 'sha256:e-source', canonicalModelHash: 'sha256:e-model',
});
fea = add(fea, 'ANALYSIS_MESH', 'sha256:e-mesh', {
  analysisGeometryHash: 'sha256:e-geometry', meshProfileHash: 'sha256:e-mesh-profile',
});
fea = add(fea, 'EXECUTION', 'sha256:e-exec', {
  canonicalModelHash: 'sha256:e-model', meshHash: 'sha256:e-mesh',
  physicalLoadCaseHash: 'sha256:e-loads', solverProfileHash: 'sha256:e-solver',
});
fea = add(fea, 'RECOVERY', 'sha256:e-recovery', {
  executionHash: 'sha256:e-exec', meshHash: 'sha256:e-mesh',
  recoveryProfileHash: 'sha256:e-recovery-profile',
});
readiness = lafeaLifecycleReadiness(fea);
assert.equal(readiness.meshApplicable, true);
assert.equal(readiness.meshQualified, true);
assert.equal(readiness.resultReady, true);
assert.equal(readiness.convergenceApplicable, true);
assert.equal(readiness.convergenceReady, false);
assert.equal(readiness.codeAssessmentApplicable, false);

const weld = createLafeaLifecycle('LAFEA.6', 'sha256:weld-source');
assert.deepEqual(weld.artifacts, {});
assert.deepEqual(lafeaLifecycleReadiness(weld).blockingReasons, ['STAGE_ENGINE_NOT_IMPLEMENTED']);
for (const stageId of Object.keys(EXPECTED)) {
  const migrated = migrateLafeaLifecycleV1(emptyLegacy(stageId));
  assert.equal(migrated.schema, LAFEA_LIFECYCLE_SCHEMA);
  assert.equal(migrated.profileId, EXPECTED[stageId]);
  assert.deepEqual(Object.keys(migrated.artifacts), lafeaLifecycleArtifactKinds(stageId));
  assert.equal(Object.values(migrated.artifacts).every((row) => row.status === 'ABSENT'), true);
}
assert.throws(() => createLafeaArtifactRecord({
  stageId: 'LAFEA.1', kind: 'ANALYSIS_MESH', status: 'CURRENT',
  artifactHash: 'sha256:invalid', parentHashes: {}, qualification: 'PASS',
  producerRef: 'NB-T1/INVALID', diagnostics: [],
}), (error) => error?.code === 'LAFEA_ARTIFACT_KIND_NOT_AUTHORIZED_FOR_PROFILE');

console.log(JSON.stringify({
  check: 'lafea-nonbucket-lifecycle-profiles', status: 'PASS',
  lifecycleSchema: LAFEA_LIFECYCLE_SCHEMA, profileSchema: LAFEA_LIFECYCLE_PROFILE_SCHEMA,
  stageProfiles: EXPECTED, analyticalStagesRequireMesh: false,
  analyticalProductArtifactsAuthorized: true,
  feaStagesRequireRecoveryForResultReady: true,
  currentStagesAuthorizeCodeAssessment: false, unsupportedStageArtifactSlots: 0,
  legacyMigrationSynthesizesEvidence: false, numericalAuthorityChanged: false,
  lifecycleSemanticsChanged: true, shellAuthorityChanged: false, lafea6Enabled: false,
}));

function add(value, kind, artifactHash, parentHashes) {
  return registerLafeaArtifact(value, createLafeaArtifactRecord({
    stageId: value.stageId, profileId: value.profileId, kind, status: 'CURRENT',
    artifactHash, parentHashes, qualification: 'PASS',
    producerRef: `NB-T1/${kind}/v1`, diagnostics: [],
  }), `NB-T1-${value.stageId}-${kind}`);
}
function emptyLegacy(stageId) {
  return {
    schema: LAFEA_LEGACY_LIFECYCLE_SCHEMA, stageId,
    source: { status: 'CURRENT', sourceHash: `sha256:${stageId}-legacy` },
    artifacts: Object.fromEntries(LAFEA_LEGACY_ARTIFACT_KINDS.map((kind) => [kind, {
      schema: LAFEA_LEGACY_ARTIFACT_RECORD_SCHEMA, stageId, kind, status: 'ABSENT',
      artifactHash: null,
      parentHashes: Object.fromEntries(LEGACY_PARENT_KEYS[kind].map((key) => [key, null])),
      qualification: 'NOT_EVALUATED', producerRef: null, diagnostics: [],
    }])),
    display: { displayMeshDensityHash: null, contourPaletteHash: null, reportRenderProfileHash: null },
    lastEvent: null, lastRegistration: null, diagnostics: [],
  };
}
