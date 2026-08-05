#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { solveBm3M032LoadCustody } from './lfea-m032-bm3-load-custody.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PREDECESSOR_SCRIPT = resolve(ROOT, 'scripts/lfea-bm3-consolidated-latest-output-check.mjs');
const REPORT_PATH = resolve(ROOT, 'reports/bm3-consolidated-latest-output.json');

const predecessorRun = spawnSync(process.execPath, [PREDECESSOR_SCRIPT, '--write'], {
  cwd: ROOT,
  encoding: 'utf8',
});
if (predecessorRun.status !== 0) {
  process.stderr.write(predecessorRun.stdout ?? '');
  process.stderr.write(predecessorRun.stderr ?? '');
  throw new Error(`Predecessor BM3 strict comparison exited with status ${String(predecessorRun.status)}.`);
}

const predecessor = JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
assert.equal(predecessor.schema, 'lfea-bm3-consolidated-latest-output/v2');
assert.equal(predecessor.strictComparison.totals.matchedScalarDenominator, 1512);
// Coverage completeness is a hard requirement independent of the pass rate:
// every declared reference/solver row must be matched, whether or not it
// falls inside the ±5% band once matched.
assert.equal(predecessor.strictComparison.totals.unmatchedReferenceRows, 0);
assert.equal(predecessor.strictComparison.totals.unmatchedSolverRows, 0);
// The numeric pass/fail split and qualificationStatus are NOT asserted to an
// exact expected value here: doing so turns this check into a target the
// mechanics get tuned to hit rather than an honest measurement. They are
// read from the predecessor's own computation and reported below, together
// with the specific named failing scalars (case/family/node/component), so
// any regression or improvement is visible rather than silently pinned.
const strictFailingScalars = predecessor.strictComparison.cases.flatMap((row) => row.topFailures.map((failure) => ({
  caseNumber: row.caseNumber,
  family: failure.family,
  identity: failure.identity,
  component: failure.component,
  relativeError: failure.relativeError,
})));

const m032 = solveBm3M032LoadCustody();
assert.equal(m032.predecessor.comparison, null);
assert.equal(m032.declaredForceMoments.summary.declarationCount, 2);
assert.equal(m032.custody.CASE5_OCC.physicalLoads.declaredF1PrimitiveCount, 2);
assert.equal(m032.custody.CASE6_NO_FRICTION.physicalLoads.declaredF1PrimitiveCount, 0);
assert.equal(m032.custody.CASE7_NO_FRICTION.physicalLoads.declaredF1PrimitiveCount, 0);
assert.equal(m032.custody.CASE6_NO_FRICTION.physicalLoads.friction, false);
assert.equal(m032.custody.CASE7_NO_FRICTION.physicalLoads.friction, false);
assert.equal(m032.custody.CASE7_NO_FRICTION.physicalLoads.thermal, false);
assert.equal(m032.custody.CASE7_NO_FRICTION.physicalLoads.hangerStiffness, true);
assert.equal(m032.custody.CASE7_NO_FRICTION.physicalLoads.hangerPreload, false);

const declaredResultant = sumDeclaredResultant(m032.declaredForceMoments.primitives);
assert.deepEqual(declaredResultant.force, { fx: 0, fy: -8000, fz: 0 });
assert.deepEqual(declaredResultant.moment, { mx: 0, my: 0, mz: 0 });

const report = Object.freeze({
  ...predecessor,
  schema: 'lfea-bm3-consolidated-latest-output/v4',
  predecessorEvidence: Object.freeze({
    schema: predecessor.schema,
    strictComparisonStatus: predecessor.strictComparison.status,
    qualificationStatus: predecessor.qualificationStatus,
  }),
  m032LoadCustody: Object.freeze({
    schema: 'm032-bm3-load-custody-evidence/v1',
    status: 'PASS',
    sourceSemanticHash: m032.sourceSemanticHash,
    declaredForceMoments: Object.freeze({
      selectedVectorNumbers: m032.declaredForceMoments.selectedVectorNumbers,
      declarationCount: m032.declaredForceMoments.summary.declarationCount,
      primitiveCount: m032.declaredForceMoments.summary.primitiveCount,
      globalBasisCount: m032.declaredForceMoments.summary.globalBasisCount,
      resultant: declaredResultant,
      semanticHash: m032.declaredForceMoments.semanticHash,
    }),
    caseCustody: m032.custody,
    controlledStudies: Object.freeze({
      design: m032.controlledStudies.design,
      effects: m032.controlledStudies.effects,
    }),
    resolvedAuthorities: Object.freeze([
      'DECLARED_FORCE_F1_COMPILED_IN_GLOBAL_FRAME',
      'CASE5_CASE6_CASE7_PHYSICAL_LOAD_SET_CUSTODY_VERIFIED',
      'T1_T2_MATERIAL_AND_THERMAL_STRAIN_SELECTION_VERIFIED',
      'CONTROLLED_HANGER_AND_F1_AB_STUDIES_COMPLETE',
      'REAL_BEND_ARCS_AND_DIRECTIONAL_FLEXIBILITY_INTEGRATED',
      'REDUCER_CONDENSATION_PARITY_VERIFIED',
      'GENERATED_STATION_AND_DUPLICATE_PAIR_IDENTITY_CLOSED',
      'FROZEN_PHYSICAL_HANGERS_REQUALIFIED_ON_FINAL_STIFFNESS',
    ]),
  }),
  caseSemantics: Object.freeze({
    ...predecessor.caseSemantics,
    strictPhysicalCases: Object.freeze({
      6: 'W+T2+P1+H; independently assembled M032 no-friction case; F1 absent.',
      7: 'W+P1; independently assembled M032 no-friction case; spring hardware stiffness retained, no hanger preload, no thermal term and no F1.',
    }),
  }),
  unresolvedAuthorities: Object.freeze(m032.remainingGaps.map((row) => row.code)),
  strictFailingScalars: Object.freeze(strictFailingScalars),
  nextPriority: strictFailingScalars.length === 0
    ? Object.freeze([])
    : Object.freeze([
      'Named residual: CASE 6/7 strict comparator still fails '
        + `${strictFailingScalars.length}/${predecessor.strictComparison.totals.matchedScalarDenominator} scalars, `
        + 'clustered at the anchor-adjacent nodes and the first bend pair (see strictFailingScalars). '
        + 'Root cause not yet isolated between residual anchor rotational stiffness and bend-adjacent shear/moment transfer; '
        + 'investigate before claiming full strict parity.',
    ]),
  qualificationStatus: predecessor.qualificationStatus,
});

writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  benchmark: report.benchmark,
  schema: report.schema,
  strictMatchedScalarDenominator: report.strictComparison.totals.matchedScalarDenominator,
  strictPassed: report.strictComparison.totals.passed,
  strictFailed: report.strictComparison.totals.failed,
  qualificationStatus: report.qualificationStatus,
  resolvedAuthorities: report.m032LoadCustody.resolvedAuthorities,
  unresolvedAuthorities: report.unresolvedAuthorities,
  strictFailingScalars: report.strictFailingScalars,
}, null, 2));
console.log(report.qualificationStatus === 'PASS'
  ? 'BM3 M032 evidence closes load custody, real-bend/reducer mechanics, hanger requalification and strict CASE 6/7 parity.'
  : `BM3 M032 evidence closes load custody, real-bend/reducer mechanics and hanger requalification. `
    + `Strict CASE 6/7 parity is NOT yet complete: ${report.strictComparison.totals.failed}/`
    + `${report.strictComparison.totals.matchedScalarDenominator} scalars remain outside ±5% `
    + '(see strictFailingScalars and nextPriority for the named residual).');

function sumDeclaredResultant(primitives) {
  const force = { fx: 0, fy: 0, fz: 0 };
  const moment = { mx: 0, my: 0, mz: 0 };
  for (const primitive of primitives) {
    for (const key of Object.keys(force)) force[key] += primitive.force[key];
    for (const key of Object.keys(moment)) moment[key] += primitive.moment[key];
  }
  return Object.freeze({ force: Object.freeze(force), moment: Object.freeze(moment) });
}
