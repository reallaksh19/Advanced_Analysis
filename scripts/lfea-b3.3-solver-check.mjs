#!/usr/bin/env node

/**
 * LFEA B-3.3 sparse assembly and solver check.
 *
 * Covers `src/core/linear-fea-solver/`: section 8 (DOF indexing, assembly,
 * boundary conditions, scaling, factorization, reuse, failure reporting) and
 * section 8.1 numerical qualification, exercised through FRAME-3D-01 (an
 * unsymmetrical combined 3D tip load on a two-element cantilever) and
 * PRESCRIBED-01 (support settlement, partition coupling and reaction
 * recovery), at the section 15.4 tolerances.
 */

import assert from 'node:assert/strict';
import {
  buildDofMap,
  assembleGlobalSystem,
  compileSolverExecution,
  connectedComponents,
  createFactorizationCache,
  DOF_MAP_SCHEMA,
  EXECUTION_SCHEMA,
  EXECUTION_RECORD_KEYS,
  factorizeFreePartition,
  requireSolverExecution,
  resolveSolverPolicies,
} from '../src/core/linear-fea-solver/index.js';
import {
  cantileverCompilation,
  cantileverConstraintDeclarations,
  cantileverWithSettlementSlotCompilation,
  elementContributions,
  floatingCompilation,
  frameElements,
  settlementLoadCase,
  solverProfile,
  tipLoadCase,
  tipLoadPrimitive,
  underRestrainedCompilation,
} from './lfea-b3.3-solver-fixtures.mjs';

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

function assertClose(actual, expected, relativeTolerance, message) {
  const scale = Math.max(Math.abs(expected), 1e-300);
  assert.ok(
    Math.abs(actual - expected) <= relativeTolerance * scale,
    `${message}: ${actual} differs from ${expected} beyond ${relativeTolerance} relative`,
  );
}

function assertDeepFrozen(value, path = '$', skipKeys = []) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true, `${path} is not frozen`);
  if (Array.isArray(value)) value.forEach((child, index) => assertDeepFrozen(child, `${path}[${index}]`, skipKeys));
  else {
    Object.entries(value).forEach(([key, child]) => {
      if (skipKeys.includes(key)) return;
      assertDeepFrozen(child, `${path}.${key}`, skipKeys);
    });
  }
}

function displacementAt(execution, nodeId, dof) {
  return execution.displacement.find((entry) => entry.nodeId === nodeId && entry.dof === dof).value;
}

function reactionAt(execution, nodeId, dof) {
  return execution.reactions.find((entry) => entry.nodeId === nodeId && entry.dof === dof).value;
}

console.log('\n--- LFEA B-3.3 sparse assembly and solver check ---');

const compilation = cantileverCompilation();
const contributions = elementContributions();
const profile = solverProfile();
const baseline = frameElements()[0];
const E = baseline.material.elasticModulus;
const G = baseline.material.shearModulus;
const IY = baseline.section.secondMomentY;
const IZ = baseline.section.secondMomentZ;
const J = baseline.section.polarMoment;
const LENGTH = 2.4; // total cantilever length, two 1.2 m spans in series

test('B33-T01', 'The DOF map is canonical and covers every model node', () => {
  const dofMap = buildDofMap(compilation.model);
  assert.equal(dofMap.schema, DOF_MAP_SCHEMA);
  assert.deepEqual(dofMap.nodeOrder, ['N-000120', 'N-000121', 'N-000122']);
  assert.equal(dofMap.dofCount, 18);
  assertDeepFrozen(dofMap);
});

test('B33-T02', 'Assembly sums duplicate contributions deterministically regardless of input order', () => {
  const dofMap = buildDofMap(compilation.model);
  const forward = assembleGlobalSystem({ model: compilation.model, dofMap, elementContributions: contributions });
  const reversed = assembleGlobalSystem({ model: compilation.model, dofMap, elementContributions: [...contributions].reverse() });
  assert.deepEqual(forward.K, reversed.K);
  assert.equal(forward.tripletCount, reversed.tripletCount);
});

test('B33-T03', 'A sealed execution record carries exactly the declared keys and is frozen', () => {
  const execution = compileSolverExecution({
    compilation, elementContributions: contributions, loadCase: tipLoadCase(compilation), solverProfile: profile,
  });
  assert.deepEqual(Object.keys(execution).sort(), [...EXECUTION_RECORD_KEYS, 'factorizationHandle', 'prescribedValueDiagnostics', 'nodalForceDiagnostics'].sort());
  assert.equal(execution.schema, EXECUTION_SCHEMA);
  assert.equal(execution.status, 'QUALIFIED');
  assertDeepFrozen(execution);
});

test('B33-T04', 'FRAME-3D-01: reactions balance the applied 3D tip load in closed form', () => {
  const execution = compileSolverExecution({
    compilation, elementContributions: contributions, loadCase: tipLoadCase(compilation), solverProfile: profile,
  });
  // Applied at the tip (N-000122, r = (2.4,0,0) from the base): Fy=1500, Fz=-900, Mx=340.
  assertClose(reactionAt(execution, 'N-000120', 'UX'), 0, 1e-8, 'UX reaction');
  assertClose(reactionAt(execution, 'N-000120', 'UY'), -1500, 1e-8, 'UY reaction');
  assertClose(reactionAt(execution, 'N-000120', 'UZ'), 900, 1e-8, 'UZ reaction');
  assertClose(reactionAt(execution, 'N-000120', 'RX'), -340, 1e-8, 'RX reaction');
  assertClose(reactionAt(execution, 'N-000120', 'RY'), -2160, 1e-8, 'RY reaction (r x F + applied moment)');
  assertClose(reactionAt(execution, 'N-000120', 'RZ'), -3600, 1e-8, 'RZ reaction (r x F)');
});

test('B33-T05', 'FRAME-3D-01: tip deflection and twist match cantilever closed form for the two-span chain', () => {
  const execution = compileSolverExecution({
    compilation, elementContributions: contributions, loadCase: tipLoadCase(compilation), solverProfile: profile,
  });
  const uy = displacementAt(execution, 'N-000122', 'UY');
  const uz = displacementAt(execution, 'N-000122', 'UZ');
  const rx = displacementAt(execution, 'N-000122', 'RX');
  assertClose(uy, (1500 * LENGTH ** 3) / (3 * E * IZ), 1e-8, 'UY tip deflection (Fy on Iz)');
  assertClose(uz, (-900 * LENGTH ** 3) / (3 * E * IY), 1e-8, 'UZ tip deflection (Fz on Iy)');
  assertClose(rx, (340 * LENGTH) / (G * J), 1e-8, 'RX tip twist');
});

test('B33-T06', 'FRAME-3D-01: section 8.1 qualification gates all pass at the declared thresholds', () => {
  const execution = compileSolverExecution({
    compilation, elementContributions: contributions, loadCase: tipLoadCase(compilation), solverProfile: profile,
  });
  for (const [name, diagnostic] of Object.entries(execution.diagnostics)) {
    assert.equal(diagnostic.status, 'PASS', `${name} did not pass: ${JSON.stringify(diagnostic)}`);
  }
  assert.equal(execution.diagnostics.momentEquilibrium.referenceNodeId, 'N-000120');
});

test('B33-T07', 'PRESCRIBED-01: an imposed settlement is recovered exactly and couples correctly to reactions', () => {
  const settled = cantileverWithSettlementSlotCompilation();
  const execution = compileSolverExecution({
    compilation: settled, elementContributions: contributions, loadCase: settlementLoadCase(settled), solverProfile: profile,
  });
  assert.equal(displacementAt(execution, 'N-000121', 'UZ'), -0.006);
  assert.equal(execution.status, 'QUALIFIED');
  for (const diagnostic of Object.values(execution.diagnostics)) assert.equal(diagnostic.status, 'PASS');
  // The prescribed slot at the mid-span carries a real reaction, not zero,
  // since the chain is genuinely bent to hold it there.
  const slotReaction = execution.reactions.find((entry) => entry.nodeId === 'N-000121' && entry.dof === 'UZ');
  assert.notEqual(slotReaction.value, 0);
});

test('B33-T08', 'PRESCRIBED-01: the same settlement solved by an independent dense reference matches', () => {
  const settled = cantileverWithSettlementSlotCompilation();
  const execution = compileSolverExecution({
    compilation: settled, elementContributions: contributions, loadCase: settlementLoadCase(settled), solverProfile: profile,
  });
  // Independent reference: extract Kff/Kfc from the module's own assembly (not
  // its solve path), impose Uc by hand, and solve the reduced system with a
  // plain Gaussian elimination implemented in this test file, not reused from
  // the module under test.
  const dofMap = buildDofMap(settled.model);
  const assembly = assembleGlobalSystem({ model: settled.model, dofMap, elementContributions: contributions });
  const n = assembly.n;
  const free = assembly.freeIndices;
  const constrained = assembly.constrained;
  const Uc = constrained.map((entry) => (entry.behavior === 'PRESCRIBED_SLOT' ? -0.006 : 0));
  const Ffree = free.map((row) => {
    let coupling = 0;
    constrained.forEach((entry, col) => { coupling += assembly.K[row * n + entry.globalIndex] * Uc[col]; });
    return -coupling;
  });
  const Kff = free.map((r) => free.map((c) => assembly.K[r * n + c]));
  const m = free.length;
  const work = Kff.map((row, i) => [...row, Ffree[i]]);
  for (let col = 0; col < m; col += 1) {
    let pivotRow = col;
    for (let row = col + 1; row < m; row += 1) if (Math.abs(work[row][col]) > Math.abs(work[pivotRow][col])) pivotRow = row;
    [work[col], work[pivotRow]] = [work[pivotRow], work[col]];
    const pivot = work[col][col];
    for (let j = col; j <= m; j += 1) work[col][j] /= pivot;
    for (let row = 0; row < m; row += 1) {
      if (row === col) continue;
      const factor = work[row][col];
      for (let j = col; j <= m; j += 1) work[row][j] -= factor * work[col][j];
    }
  }
  const Uf = work.map((row) => row[m]);
  free.forEach((globalIndex, row) => {
    const entry = dofMap.entries[globalIndex];
    const solved = displacementAt(execution, entry.nodeId, entry.dof);
    assertClose(solved, Uf[row], 1e-8, `${entry.nodeId}:${entry.dof} vs independent reference solve`);
  });
});

test('B33-T09', 'Factorization is reused across load cases sharing stiffnessStateHash and partition, and not otherwise', () => {
  const cache = createFactorizationCache();
  const first = compileSolverExecution({
    compilation, elementContributions: contributions, loadCase: tipLoadCase(compilation), solverProfile: profile, cache,
  });
  assert.equal(first.factorization.reused, false);
  const second = compileSolverExecution({
    compilation, elementContributions: contributions, loadCase: tipLoadCase(compilation), solverProfile: profile, cache,
  });
  assert.equal(second.factorization.reused, true);
  assert.equal(first.factorizationHandle, second.factorizationHandle, 'reuse must return the identical factorization object');
  assert.equal(first.executionHash, second.executionHash, 'cache reuse is runtime evidence, not engineering identity');
  assert.notEqual(first.evidenceHash, second.evidenceHash, 'cache reuse remains visible in evidence');

  const settled = cantileverWithSettlementSlotCompilation();
  const third = compileSolverExecution({
    compilation: settled, elementContributions: contributions, loadCase: settlementLoadCase(settled), solverProfile: profile, cache,
  });
  assert.equal(third.factorization.reused, false, 'a changed constrained partition must miss the cache');
  assert.notEqual(third.factorizationHandle, first.factorizationHandle);
});

test('B33-T10', 'A floating (fully unrestrained) connected component is refused through the full solve, never silently solved', () => {
  const floating = floatingCompilation();
  expectCode(() => compileSolverExecution({
    compilation: floating,
    elementContributions: contributions,
    loadCase: tipLoadCase(floating),
    solverProfile: profile,
  }), 'SOLVER_MECHANISM_FLOATING_COMPONENT');
});

test('B33-T11', 'A floating connected component is refused directly by factorization with node/component identity', () => {
  const model = floatingCompilation().model;
  const dofMap = buildDofMap(model);
  const assembly = assembleGlobalSystem({ model, dofMap, elementContributions: contributions });
  const policies = resolveSolverPolicies(profile);
  expectCode(() => factorizeFreePartition({ model, dofMap, assembly, policies }), 'SOLVER_MECHANISM_FLOATING_COMPONENT');
  const components = connectedComponents(model);
  assert.equal(components.length, 1);
  assert.deepEqual(components[0].nodeIds, ['N-000120', 'N-000121', 'N-000122']);
});

test('B33-T12', 'An under-restrained system (unpinned rigid-body rotation) is caught by a near-zero LDLT pivot, not silently solved', () => {
  const model = underRestrainedCompilation().model;
  const dofMap = buildDofMap(model);
  const assembly = assembleGlobalSystem({ model, dofMap, elementContributions: contributions });
  const policies = resolveSolverPolicies(profile);
  expectCode(() => factorizeFreePartition({ model, dofMap, assembly, policies }), 'SOLVER_NEAR_ZERO_PIVOT');
});

test('B33-T13', 'A load case bound to a different model compilation is refused rather than solved against a mismatch', () => {
  const other = cantileverWithSettlementSlotCompilation();
  expectCode(() => compileSolverExecution({
    compilation, elementContributions: contributions, loadCase: settlementLoadCase(other), solverProfile: profile,
  }), 'SOLVER_LOAD_CASE_MODEL_MISMATCH');
});

test('B33-T14', 'stiffnessStateHash is cited from the compilation and stays identical across different load cases', () => {
  const tip = compileSolverExecution({
    compilation, elementContributions: contributions, loadCase: tipLoadCase(compilation), solverProfile: profile,
  });
  const zeroForce = compileSolverExecution({
    compilation, elementContributions: contributions,
    loadCase: tipLoadCase(compilation, {
      loadCaseId: 'LC-TIP-ZERO',
      primitives: [tipLoadPrimitive({
        primitiveId: 'LP-TIP-ZERO',
        force: { fx: 0, fy: 0, fz: 0 },
        moment: { mx: 0, my: 0, mz: 0 },
      })],
    }),
    solverProfile: profile,
  });
  assert.equal(tip.stiffnessStateHash, compilation.stiffnessStateHash);
  assert.equal(tip.stiffnessStateHash, zeroForce.stiffnessStateHash);
  assert.notEqual(tip.physicalLoadCaseHash, zeroForce.physicalLoadCaseHash);
});

test('B33-T15', 'Every declared solver policy is sourced, and a missing or hidden-default one fails closed', () => {
  const missing = { ...profile };
  delete missing.nearZeroPivotTolerance;
  expectCode(() => resolveSolverPolicies(missing), 'NEAR_ZERO_PIVOT_TOLERANCE_NOT_DECLARED');
  expectCode(
    () => resolveSolverPolicies({ ...profile, conditionWarning: { value: 1, source: 'DEFAULT' } }),
    'SOLVER_PROFILE_SOURCE_NOT_TRACEABLE',
  );
});

test('B33-T16', 'Execution determinism: repeated compilation on identical input is byte-identical', () => {
  const first = compileSolverExecution({
    compilation, elementContributions: contributions, loadCase: tipLoadCase(compilation), solverProfile: profile,
  });
  const second = compileSolverExecution({
    compilation, elementContributions: contributions, loadCase: tipLoadCase(compilation), solverProfile: profile,
  });
  assert.equal(JSON.stringify({ ...first, factorizationHandle: undefined }), JSON.stringify({ ...second, factorizationHandle: undefined }));
  assert.equal(first.semanticHash, second.semanticHash);
});

test('B33-T17', 'requireSolverExecution refuses a stale semantic hash', () => {
  const execution = compileSolverExecution({
    compilation, elementContributions: contributions, loadCase: tipLoadCase(compilation), solverProfile: profile,
  });
  const tampered = { ...execution, status: 'BLOCKED' };
  delete tampered.factorizationHandle;
  delete tampered.prescribedValueDiagnostics;
  delete tampered.nodalForceDiagnostics;
  expectCode(() => requireSolverExecution(tampered), 'SOLVER_HASH_MISMATCH');
});


test('B33-T18', 'A grounded spring is recovered as a support reaction and participates in the global free body', () => {
  const stiffness = 2.5e6;
  const appliedFy = -1000;
  const springCompilation = cantileverCompilation({
    constraintDeclarations: [
      ...cantileverConstraintDeclarations(),
      {
        declarationId: 'C-N122-UY-SPRING',
        kind: 'PARTIAL_RELEASE_SPRING',
        nodeId: 'N-000122',
        dof: 'UY',
        stiffness,
      },
    ],
  });
  const springCase = tipLoadCase(springCompilation, {
    loadCaseId: 'LC-TIP-SPRING-REACTION',
    primitives: [tipLoadPrimitive({
      primitiveId: 'LP-TIP-SPRING-REACTION',
      force: { fx: 0, fy: appliedFy, fz: 0 },
      moment: { mx: 0, my: 0, mz: 0 },
    })],
  });
  const execution = compileSolverExecution({
    compilation: springCompilation,
    elementContributions: contributions,
    loadCase: springCase,
    solverProfile: profile,
  });
  const tipUy = displacementAt(execution, 'N-000122', 'UY');
  const springReaction = reactionAt(execution, 'N-000122', 'UY');
  const rootReaction = reactionAt(execution, 'N-000120', 'UY');
  assertClose(springReaction, -stiffness * tipUy, 1e-12, 'grounded spring support action');
  assert.ok(Math.abs(rootReaction + springReaction + appliedFy) <= 1e-9, 'complete applied/fixed/spring vertical free body');
  assert.equal(execution.reactions.filter((entry) => entry.nodeId === 'N-000122' && entry.dof === 'UY').length, 1);
  assert.equal(execution.diagnostics.forceEquilibrium.groundedSpringCount, 1);
  assert.equal(execution.diagnostics.momentEquilibrium.groundedSpringCount, 1);
  assert.equal(execution.status, 'QUALIFIED');
});

console.log('\nLFEA B-3.3 sparse assembly and solver check PASS\n');
