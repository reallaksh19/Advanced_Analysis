#!/usr/bin/env node

/**
 * M016 ASME B31.3 Appendix S Example 2 pipe-lift-off benchmark.
 *
 * Appendix S states that the published loads are averages from commercial
 * programs with variance within unit-conversion tolerance. Reactions therefore
 * use M013's 10% relative tolerance with the same 1.2 kN force and 1.5 kN·m
 * moment absolute floors. The floors are materially smaller than every
 * non-zero Example 2 reference value and do not weaken any table comparison.
 * Node 50 is treated separately: the governing model has no UY restraint, so
 * absence of that reaction is an exact topology assertion rather than a
 * tolerance comparison.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FLEXIBILITY_DERIVATION,
  INSTALLATION_TEMPERATURE,
  OPERATING_PRESSURE,
  OPERATING_TEMPERATURE,
  POINTS,
  PUBLISHED_SUPPORT_LOADS,
  PUBLISHED_TOTAL_EXPANSION_IN_PER_100FT,
  SYMMETRY_PLANE_X,
  THERMAL_EXPANSION_COEFFICIENT,
  solveAppendixS2,
} from './lfea-b3.13-appendix-s-example2-fixtures.mjs';

const SUPPORT_RELATIVE_TOLERANCE = 0.10;
const SUPPORT_FORCE_ABSOLUTE_FLOOR_N = 1200;
const SUPPORT_MOMENT_ABSOLUTE_FLOOR_NM = 1500;
const CLEAR_LIFTOFF_REACTION_N = 1000;

function reactionAt(execution, nodeId, dof) {
  const entry = execution.reactions.find(
    (candidate) => candidate.nodeId === nodeId && candidate.dof === dof,
  );
  assert.notEqual(entry, undefined, `missing reaction ${nodeId}:${dof}`);
  return entry.value;
}

function optionalReactionAt(execution, nodeId, dof) {
  return execution.reactions.find(
    (candidate) => candidate.nodeId === nodeId && candidate.dof === dof,
  ) ?? null;
}

function displacementAt(execution, nodeId, dof) {
  const entry = execution.displacement.find(
    (candidate) => candidate.nodeId === nodeId && candidate.dof === dof,
  );
  assert.notEqual(entry, undefined, `missing displacement ${nodeId}:${dof}`);
  return entry.value;
}

function assertWithin(actual, expected, relativeTolerance, absoluteFloor, message) {
  const tolerance = Math.max(Math.abs(expected) * relativeTolerance, absoluteFloor);
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: ${actual} differs from ${expected} by ${Math.abs(actual - expected)}, tolerance ${tolerance}`,
  );
}

function pipeOnSupport(execution, nodeId, dof) {
  return -reactionAt(execution, nodeId, dof);
}

function stationPosition(result, nodeId) {
  for (const component of result.pipingComponents) {
    const station = component.codeStations.find((entry) => entry.nodeId === nodeId);
    if (station !== undefined) return station.position;
  }
  return POINTS[nodeId];
}

function assertMirror(result, leftNodeId, rightNodeId) {
  const left = stationPosition(result, leftNodeId);
  const right = stationPosition(result, rightNodeId);
  assert.notEqual(left, undefined, `missing left mirror point ${leftNodeId}`);
  assert.notEqual(right, undefined, `missing right mirror point ${rightNodeId}`);
  assertWithin(
    left[0] + right[0],
    2 * SYMMETRY_PLANE_X,
    0,
    1e-12,
    `${leftNodeId}/${rightNodeId} mirror X`,
  );
  assertWithin(left[1], right[1], 0, 1e-12, `${leftNodeId}/${rightNodeId} mirror Y`);
  assertWithin(left[2], right[2], 0, 1e-12, `${leftNodeId}/${rightNodeId} mirror Z`);
}

function reactionErrorScore(execution) {
  const normalized = PUBLISHED_SUPPORT_LOADS.map((reference) => {
    const signed = pipeOnSupport(execution, reference.nodeId, reference.dof);
    const actual = reference.absolute ? Math.abs(signed) : signed;
    const expected = reference.absolute ? Math.abs(reference.value) : reference.value;
    const floor = reference.quantity === 'moment'
      ? SUPPORT_MOMENT_ABSOLUTE_FLOOR_NM
      : SUPPORT_FORCE_ABSOLUTE_FLOOR_N;
    return (actual - expected) / Math.max(Math.abs(expected), floor);
  });
  return Math.sqrt(
    normalized.reduce((sum, value) => sum + value ** 2, 0) / normalized.length,
  );
}

function packageRegistrationEvidence() {
  const packageJson = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  assert.equal(
    packageJson.scripts['check:lfea-b3.13'],
    'node scripts/lfea-b3.13-appendix-s-example2-check.mjs',
  );
  const linearCore = packageJson.scripts['check:lfea-linear-core'];
  const b312 = linearCore.indexOf('npm run check:lfea-b3.12');
  const b313 = linearCore.indexOf('npm run check:lfea-b3.13');
  const b40 = linearCore.indexOf('npm run check:lfea-b4.0');
  assert.ok(b312 >= 0, 'linear core must contain B3.12');
  assert.ok(b313 > b312, 'B3.13 must run after B3.12');
  assert.ok(b40 > b313, 'B3.13 must run before B4.0');
  return { b312, b313, b40 };
}

console.log('\n--- LFEA B-3.13 ASME B31.3 Appendix S Example 2 ---');

assert.equal(INSTALLATION_TEMPERATURE, 294.15);
assert.equal(OPERATING_TEMPERATURE, 561.15);
assert.equal(OPERATING_PRESSURE, 3.795e6);
assert.equal(PUBLISHED_TOTAL_EXPANSION_IN_PER_100FT, 4.11);
assert.equal(THERMAL_EXPANSION_COEFFICIENT, 1.2827715355805244e-5);
assert.equal(FLEXIBILITY_DERIVATION.flexibilityCharacteristic, 0.14753712217178722);
assert.equal(FLEXIBILITY_DERIVATION.unpressurisedFlexibilityFactor, 11.183626030598562);
assert.equal(FLEXIBILITY_DERIVATION.pressureCorrectionDenominator, 1.1941095268599717);
assert.equal(FLEXIBILITY_DERIVATION.pressureCorrectedFlexibilityFactor, 9.36566184176338);

const attached = solveAppendixS2({ includeApexSupport: true });
const governing = solveAppendixS2({ includeApexSupport: false });

assert.equal(attached.execution.status, 'QUALIFIED');
assert.equal(governing.execution.status, 'QUALIFIED');
assert.equal(governing.compilation.model.elements.length, 20);
assert.equal(governing.compilation.model.nodes.length, 21);
assert.equal(governing.compilation.model.constraints.length, 14);
assert.equal(attached.compilation.model.constraints.length, 15);
assert.equal(governing.generatedGravityPrimitives.length, 60);
assert.equal(governing.gravityDerivations.length, 60);
assert.equal(governing.thermalBindings.length, 8);
assert.equal(governing.pipingComponents.length, 4);

governing.generatedGravityPrimitives.forEach((primitive) => {
  assert.equal(primitive.startIntensity.fx, 0);
  assert.ok(primitive.startIntensity.fy < 0, `${primitive.primitiveId} must act downward`);
  assert.equal(primitive.startIntensity.fz, 0);
  assert.deepEqual(primitive.endIntensity, primitive.startIntensity);
});

governing.pipingComponents.forEach((component) => {
  assert.equal(component.elements.length, 2);
  assert.equal(component.codeStations.length, 3);
  assert.equal(component.flexibility.factor, 9.36566184176338);
  assert.equal(
    component.flexibility.pressureStiffeningRule,
    'BEND_PRESSURE_STIFFENING_DECLARED_FACTOR_V1',
  );
});

const pressurePrimitives = governing.loadCase.primitives.filter(
  (primitive) => primitive.kind === 'PRESSURE',
);
assert.equal(pressurePrimitives.length, 20);
assert.equal(
  pressurePrimitives.filter(
    (primitive) => primitive.authorizedEffects.pressureStiffening,
  ).length,
  8,
);
pressurePrimitives.forEach((primitive) => {
  assert.equal(primitive.authorizedEffects.axialThrust, false);
  assert.equal(primitive.authorizedEffects.bourdon, false);
});

/* Exact geometry symmetry, including each generated near/mid/far bend station. */
[
  ['APP-S2.N10', 'APP-S2.N110'],
  ['APP-S2.N15', 'APP-S2.N115'],
  ['APP-S2.N20', 'APP-S2.N120'],
  ['APP-S2.B30.N0', 'APP-S2.B130.N0'],
  ['APP-S2.B30.N1', 'APP-S2.B130.N1'],
  ['APP-S2.B30.N2', 'APP-S2.B130.N2'],
  ['APP-S2.B40.N0', 'APP-S2.B140.N0'],
  ['APP-S2.B40.N1', 'APP-S2.B140.N1'],
  ['APP-S2.B40.N2', 'APP-S2.B140.N2'],
  ['APP-S2.N45', 'APP-S2.N145'],
].forEach(([left, right]) => assertMirror(governing, left, right));
assert.equal(POINTS['APP-S2.N50'][0], SYMMETRY_PLANE_X);

/*
 * With node 50 artificially attached, its support-on-pipe UY reaction must be
 * clearly negative: the support would have to pull the pipe downward, which a
 * single-acting Y+ support cannot do. This is the physical lift-off proof.
 */
const attachedApexReaction = reactionAt(attached.execution, 'APP-S2.N50', 'UY');
assert.ok(
  attachedApexReaction < -CLEAR_LIFTOFF_REACTION_N,
  `attached node 50 must require a clear tension reaction below -${CLEAR_LIFTOFF_REACTION_N} N; received ${attachedApexReaction}`,
);

/* Governing case: node 50 UY is genuinely absent, not a zero-stiffness restraint. */
assert.equal(
  governing.compilation.model.constraints.some(
    (constraint) => constraint.nodeId === 'APP-S2.N50' && constraint.dof === 'UY',
  ),
  false,
);
assert.equal(optionalReactionAt(governing.execution, 'APP-S2.N50', 'UY'), null);
const apexUplift = displacementAt(governing.execution, 'APP-S2.N50', 'UY');
assert.ok(apexUplift > 0, `released node 50 must move upward; received ${apexUplift}`);

const supportEvidence = [];
for (const reference of PUBLISHED_SUPPORT_LOADS) {
  const signed = pipeOnSupport(governing.execution, reference.nodeId, reference.dof);
  const actual = reference.absolute ? Math.abs(signed) : signed;
  const expected = reference.absolute ? Math.abs(reference.value) : reference.value;
  const floor = reference.quantity === 'moment'
    ? SUPPORT_MOMENT_ABSOLUTE_FLOOR_NM
    : SUPPORT_FORCE_ABSOLUTE_FLOOR_N;
  assertWithin(
    actual,
    expected,
    SUPPORT_RELATIVE_TOLERANCE,
    floor,
    `${reference.nodeId}:${reference.dof} pipe-on-support load`,
  );
  supportEvidence.push({
    nodeId: reference.nodeId,
    dof: reference.dof,
    actual,
    expected,
    absoluteDeviation: Math.abs(actual - expected),
    relativeDeviation: expected === 0 ? null : Math.abs(actual - expected) / Math.abs(expected),
    quantity: reference.quantity,
  });
}

/* Required reaction symmetry: right-leg magnitudes equal the left-leg values. */
const symmetryEvidence = [];
for (const [leftNode, rightNode, dof] of [
  ['APP-S2.N10', 'APP-S2.N110', 'UX'],
  ['APP-S2.N10', 'APP-S2.N110', 'UY'],
  ['APP-S2.N10', 'APP-S2.N110', 'RZ'],
  ['APP-S2.N20', 'APP-S2.N120', 'UY'],
]) {
  const left = pipeOnSupport(governing.execution, leftNode, dof);
  const right = pipeOnSupport(governing.execution, rightNode, dof);
  assertWithin(
    Math.abs(right),
    Math.abs(left),
    SUPPORT_RELATIVE_TOLERANCE,
    dof === 'RZ' ? SUPPORT_MOMENT_ABSOLUTE_FLOOR_NM : SUPPORT_FORCE_ABSOLUTE_FLOOR_N,
    `${leftNode}/${rightNode}:${dof} symmetry magnitude`,
  );
  symmetryEvidence.push({ leftNode, rightNode, dof, left, right });
}
assert.ok(
  pipeOnSupport(governing.execution, 'APP-S2.N10', 'UX')
    * pipeOnSupport(governing.execution, 'APP-S2.N110', 'UX') < 0,
  'anchor axial reactions must have opposite signs under mirror symmetry',
);
assert.ok(
  pipeOnSupport(governing.execution, 'APP-S2.N10', 'RZ')
    * pipeOnSupport(governing.execution, 'APP-S2.N110', 'RZ') < 0,
  'anchor moments must have opposite signs under mirror symmetry',
);

const rigid = solveAppendixS2({ flexibilityFactor: 1, includeApexSupport: false });
const derivedReactionError = reactionErrorScore(governing.execution);
const rigidReactionError = reactionErrorScore(rigid.execution);
assert.ok(
  rigidReactionError > derivedReactionError * 1.05 + 1e-6,
  `forced k=1 baseline must fit measurably worse: derived=${derivedReactionError}, rigid=${rigidReactionError}`,
);

const packageRegistration = packageRegistrationEvidence();
console.log(JSON.stringify({
  check: 'lfea-b3.13-appendix-s-example2',
  status: 'PASS',
  sources: {
    primary:
      'ASME B31.3-2006 Appendix S Example 2, Tables S302.1, S302.3, S302.5.1',
    flexibility:
      'ASME B31.3-2006 Appendix D Table D300 welding elbow and Note (7)',
    thermalExpansion:
      'ASME B31.3-2006 Appendix C Table C-1, Carbon Steel, 70F to 550F',
    secondary:
      'SIGMA ROHR2 Verification Manual Release 34.0, R012',
  },
  tolerances: {
    supportRelative: SUPPORT_RELATIVE_TOLERANCE,
    supportForceAbsoluteFloorN: SUPPORT_FORCE_ABSOLUTE_FLOOR_N,
    supportMomentAbsoluteFloorNm: SUPPORT_MOMENT_ABSOLUTE_FLOOR_NM,
  },
  operatingCase: {
    pressurePa: OPERATING_PRESSURE,
    installationTemperatureK: INSTALLATION_TEMPERATURE,
    operatingTemperatureK: OPERATING_TEMPERATURE,
    thermalExpansionCoefficient: THERMAL_EXPANSION_COEFFICIENT,
  },
  flexibilityDerivation: FLEXIBILITY_DERIVATION,
  liftOff: {
    attachedSupportReactionN: attachedApexReaction,
    governingApexUyM: apexUplift,
    governingReactionPresent: false,
  },
  supportEvidence,
  symmetryEvidence,
  regression: {
    derivedFlexibilityFactor:
      FLEXIBILITY_DERIVATION.pressureCorrectedFlexibilityFactor,
    derivedReactionError,
    rigidFlexibilityFactor: 1,
    rigidReactionError,
    improvementRatio: rigidReactionError / derivedReactionError,
  },
  numericalDiagnostics: governing.execution.diagnostics,
  packageRegistration,
}, null, 2));
