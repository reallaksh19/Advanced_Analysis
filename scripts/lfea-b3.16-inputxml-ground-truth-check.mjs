#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inputXmlToCanonicalGeometry } from '../src/core/geometry/adapters/inputXmlToCanonicalGeometry.js';
import { buildBm1InputXmlAuthorities } from './lfea-b3.15-bm1-inputxml-fixtures.mjs';
import {
  INPUTXML_RESOLVED_GROUND_TRUTH_SCHEMA,
  buildInputXmlResolvedGroundTruth,
  createInputXmlResolvedGroundTruthExports,
  requireInputXmlResolvedGroundTruth,
} from '../src/core/geometry/adapters/inputxml-resolved-ground-truth.js';

const BM1_PATH = fileURLToPath(
  new URL('../benchmarks/LFEA/BM1/BM1_InputXML.xml', import.meta.url),
);

console.log('\n--- LFEA B-3.16 InputXML resolved ground-truth document ---');
const xml = readFileSync(BM1_PATH, 'utf8');
const geometry = inputXmlToCanonicalGeometry(xml, {
  unit: 'mm',
  source: 'CAESAR-II-BM1-LIVE-INPUTXML',
  restraintTypeCodeMap: { 0: 'ANCHOR', 14: 'GUIDE', 8: 'GUIDE', 9: 'GUIDE' },
  bendRadiusTolerance: 1e-6,
});

const first = buildInputXmlResolvedGroundTruth(geometry);
const second = buildInputXmlResolvedGroundTruth(geometry);
const firstExports = createInputXmlResolvedGroundTruthExports(first);
const secondExports = createInputXmlResolvedGroundTruthExports(second);

assert.equal(first.schema, INPUTXML_RESOLVED_GROUND_TRUTH_SCHEMA);
assert.equal(first.summary.nodeCount, 16);
assert.equal(first.summary.elementCount, 15);
assert.equal(first.nodes.length, 16);
assert.equal(first.elements.length, 15);
const analysisAuthorities = buildBm1InputXmlAuthorities();
assert.equal(analysisAuthorities.normalized.geometry.nodes.length, 16, 'source ground truth remains 16 source nodes');
assert.equal(analysisAuthorities.normalized.geometry.segments.length, 15, 'source ground truth remains 15 source elements');
assert.equal(analysisAuthorities.analysisGeometry.nodes.length, 20, 'M024 analysis topology adds four declared bend stations');
assert.equal(analysisAuthorities.analysisGeometry.segments.length, 19, 'M024 analysis topology resolves six bend subspans');
assert.equal(requireInputXmlResolvedGroundTruth(first).semanticHash, first.semanticHash);
assert.deepEqual(second, first);

for (const elementId of ['IX-S1', 'IX-S2', 'IX-S3']) {
  assert.deepEqual(field(elementId, 'insulationDensity'), { status: 'DECLARED', value: 2100 }, `${elementId} now declares its own insulation density (Owner-confirmed fix, 2026-08-04)`);
}
assert.deepEqual(field('IX-S4', 'insulationDensity'), {
  status: 'DECLARED',
  value: 2100,
});
assert.deepEqual(field('IX-S5', 'insulationDensity'), {
  status: 'INHERITED',
  value: 2100,
  fromElement: 'IX-S4',
});
assert.deepEqual(field('IX-S6', 'insulationDensity'), {
  status: 'DECLARED',
  value: 2100,
});
for (let index = 7; index <= 15; index += 1) {
  assert.deepEqual(field(`IX-S${index}`, 'insulationDensity'), {
    status: 'INHERITED',
    value: 2100,
    fromElement: 'IX-S6',
  });
}

assert.deepEqual(field('IX-S2', 'diameter'), {
  status: 'INHERITED',
  value: field('IX-S1', 'diameter').value,
  fromElement: 'IX-S1',
});
assert.deepEqual(field('IX-S2', 'thickness'), {
  status: 'INHERITED',
  value: field('IX-S1', 'thickness').value,
  fromElement: 'IX-S1',
});
assert.deepEqual(field('IX-S2', 'material'), {
  status: 'DECLARED',
  value: 'A106 Grade B',
}, 'the live XML explicitly redeclares MATERIAL_NAME on IX-S2');

const sourceRestraints = first.nodes.flatMap((row) => row.restraints);
assert.ok(sourceRestraints.some((row) => row.sourceTypeCode === '17'
  && row.typeCode === '14' && row.mutationApplied === true));
assert.ok(sourceRestraints.some((row) => row.sourceTypeCode === '7'
  && row.typeCode === '9' && row.mutationApplied === true));

assert.equal(firstExports.length, 3);
assert.equal(firstExports[0].mediaType, 'application/json');
assert.equal(firstExports[1].mediaType, 'text/csv');
assert.equal(firstExports[2].mediaType, 'text/csv');
assert.deepEqual(
  firstExports.map((row) => row.content),
  secondExports.map((row) => row.content),
  'identical input must produce byte-identical JSON and CSV',
);
assert.deepEqual(JSON.parse(firstExports[0].content), JSON.parse(secondExports[0].content));
assert.equal(csvRowCount(firstExports[1].content), 17, 'nodes CSV = header + 16 rows');
assert.equal(csvRowCount(firstExports[2].content), 16, 'elements CSV = header + 15 rows');
assert.ok(firstExports[2].content.includes('insulationDensity_status'));
assert.ok(firstExports[2].content.includes('insulationDensity_from_element'));
assert.ok(firstExports[2].content.includes('IX-S4'));
assert.ok(firstExports[2].content.includes('IX-S6'));

const tampered = structuredClone(first);
tampered.elements[0].fields.pressure.value += 1;
assert.throws(
  () => requireInputXmlResolvedGroundTruth(tampered),
  (error) => error?.code === 'INPUTXML_RESOLVED_GROUND_TRUTH_INVALID',
);

console.log(`source: ${first.source.sourceId}`);
console.log(`document hash: ${first.semanticHash}`);
console.log(`evidence hash: ${first.evidenceHash}`);
console.log(`counts: ${first.summary.nodeCount} nodes / ${first.summary.elementCount} elements`);
console.log('exports: JSON + rectangular nodes CSV + rectangular elements CSV');
console.log('✅ LFEA B-3.16 InputXML resolved ground-truth check passed.\n');

function field(elementId, key) {
  const element = first.elements.find((row) => row.sourceElementId === elementId);
  assert.notEqual(element, undefined, `missing ${elementId}`);
  return element.fields[key];
}

function csvRowCount(content) {
  return content.endsWith('\n')
    ? content.slice(0, -1).split('\n').length
    : content.split('\n').length;
}
