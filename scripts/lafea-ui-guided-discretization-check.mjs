#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  LAFEA_DISCRETIZATION_VIEW_MODEL_SCHEMA,
  buildLafeaDiscretizationViewModel,
} from '../src/workspace/lafea-discretization-view-model.js';
import {
  LAFEA_GUIDED_WORKFLOW_SCHEMA,
  buildLafeaGuidedWorkflow,
} from '../src/workspace/lafea-guided-workflow.js';
import { lafeaMeshCapabilities } from '../src/workspace/lafea-mesh-capabilities.js';
import {
  LAFEA_MESH_REFINEMENT_COMMAND_SCHEMA,
  createLafeaMeshRefinementCommand,
} from '../src/workspace/lafea-mesh-refinement-command.js';
import {
  LAFEA_MESH_GENERATION_INTENT_SCHEMA,
  createLafeaMeshGenerationIntent,
} from '../src/workspace/lafea-mesh-generation-intent.js';

const absent = stage('LAFEA.3', projection('LAFEA.3', 'ABSENT'));
absent.document.meshConfig = { nominalSize: 4 };
const absentVm = buildLafeaDiscretizationViewModel(absent);
assert.equal(absentVm.schema, LAFEA_DISCRETIZATION_VIEW_MODEL_SCHEMA);
assert.equal(absentVm.state, 'ABSENT');
assert.equal(absentVm.stepStatus, 'NOT_STARTED');
assert.equal(absentVm.configuration.legacyMeshConfigStatus, 'UNAPPLIED_PREFERENCE');
assert.equal(absentVm.configuration.legacyMeshConfigEngineeringEffect, 'NONE');
assert.equal(absentVm.actions.canRun, false);
assert.equal(absentVm.actions.automaticMeshEnabled, false);
assert.equal(absentVm.actions.manualRefinementEnabled, false);
assert.ok(absentVm.configuration.modes.find((row) => row.mode === 'AUTOMATIC_MESH')?.reason);

const pass = stage('LAFEA.3', projection('LAFEA.3', 'CURRENT_PASS', {
  usable: true, evidence: true, quality: 'OK',
}));
const passVm = buildLafeaDiscretizationViewModel(pass);
assert.equal(passVm.stepStatus, 'COMPLETE');
assert.equal(passVm.actions.canRun, true);
assert.equal(passVm.evidence.nodeCount, 3);
assert.equal(passVm.evidence.elementCount, 1);
assert.equal(passVm.evidence.qualityPanel.worstStatus, 'OK');

const warningVm = buildLafeaDiscretizationViewModel(stage(
  'LAFEA.3', projection('LAFEA.3', 'CURRENT_WARNING', {
    evidence: true, quality: 'WARNING', warningIds: ['E1'], focus: true,
  }),
));
assert.equal(warningVm.stepStatus, 'WARNING');
assert.equal(warningVm.actions.canRun, false);
assert.equal(warningVm.actions.warningReviewRequired, true);
assert.deepEqual(warningVm.evidence.warningElementIds, ['E1']);

const blockVm = buildLafeaDiscretizationViewModel(stage(
  'LAFEA.3', projection('LAFEA.3', 'CURRENT_BLOCK', {
    evidence: true, quality: 'BLOCK', blockIds: ['E1'], focus: true,
  }),
));
assert.equal(blockVm.stepStatus, 'BLOCKED');
assert.equal(blockVm.actions.canRun, false);
assert.deepEqual(blockVm.evidence.blockingElementIds, ['E1']);

for (const stateName of ['STALE', 'INVALID']) {
  const vm = buildLafeaDiscretizationViewModel(stage(
    'LAFEA.3', projection('LAFEA.3', stateName, { evidence: true }),
  ));
  assert.equal(vm.stepStatus, 'BLOCKED');
  assert.equal(vm.actions.canRun, false);
}

const analytical = stage(
  'LAFEA.1', projection('LAFEA.1', 'NOT_APPLICABLE', { usable: true }),
);
const analyticalVm = buildLafeaDiscretizationViewModel(analytical);
assert.equal(analyticalVm.applicable, false);
assert.equal(analyticalVm.actions.canRun, true);
assert.ok(analyticalVm.configuration.modes.every((row) => row.enabled === false));

const capabilities = lafeaMeshCapabilities('LAFEA.3');
assert.equal(capabilities.retainedAuthorizedMesh, true);
assert.equal(capabilities.automaticMeshProducerQualified, false);
assert.deepEqual(capabilities.allowedElementFamilies, ['T3', 'T6', 'Q8']);
assert.equal(lafeaMeshCapabilities('LAFEA.1').applicable, false);

const intentInput = {
  schema: LAFEA_MESH_GENERATION_INTENT_SCHEMA,
  stageId: 'LAFEA.3',
  sourceHash: hash('source'),
  canonicalModelHash: hash('model'),
  analysisGeometryHash: hash('geometry'),
  meshProfileHash: hash('profile'),
  targetElementLength: 2,
  lengthUnit: 'mm',
  elementFamily: 'T3',
  curvatureToleranceDegrees: 8,
  growthLimit: 1.4,
  maximumNodes: 10000,
  maximumElements: 20000,
  maximumEstimatedDofs: 60000,
  refinementEntityIds: ['B', 'A'],
};
const intent = createLafeaMeshGenerationIntent(intentInput);
assert.equal(intent.status, 'UNEXECUTABLE_INTENT');
assert.equal(intent.executionAuthorized, false);
assert.equal(intent.producesMesh, false);
assert.equal(intent.producerRef, null);
assert.deepEqual(intent.refinementEntityIds, ['A', 'B']);
assert.equal(intent.semanticHash, createLafeaMeshGenerationIntent(intentInput).semanticHash);

const refinement = createLafeaMeshRefinementCommand({
  schema: LAFEA_MESH_REFINEMENT_COMMAND_SCHEMA,
  commandId: 'REFINE-1', stageId: 'LAFEA.3',
  expectedGenerationIntentHash: intent.semanticHash,
  kind: 'DISCONTINUITY_ZONE', entityIds: ['EDGE-B', 'EDGE-A'],
  targetElementLength: 1, lengthUnit: 'mm', reason: 'Geometry discontinuity study',
});
assert.equal(refinement.status, 'UNEXECUTABLE_COMMAND');
assert.equal(refinement.executionAuthorized, false);
assert.deepEqual(refinement.entityIds, ['EDGE-A', 'EDGE-B']);
assert.equal(refinement.rollbackPolicy, 'NO_MUTATION_WITHOUT_QUALIFIED_PRODUCER');

const guidedAuthorized = buildLafeaGuidedWorkflow(workbench(pass, {
  preparationState: 'COMPLETE', authorizationState: 'READY',
  discretizationState: 'COMPLETE',
}));
assert.equal(guidedAuthorized.schema, LAFEA_GUIDED_WORKFLOW_SCHEMA);
assert.equal(guidedAuthorized.steps.length, 11);
assert.equal(guidedAuthorized.releaseQualified, false);
assert.equal(guidedAuthorized.executionBoundary.cancellationSupported, false);
assert.equal(guidedAuthorized.runEligibleByCurrentUiGate, true);
assert.equal(guidedAuthorized.steps.find((row) => row.stepId === 'AUTHORIZATION').status, 'READY');

const preparationReason = 'LAFEA_PREPARATION_PRODUCER_NOT_QUALIFIED';
const guidedBlocked = buildLafeaGuidedWorkflow(workbench(analytical, {
  preparationState: 'BLOCKED', preparationReasons: [preparationReason],
  authorizationState: 'BLOCKED', authorizationReasons: [preparationReason],
  discretizationState: 'COMPLETE',
}));
assert.equal(guidedBlocked.runEligibleByCurrentUiGate, false);
assert.equal(guidedBlocked.steps.find((row) => row.stepId === 'RUN').status, 'BLOCKED');
assert.ok(guidedBlocked.steps.find((row) => row.stepId === 'NUMERICAL_PREFLIGHT')
  .reasons.includes(preparationReason));
assert.ok(guidedBlocked.steps.find((row) => row.stepId === 'AUTHORIZATION')
  .reasons.includes(preparationReason));

const viewSource = read('../src/workspace/lafea-workbench-view.js');
const controllerSource = read('../src/workspace/lafea-workbench-controller.js');
const contentSource = read('../src/workspace/lafea-workbench-content.js');
const workflowSource = read('../src/workspace/lafea-guided-workflow.js');
const overlaySource = read('../src/workspace/lafea-canvas/retained-mesh-overlay.js');
const intentSource = read('../src/workspace/lafea-mesh-generation-intent.js');
assert.match(viewSource, /sections\?\.AUTHORIZATION|sections\.AUTHORIZATION/u);
assert.match(controllerSource, /createLafeaWorkbenchOrchestratorStore/u);
assert.match(workflowSource, /LAFEA_WORKBENCH_ORCHESTRATION_SCHEMA/u);
assert.match(contentSource, /Discretization/u);
assert.match(contentSource, /retainedAnalysisMeshEvidence/u);
assert.match(overlaySource, /data-mesh-element-id|meshElementId/u);
assert.doesNotMatch(overlaySource, /triangulate|refine|smooth|repair|solver/iu);
assert.doesNotMatch(intentSource, /createLafeaAnalysisMeshEvidence|triangulate|refineMesh/iu);
for (const path of [
  '../src/workspace/lafea-discretization-view-model.js',
  '../src/workspace/lafea-guided-workflow.js',
  '../src/workspace/lafea-discretization-panel.js',
  '../src/workspace/lafea-workbench-content.js',
  '../src/workspace/lafea-workbench-view.js',
  '../src/workspace/lafea-workbench-controller.js',
  '../src/workspace/lafea-source-workbench-viewport.js',
  '../src/workspace/lafea-live-workbench-viewport.js',
]) assert.ok(lineCount(read(path)) < 300, `${path} exceeds the 299-line limit.`);

console.log(JSON.stringify({
  check: 'lafea-ui-guided-discretization', status: 'PASS',
  canonicalOrchestratorAuthorizationConsumed: true,
  automaticMeshExecutionAuthorized: false,
  manualRefinementAuthorized: false,
  releaseQualified: false,
}));

function stage(stageId, custody) {
  return {
    stageId,
    document: {},
    lifecycle: { profileId: stageId === 'LAFEA.1' ? 'ANALYTICAL_FOUNDATION_V1' : 'FEA_MESH_RECOVERY_V1' },
    lifecycleBinding: { status: 'CURRENT' },
    lifecycleReadiness: { sourceCurrent: true },
    analysisMeshProfileHash: custody.meshProfileHash,
    analysisMeshCustodyProjection: custody,
    retainedAnalysisMeshEvidence: custody._evidence ? { retained: true } : null,
    execution: null,
  };
}
function projection(stageId, stateName, options = {}) {
  const evidence = options.evidence === true;
  const quality = options.quality;
  return {
    schema: 'lafea-analysis-mesh-custody-projection/v1', stageId, state: stateName,
    usableForAdvance: options.usable === true,
    usableForAuthorization: options.usable === true,
    usableForRun: options.usable === true,
    canView: evidence, canFocusFindings: options.focus === true,
    staleReasons: stateName === 'STALE' ? ['PARENT_STALE'] : [],
    invalidReasons: stateName === 'INVALID' ? ['EVIDENCE_TAMPERED'] : [],
    absenceReasons: [], meshIdentity: evidence ? 'MESH-1' : null,
    meshHash: evidence ? hash('mesh') : null,
    meshProfileIdentity: evidence ? 'PROFILE-1' : null,
    meshProfileHash: evidence ? hash('profile') : null,
    sourceHash: evidence ? hash('source') : null,
    canonicalModelHash: evidence ? hash('model') : null,
    analysisGeometryHash: evidence ? hash('geometry') : null,
    artifactHash: evidence ? hash('artifact') : null,
    registrationId: evidence ? 'REG-1' : null,
    producerRef: evidence ? 'QUALIFIED-EXTERNAL-PRODUCER' : null,
    authorityStatus: evidence ? 'ACCEPTED_BY_STAGE_CONTRACT' : null,
    nodeCount: evidence ? 3 : 0, elementCount: evidence ? 1 : 0,
    gateResults: quality ? [{ metric: 'ASPECT_RATIO', value: 1.5, status: quality }] : [],
    warningElementIds: options.warningIds ?? [], blockingElementIds: options.blockIds ?? [],
    _evidence: evidence,
  };
}
function workbench(active, options = {}) {
  const stageValue = {
    ...active,
    orchestration: orchestration(active.stageId, options),
  };
  return {
    activeStageId: active.stageId,
    status: 'READY', diagnostics: [], stages: { [active.stageId]: stageValue },
  };
}
function orchestration(stageId, options) {
  const complete = section('COMPLETE');
  return {
    schema: 'lafea-workbench-orchestration/v1',
    stageId,
    stageAdapterId: `LAFEA_STAGE_ADAPTER:${stageId}:V1`,
    sections: {
      SOURCE: complete,
      MODEL: complete,
      PREPARATION: section(options.preparationState ?? 'COMPLETE', options.preparationReasons),
      DISCRETIZATION: section(options.discretizationState ?? 'COMPLETE'),
      AUTHORIZATION: section(options.authorizationState ?? 'READY', options.authorizationReasons),
      EXECUTION: section('NOT_STARTED', ['EXECUTION_NOT_RUN']),
      RESULTS: section('NOT_STARTED', ['EXECUTION_REQUIRED']),
      RELEASE: section('BLOCKED', ['RELEASE_NOT_QUALIFIED']),
    },
  };
}
function section(state, reasons = []) { return { state, reasons }; }
function hash(seed) { return `sha256:${seed.padEnd(64, '0').slice(0, 64)}`; }
function read(relative) { return fs.readFileSync(new URL(relative, import.meta.url), 'utf8'); }
function lineCount(text) { return text.replace(/\n$/u, '').split(/\r?\n/u).length; }
