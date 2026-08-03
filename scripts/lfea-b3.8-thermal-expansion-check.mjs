#!/usr/bin/env node

/**
 * LFEA B-3.8 system-level thermal-expansion closed-form checks.
 *
 * Exercises the real B-2.5 -> B-3.0 -> B-3.1 -> B-3.3 -> B-3.4 production
 * chain for uniform heating of the standard two-span straight member.
 */

import assert from 'node:assert/strict';
import { FRAME_LOCAL_AXIS_PROFILE } from '../src/core/centerline-beam-fea/index.js';
import { INACTIVE_ANALYSIS_DOF_BEHAVIOR } from '../src/core/linear-fea-contract/index.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
import {
  compilePhysicalLoadCase,
  modelReferenceFromCompilation,
  sealLoadPrimitive,
} from '../src/core/linear-fea-load-case/index.js';
import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import { compileResultRecovery } from '../src/core/linear-fea-result-recovery/index.js';
import {
  compileSolverExecution,
  elementContributionFromFrameElement,
} from '../src/core/linear-fea-solver/index.js';
import {
  axisResult,
  compilerInput,
  materialResolution,
  sectionResolution,
} from './lfea-b2.5-model-compiler-fixtures.mjs';
import { temperaturePrimitive } from './lfea-b3.0-load-case-fixtures.mjs';
import {
  frameElementProfile,
  loadCaseProfile,
  solverProfile,
} from './lfea-b3.3-solver-fixtures.mjs';
import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';

const RELATIVE_TOLERANCE = 1e-8;
const MEMBER_LENGTH = 2.4;
const HALF_LENGTH = MEMBER_LENGTH / 2;
const OPERATING_TEMPERATURE = 393.15;
const INSTALLATION_TEMPERATURE = 293.15;
const TEMPERATURE_DIFFERENCE = OPERATING_TEMPERATURE - INSTALLATION_TEMPERATURE;
const LEFT_NODE = 'N-000120';
const MID_NODE = 'N-000121';
const RIGHT_NODE = 'N-000122';
const LEFT_ELEMENT = 'E-000120';
const RIGHT_ELEMENT = 'E-000121';
const ELEMENTS = Object.freeze([
  Object.freeze({ elementId: LEFT_ELEMENT, nodeI: [0, 0, 0], nodeJ: [HALF_LENGTH, 0, 0] }),
  Object.freeze({ elementId: RIGHT_ELEMENT, nodeI: [HALF_LENGTH, 0, 0], nodeJ: [MEMBER_LENGTH, 0, 0] }),
]);

const results = [];

function test(id, name, body) {
  const result = body();
  results.push(Object.freeze({ id, name, ...result }));
}

function assertClose(actual, expected, relativeTolerance, message, referenceScale = Math.abs(expected)) {
  const scale = Math.max(Math.abs(expected), referenceScale, 1e-300);
  assert.ok(
    Math.abs(actual - expected) <= relativeTolerance * scale,
    `${message}: ${actual} differs from ${expected} beyond ${relativeTolerance} relative to ${scale}`,
  );
}

function nodalState(nodeId, dof, behavior, purpose) {
  return {
    declarationId: `C-${nodeId}-${dof}-${purpose}`,
    kind: 'NODAL_RESTRAINT',
    nodeId,
    dof,
    behavior,
  };
}

function fixed(nodeId, dof, purpose) {
  return nodalState(nodeId, dof, 'FIXED', purpose);
}

function inactive(nodeId, dof) {
  return nodalState(nodeId, dof, INACTIVE_ANALYSIS_DOF_BEHAVIOR, 'AXIAL-SUBSPACE');
}

function inactiveNonAxialDofs() {
  return [
    inactive(LEFT_NODE, 'RX'),
    inactive(LEFT_NODE, 'RY'),
    inactive(LEFT_NODE, 'RZ'),
    inactive(MID_NODE, 'UY'),
    inactive(MID_NODE, 'UZ'),
    inactive(MID_NODE, 'RX'),
    inactive(MID_NODE, 'RY'),
    inactive(MID_NODE, 'RZ'),
    inactive(RIGHT_NODE, 'RX'),
    inactive(RIGHT_NODE, 'RY'),
    inactive(RIGHT_NODE, 'RZ'),
  ];
}

function freeExpansionConstraints() {
  return [
    // Physical left pin: all translations fixed, rotations free.
    fixed(LEFT_NODE, 'UX', 'PIN'),
    fixed(LEFT_NODE, 'UY', 'PIN'),
    fixed(LEFT_NODE, 'UZ', 'PIN'),
    // Physical right roller: transverse translations fixed, UX free.
    fixed(RIGHT_NODE, 'UY', 'AXIAL-ROLLER'),
    fixed(RIGHT_NODE, 'UZ', 'AXIAL-ROLLER'),
    // The remaining non-axial states are a governed analysis subspace, not supports.
    ...inactiveNonAxialDofs(),
  ];
}

function restrainedExpansionConstraints() {
  return [
    // Both ends are fixed against all translations; rotations stay non-physical.
    fixed(LEFT_NODE, 'UX', 'TRANSLATIONAL-ANCHOR'),
    fixed(LEFT_NODE, 'UY', 'TRANSLATIONAL-ANCHOR'),
    fixed(LEFT_NODE, 'UZ', 'TRANSLATIONAL-ANCHOR'),
    fixed(RIGHT_NODE, 'UX', 'TRANSLATIONAL-ANCHOR'),
    fixed(RIGHT_NODE, 'UY', 'TRANSLATIONAL-ANCHOR'),
    fixed(RIGHT_NODE, 'UZ', 'TRANSLATIONAL-ANCHOR'),
    ...inactiveNonAxialDofs(),
  ];
}

function compilation(modelIdentity, constraintDeclarations) {
  return compileMechanicalModel(compilerInput({ modelIdentity, constraintDeclarations }));
}

function thermalPrimitives(caseSuffix) {
  return ELEMENTS.map(({ elementId }, index) => temperaturePrimitive({
    primitiveId: `LP-B38-${caseSuffix}-TEMP-${index + 1}`,
    elementId,
    operatingTemperature: OPERATING_TEMPERATURE,
    installationTemperature: INSTALLATION_TEMPERATURE,
    thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
  }));
}

function thermalLoadCase(modelCompilation, { loadCaseId, label, primitives }) {
  return compilePhysicalLoadCase({
    loadCaseId,
    loadCaseClass: 'THERMAL',
    presentation: { label, description: `${label} closed-form benchmark.` },
    modelReference: modelReferenceFromCompilation(modelCompilation),
    primitives,
    profile: loadCaseProfile(),
  });
}

function thermalElements(modelCompilation, primitives) {
  const modelReference = modelReferenceFromCompilation(modelCompilation);
  const profile = loadCaseProfile();
  const primitiveByElement = new Map(primitives.map((primitive) => [
    primitive.elementId,
    sealLoadPrimitive(primitive, { profile, modelReference }),
  ]));
  return ELEMENTS.map(({ elementId, nodeI, nodeJ }) => compileFrameElement({
    elementId,
    material: materialResolution(),
    section: sectionResolution(),
    localAxes: { result: axisResult(nodeI, nodeJ), profile: FRAME_LOCAL_AXIS_PROFILE },
    profile: frameElementProfile(),
    distributedLoads: [],
    temperature: primitiveByElement.get(elementId),
    releases: [],
    endSprings: [],
    rigidOffsets: null,
  }));
}

function solveAndRecover(modelCompilation, elements, physicalLoadCase) {
  const execution = compileSolverExecution({
    compilation: modelCompilation,
    elementContributions: elements.map(elementContributionFromFrameElement),
    loadCase: physicalLoadCase,
    solverProfile: solverProfile(),
  });
  const recovery = compileResultRecovery({
    compilation: modelCompilation,
    execution,
    loadCase: physicalLoadCase,
    frameElements: elements,
    pipingComponents: [],
    recoveryProfile: recoveryProfile(),
  });
  return { execution, recovery };
}

function displacementAt(execution, nodeId) {
  return execution.displacement.find(
    (entry) => entry.nodeId === nodeId && entry.dof === 'UX',
  ).value;
}

function reactionAt(execution, nodeId) {
  return execution.reactions.find(
    (entry) => entry.nodeId === nodeId && entry.dof === 'UX',
  )?.value;
}

function elementAction(recovery, elementId) {
  return recovery.elementActions.find((entry) => entry.elementId === elementId).local;
}

function midpointAxialForce(recovery, elementId) {
  const field = recovery.forceFields.find((entry) => entry.elementId === elementId);
  return field.stations.find((station) => station.fraction === 0.5).action.fx;
}

const material = materialResolution();
const section = sectionResolution();
const elasticModulus = material.elasticModulus;
const area = section.area;
const thermalExpansionCoefficient = material.thermalExpansionCoefficient;
const thermalStrain = thermalExpansionCoefficient * TEMPERATURE_DIFFERENCE;
const expectedFreeExtension = thermalStrain * MEMBER_LENGTH;
const expectedThermalForce = thermalStrain * elasticModulus * area;

test('B38-T01', 'Uniform heating expands freely through assembly, solve and recovery', () => {
  const modelCompilation = compilation('SYS-B38-FREE-THERMAL', freeExpansionConstraints());
  const primitives = thermalPrimitives('FREE');
  const physicalLoadCase = thermalLoadCase(modelCompilation, {
    loadCaseId: 'LC-B38-FREE-THERMAL',
    label: 'Free uniform thermal expansion',
    primitives,
  });
  const elements = thermalElements(modelCompilation, primitives);
  const { execution, recovery } = solveAndRecover(modelCompilation, elements, physicalLoadCase);
  const leftAction = elementAction(recovery, LEFT_ELEMENT);
  const rightAction = elementAction(recovery, RIGHT_ELEMENT);

  assert.equal(execution.status, 'QUALIFIED');
  assert.equal(execution.assembly.inactiveDofCount, 11);
  assert.equal(execution.reactions.length, 5, 'only the five physical pin/roller reactions are reported');
  assert.equal(reactionAt(execution, RIGHT_NODE), undefined, 'the axial roller DOF must remain free');
  assertClose(displacementAt(execution, LEFT_NODE), 0, RELATIVE_TOLERANCE, 'left-end axial displacement', expectedFreeExtension);
  assertClose(displacementAt(execution, MID_NODE), expectedFreeExtension / 2, RELATIVE_TOLERANCE, 'midpoint axial displacement');
  assertClose(displacementAt(execution, RIGHT_NODE), expectedFreeExtension, RELATIVE_TOLERANCE, 'free-end axial displacement');
  assertClose(reactionAt(execution, LEFT_NODE), 0, RELATIVE_TOLERANCE, 'left axial reaction', expectedThermalForce);
  for (const [label, value] of [
    ['left element I action', leftAction.I.fx],
    ['left element J action', leftAction.J.fx],
    ['right element I action', rightAction.I.fx],
    ['right element J action', rightAction.J.fx],
    ['left midpoint force', midpointAxialForce(recovery, LEFT_ELEMENT)],
    ['right midpoint force', midpointAxialForce(recovery, RIGHT_ELEMENT)],
  ]) {
    assertClose(value, 0, RELATIVE_TOLERANCE, label, expectedThermalForce);
  }

  return Object.freeze({
    supportChoice: 'LEFT_TRANSLATIONAL_PIN_PLUS_RIGHT_LATERAL_ROLLER',
    displacement: Object.freeze({
      midpoint: displacementAt(execution, MID_NODE),
      freeEnd: displacementAt(execution, RIGHT_NODE),
      expectedFreeEnd: expectedFreeExtension,
    }),
    axialReaction: Object.freeze({ left: reactionAt(execution, LEFT_NODE), expected: 0 }),
    axialForce: Object.freeze({
      leftMidpoint: midpointAxialForce(recovery, LEFT_ELEMENT),
      rightMidpoint: midpointAxialForce(recovery, RIGHT_ELEMENT),
      expected: 0,
    }),
  });
});

test('B38-T02', 'Uniform heating with both ends fixed recovers the closed-form compressive force', () => {
  const modelCompilation = compilation('SYS-B38-RESTRAINED-THERMAL', restrainedExpansionConstraints());
  const primitives = thermalPrimitives('RESTRAINED');
  const physicalLoadCase = thermalLoadCase(modelCompilation, {
    loadCaseId: 'LC-B38-RESTRAINED-THERMAL',
    label: 'Restrained uniform thermal expansion',
    primitives,
  });
  const elements = thermalElements(modelCompilation, primitives);
  const { execution, recovery } = solveAndRecover(modelCompilation, elements, physicalLoadCase);
  const leftAction = elementAction(recovery, LEFT_ELEMENT);
  const rightAction = elementAction(recovery, RIGHT_ELEMENT);
  const zeroDisplacementScale = expectedFreeExtension;

  assert.equal(execution.status, 'QUALIFIED');
  assert.equal(execution.assembly.inactiveDofCount, 11);
  assert.equal(execution.reactions.length, 6, 'only the six physical translational reactions are reported');
  assertClose(displacementAt(execution, LEFT_NODE), 0, RELATIVE_TOLERANCE, 'left axial displacement', zeroDisplacementScale);
  assertClose(displacementAt(execution, MID_NODE), 0, RELATIVE_TOLERANCE, 'midpoint axial displacement', zeroDisplacementScale);
  assertClose(displacementAt(execution, RIGHT_NODE), 0, RELATIVE_TOLERANCE, 'right axial displacement', zeroDisplacementScale);
  assertClose(reactionAt(execution, LEFT_NODE), expectedThermalForce, RELATIVE_TOLERANCE, 'left axial reaction');
  assertClose(reactionAt(execution, RIGHT_NODE), -expectedThermalForce, RELATIVE_TOLERANCE, 'right axial reaction');
  assertClose(leftAction.I.fx, expectedThermalForce, RELATIVE_TOLERANCE, 'left element I-end action');
  assertClose(leftAction.J.fx, -expectedThermalForce, RELATIVE_TOLERANCE, 'left element J-end action');
  assertClose(rightAction.I.fx, expectedThermalForce, RELATIVE_TOLERANCE, 'right element I-end action');
  assertClose(rightAction.J.fx, -expectedThermalForce, RELATIVE_TOLERANCE, 'right element J-end action');
  assertClose(midpointAxialForce(recovery, LEFT_ELEMENT), -expectedThermalForce, RELATIVE_TOLERANCE, 'left element midpoint axial force');
  assertClose(midpointAxialForce(recovery, RIGHT_ELEMENT), -expectedThermalForce, RELATIVE_TOLERANCE, 'right element midpoint axial force');

  return Object.freeze({
    restraintChoice: 'BOTH_ENDS_FIXED_IN_TRANSLATION_WITH_NONAXIAL_ANALYSIS_SUBSPACE',
    displacement: Object.freeze({
      left: displacementAt(execution, LEFT_NODE),
      midpoint: displacementAt(execution, MID_NODE),
      right: displacementAt(execution, RIGHT_NODE),
      expected: 0,
    }),
    reactions: Object.freeze({
      left: reactionAt(execution, LEFT_NODE),
      right: reactionAt(execution, RIGHT_NODE),
      expectedMagnitude: expectedThermalForce,
    }),
    axialForce: Object.freeze({
      leftMidpoint: midpointAxialForce(recovery, LEFT_ELEMENT),
      rightMidpoint: midpointAxialForce(recovery, RIGHT_ELEMENT),
      expected: -expectedThermalForce,
    }),
  });
});

console.log(JSON.stringify({
  check: 'lfea-b3.8-thermal-expansion',
  status: 'PASS',
  tolerance: RELATIVE_TOLERANCE,
  memberLength: MEMBER_LENGTH,
  operatingTemperature: OPERATING_TEMPERATURE,
  installationTemperature: INSTALLATION_TEMPERATURE,
  temperatureDifference: TEMPERATURE_DIFFERENCE,
  elasticModulus,
  area,
  thermalExpansionCoefficient,
  handCalculation: {
    freeExtension: expectedFreeExtension,
    restrainedForceMagnitude: expectedThermalForce,
  },
  results,
}));
