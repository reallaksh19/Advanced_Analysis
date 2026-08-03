#!/usr/bin/env node

/** M015 nominal-less-allowances section override and scaling proof. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FRAME_LOCAL_AXIS_PROFILE } from '../src/core/centerline-beam-fea/index.js';
import {
  compileCodeResult,
  sectionMechanicalProperties,
} from '../src/core/linear-fea-b31-code-engine/index.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
import { compileResultRecovery } from '../src/core/linear-fea-result-recovery/index.js';
import {
  compileSolverExecution,
  elementContributionsFromPipingComponent,
} from '../src/core/linear-fea-solver/index.js';
import {
  PIPE_SECTION_FORMULATION_ID,
  PIPE_SECTION_PROFILE,
  PIPE_SECTION_REQUEST_SCHEMA,
  computePipeSectionRequestSemanticHash,
  resolvePipeSection,
} from '../src/core/linear-fea-section/index.js';
import {
  axisResult,
  materialResolution,
} from './lfea-b2.5-model-compiler-fixtures.mjs';
import { eulerBernoulliProfile } from './lfea-b3.1-frame-element-fixtures.mjs';
import { solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import {
  recoveryProfile,
  reducerCompilation,
  reducerComponent,
  reducerTipLoadCase,
  reducerTipLoadPrimitive,
} from './lfea-b3.4-recovery-fixtures.mjs';
import {
  COLD_TEMPERATURE,
  codePointN0,
  codeProfile,
  editionDataset,
  stressFactorSet,
} from './lfea-b4.0-code-engine-fixtures.mjs';

const TOLERANCE = 1e-12;
const OUTER_DIAMETER = 0.4064;
const NOMINAL_WALL = 0.00953;
const CORROSION_ALLOWANCE = 0.00159;
const SUSTAINED_WALL = 0.00794;
const ELEMENT_ID = 'RED-001.E1';
const COMPONENT_ID = 'RED-001';
const PRESSURE = Object.freeze({
  value: 0,
  source: 'LFEA-B4.3-NO-PRESSURE-CONTRIBUTION',
});

function test(id, name, body) {
  const evidence = body();
  console.log(`${id} PASS ${name}${evidence === undefined ? '' : ` ${JSON.stringify(evidence)}`}`);
}

function expectCode(body, expectedCode) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, expectedCode, `expected ${expectedCode}, received ${error?.code}`);
    return true;
  });
}

function assertClose(actual, expected, message) {
  const scale = Math.max(Math.abs(expected), 1e-300);
  assert.ok(
    Math.abs(actual - expected) <= TOLERANCE * scale,
    `${message}: ${actual} differs from ${expected} beyond ${TOLERANCE} relative`,
  );
}

function appendixSection({ sectionStateId, outerDiameter, wallThickness, sourceRevision, sourceHash }) {
  const payload = {
    schema: PIPE_SECTION_REQUEST_SCHEMA,
    sectionStateId,
    formulationId: PIPE_SECTION_FORMULATION_ID,
    outerDiameter,
    wallThickness,
    sourceEvidence: {
      sourceId: 'ASME-B31-3-2006-APPENDIX-S-TABLE-S301-3-1',
      sourceRevision,
      sourceSemanticHash: sourceHash,
    },
  };
  const request = {
    ...payload,
    semanticHash: computePipeSectionRequestSemanticHash(payload),
  };
  return resolvePipeSection({ request, profile: PIPE_SECTION_PROFILE });
}

function recoveredCombinedAction() {
  const model = reducerCompilation();
  const component = reducerComponent();
  const loadCase = reducerTipLoadCase(model, {
    loadCaseId: 'LC-B43-COMBINED-TIP',
    primitives: [reducerTipLoadPrimitive({
      primitiveId: 'LP-B43-COMBINED-TIP',
      force: { fx: 1200, fy: 1000, fz: 0 },
    })],
  });
  const execution = compileSolverExecution({
    compilation: model,
    elementContributions: elementContributionsFromPipingComponent(component),
    loadCase,
    solverProfile: solverProfile(),
  });
  assert.equal(execution.status, 'QUALIFIED');
  const recovery = compileResultRecovery({
    compilation: model,
    execution,
    loadCase,
    frameElements: [],
    pipingComponents: [component],
    recoveryProfile: recoveryProfile(),
  });
  const action = codePointN0(recovery).local;
  assert.notEqual(action.fx, 0, 'real recovered action must carry axial force');
  assert.notEqual(action.my, 0, 'real recovered action must carry in-plane bending');
  return action;
}

const nominalSection = appendixSection({
  sectionStateId: 'SEC-B43-APPENDIX-S-NOMINAL',
  outerDiameter: OUTER_DIAMETER,
  wallThickness: NOMINAL_WALL,
  sourceRevision: 'S301.3.1-NOMINAL-9.53MM',
  sourceHash: 'fnv1a64:4300000000000001',
});
const sustainedSection = appendixSection({
  sectionStateId: 'SEC-B43-APPENDIX-S-SUSTAINED',
  outerDiameter: OUTER_DIAMETER,
  wallThickness: SUSTAINED_WALL,
  sourceRevision: 'S301.3.1-NOMINAL-LESS-C-7.94MM',
  sourceHash: 'fnv1a64:4300000000000002',
});
const mismatchedSection = appendixSection({
  sectionStateId: 'SEC-B43-APPENDIX-S-MISMATCH',
  outerDiameter: 0.4065,
  wallThickness: SUSTAINED_WALL,
  sourceRevision: 'B4.3-NEGATIVE-OD-MISMATCH',
  sourceHash: 'fnv1a64:4300000000000003',
});

assertClose(NOMINAL_WALL - CORROSION_ALLOWANCE, SUSTAINED_WALL, 'nominal less allowance');
assert.equal(nominalSection.dimensions.outerDiameter, sustainedSection.dimensions.outerDiameter);

const material = materialResolution();
const frameElement = compileFrameElement({
  elementId: ELEMENT_ID,
  material,
  section: nominalSection,
  localAxes: {
    result: axisResult([0, 0, 0], [0.2, 0, 0]),
    profile: FRAME_LOCAL_AXIS_PROFILE,
  },
  profile: eulerBernoulliProfile(),
  distributedLoads: [],
  temperature: null,
  releases: [],
  endSprings: [],
  rigidOffsets: null,
});
const localAction = recoveredCombinedAction();
const factors = stressFactorSet({
  factorSetId: 'SF-B43-APPENDIX-S',
  componentId: COMPONENT_ID,
});

function categoryArgs(category) {
  return {
    codeProfile: codeProfile(),
    editionDataset: editionDataset(),
    stressFactorSet: factors,
    category,
    codePointId: `CP-B43-${category}`,
    componentId: COMPONENT_ID,
    combinationId: `COMB-B43-${category}`,
    frameElementRecord: frameElement,
    sectionResolution: nominalSection,
    materialResolution: material,
    localAction,
    pressureStressContribution: category === 'DISPLACEMENT_STRESS_RANGE' ? null : PRESSURE,
    coldTemperature: category === 'DISPLACEMENT_STRESS_RANGE'
      ? { value: COLD_TEMPERATURE, source: 'FIXTURE-EDITION-DATASET-NOT-ASME' }
      : null,
    occasionalCategoryId: category === 'OCCASIONAL' ? 'WIND_FIXTURE' : null,
  };
}

const nominalProperties = sectionMechanicalProperties(frameElement.section, nominalSection);
const sustainedProperties = sectionMechanicalProperties(
  sustainedSection.sectionState,
  sustainedSection,
);
const expectedAxialRatio = nominalSection.sectionState.area / sustainedSection.sectionState.area;
const nominalSectionModulus = nominalSection.sectionState.secondMomentY / (OUTER_DIAMETER / 2);
const sustainedSectionModulus = sustainedSection.sectionState.secondMomentY / (OUTER_DIAMETER / 2);
const expectedBendingRatio = nominalSectionModulus / sustainedSectionModulus;

console.log('\n--- LFEA B-4.3 sustained section override check ---');

test('B43-T01', 'Omitted and explicit-null overrides preserve the exact default result', () => {
  const omitted = compileCodeResult(categoryArgs('SUSTAINED'));
  const explicitNull = compileCodeResult({
    ...categoryArgs('SUSTAINED'),
    sustainedSectionResolution: null,
  });
  assert.deepEqual(explicitNull, omitted);
  assert.equal(JSON.stringify(explicitNull), JSON.stringify(omitted));
  return { semanticHash: omitted.semanticHash, evidenceHash: omitted.evidenceHash };
});

test('B43-T02', 'SUSTAINED override uses its own area and section modulus with independently verified ratios', () => {
  const nominal = compileCodeResult(categoryArgs('SUSTAINED'));
  const reduced = compileCodeResult({
    ...categoryArgs('SUSTAINED'),
    sustainedSectionResolution: sustainedSection,
  });
  assertClose(
    reduced.stressTerms.axial / nominal.stressTerms.axial,
    expectedAxialRatio,
    'axial stress scaling',
  );
  assertClose(
    reduced.stressTerms.inPlaneBending / nominal.stressTerms.inPlaneBending,
    expectedBendingRatio,
    'bending stress scaling',
  );
  assertClose(nominalProperties.area / sustainedProperties.area, expectedAxialRatio, 'area ratio');
  assertClose(
    nominalProperties.sectionModulus / sustainedProperties.sectionModulus,
    expectedBendingRatio,
    'section-modulus ratio',
  );
  assert.ok(Math.abs(reduced.stressTerms.axial) > Math.abs(nominal.stressTerms.axial));
  assert.ok(Math.abs(reduced.stressTerms.inPlaneBending) > Math.abs(nominal.stressTerms.inPlaneBending));
  return {
    nominalArea: nominalProperties.area,
    sustainedArea: sustainedProperties.area,
    axialRatio: expectedAxialRatio,
    nominalSectionModulus,
    sustainedSectionModulus,
    bendingRatio: expectedBendingRatio,
  };
});

test('B43-T03', 'OCCASIONAL refuses a sustained-only section override', () => {
  expectCode(
    () => compileCodeResult({
      ...categoryArgs('OCCASIONAL'),
      sustainedSectionResolution: sustainedSection,
    }),
    'CODE_ENGINE_SUSTAINED_SECTION_OVERRIDE_CATEGORY_MISMATCH',
  );
});

test('B43-T04', 'DISPLACEMENT_STRESS_RANGE refuses a sustained-only section override', () => {
  expectCode(
    () => compileCodeResult({
      ...categoryArgs('DISPLACEMENT_STRESS_RANGE'),
      sustainedSectionResolution: sustainedSection,
    }),
    'CODE_ENGINE_SUSTAINED_SECTION_OVERRIDE_CATEGORY_MISMATCH',
  );
});

test('B43-T05', 'SUSTAINED refuses an override with a different outer diameter', () => {
  expectCode(
    () => compileCodeResult({
      ...categoryArgs('SUSTAINED'),
      sustainedSectionResolution: mismatchedSection,
    }),
    'CODE_ENGINE_SUSTAINED_SECTION_OVERRIDE_GEOMETRY_MISMATCH',
  );
});

test('B43-T06', 'Package registration runs B4.3 after B4.2 and before downstream consumers', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(
    packageJson.scripts['check:lfea-b4.3'],
    'node scripts/lfea-b4.3-sustained-section-override-check.mjs',
  );
  const linearCore = packageJson.scripts['check:lfea-linear-core'];
  const b42 = linearCore.indexOf('check:lfea-b4.2');
  const b43 = linearCore.indexOf('check:lfea-b4.3');
  const consumer = linearCore.indexOf('check:linear-piping-analysis-consumer');
  assert.ok(b42 >= 0 && b43 > b42 && consumer > b43);
  return { b42, b43, consumer };
});
