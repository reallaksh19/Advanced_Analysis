#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mountLafeaSelectedPilotReviewPanel,
  validateLafeaSelectedPilotReviewPanelReceipt,
} from '../src/workspace/lafea-controlled-continuum-public.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import { FakeDocument } from './lafea-u4g-fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: ROOT, encoding: 'utf8',
}).trim();
let adversarialCount = 0;
sourceGuards();

const session = fixtureSession();
const live = controllerFor(session);
const documentRef = new FakeDocument();
const host = documentRef.createElement('div');
documentRef.body.append(host);
const panel = mountLafeaSelectedPilotReviewPanel({
  hostElement: host, controller: live.controller, session,
});
let receipt = panel.getReceipt();

assert.equal(receipt.activeSection, 'BASIS');
assert.equal(receipt.sessionHash, session.sessionHash);
assert.equal(receipt.sourceHash, session.parentHashes.sourceHash);
assert.equal(receipt.authority.controllerMutated, false);
assert.equal(receipt.authority.engineeringEvidenceChanged, false);
assert.equal(receipt.authority.displayValuesAuthoritative, false);
assert.equal(receipt.authority.releaseQualified, false);
assert.equal(validateLafeaSelectedPilotReviewPanelReceipt(receipt).ok, true);
assert.equal(typed(receipt), false);
assert.equal(
  host.querySelectorAll('[data-role="lafea-selected-pilot-review-section"]').length,
  6,
);

for (const row of session.reviewSections) {
  receipt = panel.selectSection(row.sectionId);
  assert.equal(receipt.activeSection, row.sectionId);
  assert.equal(
    host.querySelector('[data-role="lafea-selected-pilot-review-content"]')
      .dataset.sectionId,
    row.sectionId,
  );
}
host.querySelector('[data-section-id="BASIS"]').dispatchEvent({ type: 'click' });
assert.equal(panel.getReceipt().activeSection, 'BASIS');
assert.equal(live.calls.mutations, 0);

expect('bad section', () => panel.selectSection('ASSESSMENT'),
  'LAFEA_NB_T6G_SECTION_INVALID');
const tampered = structuredClone(session);
tampered.sessionHash = hash('TAMPER');
expect('bad session', () => mount(tampered, live.controller),
  'LAFEA_NB_T6G_SESSION_INVALID');
expect('stale viewport', () => mount(session,
  controllerFor(session, { sceneRevision: 99 }).controller),
'LAFEA_NB_T6G_VIEWPORT_CONTEXT_STALE');
expect('stale binding', () => mount(session,
  controllerFor(session, {}, { status: 'STALE_DOCUMENT_REVISION' }).controller),
'LAFEA_NB_T6G_LIFECYCLE_CONTEXT_STALE');
expect('wrong result', () => mount(session,
  controllerFor(session, {}, {}, { EXECUTION: hash('OTHER') }).controller),
'LAFEA_NB_T6G_LIFECYCLE_ARTIFACT_STALE');
const receiptTamper = structuredClone(panel.getReceipt());
receiptTamper.activeSection = 'CONVERGENCE';
assert.equal(validateLafeaSelectedPilotReviewPanelReceipt(receiptTamper).ok, false);
adversarialCount += 1;

panel.destroy();
assert.equal(host.children.length, 0);
expect('destroyed', () => panel.getReceipt(), 'LAFEA_NB_T6G_PANEL_DESTROYED');

console.log(JSON.stringify({
  schema: 'lafea-nb-t6g-read-only-review-panel-check/v1',
  status: 'PASS',
  exactHead: HEAD,
  sectionCount: session.reviewSections.length,
  controllerReads: live.calls,
  controllerMutations: live.calls.mutations,
  typedArraysExposedByReceipt: false,
  adversarialCount,
  authority: receipt.authority,
}));

function mount(value, controller) {
  const doc = new FakeDocument();
  const target = doc.createElement('div');
  return mountLafeaSelectedPilotReviewPanel({
    hostElement: target, controller, session: value,
  });
}

function controllerFor(value, viewportOverrides = {}, bindingOverrides = {},
  artifactOverrides = {}) {
  const calls = { viewport: 0, lifecycle: 0, mutations: 0 };
  const artifacts = Object.fromEntries([
    ['ANALYSIS_MESH', value.parentHashes.analysisMeshHash],
    ['EXECUTION', value.parentHashes.executionHash],
    ['RECOVERY', value.parentHashes.recoveryHash],
    ['CONVERGENCE', value.parentHashes.convergenceHash],
  ].map(([kind, artifactHash]) => [kind, {
    status: 'CURRENT',
    qualification: 'PASS',
    artifactHash: artifactOverrides[kind] ?? artifactHash,
  }]));
  return {
    calls,
    controller: {
      getDisplayViewportContext() {
        calls.viewport += 1;
        return {
          schema: 'lafea-workbench-display-context/v1',
          stageId: value.stageId,
          sceneRevision: value.displayBinding.sceneRevision,
          sourceSemanticHash: value.parentHashes.sourceHash,
          mode: value.displayBinding.viewportMode,
          status: value.displayBinding.viewportStatus,
          ...viewportOverrides,
        };
      },
      exportLifecycle() {
        calls.lifecycle += 1;
        return {
          schema: 'lafea-workbench-lifecycle-export/v1',
          stageId: value.stageId,
          lifecycle: {
            stageId: value.stageId,
            source: { status: 'CURRENT', sourceHash: value.parentHashes.sourceHash },
            artifacts,
          },
          binding: {
            status: 'CURRENT',
            boundDocumentDigest: 'fnv1a64:current',
            currentDocumentDigest: 'fnv1a64:current',
            ...bindingOverrides,
          },
          readiness: {
            meshQualified: true, resultReady: true,
            convergenceReady: true, codeReady: false,
          },
        };
      },
      run() { calls.mutations += 1; },
      setDisplayRenderPacket() { calls.mutations += 1; },
      registerLifecycleArtifact() { calls.mutations += 1; },
    },
  };
}

function fixtureSession() {
  const hashes = Object.fromEntries([
    'reviewHandoff', 'reviewPacket', 'auditReceipt', 'portablePayload',
    'workbenchDisplayHandoff', 'renderBridge', 'source', 'analysisMesh',
    'execution', 'recovery', 'convergence', 'displayGeometry', 'renderProfile',
  ].map((key) => [`${key}Hash`, hash(key)]));
  const authority = {
    readOnlyReviewSessionReady: true, portableAuditLinked: true,
    liveDisplayBindingLinked: true, engineeringEvidenceChanged: false,
    solverExecuted: false, newEngineeringRecoveryProduced: false,
    newConvergenceProduced: false, newDisplayProjectionProduced: false,
    lifecycleArtifactsRegistered: false, displayValuesAuthoritative: false,
    generalT7dAuthorized: false, additionalContinuumTemplatesAuthorized: false,
    shellAuthorized: false, sclAuthorized: false,
    structuralStressAuthorized: false, assessmentReady: false,
    codeReady: false, reportAuthority: false, releaseQualified: false,
    lafea6Enabled: false,
  };
  const base = {
    schema: 'lafea-selected-pilot-review-session/v1',
    producerRevision: 'NB-T6F.1',
    sessionId: 'NB-T6G-SESSION-001',
    exactHeadSha: HEAD,
    templateId: 'C2D-LUG-PINHOLE',
    stageId: 'LAFEA.3',
    parentHashes: hashes,
    physicalProblem: {
      modelIdentity: 'NB-T6G-LUG', modelVersion: '1',
      formulation: 'PLANE_STRESS',
      units: { length: 'm', force: 'N', stress: 'MPa' },
      materialId: 'MAT-1', thickness: 0.02, loadCaseId: 'LC1',
      appliedResultant: [1000, 250],
      geometryClass: 'CONCENTRIC_ANNULAR_LUG_PINHOLE',
    },
    levels: [1, 2, 3].map((ordinal) => ({
      ordinal, meshHash: hash(`mesh-${ordinal}`),
      meshProfileHash: hash(`profile-${ordinal}`),
      nodeCount: ordinal * 100, elementCount: 16 * 4 ** (ordinal - 1),
      projectedResultant: [1000, 250], reactionResultant: [-1000, -250],
      equilibriumClosure: [0, 0], freeDofCount: ordinal * 10,
      constrainedDofCount: ordinal * 4,
      solverMethod: 'DETERMINISTIC_CHOLESKY',
      maximumDisplacementMagnitude: ordinal / 1000,
      maximumRetainedVonMises: ordinal * 10,
      resultHash: hash(`result-${ordinal}`),
      recoveryHash: ordinal === 3 ? hashes.recoveryHash : hash(`recovery-${ordinal}`),
      retainedRecoveryAuthority: 'INTEGRATION_POINT_ENGINEERING_RESULT',
      status: 'PASS', semanticHash: hash(`level-${ordinal}`),
    })),
    convergence: {
      displacementHash: hash('disp-convergence'),
      retainedStressHash: hash('stress-convergence'),
      controllerConvergenceHash: hashes.convergenceHash,
      displacementStatus: 'PASS', retainedStressStatus: 'PASS',
      reinterpreted: false, newConvergenceProduced: false,
    },
    finestResult: {
      ordinal: 3, meshHash: hash('mesh-3'),
      meshArtifactHash: hashes.analysisMeshHash, elementCount: 256,
      executionHash: hashes.executionHash, resultHash: hash('result-3'),
      recoveryHash: hashes.recoveryHash, convergenceHash: hashes.convergenceHash,
      integrationPointResultHash: hash('ip-result'), requestedQuantity: 'SIGMA_X',
      requestedLocation: { kind: 'INTEGRATION_POINT', integrationPointIndex: 0 },
      retainedSourceCount: 256,
      retainedResultAuthority: 'INTEGRATION_POINT_ENGINEERING_RESULT',
      displayProjectionAuthority: false, assessmentAuthority: false,
      crossElementSmoothingPerformed: false, nodalAveragingPerformed: false,
      semanticHash: hash('finest'),
    },
    displayBinding: {
      sceneRevision: 17, fieldId: 'SIGMA-X-IP0',
      status: 'DISPLAY_PACKET_BOUND', renderIntakeStatus: 'READY',
      renderEvidenceReady: true, packetBindingStatus: 'BOUND',
      lifecycleBindingStatus: 'CURRENT', viewportMode: 'RESULT_REVIEW',
      viewportStatus: 'READY', sourceHash: hashes.sourceHash,
      analysisMeshHash: hashes.analysisMeshHash,
      executionHash: hashes.executionHash, recoveryHash: hashes.recoveryHash,
      convergenceHash: hashes.convergenceHash,
      displayGeometryHash: hashes.displayGeometryHash,
      renderProfileHash: hashes.renderProfileHash,
      packetBuffersIncluded: false, displayValuesAuthoritative: false,
    },
    reviewSections: [
      'BASIS', 'LEVEL_EVIDENCE', 'CONVERGENCE', 'FINEST_RETAINED_RESULT',
      'LIVE_DISPLAY_BINDING', 'LIMITATIONS',
    ].map((sectionId) => ({ sectionId, status: 'READY', authority: 'READ_ONLY' })),
    limitations: ['READ_ONLY_REVIEW_SESSION_ONLY'],
    authority,
    status: 'READ_ONLY_SELECTED_PILOT_REVIEW_SESSION_READY',
  };
  return Object.freeze({ ...base, sessionHash: canonicalLafeaSha256(base) });
}

function hash(label) {
  return canonicalLafeaSha256({ schema: 'nb-t6g-hash/v1', label });
}

function expect(label, body, code) {
  assert.throws(body, (cause) => {
    assert.equal(cause?.code, code, `${label}: ${cause?.code}`);
    return true;
  });
  adversarialCount += 1;
}

function typed(value) {
  if (!value || typeof value !== 'object') return false;
  if (ArrayBuffer.isView(value)) return true;
  return Object.values(value).some(typed);
}

function sourceGuards() {
  const source = fs.readFileSync(path.join(
    ROOT, 'src/workspace/lafea-selected-pilot-review-panel.js',
  ), 'utf8');
  assert.match(source, /validateLafeaSelectedPilotReviewSession/u);
  assert.match(source, /getDisplayViewportContext/u);
  assert.match(source, /exportLifecycle/u);
  assert.doesNotMatch(source,
    /\b(?:executeLafeaStage|calculateLocalContinuum|installLafeaB7dWorkbenchDisplay|setDisplayRenderPacket|registerLafeaArtifact|registerLifecycleArtifact|run|undo|redo)\s*\(/u);
  assert.doesNotMatch(source, /\binnerHTML\b/u);
  adversarialCount += 5;
}
