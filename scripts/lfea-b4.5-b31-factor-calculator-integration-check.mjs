import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  COMPONENT_GEOMETRY_SCHEMA,
  FACTOR_CALCULATION_REQUEST_SCHEMA,
  calculateB31Factors,
  calculateB31FactorsFromInputXml,
} from '../src/core/linear-fea-b31-factor-calculator/index.js';
import {
  requireComponentFactorSet,
} from '../src/core/linear-fea-piping-components/piping-component-contract.js';
import {
  requireStressFactorSet,
} from '../src/core/linear-fea-b31-code-engine/code-engine-contract.js';

const mapping = Object.freeze({ inPlaneField: 'my', outOfPlaneField: 'mz' });
const sourceEvidence = Object.freeze({ sourceId: 'LFEA-B4.5-INTEGRATION', sourceRevision: '01' });
const packageRoot = fileURLToPath(new URL('../', import.meta.url));

function calculate(componentId, editionProfileId, componentType, geometry) {
  return calculateB31Factors({
    schema: FACTOR_CALCULATION_REQUEST_SCHEMA,
    calculationId: `${componentId}.CALC`,
    componentId,
    editionProfileId,
    componentType,
    geometry: {
      schema: COMPONENT_GEOMETRY_SCHEMA,
      componentType,
      lengthUnit: 'm',
      sourceEvidence,
      ...geometry,
    },
    momentDirectionMapping: mapping,
    semanticHash: '',
  });
}

console.log('\n--- LFEA B-4.5 B31 factor calculator contract integration ---');

const bend = calculate('BEND-B4.5', 'B31_3_2024_B31J_2023', 'BEND', {
  outerDiameter: 0.32385,
  wallThickness: 0.009525,
  bendRadius: 0.4572,
  pressure: 2.1e6,
  elasticModulus: 203.395328e9,
});
assert.deepEqual(requireComponentFactorSet(bend.componentFactorSet), bend.componentFactorSet);
assert.deepEqual(requireStressFactorSet(bend.stressFactorSets[0]), bend.stressFactorSets[0]);
assert.equal(bend.componentFactorSet.flexibilityFactor.value, bend.factors.flexibility.inPlane);
assert.equal(
  bend.stressFactorSets[0].displacementSifs.inPlaneBending.value,
  bend.factors.displacementSifs.inPlaneBending,
);

const tee = calculate('TEE-B4.5', 'B31_3_2020_B31J_2017', 'WELDING_TEE', {
  runOuterDiameter: 0.32385,
  runWallThickness: 0.009525,
  branchOuterDiameter: 0.2191,
  branchWallThickness: 0.00818,
  fittingQuality: 'VERIFIED_B16_9',
});
assert.equal(tee.componentFactorSet, null);
assert.equal(tee.stressFactorSets.length, 2);
tee.stressFactorSets.forEach((factorSet) => {
  assert.deepEqual(requireStressFactorSet(factorSet), factorSet);
});
assert.notEqual(
  tee.stressFactorSets[0].displacementSifs.inPlaneBending.value,
  tee.stressFactorSets[1].displacementSifs.inPlaneBending.value,
);

const reducer = calculate('REDUCER-B4.5', 'B31_3_2024_B31J_2023', 'REDUCER', {
  largeEndOuterDiameter: 0.4064,
  largeEndWallThickness: 0.0127,
  smallEndOuterDiameter: 0.32385,
  smallEndWallThickness: 0.009525,
  coneAngleDegrees: 20,
  smallEndTransitionRadius: 0.04,
  smallEndCylinderLength: 0.08,
  bodyMinimumWallThickness: 0.0127,
});
assert.deepEqual(requireStressFactorSet(reducer.stressFactorSets[0]), reducer.stressFactorSets[0]);
assert.equal(reducer.componentFactorSet, null);
assert.deepEqual(reducer.matchingPipeApplication.largeEnd, {
  endpoint: 'LARGE_END',
  outerDiameter: 0.4064,
  wallThickness: 0.0127,
});
assert.deepEqual(reducer.matchingPipeApplication.smallEnd, {
  endpoint: 'SMALL_END',
  outerDiameter: 0.32385,
  wallThickness: 0.009525,
});

const bm1Path = fileURLToPath(new URL('../benchmarks/LFEA/BM1/BM1_InputXML.xml', import.meta.url));
const bm1Results = calculateB31FactorsFromInputXml({
  xmlText: readFileSync(bm1Path, 'utf8'),
  inputXmlOptions: { unit: 'mm', source: 'CAESAR-II-BM1-LIVE-INPUTXML' },
  editionProfileId: 'B31_3_2020_B31J_2017',
  momentDirectionMapping: mapping,
  segmentIds: ['IX-S5'],
});
assert.equal(bm1Results.length, 1);
assert.equal(bm1Results[0].status, 'QUALIFIED');
assert.equal(bm1Results[0].geometry.lengthUnit, 'm');
assert.ok(Math.abs(bm1Results[0].geometry.outerDiameter - 0.323850006) < 1e-12);
assert.ok(Math.abs(bm1Results[0].geometry.wallThickness - 0.009525) < 1e-12);
assert.ok(Math.abs(bm1Results[0].geometry.bendRadius - 0.457199982) < 1e-12);

const calculatorDirectory = new URL('../src/core/linear-fea-b31-factor-calculator/', import.meta.url);
const calculatorFiles = [
  'calculator.js', 'contract.js', 'edition-profiles.js', 'geometry.js',
  'equations.js', 'applicability.js', 'records.js', 'inputxml.js', 'index.js',
];
const productionSource = calculatorFiles.map((name) => (
  readFileSync(new URL(name, calculatorDirectory), 'utf8')
)).join('\n');
for (const prohibited of [
  'compilePipingComponent(',
  'compileCodeResult(',
  'applyBendingFlexibilityCorrection(',
  'compileSolverExecution(',
]) {
  assert.equal(
    productionSource.includes(prohibited),
    false,
    `The calculator must not apply factors or execute analysis: ${prohibited}`,
  );
}

const packageJson = JSON.parse(readFileSync(`${packageRoot}package.json`, 'utf8'));
assert.equal(
  packageJson.scripts['check:lfea-b3.19'],
  'node scripts/lfea-b3.19-b31-factor-calculator-check.mjs',
);
assert.equal(
  packageJson.scripts['check:lfea-b4.5'],
  'node scripts/lfea-b4.5-b31-factor-calculator-integration-check.mjs',
);
const aggregate = packageJson.scripts['check:lfea-linear-core'];
assert.ok(aggregate.indexOf('check:lfea-b3.18') < aggregate.indexOf('check:lfea-b3.19'));
assert.ok(aggregate.indexOf('check:lfea-b3.19') < aggregate.indexOf('check:lfea-bm1-cii-comparison'));
assert.ok(aggregate.indexOf('check:lfea-b4.4') < aggregate.indexOf('check:lfea-b4.5'));

console.log(JSON.stringify({
  status: 'PASS',
  componentFactorSetsValidated: 1,
  stressFactorSetsValidated: 4,
  inputXmlSegment: bm1Results[0].componentId,
  ownershipBoundary: 'CALCULATE_AND_SEAL_ONLY',
}, null, 2));
