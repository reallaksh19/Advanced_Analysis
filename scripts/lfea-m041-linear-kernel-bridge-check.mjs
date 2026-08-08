#!/usr/bin/env node
import assert from 'node:assert/strict';
import { FRAME_LOCAL_AXIS_PROFILE } from '../src/core/centerline-beam-fea/index.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
import { compilePhysicalLoadCase, modelReferenceFromCompilation } from '../src/core/linear-fea-load-case/index.js';
import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import { compileSolverExecution, elementContributionFromFrameElement } from '../src/core/linear-fea-solver/index.js';
import { compileContactFrictionExecution } from '../src/core/linear-fea-contact-friction-solver/index.js';
import {
  axisResult,
  compilerInput,
  materialResolution,
  sectionResolution,
} from './lfea-b2.5-model-compiler-fixtures.mjs';
import { frameElementProfile, loadCaseProfile, solverProfile } from './lfea-b3.3-solver-fixtures.mjs';

const L = 1.2;
const BASE = 'N-000120';
const TIP = 'N-000121';
const ELEMENT = 'E-000120';
const NORMAL_LOAD = -1000;
const MU = 0.3;
const FORCE_TOL = 1e-4;
const material = materialResolution();
const section = sectionResolution();
const tangentStructuralStiffness = 12 * material.materialState.elasticModulus
  * section.sectionState.secondMomentZ / L ** 3;

const CONTACT = Object.freeze({
  declarationId: 'M041-C1',
  nodeId: TIP,
  normalDof: 'UY',
  normalSense: 1,
  tangentDofs: ['UX', 'UZ'],
  gap: 0,
  frictionCoefficient: MU,
  frictionStiffness: tangentStructuralStiffness,
  initialState: 'STICK',
});
const POLICY = Object.freeze({
  forceTolerance: FORCE_TOL,
  penetrationTolerance: 1e-10,
  directionCosineTolerance: 1e-8,
  maximumIterations: 12,
  maximumLineSearchSteps: 12,
  maximumExactStateCandidates: 9,
});

function topology() {
  return {
    geometry: {
      schemaVersion: 'canonical-geometry-v1',
      nodes: [
        { id: 'S1/N1', x: 0, y: 0, z: 0, restraint: 'ANCHOR', sourceComponentUid: 'M041', meta: {} },
        { id: 'S1/N2', x: 0, y: L, z: 0, restraint: 'FREE', sourceComponentUid: 'M041', meta: {} },
      ],
      segments: [{ id: 'S1/A', startNodeId: 'S1/N1', endNodeId: 'S1/N2', type: 'PIPE' }],
      source: 'M041-linear-kernel-bridge', unit: 'm', diagnostics: [], summary: {},
    },
    semanticHash: 'fnv1a64:4141414141414141',
  };
}

function fixed(nodeId, dof, suffix = dof) {
  return { declarationId: `M041-FIX-${nodeId}-${suffix}`, kind: 'NODAL_RESTRAINT', nodeId, dof, behavior: 'FIXED' };
}

function baseConstraints() {
  return [
    ...['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => fixed(BASE, dof)),
    ...['RX', 'RY', 'RZ'].map((dof) => fixed(TIP, dof)),
  ];
}

function compileModel(request) {
  const active = request.activeContacts.map((row) => ({
    declarationId: `${row.declarationId}-NORMAL`,
    kind: 'NODAL_RESTRAINT', nodeId: row.nodeId, dof: row.normalDof, behavior: 'FIXED',
  }));
  const stick = request.stickSprings.map((row) => ({
    declarationId: row.declarationId,
    kind: 'PARTIAL_RELEASE_SPRING', nodeId: row.nodeId, dof: row.dof, stiffness: row.stiffness,
  }));
  return compileMechanicalModel(compilerInput({
    modelIdentity: 'SYS-M041-BRIDGE',
    conditionedTopology: topology(),
    nodeBindings: [
      { nodeId: BASE, conditionedNodeId: 'CN-000120', topologyNodeId: 'S1/N1' },
      { nodeId: TIP, conditionedNodeId: 'CN-000121', topologyNodeId: 'S1/N2' },
    ],
    elementBindings: [{
      elementId: ELEMENT,
      conditionedSegmentId: 'CS-000120',
      topologySegmentId: 'S1/A',
      materialStateId: material.materialState.materialStateId,
      sectionStateId: section.sectionState.sectionStateId,
      formulationId: 'PIPE_FRAME3D_LINEAR_V1',
      localAxisEvidenceIdentity: 'AXIS-M041-E1',
      sourceComponentId: 'M041',
    }],
    materialResolutions: [material],
    sectionResolutions: [section],
    localAxisResults: [{ evidenceIdentity: 'AXIS-M041-E1', result: axisResult([0, 0, 0], [0, L, 0]) }],
    constraintDeclarations: [...baseConstraints(), ...active, ...stick],
  }));
}

function forcePrimitive(id, fx, fy = 0, fz = 0) {
  return {
    schema: 'fea-linear-load-primitive/v1', primitiveId: id, kind: 'NODAL_FORCE_MOMENT', nodeId: TIP,
    basis: { kind: 'GLOBAL' }, force: { fx, fy, fz }, moment: { mx: 0, my: 0, mz: 0 },
    units: { force: 'N', moment: 'N*m', length: 'm' }, signConvention: 'APPLIED_TO_STRUCTURE',
    sourceEvidence: {
      sourceId: 'M041-LINEAR-KERNEL-BRIDGE', sourceRevision: id,
      sourceSemanticHash: 'fnv1a64:4141414141414242',
    },
  };
}

function buildAndSolve(tangentLoad) {
  return (request) => {
    const compilation = compileModel(request);
    const primitives = [forcePrimitive('M041-BASE-LOAD', tangentLoad, NORMAL_LOAD, 0)];
    for (const row of request.slipForces) {
      const component = Object.fromEntries(row.components.map((entry) => [entry.dof, entry.value]));
      primitives.push(forcePrimitive(
        `M041-SLIP-${row.declarationId}`,
        component.UX ?? 0,
        component.UY ?? 0,
        component.UZ ?? 0,
      ));
    }
    const loadCase = compilePhysicalLoadCase({
      loadCaseId: 'LC-M041-BRIDGE', loadCaseClass: 'APPLIED_MECHANICAL',
      presentation: { label: 'M041 bridge', description: 'Real linear-kernel contact/friction bridge fixture.' },
      modelReference: modelReferenceFromCompilation(compilation), primitives, profile: loadCaseProfile(),
    });
    const frame = compileFrameElement({
      elementId: ELEMENT,
      material,
      section,
      localAxes: { result: axisResult([0, 0, 0], [0, L, 0]), profile: FRAME_LOCAL_AXIS_PROFILE },
      profile: frameElementProfile(), distributedLoads: [], temperature: null,
      releases: [], endSprings: [], rigidOffsets: null,
    });
    return compileSolverExecution({
      compilation,
      elementContributions: [elementContributionFromFrameElement(frame)],
      loadCase,
      solverProfile: solverProfile(),
    });
  };
}

function value(rows, nodeId, dof) {
  return rows.find((row) => row.nodeId === nodeId && row.dof === dof)?.value;
}

function selected(result) {
  return result.selectedState[0];
}

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
}

const stick = compileContactFrictionExecution({ contacts: [CONTACT], buildAndSolve: buildAndSolve(300), policy: POLICY });
assert.equal(selected(stick).state, 'STICK');
close(selected(stick).normalReaction, 1000, FORCE_TOL, 'STICK normal reaction');
close(selected(stick).tangentialMagnitude, 150, FORCE_TOL, 'STICK tangential force');
close(selected(stick).coulombLimit, 300, FORCE_TOL, 'STICK Coulomb limit');
close(value(stick.finalExecution.displacement, TIP, 'UX'), 150 / tangentStructuralStiffness, 1e-12, 'STICK UX');
assert.equal(stick.qualification.candidateStateCount, 3);
assert.equal(stick.qualification.admissibleCandidateCount, 1);

const slip = compileContactFrictionExecution({ contacts: [CONTACT], buildAndSolve: buildAndSolve(900), policy: POLICY });
assert.equal(selected(slip).state, 'SLIP');
close(selected(slip).normalReaction, 1000, FORCE_TOL, 'SLIP normal reaction');
close(selected(slip).tangentialMagnitude, 300, FORCE_TOL, 'SLIP tangential force');
close(selected(slip).coulombLimit, 300, FORCE_TOL, 'SLIP Coulomb limit');
close(value(slip.finalExecution.displacement, TIP, 'UX'), 600 / tangentStructuralStiffness, 1e-12, 'SLIP UX');
assert.ok(selected(slip).oppositionCosine <= -1 + 1e-10);
assert.ok(slip.constitutiveResidualInfinityNorm <= FORCE_TOL);
assert.equal(slip.qualification.admissibleCandidateCount, 1);

const openExecution = buildAndSolve(0)({ state: [{ declarationId: CONTACT.declarationId, nodeId: TIP, state: 'OPEN' }], activeContacts: [], stickSprings: [], slipForces: [] });
assert.equal(value(openExecution.reactions, TIP, 'UY'), undefined);
assert.ok(value(openExecution.displacement, TIP, 'UY') < 0, 'open +Y support must penetrate under downward normal load');

console.log(JSON.stringify({
  schema: 'm041-linear-kernel-bridge-qualification/v1', status: 'PASS',
  tangentStructuralStiffness,
  stick: { state: selected(stick).state, N: selected(stick).normalReaction, T: selected(stick).tangentialMagnitude, limit: selected(stick).coulombLimit },
  slip: { state: selected(slip).state, N: selected(slip).normalReaction, T: selected(slip).tangentialMagnitude, limit: selected(slip).coulombLimit },
  exactUniqueness: { stick: stick.qualification, slip: slip.qualification },
}, null, 2));
