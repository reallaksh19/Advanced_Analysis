#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { triangleSource as continuumFixture } from './lafea.3-fixtures.mjs';
import {
  LAFEA_LIFECYCLE_BINDING_SCHEMA,
  LAFEA_SOURCE_AUTHORITY_SCHEMA,
  LAFEA_WORKBENCH_STATE_SCHEMA,
  createLafeaArtifactRecord,
  createLafeaLifecycleEvent,
  createLafeaWorkbenchStore,
} from '../src/workspace/lafea-workbench.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stageId = 'LAFEA.3';
const store = createLafeaWorkbenchStore({
  initialStage: stageId,
  initialDocument: continuumFixture(),
});

let stage = store.getState().stages[stageId];
assert.equal(store.getState().schema, LAFEA_WORKBENCH_STATE_SCHEMA);
assert.equal(stage.lifecycle, null);
assert.equal(stage.sourceAuthority, null);
assert.equal(stage.lifecycleBinding.schema, LAFEA_LIFECYCLE_BINDING_SCHEMA);
assert.equal(stage.lifecycleBinding.status, 'UNINITIALIZED');
assert.equal(stage.orchestration.sections.SOURCE.state, 'BLOCKED');

const nodeB = stage.document.nodes.find((row) => row.nodeId === 'B');
store.setScalar('LAFEA.3.node.x', 'B', String(nodeB.x + 25), 'U3B-CHECK');
stage = store.getState().stages[stageId];
assert.equal(stage.sourceAuthority.schema, LAFEA_SOURCE_AUTHORITY_SCHEMA);
assert.match(stage.sourceAuthority.sourceHash, /^sha256:[0-9a-f]{64}$/u);
assert.equal(stage.lifecycleBinding.status, 'CURRENT');
assert.equal(stage.lastSourceAuthorityEvent.changeClass, 'GEOMETRY');
assert.equal(stage.lifecycle.artifacts.CANONICAL_MODEL.status, 'ABSENT');
assert.equal(stage.orchestration.sections.SOURCE.state, 'COMPLETE');

store.run();
stage = store.getState().stages[stageId];
assert.equal(stage.execution.status, 'QUALIFIED');
assert.equal(stage.lifecycleReadiness.calculationState,
  'CALCULATION_ACCEPTED_BY_STAGE_CONTRACT');
assert.equal(stage.lifecycleReadiness.resultState, 'RESULT_READY');
assert.equal(stage.lifecycleReadiness.codeState, 'CODE_NOT_READY');
assert.equal(stage.lifecycleReadiness.releaseState, 'RELEASE_NOT_QUALIFIED');
assert.equal(stage.lifecycle.artifacts.CANONICAL_MODEL.status, 'CURRENT');
assert.equal(stage.lifecycle.artifacts.ANALYSIS_MESH.status, 'CURRENT');
assert.equal(stage.lifecycle.artifacts.EXECUTION.status, 'CURRENT');
assert.equal(stage.lifecycle.artifacts.RECOVERY.status, 'CURRENT');
assert.equal(stage.lifecycle.artifacts.CONVERGENCE.status, 'ABSENT');
assert.equal(stage.orchestration.sections.MODEL.state, 'COMPLETE');
assert.equal(stage.orchestration.sections.PREPARATION.state, 'BLOCKED');
assert.equal(stage.orchestration.sections.RESULTS.state, 'COMPLETE');
assert.equal(stage.orchestration.sections.RELEASE.state, 'BLOCKED');

const artifactSnapshot = structuredClone(stage.lifecycle.artifacts);
store.applyLifecycleEvent(createLafeaLifecycleEvent({
  eventId: 'U3B-DISPLAY-PALETTE',
  stageId,
  changeClass: 'CONTOUR_PALETTE',
  previousSourceHash: null,
  currentSourceHash: null,
  profileHash: 'sha256:u3b-palette-B',
  originRef: 'U3B-CHECK/DISPLAY',
}));
stage = store.getState().stages[stageId];
assert.deepEqual(stage.lifecycle.artifacts, artifactSnapshot);
assert.equal(stage.lifecycle.display.contourPaletteHash, 'sha256:u3b-palette-B');

const sourceHashBeforeMaterialEdit = stage.sourceAuthority.sourceHash;
const material = stage.document.materials[0];
store.setScalar(
  'LAFEA.3.material.elasticModulus',
  material.materialId,
  String(material.elasticModulus * 1.01),
  'U3B-CHECK',
);
stage = store.getState().stages[stageId];
assert.notEqual(stage.sourceAuthority.sourceHash, sourceHashBeforeMaterialEdit);
assert.equal(stage.lastSourceAuthorityEvent.changeClass, 'MATERIAL_PROPERTY');
assert.equal(stage.lifecycle.artifacts.CANONICAL_MODEL.status, 'STALE');
assert.equal(stage.lifecycle.artifacts.ANALYSIS_MESH.status, 'REVALIDATION_REQUIRED');
assert.equal(stage.lifecycle.artifacts.EXECUTION.status, 'STALE');
assert.equal(stage.lifecycleReadiness.resultState, 'RESULT_NOT_READY');
assert.equal(stage.orchestration.sections.MODEL.state, 'BLOCKED');

store.undo();
stage = store.getState().stages[stageId];
assert.equal(stage.sourceAuthority.sourceHash, sourceHashBeforeMaterialEdit);
assert.equal(stage.lastSourceAuthorityEvent.changeClass, 'MATERIAL_PROPERTY');
assert.equal(stage.lifecycleBinding.status, 'CURRENT');
assert.equal(stage.lifecycle.artifacts.CANONICAL_MODEL.status, 'STALE');
assert.equal(stage.lifecycleReadiness.resultReady, false);
assert.equal(stage.orchestration.sections.SOURCE.state, 'COMPLETE');
assert.equal(stage.orchestration.sections.MODEL.state, 'BLOCKED');
store.redo();
assert.equal(
  store.getState().stages[stageId].lastSourceAuthorityEvent.changeClass,
  'MATERIAL_PROPERTY',
);

const lifecycleExport = store.exportLifecycle();
assert.equal(lifecycleExport.schema, 'lafea-workbench-lifecycle-export/v2');
assert.equal(lifecycleExport.sourceAuthority.schema, LAFEA_SOURCE_AUTHORITY_SCHEMA);
assert.equal(lifecycleExport.readiness.releaseState, 'RELEASE_NOT_QUALIFIED');
assert.equal(lifecycleExport.orchestration.sections.RELEASE.state, 'BLOCKED');
store.destroy();

const manual = createLafeaWorkbenchStore({
  initialStage: stageId,
  initialDocument: continuumFixture(),
});
manual.initializeLifecycle('sha256:manual-browser-fixture', 'U3B-MANUAL');
stage = manual.getState().stages[stageId];
assert.equal(stage.sourceAuthority, null);
assert.equal(stage.lifecycle.source.sourceHash, 'sha256:manual-browser-fixture');
manual.registerLifecycleArtifact(createLafeaArtifactRecord({
  stageId,
  kind: 'CANONICAL_MODEL',
  status: 'CURRENT',
  artifactHash: 'sha256:manual-model',
  parentHashes: { sourceHash: 'sha256:manual-browser-fixture' },
  qualification: 'PASS',
  producerRef: 'U3B-MANUAL-PRODUCER',
  diagnostics: [],
}), 'U3B-MANUAL-MODEL');
manual.run();
stage = manual.getState().stages[stageId];
assert.equal(stage.execution.status, 'QUALIFIED');
assert.equal(stage.sourceAuthority.schema, LAFEA_SOURCE_AUTHORITY_SCHEMA);
assert.equal(stage.lifecycleReadiness.resultState, 'RESULT_READY');
manual.destroy();

const rejected = createLafeaWorkbenchStore({ initialStage: 'LAFEA.1' });
rejected.importDocument(null, 'LAFEA.1');
assert.equal(rejected.getState().status, 'FAILED');
assert.equal(rejected.getState().stages['LAFEA.1'].lifecycle, null);
rejected.destroy();

const workspace = path.join(ROOT, 'src', 'workspace');
const read = (name) => fs.readFileSync(path.join(workspace, name), 'utf8');
const facade = read('lafea-lifecycle-workbench-store.js');
const orchestrator = read('lafea-workbench-orchestrator-store.js');
const sourceState = read('lafea-workbench-source-state.js');
const sourceAuthority = read('lafea-source-authority.js');
const producer = read('lafea-lifecycle-producers.js');
assert.match(sourceState, /stage\.lastEditResult\?\.audit\?\.descriptorDigest/u);
assert.doesNotMatch(sourceState, /sourceHash:\s*lafeaDocumentDigest/u);
assert.match(orchestrator, /CALCULATION_ACCEPTED_BY_STAGE_CONTRACT/u);
assert.match(orchestrator, /RELEASE_NOT_QUALIFIED/u);
assert.doesNotMatch(facade, /lafea-lifecycle-workbench-store-core/u);
assert.doesNotMatch(facade, /lafea-analysis-mesh-workbench-store/u);
assert.match(sourceAuthority, /canonical SHA-256/u);
assert.doesNotMatch(sourceAuthority, /sourceHash:\s*lafeaDocumentDigest/u);
assert.doesNotMatch(
  producer,
  /calculateLocal|executeLafeaStage|source\.meshConfig|(?:^|[^A-Za-z0-9_])renderPacket\s*[:.(]/mu,
);
assert.match(producer, /CALLER_AUTHORED_SOURCE_MESH_ONLY/u);

console.log(JSON.stringify({
  check: 'lafea-u3b-live-lifecycle-integration',
  status: 'PASS',
  stateSchema: LAFEA_WORKBENCH_STATE_SCHEMA,
  sourceAuthoritySchema: LAFEA_SOURCE_AUTHORITY_SCHEMA,
  canonicalOrchestrationIntegrated: true,
  sourceEditsIssueTypedEvents: true,
  undoRedoResurrectsEvidence: false,
  calculationAutoRegistersCurrentCoreEvidence: true,
  manualSimulatedEvidenceCompatibility: true,
  calculationAcceptedIsReleaseQualified: false,
  displayChangesInvalidateEngineeringEvidence: false,
  lafea6Enabled: false,
}));
