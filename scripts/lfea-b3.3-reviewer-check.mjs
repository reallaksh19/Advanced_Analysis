#!/usr/bin/env node

/**
 * LFEA B-3.3 permanent reviewer regressions (section 15.5).
 *
 * Each case is a mistake a later edit could plausibly reintroduce into
 * assembly or solve: diagnostic text leaking into a hashed identity, a stale
 * factorization silently reused, a genuine mechanism silently "solved", and a
 * hidden numeric default accepted as a declared policy.
 */

import assert from 'node:assert/strict';
import {
  buildDofMap,
  assembleGlobalSystem,
  compileSolverExecution,
  createFactorizationCache,
  factorizeFreePartition,
  resolveSolverPolicies,
} from '../src/core/linear-fea-solver/index.js';
import {
  cantileverCompilation,
  cantileverWithSettlementSlotCompilation,
  elementContributions,
  floatingCompilation,
  settlementLoadCase,
  solverProfile,
  tipLoadCase,
  underRestrainedCompilation,
} from './lfea-b3.3-solver-fixtures.mjs';

function expectCode(body, expectedCode) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, expectedCode, `expected ${expectedCode}, received ${error?.code}`);
    return true;
  });
}

const compilation = cantileverCompilation();
const contributions = elementContributions();
const profile = solverProfile();

/*
 * Regression 1 — a hidden default source accepted as a declared policy.
 *
 * `{value, source: 'DEFAULT'}` reads as a declared value to a naive check
 * (finite number, nonempty source string); only an explicit source-token
 * guard catches that the source names no real authority.
 */
expectCode(
  () => resolveSolverPolicies({ ...profile, energyBalanceLimit: { value: 1e-7, source: 'ASSUMED' } }),
  'SOLVER_PROFILE_SOURCE_NOT_TRACEABLE',
);

/*
 * Regression 2 — stiffnessStateHash must never absorb load-case or
 * diagnostic content. Two executions against the same compilation but very
 * different physical load cases (a mechanical tip load vs. a prescribed
 * settlement bound to a different compilation variant) must still cite the
 * identical stiffnessStateHash for the model each is actually bound to; the
 * value must be a pure citation of the compilation, never recomputed from
 * anything this package touches.
 */
const tipExecution = compileSolverExecution({
  compilation, elementContributions: contributions, loadCase: tipLoadCase(compilation), solverProfile: profile,
});
assert.equal(tipExecution.stiffnessStateHash, compilation.stiffnessStateHash);
const settled = cantileverWithSettlementSlotCompilation();
const settlementExecution = compileSolverExecution({
  compilation: settled, elementContributions: contributions, loadCase: settlementLoadCase(settled), solverProfile: profile,
});
assert.equal(settlementExecution.stiffnessStateHash, settled.stiffnessStateHash);
assert.notEqual(
  tipExecution.stiffnessStateHash,
  settlementExecution.stiffnessStateHash,
  'a genuinely different constrained mechanical model must not collide onto the same stiffnessStateHash',
);

/*
 * Regression 3 — a stale factorization reused after the stiffness state or
 * constrained partition changed. The cache key must be recomputed from the
 * live compilation and partition every call, not cached by, say, a load-case
 * identity or a caller-supplied label.
 */
const cache = createFactorizationCache();
const first = compileSolverExecution({
  compilation, elementContributions: contributions, loadCase: tipLoadCase(compilation), solverProfile: profile, cache,
});
const afterPartitionChange = compileSolverExecution({
  compilation: settled, elementContributions: contributions, loadCase: settlementLoadCase(settled), solverProfile: profile, cache,
});
assert.notEqual(
  first.factorizationHandle,
  afterPartitionChange.factorizationHandle,
  'a changed constrained partition must never reuse a prior factorization',
);
assert.notEqual(first.factorization.cacheKey, afterPartitionChange.factorization.cacheKey);

/*
 * Regression 4 — a genuine rigid-body mechanism silently "solved" instead of
 * refused. Both the topological floating-component path and the numerical
 * near-zero-pivot path must throw with their own machine code rather than
 * ever returning a QUALIFIED/CONDITIONAL execution built on garbage
 * displacement.
 */
const floating = floatingCompilation();
expectCode(
  () => compileSolverExecution({
    compilation: floating, elementContributions: contributions, loadCase: tipLoadCase(floating), solverProfile: profile,
  }),
  'SOLVER_MECHANISM_FLOATING_COMPONENT',
);

const underRestrained = underRestrainedCompilation();
{
  const model = underRestrained.model;
  const dofMap = buildDofMap(model);
  const assembly = assembleGlobalSystem({ model, dofMap, elementContributions: contributions });
  const policies = resolveSolverPolicies(profile);
  expectCode(() => factorizeFreePartition({ model, dofMap, assembly, policies }), 'SOLVER_NEAR_ZERO_PIVOT');
}

/*
 * Regression 5 — the execution's own semantic hash must be reproducible on
 * re-validation, not merely on first computation. A self-referential
 * projection (one that includes the hash-derived `executionHash` field in
 * the input to its own hash) recomputes to a different value the moment
 * `executionHash` stops being the empty-string draft value, which is exactly
 * the shape of bug a stale-hash check must catch on every future edit.
 */
{
  const execution = compileSolverExecution({
    compilation, elementContributions: contributions, loadCase: tipLoadCase(compilation), solverProfile: profile,
  });
  const roundTripped = JSON.parse(JSON.stringify(execution));
  assert.equal(roundTripped.executionHash, roundTripped.semanticHash);
}

console.log('LFEA B-3.3 reviewer regression check PASS');
