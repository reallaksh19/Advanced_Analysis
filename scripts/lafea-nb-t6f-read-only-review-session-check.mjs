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
  createLafeaB7dRecoveryRenderBridge,
  createLafeaLoadDrivenPilotQualification,
  createLafeaLugPinholePhysicalProblemProjection,
  createLafeaSelectedPilotReviewHandoff,
  createLafeaSelectedPilotReviewSession,
  executeLafeaLugPinholePhysicalProblemBatch,
  installLafeaB7dWorkbenchDisplay,
  parseLafeaSelectedPilotReviewSession,
  serializeLafeaSelectedPilotReviewSession,
  validateLafeaSelectedPilotReviewSession,
} from '../src/workspace/lafea-controlled-continuum-public.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import { createLafeaLifecycleEvent } from '../src/workspace/lafea-lifecycle.js';
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
const selected = createSelectedPilot();
const bridge = createLafeaB7dRecoveryRenderBridge({
  schema: LAFEA_B7D_RECOVERY_RENDER_BRIDGE_INTAKE_SCHEMA,
  sceneRevision: 17,
  projection: selected.projection,
  executionPackage: selected.execution,
  fieldRequest: fieldRequest(),
});
const reviewHandoff = createLafeaSelectedPilotReviewHandoff({
  handoffId: 'NB-T6F-PORTABLE-REVIEW-HANDOFF',
  exactHeadSha: HEAD,
  qualification: selected.qualification,
  projection: selected.projection,
  execution: selected.execution,
  renderBridge: bridge,
});
const live = createLiveController(selected.projection, selected.execution, bridge);
const displayHandoff = installLafeaB7dWorkbenchDisplay({
  schema: LAFEA_B7D_WORKBENCH_DISPLAY_HANDOFF_INTAKE_SCHEMA,
  controller: live.controller,
  bridge,
});
const session = createSession({ reviewHandoff, displayHandoff });

assert.equal(session.schema, 'lafea-selected-pilot-review-session/v1');
assert.equal(session.producerRevision, 'NB-T6F.1');
assert.equal(session.status, 'READ_ONLY_SELECTED_PILOT_REVIEW_SESSION_READY');
assert.equal(session.exactHeadSha, HEAD);
assert.equal(session.parentHashes.reviewHandoffHash, reviewHandoff.semanticHash);
assert.equal(session.parentHashes.reviewPacketHash,
  reviewHandoff.reviewPacket.packetHash);
assert.equal(session.parentHashes.auditReceiptHash,
  reviewHandoff.auditReceipt.evidenceHash);
assert.equal(session.parentHashes.workbenchDisplayHandoffHash,
  displayHandoff.handoffHash);
assert.equal(session.parentHashes.renderBridgeHash, bridge.bridgeHash);
assert.equal(session.parentHashes.sourceHash, bridge.sourceHash);
assert.equal(session.parentHashes.analysisMeshHash, bridge.analysisMeshHash);
assert.equal(session.parentHashes.executionHash, bridge.executionHash);
assert.equal(session.parentHashes.recoveryHash, bridge.recoveryHash);
assert.equal(session.parentHashes.convergenceHash, bridge.convergenceHash);
assert.deepEqual(session.levels.map((row) => row.elementCount), [16, 64, 256]);
assert.equal(session.levels.every((row) =>
  row.status === 'PASS'
  && row.freeDofCount > 0
  && row.solverMethod === 'DETERMINISTIC_CHOLESKY'
  && row.retainedRecoveryAuthority === 'INTEGRATION_POINT_ENGINEERING_RESULT'),
true);
assert.equal(session.convergence.displacementStatus, 'PASS');
assert.equal(session.convergence.retainedStressStatus, 'PASS');
assert.equal(session.convergence.reinterpreted, false);
assert.equal(session.convergence.newConvergenceProduced, false);
assert.equal(session.finestResult.ordinal, 3);
assert.equal(session.finestResult.elementCount, 256);
assert.equal(session.finestResult.retainedSourceCount, 256);
assert.equal(session.finestResult.retainedResultAuthority,
  'INTEGRATION_POINT_ENGINEERING_RESULT');
assert.equal(session.finestResult.displayProjectionAuthority, false);
assert.equal(session.displayBinding.status, 'DISPLAY_PACKET_BOUND');
assert.equal(session.displayBinding.renderEvidenceReady, true);
assert.equal(session.displayBinding.packetBindingStatus, 'BOUND');
assert.equal(session.displayBinding.lifecycleBindingStatus, 'CURRENT');
assert.equal(session.displayBinding.packetBuffersIncluded, false);
assert.equal(session.displayBinding.displayValuesAuthoritative, false);
assert.equal(session.reviewSections.length, 6);
assert.equal(session.authority.readOnlyReviewSessionReady, true);
assert.equal(session.authority.portableAuditLinked, true);
assert.equal(session.authority.liveDisplayBindingLinked, true);
assert.equal(session.authority.engineeringEvidenceChanged, false);
assert.equal(session.authority.solverExecuted, false);
assert.equal(session.authority.newEngineeringRecoveryProduced, false);
assert.equal(session.authority.newConvergenceProduced, false);
assert.equal(session.authority.newDisplayProjectionProduced, false);
assert.equal(session.authority.lifecycleArtifactsRegistered, false);
assert.equal(session.authority.displayValuesAuthoritative, false);
assert.equal(session.authority.generalT7dAuthorized, false);
assert.equal(session.authority.shellAuthorized, false);
assert.equal(session.authority.assessmentReady, false);
assert.equal(session.authority.codeReady, false);
assert.equal(session.authority.reportAuthority, false);
assert.equal(session.authority.releaseQualified, false);
assert.equal(Object.isFrozen(session), true);
assert.equal(validateLafeaSelectedPilotReviewSession(session).ok, true);

const replay = createSession({ reviewHandoff, displayHandoff });
assert.equal(replay.sessionHash, session.sessionHash);
const serialized = serializeLafeaSelectedPilotReviewSession(session);
const parsed = parseLafeaSelectedPilotReviewSession(serialized);
assert.deepEqual(parsed, session);
assert.equal(validateLafeaSelectedPilotReviewSession(parsed).ok, true);

expectCode('stale exact head', () => createLafeaSelectedPilotReviewSession({
  sessionId: 'NB-T6F-STALE-HEAD',
  exactHeadSha: '0000000000000000000000000000000000000000',
  reviewHandoff,
  displayHandoff,
}), 'LAFEA_NB_T6F_EXACT_HEAD_PARENT_STALE');

const wrongBridge = rehashDisplayHandoff(displayHandoff, {
  bridgeHash: fixture.hash('NB-T6F-WRONG-BRIDGE'),
});
expectCode('wrong bridge parent', () => createSession({
  reviewHandoff,
  displayHandoff: wrongBridge,
}), 'LAFEA_NB_T6F_RENDER_BRIDGE_PARENT_MISMATCH');

const wrongSourceHash = fixture.hash('NB-T6F-WRONG-SOURCE');
const wrongSource = rehashDisplayHandoff(displayHandoff, {
  sourceHash: wrongSourceHash,
  contextBefore: {
    ...displayHandoff.contextBefore,
    sourceSemanticHash: wrongSourceHash,
  },
  contextAfter: {
    ...displayHandoff.contextAfter,
    sourceSemanticHash: wrongSourceHash,
  },
});
expectCode('wrong source parent', () => createSession({
  reviewHandoff,
  displayHandoff: wrongSource,
}), 'LAFEA_NB_T6F_SOURCE_PARENT_MISMATCH');

for (const [label, key, code] of [
  ['wrong mesh parent', 'analysisMeshHash', 'LAFEA_NB_T6F_MESH_PARENT_MISMATCH'],
  ['wrong execution parent', 'executionHash', 'LAFEA_NB_T6F_EXECUTION_PARENT_MISMATCH'],
  ['wrong recovery parent', 'recoveryHash', 'LAFEA_NB_T6F_RECOVERY_PARENT_MISMATCH'],
  ['wrong convergence parent', 'convergenceHash', 'LAFEA_NB_T6F_CONVERGENCE_PARENT_MISMATCH'],
  ['wrong display geometry parent', 'displayGeometryHash',
    'LAFEA_NB_T6F_DISPLAY_GEOMETRY_PARENT_MISMATCH'],
  ['wrong render profile parent', 'renderProfileHash',
    'LAFEA_NB_T6F_RENDER_PROFILE_PARENT_MISMATCH'],
]) {
  const changed = rehashDisplayHandoff(displayHandoff, {
    [key]: fixture.hash(`NB-T6F-${key}`),
  });
  expectCode(label, () => createSession({
    reviewHandoff,
    displayHandoff: changed,
  }), code);
}

const changedSceneRevision = displayHandoff.sceneRevision + 1;
const wrongScene = rehashDisplayHandoff(displayHandoff, {
  sceneRevision: changedSceneRevision,
  contextBefore: {
    ...displayHandoff.contextBefore,
    sceneRevision: changedSceneRevision,
  },
  contextAfter: {
    ...displayHandoff.contextAfter,
    sceneRevision: changedSceneRevision,
  },
  packetBinding: {
    ...displayHandoff.packetBinding,
    sceneRevision: changedSceneRevision,
  },
});
expectCode('wrong scene parent', () => createSession({
  reviewHandoff,
  displayHandoff: wrongScene,
}), 'LAFEA_NB_T6F_SCENE_REVISION_PARENT_MISMATCH');

const wrongField = rehashDisplayHandoff(displayHandoff, {
  fieldId: 'NB-T6F-OTHER-FIELD',
  packetBinding: {
    ...displayHandoff.packetBinding,
    fieldId: 'NB-T6F-OTHER-FIELD',
  },
});
expectCode('wrong field parent', () => createSession({
  reviewHandoff,
  displayHandoff: wrongField,
}), 'LAFEA_NB_T6F_FIELD_PARENT_MISMATCH');

const reorderedReview = structuredClone(reviewHandoff);
reorderedReview.reviewPacket.levels.reverse();
expectCode('reordered review levels', () => createSession({
  reviewHandoff: reorderedReview,
  displayHandoff,
}), 'LAFEA_NB_T6F_REVIEW_HANDOFF_INVALID');

const promoted = structuredClone(session);
promoted.authority.reportAuthority = true;
assert.equal(validateLafeaSelectedPilotReviewSession(promoted).ok, false);
adversarialCount += 1;

const tampered = structuredClone(session);
tampered.displayBinding.fieldId = 'TAMPERED';
assert.equal(validateLafeaSelectedPilotReviewSession(tampered).ok, false);
adversarialCount += 1;

expectCode('malformed portable JSON', () =>
  parseLafeaSelectedPilotReviewSession('{invalid-json'),
'LAFEA_NB_T6F_SERIALIZED_JSON_INVALID');

live.controller.destroy();

console.log(JSON.stringify({
  schema: 'lafea-nb-t6f-read-only-review-session-check/v1',
  status: 'PASS',
  exactHead: HEAD,
  pilot: 'C2D-LUG-PINHOLE -> LAFEA.3 -> READ_ONLY_REVIEW_SESSION',
  sessionHash: session.sessionHash,
  reviewHandoffHash: session.parentHashes.reviewHandoffHash,
  displayHandoffHash: session.parentHashes.workbenchDisplayHandoffHash,
  levelElementCounts: session.levels.map((row) => row.elementCount),
  retainedSourceCount: session.finestResult.retainedSourceCount,
  packetBuffersIncluded: session.displayBinding.packetBuffersIncluded,
  adversarialCount,
  authority: session.authority,
}));

function createSession(overrides = {}) {
  return createLafeaSelectedPilotReviewSession({
    sessionId: 'NB-T6F-C2D-LUG-PINHOLE-REVIEW-SESSION-001',
    exactHeadSha: HEAD,
    reviewHandoff,
    displayHandoff,
    ...overrides,
  });
}

function createSelectedPilot() {
  const input = structuredClone(fixture.projectionInput);
  input.physicalProblem.modelIdentity = 'NB-T6F-C2D-LUG-PINHOLE';
  input.physicalProblem.sourceAncestry.sourceModelIdentity =
    'NB-T6F-C2D-LUG-PINHOLE';
  input.physicalProblem.sourceAncestry.adapterIdentity =
    'NB-T6F-READ-ONLY-REVIEW-SESSION';
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
    featureId: 'LOAD-EDGE',
    role: 'RADIAL_QUARTER_0',
    baseStartEdge: 0,
    baseEdgeCount: 1,
  };
  input.featureProjection.boundaryFeature = {
    featureId: 'ROOT-REGION',
    role: 'RADIAL_QUARTER_2',
    baseStartEdge: 0,
    baseEdgeCount: 1,
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
      units: 'MPa',
      tolerance: 1e-12,
      loadCaseId: 'LC1',
      component: 'SIGMA_Z',
      reducer: 'MAXIMUM_SIGNED',
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

function fieldRequest() {
  return {
    schema: 'lafea-recovery-render-field-request/v1',
    fieldId: 'NB-T6F-FINEST-SIGMA-X-IP0',
    loadCaseId: 'LC1',
    quantity: 'SIGMA_X',
    units: 'MPa',
    colorMapId: 'LAFEA-DEFAULT-DIVERGING',
    location: {
      schema: 'lafea-recovery-render-location/v1',
      kind: 'INTEGRATION_POINT',
      integrationPointIndex: 0,
      surface: null,
    },
  };
}

function createLiveController(projectionValue, executionValue, bridgeValue) {
  const documentRef = new FakeDocument();
  const root = documentRef.createElement('main');
  const controller = new LafeaWorkbenchController(root, {
    initialStage: 'LAFEA.3',
    initialDocument: projectionValue.levels[0].document,
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
  controller.view.render = () => {
    controller.view.activeViewport = viewport;
  };
  controller.view.destroy = () => {
    controller.view.activeViewport = null;
    root.replaceChildren();
  };
  controller.benchmarkPanel.render = () => {};
  controller.benchmarkPanel.destroy = () => {};
  controller.init();
  const lifecycle = executionValue.controllerResult.lifecycle;
  for (const kind of [
    'CANONICAL_MODEL', 'ANALYSIS_GEOMETRY', 'ANALYSIS_MESH',
    'EXECUTION', 'RECOVERY', 'CONVERGENCE',
  ]) {
    controller.registerLifecycleArtifact(
      lifecycle.artifacts[kind],
      `NB-T6F-${kind}-${lifecycle.artifacts[kind].artifactHash.slice(-12)}`,
    );
  }
  controller.applyLifecycleEvent(createLafeaLifecycleEvent({
    eventId: 'NB-T6F-DISPLAY-GEOMETRY',
    stageId: 'LAFEA.3',
    changeClass: 'DISPLAY_MESH_DENSITY',
    profileHash: bridgeValue.displayGeometryHash,
    originRef: 'NB-T6F-REVIEW-SESSION',
  }));
  controller.applyLifecycleEvent(createLafeaLifecycleEvent({
    eventId: 'NB-T6F-CONTOUR-PALETTE',
    stageId: 'LAFEA.3',
    changeClass: 'CONTOUR_PALETTE',
    profileHash: bridgeValue.renderProfileHash,
    originRef: 'NB-T6F-REVIEW-SESSION',
  }));
  const exported = controller.exportLifecycle();
  assert.equal(exported.binding.status, 'CURRENT');
  assert.equal(exported.readiness.resultReady, true);
  assert.equal(exported.readiness.convergenceReady, true);
  assert.equal(exported.readiness.codeReady, false);
  return { controller };
}

function rehashDisplayHandoff(value, overrides) {
  const changed = {
    ...structuredClone(value),
    ...structuredClone(overrides),
  };
  delete changed.handoffHash;
  return Object.freeze({
    ...changed,
    handoffHash: canonicalLafeaSha256({
      schema: 'lafea-b7d-workbench-display-handoff-hash-input/v1',
      producerRevision: 'NB-T6E.1',
      value: changed,
    }),
  });
}

function expectCode(label, body, code) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, code, `${label}: ${error?.code} ${error?.message}`);
    return true;
  });
  adversarialCount += 1;
}

function sourceGuards() {
  const source = fs.readFileSync(path.join(
    ROOT,
    'src/workspace/lafea-selected-pilot-review-session.js',
  ), 'utf8');
  const publicSource = fs.readFileSync(path.join(
    ROOT,
    'src/workspace/lafea-controlled-continuum-public.js',
  ), 'utf8');
  assert.doesNotMatch(source,
    /from ['"][^'"]*(?:local-continuum|lafea-workbench-controller|lafea-workbench-model)[^'"]*['"]/u);
  assert.doesNotMatch(source,
    /\b(?:calculateLocalContinuum|executeLafeaStage|executeControlledLafeaContinuumPilot|createLafeaB7dRecoveryRenderBridge|installLafeaB7dWorkbenchDisplay|registerLafeaArtifact|setDisplayRenderPacket)\s*\(/u);
  assert.doesNotMatch(source, /\b(?:smooth|smoothing|averageWithinGroups)\s*\(/u);
  assert.match(source, /validateLafeaSelectedPilotReviewHandoff/u);
  assert.match(source, /validateLafeaB7dWorkbenchDisplayHandoff/u);
  assert.match(source, /displayValuesAuthoritative:\s*false/u);
  assert.match(source, /releaseQualified:\s*false/u);
  assert.match(publicSource,
    /export\s*\{[\s\S]*LAFEA_B7D_WORKBENCH_DISPLAY_HANDOFF_SCHEMA[\s\S]*\}\s*from '\.\/lafea-b7d-workbench-display-handoff\.js';/u);
  assert.match(publicSource,
    /LAFEA_SELECTED_PILOT_REVIEW_SESSION_SCHEMA/u);
  adversarialCount += 9;
}
