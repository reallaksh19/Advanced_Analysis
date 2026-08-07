#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileResultRecovery } from '../src/core/linear-fea-result-recovery/index.js';
import { compileSolverExecution } from '../src/core/linear-fea-solver/index.js';
import {
  elementContributionsFromPipingComponent,
  recoveryProfile,
  reducerCompilation,
  reducerComponent,
  reducerTipLoadCase,
  solverProfile,
} from './lfea-b3.4-recovery-fixtures.mjs';

console.log('\n--- M035 force/displacement-only component recovery scope ---');

const component = reducerComponent();
const compilation = reducerCompilation();
const loadCase = reducerTipLoadCase(compilation);
const execution = compileSolverExecution({
  compilation,
  elementContributions: elementContributionsFromPipingComponent(component),
  loadCase,
  solverProfile: solverProfile(),
});
assert.equal(execution.status, 'QUALIFIED');

const withCodePoints = compileResultRecovery({
  compilation,
  execution,
  loadCase,
  frameElements: [],
  pipingComponents: [component],
  recoveryProfile: recoveryProfile(),
});
const forceOnly = compileResultRecovery({
  compilation,
  execution,
  loadCase,
  frameElements: [],
  pipingComponents: [component],
  recoveryProfile: recoveryProfile({ recoverComponentCodePoints: false }),
});

assert.ok(withCodePoints.componentResultants[0].codePoints.length > 0, 'Default B-3.4 recovery must retain code-point resultants.');
assert.equal(forceOnly.componentResultants[0].codePoints.length, 0, 'Force-only recovery must not attempt component code-point interpolation.');
assert.deepEqual(
  forceOnly.elementActions,
  withCodePoints.elementActions,
  'Disabling code-point resultants must not change effective component end actions.',
);
assert.deepEqual(
  forceOnly.forceFields,
  withCodePoints.forceFields,
  'Disabling code-point resultants must not change element force fields.',
);
assert.notEqual(
  forceOnly.recoveryProfileSemanticHash,
  withCodePoints.recoveryProfileSemanticHash,
  'The output-scope choice must remain explicit in recovery evidence.',
);

console.log(JSON.stringify({
  status: 'PASS',
  componentId: component.componentId,
  defaultCodePointCount: withCodePoints.componentResultants[0].codePoints.length,
  forceOnlyCodePointCount: forceOnly.componentResultants[0].codePoints.length,
  elementActionCount: forceOnly.elementActions.length,
  forceFieldCount: forceOnly.forceFields.length,
}, null, 2));
console.log('M035 force/displacement-only component recovery scope PASS');
