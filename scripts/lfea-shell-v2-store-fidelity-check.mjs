#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  rectangularQ4Package,
  t3PlatePackage,
} from './lfea-005-fixtures.mjs';
import {
  createLfeaWorkbenchReviewProfile,
  createLfeaWorkbenchStore,
  executeLfeaWorkbench,
} from '../src/workspace/lfea-workbench.js';
import { createLfeaInspectorValueSnapshot } from '../src/workspace/lfea-shell-v2/inspector.js';
import {
  captureRunTrace,
  createLfeaShellViewModel,
} from '../src/workspace/lfea-shell-v2/shell-view-model.js';

const fixtures = [rectangularQ4Package({}), t3PlatePackage({})];
const evidence = [];

for (const packageValue of fixtures) {
  const direct = executeLfeaWorkbench(packageValue, {});
  const store = createLfeaWorkbenchStore({ initialDocument: packageValue });
  const originalPackageHash = store.getState().packageValue.semanticHash;
  store.run();
  const state = store.getState();
  const shell = createLfeaShellViewModel(state);
  const inspector = createLfeaInspectorValueSnapshot(state);

  assert.equal(state.packageValue.semanticHash, originalPackageHash,
    'A UI run must not alter the package semantic hash.');
  assert.equal(state.packageValue.semanticHash, packageValue.semanticHash,
    'The imported fixture hash must survive the workbench unchanged.');
  assert.equal(state.execution.result.semanticHash, direct.result.semanticHash,
    'Store result hash must equal the authoritative direct-pipeline result hash.');
  assert.equal(state.execution.review.semanticHash, direct.review.semanticHash,
    'Store review hash must equal the authoritative direct-pipeline review hash.');
  assert.equal(state.execution.evidenceExport.semanticHash, direct.evidenceExport.semanticHash,
    'Store export hash must equal the authoritative direct-pipeline export hash.');

  assert.deepEqual(inspector.displacements, state.execution.result.nodalDisplacements);
  assert.deepEqual(inspector.reactions, state.execution.result.reactions);
  assert.deepEqual(
    inspector.rawStress,
    Array.isArray(state.execution.result.integrationPointResults)
      ? state.execution.result.integrationPointResults
      : state.execution.result.elementStresses ?? [],
  );
  assert.deepEqual(inspector.projectedStress, state.execution.stressProjection?.nodalValues ?? []);
  assert.equal(inspector.preflightStatus, state.execution.preflight?.status ?? null);
  assert.equal(inspector.solverStatus, state.execution.result?.status ?? null);
  assert.equal(inspector.reviewStatus, state.execution.review?.status ?? null);
  assert.equal(inspector.evidenceExportStatus, state.execution.evidenceExport?.status ?? null);

  const expectedFidelity = {
    packageSemanticHash: String(state.packageValue.semanticHash),
    modelVersion: String(state.modelVersion),
    executionRunId: String(state.execution.runId),
    executionSemanticHash: String(state.execution.result.semanticHash),
    reviewSemanticHash: String(state.execution.review.semanticHash),
    evidenceExportSemanticHash: String(state.execution.evidenceExport.semanticHash),
    preflightStatus: String(state.execution.preflight.status),
    resultStatus: String(state.execution.result.status),
    reviewStatus: String(state.execution.review.status),
    evidenceExportStatus: String(state.execution.evidenceExport.status),
    resultMode: String(state.display.resultMode),
    deformationScale: String(state.display.deformationScale),
  };
  assert.deepEqual(shell.fidelity, expectedFidelity,
    'Shell rendered-value projection must be byte-identical to store authority.');

  evidence.push({
    packageIdentity: packageValue.packageIdentity,
    packageSemanticHash: packageValue.semanticHash,
    resultSemanticHash: state.execution.result.semanticHash,
    reviewSemanticHash: state.execution.review.semanticHash,
    evidenceExportSemanticHash: state.execution.evidenceExport.semanticHash,
  });
  store.destroy();
}

checkCancellationPresentation();
checkPreflightWarningSeparation();

console.log(JSON.stringify({
  check: 'lfea-shell-v2-store-fidelity',
  status: 'PASS',
  fixtures: evidence,
  userCancellationDistinct: true,
  modelChangeCancellationInvalidatesTrace: true,
  preflightWarningSeparateFromExportFreshness: true,
}));

function checkCancellationPresentation() {
  const packageValue = rectangularQ4Package({});
  const userStore = createLfeaWorkbenchStore({ initialDocument: packageValue });
  const userRun = userStore.beginRun().activeRun;
  userStore.updateRunProgress({
    type: 'PROGRESS',
    ...userRun,
    progress: { stage: 'SOLVE', index: 3, total: 7 },
  });
  const userTrace = captureRunTrace(userStore.getState());
  userStore.cancelRun({
    type: 'CANCELLED',
    ...userRun,
    reason: 'USER',
    code: 'LFEA_RUN_CANCELLED',
  });
  const userPipeline = createLfeaShellViewModel(userStore.getState(), userTrace).pipeline;
  assert.equal(step(userPipeline, 'SOLVE').state, 'Warning');
  assert.equal(step(userPipeline, 'PROJECT').state, 'Not run');
  assert.equal(userStore.getState().diagnostics[0].reason, 'USER');
  userStore.destroy();

  const editStore = createLfeaWorkbenchStore({ initialDocument: packageValue });
  const editRun = editStore.beginRun().activeRun;
  editStore.updateRunProgress({
    type: 'PROGRESS',
    ...editRun,
    progress: { stage: 'SOLVE', index: 3, total: 7 },
  });
  const editTrace = captureRunTrace(editStore.getState());
  const index = editStore.getState().packageValue.nodes.findIndex((row) => row.nodeId === 'N2');
  const node = editStore.getState().packageValue.nodes[index];
  editStore.updateRecord('nodes', index, { ...node, x: node.x + 0.01 });
  const editState = editStore.getState();
  const editPipeline = createLfeaShellViewModel(editState, editTrace).pipeline;
  assert.equal(editState.diagnostics[0].code, 'LFEA_RUN_CANCELLED_MODEL_CHANGED');
  assert.ok(editPipeline.every((row) => row.state === 'Not run'),
    'A committed model edit must invalidate previous-run step completion.');
  editStore.destroy();
}

function checkPreflightWarningSeparation() {
  const packageValue = rectangularQ4Package({});
  const reviewProfile = {
    ...createLfeaWorkbenchReviewProfile(true, false),
    maximumExportBytes: 1,
  };
  const store = createLfeaWorkbenchStore({
    initialDocument: packageValue,
    pipelineOptions: { reviewProfile },
  });
  store.run();
  const state = store.getState();
  const shell = createLfeaShellViewModel(state);
  assert.equal(state.execution.preflight.status, 'EXPORT_LIKELY_TO_EXCEED_BYTE_CAPACITY');
  assert.equal(state.execution.result.status, 'QUALIFIED');
  assert.equal(state.execution.evidenceExport, null);
  assert.equal(step(shell.pipeline, 'PREFLIGHT').state, 'Warning');
  assert.equal(step(shell.pipeline, 'SOLVE').state, 'Complete');
  assert.equal(step(shell.pipeline, 'EXPORT').state, 'Blocked');
  assert.equal(shell.commands.canExportEvidence, false);
  store.destroy();
}

function step(pipeline, stage) {
  return pipeline.find((row) => row.stage === stage);
}
