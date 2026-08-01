#!/usr/bin/env node
import assert from 'node:assert/strict';
import { sourceFixture as attachmentFixture } from './lafea.1-fixtures.mjs';
import { rawRequestFixture as screeningFixture } from './lafea.2-fixtures.mjs';
import { triangleSource as continuumFixture } from './lafea.3-fixtures.mjs';
import { triangleSource as shellFixture } from './lafea.4-fixtures.mjs';
import { workflowSource as trunnionFixture } from './lafea.5-fixtures.mjs';
import {
  LAFEA_CANONICAL_SHA256_PROFILE,
  LAFEA_SOURCE_AUTHORITY_SCHEMA,
  canonicalLafeaSha256,
  createLafeaArtifactRecord,
  createLafeaWorkbenchStore,
  issueLafeaSourceAuthority,
  registerLafeaArtifact,
} from '../src/workspace/lafea-workbench.js';

assert.equal(
  canonicalLafeaSha256(null),
  'sha256:74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
);
assert.equal(
  canonicalLafeaSha256({ b: 1, a: 2 }),
  canonicalLafeaSha256({ a: 2, b: 1 }),
);
assert.notEqual(canonicalLafeaSha256([1, 2]), canonicalLafeaSha256([2, 1]));
assert.throws(() => canonicalLafeaSha256({ value: Number.NaN }), /non-finite/u);

const authoritySource = continuumFixture();
authoritySource.meshConfig = { targetSize: 999 };
const authorityA = issueLafeaSourceAuthority('LAFEA.3', authoritySource, 'NB-T2-CHECK');
const authorityB = issueLafeaSourceAuthority('LAFEA.3', {
  ...authoritySource,
  meshConfig: { targetSize: 1 },
}, 'NB-T2-CHECK');
assert.equal(authorityA.schema, LAFEA_SOURCE_AUTHORITY_SCHEMA);
assert.equal(authorityA.canonicalizationProfile, LAFEA_CANONICAL_SHA256_PROFILE);
assert.match(authorityA.sourceHash, /^sha256:[0-9a-f]{64}$/u);
assert.match(authorityA.documentRevisionDigest, /^fnv1a64:[0-9a-f]{16}$/u);
assert.equal(authorityA.sourceHash, authorityB.sourceHash);
assert.notEqual(authorityA.documentRevisionDigest, authorityB.documentRevisionDigest);

const fixtures = Object.freeze({
  'LAFEA.1': attachmentFixture,
  'LAFEA.2': screeningFixture,
  'LAFEA.3': continuumFixture,
  'LAFEA.4': shellFixture,
  'LAFEA.5': trunnionFixture,
});

for (const [stageId, fixture] of Object.entries(fixtures)) {
  const store = createLafeaWorkbenchStore({ initialStage: stageId, initialDocument: fixture() });
  let stage = store.getState().stages[stageId];
  assert.equal(stage.lifecycle, null, `${stageId} import must not claim producer evidence.`);
  assert.equal(stage.lifecycleReadiness.calculationState, 'CALCULATION_NOT_RUN');
  store.run();
  stage = store.getState().stages[stageId];
  assert.equal(stage.execution.status, 'QUALIFIED', `${stageId} calculation must qualify.`);
  assert.equal(
    stage.lifecycleReadiness.calculationState,
    'CALCULATION_ACCEPTED_BY_STAGE_CONTRACT',
  );
  assert.equal(stage.lifecycleReadiness.resultState, 'RESULT_READY');
  assert.equal(stage.lifecycleReadiness.resultReady, true);
  assert.equal(stage.lifecycleReadiness.codeState, 'CODE_NOT_READY');
  assert.equal(stage.lifecycleReadiness.releaseState, 'RELEASE_NOT_QUALIFIED');
  assert.equal(stage.lifecycleReadiness.codeReady, false);
  assert.ok(stage.sourceAuthority);
  assert.match(stage.sourceAuthority.sourceHash, /^sha256:[0-9a-f]{64}$/u);
  for (const artifact of Object.values(stage.lifecycle.artifacts)) {
    if (artifact.status === 'CURRENT') {
      assert.match(artifact.artifactHash, /^sha256:[0-9a-f]{64}$/u);
      assert.doesNotMatch(artifact.artifactHash, /^fnv/u);
      for (const parentHash of Object.values(artifact.parentHashes)) {
        assert.match(parentHash, /^sha256:[0-9a-f]{64}$/u);
      }
      assert.match(artifact.producerRef, /^NB-T2\//u);
    }
  }
  if (stageId === 'LAFEA.1' || stageId === 'LAFEA.2') {
    assert.equal(stage.lifecycleReadiness.meshApplicable, false);
    assert.equal('ANALYSIS_MESH' in stage.lifecycle.artifacts, false);
  } else {
    assert.equal(stage.lifecycleReadiness.meshApplicable, true);
    assert.equal(stage.lifecycle.artifacts.ANALYSIS_MESH.status, 'CURRENT');
    assert.equal(stage.lifecycle.artifacts.RECOVERY.status, 'CURRENT');
    assert.equal(stage.lifecycle.artifacts.CONVERGENCE.status, 'ABSENT');
  }
  if (stageId === 'LAFEA.2') {
    assert.equal(stage.lifecycleReadiness.assessmentReady, true);
    assert.equal(stage.lifecycle.artifacts.SCREENING_ASSESSMENT.status, 'CURRENT');
  }
  store.destroy();
}

const editStore = createLafeaWorkbenchStore({
  initialStage: 'LAFEA.3',
  initialDocument: continuumFixture(),
});
editStore.run();
let state = editStore.getState();
let stage = state.stages['LAFEA.3'];
const originalSourceHash = stage.sourceAuthority.sourceHash;
const material = stage.document.materials[0];
editStore.setScalar(
  'LAFEA.3.material.elasticModulus',
  material.materialId,
  String(material.elasticModulus * 1.01),
  'NB-T2-CHECK',
);
stage = editStore.getState().stages['LAFEA.3'];
assert.notEqual(stage.sourceAuthority.sourceHash, originalSourceHash);
assert.equal(stage.lastSourceAuthorityEvent.changeClass, 'MATERIAL_PROPERTY');
assert.equal(stage.lifecycle.artifacts.CANONICAL_MODEL.status, 'STALE');
assert.equal(stage.lifecycle.artifacts.ANALYSIS_GEOMETRY.status, 'REVALIDATION_REQUIRED');
assert.equal(stage.lifecycle.artifacts.ANALYSIS_MESH.status, 'REVALIDATION_REQUIRED');
for (const kind of ['EXECUTION', 'RECOVERY']) {
  assert.equal(stage.lifecycle.artifacts[kind].status, 'STALE');
}
assert.equal(stage.lifecycleReadiness.resultState, 'RESULT_NOT_READY');

editStore.undo();
stage = editStore.getState().stages['LAFEA.3'];
assert.equal(stage.lastSourceAuthorityEvent.changeClass, 'MATERIAL_PROPERTY');
assert.equal(stage.lifecycleReadiness.resultReady, false);
assert.equal(stage.lifecycle.source.sourceHash, originalSourceHash);
assert.equal(stage.lifecycle.artifacts.CANONICAL_MODEL.status, 'STALE',
  'Undo may restore the source hash but must not resurrect prior evidence.');
editStore.redo();
stage = editStore.getState().stages['LAFEA.3'];
assert.equal(stage.lastSourceAuthorityEvent.changeClass, 'MATERIAL_PROPERTY');
assert.equal(stage.lifecycleReadiness.resultReady, false);

const lifecycle = stage.lifecycle;
const currentModel = lifecycle.artifacts.CANONICAL_MODEL;
assert.throws(() => registerLafeaArtifact(lifecycle, createLafeaArtifactRecord({
  stageId: 'LAFEA.3',
  kind: 'ANALYSIS_GEOMETRY',
  status: 'CURRENT',
  artifactHash: canonicalLafeaSha256({ invalid: 'geometry' }),
  parentHashes: {
    sourceHash: canonicalLafeaSha256({ invalid: 'source' }),
    canonicalModelHash: currentModel.artifactHash,
  },
  qualification: 'PASS',
  producerRef: 'NB-T2/NEGATIVE',
  diagnostics: [],
}), 'NB-T2-NEGATIVE'), (error) => error?.code === 'LAFEA_ARTIFACT_PARENT_MISMATCH');
editStore.destroy();

const weldStore = createLafeaWorkbenchStore({
  initialStage: 'LAFEA.6',
  initialDocument: { schema: 'lafea-weld-profile-placeholder/v1', identity: 'WELD-NOT-IMPLEMENTED' },
});
weldStore.run();
const weld = weldStore.getState().stages['LAFEA.6'];
assert.equal(weld.execution.status, 'BLOCKED');
assert.equal(weld.lifecycle, null);
assert.equal(weld.lifecycleReadiness.resultState, 'RESULT_NOT_READY');
assert.equal(weld.lifecycleReadiness.releaseState, 'RELEASE_NOT_QUALIFIED');
weldStore.destroy();

console.log(JSON.stringify({
  check: 'lafea-nb-t2-source-and-producer-integration',
  status: 'PASS',
  sourceAuthoritySchema: LAFEA_SOURCE_AUTHORITY_SCHEMA,
  engineeringHashProfile: LAFEA_CANONICAL_SHA256_PROFILE,
  engineeringHashesUseFNV: false,
  typedSourceEvents: true,
  exactParentHashEnforcement: true,
  undoRedoResurrectsEvidence: false,
  acceptedCalculationEqualsReleaseQualified: false,
  analyticalMeshRequired: false,
  feaSourceMeshAuthority: 'CALLER_AUTHORED_SOURCE_MESH_ONLY',
  convergenceSynthesized: false,
  codeAssessmentProduced: false,
  releaseQualified: false,
  lafea6Enabled: false,
}));
