#!/usr/bin/env node

import assert from 'node:assert/strict';
import { sealInternalExactHeadManifest } from './lfea-piping-internal-release-evidence-check.mjs';
import {
  PHASE6I_WORKFLOW_EVIDENCE_STATUS,
  requirePhase6ICandidateBinding,
  requirePhase6IWorkflowEvidence,
} from './lfea-piping-phase6i-evidence-policy.mjs';

const CURRENT_HEAD = 'cccccccccccccccccccccccccccccccccccccccc';
const SUPERSEDED_HEAD = 'e76d2171015275836fe80e7d5e8b12d426eeb79e';

function test(id, name, body) {
  body();
  console.log(`${id} PASS ${name}`);
}

function expectCode(body, code) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, code, `expected ${code}, received ${error?.code}`);
    return true;
  });
}

function successfulWorkflow(overrides = {}) {
  return {
    status: 'completed',
    conclusion: 'success',
    steps: [
      { name: 'Checkout exact head', status: 'completed', conclusion: 'success' },
      { name: 'Run governed evidence command', status: 'completed', conclusion: 'success' },
      { name: 'Upload retained evidence', status: 'completed', conclusion: 'success' },
    ],
    logsAvailable: true,
    artifactStatus: 'PRESENT',
    ...overrides,
  };
}

console.log('\n--- [SIMULATED][INELIGIBLE_FOR_RELEASE_EVIDENCE] Phase 6I evidence policy ---');

test('P6I-POLICY-01', 'Completed workflow with steps, logs and artifact is eligible', () => {
  const accepted = requirePhase6IWorkflowEvidence(successfulWorkflow());
  assert.equal(accepted.status, PHASE6I_WORKFLOW_EVIDENCE_STATUS);
  assert.equal(accepted.stepCount, 3);
});

test('P6I-POLICY-02', 'Pre-step failure cannot be promoted', () => {
  expectCode(
    () => requirePhase6IWorkflowEvidence(successfulWorkflow({
      conclusion: 'failure',
      steps: [],
      logsAvailable: false,
      artifactStatus: 'MISSING',
    })),
    'LFEA_PHASE6I_WORKFLOW_STEPS_MISSING',
  );
});

test('P6I-POLICY-03', 'Cancelled or partial workflow is ineligible', () => {
  expectCode(
    () => requirePhase6IWorkflowEvidence(successfulWorkflow({ status: 'in_progress' })),
    'LFEA_PHASE6I_WORKFLOW_NOT_COMPLETED',
  );
  expectCode(
    () => requirePhase6IWorkflowEvidence(successfulWorkflow({ conclusion: 'cancelled' })),
    'LFEA_PHASE6I_WORKFLOW_NOT_SUCCESSFUL',
  );
});

test('P6I-POLICY-04', 'Failed executable step is ineligible', () => {
  const value = successfulWorkflow();
  value.steps = [
    value.steps[0],
    { name: 'Run governed evidence command', status: 'completed', conclusion: 'failure' },
  ];
  expectCode(
    () => requirePhase6IWorkflowEvidence(value),
    'LFEA_PHASE6I_WORKFLOW_STEP_NOT_SUCCESSFUL',
  );
});

test('P6I-POLICY-05', 'Missing logs or retained artifact is ineligible', () => {
  expectCode(
    () => requirePhase6IWorkflowEvidence(successfulWorkflow({ logsAvailable: false })),
    'LFEA_PHASE6I_WORKFLOW_LOGS_MISSING',
  );
  expectCode(
    () => requirePhase6IWorkflowEvidence(successfulWorkflow({ artifactStatus: 'MISSING' })),
    'LFEA_PHASE6I_WORKFLOW_ARTIFACT_MISSING',
  );
});

test('P6I-POLICY-06', 'Candidate binding accepts only one current exact head', () => {
  const accepted = requirePhase6ICandidateBinding({
    expectedHead: CURRENT_HEAD,
    artifactHeads: [CURRENT_HEAD, CURRENT_HEAD, CURRENT_HEAD, CURRENT_HEAD],
  });
  assert.equal(accepted.status, 'SAME_HEAD_BOUND');
  assert.equal(accepted.artifactCount, 4);
});

test('P6I-POLICY-07', 'Superseded and mixed-head artifacts are rejected', () => {
  expectCode(
    () => requirePhase6ICandidateBinding({
      expectedHead: SUPERSEDED_HEAD,
      artifactHeads: [SUPERSEDED_HEAD],
    }),
    'LFEA_PHASE6I_SUPERSEDED_HEAD',
  );
  expectCode(
    () => requirePhase6ICandidateBinding({
      expectedHead: CURRENT_HEAD,
      artifactHeads: ['dddddddddddddddddddddddddddddddddddddddd'],
    }),
    'LFEA_PHASE6I_ARTIFACT_HEAD_MISMATCH',
  );
});

test('P6I-POLICY-08', 'Timestamp metadata does not change manifest semantic identity', () => {
  const left = sealInternalExactHeadManifest(internalManifest('2026-07-31T10:00:00Z'));
  const right = sealInternalExactHeadManifest(internalManifest('2026-07-31T11:00:00Z'));
  assert.equal(left.semanticHash, right.semanticHash);
  assert.notEqual(left.evidenceHash, right.evidenceHash);
  assert.notEqual(left.createdAtUtc, right.createdAtUtc);
});

function internalManifest(createdAtUtc) {
  const rolePaths = {
    upstreamGateLog: ['internal/upstream-gate.log', 'text/plain'],
    t0GateLog: ['internal/t0-gate.log', 'text/plain'],
    sourceOrchestrationEvidence: ['internal/source-orchestration.json', 'application/json'],
    interfaceEvidence: ['internal/interface-evidence.json', 'application/json'],
    interfaceRecoveryEvidence: ['internal/interface-recovery.json', 'application/json'],
    codeAndAllowableEvidence: ['internal/code-and-allowable.json', 'application/json'],
    presentationExportEvidence: ['internal/presentation-export.json', 'application/json'],
  };
  const artifactReferences = Object.fromEntries(Object.entries(rolePaths).map(
    ([role, [path, mediaType]]) => [role, {
      path,
      mediaType,
      contentHash: 'fnv1a64:1111111111111111',
    }],
  ));
  const commandRoles = {
    CLEAN_TREE: 'upstreamGateLog',
    CODE_AND_ALLOWABLES: 'codeAndAllowableEvidence',
    EXACT_HEAD_BASELINE: 'upstreamGateLog',
    FULL_REPOSITORY_GATE: 'upstreamGateLog',
    INTERFACES: 'interfaceEvidence',
    INTERFACE_RECOVERY: 'interfaceRecoveryEvidence',
    PRESENTATION_EXPORT: 'presentationExportEvidence',
    SOURCE_ORCHESTRATION: 'sourceOrchestrationEvidence',
    T0_APPLICATION_SEQUENCING: 't0GateLog',
    UPSTREAM_NUMERICAL_CHAIN: 'upstreamGateLog',
  };
  return {
    schema: 'lfea-piping-exact-head-manifest/v1',
    repository: 'reallaksh19/Advanced_Analysis',
    exactHead: CURRENT_HEAD,
    createdAtUtc,
    runtime: {
      runtimeName: 'node',
      runtimeVersion: 'v22.18.0',
      operatingSystem: 'linux',
      architecture: 'x64',
      dependencyLockHash: 'fnv1a64:2222222222222222',
    },
    cleanTree: {
      diffCheckPassed: true,
      statusClean: true,
      statusHash: 'fnv1a64:3333333333333333',
    },
    commands: Object.entries(commandRoles).map(([commandId, artifactRole]) => ({
      commandId,
      commandText: `governed ${commandId}`,
      exitCode: 0,
      status: 'PASS',
      artifactRole,
      artifactContentHash: artifactReferences[artifactRole].contentHash,
    })),
    artifactReferences,
    semanticHash: '',
    evidenceHash: '',
  };
}

console.log('[SIMULATED][INELIGIBLE_FOR_RELEASE_EVIDENCE] Phase 6I evidence-policy checks PASS');
