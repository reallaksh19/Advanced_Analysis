#!/usr/bin/env node

/**
 * LFEA B-3.7 simply-supported beam closed-form checks.
 *
 * Exercises the real B-2.5 -> B-3.0 -> B-3.1 -> B-3.3 -> B-3.4 production
 * chain for two classical beam cases on the standard two-span fixture. The
 * seeded N-000121 node is the physical midspan station.
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
import {
  frameElementProfile,
  frameElements,
  loadCaseProfile,
  solverProfile,
} from './lfea-b3.3-solver-fixtures.mjs';
import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';

const RELATIVE_TOLERANCE = 1e-8;
const SPAN_LENGTH = 2.4; // two existing 1.2 m fixture spans
const HALF_SPAN = SPAN_LENGTH / 2;
const POINT_LOAD = 1000; // N, applied in global -Z at the physical midspan
const UDL_INTENSITY = 500; // N/m, applied in global -Z over both spans
const LEFT_NODE = 'N-000120';
const MID_NODE = 'N-000121';
const RIGHT_NODE = 'N-000122';
const LEFT_ELEMENT = 'E-000120';
const RIGHT_ELEMENT = 'E-000121';

const results = [];

function test(id, name, body) {
  const result = body();
  results.push(Object.freeze({ id, name, ...result }));
}

function assertClose(actual, expected, relativeTolerance, message) {
  const scale = Math.max(Math.abs(expected), 1e-300);
  assert.ok(
    Math.abs(actual - expected) <= relativeTolerance * scale,
    `${message}: ${actual} differs from ${expected} beyond ${relativeTolerance} relative`,
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
  return nodalState(nodeId, dof, INACTIVE_ANALYSIS_DOF_BEHAVIOR, 'PLANAR-XZ');
}

function simplySupportedConstraints() {
  return [
    // Literal physical pin: all translations fixed, rotations free.
    fixed(LEFT_NODE, 'UX', 'PIN'),
    fixed(LEFT_NODE, 'UY', 'PIN'),
    fixed(LEFT_NODE, 'UZ', 'PIN'),
    // Literal physical roller: vertical translation fixed only.
    fixed(RIGHT_NODE, 'UZ', 'ROLLER'),
    // Governed planar X-Z kinematic subspace. These are analysis states,
    // not physical supports and therefore produce no support reactions.
    inactive(LEFT_NODE, 'RX'),
    inactive(LEFT_NODE, 'RZ'),
    inactive(MID_NODE, 'UY'),
    inactive(MID_NODE, 'RX'),
    inactive(MID_NODE, 'RZ'),
    inactive(RIGHT_NODE, 'UY'),
    inactive(RIGHT_NODE, 'RX'),
    inactive(RIGHT_NODE, 'RZ'),
  ];
}

function simplySupportedCompilation(overrides = {}) {
  return compileMechanicalModel(compilerInput({
    modelIdentity: 'SYS-B37-SIMPLY-SUPPORTED',
    constraintDeclarations: simplySupportedConstraints(),
    ...overrides,
  }));
}

function nodalPointLoad() {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: 'LP-B37-CENTRE-POINT',
    kind: 'NODAL_FORCE_MOMENT',
    nodeId: MID_NODE,
    basis: { kind: 'GLOBAL' },
    force: { fx: 0, fy: 0, fz: -POINT_LOAD },
    moment: { mx: 0, my: 0, mz: 0 },
    units: { force: 'N', moment: 'N*m', length: 'm' },
    signConvention: 'APPLIED_TO_STRUCTURE',
    sourceEvidence: {
      sourceId: 'LFEA-B3.6-HAND-CALCULATION',
      sourceRevision: '01',
      sourceSemanticHash: 'fnv1a64:3636363636363636',
    },
  };
}

function distributedLoad(elementId, suffix) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: `LP-B37-UDL-${suffix}`,
    kind: 'DISTRIBUTED_LOAD',
    elementId,
    basis: 'GLOBAL',
    variation: 'UNIFORM',
    startIntensity: { fx: 0, fy: 0, fz: -UDL_INTENSITY },
    endIntensity: { fx: 0, fy: 0, fz: -UDL_INTENSITY },
    units: { distributedForce: 'N/m', length: 'm' },
    sourceEvidence: {
      sourceId: 'LFEA-B3.6-HAND-CALCULATION',
      sourceRevision: '01',
      sourceSemanticHash: `fnv1a64:${suffix === 'E120' ? '3737373737373737' : '3838383838383838'}`,
    },
  };
}

function loadCase(compilation, { loadCaseId, label, primitives }) {
  return compilePhysicalLoadCase({
    loadCaseId,
    loadCaseClass: 'APPLIED_MECHANICAL',
    presentation: { label, description: `${label} closed-form benchmark.` },
    modelReference: modelReferenceFromCompilation(compilation),
    primitives,
    profile: loadCaseProfile(),
  });
}

function frameElementWithDistributedLoad(compilation, elementId, nodeI, nodeJ, primitive) {
  const sealed = sealLoadPrimitive(primitive, {
    profile: loadCaseProfile(),
    modelReference: modelReferenceFromCompilation(compilation),
  });
  return compileFrameElement({
    elementId,
    material: materialResolution(),
    section: sectionResolution(),
    localAxes: {
      result: axisResult(nodeI, nodeJ),
      profile: FRAME_LOCAL_AXIS_PROFILE,
    },
    profile: frameElementProfile(),
    distributedLoads: [sealed],
    temperature: null,
    releases: [],
    endSprings: [],
    rigidOffsets: null,
  });
}

function solve(compilation, elements, physicalLoadCase) {
  return compileSolverExecution({
    compilation,
    elementContributions: elements.map(elementContributionFromFrameElement),
    loadCase: physicalLoadCase,
    solverProfile: solverProfile(),
  });
}

function solveAndRecover(compilation, elements, physicalLoadCase) {
  const execution = solve(compilation, elements, physicalLoadCase);
  const recovery = compileResultRecovery({
    compilation,
    execution,
    loadCase: physicalLoadCase,
    frameElements: elements,
    pipingComponents: [],
    recoveryProfile: recoveryProfile(),
  });
  return { execution, recovery };
}

function reactionAt(execution, nodeId) {
  return execution.reactions.find(
    (entry) => entry.nodeId === nodeId && entry.dof === 'UZ',
  ).value;
}

function displacementAt(execution, nodeId) {
  return execution.displacement.find(
    (entry) => entry.nodeId === nodeId && entry.dof === 'UZ',
  ).value;
}

function midspanMomentActions(recovery) {
  const left = recovery.elementActions.find((entry) => entry.elementId === LEFT_ELEMENT).local.J.mz;
  const right = recovery.elementActions.find((entry) => entry.elementId === RIGHT_ELEMENT).local.I.mz;
  return { left, right };
}

function verifyClosedForm({ execution, recovery, expectedReaction, expectedMoment, expectedDeflection, label }) {
  const leftReaction = reactionAt(execution, LEFT_NODE);
  const rightReaction = reactionAt(execution, RIGHT_NODE);
  const midpointDeflection = displacementAt(execution, MID_NODE);
  const midpointMoments = midspanMomentActions(recovery);

  assert.equal(execution.assembly.inactiveDofCount, 8, `${label} inactive DOF count`);
  assert.equal(execution.reactions.length, 4, `${label} must report only the four physical support reactions`);
  assertClose(leftReaction, expectedReaction, RELATIVE_TOLERANCE, `${label} left reaction`);
  assertClose(rightReaction, expectedReaction, RELATIVE_TOLERANCE, `${label} right reaction`);
  assertClose(Math.abs(midpointMoments.left), expectedMoment, RELATIVE_TOLERANCE, `${label} left-span midspan moment`);
  assertClose(Math.abs(midpointMoments.right), expectedMoment, RELATIVE_TOLERANCE, `${label} right-span midspan moment`);
  assertClose(midpointDeflection, expectedDeflection, RELATIVE_TOLERANCE, `${label} midspan deflection`);

  return Object.freeze({
    reactions: Object.freeze({ left: leftReaction, right: rightReaction, expected: expectedReaction }),
    moment: Object.freeze({
      leftElementJ: midpointMoments.left,
      rightElementI: midpointMoments.right,
      expectedMagnitude: expectedMoment,
    }),
    deflection: Object.freeze({ actual: midpointDeflection, expected: expectedDeflection }),
  });
}

const compilation = simplySupportedCompilation();
const baseline = frameElements()[0];
const elasticModulus = baseline.material.elasticModulus;
const secondMoment = baseline.section.secondMomentY;

test('B37-T01', 'Simply supported beam with centre point load matches closed form', () => {
  const physicalLoadCase = loadCase(compilation, {
    loadCaseId: 'LC-B37-CENTRE-POINT',
    label: 'Simply supported centre point load',
    primitives: [nodalPointLoad()],
  });
  const solved = solveAndRecover(compilation, frameElements(), physicalLoadCase);
  return verifyClosedForm({
    ...solved,
    expectedReaction: POINT_LOAD / 2, // P / 2
    expectedMoment: (POINT_LOAD * SPAN_LENGTH) / 4, // P L / 4
    expectedDeflection: -(POINT_LOAD * SPAN_LENGTH ** 3)
      / (48 * elasticModulus * secondMoment), // -P L^3 / (48 E I)
    label: 'Centre point load',
  });
});

test('B37-T02', 'Simply supported beam with full-span UDL matches closed form', () => {
  const leftPrimitive = distributedLoad(LEFT_ELEMENT, 'E120');
  const rightPrimitive = distributedLoad(RIGHT_ELEMENT, 'E121');
  const physicalLoadCase = loadCase(compilation, {
    loadCaseId: 'LC-B37-FULL-SPAN-UDL',
    label: 'Simply supported full-span UDL',
    primitives: [leftPrimitive, rightPrimitive],
  });
  const elements = [
    frameElementWithDistributedLoad(compilation, LEFT_ELEMENT, [0, 0, 0], [HALF_SPAN, 0, 0], leftPrimitive),
    frameElementWithDistributedLoad(compilation, RIGHT_ELEMENT, [HALF_SPAN, 0, 0], [SPAN_LENGTH, 0, 0], rightPrimitive),
  ];
  const solved = solveAndRecover(compilation, elements, physicalLoadCase);
  return verifyClosedForm({
    ...solved,
    expectedReaction: (UDL_INTENSITY * SPAN_LENGTH) / 2, // w L / 2
    expectedMoment: (UDL_INTENSITY * SPAN_LENGTH ** 2) / 8, // w L^2 / 8
    expectedDeflection: -(5 * UDL_INTENSITY * SPAN_LENGTH ** 4)
      / (384 * elasticModulus * secondMoment), // -5 w L^4 / (384 E I)
    label: 'Full-span UDL',
  });
});

console.log(JSON.stringify({
  check: 'lfea-b3.7-simply-supported-beam',
  status: 'PASS',
  tolerance: RELATIVE_TOLERANCE,
  spanLength: SPAN_LENGTH,
  elasticModulus,
  secondMoment,
  results,
}));
