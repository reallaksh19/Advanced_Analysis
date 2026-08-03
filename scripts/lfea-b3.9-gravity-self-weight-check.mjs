#!/usr/bin/env node

/**
 * LFEA B-3.9 PIPE_WALL gravity/self-weight closed-form checks.
 *
 * Exercises the production source-authority chain with a GRAVITY primitive as
 * the only physical load. M007 must derive one uniform DISTRIBUTED_LOAD per
 * model element from rho * A * g, bind it into the B-3.1 authorities, solve it
 * through B-3.3 and recover it through B-3.4 without touching solver or frame
 * formulation code.
 */

import assert from 'node:assert/strict';
import { INACTIVE_ANALYSIS_DOF_BEHAVIOR } from '../src/core/linear-fea-contract/index.js';
import {
  compilePhysicalLoadCase,
  modelReferenceFromCompilation,
} from '../src/core/linear-fea-load-case/index.js';
import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import {
  compileLinearPipingSourceAnalysisContext,
  deriveLinearPipingSourceAuthoritySet,
  expandPipeWallGravitySourceAuthorities,
} from '../src/core/linear-piping-analysis-consumer/index.js';
import { GRAVITY_DISTRIBUTED_WEIGHT_MISSING_CODE } from '../src/core/linear-piping-analysis-consumer/gravity-expansion-mass-sources.js';
import { compilerInput } from './lfea-b2.5-model-compiler-fixtures.mjs';
import {
  frameElements,
  loadCaseProfile,
  solverProfile,
} from './lfea-b3.3-solver-fixtures.mjs';
import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';

const RELATIVE_TOLERANCE = 1e-8;
const SPAN_LENGTH = 2.4;
const LEFT_NODE = 'N-000120';
const MID_NODE = 'N-000121';
const RIGHT_NODE = 'N-000122';
const LEFT_ELEMENT = 'E-000120';
const RIGHT_ELEMENT = 'E-000121';
const GRAVITY_PRIMITIVE_ID = 'LP-B39-GRAVITY-PIPE-WALL';
const results = [];

function test(id, name, body) {
  const evidence = body();
  results.push(Object.freeze({ id, name, ...evidence }));
}

function assertClose(actual, expected, relativeTolerance, message) {
  const scale = Math.max(Math.abs(expected), 1e-300);
  assert.ok(
    Math.abs(actual - expected) <= relativeTolerance * scale,
    `${message}: ${actual} differs from ${expected} beyond ${relativeTolerance} relative`,
  );
}

function state(nodeId, dof, behavior, purpose) {
  return {
    declarationId: `C-${nodeId}-${dof}-${purpose}`,
    kind: 'NODAL_RESTRAINT',
    nodeId,
    dof,
    behavior,
  };
}

function fixed(nodeId, dof, purpose) {
  return state(nodeId, dof, 'FIXED', purpose);
}

function inactive(nodeId, dof) {
  return state(nodeId, dof, INACTIVE_ANALYSIS_DOF_BEHAVIOR, 'PLANAR-XZ');
}

function simplySupportedConstraints() {
  return [
    fixed(LEFT_NODE, 'UX', 'PIN'),
    fixed(LEFT_NODE, 'UY', 'PIN'),
    fixed(LEFT_NODE, 'UZ', 'PIN'),
    fixed(RIGHT_NODE, 'UZ', 'ROLLER'),
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

function gravityPrimitive(includedMassSources = ['PIPE_WALL']) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: GRAVITY_PRIMITIVE_ID,
    kind: 'GRAVITY',
    // M007's frozen expansion convention is -direction * rho * A * g.
    // Declaring +Z therefore produces the benchmark's physical downward -Z UDL.
    direction: { x: 0, y: 0, z: 1 },
    basis: 'GLOBAL',
    includedMassSources,
    sourceEvidence: {
      sourceId: 'LFEA-B3.8-GRAVITY-DECLARATION',
      sourceRevision: '01',
      sourceSemanticHash: 'fnv1a64:3838383838383838',
    },
  };
}

function zeroNodalPrimitive() {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: 'LP-B39-ZERO-NODAL',
    kind: 'NODAL_FORCE_MOMENT',
    nodeId: MID_NODE,
    basis: { kind: 'GLOBAL' },
    force: { fx: 0, fy: 0, fz: 0 },
    moment: { mx: 0, my: 0, mz: 0 },
    units: { force: 'N', moment: 'N*m', length: 'm' },
    signConvention: 'APPLIED_TO_STRUCTURE',
    sourceEvidence: {
      sourceId: 'LFEA-B3.8-ZERO-CONTROL',
      sourceRevision: '01',
      sourceSemanticHash: 'fnv1a64:3939393939393939',
    },
  };
}

function mechanicalModelInput() {
  return compilerInput({
    modelIdentity: 'SYS-B39-GRAVITY-SELF-WEIGHT',
    constraintDeclarations: simplySupportedConstraints(),
  });
}

function physicalLoadCaseInput(primitives, overrides = {}) {
  return {
    loadCaseId: 'LC-B39-GRAVITY-SELF-WEIGHT',
    loadCaseClass: 'WEIGHT',
    presentation: {
      label: 'PIPE_WALL gravity self-weight',
      description: 'Gravity-only closed-form benchmark derived from rho * A * g.',
    },
    primitives,
    profile: loadCaseProfile(),
    ...overrides,
  };
}

function compileDeclaredLoadCase(compilation, primitives, overrides = {}) {
  return compilePhysicalLoadCase({
    ...physicalLoadCaseInput(primitives, overrides),
    modelReference: modelReferenceFromCompilation(compilation),
  });
}

function sourceRequest() {
  const input = mechanicalModelInput();
  const previewCompilation = compileMechanicalModel(input);
  const previewLoadCase = compileDeclaredLoadCase(previewCompilation, [gravityPrimitive()]);
  return {
    schema: 'linear-piping-source-analysis-request/v1',
    analysisIdentity: 'ANALYSIS-B39-GRAVITY-SELF-WEIGHT',
    analysisRevision: 1,
    mechanicalModelInput: input,
    physicalLoadCaseInput: physicalLoadCaseInput([gravityPrimitive()]),
    frameElements: frameElements(),
    pipingComponents: [],
    solverProfile: solverProfile(),
    recoveryProfile: recoveryProfile(),
    expectedSourceAuthorities: deriveLinearPipingSourceAuthoritySet({
      compilation: previewCompilation,
      loadCase: previewLoadCase,
    }),
  };
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

const request = sourceRequest();
const previewCompilation = compileMechanicalModel(request.mechanicalModelInput);
const materialState = previewCompilation.model.materialStates[0];
const sectionState = previewCompilation.model.sectionStates[0];
const acceleration = request.physicalLoadCaseInput.profile.gravitationalAcceleration.value;
const lineWeight = materialState.massDensity * sectionState.area * acceleration;
const baselineElement = request.frameElements[0];
const elasticModulus = baselineElement.material.elasticModulus;
const secondMoment = baselineElement.section.secondMomentY;

test('B39-T01', 'PIPE_WALL gravity matches simply-supported closed form', () => {
  const context = compileLinearPipingSourceAnalysisContext(request, { factorizationCache: null });
  const { execution, recovery } = context.analysisResult;
  const generated = context.loadCase.primitives.filter((primitive) => primitive.kind === 'DISTRIBUTED_LOAD');
  assert.equal(generated.length, previewCompilation.model.elements.length);
  for (const primitive of generated) {
    assert.equal(primitive.basis, 'GLOBAL');
    assert.equal(primitive.variation, 'UNIFORM');
    assert.deepEqual(primitive.startIntensity, { fx: 0, fy: 0, fz: -lineWeight });
    assert.deepEqual(primitive.endIntensity, primitive.startIntensity);
    assert.match(primitive.sourceEvidence.sourceId, /LFEA-M007-GRAVITY-PIPE-WALL-UDL-V1/u);
    assert.match(primitive.sourceEvidence.sourceSemanticHash, /^fnv1a64:[0-9a-f]{16}$/u);
  }

  const expectedReaction = (lineWeight * SPAN_LENGTH) / 2;
  const expectedMoment = (lineWeight * SPAN_LENGTH ** 2) / 8;
  const expectedDeflection = -(5 * lineWeight * SPAN_LENGTH ** 4)
    / (384 * elasticModulus * secondMoment);
  const leftReaction = reactionAt(execution, LEFT_NODE);
  const rightReaction = reactionAt(execution, RIGHT_NODE);
  const midpointDeflection = displacementAt(execution, MID_NODE);
  const midpointMoments = midspanMomentActions(recovery);

  assertClose(leftReaction, expectedReaction, RELATIVE_TOLERANCE, 'left self-weight reaction');
  assertClose(rightReaction, expectedReaction, RELATIVE_TOLERANCE, 'right self-weight reaction');
  assertClose(Math.abs(midpointMoments.left), expectedMoment, RELATIVE_TOLERANCE, 'left midspan moment');
  assertClose(Math.abs(midpointMoments.right), expectedMoment, RELATIVE_TOLERANCE, 'right midspan moment');
  assertClose(midpointDeflection, expectedDeflection, RELATIVE_TOLERANCE, 'midspan self-weight deflection');

  return {
    density: materialState.massDensity,
    area: sectionState.area,
    acceleration,
    lineWeight,
    reactions: { left: leftReaction, right: rightReaction, expected: expectedReaction },
    moment: { left: midpointMoments.left, right: midpointMoments.right, expectedMagnitude: expectedMoment },
    deflection: { actual: midpointDeflection, expected: expectedDeflection },
  };
});

test('B39-T02', 'Gravity expansion is deterministic and provenance-bound', () => {
  const declared = compileDeclaredLoadCase(previewCompilation, [gravityPrimitive()]);
  const first = expandPipeWallGravitySourceAuthorities({
    compilation: previewCompilation,
    loadCase: declared,
    frameElements: frameElements(),
    pipingComponents: [],
  });
  const second = expandPipeWallGravitySourceAuthorities({
    compilation: previewCompilation,
    loadCase: declared,
    frameElements: frameElements(),
    pipingComponents: [],
  });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.generatedPrimitives.length, 2);
  assert.equal(first.derivations.length, 2);
  first.derivations.forEach((entry) => {
    assert.equal(entry.gravity.primitiveId, GRAVITY_PRIMITIVE_ID);
    assert.equal(entry.material.massDensity, materialState.massDensity);
    assert.equal(entry.section.area, sectionState.area);
    assert.equal(entry.lineWeight, lineWeight);
  });
  first.frameElements.forEach((element) => {
    assert.equal(element.appliedLoads.length, 1);
    assert.equal(element.appliedLoads[0].kind, 'DISTRIBUTED_LOAD');
  });
  return {
    loadCaseSemanticHash: first.loadCase.semanticHash,
    elementSemanticHashes: first.frameElements.map((entry) => entry.semanticHash),
    derivationHashes: first.generatedPrimitives.map((entry) => entry.sourceEvidence.sourceSemanticHash),
  };
});

test('B39-T03', 'Missing declared CONTENTS weight fails closed without partial PIPE_WALL application', () => {
  const declared = compileDeclaredLoadCase(
    previewCompilation,
    [gravityPrimitive(['PIPE_WALL', 'CONTENTS'])],
  );
  const originalVectors = frameElements().map((entry) => [...entry.equivalentLoadVector.global]);
  assert.throws(
    () => expandPipeWallGravitySourceAuthorities({
      compilation: previewCompilation,
      loadCase: declared,
      frameElements: frameElements(),
      pipingComponents: [],
    }),
    (error) => error?.code === GRAVITY_DISTRIBUTED_WEIGHT_MISSING_CODE,
  );
  assert.deepEqual(
    frameElements().map((entry) => entry.equivalentLoadVector.global),
    originalVectors,
  );
  return { errorCode: GRAVITY_DISTRIBUTED_WEIGHT_MISSING_CODE };
});

test('B39-T04', 'No PIPE_WALL gravity declaration produces exactly zero gravity contribution', () => {
  const elements = frameElements();
  const declared = compileDeclaredLoadCase(
    previewCompilation,
    [zeroNodalPrimitive()],
    { loadCaseId: 'LC-B39-NO-GRAVITY', loadCaseClass: 'APPLIED_MECHANICAL' },
  );
  const expanded = expandPipeWallGravitySourceAuthorities({
    compilation: previewCompilation,
    loadCase: declared,
    frameElements: elements,
    pipingComponents: [],
  });
  assert.equal(expanded.generatedPrimitives.length, 0);
  assert.equal(expanded.loadCase.semanticHash, declared.semanticHash);
  assert.deepEqual(
    expanded.frameElements.map((entry) => entry.semanticHash),
    elements.map((entry) => entry.semanticHash),
  );
  assert.deepEqual(
    expanded.frameElements.map((entry) => entry.equivalentLoadVector.global),
    elements.map((entry) => entry.equivalentLoadVector.global),
  );
  return { generatedPrimitiveCount: 0 };
});

console.log(JSON.stringify({
  check: 'lfea-b3.9-gravity-self-weight',
  status: 'PASS',
  tolerance: RELATIVE_TOLERANCE,
  spanLength: SPAN_LENGTH,
  results,
}));
