#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAFEA_B7D_RECOVERY_RENDER_BRIDGE_INTAKE_SCHEMA,
  LAFEA_LUG_PINHOLE_EXECUTION_INTAKE_SCHEMA,
  createLafeaB7dRecoveryRenderBridge,
  createLafeaLugPinholePhysicalProblemProjection,
  executeLafeaLugPinholePhysicalProblemBatch,
  validateLafeaB7dRecoveryRenderBridge,
} from '../src/workspace/lafea-controlled-continuum-public.js';
import { createNbT6cFixture } from './lafea-nb-t6c-fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: ROOT, encoding: 'utf8',
}).trim();
const fixture = createNbT6cFixture(ROOT, HEAD);
let negativeCount = 0;
sourceGuards();

const projection = createLafeaLugPinholePhysicalProblemProjection(
  fixture.projectionInput,
);
const benchmark = fixture.benchmark(projection.mappingPackage.semanticHash);
const executionPackage = executeLafeaLugPinholePhysicalProblemBatch({
  schema: LAFEA_LUG_PINHOLE_EXECUTION_INTAKE_SCHEMA,
  projection,
  benchmarkQualification: benchmark,
  requestId: 'NB-T6D-C2D-LUG-PINHOLE-001',
  recoveryProfileHash: fixture.hash('NB-T6D-INTEGRATION-POINT-RECOVERY'),
  convergenceRequest: {
    quantityId: 'PINHOLE_MAX_RETAINED_VON_MISES',
    units: 'MPa', tolerance: 1e-8, loadCaseId: 'LC1',
    component: 'VON_MISES', reducer: 'MAXIMUM_SIGNED',
  },
});
assert.equal(executionPackage.status, 'ACCEPTED');

const intake = {
  schema: LAFEA_B7D_RECOVERY_RENDER_BRIDGE_INTAKE_SCHEMA,
  sceneRevision: 7,
  projection,
  executionPackage,
  fieldRequest: fieldRequest(),
};
const bridge = createLafeaB7dRecoveryRenderBridge(intake);
assert.equal(bridge.status, 'DISPLAY_PACKET_READY');
assert.equal(validateLafeaB7dRecoveryRenderBridge(bridge).ok, true);
assert.equal(bridge.stageId, 'LAFEA.3');
assert.equal(bridge.templateId, 'C2D-LUG-PINHOLE');
assert.equal(bridge.sceneRevision, 7);
assert.equal(bridge.projectionHash, projection.projectionHash);
assert.equal(bridge.executionPackageHash, executionPackage.executionHash);
assert.equal(bridge.sourceHash,
  executionPackage.controllerResult.sourceAuthority.sourceHash);
assert.equal(bridge.canonicalModelHash, projection.canonicalModelHash);
assert.equal(bridge.analysisGeometryHash, projection.analysisGeometryHash);

const fine = executionPackage.controllerResult.levelResults[2];
assert.equal(bridge.analysisMeshHash, fine.meshEvidence.artifactHash);
assert.equal(bridge.executionHash, fine.executionRecord.artifactHash);
assert.equal(bridge.recoveryHash, fine.recoveryRecord.artifactHash);
assert.equal(bridge.convergenceHash,
  executionPackage.controllerResult.lifecycle.artifacts.CONVERGENCE.artifactHash);
assert.equal(bridge.renderPacket.lineage.executionHash, bridge.executionHash);
assert.equal(bridge.renderPacket.lineage.recoveryHash, bridge.recoveryHash);
assert.equal(bridge.renderPacket.lineage.meshHash, bridge.analysisMeshHash);
assert.equal(bridge.renderPacket.lineage.sourceHash, bridge.sourceHash);
assert.equal(bridge.renderPacket.lineage.topologyHash,
  bridge.analysisGeometryHash);
assert.equal(bridge.displayField.values.length,
  fine.meshEvidence.mesh.elements.length);
assert.equal(bridge.renderPacket.sourceElementIds.length,
  fine.meshEvidence.mesh.elements.length);
assert.equal(bridge.renderPacket.drawTriangleElementIndices.length,
  fine.meshEvidence.mesh.elements.length);
assert.equal(bridge.renderPacket.positions.length,
  fine.meshEvidence.mesh.elements.length * 9);
assert.equal(bridge.renderPacket.fieldValues.length,
  fine.meshEvidence.mesh.elements.length * 3);
assert.equal(bridge.renderPacket.qualityFlags.every((value) => value === 0), true);
assert.equal(bridge.authority.retainedEngineeringResultUsed, true);
assert.equal(bridge.authority.newEngineeringRecoveryComputed, false);
assert.equal(bridge.authority.lifecycleArtifactsRegistered, false);
assert.equal(bridge.authority.resultReady, true);
assert.equal(bridge.authority.convergenceReady, true);
assert.equal(bridge.authority.codeReady, false);
assert.equal(bridge.authority.releaseQualified, false);
assert.equal(Object.isFrozen(bridge), true);

const replay = createLafeaB7dRecoveryRenderBridge(intake);
assert.equal(replay.bridgeHash, bridge.bridgeHash);
assert.deepEqual([...replay.renderPacket.fieldValues],
  [...bridge.renderPacket.fieldValues]);
assert.deepEqual([...replay.renderPacket.positions],
  [...bridge.renderPacket.positions]);

expectCode('projection parent mismatch', () => {
  const tampered = structuredClone(executionPackage);
  tampered.projectionHash = fixture.hash('OTHER-PROJECTION');
  createLafeaB7dRecoveryRenderBridge({ ...intake, executionPackage: tampered });
}, 'LAFEA_NB_T6D_EXECUTION_PACKAGE_INVALID');

expectCode('controller readiness missing', () => {
  const tampered = structuredClone(executionPackage);
  tampered.controllerResult.receipt.resultReady = false;
  createLafeaB7dRecoveryRenderBridge({ ...intake, executionPackage: tampered });
}, 'LAFEA_NB_T6D_CONTROLLER_RESULT_INVALID');

expectCode('non-integration-point request', () =>
  createLafeaB7dRecoveryRenderBridge({
    ...intake,
    fieldRequest: {
      ...fieldRequest(),
      location: {
        schema: 'lafea-recovery-render-location/v1',
        kind: 'ELEMENT_CONSTANT',
        integrationPointIndex: null,
        surface: null,
      },
    },
  }), 'LAFEA_NB_T6D_INTEGRATION_POINT_FIELD_REQUIRED');

expectCode('unresolved integration point', () =>
  createLafeaB7dRecoveryRenderBridge({
    ...intake,
    fieldRequest: {
      ...fieldRequest(),
      location: {
        schema: 'lafea-recovery-render-location/v1',
        kind: 'INTEGRATION_POINT',
        integrationPointIndex: 999,
        surface: null,
      },
    },
  }), 'LAFEA_NB_T6D_RETAINED_VALUE_INVALID');

expectCode('stress unit mismatch', () =>
  createLafeaB7dRecoveryRenderBridge({
    ...intake,
    fieldRequest: { ...fieldRequest(), units: 'Pa' },
  }), 'LAFEA_NB_T6D_STRESS_UNIT_MISMATCH');

expectCode('fine-level lifecycle mismatch', () => {
  const tampered = structuredClone(executionPackage);
  tampered.controllerResult.lifecycle.artifacts.RECOVERY.artifactHash =
    fixture.hash('OTHER-RECOVERY');
  createLafeaB7dRecoveryRenderBridge({ ...intake, executionPackage: tampered });
}, 'LAFEA_NB_T6D_FINE_LEVEL_LIFECYCLE_MISMATCH');

const tamperedBridge = structuredClone(bridge);
tamperedBridge.bridgeHash = fixture.hash('TAMPERED-BRIDGE');
assert.equal(validateLafeaB7dRecoveryRenderBridge(tamperedBridge).ok, false);
negativeCount += 1;

console.log(JSON.stringify({
  schema: 'lafea-nb-t6d-b7d-recovery-render-bridge-check/v1',
  status: 'PASS',
  exactHead: HEAD,
  pilot: 'C2D-LUG-PINHOLE -> LAFEA.3',
  fineElementCount: fine.meshEvidence.mesh.elements.length,
  fieldId: bridge.fieldRequest.fieldId,
  fieldValueCount: bridge.displayField.values.length,
  executionHash: bridge.executionHash,
  recoveryHash: bridge.recoveryHash,
  convergenceHash: bridge.convergenceHash,
  bridgeHash: bridge.bridgeHash,
  negativeTestCount: negativeCount,
  authority: bridge.authority,
}));

function fieldRequest() {
  return {
    schema: 'lafea-recovery-render-field-request/v1',
    fieldId: 'NB_T6D_FINE_SIGMA_X_IP0',
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
  };
}

function sourceGuards() {
  const source = fs.readFileSync(path.join(
    ROOT,
    'src/workspace/lafea-b7d-recovery-render-bridge.js',
  ), 'utf8');
  assert.doesNotMatch(source, /\b(?:calculateLocalContinuum|executeLafeaStage|executeControlledLafeaContinuumPilot)\s*\(/u);
  assert.doesNotMatch(source, /\b(?:registerLafeaArtifact|registerLafeaRecoveryRenderPackage|createLafeaRecoveryRenderPackage)\s*\(/u);
  assert.doesNotMatch(source, /from ['"][^'"]*(?:local-continuum|local-shell|code|report)[^'"]*['"]/u);
  assert.match(source, /newEngineeringRecoveryComputed:\s*false/u);
  assert.match(source, /lifecycleArtifactsRegistered:\s*false/u);
  assert.match(source, /codeReady:\s*false/u);
  assert.match(source, /releaseQualified:\s*false/u);
  negativeCount += 7;
}

function expectCode(label, body, code) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, code, `${label}: ${error?.code} ${error?.message}`);
    return true;
  });
  negativeCount += 1;
}
