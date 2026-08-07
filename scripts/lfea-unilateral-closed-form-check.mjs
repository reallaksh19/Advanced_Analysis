#!/usr/bin/env node

import assert from 'node:assert/strict';
import { FRAME_LOCAL_AXIS_PROFILE } from '../src/core/centerline-beam-fea/index.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
import {
  compilePhysicalLoadCase,
  modelReferenceFromCompilation,
  sealLoadPrimitive,
} from '../src/core/linear-fea-load-case/index.js';
import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import {
  compileSolverExecution,
  elementContributionFromFrameElement,
} from '../src/core/linear-fea-solver/index.js';
import { compileUnilateralSolverExecution } from '../src/core/linear-fea-unilateral-solver/index.js';
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

const TOL = 1e-9;
const L = 1.2;
const P = 1200;
const LEFT = 'N-000120';
const MID = 'N-000121';
const RIGHT = 'N-000122';
const LEFT_ELEMENT = 'E-000120';
const RIGHT_ELEMENT = 'E-000121';
const UNILATERAL = Object.freeze({
  declarationId: 'C-M036-MID-PLUS-Y',
  nodeId: MID,
  typeCode: 14,
  gap: 0,
  frictionCoefficient: null,
});

function fixed(nodeId, dof, suffix = dof) {
  return { declarationId: `C-M036-${nodeId}-${suffix}`, kind: 'NODAL_RESTRAINT', nodeId, dof, behavior: 'FIXED' };
}

function baseConstraints() {
  const endFixed = [LEFT, RIGHT].flatMap((nodeId) => ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']
    .map((dof) => fixed(nodeId, dof)));
  return [
    ...endFixed,
    fixed(MID, 'UX'),
    fixed(MID, 'UZ'),
    fixed(MID, 'RX'),
    fixed(MID, 'RY'),
  ];
}

function topology() {
  return {
    geometry: {
      schemaVersion: 'canonical-geometry-v1',
      nodes: [
        { id: 'S1/N1', x: 0, y: 0, z: 0, restraint: 'ANCHOR', sourceComponentUid: 'M036', meta: {} },
        { id: 'S1/N2', x: 0, y: L, z: 0, restraint: 'FREE', sourceComponentUid: 'M036', meta: { spanSeeded: true } },
        { id: 'S1/N3', x: 0, y: 2 * L, z: 0, restraint: 'ANCHOR', sourceComponentUid: 'M036', meta: {} },
      ],
      segments: [
        { id: 'S1/A', startNodeId: 'S1/N1', endNodeId: 'S1/N2', type: 'PIPE' },
        { id: 'S1/B', startNodeId: 'S1/N2', endNodeId: 'S1/N3', type: 'PIPE' },
      ],
      source: 'M036-closed-form', unit: 'm', diagnostics: [], summary: {},
    },
    semanticHash: 'fnv1a64:3630363630363630',
  };
}

function localAxes() {
  return [
    { evidenceIdentity: 'AXIS-E-000120', result: axisResult([0, 0, 0], [0, L, 0]) },
    { evidenceIdentity: 'AXIS-E-000121', result: axisResult([0, L, 0], [0, 2 * L, 0]) },
  ];
}

function compileModel(constraints) {
  return compileMechanicalModel(compilerInput({
    modelIdentity: 'SYS-M036-CLOSED-FORM',
    conditionedTopology: topology(),
    localAxisResults: localAxes(),
    constraintDeclarations: constraints,
  }));
}

function pointPrimitive(forceY, suffix) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: `LP-M036-${suffix}`,
    kind: 'NODAL_FORCE_MOMENT',
    nodeId: MID,
    basis: { kind: 'GLOBAL' },
    force: { fx: 0, fy: forceY, fz: 0 },
    moment: { mx: 0, my: 0, mz: 0 },
    units: { force: 'N', moment: 'N*m', length: 'm' },
    signConvention: 'APPLIED_TO_STRUCTURE',
    sourceEvidence: { sourceId: 'M036-HAND-CALC', sourceRevision: '01', sourceSemanticHash: 'fnv1a64:3630363132303030' },
  };
}

function loadCase(compilation, loadCaseId, loadCaseClass, primitives) {
  return compilePhysicalLoadCase({
    loadCaseId,
    loadCaseClass,
    presentation: { label: loadCaseId, description: 'M036 closed-form unilateral check.' },
    modelReference: modelReferenceFromCompilation(compilation),
    primitives,
    profile: loadCaseProfile(),
  });
}

function elements(compilation, temperature = null) {
  const modelReference = modelReferenceFromCompilation(compilation);
  const sealedTemperature = temperature
    ? sealLoadPrimitive(temperature, { profile: loadCaseProfile(), modelReference })
    : null;
  return [
    compileFrameElement({
      elementId: LEFT_ELEMENT,
      material: materialResolution(), section: sectionResolution(),
      localAxes: { result: axisResult([0, 0, 0], [0, L, 0]), profile: FRAME_LOCAL_AXIS_PROFILE },
      profile: frameElementProfile(), distributedLoads: [], temperature: sealedTemperature,
      releases: [], endSprings: [], rigidOffsets: null,
    }),
    compileFrameElement({
      elementId: RIGHT_ELEMENT,
      material: materialResolution(), section: sectionResolution(),
      localAxes: { result: axisResult([0, L, 0], [0, 2 * L, 0]), profile: FRAME_LOCAL_AXIS_PROFILE },
      profile: frameElementProfile(), distributedLoads: [], temperature: null,
      releases: [], endSprings: [], rigidOffsets: null,
    }),
  ];
}

function solve(constraints, { id, forceY = null, thermal = null }) {
  const compilation = compileModel(constraints);
  const primitives = thermal ? [thermal] : [pointPrimitive(forceY, id)];
  const physical = loadCase(compilation, id, thermal ? 'THERMAL' : 'APPLIED_MECHANICAL', primitives);
  const frameElements = elements(compilation, thermal);
  return compileSolverExecution({
    compilation,
    elementContributions: frameElements.map(elementContributionFromFrameElement),
    loadCase: physical,
    solverProfile: solverProfile(),
  });
}

function value(entries, nodeId, dof) {
  return entries.find((entry) => entry.nodeId === nodeId && entry.dof === dof)?.value;
}

function close(actual, expected, label, scale = Math.abs(expected)) {
  const reference = Math.max(scale, 1e-300);
  assert.ok(Math.abs(actual - expected) <= TOL * reference, `${label}: ${actual} != ${expected}`);
}

const material = materialResolution().materialState;
const section = sectionResolution().sectionState;
const axialStiffness = material.elasticModulus * section.area / L;
const expectedReleasedDelta = P / (2 * axialStiffness);
const engagedConstraint = { ...UNILATERAL, kind: 'NODAL_RESTRAINT', dof: 'UY', behavior: 'FIXED' };
const engagedDeclaration = {
  declarationId: UNILATERAL.declarationId,
  kind: 'NODAL_RESTRAINT', nodeId: MID, dof: 'UY', behavior: 'FIXED',
};

for (const [label, forceY] of [['DOWN', -P], ['UP', P]]) {
  const engagedExecution = solve([...baseConstraints(), engagedDeclaration], { id: `LC-M036-${label}-ENGAGED`, forceY });
  const releasedExecution = solve(baseConstraints(), { id: `LC-M036-${label}-RELEASED`, forceY });
  close(value(engagedExecution.reactions, MID, 'UY'), -forceY, `${label} forced-engaged reaction`, P);
  close(value(engagedExecution.displacement, MID, 'UY'), 0, `${label} forced-engaged displacement`, expectedReleasedDelta);
  assert.equal(value(releasedExecution.reactions, MID, 'UY'), undefined, `${label} released support must have no reaction`);
  close(value(releasedExecution.displacement, MID, 'UY'), forceY / (2 * axialStiffness), `${label} released displacement`);
  close(value(releasedExecution.reactions, LEFT, 'UY'), -forceY / 2, `${label} left reaction`, P);
  close(value(releasedExecution.reactions, RIGHT, 'UY'), -forceY / 2, `${label} right reaction`, P);

  const wrapper = compileUnilateralSolverExecution({
    baseDeclarations: baseConstraints(), unilateral: [UNILATERAL],
    buildAndSolve: (active) => solve(active, { id: `LC-M036-${label}-WRAPPED`, forceY }),
  });
  assert.equal(wrapper.convergedState[0].status, forceY < 0 ? 'ENGAGED' : 'RELEASED');
}

const deltaT = 100;
const thermal = temperaturePrimitive({
  primitiveId: 'LP-M036-THERMAL-LEFT', elementId: LEFT_ELEMENT,
  operatingTemperature: 393.15, installationTemperature: 393.15 - deltaT,
  thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
});
const expectedThermalLift = material.thermalExpansionCoefficient * deltaT * L / 2;
const thermalEngaged = solve([...baseConstraints(), engagedDeclaration], { id: 'LC-M036-THERMAL-ENGAGED', thermal });
assert.ok(value(thermalEngaged.reactions, MID, 'UY') < -1, 'thermal forced-engaged state must demand an illegal -Y reaction');
const thermalWrapped = compileUnilateralSolverExecution({
  baseDeclarations: baseConstraints(), unilateral: [UNILATERAL],
  buildAndSolve: (active) => solve(active, { id: 'LC-M036-THERMAL-WRAPPED', thermal }),
});
assert.equal(thermalWrapped.convergedState[0].status, 'RELEASED');
assert.equal(value(thermalWrapped.finalExecution.reactions, MID, 'UY'), undefined);
close(value(thermalWrapped.finalExecution.displacement, MID, 'UY'), expectedThermalLift, 'thermal released lift-off');

console.log(JSON.stringify({
  check: 'lfea-unilateral-closed-form', status: 'PASS', tolerance: TOL,
  geometry: { spanLength: L, axis: '+Y' },
  forceCase: { load: P, expectedReleasedDelta },
  thermalCase: { deltaT, expectedThermalLift },
}, null, 2));
