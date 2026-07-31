#!/usr/bin/env node

/**
 * [SIMULATED] T0 piping application-chain qualification.
 *
 * Uses the existing FRAME-3D-01 two-span cantilever fixture to exercise the
 * real B-2.5/B-3.0 records through B-3.3 solve, B-3.4 recovery, current-parent
 * sealing, deterministic replay, and deliberate stale/partial regressions.
 */

import assert from 'node:assert/strict';
import {
  NOT_EVALUATED,
  deriveLinearPipingParentSet,
  requireCurrentLinearPipingAnalysisResult,
  runLinearPipingAnalysis,
  validateLinearPipingAnalysisResult,
} from '../src/core/linear-piping-analysis-consumer/index.js';
import { createFactorizationCache } from '../src/core/linear-fea-solver/index.js';
import {
  cantileverCompilation,
  frameElements,
  solverProfile,
  tipLoadCase,
} from './lfea-b3.3-solver-fixtures.mjs';
import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';

function test(id, name, body) {
  body();
  console.log(`${id} PASS ${name}`);
}

function expectCode(body, expectedCode) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, expectedCode, `expected ${expectedCode}, received ${error?.code}`);
    return true;
  });
}

function createRequest(input) {
  const parentInput = {
    compilation: input.compilation,
    loadCase: input.loadCase,
    frameElements: input.frameElements,
    pipingComponents: input.pipingComponents,
    solverProfile: input.solverProfile,
    recoveryProfile: input.recoveryProfile,
  };
  return {
    schema: 'linear-piping-analysis-request/v1',
    analysisIdentity: input.analysisIdentity,
    analysisRevision: input.analysisRevision,
    ...parentInput,
    expectedParents: deriveLinearPipingParentSet(parentInput),
  };
}

function baselineInput() {
  const compilation = cantileverCompilation();
  return {
    analysisIdentity: 'PIPE-ANALYSIS-T0-FRAME-3D-01',
    analysisRevision: 1,
    compilation,
    loadCase: tipLoadCase(compilation),
    frameElements: frameElements(),
    pipingComponents: [],
    solverProfile: solverProfile(),
    recoveryProfile: recoveryProfile(),
  };
}

function reactionAt(result, nodeId, dof) {
  return result.execution.reactions
    .find((entry) => entry.nodeId === nodeId && entry.dof === dof)
    .value;
}

console.log('\n--- [SIMULATED] Linear piping analysis consumer T0 check ---');

const baselineRequest = createRequest(baselineInput());
const baselineResult = runLinearPipingAnalysis(
  baselineRequest,
  { factorizationCache: null },
);

test('PIPING-T0-01', 'One sealed result chain binds B-2.5 through B-3.4', () => {
  assert.equal(baselineResult.schema, 'linear-piping-analysis-result-chain/v1');
  assert.equal(baselineResult.status, 'QUALIFIED');
  assert.equal(baselineResult.execution.status, 'QUALIFIED');
  assert.equal(baselineResult.recovery.executionHash, baselineResult.execution.executionHash);
  assert.equal(baselineResult.parents.mechanicalModelSemanticHash,
    baselineRequest.compilation.mechanicalModelSemanticHash);
  assert.ok(Object.isFrozen(baselineResult));
  validateLinearPipingAnalysisResult(baselineResult);
});

test('PIPING-T0-02', 'Closed-form anchor reactions survive the consumer unchanged', () => {
  assert.ok(Math.abs(reactionAt(baselineResult, 'N-000120', 'UY') + 1500) < 1e-8);
  assert.ok(Math.abs(reactionAt(baselineResult, 'N-000120', 'UZ') - 900) < 1e-8);
  assert.ok(Math.abs(reactionAt(baselineResult, 'N-000120', 'RX') + 340) < 1e-8);
  assert.ok(Math.abs(reactionAt(baselineResult, 'N-000120', 'RY') + 2160) < 1e-8);
  assert.ok(Math.abs(reactionAt(baselineResult, 'N-000120', 'RZ') + 3600) < 1e-8);
});

test('PIPING-T0-03', 'T0 keeps interface, nozzle and B31.3 outputs explicitly unevaluated', () => {
  assert.equal(baselineResult.interfaceLoadResults, null);
  assert.equal(baselineResult.nozzleAssessments, null);
  assert.equal(baselineResult.codeResults, null);
  assert.deepEqual(baselineResult.notEvaluated, NOT_EVALUATED);
});

test('PIPING-T0-04', 'A stale expected parent blocks before execution', () => {
  const stale = {
    ...baselineRequest,
    expectedParents: {
      ...baselineRequest.expectedParents,
      solverProfileSemanticHash: 'fnv1a64:0000000000000000',
    },
  };
  expectCode(
    () => runLinearPipingAnalysis(stale, { factorizationCache: null }),
    'PIPING_ANALYSIS_PARENT_MISMATCH',
  );
});

test('PIPING-T0-05', 'A previously sealed result is rejected against changed current parents', () => {
  const changed = {
    ...baselineRequest.expectedParents,
    physicalLoadCaseHash: 'fnv1a64:1111111111111111',
  };
  expectCode(
    () => requireCurrentLinearPipingAnalysisResult(baselineResult, changed),
    'PIPING_ANALYSIS_RESULT_STALE',
  );
});

test('PIPING-T0-06', 'A partial element-authority chain cannot solve', () => {
  const partialInput = baselineInput();
  partialInput.frameElements = [partialInput.frameElements[0]];
  const partialRequest = createRequest(partialInput);
  expectCode(
    () => runLinearPipingAnalysis(partialRequest, { factorizationCache: null }),
    'PIPING_ANALYSIS_ELEMENT_AUTHORITY_MISSING',
  );
});

test('PIPING-T0-07', 'A duplicate element authority is rejected by identity', () => {
  const duplicateInput = baselineInput();
  duplicateInput.frameElements = [
    ...duplicateInput.frameElements,
    duplicateInput.frameElements[0],
  ];
  const duplicateRequest = createRequest(duplicateInput);
  expectCode(
    () => runLinearPipingAnalysis(duplicateRequest, { factorizationCache: null }),
    'PIPING_ANALYSIS_ELEMENT_AUTHORITY_DUPLICATE',
  );
});

test('PIPING-T0-08', 'Input ordering does not alter result identity', () => {
  const reversedInput = baselineInput();
  reversedInput.frameElements = [...reversedInput.frameElements].reverse();
  const reversed = runLinearPipingAnalysis(
    createRequest(reversedInput),
    { factorizationCache: null },
  );
  assert.equal(reversed.semanticHash, baselineResult.semanticHash);
  assert.equal(reversed.evidenceHash, baselineResult.evidenceHash);
});

test('PIPING-T0-09', 'Repeated execution is byte deterministic', () => {
  const repeated = runLinearPipingAnalysis(
    baselineRequest,
    { factorizationCache: null },
  );
  assert.equal(JSON.stringify(repeated), JSON.stringify(baselineResult));
});

test('PIPING-T0-10', 'Factorization reuse does not alter engineering identity', () => {
  const cache = createFactorizationCache();
  const first = runLinearPipingAnalysis(baselineRequest, { factorizationCache: cache });
  const second = runLinearPipingAnalysis(baselineRequest, { factorizationCache: cache });
  assert.equal(first.execution.factorization.reused, false);
  assert.equal(second.execution.factorization.reused, true);
  assert.equal(first.semanticHash, second.semanticHash);
  assert.notEqual(first.evidenceHash, second.evidenceHash);
});

test('PIPING-T0-11', 'Tampering a sealed chain is rejected by its semantic hash', () => {
  expectCode(
    () => validateLinearPipingAnalysisResult({
      ...baselineResult,
      analysisRevision: 2,
    }),
    'PIPING_ANALYSIS_RESULT_HASH_MISMATCH',
  );
});

test('PIPING-T0-12', 'Consumer validation does not freeze the caller request', () => {
  assert.equal(Object.isFrozen(baselineRequest), false);
  assert.equal(Object.isFrozen(baselineRequest.expectedParents), true);
});

test('PIPING-T0-13', 'A missing mandatory parent hash blocks the request', () => {
  const incompleteParents = { ...baselineRequest.expectedParents };
  delete incompleteParents.recoveryProfileSemanticHash;
  expectCode(
    () => runLinearPipingAnalysis(
      { ...baselineRequest, expectedParents: incompleteParents },
      { factorizationCache: null },
    ),
    'PIPING_ANALYSIS_KEYS_INVALID',
  );
});

console.log('\n[SIMULATED] Linear piping analysis consumer T0 check PASS\n');
