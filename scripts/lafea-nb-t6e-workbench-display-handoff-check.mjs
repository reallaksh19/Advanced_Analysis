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
  createLafeaLugPinholePhysicalProblemProjection,
  executeLafeaLugPinholePhysicalProblemBatch,
  installLafeaB7dWorkbenchDisplay,
  validateLafeaB7dWorkbenchDisplayHandoff,
} from '../src/workspace/lafea-controlled-continuum-public.js';
import { createLafeaLifecycleEvent } from '../src/workspace/lafea-lifecycle.js';
import { LafeaWorkbenchController } from '../src/workspace/lafea-workbench-controller.js';
import {
  lafeaWorkbenchDisplayRenderPacket,
} from '../src/workspace/lafea-workbench-render-evidence.js';
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
const projection = createLafeaLugPinholePhysicalProblemProjection(
  fixture.projectionInput,
);
const benchmark = fixture.benchmark(projection.mappingPackage.semanticHash);
const executionPackage = executeLafeaLugPinholePhysicalProblemBatch({
  schema: LAFEA_LUG_PINHOLE_EXECUTION_INTAKE_SCHEMA,
  projection,
  benchmarkQualification: benchmark,
  requestId: 'NB-T6E-C2D-LUG-PINHOLE-001',
  recoveryProfileHash: fixture.hash('NB-T6E-INTEGRATION-POINT-RECOVERY'),
  convergenceRequest: {
    quantityId: 'PINHOLE_MAX_RETAINED_VON_MISES',
    units: 'MPa',
    tolerance: 1e-8,
    loadCaseId: 'LC1',
    component: 'VON_MISES',
    reducer: 'MAXIMUM_SIGNED',
  },
});
assert.equal(executionPackage.status, 'ACCEPTED');
const bridge = createLafeaB7dRecoveryRenderBridge({
  schema: LAFEA_B7D_RECOVERY_RENDER_BRIDGE_INTAKE_SCHEMA,
  sceneRevision: 11,
  projection,
  executionPackage,
  fieldRequest: {
    schema: 'lafea-recovery-render-field-request/v1',
    fieldId: 'NB_T6E_FINE_SIGMA_X_IP0',
    loadCaseId: 'LC1',
    quantity: 'SIGMA_X',
    units: 'MPa',
    colorMapId: 'COOL_WARM',
    location: {
      schema: 'lafea-recovery-render-location/v1',
      kind: 'INTEGRATION_POINT',
      integrationPointIndex: 0,
      surface: null,
    },
  },
});

const live = createLiveController(projection, executionPackage, bridge);
const handoff = installLafeaB7dWorkbenchDisplay({
  schema: LAFEA_B7D_WORKBENCH_DISPLAY_HANDOFF_INTAKE_SCHEMA,
  controller: live.controller,
  bridge,
});
assert.equal(handoff.status, 'DISPLAY_PACKET_BOUND');
assert.equal(validateLafeaB7dWorkbenchDisplayHandoff(handoff).ok, true);
assert.equal(handoff.stageId, 'LAFEA.3');
assert.equal(handoff.bridgeHash, bridge.bridgeHash);
assert.equal(handoff.sourceHash, bridge.sourceHash);
assert.equal(handoff.analysisMeshHash, bridge.analysisMeshHash);
assert.equal(handoff.executionHash, bridge.executionHash);
assert.equal(handoff.recoveryHash, bridge.recoveryHash);
assert.equal(handoff.convergenceHash, bridge.convergenceHash);
assert.equal(handoff.sceneRevision, bridge.sceneRevision);
assert.equal(handoff.fieldId, bridge.fieldRequest.fieldId);
assert.equal(handoff.renderIntake.status, 'READY');
assert.equal(handoff.renderIntake.renderEvidenceReady, true);
assert.deepEqual(handoff.renderIntake.blockingReasons, []);
assert.equal(handoff.packetBinding.status, 'BOUND');
assert.equal(handoff.lifecycleBinding.status, 'CURRENT');
assert.equal(handoff.authority.packetBound, true);
assert.equal(handoff.authority.renderEvidenceReady, true);
assert.equal(handoff.authority.currentViewportMatched, true);
assert.equal(handoff.authority.engineeringEvidenceChanged, false);
assert.equal(handoff.authority.lifecycleArtifactsRegistered, false);
assert.equal(handoff.authority.codeReady, false);
assert.equal(handoff.authority.releaseQualified, false);
assert.equal(Object.isFrozen(handoff), true);
assert.equal('packet' in handoff, false);
assert.equal('renderPacket' in handoff, false);
assert.equal('positions' in handoff, false);
assert.deepEqual(handoff.contextBefore, handoff.contextAfter);

const retained = lafeaWorkbenchDisplayRenderPacket(live.controller, 'LAFEA.3');
assert.ok(retained);
assert.equal(retained.lineage.executionHash, bridge.executionHash);
assert.equal(retained.lineage.recoveryHash, bridge.recoveryHash);
assert.equal(retained.field.fieldId, bridge.fieldRequest.fieldId);
assert.notStrictEqual(retained, bridge.renderPacket);
assert.notStrictEqual(retained.positions, bridge.renderPacket.positions);
assert.equal(live.renderCount(), 2);

const repeated = installLafeaB7dWorkbenchDisplay({
  schema: LAFEA_B7D_WORKBENCH_DISPLAY_HANDOFF_INTAKE_SCHEMA,
  controller: live.controller,
  bridge,
});
assert.equal(repeated.handoffHash, handoff.handoffHash);
assert.equal(live.renderCount(), 3);

expectCode('missing viewport', () => install(withController(live.controller, {
  getDisplayViewportContext: () => null,
})), 'LAFEA_NB_T6E_RECORD_INVALID');
expectCode('scene revision mismatch', () => install(withController(live.controller, {
  getDisplayViewportContext: () => ({
    ...live.controller.getDisplayViewportContext(),
    sceneRevision: bridge.sceneRevision + 1,
  }),
})), 'LAFEA_NB_T6E_BEFORE_VIEWPORT_CONTEXT_MISMATCH');
expectCode('source mismatch', () => install(withController(live.controller, {
  getDisplayViewportContext: () => ({
    ...live.controller.getDisplayViewportContext(),
    sourceSemanticHash: fixture.hash('OTHER-SOURCE'),
  }),
})), 'LAFEA_NB_T6E_BEFORE_VIEWPORT_CONTEXT_MISMATCH');
expectCode('stale lifecycle binding', () => install(withController(live.controller, {
  exportLifecycle: () => {
    const value = structuredClone(live.controller.exportLifecycle());
    value.binding.status = 'STALE_DOCUMENT_REVISION';
    value.binding.currentDocumentDigest = 'fnv1a64:0000000000000000';
    value.binding.reason = 'DOCUMENT_REVISION_CHANGED_WITHOUT_SOURCE_HASH_EVENT';
    return value;
  },
})), 'LAFEA_NB_T6E_LIFECYCLE_NOT_CURRENT_RESULT_READY');
expectCode('display profile mismatch', () => install(withController(live.controller, {
  exportLifecycle: () => {
    const value = structuredClone(live.controller.exportLifecycle());
    value.lifecycle.display.contourPaletteHash = fixture.hash('OTHER-PROFILE');
    return value;
  },
})), 'LAFEA_NB_T6E_RENDER_EVIDENCE_NOT_READY');
expectCode('binding summary mismatch', () => install(withController(live.controller, {
  setDisplayRenderPacket: () => ({
    schema: 'lafea-workbench-display-packet-binding/v1',
    stageId: 'LAFEA.3',
    sceneRevision: bridge.sceneRevision,
    fieldId: 'OTHER-FIELD',
    status: 'BOUND',
  }),
})), 'LAFEA_NB_T6E_PACKET_BINDING_INVALID');
expectCode('context changed after bind', () => {
  let count = 0;
  install(withController(live.controller, {
    getDisplayViewportContext: () => {
      count += 1;
      const value = live.controller.getDisplayViewportContext();
      return count === 1 ? value : { ...value, sceneRevision: value.sceneRevision + 1 };
    },
  }));
}, 'LAFEA_NB_T6E_AFTER_VIEWPORT_CONTEXT_MISMATCH');
const tampered = structuredClone(handoff);
tampered.handoffHash = fixture.hash('TAMPERED-HANDOFF');
assert.equal(validateLafeaB7dWorkbenchDisplayHandoff(tampered).ok, false);
adversarialCount += 1;

live.controller.destroy();

console.log(JSON.stringify({
  schema: 'lafea-nb-t6e-workbench-display-handoff-check/v1',
  status: 'PASS',
  exactHead: HEAD,
  pilot: 'C2D-LUG-PINHOLE -> LAFEA.3 -> LIVE_WORKBENCH',
  bridgeHash: bridge.bridgeHash,
  handoffHash: handoff.handoffHash,
  sceneRevision: handoff.sceneRevision,
  fieldId: handoff.fieldId,
  packetBound: handoff.authority.packetBound,
  renderEvidenceReady: handoff.authority.renderEvidenceReady,
  typedArraysExposedByReceipt: false,
  adversarialCount,
  authority: handoff.authority,
}));

function createLiveController(projectionValue, executionValue, bridgeValue) {
  const documentRef = new FakeDocument();
  const root = documentRef.createElement('main');
  let count = 0;
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
    count += 1;
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
      `NB-T6E-${kind}-${lifecycle.artifacts[kind].artifactHash.slice(-12)}`,
    );
    assert.equal(controller.getState().status, 'READY', kind);
  }
  controller.applyLifecycleEvent(createLafeaLifecycleEvent({
    eventId: 'NB-T6E-DISPLAY-GEOMETRY',
    stageId: 'LAFEA.3',
    changeClass: 'DISPLAY_MESH_DENSITY',
    profileHash: bridgeValue.displayGeometryHash,
    originRef: 'NB-T6E-WORKBENCH-HANDOFF',
  }));
  controller.applyLifecycleEvent(createLafeaLifecycleEvent({
    eventId: 'NB-T6E-CONTOUR-PALETTE',
    stageId: 'LAFEA.3',
    changeClass: 'CONTOUR_PALETTE',
    profileHash: bridgeValue.renderProfileHash,
    originRef: 'NB-T6E-WORKBENCH-HANDOFF',
  }));
  const exported = controller.exportLifecycle();
  assert.equal(exported.binding.status, 'CURRENT');
  assert.equal(exported.readiness.resultReady, true);
  assert.equal(exported.readiness.convergenceReady, true);
  assert.equal(exported.readiness.codeReady, false);
  return { controller, renderCount: () => count };
}

function install(controller) {
  return installLafeaB7dWorkbenchDisplay({
    schema: LAFEA_B7D_WORKBENCH_DISPLAY_HANDOFF_INTAKE_SCHEMA,
    controller,
    bridge,
  });
}

function withController(controller, overrides) {
  return {
    getDisplayViewportContext: overrides.getDisplayViewportContext
      ?? (() => controller.getDisplayViewportContext()),
    exportLifecycle: overrides.exportLifecycle
      ?? (() => controller.exportLifecycle()),
    setDisplayRenderPacket: overrides.setDisplayRenderPacket
      ?? ((packet) => controller.setDisplayRenderPacket(packet)),
  };
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
    'src/workspace/lafea-b7d-workbench-display-handoff.js',
  ), 'utf8');
  assert.doesNotMatch(source,
    /lafea-workbench-render-evidence\.js|lafea-workbench-controller\.js/u);
  assert.doesNotMatch(source,
    /\b(?:registerLafeaArtifact|createLafeaArtifactRecord|executeLafeaStage|calculateLocalContinuum)\s*\(/u);
  assert.doesNotMatch(source,
    /from ['"][^'"]*(?:local-continuum|local-shell|code|report)[^'"]*['"]/u);
  assert.match(source, /evaluateLafeaRenderEvidenceIntake/u);
  assert.match(source, /getDisplayViewportContext/u);
  assert.match(source, /exportLifecycle/u);
  assert.match(source, /setDisplayRenderPacket/u);
  assert.match(source, /engineeringEvidenceChanged:\s*false/u);
  assert.match(source, /lifecycleArtifactsRegistered:\s*false/u);
  adversarialCount += 9;
}
