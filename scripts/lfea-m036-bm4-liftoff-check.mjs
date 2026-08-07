#!/usr/bin/env node

import assert from 'node:assert/strict';
import { compileUnilateralSolverExecution } from '../src/core/linear-fea-unilateral-solver/index.js';
import { loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4InputXmlConditioned } from './lfea-m034-bm4-solve-runtime.mjs';
import { buildBm4SolveAuthorities } from './lfea-m034-bm4-solve-fixtures.mjs';
import {
  M036_BM4_NEIGHBORS,
  M036_BM4_TARGETS,
  analyseM036Bm4,
  auditM036Bm4Equilibrium,
  buildM036Bm4Inventory,
  finalM036Bm4,
  m036Bm4Reaction,
} from './lfea-m036-bm4-runtime.mjs';

const TARGET_SET = new Set(M036_BM4_TARGETS);
const H1_RELEASED = new Set(M036_BM4_TARGETS);
const direct = solveBm4InputXmlConditioned();
const authorities = buildBm4SolveAuthorities();
const inventory = buildM036Bm4Inventory(authorities);
const cii = loadBm4CiiOutputCases1921();

assert.equal(inventory.unilateral.filter((u) => TARGET_SET.has(u.nodeId.replace('BM4.N', ''))).length, 4, 'only four +Y lift-off targets');
assert.equal(inventory.gappedGuideEvidence.length, 6, 'six nonzero BM4 guide gaps retained');
for (const row of inventory.gappedGuideEvidence) assert.ok(row.gap > 0, `${row.nodeId} gap must remain nonzero`);

for (const [label, execution] of [['SUS', direct.sustained.execution], ['OPE', direct.operating.execution]]) {
  const noOp = compileUnilateralSolverExecution({ baseDeclarations: [], unilateral: [], buildAndSolve: () => execution });
  assert.equal(noOp.finalExecution, execution, `T5 BM4 ${label} exact object no-op`);
  assert.equal(noOp.finalExecutionHash, execution.semanticHash, `T5 BM4 ${label} no-op hash`);
}

const solveState = (label, thermal) => compileUnilateralSolverExecution({
  baseDeclarations: inventory.base,
  unilateral: inventory.unilateral,
  buildAndSolve: (constraints, active) => analyseM036Bm4(authorities, constraints, label, thermal, active.prescribedMovements).execution,
});
const sus = solveState('SUS', false);
const ope = solveState('OPE', true);
const finalSus = finalM036Bm4(authorities, inventory, sus, 'SUS', false);
const finalOpe = finalM036Bm4(authorities, inventory, ope, 'OPE', true);

function targetReleaseIds(run) {
  return run.convergedState
    .filter((row) => row.status === 'RELEASED' && TARGET_SET.has(row.nodeId.replace('BM4.N', '')))
    .map((row) => row.nodeId.replace('BM4.N', '')).sort();
}

const releasedSus = targetReleaseIds(sus);
const releasedOpe = targetReleaseIds(ope);
const h1Confirmed = releasedSus.length === H1_RELEASED.size && releasedSus.every((id) => H1_RELEASED.has(id));
assert.deepEqual(releasedOpe, [...M036_BM4_TARGETS].sort(), 'all four OPE lift-off shoes must release');

const targetRows = [];
for (const [label, beforeExecution, afterExecution] of [
  ['SUS', direct.sustained.execution, finalSus.execution],
  ['OPE', direct.operating.execution, finalOpe.execution],
]) for (const nodeId of M036_BM4_TARGETS) {
  const ciiRow = cii.restraint.get(label).get(nodeId);
  const ciiReaction = ciiRow ? -ciiRow.FY : null;
  const after = m036Bm4Reaction(afterExecution, nodeId);
  targetRows.push({ label, nodeId, before: m036Bm4Reaction(beforeExecution, nodeId), after, cii: ciiReaction });
  if (label === 'OPE') assert.ok(Math.abs(after) <= 1, `${nodeId} OPE reaction must be within 1 N of zero`);
}

const redistribution = M036_BM4_NEIGHBORS.map((nodeId) => {
  const ciiRow = cii.restraint.get('OPE').get(nodeId);
  const ciiReaction = ciiRow ? -ciiRow.FY : null;
  const before = m036Bm4Reaction(direct.operating.execution, nodeId);
  const after = m036Bm4Reaction(finalOpe.execution, nodeId);
  return { nodeId, before, after, cii: ciiReaction, beforeError: Math.abs(before - ciiReaction), afterError: Math.abs(after - ciiReaction) };
});
for (const row of redistribution) assert.ok(row.afterError < row.beforeError, `${row.nodeId} OPE redistribution must move toward CAESAR`);
for (const nodeId of M036_BM4_TARGETS) assert.ok(ope.limitations.some((row) => row.nodeId === `BM4.N${nodeId}` && row.code === 'BM4_FRICTION_NOT_MODELED'), `${nodeId} friction limitation`);

const report = {
  check: 'lfea-m036-bm4-liftoff',
  status: 'PASS',
  h1: { predictedReleased: [...H1_RELEASED].sort(), confirmed: h1Confirmed, actualReleased: releasedSus },
  opeReleased: releasedOpe,
  inventory: {
    contactDeclarationCount: inventory.unilateral.length,
    targetOneWayCount: 4,
    gappedGuideCount: inventory.gappedGuideEvidence.length,
    frictionLimitations: ope.limitations.length,
    gappedGuideEvidence: inventory.gappedGuideEvidence.map((row) => ({ nodeId: row.nodeId, gap: row.gap })),
  },
  targetRows,
  equilibrium: { SUS: auditM036Bm4Equilibrium(finalSus), OPE: auditM036Bm4Equilibrium(finalOpe) },
  redistribution,
  trace: { SUS: sus.trace, OPE: ope.trace },
};

console.log(JSON.stringify(report, null, 2));
console.log(`M036_SUMMARY=${JSON.stringify({
  h1: report.h1,
  opeReleased: report.opeReleased,
  targetRows,
  equilibrium: report.equilibrium,
  redistribution,
  gappedGuideEvidence: report.inventory.gappedGuideEvidence,
})}`);
