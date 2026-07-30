#!/usr/bin/env node

/**
 * LFEA B-3.4 result recovery check.
 *
 * Covers `src/core/linear-fea-result-recovery/`: section 9 (element end
 * action, element force field, component result, envelope) and section 9.1
 * (code-point stations), exercised through a UDL cantilever (element end
 * action / force field against closed-form beam equilibrium) and a stepped
 * reducer component (code-point recovery at a trivial and at a shared
 * internal node, plus envelope folding across two load cases).
 */

import assert from 'node:assert/strict';
import {
  RECOVERY_RECORD_KEYS,
  compileResultRecovery,
  foldRecoveryEnvelope,
  requireResultRecovery,
} from '../src/core/linear-fea-result-recovery/index.js';
import { compileSolverExecution } from '../src/core/linear-fea-solver/index.js';
import { computePipingComponentSemanticHash } from '../src/core/linear-fea-piping-components/index.js';
import {
  cantileverCompilation,
  cantileverWithSettlementSlotCompilation,
  elementContributions,
  floatingCompilation,
  frameElements,
  settlementLoadCase,
  solverProfile,
  tipLoadCase,
  tipLoadPrimitive,
} from './lfea-b3.3-solver-fixtures.mjs';
import {
  UDL_INTENSITY_FZ,
  elementContributionFromFrameElement,
  elementContributionsFromPipingComponent,
  frameElementsWithUdl,
  recoveryProfile,
  reducerCompilation,
  reducerComponent,
  reducerTipLoadCase,
  reducerTipLoadPrimitive,
  udlLoadCase,
} from './lfea-b3.4-recovery-fixtures.mjs';

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

function assertClose(actual, expected, absoluteTolerance, message) {
  assert.ok(
    Math.abs(actual - expected) <= absoluteTolerance,
    `${message}: ${actual} differs from ${expected} beyond ${absoluteTolerance} absolute`,
  );
}

function assertDeepFrozen(value, path = '$') {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true, `${path} is not frozen`);
  Object.entries(value).forEach(([key, child]) => assertDeepFrozen(child, `${path}.${key}`));
}

function actionAt(entries, elementId, key = 'elementId') {
  return entries.find((entry) => entry[key] === elementId);
}

console.log('\n--- LFEA B-3.4 result recovery check ---');

/* ---------------------------------------------------------------------- *
 * UDL-01: cantilever, outer span carrying a uniform distributed load.
 * ---------------------------------------------------------------------- */

const cantilever = cantileverCompilation();
const udlElements = frameElementsWithUdl(cantilever);
const udlContributions = udlElements.map((element) => elementContributionFromFrameElement(element));
const udl = udlLoadCase(cantilever);
const profile = solverProfile();
const udlExecution = compileSolverExecution({
  compilation: cantilever, elementContributions: udlContributions, loadCase: udl, solverProfile: profile,
});

test('B34-T01', 'A sealed recovery record carries exactly the declared keys and is frozen', () => {
  const recovery = compileResultRecovery({
    compilation: cantilever, execution: udlExecution, loadCase: udl,
    frameElements: udlElements, pipingComponents: [], recoveryProfile: recoveryProfile(),
  });
  assert.deepEqual(Object.keys(recovery).sort(), [...RECOVERY_RECORD_KEYS].sort());
  assert.equal(recovery.schema, 'fea-linear-recovery/v1');
  assert.equal(recovery.executionStatus, 'QUALIFIED');
  assert.equal(recovery.recoveryHash, recovery.semanticHash);
  assertDeepFrozen(recovery);
});

test('B34-T02', 'Element end action: R = K U - F reaction equals the recovered global I-end joint action exactly (free-body equilibrium at the only attached element)', () => {
  const recovery = compileResultRecovery({
    compilation: cantilever, execution: udlExecution, loadCase: udl,
    frameElements: udlElements, pipingComponents: [], recoveryProfile: recoveryProfile(),
  });
  const reactionAt = (nodeId, dof) => udlExecution.reactions.find((entry) => entry.nodeId === nodeId && entry.dof === dof).value;
  const qI = actionAt(recovery.elementActions, 'E-000120').global.I;
  for (const [dof, field] of [['UX', 'fx'], ['UY', 'fy'], ['UZ', 'fz'], ['RX', 'mx'], ['RY', 'my'], ['RZ', 'mz']]) {
    assertClose(reactionAt('N-000120', dof), qI[field], 1e-6, `reaction ${dof} vs qI.${field}`);
  }
});

test('B34-T03', 'Element end action: the free tip carries zero end action under a distributed-load-only case', () => {
  const recovery = compileResultRecovery({
    compilation: cantilever, execution: udlExecution, loadCase: udl,
    frameElements: udlElements, pipingComponents: [], recoveryProfile: recoveryProfile(),
  });
  const qJ = actionAt(recovery.elementActions, 'E-000121').local.J;
  for (const field of ['fx', 'fy', 'fz', 'mx', 'my', 'mz']) assertClose(qJ[field], 0, 1e-6, `qJ.${field} at the free tip`);
});

test('B34-T04', 'Element force field: closed-form shear/moment stations for a cantilevered UDL span match hand calculation', () => {
  const recovery = compileResultRecovery({
    compilation: cantilever, execution: udlExecution, loadCase: udl,
    frameElements: udlElements, pipingComponents: [], recoveryProfile: recoveryProfile(),
  });
  const field = recovery.forceFields.find((entry) => entry.elementId === 'E-000121');
  assert.equal(field.stations.length, 5);
  const w = -UDL_INTENSITY_FZ; // magnitude, N/m
  const length = field.length;
  const at = (fraction) => field.stations.find((station) => station.fraction === fraction).action;
  // Classic cantilever-with-UDL free body, fixed at the I end of this span:
  // V(x) = w (L - x); M(x) = w (L - x)^2 / 2. The recovered local axis here
  // carries the load on fy/mz (see the hand-verified sign in element-end-actions).
  assertClose(Math.abs(at(0).fy), w * length, 1e-6, 'V(0)');
  assertClose(Math.abs(at(0).mz), (w * length * length) / 2, 1e-6, 'M(0)');
  assertClose(Math.abs(at(0.5).fy), w * (length / 2), 1e-6, 'V(L/2)');
  assertClose(Math.abs(at(0.5).mz), (w * (length / 2) ** 2) / 2, 1e-6, 'M(L/2)');
  assertClose(at(1).fy, 0, 1e-6, 'V(L) at the free tip');
  assertClose(at(1).mz, 0, 1e-6, 'M(L) at the free tip');
});

/* ---------------------------------------------------------------------- *
 * REDUCER-01: stepped two-section reducer, cantilevered, tip nodal load.
 * ---------------------------------------------------------------------- */

const reducer = reducerComponent();
const reducerModel = reducerCompilation();
const reducerContributions = elementContributionsFromPipingComponent(reducer);
const reducerCase = reducerTipLoadCase(reducerModel);
const reducerExecution = compileSolverExecution({
  compilation: reducerModel, elementContributions: reducerContributions, loadCase: reducerCase, solverProfile: profile,
});

test('B34-T05', 'Component code point: a trivial single-candidate station (N0) matches the free-body reaction exactly', () => {
  const recovery = compileResultRecovery({
    compilation: reducerModel, execution: reducerExecution, loadCase: reducerCase,
    frameElements: [], pipingComponents: [reducer], recoveryProfile: recoveryProfile(),
  });
  const point = recovery.componentResultants[0].codePoints.find((entry) => entry.nodeId === 'RED-001.N0');
  assert.equal(point.consistency, null);
  const reactionAt = (dof) => reducerExecution.reactions.find((entry) => entry.nodeId === 'RED-001.N0' && entry.dof === dof).value;
  assertClose(reactionAt('UY'), point.global.fy, 1e-6, 'reaction UY vs code point global.fy');
  assertClose(reactionAt('RZ'), point.global.mz, 1e-6, 'reaction RZ vs code point global.mz');
  // Fixed-end moment for a 1000 N tip load at 0.4 m: 400 N.m.
  assertClose(Math.abs(point.local.my), 400, 1e-6, 'fixed-end moment at N0');
});

test('B34-T06', 'Component code point: a shared internal node (N1, E1 J-end / E2 I-end) is consistent within tolerance and matches the moment-arm hand calculation', () => {
  const recovery = compileResultRecovery({
    compilation: reducerModel, execution: reducerExecution, loadCase: reducerCase,
    frameElements: [], pipingComponents: [reducer], recoveryProfile: recoveryProfile(),
  });
  const point = recovery.componentResultants[0].codePoints.find((entry) => entry.nodeId === 'RED-001.N1');
  assert.notEqual(point.consistency, null);
  assert.equal(point.consistency.withinTolerance, true);
  assert.ok(point.consistency.residual < 1e-9, `residual should be solver noise, was ${point.consistency.residual}`);
  // 1000 N tip load, 0.2 m arm from N1 to the tip N2: moment magnitude 200 N.m.
  assertClose(Math.abs(point.local.my), 200, 1e-6, 'moment arm at N1');
});

test('B34-T07', 'Component code point: an external nodal load applied directly at the shared internal node is folded into the consistency balance, not ignored', () => {
  const loadedCase = reducerTipLoadCase(reducerModel, {
    loadCaseId: 'LC-RED-TIP-N1',
    primitives: [
      reducerTipLoadPrimitive(),
      {
        schema: 'fea-linear-load-primitive/v1',
        primitiveId: 'LP-EXTRA-RED-N1',
        kind: 'NODAL_FORCE_MOMENT',
        nodeId: 'RED-001.N1',
        basis: { kind: 'GLOBAL' },
        force: { fx: 0, fy: 300, fz: 0 },
        moment: { mx: 0, my: 0, mz: 0 },
        units: { force: 'N', moment: 'N*m', length: 'm' },
        signConvention: 'APPLIED_TO_STRUCTURE',
        sourceEvidence: { sourceId: 'PROJECT-LOAD-REGISTER', sourceRevision: '01', sourceSemanticHash: 'fnv1a64:6666666666666666' },
      },
    ],
  });
  const execution = compileSolverExecution({
    compilation: reducerModel, elementContributions: reducerContributions, loadCase: loadedCase, solverProfile: profile,
  });
  const recovery = compileResultRecovery({
    compilation: reducerModel, execution, loadCase: loadedCase,
    frameElements: [], pipingComponents: [reducer], recoveryProfile: recoveryProfile(),
  });
  const point = recovery.componentResultants[0].codePoints.find((entry) => entry.nodeId === 'RED-001.N1');
  assert.equal(point.consistency.withinTolerance, true);
  assert.ok(point.consistency.residual < 1e-8, `residual should still be solver noise once the applied load is folded in, was ${point.consistency.residual}`);
});

test('B34-T08', 'Envelope: max/min/absolute-max per code point per quantity retains the governing execution and load-case identity', () => {
  const recoveryA = compileResultRecovery({
    compilation: reducerModel, execution: reducerExecution, loadCase: reducerCase,
    frameElements: [], pipingComponents: [reducer], recoveryProfile: recoveryProfile(),
  });
  const caseB = reducerTipLoadCase(reducerModel, {
    loadCaseId: 'LC-RED-TIP-02',
    primitives: [reducerTipLoadPrimitive({ primitiveId: 'LP-TIP-RED-N2-B', force: { fx: 0, fy: -2000, fz: 0 } })],
  });
  const executionB = compileSolverExecution({
    compilation: reducerModel, elementContributions: reducerContributions, loadCase: caseB, solverProfile: profile,
  });
  const recoveryB = compileResultRecovery({
    compilation: reducerModel, execution: executionB, loadCase: caseB,
    frameElements: [], pipingComponents: [reducer], recoveryProfile: recoveryProfile(),
  });
  const envelope = foldRecoveryEnvelope([recoveryA, recoveryB]);
  assertDeepFrozen(envelope);
  const n1 = envelope.codePoints.find((entry) => entry.nodeId === 'RED-001.N1');
  const fz = n1.entries.find((entry) => entry.quantity === 'fz');
  assertClose(fz.max.value, 2000, 1e-6, 'fz envelope max at N1');
  assertClose(fz.min.value, -1000, 1e-6, 'fz envelope min at N1');
  assert.equal(fz.max.executionHash, executionB.executionHash, 'the -2000 N case must govern the max');
  assert.equal(fz.min.executionHash, reducerExecution.executionHash, 'the +1000 N case must govern the min');
});

/* ---------------------------------------------------------------------- *
 * Fail-closed refusals.
 * ---------------------------------------------------------------------- */

test('B34-T09', 'An execution not QUALIFIED/CONDITIONAL (BLOCKED) is refused with a dedicated code', () => {
  const strictProfile = solverProfile({
    normalizedResidualLimit: { value: 1e-30, source: 'LFEA-B3.4-FIXTURE-PROFILE' },
    normalizedResidualWarnLimit: { value: 1e-29, source: 'LFEA-B3.4-FIXTURE-PROFILE' },
  });
  const tip = tipLoadCase(cantilever);
  const blocked = compileSolverExecution({
    compilation: cantilever, elementContributions: elementContributions(), loadCase: tip, solverProfile: strictProfile,
  });
  assert.equal(blocked.status, 'BLOCKED');
  expectCode(() => compileResultRecovery({
    compilation: cantilever, execution: blocked, loadCase: tip,
    frameElements: frameElements(), pipingComponents: [], recoveryProfile: recoveryProfile(),
  }), 'RECOVERY_EXECUTION_BLOCKED');
});

test('B34-T10', 'A model element with no supplied frame element or component contribution is refused', () => {
  expectCode(() => compileResultRecovery({
    compilation: cantilever, execution: udlExecution, loadCase: udl,
    frameElements: [udlElements[0]], pipingComponents: [], recoveryProfile: recoveryProfile(),
  }), 'RECOVERY_ELEMENT_MISSING');
});

test('B34-T11', 'A duplicated element supplied across frameElements/pipingComponents is refused', () => {
  expectCode(() => compileResultRecovery({
    compilation: cantilever, execution: udlExecution, loadCase: udl,
    frameElements: [...udlElements, udlElements[0]], pipingComponents: [], recoveryProfile: recoveryProfile(),
  }), 'RECOVERY_ELEMENT_DUPLICATE');
});

test('B34-T12', 'An execution bound to a different compilation than the one supplied is refused', () => {
  const settled = cantileverWithSettlementSlotCompilation();
  expectCode(() => compileResultRecovery({
    compilation: settled, execution: udlExecution, loadCase: udl,
    frameElements: udlElements, pipingComponents: [], recoveryProfile: recoveryProfile(),
  }), 'RECOVERY_EXECUTION_MODEL_MISMATCH');
});

test('B34-T13', 'A load case that does not match the execution.physicalLoadCaseHash is refused', () => {
  const otherLoadCase = tipLoadCase(cantilever, {
    loadCaseId: 'LC-OTHER-ZERO',
    primitives: [tipLoadPrimitive({ primitiveId: 'LP-ZERO', force: { fx: 0, fy: 0, fz: 0 }, moment: { mx: 0, my: 0, mz: 0 } })],
  });
  expectCode(() => compileResultRecovery({
    compilation: cantilever, execution: udlExecution, loadCase: otherLoadCase,
    frameElements: udlElements, pipingComponents: [], recoveryProfile: recoveryProfile(),
  }), 'RECOVERY_EXECUTION_LOAD_CASE_MISMATCH');
});

test('B34-T14', 'A code station naming a node that is not any compiled element end is refused rather than interpolated', () => {
  const tamperedDraft = {
    ...reducer,
    codeStations: reducer.codeStations.map((station, index) => (index === 0 ? { ...station, nodeId: 'RED-001.N-GHOST' } : station)),
  };
  tamperedDraft.semanticHash = computePipingComponentSemanticHash(tamperedDraft);
  expectCode(() => compileResultRecovery({
    compilation: reducerModel, execution: reducerExecution, loadCase: reducerCase,
    frameElements: [], pipingComponents: [tamperedDraft], recoveryProfile: recoveryProfile(),
  }), 'RECOVERY_CODE_STATION_NOT_LOCATABLE');
});

test('B34-T15', 'A floating (fully unrestrained) model never reaches recovery: the solver refuses the mechanism first', () => {
  const floating = floatingCompilation();
  expectCode(() => compileSolverExecution({
    compilation: floating, elementContributions: elementContributions(), loadCase: tipLoadCase(floating), solverProfile: profile,
  }), 'SOLVER_MECHANISM_FLOATING_COMPONENT');
});

test('B34-T16', 'Recovery determinism: repeated compilation on identical input is byte-identical', () => {
  const first = compileResultRecovery({
    compilation: cantilever, execution: udlExecution, loadCase: udl,
    frameElements: udlElements, pipingComponents: [], recoveryProfile: recoveryProfile(),
  });
  const second = compileResultRecovery({
    compilation: cantilever, execution: udlExecution, loadCase: udl,
    frameElements: udlElements, pipingComponents: [], recoveryProfile: recoveryProfile(),
  });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.recoveryHash, second.recoveryHash);
});

test('B34-T17', 'requireResultRecovery refuses a stale semantic hash and re-accepts an untampered record', () => {
  const recovery = compileResultRecovery({
    compilation: cantilever, execution: udlExecution, loadCase: udl,
    frameElements: udlElements, pipingComponents: [], recoveryProfile: recoveryProfile(),
  });
  const reaccepted = requireResultRecovery(recovery);
  assert.equal(reaccepted.recoveryHash, recovery.recoveryHash);
  const tampered = { ...recovery, executionStatus: 'CONDITIONAL' };
  expectCode(() => requireResultRecovery(tampered), 'RECOVERY_HASH_MISMATCH');
});

test('B34-T18', 'Settlement (prescribed-movement) execution recovers a nonzero end action even with no applied mechanical load', () => {
  const settled = cantileverWithSettlementSlotCompilation();
  const settlement = settlementLoadCase(settled);
  const execution = compileSolverExecution({
    compilation: settled, elementContributions: elementContributions(), loadCase: settlement, solverProfile: profile,
  });
  const recovery = compileResultRecovery({
    compilation: settled, execution, loadCase: settlement,
    frameElements: frameElements(), pipingComponents: [], recoveryProfile: recoveryProfile(),
  });
  // The settlement is enforced only at N-000121's UZ, RY free: the shear
  // needed to hold the prescribed displacement is real and nonzero, while
  // the unloaded, free-tipped outer span (E-000121) carries zero end action
  // altogether (same free-tip argument as B34-T03), so the bending moment at
  // the settlement joint is continuous into that zero and is itself zero —
  // only the shear component is expected to be nonzero here.
  const qJ = actionAt(recovery.elementActions, 'E-000120').local.J;
  const worstComponent = Math.max(...Object.values(qJ).map((value) => Math.abs(value)));
  assert.ok(worstComponent > 1e-3, 'a genuinely bent chain must carry a nonzero end action at the settlement side');
  const outer = actionAt(recovery.elementActions, 'E-000121').local;
  for (const end of ['I', 'J']) {
    for (const field of ['fx', 'fy', 'fz', 'mx', 'my', 'mz']) assertClose(outer[end][field], 0, 1e-6, `outer span ${end}.${field} must be zero (unloaded, free-tipped span)`);
  }
});

console.log('\nLFEA B-3.4 result recovery check PASS\n');
