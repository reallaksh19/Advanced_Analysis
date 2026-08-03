#!/usr/bin/env node

/**
 * LFEA B-4.1 closed-form B31.3 combined member-stress benchmark.
 *
 * Exercises one straight NPS6 Sch40 / A106B frame element through the real
 * B-2.5 -> B-3.0 -> B-3.1 -> B-3.3 -> B-3.4 -> B-4.0 chain. The code-engine
 * actuals always come from compileCodeResult; only the expected values are
 * independently derived from the recovered fixed-end action and the real
 * sectionMechanicalProperties accessor.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FRAME_LOCAL_AXIS_PROFILE } from '../src/core/centerline-beam-fea/index.js';
import {
  compileCodeResult,
  sectionMechanicalProperties,
} from '../src/core/linear-fea-b31-code-engine/index.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
import {
  compilePhysicalLoadCase,
  modelReferenceFromCompilation,
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
  loadCaseProfile,
  solverProfile,
} from './lfea-b3.3-solver-fixtures.mjs';
import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';
import {
  COLD_TEMPERATURE,
  codeProfile,
  editionDataset,
  stressFactorSet,
} from './lfea-b4.0-code-engine-fixtures.mjs';

const RELATIVE_TOLERANCE = 1e-8;
const SPAN_LENGTH = 2.4;
const ROOT_NODE = 'N-B41-ROOT';
const TIP_NODE = 'N-B41-TIP';
const ELEMENT_ID = 'E-B41-001';
const COMPONENT_ID = 'PIPE-B41';
const CODE_POINT_ID = 'CP-B41-FIXED';
const TIP_FORCE = Object.freeze({ fx: 1200, fy: 1500, fz: -900 });
const TIP_MOMENT = Object.freeze({ mx: 340, my: 0, mz: 0 });
const PRESSURE_STRESS_CONTRIBUTION = Object.freeze({
  value: 0,
  source: 'no pressure load in this benchmark',
});

// LEGAL/SPEC BOUNDARY: the imported EditionDataset values are explicitly
// FIXTURE-EDITION-DATASET-NOT-ASME. This benchmark verifies only generic
// mechanical stress-combination arithmetic, never a licensed ASME value.
const RAW_FIXTURE_NUMERIC_INPUTS = Object.freeze([
  RELATIVE_TOLERANCE,
  SPAN_LENGTH,
  TIP_FORCE.fx,
  TIP_FORCE.fy,
  TIP_FORCE.fz,
  TIP_MOMENT.mx,
  TIP_MOMENT.my,
  TIP_MOMENT.mz,
  PRESSURE_STRESS_CONTRIBUTION.value,
]);
const results = [];

function test(id, name, body) {
  const evidence = body();
  results.push(Object.freeze({ id, name, ...evidence }));
}

function assertClose(actual, expected, relativeTolerance, message, referenceScale = Math.abs(expected)) {
  const scale = Math.max(Math.abs(expected), referenceScale, 1e-300);
  assert.ok(
    Math.abs(actual - expected) <= relativeTolerance * scale,
    `${message}: ${actual} differs from ${expected} beyond ${relativeTolerance} relative to ${scale}`,
  );
}

function fixedRootConstraints() {
  return ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => ({
    declarationId: `C-${ROOT_NODE}-${dof}-FIXED`,
    kind: 'NODAL_RESTRAINT',
    nodeId: ROOT_NODE,
    dof,
    behavior: 'FIXED',
  }));
}

function singleSpanConditionedTopology() {
  return {
    geometry: {
      schemaVersion: 'canonical-geometry-v1',
      nodes: [
        {
          id: 'B41/ROOT', x: 0, y: 0, z: 0,
          restraint: 'ANCHOR', sourceComponentUid: COMPONENT_ID, meta: {},
        },
        {
          id: 'B41/TIP', x: SPAN_LENGTH, y: 0, z: 0,
          restraint: 'FREE', sourceComponentUid: COMPONENT_ID, meta: {},
        },
      ],
      segments: [{
        id: 'B41/SPAN',
        startNodeId: 'B41/ROOT',
        endNodeId: 'B41/TIP',
        type: 'PIPE',
        sourceComponentUid: COMPONENT_ID,
      }],
      source: 'fixture',
      unit: 'm',
      diagnostics: [],
      summary: {},
    },
    semanticHash: 'fnv1a64:4141414141414141',
  };
}

function benchmarkCompilation() {
  return compileMechanicalModel(compilerInput({
    modelIdentity: 'SYS-B41-CODE-STRESS',
    conditionedTopology: singleSpanConditionedTopology(),
    nodeBindings: [
      { nodeId: ROOT_NODE, conditionedNodeId: 'CN-B41-ROOT', topologyNodeId: 'B41/ROOT' },
      { nodeId: TIP_NODE, conditionedNodeId: 'CN-B41-TIP', topologyNodeId: 'B41/TIP' },
    ],
    elementBindings: [{
      elementId: ELEMENT_ID,
      conditionedSegmentId: 'CS-B41-001',
      topologySegmentId: 'B41/SPAN',
      materialStateId: 'MAT-A106B-393K',
      sectionStateId: 'SEC-NPS6-SCH40',
      formulationId: 'PIPE_FRAME3D_LINEAR_V1',
      localAxisEvidenceIdentity: 'AXIS-B41-001',
      sourceComponentId: COMPONENT_ID,
    }],
    localAxisResults: [{
      evidenceIdentity: 'AXIS-B41-001',
      result: axisResult([0, 0, 0], [SPAN_LENGTH, 0, 0]),
    }],
    constraintDeclarations: fixedRootConstraints(),
  }));
}

function benchmarkFrameElement() {
  return compileFrameElement({
    elementId: ELEMENT_ID,
    material: materialResolution(),
    section: sectionResolution(),
    localAxes: {
      result: axisResult([0, 0, 0], [SPAN_LENGTH, 0, 0]),
      profile: FRAME_LOCAL_AXIS_PROFILE,
    },
    profile: frameElementProfile(),
    distributedLoads: [],
    temperature: null,
    releases: [],
    endSprings: [],
    rigidOffsets: null,
  });
}

function benchmarkLoadCase(compilation) {
  return compilePhysicalLoadCase({
    loadCaseId: 'LC-B41-COMBINED-TIP',
    loadCaseClass: 'APPLIED_MECHANICAL',
    presentation: {
      label: 'B4.1 combined straight-pipe tip load',
      description: 'Axial force, biaxial bending and torsion for closed-form stress verification.',
    },
    modelReference: modelReferenceFromCompilation(compilation),
    primitives: [{
      schema: 'fea-linear-load-primitive/v1',
      primitiveId: 'LP-B41-COMBINED-TIP',
      kind: 'NODAL_FORCE_MOMENT',
      nodeId: TIP_NODE,
      basis: { kind: 'GLOBAL' },
      force: TIP_FORCE,
      moment: TIP_MOMENT,
      units: { force: 'N', moment: 'N*m', length: 'm' },
      signConvention: 'APPLIED_TO_STRUCTURE',
      sourceEvidence: {
        sourceId: 'LFEA-B4.1-CLOSED-FORM-BENCHMARK',
        sourceRevision: '01',
        sourceSemanticHash: 'fnv1a64:4242424242424242',
      },
    }],
    profile: loadCaseProfile(),
  });
}

function solveAndRecover() {
  const compilation = benchmarkCompilation();
  const frameElement = benchmarkFrameElement();
  const loadCase = benchmarkLoadCase(compilation);
  const execution = compileSolverExecution({
    compilation,
    elementContributions: [elementContributionFromFrameElement(frameElement)],
    loadCase,
    solverProfile: solverProfile(),
  });
  assert.equal(execution.status, 'QUALIFIED');
  const recovery = compileResultRecovery({
    compilation,
    execution,
    loadCase,
    frameElements: [frameElement],
    pipingComponents: [],
    recoveryProfile: recoveryProfile(),
  });
  const elementAction = recovery.elementActions.find((entry) => entry.elementId === ELEMENT_ID);
  assert.notEqual(elementAction, undefined);
  const localAction = elementAction.local.I;
  const globalAction = elementAction.global.I;
  return { compilation, frameElement, loadCase, execution, recovery, localAction, globalAction };
}

function reactionAt(execution, dof) {
  return execution.reactions.find((entry) => entry.nodeId === ROOT_NODE && entry.dof === dof).value;
}

function verifyStatics(solved) {
  const expected = {
    fx: -TIP_FORCE.fx,
    fy: -TIP_FORCE.fy,
    fz: -TIP_FORCE.fz,
    mx: -TIP_MOMENT.mx,
    my: SPAN_LENGTH * TIP_FORCE.fz - TIP_MOMENT.my,
    mz: -SPAN_LENGTH * TIP_FORCE.fy - TIP_MOMENT.mz,
  };
  const dofByField = { fx: 'UX', fy: 'UY', fz: 'UZ', mx: 'RX', my: 'RY', mz: 'RZ' };
  for (const field of Object.keys(expected)) {
    assertClose(
      reactionAt(solved.execution, dofByField[field]),
      expected[field],
      RELATIVE_TOLERANCE,
      `root ${field} reaction from closed-form statics`,
    );
    assertClose(
      solved.globalAction[field],
      expected[field],
      RELATIVE_TOLERANCE,
      `recovered root ${field} global action`,
    );
  }
  for (const field of ['fx', 'mx', 'my', 'mz']) {
    assert.equal(
      RAW_FIXTURE_NUMERIC_INPUTS.includes(solved.localAction[field]),
      false,
      `recovered local ${field} must not be a raw fixture numeric input`,
    );
  }
  return expected;
}

function packageRegistrationEvidence() {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(
    packageJson.scripts['check:lfea-b4.1'],
    'node scripts/lfea-b4.1-code-engine-closed-form-check.mjs',
  );
  const linearCore = packageJson.scripts['check:lfea-linear-core'];
  const b40Index = linearCore.indexOf('npm run check:lfea-b4.0');
  const b41Index = linearCore.indexOf('npm run check:lfea-b4.1');
  const consumerIndex = linearCore.indexOf('npm run check:linear-piping-analysis-consumer');
  assert.ok(b40Index >= 0, 'check:lfea-linear-core must include check:lfea-b4.0');
  assert.ok(b41Index > b40Index, 'check:lfea-b4.1 must appear after check:lfea-b4.0');
  assert.ok(
    consumerIndex > b41Index,
    'check:lfea-b4.1 must appear before check:linear-piping-analysis-consumer',
  );
  return Object.freeze({ b40Index, b41Index, consumerIndex });
}

function expectedStress(localAction, mechanicalProperties, pressureValue) {
  const stressTerms = Object.freeze({
    pressure: pressureValue,
    axial: localAction.fx / mechanicalProperties.area,
    torsional: localAction.mx / mechanicalProperties.polarSectionModulus,
    inPlaneBending: localAction.my / mechanicalProperties.sectionModulus,
    outOfPlaneBending: localAction.mz / mechanicalProperties.sectionModulus,
  });
  const calculatedStress = Math.abs(stressTerms.axial + stressTerms.pressure)
    + Math.sqrt(
      stressTerms.inPlaneBending ** 2
      + stressTerms.outOfPlaneBending ** 2
      + stressTerms.torsional ** 2,
    );
  return Object.freeze({ stressTerms, calculatedStress });
}

const solved = solveAndRecover();
const statics = verifyStatics(solved);
const acceptedSectionResolution = sectionResolution();
const mechanicalProperties = sectionMechanicalProperties(
  solved.frameElement.section,
  acceptedSectionResolution,
);
const factorSet = stressFactorSet({
  factorSetId: 'SF-B41-STRAIGHT-PIPE',
  componentId: COMPONENT_ID,
});
const profile = codeProfile();
const dataset = editionDataset();
const packageRegistration = packageRegistrationEvidence();

function compileCategory(category) {
  return compileCodeResult({
    codeProfile: profile,
    editionDataset: dataset,
    stressFactorSet: factorSet,
    category,
    codePointId: CODE_POINT_ID,
    componentId: COMPONENT_ID,
    combinationId: `COMB-B41-${category}`,
    frameElementRecord: solved.frameElement,
    sectionResolution: acceptedSectionResolution,
    materialResolution: materialResolution(),
    localAction: solved.localAction,
    pressureStressContribution: category === 'DISPLACEMENT_STRESS_RANGE'
      ? null
      : PRESSURE_STRESS_CONTRIBUTION,
    coldTemperature: category === 'DISPLACEMENT_STRESS_RANGE'
      ? { value: COLD_TEMPERATURE, source: 'FIXTURE-EDITION-DATASET-NOT-ASME' }
      : null,
    occasionalCategoryId: category === 'OCCASIONAL' ? 'WIND_FIXTURE' : null,
  });
}

function verifyCategory(category, pressureValue) {
  const actual = compileCategory(category);
  const expected = expectedStress(solved.localAction, mechanicalProperties, pressureValue);
  const referenceScale = expected.calculatedStress;
  for (const field of Object.keys(expected.stressTerms)) {
    assertClose(
      actual.stressTerms[field],
      expected.stressTerms[field],
      RELATIVE_TOLERANCE,
      `${category} ${field} stress term`,
      referenceScale,
    );
  }
  assertClose(
    actual.calculatedStress,
    expected.calculatedStress,
    RELATIVE_TOLERANCE,
    `${category} calculated stress`,
  );
  assert.equal(actual.factors.axialIndex, 1);
  assert.equal(actual.factors.torsionalIndex, 1);
  assert.equal(actual.factors.inPlaneSif, 1);
  assert.equal(actual.factors.outOfPlaneSif, 1);
  return Object.freeze({
    category,
    recoveredLocalAction: Object.freeze({
      fx: solved.localAction.fx,
      mx: solved.localAction.mx,
      my: solved.localAction.my,
      mz: solved.localAction.mz,
    }),
    stressTerms: actual.stressTerms,
    expectedStressTerms: expected.stressTerms,
    calculatedStress: actual.calculatedStress,
    expectedCalculatedStress: expected.calculatedStress,
    allowableStress: actual.allowableStress,
    utilization: actual.utilization,
    status: actual.status,
  });
}

test('B41-T01', 'SUSTAINED combined member stress matches independent closed form', () => (
  verifyCategory('SUSTAINED', PRESSURE_STRESS_CONTRIBUTION.value)
));

test('B41-T02', 'OCCASIONAL combined member stress matches independent closed form', () => (
  verifyCategory('OCCASIONAL', PRESSURE_STRESS_CONTRIBUTION.value)
));

test('B41-T03', 'DISPLACEMENT_STRESS_RANGE excludes pressure and matches independent closed form', () => {
  const evidence = verifyCategory('DISPLACEMENT_STRESS_RANGE', 0);
  assert.equal(evidence.stressTerms.pressure, 0);
  return evidence;
});

test('B41-T04', 'Non-compliance categories retain their documented refusal codes', () => {
  const refusals = Object.freeze({
    OPERATING: 'CODE_ENGINE_OPERATING_NOT_A_COMPLIANCE_CATEGORY',
    USER_PROJECT_CHECK: 'CODE_ENGINE_USER_PROJECT_CHECK_NOT_A_COMPLIANCE_CATEGORY',
  });
  for (const [category, expectedCode] of Object.entries(refusals)) {
    assert.throws(
      () => compileCategory(category),
      (error) => error?.code === expectedCode,
      `${category} must throw ${expectedCode}`,
    );
  }
  return { refusals };
});

console.log(JSON.stringify({
  check: 'lfea-b4.1-code-engine-closed-form',
  status: 'PASS',
  tolerance: RELATIVE_TOLERANCE,
  spanLength: SPAN_LENGTH,
  executionStatus: solved.execution.status,
  mechanicalProperties,
  closedFormGlobalStatics: statics,
  packageRegistration,
  results,
}));
