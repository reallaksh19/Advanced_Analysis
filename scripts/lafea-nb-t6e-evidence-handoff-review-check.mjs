#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAFEA_B7D_RECOVERY_RENDER_BRIDGE_INTAKE_SCHEMA,
  LAFEA_LUG_PINHOLE_EXECUTION_INTAKE_SCHEMA,
  LAFEA_SELECTED_PILOT_REVIEW_HANDOFF_SCHEMA,
  createLafeaB7dRecoveryRenderBridge,
  createLafeaLoadDrivenPilotQualification,
  createLafeaLugPinholePhysicalProblemProjection,
  createLafeaSelectedPilotReviewHandoff,
  executeLafeaLugPinholePhysicalProblemBatch,
  parseLafeaSelectedPilotReviewHandoff,
  serializeLafeaSelectedPilotReviewHandoff,
  validateLafeaSelectedPilotReviewHandoff,
} from '../src/workspace/lafea-controlled-continuum-public.js';
import {
  LAFEA_RECOVERY_RENDER_FIELD_REQUEST_SCHEMA,
  LAFEA_RECOVERY_RENDER_LOCATION_SCHEMA,
} from '../src/workspace/lafea-recovery-render-contract.js';
import { createNbT6cFixture } from './lafea-nb-t6c-fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: ROOT,
  encoding: 'utf8',
}).trim();
let adversarialCount = 0;
sourceGuards();

const fixture = createNbT6cFixture(ROOT, HEAD);
const selectedPilot = createSelectedPilot();
const fieldRequest = createFieldRequest();
const renderBridge = createLafeaB7dRecoveryRenderBridge({
  schema: LAFEA_B7D_RECOVERY_RENDER_BRIDGE_INTAKE_SCHEMA,
  sceneRevision: 1,
  projection: selectedPilot.projection,
  executionPackage: selectedPilot.execution,
  fieldRequest,
});
const handoff = createLafeaSelectedPilotReviewHandoff({
  handoffId: 'NB-T6E-C2D-LUG-PINHOLE-REVIEW-001',
  exactHeadSha: HEAD,
  qualification: selectedPilot.qualification,
  projection: selectedPilot.projection,
  execution: selectedPilot.execution,
  renderBridge,
});

assert.equal(handoff.schema, LAFEA_SELECTED_PILOT_REVIEW_HANDOFF_SCHEMA);
assert.equal(handoff.status, 'SELECTED_PILOT_REVIEW_EVIDENCE_READY');
assert.equal(handoff.reviewPacket.levels.length, 3);
assert.deepEqual(
  handoff.reviewPacket.levels.map((row) => row.elementCount),
  [16, 64, 256],
);
assert.equal(
  handoff.reviewPacket.levels.every((row) =>
    row.status === 'PASS'
    && row.freeDofCount > 0
    && row.solverMethod === 'DETERMINISTIC_CHOLESKY'
    && row.retainedRecoveryAuthority === 'INTEGRATION_POINT_ENGINEERING_RESULT'
    && row.projectedDisplayProducedByController === false),
  true,
);
assert.equal(handoff.reviewPacket.finestLevel.ordinal, 3);
assert.equal(handoff.reviewPacket.finestLevel.elementCount, 256);
assert.equal(handoff.reviewPacket.finestLevel.retainedSources.length, 256);
assert.equal(
  handoff.reviewPacket.finestLevel.retainedSources.every((row) =>
    Number.isFinite(row.value)
    && row.authorityLayer === 'INTEGRATION_POINT_RETAINED_ENGINEERING_RESULT'
    && row.sourcePath.includes('.gaussPointResults[0].stress.sigmaX')),
  true,
);
assert.equal(
  handoff.reviewPacket.parentHashes.renderBridgeHash,
  renderBridge.bridgeHash,
);
assert.equal(
  handoff.reviewPacket.displayEvidence.renderBridgeHash,
  renderBridge.bridgeHash,
);
assert.equal(
  handoff.reviewPacket.displayEvidence.valueRole,
  'PRODUCER_PROJECTED_DISPLAY_ONLY',
);
assert.equal(handoff.reviewPacket.displayEvidence.valuesIncluded, true);
assert.equal(
  handoff.reviewPacket.displayEvidence.displayField.values.length,
  256,
);
assert.ok(
  handoff.reviewPacket.displayEvidence.renderPacket.fieldValues.length > 256,
);
assert.equal(
  handoff.reviewPacket.displayEvidence.displayValuesAuthoritative,
  false,
);
assert.equal(
  handoff.reviewPacket.displayEvidence.newDisplayProjectionProduced,
  false,
);
assert.equal(
  handoff.reviewPacket.displayEvidence.newEngineeringRecoveryProduced,
  false,
);
assert.equal(handoff.reviewPacket.displayEvidence.assessmentAuthority, false);
assert.equal(handoff.reviewPacket.convergence.reinterpreted, false);
assert.equal(handoff.reviewPacket.convergence.newConvergenceProduced, false);
assert.equal(
  handoff.reviewPacket.convergence.displacement.semanticHash,
  selectedPilot.qualification.receipt.displacementConvergence.semanticHash,
);
assert.equal(
  handoff.reviewPacket.convergence.retainedStress.semanticHash,
  selectedPilot.qualification.receipt.stressConvergence.semanticHash,
);
assert.equal(handoff.auditReceipt.reviewPacketReady, true);
assert.equal(handoff.auditReceipt.portableAuditHandoff, true);
assert.equal(handoff.auditReceipt.existingRenderBridgeConsumed, true);
assert.equal(handoff.auditReceipt.newDisplayProjectionProduced, false);
assert.equal(handoff.auditReceipt.formalReportProduced, false);
assert.equal(handoff.auditReceipt.releaseQualified, false);
assert.equal(handoff.authority.existingRenderBridgeConsumed, true);
assert.equal(handoff.authority.solverExecuted, false);
assert.equal(handoff.authority.newRecoveryProduced, false);
assert.equal(handoff.authority.newConvergenceProduced, false);
assert.equal(handoff.authority.newDisplayProjectionProduced, false);
assert.equal(handoff.authority.displayValuesIncluded, true);
assert.equal(handoff.authority.displayValuesAuthoritative, false);
assert.equal(handoff.authority.generalT7dAuthorized, false);
assert.equal(handoff.authority.shellAuthorized, false);
assert.equal(handoff.authority.codeReady, false);
assert.equal(handoff.authority.reportAuthority, false);
assert.equal(handoff.authority.releaseQualified, false);
assert.equal(validateLafeaSelectedPilotReviewHandoff(handoff).ok, true);
assert.equal(Object.isFrozen(handoff), true);

const replay = createLafeaSelectedPilotReviewHandoff({
  handoffId: 'NB-T6E-C2D-LUG-PINHOLE-REVIEW-001',
  exactHeadSha: HEAD,
  qualification: selectedPilot.qualification,
  projection: selectedPilot.projection,
  execution: selectedPilot.execution,
  renderBridge,
});
assert.equal(replay.semanticHash, handoff.semanticHash);
assert.equal(replay.reviewPacket.packetHash, handoff.reviewPacket.packetHash);
assert.equal(replay.auditReceipt.evidenceHash, handoff.auditReceipt.evidenceHash);
assert.equal(replay.portablePayloadHash, handoff.portablePayloadHash);

const serialized = serializeLafeaSelectedPilotReviewHandoff(handoff);
const parsed = parseLafeaSelectedPilotReviewHandoff(serialized);
assert.deepEqual(parsed, handoff);
assert.equal(validateLafeaSelectedPilotReviewHandoff(parsed).ok, true);

expectCode('stale exact head', () => createLafeaSelectedPilotReviewHandoff({
  handoffId: 'NB-T6E-STALE-HEAD',
  exactHeadSha: '0000000000000000000000000000000000000000',
  qualification: selectedPilot.qualification,
  projection: selectedPilot.projection,
  execution: selectedPilot.execution,
  renderBridge,
}), 'LAFEA_NB_T6E_EXACT_HEAD_PARENT_STALE');

const staleQualification = structuredClone(selectedPilot.qualification);
staleQualification.semanticHash = fixture.hash('STALE-NB-T6D-QUALIFICATION');
expectCode('stale qualification', () => createHandoff({
  qualification: staleQualification,
}), 'LAFEA_NB_T6E_QUALIFICATION_INVALID');

const tamperedExecution = structuredClone(selectedPilot.execution);
tamperedExecution.controllerResult.levelResults[0]
  .execution.result.loadCaseResults[0]
  .equilibrium.reactionPlusAppliedForce.x = 1;
expectOneOfCodes('tampered equilibrium result', () => createHandoff({
  execution: tamperedExecution,
}), [
  'LAFEA_NB_T6E_RESULT_HASH_RECONSTRUCTION_FAILED',
  'LAFEA_NB_T6E_LEVEL_SUMMARY_MISMATCH',
]);

const changedProjection = structuredClone(selectedPilot.projection);
changedProjection.physicalProblem.limitations.push('UNDECLARED_LIMITATION_CHANGE');
expectCode('changed limitations', () => createHandoff({
  projection: changedProjection,
}), 'LAFEA_NB_T6E_PROJECTION_INVALID');

const staleBridge = structuredClone(renderBridge);
staleBridge.bridgeHash = fixture.hash('STALE-NB-T6D-BRIDGE');
expectCode('stale bridge hash', () => createHandoff({
  renderBridge: staleBridge,
}), 'LAFEA_NB_T6E_RENDER_BRIDGE_INVALID');

const tamperedPacketBridge = structuredClone(renderBridge);
tamperedPacketBridge.renderPacket.fieldValues[0] = 999;
expectCode('tampered render packet', () => createHandoff({
  renderBridge: tamperedPacketBridge,
}), 'LAFEA_NB_T6E_RENDER_BRIDGE_INVALID');

const promotedBridge = structuredClone(renderBridge);
promotedBridge.authority.assessmentReady = true;
expectCode('bridge authority promotion', () => createHandoff({
  renderBridge: promotedBridge,
}), 'LAFEA_NB_T6E_RENDER_BRIDGE_INVALID');

const alteredOrdering = structuredClone(handoff);
alteredOrdering.reviewPacket.levels.reverse();
assert.equal(validateLafeaSelectedPilotReviewHandoff(alteredOrdering).ok, false);
adversarialCount += 1;

const promotedDisplay = structuredClone(handoff);
promotedDisplay.reviewPacket.displayEvidence.valueRole =
  'ENGINEERING_ASSESSMENT_AUTHORITY';
assert.equal(validateLafeaSelectedPilotReviewHandoff(promotedDisplay).ok, false);
adversarialCount += 1;

const promotedPacketField = structuredClone(handoff);
promotedPacketField.reviewPacket.displayEvidence.renderPacket.field.valueRole =
  'ENGINEERING_ASSESSMENT_AUTHORITY';
assert.equal(
  validateLafeaSelectedPilotReviewHandoff(promotedPacketField).ok,
  false,
);
adversarialCount += 1;

expectCode('malformed portable JSON', () =>
  parseLafeaSelectedPilotReviewHandoff('{invalid-json'),
'LAFEA_NB_T6E_SERIALIZED_JSON_INVALID');

console.log(JSON.stringify({
  schema: 'lafea-nb-t6e-evidence-handoff-review-check/v1',
  status: 'PASS',
  exactHead: HEAD,
  pilot: 'C2D-LUG-PINHOLE -> LAFEA.3',
  levelElementCounts: handoff.reviewPacket.levels.map((row) => row.elementCount),
  finestRetainedSourceCount:
    handoff.reviewPacket.finestLevel.retainedSources.length,
  displayFieldValueCount:
    handoff.reviewPacket.displayEvidence.displayField.values.length,
  displayValueRole: handoff.reviewPacket.displayEvidence.valueRole,
  renderBridgeHash: handoff.reviewPacket.parentHashes.renderBridgeHash,
  reviewPacketHash: handoff.reviewPacket.packetHash,
  auditReceiptHash: handoff.auditReceipt.evidenceHash,
  portablePayloadHash: handoff.portablePayloadHash,
  adversarialCount,
  authority: handoff.authority,
}));

function createSelectedPilot() {
  const input = structuredClone(fixture.projectionInput);
  input.physicalProblem.modelIdentity = 'NB-T6E-C2D-LUG-PINHOLE';
  input.physicalProblem.sourceAncestry.sourceModelIdentity =
    'NB-T6E-C2D-LUG-PINHOLE';
  input.physicalProblem.sourceAncestry.adapterIdentity =
    'NB-T6E-SELECTED-PILOT-EVIDENCE-HANDOFF';
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
  input.producerRef = 'NB-T6E/C2D-LUG-PINHOLE/LAFEA.3';
  input.sourceAuthorityOriginRef = 'NB-T6E/C2D-LUG-PINHOLE';
  const projection = createLafeaLugPinholePhysicalProblemProjection(input);
  const benchmarkQualification = fixture.benchmark(
    projection.mappingPackage.semanticHash,
  );
  const execution = executeLafeaLugPinholePhysicalProblemBatch({
    schema: LAFEA_LUG_PINHOLE_EXECUTION_INTAKE_SCHEMA,
    projection,
    benchmarkQualification,
    requestId: 'NB-T6E-C2D-LUG-PINHOLE-LOAD-DRIVEN',
    recoveryProfileHash: fixture.hash('NB-T6E-INTEGRATION-POINT-RECOVERY'),
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
    qualificationId: 'NB-T6E-C2D-LUG-PINHOLE-QUALIFICATION',
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

function createFieldRequest() {
  return {
    schema: LAFEA_RECOVERY_RENDER_FIELD_REQUEST_SCHEMA,
    fieldId: 'NB-T6E-FINEST-SIGMA-X-IP0',
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
  };
}

function createHandoff(overrides = {}) {
  return createLafeaSelectedPilotReviewHandoff({
    handoffId: 'NB-T6E-ADVERSARIAL',
    exactHeadSha: HEAD,
    qualification: selectedPilot.qualification,
    projection: selectedPilot.projection,
    execution: selectedPilot.execution,
    renderBridge,
    ...overrides,
  });
}

function sourceGuards() {
  const source = fs.readFileSync(
    path.join(ROOT, 'src/workspace/lafea-selected-pilot-evidence-handoff.js'),
    'utf8',
  );
  assert.doesNotMatch(source,
    /from ['"][^'"]*(?:local-continuum|lafea-workbench-controller|lafea-workbench-model)[^'"]*['"]/u);
  assert.doesNotMatch(source,
    /\b(?:calculateLocalContinuum|executeLafeaStage|executeControlledLafeaContinuumPilot|createLafeaB7dRecoveryRenderBridge|createLafeaRecoveryRenderPackage|registerLafeaArtifact)\s*\(/u);
  assert.doesNotMatch(source, /\b(?:smooth|smoothing|averageWithinGroups)\s*\(/u);
  assert.match(source, /validateLafeaB7dRecoveryRenderBridge/u);
  assert.match(source, /PRODUCER_PROJECTED_DISPLAY_ONLY/u);
  assert.match(source, /existingRenderBridgeConsumed:\s*true/u);
  assert.match(source, /valuesIncluded:\s*true/u);
  assert.match(source, /displayValuesAuthoritative:\s*false/u);
  assert.match(source, /newDisplayProjectionProduced:\s*false/u);
  assert.match(source, /solverExecuted:\s*false/u);
  assert.match(source, /newRecoveryProduced:\s*false/u);
  assert.match(source, /newConvergenceProduced:\s*false/u);
  assert.match(source, /reportAuthority:\s*false/u);
  assert.match(source, /releaseQualified:\s*false/u);
}

function expectCode(label, body, code) {
  expectOneOfCodes(label, body, [code]);
}

function expectOneOfCodes(label, body, codes) {
  assert.throws(body, (error) => codes.includes(error?.code), label);
  adversarialCount += 1;
}
