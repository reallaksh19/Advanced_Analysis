#!/usr/bin/env node

/**
 * [SIMULATED] Phase 2A source-authority orchestration qualification.
 *
 * Proves that the application gateway compiles explicit B-2.5 and B-3.0
 * inputs through production APIs before delegating to the existing T0 solve
 * and recovery chain. This does not qualify raw project-file ingestion,
 * interfaces, nozzle assessment, B31.3 application orchestration or UI/export.
 */

import assert from 'node:assert/strict';
import {
  deriveLinearPipingParentSet,
  runLinearPipingAnalysis,
  runLinearPipingAnalysisFromSourceAuthorities,
  validateLinearPipingSourceAnalysisRequest,
} from '../src/core/linear-piping-analysis-consumer/index.js';
import { createFactorizationCache } from '../src/core/linear-fea-solver/index.js';
import { compilerInput } from './lfea-b2.5-model-compiler-fixtures.mjs';
import {
  cantileverCompilation,
  cantileverConstraintDeclarations,
  frameElements,
  loadCaseProfile,
  solverProfile,
  tipLoadCase,
  tipLoadPrimitive,
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

function sourceRequest(overrides = {}) {
  const mechanicalModelInput = compilerInput({
    constraintDeclarations: cantileverConstraintDeclarations(),
  });
  const physicalLoadCaseInput = {
    loadCaseId: 'LC-TIP-01',
    loadCaseClass: 'APPLIED_MECHANICAL',
    presentation: {
      label: 'Tip load',
      description: 'Combined 3D tip force and torque.',
    },
    primitives: [tipLoadPrimitive()],
    profile: loadCaseProfile(),
  };
  const expectedSourceAuthorities = {
    sourceSemanticHash: mechanicalModelInput.sourceSemanticHash,
    conditionedTopologyHash: mechanicalModelInput.conditionedTopology.semanticHash,
    compilerProfileSemanticHash: mechanicalModelInput.profile.semanticHash,
    loadCaseProfileSemanticHash: physicalLoadCaseInput.profile.semanticHash,
  };

  return {
    schema: 'linear-piping-source-analysis-request/v1',
    analysisIdentity: 'PIPE-ANALYSIS-SOURCE-FRAME-3D-01',
    analysisRevision: 1,
    mechanicalModelInput,
    physicalLoadCaseInput,
    frameElements: frameElements(),
    pipingComponents: [],
    solverProfile: solverProfile(),
    recoveryProfile: recoveryProfile(),
    expectedSourceAuthorities,
    ...overrides,
  };
}

function manualT0Request() {
  const compilation = cantileverCompilation();
  const parentInput = {
    compilation,
    loadCase: tipLoadCase(compilation),
    frameElements: frameElements(),
    pipingComponents: [],
    solverProfile: solverProfile(),
    recoveryProfile: recoveryProfile(),
  };
  return {
    schema: 'linear-piping-analysis-request/v1',
    analysisIdentity: 'PIPE-ANALYSIS-SOURCE-FRAME-3D-01',
    analysisRevision: 1,
    ...parentInput,
    expectedParents: deriveLinearPipingParentSet(parentInput),
  };
}

console.log('\n--- [SIMULATED] Linear piping source-authority orchestration check ---');

const baselineRequest = sourceRequest();
const baselineResult = runLinearPipingAnalysisFromSourceAuthorities(
  baselineRequest,
  { factorizationCache: null },
);
const manualResult = runLinearPipingAnalysis(
  manualT0Request(),
  { factorizationCache: null },
);

test('PIPING-SRC-01', 'B-2.5 and B-3.0 are compiled before T0 execution', () => {
  assert.equal(baselineResult.status, 'QUALIFIED');
  assert.equal(
    baselineResult.parents.sourceSemanticHash,
    baselineRequest.expectedSourceAuthorities.sourceSemanticHash,
  );
  assert.equal(
    baselineResult.parents.conditionedTopologyHash,
    baselineRequest.expectedSourceAuthorities.conditionedTopologyHash,
  );
  assert.equal(
    baselineResult.parents.compilationSemanticHash,
    manualResult.parents.compilationSemanticHash,
  );
  assert.equal(
    baselineResult.parents.loadCaseSemanticHash,
    manualResult.parents.loadCaseSemanticHash,
  );
});

test('PIPING-SRC-02', 'Source gateway is numerically identical to the bounded manual T0 chain', () => {
  assert.equal(baselineResult.semanticHash, manualResult.semanticHash);
  assert.equal(baselineResult.execution.executionHash, manualResult.execution.executionHash);
  assert.equal(baselineResult.recovery.recoveryHash, manualResult.recovery.recoveryHash);
});

test('PIPING-SRC-03', 'Stale source authority blocks before T0 execution', () => {
  const request = sourceRequest();
  request.expectedSourceAuthorities = {
    ...request.expectedSourceAuthorities,
    sourceSemanticHash: 'fnv1a64:0000000000000000',
  };
  expectCode(
    () => runLinearPipingAnalysisFromSourceAuthorities(request, { factorizationCache: null }),
    'PIPING_SOURCE_AUTHORITY_MISMATCH',
  );
});

test('PIPING-SRC-04', 'Caller cannot inject a precompiled model reference into B-3.0 input', () => {
  const request = sourceRequest();
  request.physicalLoadCaseInput = {
    ...request.physicalLoadCaseInput,
    modelReference: {},
  };
  expectCode(
    () => validateLinearPipingSourceAnalysisRequest(request),
    'PIPING_ANALYSIS_KEYS_INVALID',
  );
});

test('PIPING-SRC-05', 'Missing source authority hash blocks the request', () => {
  const request = sourceRequest();
  const incomplete = { ...request.expectedSourceAuthorities };
  delete incomplete.loadCaseProfileSemanticHash;
  request.expectedSourceAuthorities = incomplete;
  expectCode(
    () => validateLinearPipingSourceAnalysisRequest(request),
    'PIPING_ANALYSIS_KEYS_INVALID',
  );
});

test('PIPING-SRC-06', 'Production B-2.5 unit rejection propagates without reinterpretation', () => {
  const request = sourceRequest();
  request.mechanicalModelInput = structuredClone(request.mechanicalModelInput);
  request.mechanicalModelInput.conditionedTopology.geometry.unit = 'mm';
  expectCode(
    () => runLinearPipingAnalysisFromSourceAuthorities(request, { factorizationCache: null }),
    'MODEL_COMPILER_UNIT_NOT_CANONICAL',
  );
});

test('PIPING-SRC-07', 'Repeated source orchestration is byte deterministic', () => {
  const repeated = runLinearPipingAnalysisFromSourceAuthorities(
    sourceRequest(),
    { factorizationCache: null },
  );
  assert.equal(JSON.stringify(repeated), JSON.stringify(baselineResult));
});

test('PIPING-SRC-08', 'Factorization reuse changes evidence only, not engineering identity', () => {
  const cache = createFactorizationCache();
  const first = runLinearPipingAnalysisFromSourceAuthorities(sourceRequest(), { factorizationCache: cache });
  const second = runLinearPipingAnalysisFromSourceAuthorities(sourceRequest(), { factorizationCache: cache });
  assert.equal(first.semanticHash, second.semanticHash);
  assert.notEqual(first.evidenceHash, second.evidenceHash);
  assert.equal(first.execution.factorization.reused, false);
  assert.equal(second.execution.factorization.reused, true);
});

test('PIPING-SRC-09', 'Validation does not freeze caller-owned source inputs', () => {
  const request = sourceRequest();
  validateLinearPipingSourceAnalysisRequest(request);
  assert.equal(Object.isFrozen(request), false);
  assert.equal(Object.isFrozen(request.mechanicalModelInput), false);
  assert.equal(Object.isFrozen(request.physicalLoadCaseInput), false);
  assert.equal(Object.isFrozen(request.expectedSourceAuthorities), false);
});

test('PIPING-SRC-10', 'Input element ordering does not alter result identity', () => {
  const request = sourceRequest();
  request.frameElements = [...request.frameElements].reverse();
  const reversed = runLinearPipingAnalysisFromSourceAuthorities(
    request,
    { factorizationCache: null },
  );
  assert.equal(reversed.semanticHash, baselineResult.semanticHash);
  assert.equal(reversed.evidenceHash, baselineResult.evidenceHash);
});

console.log('\n[SIMULATED] Linear piping source-authority orchestration check PASS\n');
