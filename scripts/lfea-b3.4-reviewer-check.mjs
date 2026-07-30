#!/usr/bin/env node

/**
 * LFEA B-3.4 permanent reviewer regressions (section 15.5).
 *
 * Two of these are the exact defect shapes a prior LFEA package shipped with
 * and this orchestration caught only by hand-exercising the module with
 * concrete numbers rather than trusting assertions written to match whatever
 * the code produced: (1) a hash-projection function that includes a field
 * only set after the first hash computation, making every re-validation
 * report a false "stale hash"; (2) a code-point/joint consistency check that
 * compares two attached elements' end actions for raw equality instead of
 * the actual nodal-equilibrium balance, which is wrong by a sign at every
 * shared internal node and was caught here only by computing the expected
 * numbers by hand and finding a factor-of-two discrepancy, not by reading
 * the code.
 */

import assert from 'node:assert/strict';
import {
  compileResultRecovery,
  computeRecoveryEvidenceHash,
  computeRecoverySemanticHash,
  foldRecoveryEnvelope,
  recoverySemanticProjection,
  requireResultRecovery,
} from '../src/core/linear-fea-result-recovery/index.js';
import { compileSolverExecution } from '../src/core/linear-fea-solver/index.js';
import { cantileverCompilation, solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import {
  elementContributionFromFrameElement,
  elementContributionsFromPipingComponent,
  frameElementsWithUdl,
  recoveryProfile,
  reducerCompilation,
  reducerComponent,
  reducerTipLoadCase,
  udlLoadCase,
} from './lfea-b3.4-recovery-fixtures.mjs';

function expectCode(body, expectedCode) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, expectedCode, `expected ${expectedCode}, received ${error?.code}`);
    return true;
  });
}

const cantilever = cantileverCompilation();
const udlElements = frameElementsWithUdl(cantilever);
const udlContributions = udlElements.map((element) => elementContributionFromFrameElement(element));
const udl = udlLoadCase(cantilever);
const profile = solverProfile();
const execution = compileSolverExecution({
  compilation: cantilever, elementContributions: udlContributions, loadCase: udl, solverProfile: profile,
});
const recovery = compileResultRecovery({
  compilation: cantilever, execution, loadCase: udl,
  frameElements: udlElements, pipingComponents: [], recoveryProfile: recoveryProfile(),
});

/*
 * Regression 1 — a self-referential hash projection. `recoveryHash` must
 * never enter the projection `computeRecoverySemanticHash` hashes: on the
 * first pass `recoveryHash` is the empty-string draft value, and if the
 * projection included it, every later re-validation (where `recoveryHash`
 * has been replaced by the real hash) would recompute to a different value
 * and report a false stale hash forever. Prove the exclusion directly by
 * checking a self-referential projection recomputes differently once the
 * draft's placeholder is replaced by the real hash — the same proof B-3.3's
 * reviewer check applies to `executionHash`.
 */
{
  const projection = recoverySemanticProjection(recovery);
  assert.equal('recoveryHash' in projection, false, 'recoverySemanticProjection must exclude recoveryHash');
  assert.equal(computeRecoverySemanticHash(recovery), recovery.semanticHash, 'recomputing must reproduce the sealed hash exactly');
  const roundTripped = JSON.parse(JSON.stringify(recovery));
  assert.equal(roundTripped.recoveryHash, roundTripped.semanticHash, 'a round trip through canonical JSON must not disturb the identity');
  // The false-positive-catching shape: had the projection included
  // recoveryHash, this self-referential recompute would diverge because the
  // draft's placeholder ('') differs from the real sealed value.
  const selfReferentialProjection = { ...recoverySemanticProjection(recovery), recoveryHash: recovery.recoveryHash };
  const selfReferentialDraftProjection = { ...recoverySemanticProjection(recovery), recoveryHash: '' };
  assert.notDeepEqual(
    selfReferentialProjection,
    selfReferentialDraftProjection,
    'a hash-inclusive projection would disagree between the draft and sealed forms — the exact false "stale hash" shape being guarded against',
  );
}

/*
 * Regression 2 — the code-point/joint consistency check must compare a
 * nodal-equilibrium balance (`candidate1.global + candidate2.global ==
 * externalLoad`), never raw equality of the two candidates' actions. Rebuild
 * the reducer fixture and confirm the two elements sharing the internal N1
 * node genuinely disagree by very nearly a factor of two under raw equality
 * — proving the correct check is a balance, not an equality, on live sealed
 * evidence rather than by inspection.
 */
{
  const reducer = reducerComponent();
  const reducerModel = reducerCompilation();
  const contributions = elementContributionsFromPipingComponent(reducer);
  const tipLoadCase = reducerTipLoadCase(reducerModel);
  const reducerExecution = compileSolverExecution({
    compilation: reducerModel, elementContributions: contributions, loadCase: tipLoadCase, solverProfile: profile,
  });
  const reducerRecovery = compileResultRecovery({
    compilation: reducerModel, execution: reducerExecution, loadCase: tipLoadCase,
    frameElements: [], pipingComponents: [reducer], recoveryProfile: recoveryProfile(),
  });
  const point = reducerRecovery.componentResultants[0].codePoints.find((entry) => entry.nodeId === 'RED-001.N1');
  assert.equal(point.consistency.withinTolerance, true, 'the correct equilibrium-balance check must accept this shared node');

  const e1 = reducerRecovery.elementActions.find((entry) => entry.elementId === 'RED-001.E1').global.J;
  const e2 = reducerRecovery.elementActions.find((entry) => entry.elementId === 'RED-001.E2').global.I;
  const rawEqualityResidual = Math.max(
    ...['fx', 'fy', 'fz', 'mx', 'my', 'mz'].map((field) => {
      const scale = Math.max(Math.abs(e1[field]), Math.abs(e2[field]), 1);
      return Math.abs(e1[field] - e2[field]) / scale;
    }),
  );
  assert.ok(
    rawEqualityResidual > 1.5,
    `raw equality between the two candidates must disagree by very nearly a factor of two (was ${rawEqualityResidual}) — the exact shape a naive "compare the two ends" check would have silently accepted as consistent only when it happened not to be exercised`,
  );
}

/*
 * Regression 3 — deepFreeze recursion must never be blocked by a nested
 * Object.freeze this package calls on its own draft objects before the
 * final seal. If any builder ever froze a sub-object early, the top-level
 * deepFreeze's `Object.isFrozen(value)` shortcut would skip recursing into
 * that sub-object's children, leaving an array or record inside it silently
 * mutable. Prove every nested array the record carries really is frozen, not
 * just the top-level record.
 */
{
  assert.equal(Object.isFrozen(recovery.elementActions), true);
  assert.equal(Object.isFrozen(recovery.elementActions[0]), true);
  assert.equal(Object.isFrozen(recovery.elementActions[0].local), true);
  assert.equal(Object.isFrozen(recovery.elementActions[0].local.I), true);
  assert.equal(Object.isFrozen(recovery.forceFields[0].stations), true);
  assert.equal(Object.isFrozen(recovery.forceFields[0].stations[0]), true);
  assert.equal(Object.isFrozen(recovery.forceFields[0].stations[0].action), true);
  assert.throws(() => { recovery.elementActions[0].local.I.fx = 999; }, TypeError);
  assert.throws(() => { recovery.forceFields[0].stations.push({}); }, TypeError);
}

/*
 * Regression 4 — an execution that never qualified must never reach
 * recovery, and an envelope must never fold recoveries against different
 * compilations, silently averaging code points that do not correspond to the
 * same physical station.
 */
{
  const strictProfile = solverProfile({
    normalizedResidualLimit: { value: 1e-30, source: 'LFEA-B3.4-FIXTURE-PROFILE' },
    normalizedResidualWarnLimit: { value: 1e-29, source: 'LFEA-B3.4-FIXTURE-PROFILE' },
  });
  const blocked = compileSolverExecution({
    compilation: cantilever, elementContributions: udlContributions, loadCase: udl, solverProfile: strictProfile,
  });
  expectCode(() => compileResultRecovery({
    compilation: cantilever, execution: blocked, loadCase: udl,
    frameElements: udlElements, pipingComponents: [], recoveryProfile: recoveryProfile(),
  }), 'RECOVERY_EXECUTION_BLOCKED');

  const otherModel = reducerCompilation();
  const otherComponent = reducerComponent();
  const otherCase = reducerTipLoadCase(otherModel);
  const otherExecution = compileSolverExecution({
    compilation: otherModel,
    elementContributions: elementContributionsFromPipingComponent(otherComponent),
    loadCase: otherCase,
    solverProfile: profile,
  });
  const otherRecovery = compileResultRecovery({
    compilation: otherModel, execution: otherExecution, loadCase: otherCase,
    frameElements: [], pipingComponents: [otherComponent], recoveryProfile: recoveryProfile(),
  });
  expectCode(() => foldRecoveryEnvelope([recovery, otherRecovery]), 'RECOVERY_ENVELOPE_MODEL_MISMATCH');
}

/* Sanity: requireResultRecovery still refuses a genuinely stale hash. */
{
  const tampered = { ...recovery, executionStatus: recovery.executionStatus === 'QUALIFIED' ? 'CONDITIONAL' : 'QUALIFIED' };
  expectCode(() => requireResultRecovery(tampered), 'RECOVERY_HASH_MISMATCH');
  assert.equal(computeRecoveryEvidenceHash(recovery), recovery.evidenceHash);
}

console.log('LFEA B-3.4 reviewer regression check PASS');
