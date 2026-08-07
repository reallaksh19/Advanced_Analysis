#!/usr/bin/env node

import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  UNILATERAL_FREEZE_DIAGNOSTIC,
  compileUnilateralSolverExecution,
  evaluateSupportStatus,
  normalizeUnilateralDeclarations,
  resolveUnilateralPolicy,
} from '../src/core/linear-fea-unilateral-solver/index.js';

const A = Object.freeze({ declarationId: 'C-M036-A', nodeId: 'N-A', typeCode: 14, gap: 0, frictionCoefficient: null });
const B = Object.freeze({ declarationId: 'C-M036-B', nodeId: 'N-B', typeCode: 14, gap: 0, frictionCoefficient: null });

function execution(active, behavior) {
  const ids = active.map((entry) => entry.declarationId).sort();
  const activeSet = new Set(ids);
  const reactions = [];
  const displacement = [];
  for (const declaration of [A, B]) {
    const state = behavior(declaration.declarationId, activeSet.has(declaration.declarationId));
    if (activeSet.has(declaration.declarationId)) {
      reactions.push({ nodeId: declaration.nodeId, dof: 'UY', value: state.reaction });
    }
    displacement.push({ nodeId: declaration.nodeId, dof: 'UY', value: state.displacement });
  }
  return Object.freeze({
    semanticHash: semanticHash({ activeIds: ids, state: behavior.name }),
    reactions: Object.freeze(reactions),
    displacement: Object.freeze(displacement),
  });
}

function deterministicBehavior(id, active) {
  if (id === A.declarationId) return { reaction: active ? -10 : 0, displacement: 0.01 };
  return { reaction: active ? 10 : 0, displacement: 0 };
}

function solveDeterministic(unilateral) {
  return compileUnilateralSolverExecution({
    baseDeclarations: [],
    unilateral,
    buildAndSolve: (active) => execution(active, deterministicBehavior),
  });
}

const first = solveDeterministic([A, B]);
const repeated = solveDeterministic([A, B]);
const reversed = solveDeterministic([B, A]);

assert.equal(first.semanticHash, repeated.semanticHash, 'repeat semantic hash');
assert.equal(first.semanticHash, reversed.semanticHash, 'permutation semantic hash');
assert.deepEqual(first.trace, repeated.trace, 'repeat trace');
assert.deepEqual(first.trace, reversed.trace, 'permuted trace');
assert.deepEqual(first.convergedState, reversed.convergedState, 'permuted converged state');
assert.deepEqual(first.convergedState.map((entry) => [entry.declarationId, entry.status]), [
  [A.declarationId, 'RELEASED'],
  [B.declarationId, 'ENGAGED'],
]);

const normalizedA = normalizeUnilateralDeclarations([A])[0];
const policy = resolveUnilateralPolicy(undefined, 1);
const nearZero = evaluateSupportStatus({
  declaration: normalizedA,
  engaged: true,
  policy,
  execution: { reactions: [{ nodeId: A.nodeId, dof: 'UY', value: -0.5 }], displacement: [] },
});
assert.equal(nearZero.shouldFlip, false, '|R| <= 1 N must remain in the dead band');
const outsideBand = evaluateSupportStatus({
  declaration: normalizedA,
  engaged: true,
  policy,
  execution: { reactions: [{ nodeId: A.nodeId, dof: 'UY', value: -1.000001 }], displacement: [] },
});
assert.equal(outsideBand.shouldFlip, true, 'reaction beyond -1 N must release +Y');

function oscillatingBehavior(id, active) {
  assert.equal(id, A.declarationId);
  return active
    ? { reaction: -2, displacement: 0 }
    : { reaction: 0, displacement: -0.01 };
}

const frozen = compileUnilateralSolverExecution({
  baseDeclarations: [],
  unilateral: [A],
  buildAndSolve: (active) => execution(active, oscillatingBehavior),
});
assert.equal(frozen.trace.length, 4, 'freeze must occur on the fourth attempted state change');
assert.equal(frozen.convergedState[0].status, 'RELEASED');
assert.equal(frozen.convergedState[0].frozenReleased, true);
assert.equal(frozen.trace[3].frozenDiagnostics.length, 1);
assert.equal(frozen.trace[3].frozenDiagnostics[0].code, UNILATERAL_FREEZE_DIAGNOSTIC);
assert.equal(frozen.trace[3].frozenDiagnostics[0].priorFlipCount, 3);

let noOpCalls = 0;
const direct = Object.freeze({
  semanticHash: 'fnv1a64:0000000000000001',
  reactions: Object.freeze([]),
  displacement: Object.freeze([]),
});
const noOp = compileUnilateralSolverExecution({
  baseDeclarations: [],
  unilateral: [],
  buildAndSolve: () => { noOpCalls += 1; return direct; },
});
assert.equal(noOpCalls, 1, 'zero unilateral declarations must make exactly one inner solve');
assert.equal(noOp.finalExecution, direct, 'zero-unilateral path must retain the exact inner execution object');
assert.equal(noOp.finalExecutionHash, direct.semanticHash, 'zero-unilateral inner hash equality');

console.log(JSON.stringify({
  check: 'lfea-unilateral-determinism',
  status: 'PASS',
  permutationHash: first.semanticHash,
  frozenTraceLength: frozen.trace.length,
  noOpInnerHash: noOp.finalExecutionHash,
}, null, 2));
