#!/usr/bin/env node

/**
 * LFEA B-4.2 PRESSURE -> sustained/occasional longitudinal stress checks.
 *
 * Drives a sealed B-3.0 PRESSURE primitive through the real reducer solve,
 * B-3.4 code-point recovery and linear-piping B31 application. Actual pressure
 * and combined-stress values come only from the production application path;
 * expected values use the retained B-2.3 OD/thickness and recovered action.
 */

import assert from 'node:assert/strict';
import { sectionMechanicalProperties } from '../src/core/linear-fea-b31-code-engine/index.js';
import {
  deriveLinearPipingParentSet,
  runLinearPipingAnalysis,
} from '../src/core/linear-piping-analysis-consumer/index.js';
import {
  B31_APPLICATION_REQUEST_SCHEMA,
  compileLinearPipingB31Application,
} from '../src/core/linear-piping-code-application/index.js';
import {
  PRESSURE_EFFECT_NOT_IMPLEMENTED_CODE,
  PRESSURE_STRESS_CONFLICT_CODE,
} from '../src/core/linear-piping-code-application/pressure-stress-derivation.js';
import {
  codeProfile,
  editionDataset,
  reducerFrameElementE1,
  reducerMaterialResolution,
  reducerSectionResolutionE1,
  stressFactorSet,
} from './lfea-b4.0-code-engine-fixtures.mjs';
import {
  recoveryProfile,
  reducerCompilation,
  reducerComponent,
  reducerTipLoadCase,
  reducerTipLoadPrimitive,
  solverProfile,
} from './lfea-b3.4-recovery-fixtures.mjs';

const RELATIVE_TOLERANCE = 1e-8;
const PRESSURE = 4_000_000;
const ELEMENT_ID = 'RED-001.E1';
const COMPONENT_ID = 'RED-001';
const CODE_POINT_ID = 'RED-001.S1';
const results = [];

function test(id, name, body) {
  results.push(Object.freeze({ id, name, ...body() }));
}

function assertClose(actual, expected, relativeTolerance, message, referenceScale = Math.abs(expected)) {
  const scale = Math.max(Math.abs(expected), referenceScale, 1e-300);
  assert.ok(
    Math.abs(actual - expected) <= relativeTolerance * scale,
    `${message}: ${actual} differs from ${expected} beyond ${relativeTolerance} relative to ${scale}`,
  );
}

function pressurePrimitive(authorizedEffects = {}, overrides = {}) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: 'LP-B42-PRESSURE-RED-E1',
    kind: 'PRESSURE',
    elementId: ELEMENT_ID,
    pressure: PRESSURE,
    pressureBasis: 'GAUGE',
    authorizedEffects: {
      codeStress: true,
      pressureStiffening: false,
      axialThrust: false,
      bourdon: false,
      ...authorizedEffects,
    },
    sourceEvidence: {
      sourceId: 'LFEA-B4.2-PRESSURE-REGISTER',
      sourceRevision: '01',
      sourceSemanticHash: 'fnv1a64:4343434343434343',
    },
    ...overrides,
  };
}

function pressureLoadCase(compilation, authorizedEffects = {}, overrides = {}) {
  return reducerTipLoadCase(compilation, {
    loadCaseId: 'LC-B42-PRESSURE-TIP',
    presentation: {
      label: 'Reducer tip load plus internal gauge pressure',
      description: 'Combined mechanical load and code-stress-authorized PRESSURE state.',
    },
    primitives: [
      reducerTipLoadPrimitive(),
      pressurePrimitive(authorizedEffects),
    ],
    ...overrides,
  });
}

function analysisFor(compilation, component, loadCase, identity) {
  const parentInput = {
    compilation,
    loadCase,
    frameElements: [],
    pipingComponents: [component],
    solverProfile: solverProfile(),
    recoveryProfile: recoveryProfile(),
  };
  return runLinearPipingAnalysis({
    schema: 'linear-piping-analysis-request/v1',
    analysisIdentity: identity,
    analysisRevision: 1,
    ...parentInput,
    expectedParents: deriveLinearPipingParentSet(parentInput),
  }, { factorizationCache: null });
}

function recoveredCodePoint(analysis) {
  return analysis.recovery.componentResultants
    .find((entry) => entry.componentId === COMPONENT_ID)
    .codePoints.find((entry) => entry.stationId === CODE_POINT_ID);
}

function expectedStress(analysis, frameElement, sectionResolution, pressureValue) {
  const point = recoveredCodePoint(analysis);
  const mechanicalProperties = sectionMechanicalProperties(frameElement.section, sectionResolution);
  const stressTerms = Object.freeze({
    pressure: pressureValue,
    axial: point.local.fx / mechanicalProperties.area,
    torsional: point.local.mx / mechanicalProperties.polarSectionModulus,
    inPlaneBending: point.local.my / mechanicalProperties.sectionModulus,
    outOfPlaneBending: point.local.mz / mechanicalProperties.sectionModulus,
  });
  const calculatedStress = Math.abs(stressTerms.axial + stressTerms.pressure)
    + Math.sqrt(
      stressTerms.inPlaneBending ** 2
      + stressTerms.outOfPlaneBending ** 2
      + stressTerms.torsional ** 2,
    );
  return Object.freeze({ point, mechanicalProperties, stressTerms, calculatedStress });
}

function b31Request({
  loadCase,
  analysis,
  frameElement,
  sectionResolution,
  category = 'SUSTAINED',
  pressureStressContribution = null,
  checkId = `B42-${category}`,
}) {
  return {
    schema: B31_APPLICATION_REQUEST_SCHEMA,
    applicationId: `B31-APP-${checkId}`,
    codeProfile: codeProfile(),
    editionDataset: editionDataset(),
    cases: [{ caseId: 'CASE', loadCase, recovery: analysis.recovery }],
    checks: [{
      checkId,
      category,
      codePointId: CODE_POINT_ID,
      componentId: COMPONENT_ID,
      combinationId: loadCase.loadCaseId,
      actionSource: { kind: 'SINGLE_CASE', caseId: 'CASE' },
      frameElementRecord: frameElement,
      sectionResolution,
      materialResolution: reducerMaterialResolution(),
      stressFactorSet: stressFactorSet(),
      pressureStressContribution,
      coldTemperature: null,
      occasionalCategoryId: category === 'OCCASIONAL' ? 'WIND_FIXTURE' : null,
    }],
  };
}

function verifyAutomaticCategory(context, category) {
  const application = compileLinearPipingB31Application(b31Request({
    ...context,
    category,
    checkId: `B42-AUTO-${category}`,
  }));
  const actual = application.results[0].codeResult;
  const expected = expectedStress(
    context.analysis,
    context.frameElement,
    context.sectionResolution,
    context.expectedPressureStress,
  );
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
  return {
    category,
    pressureStress: actual.stressTerms.pressure,
    expectedPressureStress: context.expectedPressureStress,
    recoveredLocalAction: expected.point.local,
    stressTerms: actual.stressTerms,
    expectedStressTerms: expected.stressTerms,
    calculatedStress: actual.calculatedStress,
    expectedCalculatedStress: expected.calculatedStress,
  };
}

const compilation = reducerCompilation();
const component = reducerComponent();
const frameElement = reducerFrameElementE1(component);
const sectionResolution = reducerSectionResolutionE1();
const pressureCase = pressureLoadCase(compilation);
const pressureAnalysis = analysisFor(compilation, component, pressureCase, 'ANALYSIS-B42-PRESSURE');
const expectedPressureStress = (PRESSURE * sectionResolution.dimensions.outerDiameter)
  / (4 * sectionResolution.dimensions.wallThickness);
const pressureContext = {
  loadCase: pressureCase,
  analysis: pressureAnalysis,
  frameElement,
  sectionResolution,
  expectedPressureStress,
};

test('B42-T01', 'SUSTAINED derives pressure stress through the real B31 application', () => (
  verifyAutomaticCategory(pressureContext, 'SUSTAINED')
));

test('B42-T02', 'OCCASIONAL derives the same physical pressure contribution', () => (
  verifyAutomaticCategory(pressureContext, 'OCCASIONAL')
));

test('B42-T03', 'A conflicting explicit pressure contribution fails closed', () => {
  const supplied = {
    value: expectedPressureStress + 1,
    source: 'LFEA-B4.2-DELIBERATE-CONFLICT',
  };
  assert.throws(
    () => compileLinearPipingB31Application(b31Request({
      ...pressureContext,
      pressureStressContribution: supplied,
      checkId: 'B42-CONFLICT',
    })),
    (error) => {
      assert.equal(error?.code, PRESSURE_STRESS_CONFLICT_CODE);
      assert.equal(error?.evidence?.supplied?.value, supplied.value);
      assert.equal(error?.evidence?.derived?.value, expectedPressureStress);
      return true;
    },
  );
  return { errorCode: PRESSURE_STRESS_CONFLICT_CODE, supplied, expectedPressureStress };
});

test('B42-T04', 'Unimplemented authorized pressure effects are blocking limitations', () => {
  const loadCase = pressureLoadCase(
    compilation,
    { pressureStiffening: true, axialThrust: true },
    {
      loadCaseId: 'LC-B42-UNIMPLEMENTED-EFFECTS',
      primitives: [
        reducerTipLoadPrimitive(),
        pressurePrimitive(
          { pressureStiffening: true, axialThrust: true },
          { primitiveId: 'LP-B42-PRESSURE-UNIMPLEMENTED' },
        ),
      ],
    },
  );
  const analysis = analysisFor(compilation, component, loadCase, 'ANALYSIS-B42-UNIMPLEMENTED');
  assert.throws(
    () => compileLinearPipingB31Application(b31Request({
      loadCase,
      analysis,
      frameElement,
      sectionResolution,
      checkId: 'B42-UNIMPLEMENTED',
    })),
    (error) => {
      assert.equal(error?.code, PRESSURE_EFFECT_NOT_IMPLEMENTED_CODE);
      assert.deepEqual(
        error?.evidence?.limitations?.map((entry) => entry.effect),
        ['pressureStiffening', 'axialThrust'],
      );
      error.evidence.limitations.forEach((entry) => assert.equal(entry.status, 'BLOCKED'));
      return true;
    },
  );
  return {
    errorCode: PRESSURE_EFFECT_NOT_IMPLEMENTED_CODE,
    effects: ['pressureStiffening', 'axialThrust'],
  };
});

test('B42-T05', 'No PRESSURE primitive preserves explicit caller-supplied behavior', () => {
  const loadCase = reducerTipLoadCase(compilation, {
    loadCaseId: 'LC-B42-NO-PRESSURE',
    presentation: {
      label: 'No pressure control',
      description: 'Regression control for the existing explicit contribution path.',
    },
  });
  const analysis = analysisFor(compilation, component, loadCase, 'ANALYSIS-B42-NO-PRESSURE');
  const supplied = { value: 5_000_000, source: 'LFEA-B4.2-EXPLICIT-CONTROL' };
  const application = compileLinearPipingB31Application(b31Request({
    loadCase,
    analysis,
    frameElement,
    sectionResolution,
    pressureStressContribution: supplied,
    checkId: 'B42-NO-PRESSURE',
  }));
  const actual = application.results[0].codeResult.stressTerms.pressure;
  assert.equal(actual, supplied.value);
  return { supplied, actual };
});

console.log(JSON.stringify({
  check: 'lfea-b4.2-pressure-stress-derivation',
  status: 'PASS',
  tolerance: RELATIVE_TOLERANCE,
  formula: 'S = P * Do / (4 * t)',
  pressure: PRESSURE,
  outerDiameter: sectionResolution.dimensions.outerDiameter,
  wallThickness: sectionResolution.dimensions.wallThickness,
  expectedPressureStress,
  results,
}));
