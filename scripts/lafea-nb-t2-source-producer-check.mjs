import assert from 'node:assert/strict';
import { sourceFixture as attachmentFixture } from './lafea.1-fixtures.mjs';
import { rawRequestFixture as screeningFixture } from './lafea.2-fixtures.mjs';
import { triangleSource as continuumFixture } from './lafea.3-fixtures.mjs';
import { triangleSource as shellFixture } from './lafea.4-fixtures.mjs';
import { workflowSource as trunnionFixture } from './lafea.5-fixtures.mjs';
import {
  LAFEA_CALCULATION_STATES,
  LAFEA_CANONICAL_SHA256_PROFILE,
  LAFEA_CODE_STATES,
  LAFEA_RELEASE_STATES,
  LAFEA_RESULT_STATES,
  LAFEA_SOURCE_AUTHORITY_SCHEMA,
  canonicalLafeaSha256,
  createLafeaArtifactRecord,
  createLafeaLifecycleProducerBatch,
  createLafeaWorkbenchStore,
  issueLafeaSourceAuthority,
  registerLafeaArtifact,
  sourceAuthorityDocument,
  validateLafeaSourceAuthority,
} from '../src/workspace/lafea-workbench.js';

const FIXTURES = Object.freeze({
  'LAFEA.1': attachmentFixture,
  'LAFEA.2': screeningFixture,
  'LAFEA.3': continuumFixture,
  'LAFEA.4': shellFixture,
  'LAFEA.5': trunnionFixture,
});

assert.deepEqual(LAFEA_CALCULATION_STATES, [
  'CALCULATION_NOT_RUN',
  'CALCULATION_ACCEPTED_BY_STAGE_CONTRACT',
  'CALCULATION_NOT_ACCEPTED_BY_STAGE_CONTRACT',
]);
assert.deepEqual(LAFEA_RESULT_STATES, ['RESULT_NOT_READY', 'RESULT_READY']);
assert.deepEqual(LAFEA_CODE_STATES, ['CODE_NOT_READY', 'CODE_READY']);
assert.deepEqual(LAFEA_RELEASE_STATES, ['RELEASE_NOT_QUALIFIED', 'RELEASE_QUALIFIED']);

for (const [stageId, fixtureFactory] of Object.entries(FIXTURES)) {
  const document = fixtureFactory();
  const authority = issueLafeaSourceAuthority(stageId, document, 'NB-T2-CHECK');
  validateLafeaSourceAuthority(authority);
  assert.equal(authority.schema, LAFEA_SOURCE_AUTHORITY_SCHEMA);
  assert.equal(authority.canonicalizationProfile, LAFEA_CANONICAL_SHA256_PROFILE);
  assert.match(authority.sourceHash, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(authority.sourceHash.startsWith('fnv1a64:'), false);
  const source = sourceAuthorityDocument(document);
  assert.equal(authority.sourceHash, canonicalLafeaSha256({
    schema: 'lafea-source-authority-payload/v1',
    stageId,
    source,
  }));
}

const screeningDocument = screeningFixture();
const screeningStore = createLafeaWorkbenchStore({
  initialStage: 'LAFEA.2',
  initialDocument: screeningDocument,
});
const normalizedScreeningDocument =
  screeningStore.getState().stages['LAFEA.2'].document;
const screeningAuthority = issueLafeaSourceAuthority(
  'LAFEA.2', normalizedScreeningDocument, 'NB-T2-SCREENING',
);
assert.equal(screeningStore.getState().stages['LAFEA.2'].lifecycle, null);
screeningStore.run();
let screeningStage = screeningStore.getState().stages['LAFEA.2'];
assert.equal(screeningStage.execution.status, 'QUALIFIED');
assert.equal(screeningStage.sourceAuthority.sourceHash, screeningAuthority.sourceHash);
assert.equal(screeningStage.lifecycleReadiness.calculationState,
  'CALCULATION_ACCEPTED_BY_STAGE_CONTRACT');
assert.equal(screeningStage.lifecycleReadiness.resultState, 'RESULT_READY');
assert.equal(screeningStage.lifecycleReadiness.codeState, 'CODE_NOT_READY');
assert.equal(screeningStage.lifecycleReadiness.releaseState, 'RELEASE_NOT_QUALIFIED');
assert.equal(screeningStage.lifecycle.artifacts.ANALYSIS_MESH, undefined);
assert.equal(screeningStage.lifecycle.artifacts.RECOVERY, undefined);
assert.equal(screeningStage.lifecycle.artifacts.SCREENING_ASSESSMENT.status, 'ABSENT');
assert.equal(screeningStage.lifecycleReadiness.assessmentReady, false);
screeningStore.destroy();

for (const stageId of ['LAFEA.3', 'LAFEA.4', 'LAFEA.5']) {
  const document = FIXTURES[stageId]();
  const store = createLafeaWorkbenchStore({ initialStage: stageId, initialDocument: document });
  store.run();
  const stage = store.getState().stages[stageId];
  const meshRecord = stage.lifecycle.artifacts.ANALYSIS_MESH;
  assert.equal(stage.execution.status, 'QUALIFIED');
  assert.equal(meshRecord.status, 'CURRENT');
  assert.match(meshRecord.parentHashes.meshProfileHash, /^sha256:[0-9a-f]{64}$/u);
  assert.match(meshRecord.producerRef, /^NB-T2\//u);
  assert.equal(stage.lifecycle.artifacts.RECOVERY.status, 'CURRENT');
  assert.equal(stage.lifecycle.artifacts.CONVERGENCE.status, 'ABSENT');
  assert.equal(stage.lifecycleReadiness.resultState, 'RESULT_READY');
  assert.equal(stage.lifecycleReadiness.codeState, 'CODE_NOT_READY');
  assert.equal(stage.lifecycleReadiness.releaseState, 'RELEASE_NOT_QUALIFIED');
  store.destroy();
}

const continuumDocument = continuumFixture();
const continuumAuthority = issueLafeaSourceAuthority(
  'LAFEA.3', continuumDocument, 'NB-T2-CONTINUUM',
);
const continuumStore = createLafeaWorkbenchStore({
  initialStage: 'LAFEA.3', initialDocument: continuumDocument,
});
continuumStore.run();
let continuumStage = continuumStore.getState().stages['LAFEA.3'];
const beforeEditLifecycle = continuumStage.lifecycle;
const beforeEditResultHash = beforeEditLifecycle.artifacts.RECOVERY.artifactHash;
const material = continuumStage.document.materials[0];
continuumStore.setScalar(
  'LAFEA.3.material.elasticModulus', material.materialId,
  String(material.elasticModulus * 1.01), 'NB-T2-CHECK',
);
continuumStage = continuumStore.getState().stages['LAFEA.3'];
assert.equal(continuumStage.lastSourceAuthorityEvent.changeClass, 'MATERIAL_PROPERTY');
assert.equal(continuumStage.lifecycleReadiness.resultReady, false);
continuumStore.undo();
continuumStage = continuumStore.getState().stages['LAFEA.3'];
assert.equal(continuumStage.lifecycleReadiness.resultReady, false);
assert.equal(continuumStage.lifecycle.artifacts.RECOVERY.status, 'STALE');
assert.equal(continuumStage.lifecycle.artifacts.RECOVERY.artifactHash, beforeEditResultHash);
continuumStore.redo();
continuumStage = continuumStore.getState().stages['LAFEA.3'];
assert.equal(continuumStage.lifecycleReadiness.resultReady, false);
continuumStore.destroy();

const editStore = createLafeaWorkbenchStore({
  initialStage: 'LAFEA.3', initialDocument: continuumFixture(),
});
editStore.run();
let stage = editStore.getState().stages['LAFEA.3'];
const currentModel = stage.lifecycle.artifacts.CANONICAL_MODEL;
const editMaterial = stage.document.materials[0];
editStore.setScalar(
  'LAFEA.3.material.elasticModulus', editMaterial.materialId,
  String(editMaterial.elasticModulus * 1.01), 'NB-T2-CHECK',
);
stage = editStore.getState().stages['LAFEA.3'];
assert.equal(stage.lastSourceAuthorityEvent.changeClass, 'MATERIAL_PROPERTY');
assert.equal(stage.lifecycleReadiness.resultReady, false);

const lifecycle = stage.lifecycle;
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
assert.equal(weld.execution.status, 'FAILED');
assert.equal(weld.execution.diagnostics[0].code, 'UNSUPPORTED_STAGE_ENGINE_NOT_IMPLEMENTED');
assert.equal(weld.lifecycle, null);
assert.equal(weld.lifecycleReadiness.resultState, 'RESULT_NOT_READY');
assert.equal(weld.lifecycleReadiness.releaseState, 'RELEASE_NOT_QUALIFIED');
weldStore.destroy();

const producerAuthority = issueLafeaSourceAuthority(
  'LAFEA.3', continuumFixture(), 'NB-T2-PRODUCER',
);
const producerStore = createLafeaWorkbenchStore({
  initialStage: 'LAFEA.3', initialDocument: continuumFixture(),
});
producerStore.run();
const producerExecution = producerStore.getState().stages['LAFEA.3'].execution;
const producerBatch = createLafeaLifecycleProducerBatch({
  stageId: 'LAFEA.3', sourceAuthority: producerAuthority, execution: producerExecution,
});
assert.equal(producerBatch.records.some((record) => record.kind === 'CONVERGENCE'), false);
assert.equal(producerBatch.records.some((record) => record.kind === 'CODE_ASSESSMENT'), false);
assert.equal(producerBatch.records.some((record) => record.kind === 'REPORT_EVIDENCE'), false);
producerStore.destroy();

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
  screeningApplicabilitySynthesized: false,
  feaSourceMeshAuthority: 'CALLER_AUTHORED_SOURCE_MESH_ONLY',
  convergenceSynthesized: false,
  codeAssessmentSynthesized: false,
  reportEvidenceSynthesized: false,
  lafea6Enabled: false,
}));
