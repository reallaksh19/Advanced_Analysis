#!/usr/bin/env node

/**
 * LFEA B-4.1 closed-form B31.3 combined member-stress benchmark.
 *
 * Exercises one straight NPS6 Sch40 / A106B frame element through the real
 * B-2.5 -> B-3.0 -> B-3.1 -> B-3.3 -> B-3.4 -> B-4.0 chain. The code-engine
 * actuals always come from compileCodeResult; only the expected values are
 * independently derived from the recovered fixed-end action and the real
 * sectionMechanicalProperties accessor.
 *
 * M019 additionally reproduces two independently published Appendix S
 * Example 3 stress-range rows through the same production code-result path.
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
  PIPE_SECTION_FORMULATION_ID,
  PIPE_SECTION_PROFILE,
  PIPE_SECTION_REQUEST_SCHEMA,
  computePipeSectionRequestSemanticHash,
  resolvePipeSection,
} from '../src/core/linear-fea-section/index.js';
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
const APPENDIX_S_RELATIVE_TOLERANCE = 1e-3;
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

/* ASME B31.3-2006 Appendix S Example 3, Tables S303.3/S303.7.1. */
const APPENDIX_S_WALL_THICKNESS = 0.00953;
const APPENDIX_S_NPS20_OUTER_DIAMETER = 0.5080;
const APPENDIX_S_NPS24_OUTER_DIAMETER = 0.6096;
const APPENDIX_S_NPS20_RESULTANT = Object.freeze({
  fx: 78_485, fy: 0, fz: 0, mx: 0, my: 45_900, mz: 0,
});
const APPENDIX_S_NPS20_PUBLISHED_STRESS = 25_155_000;
const APPENDIX_S_TEE_RESULTANT = Object.freeze({
  fx: 0, fy: 0, fz: 0, mx: 0, my: 147_470, mz: 0,
});
const APPENDIX_S_TEE_IN_PLANE_SIF = 3.415546199106908;
const APPENDIX_S_TEE_OUT_OF_PLANE_SIF = 4.220728265475877;
const APPENDIX_S_TEE_PUBLISHED_STRESS = 189_945_000;

// LEGAL/SPEC BOUNDARY: the imported EditionDataset values are explicitly
// FIXTURE-EDITION-DATASET-NOT-ASME. This benchmark verifies only generic
// mechanical stress-combination arithmetic. The two M019 resultants, section
// dimensions, SIF and published comparison values are individually traced to
// Appendix S/Table S303.7.1 and Appendix D; no allowable-stress table is copied.
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

function expectedStress(category, localAction, mechanicalProperties, pressureValue) {
  const isRangeCategory = category === 'DISPLACEMENT_STRESS_RANGE'
    || category === 'EXPANSION_RANGE_ENVELOPE';
  const stressTerms = Object.freeze({
    pressure: pressureValue,
    axial: isRangeCategory ? 0 : localAction.fx / mechanicalProperties.area,
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

function appendixSection(sectionStateId, outerDiameter, sourceHash) {
  const payload = {
    schema: PIPE_SECTION_REQUEST_SCHEMA,
    sectionStateId,
    formulationId: PIPE_SECTION_FORMULATION_ID,
    outerDiameter,
    wallThickness: APPENDIX_S_WALL_THICKNESS,
    sourceEvidence: {
      sourceId: 'ASME-B31-3-2006-APPENDIX-S-TABLE-S303-3',
      sourceRevision: `${sectionStateId}-OD-${outerDiameter}-T-${APPENDIX_S_WALL_THICKNESS}`,
      sourceSemanticHash: sourceHash,
    },
  };
  return resolvePipeSection({
    request: {
      ...payload,
      semanticHash: computePipeSectionRequestSemanticHash(payload),
    },
    profile: PIPE_SECTION_PROFILE,
  });
}

function appendixFrameElement(elementId, section) {
  return compileFrameElement({
    elementId,
    material: materialResolution(),
    section,
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

function appendixRangeFactorSet(componentId, inPlaneSif, outOfPlaneSif) {
  const appendixDSource = 'ASME B31.3-2006 Appendix D Table D300 welding tee';
  return stressFactorSet({
    factorSetId: `SF-${componentId}`,
    componentId,
    displacementSifs: {
      axial: { value: 1, source: 'ASME B31.3-2006 para. 319.4.4 Eq. (17); factor retained as declared evidence' },
      torsional: { value: 1, source: 'ASME B31.3-2006 para. 319.4.4 Eq. (17)' },
      inPlaneBending: { value: inPlaneSif, source: appendixDSource },
      outOfPlaneBending: { value: outOfPlaneSif, source: appendixDSource },
    },
  });
}

function compileAppendixRangeResult({
  componentId,
  section,
  localAction,
  inPlaneSif,
  outOfPlaneSif,
}) {
  const frameElement = appendixFrameElement(`E-${componentId}`, section);
  return {
    frameElement,
    result: compileCodeResult({
      codeProfile: codeProfile(),
      editionDataset: editionDataset(),
      stressFactorSet: appendixRangeFactorSet(componentId, inPlaneSif, outOfPlaneSif),
      category: 'DISPLACEMENT_STRESS_RANGE',
      codePointId: `CP-${componentId}`,
      componentId,
      combinationId: `APPENDIX-S303-CASE-${componentId}`,
      frameElementRecord: frameElement,
      sectionResolution: section,
      materialResolution: materialResolution(),
      localAction,
      pressureStressContribution: null,
      coldTemperature: {
        value: COLD_TEMPERATURE,
        source: 'Fixture allowable lookup only; calculatedStress is independent of this synthetic dataset',
      },
      occasionalCategoryId: null,
    }),
  };
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
  const expected = expectedStress(category, solved.localAction, mechanicalProperties, pressureValue);
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
    resultants: actual.resultants,
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

test('B41-T03', 'DISPLACEMENT_STRESS_RANGE retains axial resultant but excludes axial and pressure stress under Eq. (17)', () => {
  const evidence = verifyCategory('DISPLACEMENT_STRESS_RANGE', 0);
  assert.notEqual(evidence.resultants.axialForce, 0, 'fixture must carry a genuinely nonzero recovered axial force');
  assert.equal(evidence.stressTerms.axial, 0);
  assert.equal(evidence.stressTerms.pressure, 0);
  return evidence;
});

test('B41-T04', 'Appendix S Table S303.7.1 NPS20 pipe row reproduces Eq. (17) without axial stress', () => {
  const section = appendixSection(
    'SEC-M019-APP-S3-NPS20-STD',
    APPENDIX_S_NPS20_OUTER_DIAMETER,
    'fnv1a64:4190000000000020',
  );
  const { frameElement, result } = compileAppendixRangeResult({
    componentId: 'APP-S3-NPS20-PIPE',
    section,
    localAction: APPENDIX_S_NPS20_RESULTANT,
    inPlaneSif: 1,
    outOfPlaneSif: 1,
  });
  const properties = sectionMechanicalProperties(frameElement.section, section);
  const bendingOnly = APPENDIX_S_NPS20_RESULTANT.my / properties.sectionModulus;
  const oldAxialInclusive = Math.abs(APPENDIX_S_NPS20_RESULTANT.fx / properties.area)
    + Math.abs(bendingOnly);
  assert.equal(result.resultants.axialForce, APPENDIX_S_NPS20_RESULTANT.fx);
  assert.equal(result.stressTerms.axial, 0);
  assertClose(result.calculatedStress, bendingOnly, RELATIVE_TOLERANCE, 'NPS20 corrected Eq. (17) stress');
  assertClose(
    result.calculatedStress,
    APPENDIX_S_NPS20_PUBLISHED_STRESS,
    APPENDIX_S_RELATIVE_TOLERANCE,
    'NPS20 Appendix S published S_E',
  );
  assert.ok(oldAxialInclusive > APPENDIX_S_NPS20_PUBLISHED_STRESS * 1.2);
  return {
    area: properties.area,
    sectionModulus: properties.sectionModulus,
    publishedStress: APPENDIX_S_NPS20_PUBLISHED_STRESS,
    correctedStress: result.calculatedStress,
    oldAxialInclusiveStress: oldAxialInclusive,
    relativeDeviation: (result.calculatedStress - APPENDIX_S_NPS20_PUBLISHED_STRESS)
      / APPENDIX_S_NPS20_PUBLISHED_STRESS,
  };
});

test('B41-T05', 'Appendix S Table S303.7.1 NPS24 tee row reproduces the real Appendix D in-plane SIF', () => {
  const section = appendixSection(
    'SEC-M019-APP-S3-NPS24-STD',
    APPENDIX_S_NPS24_OUTER_DIAMETER,
    'fnv1a64:4190000000000024',
  );
  const { frameElement, result } = compileAppendixRangeResult({
    componentId: 'APP-S3-NPS24-TEE',
    section,
    localAction: APPENDIX_S_TEE_RESULTANT,
    inPlaneSif: APPENDIX_S_TEE_IN_PLANE_SIF,
    outOfPlaneSif: APPENDIX_S_TEE_OUT_OF_PLANE_SIF,
  });
  const properties = sectionMechanicalProperties(frameElement.section, section);
  const independentlyExpected = APPENDIX_S_TEE_IN_PLANE_SIF
    * APPENDIX_S_TEE_RESULTANT.my / properties.sectionModulus;
  assert.equal(result.resultants.axialForce, 0);
  assert.equal(result.stressTerms.axial, 0);
  assertClose(result.calculatedStress, independentlyExpected, RELATIVE_TOLERANCE, 'NPS24 tee Eq. (17) stress');
  assertClose(
    result.calculatedStress,
    APPENDIX_S_TEE_PUBLISHED_STRESS,
    APPENDIX_S_RELATIVE_TOLERANCE,
    'NPS24 tee Appendix S published S_E',
  );
  return {
    sectionModulus: properties.sectionModulus,
    inPlaneSif: APPENDIX_S_TEE_IN_PLANE_SIF,
    publishedStress: APPENDIX_S_TEE_PUBLISHED_STRESS,
    correctedStress: result.calculatedStress,
    oldAxialInclusiveStress: result.calculatedStress,
    relativeDeviation: (result.calculatedStress - APPENDIX_S_TEE_PUBLISHED_STRESS)
      / APPENDIX_S_TEE_PUBLISHED_STRESS,
  };
});

test('B41-T06', 'Non-compliance categories retain their documented refusal codes', () => {
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
  appendixSRelativeTolerance: APPENDIX_S_RELATIVE_TOLERANCE,
  spanLength: SPAN_LENGTH,
  executionStatus: solved.execution.status,
  mechanicalProperties,
  closedFormGlobalStatics: statics,
  packageRegistration,
  results,
}));
