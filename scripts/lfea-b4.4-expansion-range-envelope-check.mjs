#!/usr/bin/env node

/**
 * M017 EXPANSION_RANGE_ENVELOPE / Eq. (1b) / real caller wiring check.
 *
 * Numeric allowables and factors remain synthetic and explicitly marked
 * NOT-ASME. The implemented formula is cited from ASME B31.3-2006
 * para. 302.3.5(d), Eq. (1b): S_A = f [1.25 (S_c + S_h) - S_L].
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FRAME_LOCAL_AXIS_PROFILE, resolveFrameLocalAxes } from '../src/core/centerline-beam-fea/index.js';
import {
  compileCodeResult,
  sectionMechanicalProperties,
} from '../src/core/linear-fea-b31-code-engine/index.js';
import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import { compilePipingComponent } from '../src/core/linear-fea-piping-components/index.js';
import {
  compileSolverExecution,
  elementContributionsFromPipingComponent,
} from '../src/core/linear-fea-solver/index.js';
import { compileResultRecovery } from '../src/core/linear-fea-result-recovery/index.js';
import {
  PIPE_SECTION_FORMULATION_ID,
  PIPE_SECTION_PROFILE,
  PIPE_SECTION_REQUEST_SCHEMA,
  computePipeSectionRequestSemanticHash,
  resolvePipeSection,
} from '../src/core/linear-fea-section/index.js';
import {
  B31_APPLICATION_REQUEST_SCHEMA,
  compileLinearPipingB31Application,
} from '../src/core/linear-piping-code-application/index.js';
import {
  compilerProfile,
  materialResolution,
} from './lfea-b2.5-model-compiler-fixtures.mjs';
import { eulerBernoulliProfile } from './lfea-b3.1-frame-element-fixtures.mjs';
import {
  componentProfile,
  reducerInput,
} from './lfea-b3.2-piping-component-fixtures.mjs';
import { solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import {
  recoveryProfile,
  reducerCompilation,
  reducerComponent,
  reducerTipLoadCase,
  reducerTipLoadPrimitive,
} from './lfea-b3.4-recovery-fixtures.mjs';
import {
  COLD_ALLOWABLE_VALUE,
  COLD_TEMPERATURE,
  HOT_ALLOWABLE_VALUE,
  codeProfile,
  editionDataset,
  reducerSectionResolutionE1,
  stressFactorSet,
} from './lfea-b4.0-code-engine-fixtures.mjs';

const NOT_ASME = 'M017-FIXTURE-NOT-ASME';
const SUSTAINED_STRESS = 20_000_000;
const TOLERANCE = 1e-12;

/* M015's independently hand-verified NPS16 nominal-less-allowance ratios. */
const M015_AXIAL_RATIO = 1.1954624485629903;
const M015_BENDING_RATIO = 1.1861536715256218;
const OUTER_DIAMETER = 0.4064;
const NOMINAL_WALL = 0.00953;
const SUSTAINED_WALL = 0.00794;

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

function analysisFor(compilation, component, loadCase) {
  const execution = compileSolverExecution({
    compilation,
    elementContributions: elementContributionsFromPipingComponent(component),
    loadCase,
    solverProfile: solverProfile(),
  });
  assert.equal(execution.status, 'QUALIFIED');
  const recovery = compileResultRecovery({
    compilation,
    execution,
    loadCase,
    frameElements: [],
    pipingComponents: [component],
    recoveryProfile: recoveryProfile(),
  });
  return { loadCase, execution, recovery };
}

function codePoint(recovery, stationId = 'RED-001.S1') {
  const component = recovery.componentResultants.find((entry) => entry.componentId === 'RED-001');
  const point = component?.codePoints.find((entry) => entry.stationId === stationId);
  assert.notEqual(point, undefined, `missing recovered code point ${stationId}`);
  return point;
}

function declaredFactor(value, label) {
  return { value, source: `${NOT_ASME}-${label}` };
}

function expansionStressFactorSet() {
  return stressFactorSet({
    factorSetId: 'SF-M017-EXPANSION',
    displacementSifs: {
      axial: declaredFactor(2, 'AXIAL-SIF'),
      torsional: declaredFactor(3, 'TORSIONAL-SIF'),
      inPlaneBending: declaredFactor(4, 'IN-PLANE-SIF'),
      outOfPlaneBending: declaredFactor(5, 'OUT-OF-PLANE-SIF'),
    },
  });
}

function defaultRangeFixture() {
  const compilation = reducerCompilation();
  const component = reducerComponent();
  const highCase = reducerTipLoadCase(compilation, {
    loadCaseId: 'LC-M017-HIGH',
    presentation: {
      label: 'M017 high recovered action',
      description: 'High independently solved action for CASE_RANGE.',
    },
    primitives: [reducerTipLoadPrimitive({
      primitiveId: 'LP-M017-HIGH',
      force: { fx: 600, fy: 1000, fz: 300 },
      moment: { mx: 80, my: 30, mz: 20 },
      sourceEvidence: {
        sourceId: NOT_ASME,
        sourceRevision: 'HIGH',
        sourceSemanticHash: 'fnv1a64:4400000000000001',
      },
    })],
  });
  const lowCase = reducerTipLoadCase(compilation, {
    loadCaseId: 'LC-M017-LOW',
    presentation: {
      label: 'M017 low recovered action',
      description: 'Low independently solved action for CASE_RANGE.',
    },
    primitives: [reducerTipLoadPrimitive({
      primitiveId: 'LP-M017-LOW',
      force: { fx: 150, fy: 250, fz: 50 },
      moment: { mx: 20, my: 5, mz: 4 },
      sourceEvidence: {
        sourceId: NOT_ASME,
        sourceRevision: 'LOW',
        sourceSemanticHash: 'fnv1a64:4400000000000002',
      },
    })],
  });
  return {
    compilation,
    component,
    high: analysisFor(compilation, component, highCase),
    low: analysisFor(compilation, component, lowCase),
  };
}

function commonRangeCheck(fixture) {
  const frameElement = fixture.component.elements
    .find((entry) => entry.elementId === 'RED-001.E1').frameElement;
  return {
    codePointId: 'RED-001.S1',
    componentId: 'RED-001',
    combinationId: 'M017-HIGH-MINUS-LOW',
    actionSource: { kind: 'CASE_RANGE', fromCaseId: 'LOW', toCaseId: 'HIGH' },
    frameElementRecord: frameElement,
    sectionResolution: reducerSectionResolutionE1(),
    sustainedSectionResolution: null,
    materialResolution: materialResolution(),
    stressFactorSet: expansionStressFactorSet(),
    pressureStressContribution: null,
    coldTemperature: { value: COLD_TEMPERATURE, source: `${NOT_ASME}-SC-TEMPERATURE` },
    sustainedStress: { value: SUSTAINED_STRESS, source: `${NOT_ASME}-SL-CODE-RESULT` },
    occasionalCategoryId: null,
  };
}

function expansionRequest(fixture, checkOverrides = {}) {
  return {
    schema: B31_APPLICATION_REQUEST_SCHEMA,
    applicationId: 'B31-M017-EXPANSION',
    codeProfile: codeProfile(),
    editionDataset: editionDataset(),
    cases: [
      { caseId: 'HIGH', loadCase: fixture.high.loadCase, recovery: fixture.high.recovery },
      { caseId: 'LOW', loadCase: fixture.low.loadCase, recovery: fixture.low.recovery },
    ],
    checks: [{
      checkId: 'B31-M017-EXPANSION-S1',
      category: 'EXPANSION_RANGE_ENVELOPE',
      ...commonRangeCheck(fixture),
      ...checkOverrides,
    }],
  };
}

function appendixSection({ sectionStateId, wallThickness, sourceRevision, sourceHash }) {
  const payload = {
    schema: PIPE_SECTION_REQUEST_SCHEMA,
    sectionStateId,
    formulationId: PIPE_SECTION_FORMULATION_ID,
    outerDiameter: OUTER_DIAMETER,
    wallThickness,
    sourceEvidence: {
      sourceId: 'ASME-B31-3-2006-APPENDIX-S-TABLE-S301-3-1',
      sourceRevision,
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

function sustainedCallerFixture() {
  const nominal = appendixSection({
    sectionStateId: 'SEC-M017-NPS16-NOMINAL',
    wallThickness: NOMINAL_WALL,
    sourceRevision: 'M015-NOMINAL-9.53MM',
    sourceHash: 'fnv1a64:4400000000000011',
  });
  const sustained = appendixSection({
    sectionStateId: 'SEC-M017-NPS16-SUSTAINED',
    wallThickness: SUSTAINED_WALL,
    sourceRevision: 'M015-NOMINAL-LESS-C-7.94MM',
    sourceHash: 'fnv1a64:4400000000000012',
  });
  const material = materialResolution();
  const component = compilePipingComponent(reducerInput({
    profile: componentProfile(),
    frameElementProfile: eulerBernoulliProfile(),
    stations: [
      { fraction: 0, section: nominal },
      { fraction: 0.5, section: sustained },
    ],
  }));
  const positions = {
    'RED-001.N0': [0, 0, 0],
    'RED-001.N1': [0.2, 0, 0],
    'RED-001.N2': [0.4, 0, 0],
  };
  const nodeIds = Object.keys(positions);
  const compilation = compileMechanicalModel({
    modelIdentity: 'SYS-M017-SUSTAINED-CALLER',
    modelRevision: 1,
    sourceSemanticHash: 'fnv1a64:4400000000000020',
    conditionedTopology: {
      geometry: {
        schemaVersion: 'canonical-geometry-v1',
        nodes: nodeIds.map((id) => ({
          id: `TOPO/${id}`,
          x: positions[id][0],
          y: positions[id][1],
          z: positions[id][2],
          restraint: id === 'RED-001.N0' ? 'ANCHOR' : 'FREE',
          sourceComponentUid: 'RED-001',
          meta: {},
        })),
        segments: [
          { id: 'TOPO/RED-001.E1', startNodeId: 'TOPO/RED-001.N0', endNodeId: 'TOPO/RED-001.N1', type: 'PIPE' },
          { id: 'TOPO/RED-001.E2', startNodeId: 'TOPO/RED-001.N1', endNodeId: 'TOPO/RED-001.N2', type: 'PIPE' },
        ],
        source: NOT_ASME,
        unit: 'm',
        diagnostics: [],
        summary: {},
      },
      semanticHash: 'fnv1a64:4400000000000021',
    },
    nodeBindings: nodeIds.map((id) => ({
      nodeId: id,
      conditionedNodeId: `C-${id}`,
      topologyNodeId: `TOPO/${id}`,
    })),
    elementBindings: [
      {
        elementId: 'RED-001.E1',
        conditionedSegmentId: 'CS-M017-E1',
        topologySegmentId: 'TOPO/RED-001.E1',
        materialStateId: material.materialState.materialStateId,
        sectionStateId: nominal.sectionState.sectionStateId,
        formulationId: 'PIPE_FRAME3D_LINEAR_V1',
        localAxisEvidenceIdentity: 'AXIS-M017-E1',
        sourceComponentId: 'RED-001',
      },
      {
        elementId: 'RED-001.E2',
        conditionedSegmentId: 'CS-M017-E2',
        topologySegmentId: 'TOPO/RED-001.E2',
        materialStateId: material.materialState.materialStateId,
        sectionStateId: sustained.sectionState.sectionStateId,
        formulationId: 'PIPE_FRAME3D_LINEAR_V1',
        localAxisEvidenceIdentity: 'AXIS-M017-E2',
        sourceComponentId: 'RED-001',
      },
    ],
    materialResolutions: [material],
    sectionResolutions: [nominal, sustained],
    localAxisResults: [
      {
        evidenceIdentity: 'AXIS-M017-E1',
        result: resolveFrameLocalAxes({
          nodeI: positions['RED-001.N0'],
          nodeJ: positions['RED-001.N1'],
          referenceVector: [0, 0, 1],
          profile: FRAME_LOCAL_AXIS_PROFILE,
        }),
      },
      {
        evidenceIdentity: 'AXIS-M017-E2',
        result: resolveFrameLocalAxes({
          nodeI: positions['RED-001.N1'],
          nodeJ: positions['RED-001.N2'],
          referenceVector: [0, 0, 1],
          profile: FRAME_LOCAL_AXIS_PROFILE,
        }),
      },
    ],
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    constraintDeclarations: ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => ({
      declarationId: `C-M017-N0-${dof}`,
      kind: 'NODAL_RESTRAINT',
      nodeId: 'RED-001.N0',
      dof,
      behavior: 'FIXED',
    })),
    profile: compilerProfile(),
  });
  const loadCase = reducerTipLoadCase(compilation, {
    loadCaseId: 'LC-M017-SUSTAINED',
    primitives: [reducerTipLoadPrimitive({
      primitiveId: 'LP-M017-SUSTAINED',
      force: { fx: 1200, fy: 1000, fz: 0 },
      sourceEvidence: {
        sourceId: NOT_ASME,
        sourceRevision: 'SUSTAINED',
        sourceSemanticHash: 'fnv1a64:4400000000000022',
      },
    })],
  });
  return {
    component,
    compilation,
    nominal,
    sustained,
    material,
    analysis: analysisFor(compilation, component, loadCase),
  };
}

function sustainedRequest(fixture, sustainedSectionResolution) {
  const frameElement = fixture.component.elements
    .find((entry) => entry.elementId === 'RED-001.E1').frameElement;
  return {
    schema: B31_APPLICATION_REQUEST_SCHEMA,
    applicationId: sustainedSectionResolution === null
      ? 'B31-M017-SUSTAINED-NOMINAL'
      : 'B31-M017-SUSTAINED-REDUCED',
    codeProfile: codeProfile(),
    editionDataset: editionDataset(),
    cases: [{
      caseId: 'SUS',
      loadCase: fixture.analysis.loadCase,
      recovery: fixture.analysis.recovery,
    }],
    checks: [{
      checkId: 'B31-M017-SUSTAINED-S1',
      category: 'SUSTAINED',
      codePointId: 'RED-001.S1',
      componentId: 'RED-001',
      combinationId: fixture.analysis.loadCase.loadCaseId,
      actionSource: { kind: 'SINGLE_CASE', caseId: 'SUS' },
      frameElementRecord: frameElement,
      sectionResolution: fixture.nominal,
      sustainedSectionResolution,
      materialResolution: fixture.material,
      stressFactorSet: stressFactorSet({ factorSetId: 'SF-M017-SUSTAINED' }),
      pressureStressContribution: { value: 0, source: `${NOT_ASME}-NO-PRESSURE` },
      coldTemperature: null,
      sustainedStress: null,
      occasionalCategoryId: null,
    }],
  };
}

console.log('\n--- LFEA B-4.4 expansion range envelope check ---');

const rangeFixture = defaultRangeFixture();
const expansion = compileLinearPipingB31Application(expansionRequest(rangeFixture));
const expansionEntry = expansion.results[0];
const highPoint = codePoint(rangeFixture.high.recovery);
const lowPoint = codePoint(rangeFixture.low.recovery);
const expectedLocal = Object.fromEntries(
  ['fx', 'fy', 'fz', 'mx', 'my', 'mz']
    .map((field) => [field, highPoint.local[field] - lowPoint.local[field]]),
);

test('B44-T01', 'EXPANSION_RANGE_ENVELOPE reuses the real ordered CASE_RANGE subtraction', () => {
  assert.deepEqual(expansionEntry.sourceRecoveryHashes, [
    rangeFixture.low.recovery.semanticHash,
    rangeFixture.high.recovery.semanticHash,
  ]);
  assert.equal(expansionEntry.codeResult.resultants.axialForce, expectedLocal.fx);
  assert.equal(expansionEntry.codeResult.resultants.torsion, expectedLocal.mx);
  assert.equal(expansionEntry.codeResult.resultants.inPlaneMoment, expectedLocal.my);
  assert.equal(expansionEntry.codeResult.resultants.outOfPlaneMoment, expectedLocal.mz);
  return { expectedLocal, resultants: expansionEntry.codeResult.resultants };
});

test('B44-T02', 'Eq. (1b) allowable is independently reproduced from declared Sc, Sh, SL and f', () => {
  const expected = 0.85
    * (1.25 * (COLD_ALLOWABLE_VALUE + HOT_ALLOWABLE_VALUE) - SUSTAINED_STRESS);
  assert.equal(expected, 184_875_000);
  assertClose(expansionEntry.codeResult.allowableStress, expected, 'Eq. (1b) allowable');
  return { expected, actual: expansionEntry.codeResult.allowableStress };
});

test('B44-T03', 'Expansion stress uses displacement SIFs, retains axial resultant, and excludes axial and pressure terms', () => {
  const factors = expansionEntry.codeResult.factors;
  assert.equal(factors.axialIndex, 2);
  assert.equal(factors.torsionalIndex, 3);
  assert.equal(factors.inPlaneSif, 4);
  assert.equal(factors.outOfPlaneSif, 5);
  assert.notEqual(expectedLocal.fx, 0, 'CASE_RANGE fixture must retain a genuinely nonzero axial resultant');
  assert.equal(expansionEntry.codeResult.resultants.axialForce, expectedLocal.fx);
  assert.equal(expansionEntry.codeResult.stressTerms.axial, 0);
  assert.equal(expansionEntry.codeResult.stressTerms.pressure, 0);
  const frameElement = rangeFixture.component.elements
    .find((entry) => entry.elementId === 'RED-001.E1').frameElement;
  const section = reducerSectionResolutionE1();
  const properties = sectionMechanicalProperties(frameElement.section, section);
  const expectedTorsion = (expectedLocal.mx / properties.polarSectionModulus) * 3;
  const expectedInPlane = (expectedLocal.my / properties.sectionModulus) * 4;
  const expectedOutOfPlane = (expectedLocal.mz / properties.sectionModulus) * 5;
  const expectedCalculated = Math.sqrt(
    expectedTorsion ** 2 + expectedInPlane ** 2 + expectedOutOfPlane ** 2,
  );
  assertClose(expansionEntry.codeResult.stressTerms.torsional, expectedTorsion, 'torsional stress');
  assertClose(expansionEntry.codeResult.stressTerms.inPlaneBending, expectedInPlane, 'in-plane stress');
  assertClose(expansionEntry.codeResult.stressTerms.outOfPlaneBending, expectedOutOfPlane, 'out-of-plane stress');
  assertClose(expansionEntry.codeResult.calculatedStress, expectedCalculated, 'Eq. (17) expansion stress');
  return {
    retainedAxialForce: expansionEntry.codeResult.resultants.axialForce,
    axialStressTerm: expansionEntry.codeResult.stressTerms.axial,
    expectedCalculated,
  };
});

test('B44-T04', 'Existing DISPLACEMENT_STRESS_RANGE output is byte-identical with omitted vs explicit-null sustainedStress', () => {
  const common = {
    codeProfile: codeProfile(),
    editionDataset: editionDataset(),
    stressFactorSet: expansionStressFactorSet(),
    category: 'DISPLACEMENT_STRESS_RANGE',
    codePointId: 'RED-001.S1',
    componentId: 'RED-001',
    combinationId: 'M017-DSR-REGRESSION',
    frameElementRecord: rangeFixture.component.elements
      .find((entry) => entry.elementId === 'RED-001.E1').frameElement,
    sectionResolution: reducerSectionResolutionE1(),
    materialResolution: materialResolution(),
    localAction: expectedLocal,
    pressureStressContribution: null,
    coldTemperature: { value: COLD_TEMPERATURE, source: `${NOT_ASME}-DSR-COLD` },
    occasionalCategoryId: null,
  };
  const omitted = compileCodeResult(common);
  const explicitNull = compileCodeResult({ ...common, sustainedStress: null });
  assert.deepEqual(explicitNull, omitted);
  assert.equal(JSON.stringify(explicitNull), JSON.stringify(omitted));
  return { semanticHash: omitted.semanticHash, evidenceHash: omitted.evidenceHash };
});

test('B44-T05', 'EXPANSION_RANGE_ENVELOPE fails closed without sustainedStress', () => {
  expectCode(
    () => compileLinearPipingB31Application(expansionRequest(rangeFixture, { sustainedStress: null })),
    'CODE_ENGINE_EXPANSION_RANGE_SUSTAINED_STRESS_REQUIRED',
  );
});

test('B44-T06', 'EXPANSION_RANGE_ENVELOPE fails closed without the Sc cold-temperature authority', () => {
  expectCode(
    () => compileLinearPipingB31Application(expansionRequest(rangeFixture, { coldTemperature: null })),
    'CODE_ENGINE_EXPANSION_RANGE_COLD_TEMPERATURE_REQUIRED',
  );
});

test('B44-T07', 'CASE_RANGE remains invalid for non-range categories', () => {
  expectCode(
    () => compileLinearPipingB31Application(expansionRequest(rangeFixture, {
      category: 'SUSTAINED',
      pressureStressContribution: { value: 0, source: `${NOT_ASME}-NO-PRESSURE` },
      coldTemperature: null,
      sustainedStress: null,
    })),
    'PIPING_B31_RANGE_CATEGORY_INVALID',
  );
});

test('B44-T08', 'EXPANSION_RANGE_ENVELOPE requires CASE_RANGE rather than a single case', () => {
  expectCode(
    () => compileLinearPipingB31Application(expansionRequest(rangeFixture, {
      actionSource: { kind: 'SINGLE_CASE', caseId: 'HIGH' },
    })),
    'PIPING_B31_RANGE_SOURCE_REQUIRED',
  );
});

const sustainedFixture = sustainedCallerFixture();
const nominalApplication = compileLinearPipingB31Application(
  sustainedRequest(sustainedFixture, null),
);
const reducedApplication = compileLinearPipingB31Application(
  sustainedRequest(sustainedFixture, sustainedFixture.sustained),
);
const nominalResult = nominalApplication.results[0].codeResult;
const reducedResult = reducedApplication.results[0].codeResult;

test('B44-T09', 'The application layer wires M015 sustainedSectionResolution to its first real caller', () => {
  assertClose(
    reducedResult.stressTerms.axial / nominalResult.stressTerms.axial,
    M015_AXIAL_RATIO,
    'M015 axial ratio through application caller',
  );
  assertClose(
    reducedResult.stressTerms.inPlaneBending / nominalResult.stressTerms.inPlaneBending,
    M015_BENDING_RATIO,
    'M015 bending ratio through application caller',
  );
  assert.ok(Math.abs(reducedResult.calculatedStress) > Math.abs(nominalResult.calculatedStress));
  return {
    axialRatio: reducedResult.stressTerms.axial / nominalResult.stressTerms.axial,
    bendingRatio: reducedResult.stressTerms.inPlaneBending / nominalResult.stressTerms.inPlaneBending,
  };
});

test('B44-T10', 'Package registration runs B4.4 after B4.3 and before downstream consumers', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(
    packageJson.scripts['check:lfea-b4.4'],
    'node scripts/lfea-b4.4-expansion-range-envelope-check.mjs',
  );
  const linearCore = packageJson.scripts['check:lfea-linear-core'];
  const b43 = linearCore.indexOf('npm run check:lfea-b4.3');
  const b44 = linearCore.indexOf('npm run check:lfea-b4.4');
  const consumer = linearCore.indexOf('npm run check:linear-piping-analysis-consumer');
  assert.ok(b43 >= 0 && b44 > b43 && consumer > b44);
  return { b43, b44, consumer };
});
