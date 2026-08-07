#!/usr/bin/env node

import assert from 'node:assert/strict';
import { FRAME_LOCAL_AXIS_PROFILE } from '../src/core/centerline-beam-fea/index.js';
import { INACTIVE_ANALYSIS_DOF_BEHAVIOR } from '../src/core/linear-fea-contract/index.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
import {
  compilePhysicalLoadCase,
  modelReferenceFromCompilation,
} from '../src/core/linear-fea-load-case/index.js';
import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import {
  compileSolverExecution,
  elementContributionFromFrameElement,
} from '../src/core/linear-fea-solver/index.js';
import {
  compileUnilateralSolverExecution,
  sealUnilateralDeclaration,
} from '../src/core/linear-fea-unilateral-solver/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  axisResult,
  compilerInput,
  materialResolution,
  sectionResolution,
} from './lfea-b2.5-model-compiler-fixtures.mjs';
import {
  frameElementProfile,
  loadCaseProfile,
  solverProfile,
} from './lfea-b3.3-solver-fixtures.mjs';

const A = 'N-000120';
const B = 'N-000121';
const C = 'N-000122';
const E1 = 'E-000120';
const E2 = 'E-000121';
const L = 1.2;
const POINT_LOAD = 1200;
const INSTALLATION_TEMPERATURE = 293.15;
const OPERATING_TEMPERATURE = 393.15;
const RELATIVE_TOLERANCE = 1e-9;

function assertClose(actual, expected, message) {
  const tolerance = expected === 0 ? 1e-9 : RELATIVE_TOLERANCE * Math.abs(expected);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
}

function axialTopology() {
  const geometry = {
    schemaVersion: 'canonical-geometry-v1',
    nodes: [
      { id: 'S1/N1', x: 0, y: 0, z: 0, restraint: 'FREE', sourceComponentUid: 'M036-T1', meta: {} },
      { id: 'S1/N2', x: 0, y: L, z: 0, restraint: 'FREE', sourceComponentUid: 'M036-T1', meta: {} },
      { id: 'S1/N3', x: 0, y: 2 * L, z: 0, restraint: 'FREE', sourceComponentUid: 'M036-T1', meta: {} },
    ],
    segments: [
      { id: 'S1/A', startNodeId: 'S1/N1', endNodeId: 'S1/N2', type: 'PIPE', sourceComponentUid: 'M036-T1' },
      { id: 'S1/B', startNodeId: 'S1/N2', endNodeId: 'S1/N3', type: 'PIPE', sourceComponentUid: 'M036-T1' },
    ],
    source: 'M036-T1-HAND-CLOSED-FORM',
    unit: 'm',
    diagnostics: [],
    summary: {},
  };
  return { geometry, semanticHash: semanticHash({ geometry }) };
}

function constraint(nodeId, dof, behavior, suffix) {
  return { declarationId: `M036-${nodeId}-${dof}-${suffix}`, kind: 'NODAL_RESTRAINT', nodeId, dof, behavior };
}

function baseDeclarations() {
  const rows = [constraint(A, 'UY', 'FIXED', 'ROOT')];
  for (const nodeId of [A, B, C]) {
    for (const dof of ['UX', 'UZ', 'RX', 'RY', 'RZ']) {
      rows.push(constraint(nodeId, dof, INACTIVE_ANALYSIS_DOF_BEHAVIOR, 'AXIAL-SUBSPACE'));
    }
  }
  return rows;
}

const MID_CONSTRAINT = Object.freeze(constraint(B, 'UY', 'FIXED', 'PLUS-Y'));
const MID_UNILATERAL = sealUnilateralDeclaration({
  constraint: MID_CONSTRAINT,
  sense: 1,
  gap: 0,
  frictionCoefficient: 0,
});

function compilation(declarations) {
  return compileMechanicalModel(compilerInput({
    modelIdentity: 'M036-T1-AXIAL-BEAM',
    conditionedTopology: axialTopology(),
    localAxisResults: [
      { evidenceIdentity: 'AXIS-E-000120', result: axisResult([0, 0, 0], [0, L, 0], [0, 0, 1]) },
      { evidenceIdentity: 'AXIS-E-000121', result: axisResult([0, L, 0], [0, 2 * L, 0], [0, 0, 1]) },
    ],
    constraintDeclarations: declarations,
  }));
}

function pointLoadPrimitive(forceY) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: `M036-T1-FY-${forceY}`,
    kind: 'NODAL_FORCE_MOMENT',
    nodeId: B,
    basis: { kind: 'GLOBAL' },
    force: { fx: 0, fy: forceY, fz: 0 },
    moment: { mx: 0, my: 0, mz: 0 },
    units: { force: 'N', moment: 'N*m', length: 'm' },
    signConvention: 'APPLIED_TO_STRUCTURE',
    sourceEvidence: { sourceId: 'M036-T1-HAND', sourceRevision: String(forceY), sourceSemanticHash: 'fnv1a64:3636363636363636' },
  };
}

function temperaturePrimitive() {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: 'M036-T2-TEMP-E1',
    kind: 'TEMPERATURE',
    elementId: E1,
    operatingTemperature: OPERATING_TEMPERATURE,
    installationTemperature: INSTALLATION_TEMPERATURE,
    stiffnessEvaluationMaterialStateId: 'MAT-A106B-393K',
    thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
    sourceEvidence: { sourceId: 'M036-T2-HAND', sourceRevision: '100K', sourceSemanticHash: 'fnv1a64:3737373737373737' },
  };
}

function frameElements(temperature) {
  const material = materialResolution();
  const section = sectionResolution();
  const profile = frameElementProfile();
  return [
    compileFrameElement({
      elementId: E1, material, section,
      localAxes: { result: axisResult([0, 0, 0], [0, L, 0], [0, 0, 1]), profile: FRAME_LOCAL_AXIS_PROFILE },
      profile, distributedLoads: [], temperature, releases: [], endSprings: [], rigidOffsets: null,
    }),
    compileFrameElement({
      elementId: E2, material, section,
      localAxes: { result: axisResult([0, L, 0], [0, 2 * L, 0], [0, 0, 1]), profile: FRAME_LOCAL_AXIS_PROFILE },
      profile, distributedLoads: [], temperature: null, releases: [], endSprings: [], rigidOffsets: null,
    }),
  ];
}

function solveState({ declarations, forceY, thermal }) {
  const model = compilation(declarations);
  const primitives = thermal ? [temperaturePrimitive()] : [pointLoadPrimitive(forceY)];
  const loadCase = compilePhysicalLoadCase({
    loadCaseId: thermal ? 'M036-T2-THERMAL' : `M036-T1-FY-${forceY}`,
    loadCaseClass: thermal ? 'THERMAL' : 'APPLIED_MECHANICAL',
    presentation: { label: 'M036 closed form', description: 'M036 unilateral sign and thermal oracle.' },
    modelReference: modelReferenceFromCompilation(model),
    primitives,
    profile: loadCaseProfile(),
  });
  const temperature = thermal ? loadCase.primitives.find((row) => row.kind === 'TEMPERATURE') : null;
  const elements = frameElements(temperature);
  return compileSolverExecution({
    compilation: model,
    elementContributions: elements.map(elementContributionFromFrameElement),
    loadCase,
    solverProfile: solverProfile(),
  });
}

function value(entries, nodeId, dof) {
  return entries.find((row) => row.nodeId === nodeId && row.dof === dof)?.value ?? 0;
}

function runMechanical(forceY) {
  const base = baseDeclarations();
  const engaged = solveState({ declarations: [...base, MID_CONSTRAINT], forceY, thermal: false });
  const released = solveState({ declarations: base, forceY, thermal: false });
  const material = materialResolution().materialState;
  const section = sectionResolution().sectionState;
  const expectedReleasedDisplacement = forceY * L / (material.elasticModulus * section.area);

  assertClose(value(engaged.reactions, B, 'UY'), -forceY, `engaged B reaction for FY=${forceY}`);
  assertClose(value(engaged.reactions, A, 'UY'), 0, `engaged A reaction for FY=${forceY}`);
  assertClose(value(released.reactions, A, 'UY'), -forceY, `released A reaction for FY=${forceY}`);
  assertClose(value(released.displacement, B, 'UY'), expectedReleasedDisplacement, `released B displacement for FY=${forceY}`);
  assertClose(value(released.displacement, C, 'UY'), expectedReleasedDisplacement, `released C displacement for FY=${forceY}`);

  const wrapped = compileUnilateralSolverExecution({
    baseDeclarations: base,
    unilateral: [MID_UNILATERAL],
    buildAndSolve: (active) => solveState({ declarations: active, forceY, thermal: false }),
    policy: { penetrationTolerance: 1e-12 },
  });
  return { wrapped, expectedReleasedDisplacement };
}

const downward = runMechanical(-POINT_LOAD);
assert.equal(downward.wrapped.convergedState[0].engaged, true, 'downward load must keep +Y support engaged');
assert.equal(downward.wrapped.trace.length, 1, 'downward load converges in one engaged solve');

const upward = runMechanical(POINT_LOAD);
assert.equal(upward.wrapped.convergedState[0].engaged, false, 'upward load must release +Y support');
assert.equal(upward.wrapped.trace.length, 2, 'upward load requires engaged trial then released solve');
assert.equal(upward.wrapped.trace[0].flips[0].reason, 'REACTION_DISALLOWED_SENSE');

const thermalBase = baseDeclarations();
const thermalEngaged = solveState({ declarations: [...thermalBase, MID_CONSTRAINT], forceY: 0, thermal: true });
const thermalReleased = solveState({ declarations: thermalBase, forceY: 0, thermal: true });
const material = materialResolution().materialState;
const section = sectionResolution().sectionState;
const deltaT = OPERATING_TEMPERATURE - INSTALLATION_TEMPERATURE;
const freeExpansion = material.thermalExpansionCoefficient * deltaT * L;
const blockedReaction = -material.elasticModulus * section.area * material.thermalExpansionCoefficient * deltaT;
assertClose(value(thermalEngaged.reactions, B, 'UY'), blockedReaction, 'thermal engaged B reaction');
assertClose(value(thermalReleased.displacement, B, 'UY'), freeExpansion, 'thermal released B free expansion');
assertClose(value(thermalReleased.reactions, A, 'UY'), 0, 'thermal released A reaction');

const thermalWrapped = compileUnilateralSolverExecution({
  baseDeclarations: thermalBase,
  unilateral: [MID_UNILATERAL],
  buildAndSolve: (active) => solveState({ declarations: active, forceY: 0, thermal: true }),
  policy: { penetrationTolerance: 1e-12 },
});
assert.equal(thermalWrapped.convergedState[0].engaged, false, 'positive thermal expansion must lift off +Y support');
assert.equal(thermalWrapped.trace.length, 2, 'thermal lift-off converges after one release');
assertClose(value(thermalWrapped.finalExecution.displacement, B, 'UY'), freeExpansion, 'thermal wrapper free expansion');

console.log('M036 unilateral closed-form T1/T2 PASS');
console.log(`T1 released |u_B| = ${Math.abs(upward.expectedReleasedDisplacement)} m for ${POINT_LOAD} N.`);
console.log(`T2 free thermal expansion u_B = ${freeExpansion} m; engaged trial R_B = ${blockedReaction} N.`);
