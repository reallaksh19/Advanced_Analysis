#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  UnilateralConvergenceError,
  checkSupportStatus,
  compileUnilateralSolverExecution,
  createUnilateralDeclaration,
  sealUnilateralDeclaration,
  sealUnilateralPolicy,
} from '../src/core/linear-fea-unilateral-solver/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';

function fixed(declarationId, nodeId) {
  return { declarationId, kind: 'NODAL_RESTRAINT', nodeId, dof: 'UY', behavior: 'FIXED' };
}

function support(declarationId, nodeId) {
  return sealUnilateralDeclaration({
    constraint: fixed(declarationId, nodeId),
    sense: 1,
    gap: 0,
    frictionCoefficient: 0,
  });
}

const U1 = support('C-01', 'N-01');
const U2 = support('C-02', 'N-02');
const BASE = [fixed('C-ROOT', 'N-ROOT')];

function deterministicSolve(active) {
  const ids = active.map((row) => row.declarationId);
  const activeSet = new Set(ids);
  const reactions = [];
  if (activeSet.has(U1.declarationId)) reactions.push({ nodeId: U1.nodeId, dof: 'UY', value: -10 });
  if (activeSet.has(U2.declarationId)) reactions.push({ nodeId: U2.nodeId, dof: 'UY', value: 20 });
  return {
    semanticHash: semanticHash({ ids }),
    reactions,
    displacement: [
      { nodeId: U1.nodeId, dof: 'UY', value: activeSet.has(U1.declarationId) ? 0 : 0.01 },
      { nodeId: U2.nodeId, dof: 'UY', value: activeSet.has(U2.declarationId) ? 0 : 0.02 },
    ],
  };
}

function run(unilateral) {
  return compileUnilateralSolverExecution({
    baseDeclarations: BASE,
    unilateral,
    buildAndSolve: deterministicSolve,
    policy: { penetrationTolerance: 1e-12 },
  });
}

const first = run([U1, U2]);
const repeat = run([U1, U2]);
const reversed = run([U2, U1]);
for (const other of [repeat, reversed]) {
  assert.deepEqual(other.convergedState, first.convergedState, 'converged state must be permutation invariant');
  assert.deepEqual(other.trace.map((row) => row.semanticHash), first.trace.map((row) => row.semanticHash), 'trace hashes must be identical');
  assert.deepEqual(other.trace.map((row) => row.executionHash), first.trace.map((row) => row.executionHash), 'inner execution hashes must be identical');
  assert.equal(other.semanticHash, first.semanticHash, 'unilateral execution hash must be identical');
}
assert.deepEqual(first.trace[0].engagedSet, ['C-01', 'C-02'], 'unilateral declarations must be canonicalized');
assert.equal(first.convergedState.find((row) => row.declarationId === 'C-01').engaged, false);
assert.equal(first.convergedState.find((row) => row.declarationId === 'C-02').engaged, true);

function statusOnce({ engaged, reaction, displacement, gap = 0, policy }) {
  const u = gap > 0
    ? createUnilateralDeclaration({ declarationId: 'C-TOL', nodeId: 'N-TOL', typeCode: 14, gap })
    : sealUnilateralDeclaration({ constraint: fixed('C-TOL', 'N-TOL'), sense: 1, gap, frictionCoefficient: 0 });
  return checkSupportStatus({
    execution: {
      semanticHash: 'fnv1a64:1111111111111111',
      reactions: engaged ? [{ nodeId: 'N-TOL', dof: 'UY', value: reaction }] : [],
      displacement: [{ nodeId: 'N-TOL', dof: 'UY', value: displacement }],
    },
    unilateral: [u],
    engaged: new Map([['C-TOL', engaged]]),
    flipCounts: new Map([['C-TOL', 0]]),
    frozenReleased: new Set(),
    policy,
  });
}

const tolerancePolicy = sealUnilateralPolicy({ forceTolerance: 1, penetrationTolerance: 1e-6 });
assert.equal(statusOnce({ engaged: true, reaction: -1, displacement: 0, policy: tolerancePolicy }).flips.length, 0, 'reaction exactly at tolerance is zero-band');
assert.equal(statusOnce({ engaged: true, reaction: -1.000001, displacement: 0, policy: tolerancePolicy }).flips[0].nowEngaged, false, 'reaction beyond tolerance releases');
assert.equal(statusOnce({ engaged: false, reaction: 0, displacement: -0.010001, gap: 0.01, policy: tolerancePolicy }).flips.length, 0, 'displacement exactly at penetration tolerance stays released');
assert.equal(statusOnce({ engaged: false, reaction: 0, displacement: -0.0100011, gap: 0.01, policy: tolerancePolicy }).flips[0].nowEngaged, true, 'penetration beyond tolerance re-engages');

let sequenceIndex = 0;
const chatter = [
  { engagedReaction: -2, releasedDisplacement: 0, hash: 'fnv1a64:2121212121212121' },
  { engagedReaction: 0, releasedDisplacement: -2, hash: 'fnv1a64:2222222222222222' },
  { engagedReaction: -2, releasedDisplacement: 0, hash: 'fnv1a64:2323232323232323' },
  { engagedReaction: 0, releasedDisplacement: -2, hash: 'fnv1a64:2424242424242424' },
];
const frozen = compileUnilateralSolverExecution({
  baseDeclarations: [],
  unilateral: [support('C-CHATTER', 'N-CHATTER')],
  policy: { forceTolerance: 1, penetrationTolerance: 0, flipLimit: 3 },
  buildAndSolve(active) {
    const row = chatter[sequenceIndex++];
    const engaged = active.length > 0;
    return {
      semanticHash: row.hash,
      reactions: engaged ? [{ nodeId: 'N-CHATTER', dof: 'UY', value: row.engagedReaction }] : [],
      displacement: [{ nodeId: 'N-CHATTER', dof: 'UY', value: engaged ? 0 : row.releasedDisplacement }],
    };
  },
});
assert.equal(frozen.trace.length, 4, 'three-flip chatter rule must resolve inside the 4*n cap');
assert.equal(frozen.trace[3].flips[0].reason, 'CHATTER_FREEZE_RELEASED');
assert.equal(frozen.convergedState[0].engaged, false);
assert.equal(frozen.convergedState[0].frozenReleased, true);
assert.equal(frozen.diagnostics.statusEvents[0].code, 'UNILATERAL_SUPPORT_FROZEN_RELEASED');

function oscillatingSolve(active) {
  const activeSet = new Set(active.map((row) => row.declarationId));
  return {
    semanticHash: semanticHash({ active: [...activeSet].sort() }),
    reactions: [U1, U2]
      .filter((row) => activeSet.has(row.declarationId))
      .map((row) => ({ nodeId: row.nodeId, dof: 'UY', value: -10 })),
    displacement: [U1, U2].map((row) => ({
      nodeId: row.nodeId, dof: 'UY', value: activeSet.has(row.declarationId) ? 0 : -0.01,
    })),
  };
}

assert.throws(
  () => compileUnilateralSolverExecution({
    baseDeclarations: [], unilateral: [U1, U2], policy: { maxIterationsFactor: 1 },
    buildAndSolve: oscillatingSolve,
  }),
  (error) => error instanceof UnilateralConvergenceError && error.code === 'UNILATERAL_NON_CONVERGENCE' && !('finalExecution' in error.evidence),
  'cap hit must fail closed without a final execution',
);

console.log('M036 unilateral determinism T3/T4 PASS');
console.log(`Trace hashes: ${first.trace.map((row) => row.semanticHash).join(', ')}`);
