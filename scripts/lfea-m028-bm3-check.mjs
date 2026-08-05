#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { firstElement } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import {
  BM3_BASE_CASES,
  BM3_INPUT_PATH,
  analyseBaseCase,
  buildBm3Authorities,
  teeNodes,
} from './lfea-m028-bm3-fixtures.mjs';

console.log('\n--- M028 BM3 source ingestion and physical-solver qualification ---');

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

assert.equal(authorities.parsed.valid, true);
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
assert.deepEqual(teeNodes(authorities.normalized.geometry), ['35', '40']);
assert.deepEqual([...authorities.reducerDefinitions.keys()], ['IX-S16', 'IX-S23']);

const diagnostics = authorities.analysisGeometry.diagnostics;
assert.equal(diagnostics.filter((row) => row.code === 'INPUTXML_HANGER_PRESENT_NOT_COMPILED').length, 2);
assert.equal(diagnostics.filter((row) => row.code === 'INPUTXML_FORCES_MOMENTS_PRESENT_NOT_COMPILED').length, 2);
assert.ok(diagnostics.some((row) => row.code === 'M028_REDUCER_CANDIDATE_PENDING_PARITY'));
assert.ok(diagnostics.some((row) => row.code === 'M028_BEND_SOURCE_SPAN_COMPILED_AS_STRAIGHT_CHORD'));

const solverQualification = {};
for (const [caseKey, policy] of Object.entries(BM3_BASE_CASES)) {
  const analysis = analyseBaseCase(authorities, caseKey, policy);
  assert.equal(analysis.execution.status, 'QUALIFIED', `${caseKey} solver status`);
  assert.equal(analysis.execution.diagnostics.residual.status, 'PASS');
  assert.equal(analysis.execution.diagnostics.forceEquilibrium.status, 'PASS');
  assert.equal(analysis.execution.diagnostics.momentEquilibrium.status, 'PASS');
  assert.equal(analysis.execution.diagnostics.energyBalance.status, 'PASS');
  assert.equal(analysis.execution.factorization.pivotStatistics.negativePivotCount, 0);
  solverQualification[caseKey] = Object.freeze({
    formula: policy.formula,
    status: analysis.execution.status,
    diagnostics: analysis.execution.diagnostics,
    factorization: Object.freeze({
      backend: analysis.execution.factorization.backend,
      kind: analysis.execution.factorization.kind,
      conditionEstimate: analysis.execution.factorization.conditionEstimate,
      pivotStatistics: analysis.execution.factorization.pivotStatistics,
    }),
  });
}

const retained = Object.freeze({
  schema: 'm028-bm3-source-solver-qualification/v2',
  status: 'PASS_WITH_DISCLOSED_GAPS',
  sourceSemanticHash: authorities.source.semanticHash,
  declaredInputCounts: declared,
  ingestion: Object.freeze({
    sourceNodes: authorities.normalized.geometry.nodes.length,
    sourceElements: authorities.normalized.geometry.segments.length,
    analysisNodes: authorities.analysisGeometry.nodes.length,
    analysisElements: authorities.modelEntries.length,
  }),
  diagnostics: diagnostics.map((row) => ({ severity: row.severity, code: row.code, message: row.message, data: row.data ?? null })),
  retainedForceMomentRecords: forceRecords,
  solverQualification,
  numericalOutputParity: 'NOT_EVALUATED_BY_THIS_CHECK',
  latestOutputAuthority: 'scripts/lfea-bm3-consolidated-latest-output-check.mjs',
});
writeFileSync(
  fileURLToPath(new URL('../reports/m028-bm3-qualification.json', import.meta.url)),
  `${JSON.stringify(retained, null, 2)}\n`,
);

console.log(JSON.stringify({
  check: 'm028-bm3-source-solver',
  status: retained.status,
  declaredInputCounts: declared,
  ingestion: retained.ingestion,
  physicalCases: Object.fromEntries(Object.entries(solverQualification).map(([key, value]) => [key, value.status])),
  numericalOutputParity: retained.numericalOutputParity,
}, null, 2));
console.log('M028 source and physical-solver qualification PASS; latest numerical parity is evaluated separately.');
