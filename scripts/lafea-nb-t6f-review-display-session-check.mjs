#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAFEA_B7D_RECOVERY_RENDER_BRIDGE_INTAKE_SCHEMA,
  LAFEA_B7D_WORKBENCH_DISPLAY_HANDOFF_INTAKE_SCHEMA,
  LAFEA_LUG_PINHOLE_EXECUTION_INTAKE_SCHEMA,
  LAFEA_SELECTED_PILOT_REVIEW_DISPLAY_SESSION_INTAKE_SCHEMA,
  createLafeaB7dRecoveryRenderBridge,
  createLafeaLoadDrivenPilotQualification,
  createLafeaLugPinholePhysicalProblemProjection,
  createLafeaSelectedPilotReviewDisplaySession,
  createLafeaSelectedPilotReviewHandoff,
  executeLafeaLugPinholePhysicalProblemBatch,
  installLafeaB7dWorkbenchDisplay,
  validateLafeaSelectedPilotReviewDisplaySession,
} from '../src/workspace/lafea-controlled-continuum-public.js';
import { createLafeaLifecycleEvent } from '../src/workspace/lafea-lifecycle.js';
import {
  LAFEA_RECOVERY_RENDER_FIELD_REQUEST_SCHEMA,
  LAFEA_RECOVERY_RENDER_LOCATION_SCHEMA,
} from '../src/workspace/lafea-recovery-render-contract.js';
import { LafeaWorkbenchController } from '../src/workspace/lafea-workbench-controller.js';
import { createNbT6cFixture } from './lafea-nb-t6c-fixture.mjs';
import { FakeDocument, fakeThree } from './lafea-u4g-fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: ROOT,
  encoding: 'utf8',
}).trim();
let adversarialCount = 0;
sourceGuards();

const fixture = createNbT6cFixture(ROOT, HEAD);
const selectedPilot = createSelectedPilot();
const bridge = createBridge(17);
const reviewHandoff = createLafeaSelectedPilotReviewHandoff({
  handoffId: 'NB-T6F-C2D-LUG-PINHOLE-REVIEW-001',
  exactHeadSha: HEAD,
  qualification: selectedPilot.qualification,
  projection: selectedPilot.projection,
  execution: selectedPilot.execution,
  renderBridge: bridge,
});
const live = createLiveController(bridge);
const workbenchHandoff = installLafeaB7dWorkbenchDisplay({
  schema: LAFEA_B7D_WORKBENCH_DISPLAY_HANDOFF_INTAKE_SCHEMA,
  controller: live.controller,
  bridge,
});
const session = createSession(reviewHandoff, workbenchHandoff);

assert.equal(session.status, 'REVIEW_DISPLAY_SESSION_BOUND');
assert.equal(validateLafeaSelectedPilotReviewDisplaySession(session).ok, true);
assert.equal(session.exactHeadSha, HEAD);
assert.equal(session.stageId, 'LAFEA.3');
assert.equal(session.templateId, 'C2D-LUG-PINHOLE');
assert.equal(session.reviewHandoffHash, reviewHandoff.semanticHash);
assert.equal(session.reviewPacketHash, reviewHandoff.reviewPacket.packetHash);
assert.equal(session.auditReceiptHash, reviewHandoff.auditReceipt.evidenceHash);
assert.equal(session.workbenchHandoffHash, workbenchHandoff.handoffHash);
assert.equal(session.renderBridgeHash, bridge.bridgeHash);
assert.equal(session.sourceHash, bridge.sourceHash);
assert.equal(session.analysisMeshHash, bridge.analysisMeshHash);
assert.equal(session.executionHash, bridge.executionHash);
assert.equal(session.recoveryHash, bridge.recoveryHash);
assert.equal(session.convergenceHash, bridge.convergenceHash);
assert.equal(session.displayGeometryHash, bridge.displayGeometryHash);
assert.equal(session.renderProfileHash, bridge.renderProfileHash);
assert.equal(session.sceneRevision, bridge.sceneRevision);
assert.equal(session.fieldId, bridge.fieldRequest.fieldId);
assert.equal(session.reviewSummary.levelCount, 3);
assert.equal(session.reviewSummary.finestOrdinal, 3);
assert.equal(session.reviewSummary.finestElementCount, 256);
assert.equal(session.reviewSummary.reviewPacketReady, true);
assert.equal(session.reviewSummary.portableAuditHandoff, true);
assert.equal(session.reviewSummary.displayValuesAuthoritative, false);
assert.equal(session.displaySummary.packetBound, true);
assert.equal(session.displaySummary.renderEvidenceReady, true);
assert.equal(session.displaySummary.currentViewportMatched, true);
assert.equal(session.displaySummary.lifecycleBindingStatus, 'CURRENT');
assert.equal(session.displaySummary.renderIntakeStatus, 'READY');
assert.equal(session.displaySummary.packetBindingStatus, 'BOUND');
assert.equal(session.displaySummary.typedArraysExposed, false);
assert.equal(session.authority.sameRenderBridgeProven, true);
assert.equal(session.authority.sameEngineeringLineageProven, true);
assert.equal(session.authority.bufferFreeSessionReceipt, true);
assert.equal(session.authority.engineeringEvidenceChanged, false);
assert.equal(session.authority.lifecycleArtifactsRegistered, false);
assert.equal(session.authority.solverExecuted, false);
assert.equal(session.authority.newRecoveryProduced, false);
assert.equal(session.authority.newConvergenceProduced, false);
assert.equal(session.authority.newDisplayProjectionProduced, false);
assert.equal(session.authority.codeReady, false);
assert.equal(session.authority.reportAuthority, false);
assert.equal(session.authority.releaseQualified, false);
assert.equal(Object.isFrozen(session), true);
for (const forbidden of [
  'packet', 'renderPacket', 'displayField', 'positions', 'fieldValues',
  'reviewHandoff', 'workbenchHandoff',
]) assert.equal(forbidden in session, false);

const replay = createSession(reviewHandoff, workbenchHandoff);
assert.equal(replay.sessionHash, session.sessionHash);
assert.deepEqual(replay, session);

expectCode('stale exact head', () =>
  createLafeaSelectedPilotReviewDisplaySession({
    schema: LAFEA_SELECTED_PILOT_REVIEW_DISPLAY_SESSION_INTAKE_SCHEMA,
    sessionId: 'NB-T6F-STALE-HEAD',
    exactHeadSha: '0000000000000000000000000000000000000000',
    reviewHandoff,
    workbenchHandoff,
  }), 'LAFEA_NB_T6F_REVIEW_HANDOFF_INVALID');

const bridgeOther = createBridge(18);
const liveOther = createLiveController(bridgeOther);
const workbenchOther = installLafeaB7dWorkbenchDisplay({
  schema: LAFEA_B7D_WORKBENCH_DISPLAY_HANDOFF_INTAKE_SCHEMA,
  controller: liveOther.controller,
  bridge: bridgeOther,
});
expectCode('different valid live display', () =>
  createSession(reviewHandoff, workbenchOther),
'LAFEA_NB_T6F_CROSS_HANDOFF_LINEAGE_MISMATCH');

const promoted = structuredClone(session);
promoted.authority.codeReady = true;
assert.equal(validateLafeaSelectedPilotReviewDisplaySession(promoted).ok, false);
adversarialCount += 1;
const tamperedHash = structuredClone(session);
tamperedHash.sessionHash = fixture.hash('TAMPERED-NB-T6F-SESSION');
assert.equal(validateLafeaSelectedPilotReviewDisplaySession(tamperedHash).ok, false);
adversarialCount += 1;
const exposedBuffers = structuredClone(session);
exposedBuffers.displaySummary.typedArraysExposed = true;
assert.equal(validateLafeaSelectedPilotReviewDisplaySession(exposedBuffers).ok, false);
adversarialCount += 1;

live.controller.destroy();
liveOther.controller.destroy();

console.log(JSON.stringify({
  schema: 'lafea-nb-t6f-review-display-session-check/v1',
  status: 'PASS',
  exactHead: HEAD,
  pilot: 'C2D-LUG-PINHOLE -> LAFEA.3 -> REVIEW_AND_LIVE_DISPLAY',
  renderBridgeHash: session.renderBridgeHash,
  reviewPacketHash: session.reviewPacketHash,
  workbenchHandoffHash: session.workbenchHandoffHash,
  sessionHash: session.sessionHash,
  sceneRevision: session.sceneRevision,
  fieldId: session.fieldId,
  typedArraysExposed: false,
  adversarialCount,
  authority: session.authority,
}));

function createSelectedPilot() {
  const input = structuredClone(fixture.projectionInput);
  input.physicalProblem.modelIdentity = 'NB-T6F-C2D-LUG-PINHOLE';
  input.physicalProblem.sourceAncestry.sourceModelIdentity =
    'NB-T6F-C2D-LUG-PINHOLE';
  input.physicalProblem.sourceAncestry.adapterIdentity =
    'NB-T6F-REVIEW-DISPLAY-SESSION';
  input.physicalProblem.loadCase.resultant = [1000, 250];
  input.physicalProblem.limitations = [
    'CONCENTRIC_ANNULAR_LUG_PINHOLE_ONLY',
    'LOAD_DRIVEN_SELECTED_PILOT_QUALIFICATION',
  ];
  input.physicalProblem.kinematics = {
    mode: 'BOUNDARY_ZERO',
    ux: { xCoefficient: 0, yCoefficient: 0, constant: 0 },
    uy: { xCoefficient: 0, yCoefficient: 0, constant: 0 },
  };
  input.featureProjection.loadFeature = {
    featureId: 'LOAD-EDGE', role: 'RADIAL_QUARTER_0',
    baseStartEdge: 0, baseEdgeCount: 1,
  };
  input.featureProjection.boundaryFeature = {
    featureId: 'ROOT-REGION', role: 'RADIAL_QUARTER_2',
    baseStartEdge: 0, baseEdgeCount: 1,
  };
  input.producerRef = 'NB-T6F/C2D-LUG-PINHOLE/LAFEA.3';
  input.sourceAuthorityOriginRef = 'NB-T6F/C2D-LUG-PINHOLE';
  const projection = createLafeaLugPinholePhysicalProblemProjection(input);
  const benchmarkQualification = fixture.benchmark(
    projection.mappingPackage.semanticHash,
  );
  const execution = executeLafeaLugPinholePhysicalProblemBatch({
    schema: LAFEA_LUG_PINHOLE_EXECUTION_INTAKE_SCHEMA,
    projection,
    benchmarkQualification,
    requestId: 'NB-T6F-C2D-LUG-PINHOLE-LOAD-DRIVEN',
    recoveryProfileHash: fixture.hash('NB-T6F-INTEGRATION-POINT-RECOVERY'),
    convergenceRequest: {
      quantityId: 'PLANE_STRESS_SIGMA_Z_INVARIANT',
      units: 'MPa', tolerance: 1e-12, loadCaseId: 'LC1',
      component: 'SIGMA_Z', reducer: 'MAXIMUM_SIGNED',
    },
  });
  assert.equal(execution.status, 'ACCEPTED');
  const qualification = createLafeaLoadDrivenPilotQualification({
    qualificationId: 'NB-T6F-C2D-LUG-PINHOLE-QUALIFICATION',
    exactHeadSha: HEAD,
    projection,
    execution,
    tolerances: {
      equilibriumAbsolute: 1e-5,
      displacementRelative: 1,
      stressRelative: 1,
    },
  });
  return { projection, execution, qualification };
}

function createBridge(sceneRevision) {
  return createLafeaB7dRecoveryRenderBridge({
    schema: LAFEA_B7D_RECOVERY_RENDER_BRIDGE_INTAKE_SCHEMA,
    sceneRevision,
    projection: selectedPilot.projection,
    executionPackage: selectedPilot.execution,
    fieldRequest: {
      schema: LAFEA_RECOVERY_RENDER_FIELD_REQUEST_SCHEMA,
      fieldId: 'NB-T6F-FINEST-SIGMA-X-IP0',
      loadCaseId: 'LC1',
      quantity: 'SIGMA_X',
      units: 'MPa',
      colorMapId: 'LAFEA-DEFAULT-DIVERGING',
      location: {
        schema: LAFEA_RECOVERY_RENDER_LOCATION_SCHEMA,
        kind: 'INTEGRATION_POINT',
        integrationPointIndex: 0,
        surface: null,
      },
    },
  });
}

function createLiveController(bridgeValue) {
  const documentRef = new FakeDocument();
  const root = documentRef.createElement('main');
  const controller = new LafeaWorkbenchController(root, {
    initialStage: 'LAFEA.3',
    initialDocument: selectedPilot.projection.levels[0].document,
    initialSourceHash: bridgeValue.sourceHash,
    THREE: fakeThree(true),
  });
  const viewportState = Object.freeze({
    stageId: 'LAFEA.3',
    sceneRevision: bridgeValue.sceneRevision,
    mode: 'RESULT_REVIEW',
    status: 'READY',
  });
  const viewport = Object.freeze({
    scene: Object.freeze({ sourceSemanticHash: bridgeValue.sourceHash }),
    getState: () => viewportState,
    destroy() {},
  });
  controller.view.render = () => { controller.view.activeViewport = viewport; };
  controller.view.destroy = () => {
    controller.view.activeViewport = null;
    root.replaceChildren();
  };
  controller.benchmarkPanel.render = () => {};
  controller.benchmarkPanel.destroy = () => {};
  controller.init();
  const lifecycle = selectedPilot.execution.controllerResult.lifecycle;
  for (const kind of [
    'CANONICAL_MODEL', 'ANALYSIS_GEOMETRY', 'ANALYSIS_MESH',
    'EXECUTION', 'RECOVERY', 'CONVERGENCE',
  ]) {
    controller.registerLifecycleArtifact(
      lifecycle.artifacts[kind],
      `NB-T6F-${kind}-${lifecycle.artifacts[kind].artifactHash.slice(-12)}`,
    );
    assert.equal(controller.getState().status, 'READY', kind);
  }
  controller.applyLifecycleEvent(createLafeaLifecycleEvent({
    eventId: `NB-T6F-DISPLAY-GEOMETRY-${bridgeValue.sceneRevision}`,
    stageId: 'LAFEA.3',
    changeClass: 'DISPLAY_MESH_DENSITY',
    profileHash: bridgeValue.displayGeometryHash,
    originRef: 'NB-T6F-REVIEW-DISPLAY-SESSION',
  }));
  controller.applyLifecycleEvent(createLafeaLifecycleEvent({
    eventId: `NB-T6F-CONTOUR-PALETTE-${bridgeValue.sceneRevision}`,
    stageId: 'LAFEA.3',
    changeClass: 'CONTOUR_PALETTE',
    profileHash: bridgeValue.renderProfileHash,
    originRef: 'NB-T6F-REVIEW-DISPLAY-SESSION',
  }));
  return { controller };
}

function createSession(review, workbench) {
  return createLafeaSelectedPilotReviewDisplaySession({
    schema: LAFEA_SELECTED_PILOT_REVIEW_DISPLAY_SESSION_INTAKE_SCHEMA,
    sessionId: 'NB-T6F-C2D-LUG-PINHOLE-SESSION-001',
    exactHeadSha: HEAD,
    reviewHandoff: review,
    workbenchHandoff: workbench,
  });
}

function expectCode(label, body, code) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, code, `${label}: ${error?.code}`);
    return true;
  });
  adversarialCount += 1;
}

function sourceGuards() {
  const source = fs.readFileSync(path.join(
    ROOT,
    'src/workspace/lafea-selected-pilot-review-display-session.js',
  ), 'utf8');
  assert.doesNotMatch(source,
    /from ['"][^'"]*(?:local-continuum|lafea-workbench-controller|lafea-workbench-render-evidence|code|report)[^'"]*['"]/u);
  assert.doesNotMatch(source,
    /\b(?:executeLafeaStage|calculateLocalContinuum|registerLafeaArtifact|createLafeaB7dRecoveryRenderBridge|installLafeaB7dWorkbenchDisplay)\s*\(/u);
  assert.match(source, /validateLafeaSelectedPilotReviewHandoff/u);
  assert.match(source, /validateLafeaB7dWorkbenchDisplayHandoff/u);
  assert.match(source, /bufferFreeSessionReceipt:\s*true/u);
  assert.match(source, /engineeringEvidenceChanged:\s*false/u);
  assert.match(source, /lifecycleArtifactsRegistered:\s*false/u);
  assert.match(source, /displayValuesAuthoritative:\s*false/u);
  assert.match(source, /codeReady:\s*false/u);
  assert.match(source, /reportAuthority:\s*false/u);
  assert.match(source, /releaseQualified:\s*false/u);
  adversarialCount += 11;
}
