#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  COMPONENT_GEOMETRY_SCHEMA,
  FACTOR_CALCULATION_REQUEST_SCHEMA,
  calculateB31Factors,
} from '../src/core/linear-fea-b31-factor-calculator/index.js';

const FIXTURE_PATH = fileURLToPath(new URL(
  '../benchmarks/LFEA/B31_APPENDIX_D/M026_Appendix_D_Factor_Benchmarks.json',
  import.meta.url,
));
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
const mapping = Object.freeze({ inPlaneField: 'my', outOfPlaneField: 'mz' });
const sourceEvidence = Object.freeze({ sourceId: 'M026-APPENDIX-D-BENCHMARK', sourceRevision: '01' });

assert.equal(fixture.schema, 'm026-appendix-d-factor-benchmark/v1');
assert.equal(fixture.issue, 601);
assert.equal(fixture.editionProfileId, 'B31_3_2018_APPENDIX_D');
assert.equal(fixture.caseCount, 9);
assert.equal(fixture.cases.bends.length, 3);
assert.equal(fixture.cases.weldingTees.length, 3);
assert.equal(fixture.cases.concentricReducers.length, 3);
assert.equal(fixture.reducerDisposition.status, 'CONFIRMED_LEGACY_UNITY_RULE');
assert.equal(new Set(Object.values(fixture.cases).flat().map((entry) => entry.caseId)).size, 9);
assert.deepEqual(
  Object.values(fixture.cases).flat().reduce((counts, entry) => ({
    ...counts,
    [entry.classification]: (counts[entry.classification] ?? 0) + 1,
  }), {}),
  { b: 6, a: 3 },
);
for (const entry of Object.values(fixture.cases).flat()) {
  assert.ok(['a', 'b'].includes(entry.classification), `${entry.caseId} classification`);
}

const derivedTolerance = fixture.tolerance.derivedRelative;
const results = [];

for (const entry of fixture.cases.bends) {
  const unpressurized = calculate('BEND', entry.caseId, {
    ...entry.geometry,
    pressure: 0,
  });
  const pressurized = calculate('BEND', `${entry.caseId}-PRESSURIZED`, {
    ...entry.geometry,
    pressure: entry.pressurizedPressure,
  });

  assert.equal(unpressurized.status, 'QUALIFIED', entry.caseId);
  assert.equal(pressurized.status, 'QUALIFIED', entry.caseId);
  assert.equal(unpressurized.factors.pressureCorrection.applied, false);
  assert.equal(pressurized.factors.pressureCorrection.applied, true);

  compareBend(unpressurized, entry.derivation.unpressurized, `${entry.caseId} unpressurized`);
  compareBend(pressurized, entry.derivation.pressurized, `${entry.caseId} pressurized`);
  assert.equal(unpressurized.componentFactorSet.flexibilityFactor.value, unpressurized.factors.flexibility.inPlane);
  assert.equal(pressurized.componentFactorSet.flexibilityFactor.value, pressurized.factors.flexibility.inPlane);
  compareDeclaredSifs(unpressurized.stressFactorSets[0], unpressurized.factors.displacementSifs, `${entry.caseId} unpressurized record`);
  compareDeclaredSifs(pressurized.stressFactorSets[0], pressurized.factors.displacementSifs, `${entry.caseId} pressurized record`);
  approximately(
    pressurized.factors.unpressurized.flexibility,
    entry.derivation.unpressurized.flexibility,
    `${entry.caseId} retained base flexibility`,
  );
  approximately(
    pressurized.factors.unpressurized.inPlaneSif,
    entry.derivation.unpressurized.inPlaneSif,
    `${entry.caseId} retained base in-plane SIF`,
  );
  approximately(
    pressurized.factors.unpressurized.outOfPlaneSif,
    entry.derivation.unpressurized.outOfPlaneSif,
    `${entry.caseId} retained base out-of-plane SIF`,
  );

  results.push({
    caseId: entry.caseId,
    classification: entry.classification,
    unpressurized: summaryBend(unpressurized),
    pressurized: summaryBend(pressurized),
  });
}

for (const entry of fixture.cases.weldingTees) {
  const result = calculate('WELDING_TEE', entry.caseId, entry.geometry);
  const reference = entry.derivation.reference;
  assert.equal(result.status, 'QUALIFIED', entry.caseId);
  approximately(
    result.factors.flexibilityCharacteristic,
    entry.derivation.flexibilityCharacteristic,
    `${entry.caseId} h`,
  );
  assert.equal(result.componentFactorSet?.flexibilityFactor?.value ?? 1, reference.flexibility);
  assert.equal(result.factors.flexibility.run.inPlane, 1);
  assert.equal(result.factors.flexibility.run.outOfPlane, 1);
  assert.equal(result.factors.flexibility.branch.inPlane, 1);
  assert.equal(result.factors.flexibility.branch.outOfPlane, 1);

  for (const [index, leg] of ['run', 'branch'].entries()) {
    const sif = result.factors.displacementSifs[leg];
    approximately(sif.inPlaneBending, reference.inPlaneSif, `${entry.caseId} ${leg} ii`);
    approximately(sif.outOfPlaneBending, reference.outOfPlaneSif, `${entry.caseId} ${leg} io`);
    assert.equal(sif.torsional, reference.torsionalSif);
    assert.equal(sif.axial, reference.axialSif);
    compareDeclaredSifs(result.stressFactorSets[index], sif, `${entry.caseId} ${leg} record`);
  }

  results.push({
    caseId: entry.caseId,
    classification: entry.classification,
    flexibilityCharacteristic: result.factors.flexibilityCharacteristic,
    inPlaneSif: result.factors.displacementSifs.run.inPlaneBending,
    outOfPlaneSif: result.factors.displacementSifs.run.outOfPlaneBending,
  });
}

for (const entry of fixture.cases.concentricReducers) {
  const result = calculate('REDUCER', entry.caseId, entry.geometry);
  assert.equal(result.status, 'QUALIFIED', entry.caseId);
  assert.equal(result.factors.flexibility, null);
  assert.equal(result.componentFactorSet, null);
  assert.equal(result.matchingPipeApplication.largeEnd.outerDiameter, entry.geometry.largeEndOuterDiameter);
  assert.equal(result.matchingPipeApplication.smallEnd.outerDiameter, entry.geometry.smallEndOuterDiameter);
  compareUnitySifs(result.factors.displacementSifs, entry.caseId);
  compareDeclaredSifs(result.stressFactorSets[0], result.factors.displacementSifs, `${entry.caseId} record`);

  // Table D300's legacy reducer row is geometry-independent. Perturb only the
  // supplementary geometry fields that the normalized schema requires and
  // prove they cannot silently activate the B31J reducer equations.
  const perturbed = calculate('REDUCER', `${entry.caseId}-NON-GOVERNING-PERTURBATION`, {
    ...entry.geometry,
    coneAngleDegrees: 35,
    smallEndTransitionRadius: entry.geometry.smallEndOuterDiameter * 0.2,
    smallEndCylinderLength: Math.sqrt(
      entry.geometry.smallEndOuterDiameter * entry.geometry.smallEndWallThickness,
    ),
  });
  assert.equal(perturbed.status, 'QUALIFIED');
  assert.deepEqual(perturbed.factors, result.factors);
  compareUnitySifs(perturbed.factors.displacementSifs, `${entry.caseId} perturbation`);

  results.push({
    caseId: entry.caseId,
    classification: entry.classification,
    displacementSifs: result.factors.displacementSifs,
    sourceRule: entry.referenceSource.reportedRule,
  });
}

console.log(JSON.stringify({
  check: 'lfea-b3.20-appendix-d-factor-benchmark',
  status: 'PASS',
  issue: fixture.issue,
  editionProfileId: fixture.editionProfileId,
  caseCount: results.length,
  reducerDisposition: fixture.reducerDisposition.status,
  tolerance: fixture.tolerance,
  results,
}, null, 2));
console.log('LFEA B-3.20 Appendix D factor benchmark PASS');

function calculate(componentType, id, geometry) {
  return calculateB31Factors({
    schema: FACTOR_CALCULATION_REQUEST_SCHEMA,
    calculationId: `M026-${id}`,
    componentId: id,
    editionProfileId: fixture.editionProfileId,
    componentType,
    geometry: {
      schema: COMPONENT_GEOMETRY_SCHEMA,
      componentType,
      lengthUnit: fixture.lengthUnit,
      ...geometry,
      sourceEvidence,
    },
    momentDirectionMapping: mapping,
    semanticHash: '',
  });
}

function compareBend(result, reference, label) {
  approximately(result.factors.meanCrossSectionRadius, reference.meanRadius, `${label} r`);
  approximately(result.factors.flexibilityCharacteristic, reference.flexibilityCharacteristic, `${label} h`);
  approximately(
    result.factors.pressureCorrection.flexibilityDenominator,
    reference.flexibilityDenominator,
    `${label} k pressure denominator`,
  );
  approximately(
    result.factors.pressureCorrection.sifDenominator,
    reference.sifDenominator,
    `${label} i pressure denominator`,
  );
  approximately(result.factors.flexibility.inPlane, reference.flexibility, `${label} k`);
  approximately(result.factors.flexibility.outOfPlane, reference.flexibility, `${label} k out-of-plane`);
  approximately(result.factors.displacementSifs.inPlaneBending, reference.inPlaneSif, `${label} ii`);
  approximately(result.factors.displacementSifs.outOfPlaneBending, reference.outOfPlaneSif, `${label} io`);
}


function compareDeclaredSifs(factorSet, values, label) {
  assert.equal(factorSet.schema, 'fea-b31-stress-factor-set/v1', `${label} schema`);
  for (const field of ['axial', 'torsional', 'inPlaneBending', 'outOfPlaneBending']) {
    approximately(factorSet.displacementSifs[field].value, values[field], `${label} ${field}`);
  }
}

function compareUnitySifs(sifs, label) {
  assert.equal(sifs.axial, 1, `${label} axial`);
  assert.equal(sifs.torsional, 1, `${label} torsional`);
  assert.equal(sifs.inPlaneBending, 1, `${label} in-plane`);
  assert.equal(sifs.outOfPlaneBending, 1, `${label} out-of-plane`);
}

function approximately(actual, expected, label) {
  const scale = Math.max(1, Math.abs(expected));
  const tolerance = Math.max(
    fixture.tolerance.derivedAbsolute,
    derivedTolerance * scale,
  );
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} does not match ${expected} within ${tolerance}.`,
  );
}

function summaryBend(result) {
  return {
    h: result.factors.flexibilityCharacteristic,
    k: result.factors.flexibility.inPlane,
    ii: result.factors.displacementSifs.inPlaneBending,
    io: result.factors.displacementSifs.outOfPlaneBending,
  };
}
