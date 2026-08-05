#!/usr/bin/env node

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  VariableSpringHangerError,
  buildAnvilVariableSpringCatalog,
  recoverProgrammedVariableSpringHangerAction,
  selectProgrammedVariableSpringHanger,
  theoreticalColdLoad,
  variableSpringSupportForce,
} from '../src/core/linear-fea-variable-spring-hanger/index.js';
import { buildBm3CiiComparison } from './lfea-m028-bm3-comparison.mjs';
import { solveBm3WithProgrammedHangers } from './lfea-m029-bm3-hangers.mjs';

const REPORT_PATH = fileURLToPath(new URL('../reports/m029-bm3-hanger-qualification.json', import.meta.url));
const BASELINE = Object.freeze({ passed: 2389, failed: 1391, total: 3780 });
const IMPROVED = Object.freeze({ passed: 2469, failed: 1311, total: 3780 });
const EXPECTED_SELECTION = Object.freeze({
  '20': Object.freeze({ figure: '98', size: '11' }),
  '22': Object.freeze({ figure: 'B-268', size: '11' }),
});

console.log('\n--- M029 BM3 program-designed variable spring hangers ---');

// Independent constitutive proof: downward travel increases the upward support load.
const syntheticCold = theoreticalColdLoad({ hotLoad: 1000, signedOperatingTravel: -0.01, springRate: 20000 });
assert.equal(syntheticCold, 800);
assert.equal(variableSpringSupportForce({ theoreticalColdLoad: syntheticCold, springRate: 20000, displacement: -0.01 }), 1000);

const catalog = buildAnvilVariableSpringCatalog();
assert.equal(catalog.sourceIdentity.documentId, 'PP-SUB-82-C82-v01');
assert.ok(catalog.entries.length > 100);
assert.throws(
  () => selectProgrammedVariableSpringHanger({
    designId: 'TOO-MUCH-TRAVEL',
    nodeId: 'X',
    hotLoad: 1000,
    signedOperatingTravel: -1,
    catalog,
  }),
  (error) => error instanceof VariableSpringHangerError && error.code === 'VARIABLE_SPRING_CONSTANT_SUPPORT_REQUIRED',
);

const baseline = buildBm3CiiComparison();
assert.deepEqual(
  { passed: baseline.summary.passed, failed: baseline.summary.failed, total: baseline.summary.total },
  BASELINE,
  'M029 must retain the exact M028 baseline before adding hangers.',
);

const result = solveBm3WithProgrammedHangers();
const { solved, comparison, caesarHangers } = result;
assert.deepEqual(solved.hangerDesign.declarations.map((row) => row.nodeId), ['20', '22']);
assert.equal(solved.hangerDesign.catalogId, catalog.catalogId);
assert.equal(solved.hangerDesign.designs.length, 2);
assert.equal(solved.hangerDesign.compiledHangers.length, 2);
assert.equal(solved.report.gaps.some((row) => row.code === 'HANGER_SUPPORT_NOT_COMPILED'), false);
assert.ok(solved.report.gaps.some((row) => row.code === 'DECLARED_FORCE_F1_NOT_COMPILED'));
assert.ok(solved.report.gaps.some((row) => row.code === 'BEND_SOURCE_SPAN_COMPILED_AS_STRAIGHT_CHORD'));
assert.ok(solved.report.gaps.some((row) => row.code === 'REDUCER_CANDIDATE_PENDING_PARITY'));

const oracleByNode = new Map(caesarHangers.map((row) => [row.nodeId, row]));
const designEvidence = [];
for (const design of solved.hangerDesign.designs) {
  const expected = EXPECTED_SELECTION[design.nodeId];
  const oracle = oracleByNode.get(design.nodeId);
  const authority = solved.hangerDesign.compiledHangers.find((row) => row.nodeId === design.nodeId);
  assert.ok(expected && oracle && authority, `complete hanger evidence for node ${design.nodeId}`);
  assert.equal(design.selected.figure, expected.figure);
  assert.equal(design.selected.size, expected.size);
  assert.equal(design.selected.figure, oracle.figure);
  assert.equal(design.selected.size, oracle.size);
  assert.equal(design.selected.entryId, design.candidates.find((row) => row.accepted).entryId);
  assert.ok(design.candidates.slice(0, design.candidates.findIndex((row) => row.accepted)).every((row) => !row.accepted));
  assert.ok(Math.abs(design.selected.springRate - oracle.springRate) / oracle.springRate <= 5e-5, `node ${design.nodeId} spring rate`);
  assert.ok(Math.abs(design.selected.hotLoad - oracle.hotLoad) / oracle.hotLoad <= 0.051, `node ${design.nodeId} hot load`);
  assert.ok(Math.abs(design.selected.signedOperatingTravel - oracle.signedOperatingTravel) / Math.abs(oracle.signedOperatingTravel) <= 0.145, `node ${design.nodeId} travel`);
  assert.ok(Math.abs(design.selected.theoreticalColdLoad - oracle.theoreticalColdLoad) / oracle.theoreticalColdLoad <= 0.09, `node ${design.nodeId} cold load`);
  assert.ok(Math.abs(authority.equilibriumOracle.operatingSupportForce - design.selected.hotLoad) <= 1e-9);
  const recoveredOpe = recoverProgrammedVariableSpringHangerAction({
    authority,
    execution: solved.cases.CASE3_OPE.execution,
  });
  assert.ok(Math.abs(recoveredOpe.totalSupportAction - design.selected.hotLoad) <= 1e-3, `node ${design.nodeId} OPE hot-load recovery`);
  assert.equal(solved.report.cases.CASE3_OPE.nodes.get(design.nodeId).reaction.UY, recoveredOpe.totalSupportAction);
  designEvidence.push({
    nodeId: design.nodeId,
    designInput: design.designInput,
    selected: design.selected,
    rejectedCandidateCount: design.candidates.findIndex((row) => row.accepted),
    caesarQualificationOracle: oracle,
    opeRecoveredSupportAction: recoveredOpe,
  });
}

for (const caseKey of ['CASE3_OPE', 'CASE4_SUS', 'CASE5_OCC']) {
  const qualification = solved.report.solverQualification[caseKey];
  assert.equal(qualification.status, 'QUALIFIED', `${caseKey} must qualify`);
  assert.equal(qualification.diagnostics.forceEquilibrium.status, 'PASS');
  assert.equal(qualification.diagnostics.momentEquilibrium.status, 'PASS');
  assert.equal(qualification.diagnostics.forceEquilibrium.groundedSpringCount, 2);
  assert.equal(qualification.diagnostics.momentEquilibrium.groundedSpringCount, 2);
  assert.equal(qualification.factorization.negativePivotCount, 0);
}
assert.equal(solved.report.solverQualification.CASE6_EXP.status, 'DERIVED');
assert.equal(solved.report.solverQualification.CASE7_EXP.status, 'DERIVED');

assert.deepEqual(
  { passed: comparison.summary.passed, failed: comparison.summary.failed, total: comparison.summary.total },
  IMPROVED,
);
assert.equal(comparison.summary.passed - baseline.summary.passed, 80);
assert.equal(comparison.summary.failed - baseline.summary.failed, -80);
assert.deepEqual(comparison.summary.byCase, {
  CASE3_OPE: { total: 756, passed: 535, failed: 221 },
  CASE4_SUS: { total: 756, passed: 558, failed: 198 },
  CASE5_OCC: { total: 756, passed: 434, failed: 322 },
  CASE6_EXP: { total: 756, passed: 469, failed: 287 },
  CASE7_EXP: { total: 756, passed: 473, failed: 283 },
});
assert.deepEqual(comparison.summary.byFamily, {
  displacement: { total: 750, passed: 106, failed: 644 },
  restraint: { total: 150, passed: 136, failed: 14 },
  globalForce: { total: 1440, passed: 1197, failed: 243 },
  localForce: { total: 1440, passed: 1030, failed: 410 },
});
assert.equal(comparison.summary.byCause.HANGER_SUPPORT_NOT_COMPILED, undefined);
assert.equal(comparison.summary.byCause.DECLARED_FORCE_F1_NOT_COMPILED, 892);
assert.equal(comparison.summary.byCause.BEND_SOURCE_SPAN_COMPILED_AS_STRAIGHT_CHORD, comparison.summary.failed);
assert.ok(comparison.failures.every((row) => row.causes.length > 0));

const retained = {
  schema: 'm029-bm3-programmed-hanger-qualification/v1',
  status: 'PASS_WITH_DISCLOSED_GAPS',
  sourceSemanticHash: solved.source.semanticHash,
  authority: {
    catalogId: solved.hangerDesign.catalogId,
    catalogSemanticHash: solved.hangerDesign.catalogSemanticHash,
    designMethod: 'RESTRAINED_WEIGHT_THEN_OPERATING_TRAVEL_THEN_FIRST_VALID_CATALOG_ENTRY_V1',
    compileMethod: 'GLOBAL_Y_LINEAR_SPRING_PLUS_THEORETICAL_COLD_LOAD_PRELOAD_V1',
    recoveryMethod: 'TOTAL_SUPPORT_ACTION_EQUALS_COLD_LOAD_MINUS_K_TIMES_DISPLACEMENT_V1',
  },
  designEvidence,
  solverQualification: solved.report.solverQualification,
  unresolvedGaps: solved.report.gaps,
  baseline: baseline.summary,
  improved: comparison.summary,
  delta: {
    passed: comparison.summary.passed - baseline.summary.passed,
    failed: comparison.summary.failed - baseline.summary.failed,
  },
  failures: comparison.failures,
};
writeFileSync(REPORT_PATH, `${JSON.stringify(retained, null, 2)}\n`);

console.log(JSON.stringify({
  check: 'm029-bm3-programmed-spring-hangers',
  selections: designEvidence.map((row) => ({
    nodeId: row.nodeId,
    figure: row.selected.figure,
    size: row.selected.size,
    hotLoad: row.selected.hotLoad,
    signedOperatingTravel: row.selected.signedOperatingTravel,
    springRate: row.selected.springRate,
    theoreticalColdLoad: row.selected.theoreticalColdLoad,
  })),
  baseline: retained.baseline,
  improved: retained.improved,
  delta: retained.delta,
  remainingGaps: retained.unresolvedGaps.map((row) => row.code),
}, null, 2));
console.log(`M029 PASS WITH DISCLOSED GAPS: ${comparison.summary.passed}/${comparison.summary.total} within ±10%; hanger authority removes 80 failures.`);
