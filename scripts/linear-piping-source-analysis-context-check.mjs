#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  compileLinearPipingSourceAnalysisContext,
  requireLinearPipingSourceAnalysisContext,
  runLinearPipingAnalysisFromSourceAuthorities,
  sealLinearPipingSourceAnalysisContext,
} from '../src/core/linear-piping-analysis-consumer/index.js';
import {
  compileLinearPipingInterfaceSet,
  recoverLinearPipingInterfaceLoads,
  sealInterfaceProfile,
} from '../src/core/linear-piping-interface/index.js';
import { createFactorizationCache } from '../src/core/linear-fea-solver/index.js';
import { compilerInput } from './lfea-b2.5-model-compiler-fixtures.mjs';
import {
  cantileverConstraintDeclarations,
  frameElements,
  loadCaseProfile,
  solverProfile,
  tipLoadPrimitive,
} from './lfea-b3.3-solver-fixtures.mjs';
import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';

function declared(value, source) {
  return { value, source };
}

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
      label: 'Context tip load',
      description: 'Declared 3D load for the retained source context.',
    },
    primitives: [tipLoadPrimitive()],
    profile: loadCaseProfile(),
  };
  return {
    schema: 'linear-piping-source-analysis-request/v1',
    analysisIdentity: 'PIPE-SOURCE-CONTEXT-01',
    analysisRevision: 1,
    mechanicalModelInput,
    physicalLoadCaseInput,
    frameElements: frameElements(),
    pipingComponents: [],
    solverProfile: solverProfile(),
    recoveryProfile: recoveryProfile(),
    expectedSourceAuthorities: {
      sourceSemanticHash: mechanicalModelInput.sourceSemanticHash,
      conditionedTopologyHash: mechanicalModelInput.conditionedTopology.semanticHash,
      compilerProfileSemanticHash: mechanicalModelInput.profile.semanticHash,
      loadCaseProfileSemanticHash: physicalLoadCaseInput.profile.semanticHash,
    },
    ...overrides,
  };
}

function interfaceSetFromContext(context) {
  const node = context.compilation.model.nodes.find((row) => row.nodeId === 'N-000120');
  const sourceEntityId = node.sourceAncestry.sourceComponentIds[0];
  assert.equal(sourceEntityId, 'PIPINGELEMENT-14');
  const dofMappings = context.compilation.model.constraints
    .filter((row) => row.nodeId === node.nodeId)
    .map((row) => ({
      dof: row.dof,
      behavior: row.behavior,
      constraintId: row.constraintId,
      stiffness: row.stiffness ?? null,
    }));
  return compileLinearPipingInterfaceSet({
    compilation: context.compilation,
    supportAttachmentModel: null,
    restraintCapabilityModel: null,
    definitions: [{
      interfaceId: 'IF-CONTEXT-NOZZLE-01',
      interfaceKind: 'NOZZLE',
      nodeId: node.nodeId,
      sourceEntityId,
      supportBinding: null,
      basis: {
        origin: node.position,
        e1: { x: 1, y: 0, z: 0 },
        e2: { x: 0, y: 1, z: 0 },
        e3: { x: 0, y: 0, z: 1 },
      },
      referencePointGlobal: { x: -0.1, y: 0, z: 0 },
      leverReferenceToNodeLocal: { x: 0.1, y: 0, z: 0 },
      dofMappings,
      reportingSignConvention: 'FORCE_ON_INTERFACE_FROM_PIPE',
      sourceEvidence: {
        sourceId: 'CONTEXT-NOZZLE-DATASHEET',
        sourceRevision: '01',
        sourceSemanticHash: 'fnv1a64:1212121212121212',
      },
      allowableProfileHash: 'fnv1a64:3434343434343434',
    }],
    profile: sealInterfaceProfile({
      schema: 'linear-piping-interface-profile/v1',
      profileId: 'LINEAR-PIPING-CONTEXT-INTERFACE-R1',
      basisTolerance: declared(1e-12, 'PHASE-2C-CONTEXT-FIXTURE'),
      positionTolerance: declared(1e-12, 'PHASE-2C-CONTEXT-FIXTURE'),
      offsetTolerance: declared(1e-12, 'PHASE-2C-CONTEXT-FIXTURE'),
      semanticHash: '',
    }),
  });
}

console.log('\n--- [SIMULATED] Linear piping Phase 2C source analysis context check ---');

const baselineRequest = sourceRequest();
const baselineContext = compileLinearPipingSourceAnalysisContext(
  baselineRequest,
  { factorizationCache: null },
);
const legacyResult = runLinearPipingAnalysisFromSourceAuthorities(
  baselineRequest,
  { factorizationCache: null },
);

test('P2C-CONTEXT-01', 'Context retains exact B-2.5, B-3.0 and T0 records', () => {
  assert.equal(baselineContext.compilation.semanticHash, baselineContext.analysisResult.parents.compilationSemanticHash);
  assert.equal(baselineContext.compilation.evidenceHash, baselineContext.analysisResult.parents.compilationEvidenceHash);
  assert.equal(baselineContext.loadCase.semanticHash, baselineContext.analysisResult.parents.loadCaseSemanticHash);
  assert.equal(baselineContext.loadCase.evidenceHash, baselineContext.analysisResult.parents.loadCaseEvidenceHash);
  assert.equal(
    requireLinearPipingSourceAnalysisContext(baselineContext).semanticHash,
    baselineContext.semanticHash,
  );
});

test('P2C-CONTEXT-02', 'Existing result-only API remains behavior compatible', () => {
  assert.equal(legacyResult.semanticHash, baselineContext.analysisResult.semanticHash);
  assert.equal(legacyResult.evidenceHash, baselineContext.analysisResult.evidenceHash);
  assert.equal(JSON.stringify(legacyResult), JSON.stringify(baselineContext.analysisResult));
});

test('P2C-CONTEXT-03', 'Phase 3 consumes retained context without recompilation', () => {
  const interfaceSet = interfaceSetFromContext(baselineContext);
  const recovery = recoverLinearPipingInterfaceLoads({
    interfaceSet,
    analysisResult: baselineContext.analysisResult,
    loadCase: baselineContext.loadCase,
  });
  assert.equal(recovery.analysisResultSemanticHash, baselineContext.analysisResult.semanticHash);
  assert.equal(recovery.physicalLoadCaseHash, baselineContext.loadCase.physicalLoadCaseHash);
  assert.equal(recovery.interfaceSetSemanticHash, interfaceSet.semanticHash);
  assert.equal(recovery.results.length, 1);
});

test('P2C-CONTEXT-04', 'A different valid compilation cannot be attached to an existing result', () => {
  const changedRequest = sourceRequest();
  changedRequest.mechanicalModelInput = structuredClone(changedRequest.mechanicalModelInput);
  changedRequest.mechanicalModelInput.modelRevision = 2;
  const changed = compileLinearPipingSourceAnalysisContext(
    changedRequest,
    { factorizationCache: null },
  );
  expectCode(
    () => sealLinearPipingSourceAnalysisContext({
      compilation: changed.compilation,
      loadCase: baselineContext.loadCase,
      analysisResult: baselineContext.analysisResult,
    }),
    'PIPING_SOURCE_CONTEXT_PARENT_MISMATCH',
  );
});

test('P2C-CONTEXT-05', 'Context hash tamper is independently rejected', () => {
  const tampered = structuredClone(baselineContext);
  tampered.evidenceHash = 'fnv1a64:0000000000000000';
  expectCode(
    () => requireLinearPipingSourceAnalysisContext(tampered),
    'PIPING_SOURCE_CONTEXT_HASH_MISMATCH',
  );
});

test('P2C-CONTEXT-06', 'Repeated context compilation is deterministic', () => {
  const repeated = compileLinearPipingSourceAnalysisContext(
    sourceRequest(),
    { factorizationCache: null },
  );
  assert.equal(repeated.semanticHash, baselineContext.semanticHash);
  assert.equal(repeated.evidenceHash, baselineContext.evidenceHash);
  assert.equal(JSON.stringify(repeated), JSON.stringify(baselineContext));
});

test('P2C-CONTEXT-07', 'Factorization reuse changes context evidence only', () => {
  const cache = createFactorizationCache();
  const first = compileLinearPipingSourceAnalysisContext(sourceRequest(), { factorizationCache: cache });
  const second = compileLinearPipingSourceAnalysisContext(sourceRequest(), { factorizationCache: cache });
  assert.equal(first.semanticHash, second.semanticHash);
  assert.notEqual(first.evidenceHash, second.evidenceHash);
  assert.equal(first.analysisResult.execution.factorization.reused, false);
  assert.equal(second.analysisResult.execution.factorization.reused, true);
});

test('P2C-CONTEXT-08', 'Context creation does not freeze caller-owned requests', () => {
  const mutable = sourceRequest();
  compileLinearPipingSourceAnalysisContext(mutable, { factorizationCache: null });
  assert.equal(Object.isFrozen(mutable), false);
  assert.equal(Object.isFrozen(mutable.mechanicalModelInput), false);
  assert.equal(Object.isFrozen(mutable.physicalLoadCaseInput), false);
});

console.log('\n[SIMULATED] Linear piping Phase 2C source analysis context check PASS\n');
