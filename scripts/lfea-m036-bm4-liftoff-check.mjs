#!/usr/bin/env node

import assert from 'node:assert/strict';
import { compileUnilateralSolverExecution } from '../src/core/linear-fea-unilateral-solver/index.js';
import { solveBm1InputXml } from './lfea-b3.15-bm1-inputxml-fixtures.mjs';
import { solveBm2InputXmlConditioned } from './lfea-b3.26-bm2-solve-runtime.mjs';
import { BM3_BASE_CASES, analyseBaseCase, buildBm3Authorities } from './lfea-m028-bm3-fixtures.mjs';
import { loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4InputXmlConditioned } from './lfea-m034-bm4-solve-runtime.mjs';
import {
  BM4_FRICTION_LIMITATION,
  BM4_LIFTOFF_NODES,
  buildBm4UnilateralPlan,
  solveBm4InheritedState,
  solveBm4UnilateralCase,
} from './lfea-m036-bm4-runtime.mjs';

const H1_PREDICTED_RELEASED = Object.freeze(['20090', '20350', '21470', '21610']);
const H1_PREDICTED_ENGAGED = Object.freeze([
  '20030', '20170', '20250', '20300', '20390', '20440', '20520', '20550', '20580', '20640', '20710',
  '21480', '21640', '21740', '21800', '21860', '21930', '22020', '22070', '22120', '22140', '22220',
  '22260', '22310', '22370',
]);
const FORCE_TOLERANCE = 1;
const DISPLACEMENT_ZERO_TOLERANCE = 1e-9;

function executionNoOp(name, directExecution, solveAgain) {
  let calls = 0;
  const wrapped = compileUnilateralSolverExecution({
    baseDeclarations: [], unilateral: [],
    buildAndSolve() { calls += 1; return solveAgain(); },
  });
  assert.equal(calls, 1, `${name}: zero-unilateral wrapper must call the existing solve exactly once`);
  assert.equal(wrapped.finalExecution.executionHash, directExecution.executionHash, `${name}: executionHash no-op`);
  assert.equal(wrapped.finalExecution.semanticHash, directExecution.semanticHash, `${name}: semanticHash no-op`);
  assert.equal(wrapped.finalExecution.mechanicalModelSemanticHash, directExecution.mechanicalModelSemanticHash, `${name}: model hash no-op`);
  assert.equal(wrapped.finalExecution.stiffnessStateHash, directExecution.stiffnessStateHash, `${name}: stiffness hash no-op`);
  assert.equal(wrapped.finalExecution.physicalLoadCaseHash, directExecution.physicalLoadCaseHash, `${name}: load-case hash no-op`);
  return directExecution.executionHash;
}

console.log('\n--- M036 T5 structural no-op ---');
const bm1Direct = solveBm1InputXml().sustained.execution;
const bm1Hash = executionNoOp('BM1', bm1Direct, () => solveBm1InputXml().sustained.execution);
const bm2Direct = solveBm2InputXmlConditioned().sustained.execution;
const bm2Hash = executionNoOp('BM2', bm2Direct, () => solveBm2InputXmlConditioned().sustained.execution);
const bm3Authorities = buildBm3Authorities();
const bm3Policy = BM3_BASE_CASES.CASE4_SUS;
const bm3Direct = analyseBaseCase(bm3Authorities, 'CASE4_SUS', bm3Policy).execution;
const bm3Hash = executionNoOp('BM3', bm3Direct, () => analyseBaseCase(bm3Authorities, 'CASE4_SUS', bm3Policy).execution);
const bm4Linear = solveBm4InputXmlConditioned();
const bm4Hash = executionNoOp('BM4', bm4Linear.sustained.execution, () => solveBm4InputXmlConditioned().sustained.execution);

function reaction(execution, sourceNodeId, dof = 'UY') {
  return execution.reactions.find((row) => row.nodeId === `BM4.N${sourceNodeId}` && row.dof === dof)?.value ?? 0;
}

function ciiReaction(cii, caseLabel, sourceNodeId) {
  const row = cii.restraint.get(caseLabel).get(sourceNodeId);
  return row ? -row.FY : 0;
}

function ciiDisplacementY(cii, caseLabel, sourceNodeId) {
  return cii.displacement.get(caseLabel).get(sourceNodeId)?.DY ?? null;
}

function ciiReleasedNodes(cii, caseLabel, nodes) {
  return nodes.filter((nodeId) => (
    Math.abs(ciiReaction(cii, caseLabel, nodeId)) <= FORCE_TOLERANCE
    && (ciiDisplacementY(cii, caseLabel, nodeId) ?? 0) > DISPLACEMENT_ZERO_TOLERANCE
  )).sort((a, b) => Number(a) - Number(b));
}

function ciiSupportEvidence(cii, caseLabel, nodeId) {
  const row = cii.restraint.get(caseLabel).get(nodeId);
  return row ? {
    type: row.type,
    supportOnPipe: { FX: -row.FX, FY: -row.FY, FZ: -row.FZ },
    displacementY: ciiDisplacementY(cii, caseLabel, nodeId),
  } : null;
}

function plusYNode(support) {
  const match = /^BM4-C-(\d+)-UY-PLUS-Y-LINEARIZED$/u.exec(support.declarationId);
  return match?.[1] ?? null;
}

function releasedPlusY(result) {
  const supportById = new Map(result.plan.unilateral.map((row) => [row.declarationId, row]));
  return result.unilateralExecution.convergedState
    .filter((state) => !state.engaged)
    .map((state) => plusYNode(supportById.get(state.declarationId)))
    .filter(Boolean)
    .sort((a, b) => Number(a) - Number(b));
}

function sameSet(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function equilibrium(execution, totalWeight, label) {
  const sumVerticalReaction = execution.reactions
    .filter((row) => row.dof === 'UY')
    .reduce((sum, row) => sum + row.value, 0);
  const qualified = execution.diagnostics.forceEquilibrium;
  assert.notEqual(qualified.status, 'BLOCK', `${label}: existing solver force-equilibrium qualification`);
  return {
    sumVerticalReaction,
    totalWeight,
    verticalDifference: sumVerticalReaction - totalWeight,
    solverQualification: qualified,
  };
}

console.log('\n--- M036 T6/T7 BM4 unilateral lift-off ---');
const plan = buildBm4UnilateralPlan(bm4Linear);
const plusY = plan.unilateral.map(plusYNode).filter(Boolean).sort((a, b) => Number(a) - Number(b));
assert.equal(plusY.length, 29, 'BM4 must expose all 29 corrected +Y restraint locations');
assert.ok(plan.unilateral.some((row) => row.gap > 0), 'BM4 declared guide GAP rows must enter active-set authority');
assert.ok(plan.unilateral.filter((row) => row.frictionCoefficient > 0).every((row) => row.frictionLimitationCode === BM4_FRICTION_LIMITATION));

const ope = solveBm4UnilateralCase({ plan, label: 'OPE', thermal: true });
const susH1 = solveBm4UnilateralCase({ plan, label: 'SUS-H1', thermal: false });
const cii = loadBm4CiiOutputCases1921();
const ciiOpeReleased = ciiReleasedNodes(cii, 'OPE', BM4_LIFTOFF_NODES);
const ciiSusReleased = ciiReleasedNodes(cii, 'SUS', BM4_LIFTOFF_NODES);
const ciiSusReleasedAll = ciiReleasedNodes(cii, 'SUS', plusY);
assert.deepEqual(ciiOpeReleased, BM4_LIFTOFF_NODES, 'CAESAR OPE rows must prove separation at all four target shoes');

for (const nodeId of BM4_LIFTOFF_NODES) {
  assert.ok(Math.abs(reaction(ope.unilateralExecution.finalExecution, nodeId)) <= FORCE_TOLERANCE,
    `OPE node ${nodeId} must lift off to <=1 N`);
}
const opeReleased = releasedPlusY(ope);
for (const nodeId of BM4_LIFTOFF_NODES) assert.ok(opeReleased.includes(nodeId), `OPE must release ${nodeId}`);

const susH1Released = releasedPlusY(susH1);
const h1AdvancePredictionConfirmed = sameSet(susH1Released, H1_PREDICTED_RELEASED);
const h1CaseStatusMatches = sameSet(susH1Released, ciiSusReleasedAll);
let verdict = 'H1_INDEPENDENT_COLD_CONVERGENCE';
let acceptedSusExecution = susH1.unilateralExecution.finalExecution;
let h2 = null;
let susH2Released = null;
let unresolved = null;

if (!h1CaseStatusMatches) {
  const missingFromH1 = ciiSusReleasedAll.filter((nodeId) => !susH1Released.includes(nodeId));
  const extraInH1 = susH1Released.filter((nodeId) => !ciiSusReleasedAll.includes(nodeId));
  h2 = solveBm4InheritedState({
    plan, label: 'SUS-H2-OPE-STATUS-INHERITED', thermal: false, state: ope.unilateralExecution.convergedState,
  });
  susH2Released = opeReleased;
  if (sameSet(susH2Released, ciiSusReleasedAll)) {
    verdict = 'H2_OPE_CONTACT_STATUS_INHERITED';
    acceptedSusExecution = h2.execution;
  } else {
    verdict = 'NEITHER_H1_NOR_H2';
    unresolved = { missingFromH1, extraInH1 };
  }
}

const predictedAll = [...H1_PREDICTED_RELEASED, ...H1_PREDICTED_ENGAGED].sort((a, b) => Number(a) - Number(b));
assert.deepEqual(plusY, predictedAll, 'advance H1 inventory must account for every +Y declaration');
const opeEquilibrium = equilibrium(ope.unilateralExecution.finalExecution, ope.totalWeight, 'OPE');
const susEquilibrium = equilibrium(acceptedSusExecution, susH1.totalWeight, `SUS/${verdict}`);

function neighborEvidence(nodeId) {
  const baseline = bm4Linear.report.nodes.find((row) => row.sourceNodeId === nodeId).sustained.reaction.UY;
  const nonlinear = reaction(acceptedSusExecution, nodeId);
  const reference = ciiReaction(cii, 'SUS', nodeId);
  return {
    nodeId, baseline, nonlinear, cii: reference,
    baselineAbsError: Math.abs(baseline - reference),
    nonlinearAbsError: Math.abs(nonlinear - reference),
    improved: Math.abs(nonlinear - reference) < Math.abs(baseline - reference),
  };
}
const neighbors = ['20170', '21640'].map(neighborEvidence);

const trace20090 = ope.unilateralExecution.trace.map((row) => ({
  iteration: row.iteration,
  engaged: row.engagedSet.includes('BM4-C-20090-UY-PLUS-Y-LINEARIZED'),
  flips: row.flips.filter((flip) => flip.declarationId === 'BM4-C-20090-UY-PLUS-Y-LINEARIZED'),
  executionHash: row.executionHash,
  traceHash: row.semanticHash,
}));
const targetReactions = Object.fromEntries(BM4_LIFTOFF_NODES.map((nodeId) => [nodeId, {
  linearOpe: bm4Linear.report.nodes.find((row) => row.sourceNodeId === nodeId).operating.reaction.UY,
  unilateralOpe: reaction(ope.unilateralExecution.finalExecution, nodeId),
  ciiOpe: ciiReaction(cii, 'OPE', nodeId),
  h1Sus: reaction(susH1.unilateralExecution.finalExecution, nodeId),
  h2Sus: h2 ? reaction(h2.execution, nodeId) : null,
  ciiSus: ciiReaction(cii, 'SUS', nodeId),
  ciiSustainedEvidence: ciiSupportEvidence(cii, 'SUS', nodeId),
}]));

const evidence = {
  check: 'm036-bm4-unilateral-liftoff',
  status: unresolved ? 'BLOCKED' : 'PASS',
  baseline: '9f1fb039511b7304c0208140d81543f11735c0a0',
  t5Hashes: { BM1: bm1Hash, BM2: bm2Hash, BM3: bm3Hash, BM4: bm4Hash },
  opeReleasedPlusY: opeReleased,
  ciiSusTargetReleasedPlusY: ciiSusReleased,
  ciiSusAllReleasedPlusY: ciiSusReleasedAll,
  susIndependentReleasedPlusY: susH1Released,
  susH2ReleasedPlusY: susH2Released,
  susVerdict: verdict,
  h1AdvancePredictionConfirmed,
  h1AdvancePrediction: { released: H1_PREDICTED_RELEASED, engaged: H1_PREDICTED_ENGAGED, anchor: '22490' },
  unresolved,
  targetReactions,
  equilibrium: { OPE: opeEquilibrium, SUS: susEquilibrium },
  neighborRedistribution: neighbors,
  node20090OpeTrace: trace20090,
  frictionLimitations: ope.unilateralExecution.diagnostics.limitations,
  h2ExecutionHash: h2?.execution.semanticHash ?? null,
};
console.log(JSON.stringify(evidence, null, 2));
if (unresolved) {
  assert.fail(`BM4 SUS fork unresolved after H1 and exact fixed-status H2; fail closed. Evidence: ${JSON.stringify({
    ciiSusReleasedAll, susH1Released, susH2Released, unresolved, targetReactions, neighbors,
  })}`);
}
console.log('M036 BM4 T5/T6/T7 PASS');
