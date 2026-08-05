#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { firstElement } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import { buildBm3CiiComparison } from './lfea-m028-bm3-comparison.mjs';
import { BM3_INPUT_PATH, buildBm3Authorities, teeNodes } from './lfea-m028-bm3-fixtures.mjs';

console.log('\n--- M028 BM3 real ingestion, solve, diagnostics, and CAESAR II comparison ---');

const authorities = buildBm3Authorities();
const inputXml = readFileSync(BM3_INPUT_PATH, 'utf8');
const header = firstElement(inputXml, ['PIPINGMODEL']).attributes;
const declared = Object.freeze({
  elements: Number(header.NUMELT),
  bends: Number(header.NUMBEND),
  rigids: Number(header.NUMRIGID),
  restraints: Number(header.NUMREST),
  forceMoments: Number(header.NUMFORCMNT),
});

assert.equal(authorities.parsed.valid, true, 'BM3 InputXML canonical geometry must validate.');
assert.equal(authorities.normalized.geometry.segments.length, declared.elements);
assert.equal(authorities.normalized.geometry.segments.filter((row) => row.type === 'BEND').length, declared.bends);
assert.equal(authorities.rigidDefinitions.size, declared.rigids);
assert.equal(authorities.normalized.geometry.nodes.flatMap((row) => row.meta.restraints ?? []).length, declared.restraints);
const forceRecords = authorities.normalized.geometry.segments.flatMap((row) => row.meta.analysis.forcesMoments ?? []);
assert.equal(forceRecords.length, declared.forceMoments);
assert.deepEqual(forceRecords.map((row) => row.nodeId), ['65', '100']);
assert.deepEqual(forceRecords.map((row) => row.vectors[0].force.fy), [-4000, -4000]);

const rigidRows = [...authorities.rigidDefinitions.values()];
assert.equal(rigidRows.length, 5);
assert.ok(rigidRows.every((row) => row.sourceSegment.meta.analysis.rigid.type === 'Valve'));
assert.ok(rigidRows.every((row) => row.sourceSegment.meta.analysis.rigid.weight > 0));
assert.ok(rigidRows.every((row) => row.T1.gravity.enteredRigidWeight === row.sourceSegment.meta.analysis.rigid.weight));
assert.deepEqual(teeNodes(authorities.normalized.geometry), ['35', '40']);
assert.deepEqual([...authorities.reducerDefinitions.keys()], ['IX-S16', 'IX-S23']);
assert.ok([...authorities.reducerDefinitions.values()].every((row) => row.T1.parityStatus === 'CANDIDATE_PENDING_SECTION_SAMPLING_VERIFICATION'));

const diagnostics = authorities.analysisGeometry.diagnostics;
assert.equal(diagnostics.filter((row) => row.code === 'INPUTXML_HANGER_PRESENT_NOT_COMPILED').length, 2);
assert.equal(diagnostics.filter((row) => row.code === 'INPUTXML_FORCES_MOMENTS_PRESENT_NOT_COMPILED').length, 2);
assert.ok(diagnostics.some((row) => row.code === 'M028_REDUCER_CANDIDATE_PENDING_PARITY'));
assert.ok(diagnostics.some((row) => row.code === 'M028_BEND_SOURCE_SPAN_COMPILED_AS_STRAIGHT_CHORD'));

const comparison = buildBm3CiiComparison();
for (const caseKey of ['CASE3_OPE', 'CASE4_SUS', 'CASE5_OCC']) {
  const qualification = comparison.solverQualification[caseKey];
  assert.equal(qualification.status, 'QUALIFIED', `${caseKey} solver status`);
  assert.ok(qualification.diagnostics.residual.value <= 1e-6, `${caseKey} residual`);
  assert.equal(qualification.diagnostics.residual.status, 'PASS');
  assert.equal(qualification.diagnostics.forceEquilibrium.status, 'PASS');
  assert.equal(qualification.diagnostics.momentEquilibrium.status, 'PASS');
  assert.equal(qualification.diagnostics.energyBalance.status, 'PASS');
  assert.equal(qualification.diagnostics.conditioning.status, 'PASS');
  assert.equal(qualification.factorization.negativePivotCount, 0);
}
assert.equal(comparison.solverQualification.CASE6_EXP.status, 'DERIVED');
assert.equal(comparison.solverQualification.CASE7_EXP.status, 'DERIVED');
for (const [caseKey, count] of Object.entries(comparison.declaredCounts.displacement)) assert.equal(count, 25, `${caseKey} displacement count`);
for (const [caseKey, count] of Object.entries(comparison.declaredCounts.restraint)) assert.equal(count, 5, `${caseKey} restraint count`);
for (const [caseKey, count] of Object.entries(comparison.declaredCounts.globalForce)) assert.equal(count, 24, `${caseKey} global-force count`);
for (const [caseKey, count] of Object.entries(comparison.declaredCounts.localForce)) assert.equal(count, 24, `${caseKey} local-force count`);
assert.equal(comparison.summary.total, 3780);
assert.equal(comparison.summary.passed + comparison.summary.failed, comparison.summary.total);
assert.ok(comparison.summary.failed > 0, 'Known hanger and F1 omissions should produce disclosed failures; a clean pass would be suspicious.');
assert.ok(comparison.failures.every((row) => row.causes.length > 0), 'Every out-of-tolerance scalar must carry a named cause.');
assert.ok(comparison.failures.every((row) => row.causes.every((cause) => typeof cause.code === 'string' && cause.code.length > 0)));
assert.equal(comparison.summary.byCause.HANGER_SUPPORT_NOT_COMPILED, comparison.summary.failed);
assert.equal(
  comparison.summary.byCause.DECLARED_FORCE_F1_NOT_COMPILED,
  comparison.summary.byCase.CASE5_OCC.failed + comparison.summary.byCase.CASE6_EXP.failed + comparison.summary.byCase.CASE7_EXP.failed,
);

const retained = {
  schema: comparison.schema,
  status: 'PASS_WITH_DISCLOSED_GAPS',
  sourceSemanticHash: comparison.inputSourceSemanticHash,
  declaredInputCounts: declared,
  ingestion: comparison.ingestion,
  diagnostics: diagnostics.map((row) => ({ severity: row.severity, code: row.code, message: row.message, data: row.data ?? null })),
  gaps: comparison.gaps,
  solverQualification: comparison.solverQualification,
  methodology: comparison.methodology,
  declaredOutputCounts: comparison.declaredCounts,
  summary: comparison.summary,
  failures: comparison.failures,
};
writeFileSync(
  fileURLToPath(new URL('../reports/m028-bm3-qualification.json', import.meta.url)),
  `${JSON.stringify(retained, null, 2)}\n`,
);

console.log(JSON.stringify({
  check: 'm028-bm3',
  status: retained.status,
  declaredInputCounts: declared,
  ingestion: comparison.ingestion,
  outputScalarComparison: comparison.summary,
  namedGaps: comparison.gaps.map((row) => row.code),
}, null, 2));
console.log(`M028 BM3 PASS WITH DISCLOSED GAPS: ${comparison.summary.passed}/${comparison.summary.total} scalars within ±10%; ${comparison.summary.failed} failures retain named causes.`);
