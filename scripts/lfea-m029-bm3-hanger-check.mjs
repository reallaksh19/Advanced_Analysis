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
import { solveBm3WithProgrammedHangers } from './lfea-m029-bm3-hangers.mjs';

const REPORT_PATH = fileURLToPath(new URL('../reports/m029-bm3-hanger-qualification.json', import.meta.url));
const EXPECTED_SELECTION = Object.freeze({
  '20': Object.freeze({ figure: '98', size: '11' }),
  '22': Object.freeze({ figure: 'B-268', size: '11' }),
});

console.log('\n--- M029 BM3 program-designed variable spring hangers ---');

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

const { solved, comparison, caesarHangers } = solveBm3WithProgrammedHangers();
assert.equal(comparison, null, 'M029 design qualification must not invoke the stale pre-renumbering output comparator.');
assert.deepEqual(solved.hangerDesign.declarations.map((row) => row.nodeId), ['20', '22']);
assert.equal(solved.hangerDesign.catalogId, catalog.catalogId);
assert.equal(solved.hangerDesign.designs.length, 2);
assert.equal(solved.hangerDesign.compiledHangers.length, 2);
assert.equal(solved.report.gaps.some((row) => row.code === 'HANGER_SUPPORT_NOT_COMPILED'), false);
assert.ok(solved.report.gaps.some((row) => row.code === 'DECLARED_FORCE_F1_NOT_COMPILED'));
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
  const recovered = recoverProgrammedVariableSpringHangerAction({
    authority,
    execution: solved.cases.CASE3_OPE.execution,
  });
  assert.ok(Math.abs(recovered.totalSupportAction - design.selected.hotLoad) <= 1e-3, `node ${design.nodeId} OPE hot-load recovery`);
  assert.equal(solved.report.cases.CASE3_OPE.nodes.get(design.nodeId).reaction.UY, recovered.totalSupportAction);
  designEvidence.push(Object.freeze({
    nodeId: design.nodeId,
    designInput: design.designInput,
    selected: design.selected,
    rejectedCandidateCount: design.candidates.findIndex((row) => row.accepted),
    caesarQualificationOracle: oracle,
    opeRecoveredSupportAction: recovered,
  }));
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

const retained = Object.freeze({
  schema: 'm029-bm3-programmed-hanger-qualification/v2',
  status: 'PASS_WITH_REDUCER_PARITY_PENDING_IN_PREDECESSOR',
  sourceSemanticHash: solved.source.semanticHash,
  authority: Object.freeze({
    catalogId: solved.hangerDesign.catalogId,
    catalogSemanticHash: solved.hangerDesign.catalogSemanticHash,
    designMethod: 'RESTRAINED_WEIGHT_THEN_OPERATING_TRAVEL_THEN_FIRST_VALID_CATALOG_ENTRY_V1',
    compileMethod: 'GLOBAL_Y_LINEAR_SPRING_PLUS_THEORETICAL_COLD_LOAD_PRELOAD_V1',
    recoveryMethod: 'TOTAL_SUPPORT_ACTION_EQUALS_COLD_LOAD_MINUS_K_TIMES_DISPLACEMENT_V1',
  }),
  designEvidence,
  solverQualification: solved.report.solverQualification,
  unresolvedGaps: solved.report.gaps,
  legacyNumericalComparison: 'DISABLED_AFTER_OUTPUT_CASE_RENUMBERING',
  latestOutputAuthority: 'scripts/lfea-bm3-consolidated-latest-output-check.mjs',
});
writeFileSync(REPORT_PATH, `${JSON.stringify(retained, null, 2)}\n`);

console.log(JSON.stringify({
  check: 'm029-bm3-programmed-spring-hangers',
  status: retained.status,
  selections: designEvidence.map((row) => ({
    nodeId: row.nodeId,
    figure: row.selected.figure,
    size: row.selected.size,
    hotLoad: row.selected.hotLoad,
    signedOperatingTravel: row.selected.signedOperatingTravel,
    springRate: row.selected.springRate,
    theoreticalColdLoad: row.selected.theoreticalColdLoad,
  })),
  legacyNumericalComparison: retained.legacyNumericalComparison,
  remainingGaps: retained.unresolvedGaps.map((row) => row.code),
}, null, 2));
console.log('M029 hanger design and grounded-spring qualification PASS; reducer parity is closed by the M032 strict comparator.');
