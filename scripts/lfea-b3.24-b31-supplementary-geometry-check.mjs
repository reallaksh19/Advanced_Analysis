#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  B31FactorCalculatorError,
  SUPPLEMENTARY_GEOMETRY_SCHEMA,
  SUPPLEMENTARY_GEOMETRY_SET_SCHEMA,
  calculateB31FactorsFromCanonicalGeometry,
  calculateB31FactorsFromInputXml,
  requireSupplementaryGeometrySet,
  sealSupplementaryGeometrySet,
} from '../src/core/linear-fea-b31-factor-calculator/index.js';

const mapping = Object.freeze({ inPlaneField: 'my', outOfPlaneField: 'mz' });
const xmlText = readFileSync(fileURLToPath(new URL('../benchmarks/LFEA/BM1/BM1_InputXML.xml', import.meta.url)), 'utf8');

function hash(value) {
  return semanticHash(value);
}

function source(label) {
  return {
    sourceId: label,
    sourceRevision: '01',
    sourceSemanticHash: hash({ label, revision: '01' }),
  };
}

function bendEntry({ unit, outerDiameter, wallThickness, bendRadius, segmentId = 'IX-S5' }) {
  return {
    schema: SUPPLEMENTARY_GEOMETRY_SCHEMA,
    segmentId,
    componentType: 'BEND',
    lengthUnit: unit,
    geometry: {
      outerDiameter,
      wallThickness,
      bendRadius,
      bendAngleDegrees: 90,
      smooth90FlexibilityCorrection: true,
      pressure: 2.15e6,
      elasticModulus: 203.395328e9,
    },
    sourceEvidence: source(`SUPPLEMENT-${segmentId}-${unit}`),
  };
}

function set(entries, id = 'B31-SUPPLEMENTARY-SET-01') {
  return sealSupplementaryGeometrySet({
    schema: SUPPLEMENTARY_GEOMETRY_SET_SCHEMA,
    geometrySetId: id,
    sourceIdentity: source(`${id}-SOURCE`),
    entries,
    semanticHash: '',
  });
}

function close(actual, expected, label, tolerance = 1e-12) {
  const scale = Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tolerance * scale, `${label}: ${actual} != ${expected}`);
}

console.log('\n--- LFEA B-3.24 sealed B31 supplementary geometry custody ---');

const sorted = set([
  bendEntry({ unit: 'mm', outerDiameter: 323.850006, wallThickness: 9.525, bendRadius: 457.199982, segmentId: 'IX-S5' }),
  bendEntry({ unit: 'mm', outerDiameter: 323.850006, wallThickness: 9.525, bendRadius: 457.199982, segmentId: 'IX-S4' }),
]);
assert.deepEqual(sorted.entries.map((entry) => entry.segmentId), ['IX-S4', 'IX-S5']);
assert.equal(Object.isFrozen(sorted), true);
assert.deepEqual(requireSupplementaryGeometrySet(sorted), sorted);

assert.throws(
  () => set([
    bendEntry({ unit: 'mm', outerDiameter: 323.850006, wallThickness: 9.525, bendRadius: 457.199982 }),
    bendEntry({ unit: 'm', outerDiameter: 0.323850006, wallThickness: 0.009525, bendRadius: 0.457199982 }),
  ], 'B31-SUPPLEMENTARY-DUPLICATE'),
  (error) => error instanceof B31FactorCalculatorError && error.code === 'B31_FACTOR_SUPPLEMENTARY_SEGMENT_DUPLICATE',
);
assert.throws(
  () => requireSupplementaryGeometrySet({ ...sorted, geometrySetId: 'STALE-ID' }),
  (error) => error instanceof B31FactorCalculatorError && error.code === 'B31_FACTOR_HASH_MISMATCH',
);

const millimetres = set([
  bendEntry({ unit: 'mm', outerDiameter: 323.850006, wallThickness: 9.525, bendRadius: 457.199982 }),
], 'B31-SUPPLEMENTARY-MM');
const metres = set([
  bendEntry({ unit: 'm', outerDiameter: 0.323850006, wallThickness: 0.009525, bendRadius: 0.457199982 }),
], 'B31-SUPPLEMENTARY-M');
const calculate = (supplementaryGeometrySet) => calculateB31FactorsFromInputXml({
  xmlText,
  inputXmlOptions: { unit: 'mm', source: 'CAESAR-II-BM1-LIVE-INPUTXML' },
  editionProfileId: 'B31_3_2020_B31J_2017',
  momentDirectionMapping: mapping,
  segmentIds: ['IX-S5'],
  supplementaryGeometrySet,
})[0];
const fromMm = calculate(millimetres);
const fromM = calculate(metres);
assert.equal(fromMm.status, 'QUALIFIED');
assert.equal(fromM.status, 'QUALIFIED');
close(fromMm.geometry.outerDiameter, fromM.geometry.outerDiameter, 'unit-equivalent OD');
close(fromMm.geometry.wallThickness, fromM.geometry.wallThickness, 'unit-equivalent wall');
close(fromMm.geometry.bendRadius, fromM.geometry.bendRadius, 'unit-equivalent radius');
close(fromMm.factors.flexibility.inPlane, fromM.factors.flexibility.inPlane, 'unit-equivalent flexibility');
close(fromMm.factors.displacementSifs.inPlaneBending, fromM.factors.displacementSifs.inPlaneBending, 'unit-equivalent SIF');
assert.match(fromMm.geometry.sourceEvidence.sourceId, /SUPPLEMENT-IX-S5-mm/u);

const teeCanonical = {
  source: 'STAGED-TEST',
  schemaVersion: 'test-v1',
  unit: 'm',
  summary: { jobName: 'SUPPLEMENTARY-TEE-TEST' },
  segments: [{
    id: 'TEE-SEGMENT-01',
    type: 'TEE',
    sourceComponentUid: 'TEE-SEGMENT-01',
    diameter: 0.6096,
    thickness: 0.00953,
    meta: {},
  }],
};
assert.throws(
  () => calculateB31FactorsFromCanonicalGeometry({
    canonicalGeometry: teeCanonical,
    editionProfileId: 'B31_3_2020_B31J_2017',
    momentDirectionMapping: mapping,
    segmentIds: ['TEE-SEGMENT-01'],
  }),
  (error) => error instanceof B31FactorCalculatorError
    && error.code === 'B31_FACTOR_TEE_SUPPLEMENTARY_GEOMETRY_REQUIRED',
);
assert.throws(
  () => calculateB31FactorsFromCanonicalGeometry({
    canonicalGeometry: teeCanonical,
    editionProfileId: 'B31_3_2020_B31J_2017',
    momentDirectionMapping: mapping,
    segmentIds: ['TEE-SEGMENT-01'],
    supplementaryGeometryBySegmentId: {
      'TEE-SEGMENT-01': { componentType: 'WELDING_TEE' },
    },
  }),
  (error) => error instanceof B31FactorCalculatorError
    && error.code === 'B31_FACTOR_TEE_SUPPLEMENTARY_GEOMETRY_REQUIRED',
);

const teeSet = set([{
  schema: SUPPLEMENTARY_GEOMETRY_SCHEMA,
  segmentId: 'TEE-SEGMENT-01',
  componentType: 'WELDING_TEE',
  lengthUnit: 'm',
  geometry: {
    runOuterDiameter: null,
    runWallThickness: null,
    branchOuterDiameter: 0.508,
    branchWallThickness: 0.00953,
    fittingQuality: 'VERIFIED_B16_9',
  },
  sourceEvidence: source('TEE-GEOMETRY-DATASHEET'),
}], 'B31-SUPPLEMENTARY-TEE');
const tee = calculateB31FactorsFromCanonicalGeometry({
  canonicalGeometry: teeCanonical,
  editionProfileId: 'B31_3_2020_B31J_2017',
  momentDirectionMapping: mapping,
  segmentIds: ['TEE-SEGMENT-01'],
  supplementaryGeometrySet: teeSet,
})[0];
assert.equal(tee.status, 'QUALIFIED');
assert.equal(tee.componentType, 'WELDING_TEE');
assert.match(tee.geometry.sourceEvidence.sourceId, /TEE-GEOMETRY-DATASHEET/u);

console.log(JSON.stringify({
  check: 'lfea-b3.24-b31-supplementary-geometry',
  status: 'PASS',
  setHash: millimetres.semanticHash,
  bendFactor: fromMm.factors.flexibility.inPlane,
  teeStatus: tee.status,
}, null, 2));
console.log('LFEA B-3.24 sealed B31 supplementary geometry custody PASS');
