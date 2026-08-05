#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_RESTRAINT_TYPE_CODE_MAP } from '../src/core/geometry/adapters/inputxml-restraint-type-mutation.js';
import { fileURLToPath } from 'node:url';
import { inputXmlToCanonicalGeometry } from '../src/core/geometry/adapters/inputXmlToCanonicalGeometry.js';
import { auditInputXmlIngestion } from '../src/core/geometry/adapters/inputxml-ingestion-audit.js';

export const BM2_INPUT_PATH = fileURLToPath(new URL('../benchmarks/LFEA/BM2/Input_BM2.xml', import.meta.url));
export const BM2_OUTPUT_PATH = fileURLToPath(new URL('../benchmarks/LFEA/BM2/Output_BM2.xml', import.meta.url));

function countBy(rows, key) {
  const result = {};
  for (const row of rows) result[row[key]] = (result[row[key]] ?? 0) + 1;
  return result;
}

export function buildBm2IngestionAudit() {
  const xmlText = readFileSync(BM2_INPUT_PATH, 'utf8');
  const geometry = inputXmlToCanonicalGeometry(xmlText, {
    unit: 'mm',
    source: 'CAESAR-II-BM2-INPUTXML',
    restraintTypeCodeMap: DEFAULT_RESTRAINT_TYPE_CODE_MAP,
    bendRadiusTolerance: 1e-6,
  });
  return Object.freeze({ xmlText, geometry, audit: auditInputXmlIngestion(xmlText, geometry) });
}

console.log('\n--- LFEA B-3.25 M027 BM2 real InputXML ingestion + diagnostics ---');
const first = buildBm2IngestionAudit();
const second = buildBm2IngestionAudit();
const { geometry, audit } = first;

assert.equal(readFileSync(BM2_INPUT_PATH, 'utf8'), first.xmlText);
assert.ok(readFileSync(BM2_OUTPUT_PATH, 'utf8').includes('DISPLACEMENT_REPORT'));
assert.equal(geometry.summary.inputXmlUnitsDeclared, true);
assert.equal(geometry.summary.inputXmlLengthUnit, 'mm');
assert.equal(geometry.valid, true, JSON.stringify(geometry.diagnostics.filter((row) => row.severity === 'error')));
assert.equal(audit.valid, true, JSON.stringify(audit.diagnostics.filter((row) => row.severity === 'error')));
assert.equal(audit.schema, 'fea-inputxml-ingestion-audit/v1');
assert.deepEqual(audit.declared, { elements: 35, bends: 11, rigids: 9, restraints: 5 });
assert.equal(audit.actual.elements, 35);
assert.equal(audit.actual.bends, 11);
assert.equal(audit.actual.rigids, 9);
assert.equal(audit.fatalDiagnosticCount, 0);
assert.equal(audit.silentDropCount, 0);
assert.equal(audit.unrecognizedElementAttributes.length, 0, JSON.stringify(audit.unrecognizedElementAttributes));

const rigidTypes = countBy(audit.rigidElements, 'classification');
assert.deepEqual(rigidTypes, { FLANGE_PAIR: 2, VALVE: 6, UNSPECIFIED: 1 });
const zeroWeight = audit.rigidElements.filter((row) => row.sentinelNormalized);
assert.equal(zeroWeight.length, 1);
assert.equal(zeroWeight[0].fromNode, '300');
assert.equal(zeroWeight[0].toNode, '310');
assert.equal(zeroWeight[0].rawWeight, -1.0101);
assert.equal(zeroWeight[0].enteredWeight, 0);
assert.equal(zeroWeight[0].weightAuthority, 'CAESAR_UNSET_SENTINEL_ZERO');
assert.ok(audit.rigidElements.filter((row) => !row.sentinelNormalized).every((row) => Number.isFinite(row.enteredWeight) && row.enteredWeight > 0));
assert.ok(audit.diagnostics.some((row) => row.code === 'INPUTXML_RIGID_WEIGHT_SENTINEL_NORMALIZED'));

const teeNodeIds = new Set(audit.teeNodes.map((row) => row.nodeId));
for (const expected of ['30', '70', '100', '140']) assert.ok(teeNodeIds.has(expected), `Missing shared-node branch ${expected}`);
assert.ok(audit.teeNodes.every((row) => row.incidentSegmentIds.length >= 3));

const activeSifTypes = new Set(audit.sifRecords.map((row) => row.typeCode));
assert.ok(activeSifTypes.has(3));
assert.ok(activeSifTypes.has(5));
assert.ok(activeSifTypes.has(11));
const unknownSifs = audit.sifRecords.filter((row) => row.classification === 'UNKNOWN');
assert.ok(unknownSifs.length > 0);
assert.ok(unknownSifs.some((row) => row.typeCode === 11));
assert.ok(unknownSifs.every((row) => ![3, 5].includes(row.typeCode)));
assert.equal(
  audit.diagnostics.filter((row) => row.code === 'INPUTXML_SIF_TYPE_UNKNOWN').length,
  unknownSifs.length,
);

// DEFAULT_RESTRAINT_TYPE_CODE_MAP now classifies corrected type 15 (raw 18)
// as GUIDE (+Z), so BM2's own restraint set -- 6 occurrences across 5 nodes
// -- resolves completely; there is no remaining UNKNOWN restraint in this
// benchmark to assert against. The "an unmapped code stays UNKNOWN, never
// guessed" behavior is covered against a synthetic unmapped code in
// LD-05 (lfea-inputxml-load-diagnostics-check.mjs) instead.
const unknownRestraints = audit.restraintRecords.filter((row) => row.classification === 'UNKNOWN');
assert.equal(unknownRestraints.length, 0);
assert.ok(audit.restraintRecords.some((row) => row.sourceTypeCode === '18' && row.typeCode === '15' && row.classification === 'GUIDE'));
assert.ok(geometry.diagnostics.some((row) => row.code === 'INPUTXML_RESTRAINT_TYPE_MUTATED'));
assert.ok(geometry.diagnostics.some((row) => row.code === 'INPUTXML_SIF_PRESENT_NOT_COMPILED'));

assert.equal(JSON.stringify(first.audit), JSON.stringify(second.audit), 'BM2 ingestion audit must be deterministic.');

const ownSource = readFileSync(new URL('./lfea-b3.25-bm2-inputxml-ingestion-check.mjs', import.meta.url), 'utf8');
const importSection = ownSource.slice(0, ownSource.indexOf('export const BM2_INPUT_PATH'));
for (const forbidden of ['linear-fea-solver', 'compileSolverExecution', 'compileCodeResult', 'solveBm1InputXml']) {
  assert.equal(importSection.includes(forbidden), false, `Phase 1 must not import solve/code ownership: ${forbidden}`);
}

const summary = {
  elements: audit.actual.elements,
  nodes: audit.actual.nodes,
  bends: audit.actual.bends,
  rigids: audit.actual.rigids,
  rigidTypes,
  teeNodes: audit.teeNodes.map((row) => row.nodeId),
  sifTypes: [...activeSifTypes].sort((a, b) => (a ?? Infinity) - (b ?? Infinity)),
  unknownSifTypeCounts: countBy(unknownSifs, 'typeCode'),
  unknownRestraints: unknownRestraints.length,
  diagnostics: countBy(audit.diagnostics, 'code'),
};
console.log(JSON.stringify(summary, null, 2));
console.log('LFEA B-3.25 M027 BM2 ingestion + diagnostics PASS');
