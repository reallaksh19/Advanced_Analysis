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

function targetAgreement(execution, cii, label) {
  return BM4_LIFTOFF_NODES.every((nodeId) => (
    Math.abs(reaction(execution, nodeId) - ciiReaction(cii, label, nodeId)) <= FORCE_TOLERANCE
  ));
}

function equilibrium(execution, totalWeight, label) {
  const sumVerticalReaction = execution.reactions
    .filter((row) => row.dof === 'UY')
    .reduce((sum, row) => sum + row.value, 0);
  const tolerance = Math.max(1e-3, totalWeight * 1e-6);
  assert.ok(Math.abs(sumVerticalReaction - totalWeight) <= tolerance,
    `${label}: vertical support equilibrium ${sumVerticalReaction} vs weight ${totalWeight}`);
  assert.notEqual(execution.diagnostics.forceEquilibrium.status, 'FAIL', `${label}: solver force equilibrium`);
  return { sumVerticalReaction, totalWeight, tolerance };
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
for (const nodeId of BM4_LIFTOFF_NODES) {
  assert.ok(Math.abs(reaction(ope.unilateralExecution.finalExecution, nodeId)) <= FORCE_TOLERANCE,
    `OPE node ${nodeId} must lift off to <=1 N`);
  assert.ok(Math.abs(ciiReaction(cii, 'OPE', nodeId)) <= FORCE_TOLERANCE,
    `CAESAR OPE node ${nodeId} reference must be zero-force`);
}

const opeReleased = releasedPlusY(ope);
for (const nodeId of BM4_LIFTOFF_NODES) assert.ok(opeReleased.includes(nodeId), `OPE must release ${nodeId}`);
const susH1Released = releasedPlusY(susH1);
const h1StateMatches = JSON.stringify(susH1Released) === JSON.stringify(H1_PREDICTED_RELEASED);
const h1CaseMatches = targetAgreement(susH1.unilateralExecution.finalExecution, cii, 'SUS');
let verdict = 'H1_INDEPENDENT_COLD_CONVERGENCE';
let acceptedSusExecution = susH1.unilateralExecution.finalExecution;
let h2 = null;

if (!(h1StateMatches && h1CaseMatches)) {
  const only21470Disagrees = JSON.stringify(susH1Released) === JSON.stringify(['20090', '20350', '21610']);
  h2 = solveBm4InheritedState({
    plan, label: 'SUS-H2-OPE-INHERITED', thermal: false, state: ope.unilateralExecution.convergedState,
  });
  const h2CaseMatches = targetAgreement(h2.execution, cii, 'SUS');
  if (only21470Disagrees && h2CaseMatches) {
    verdict = 'H2_OPE_CONTACT_STATUS_INHERITED';
    acceptedSusExecution = h2.execution;
  } else {
    assert.fail(`BM4 SUS supports fit neither H1 nor H2: H1 released=[${susH1Released}], H1 CASE19=${h1CaseMatches}, H2 CASE19=${h2CaseMatches}`);
  }
}

const predictedAll = [...H1_PREDICTED_RELEASED, ...H1_PREDICTED_ENGAGED].sort((a, b) => Number(a) - Number(b));
assert.deepEqual(plusY, predictedAll, 'advance H1 inventory must account for every +Y declaration');
const opeEquilibrium = equilibrium(ope.unilateralExecution.finalExecution, ope.totalWeight, 'OPE');
const susEquilibrium = equilibrium(acceptedSusExecution, susH1.totalWeight, `SUS/${verdict}`);

function compareNeighbor(nodeId) {
  const baseline = bm4Linear.report.nodes.find((row) => row.sourceNodeId === nodeId).sustained.reaction.UY;
  const nonlinear = reaction(acceptedSusExecution, nodeId);
  const reference = ciiReaction(cii, 'SUS', nodeId);
  assert.ok(Math.abs(nonlinear - reference) < Math.abs(baseline - reference),
    `SUS neighbor ${nodeId} must shrink its bilateral over-prediction`);
  return { nodeId, baseline, nonlinear, cii: reference };
}
const neighbors = ['20170', '21640'].map(compareNeighbor);

const trace20090 = ope.unilateralExecution.trace.map((row) => ({
  iteration: row.iteration,
  engaged: row.engagedSet.includes('BM4-C-20090-UY-PLUS-Y-LINEARIZED'),
  flips: row.flips.filter((flip) => flip.declarationId === 'BM4-C-20090-UY-PLUS-Y-LINEARIZED'),
  executionHash: row.executionHash,
  traceHash: row.semanticHash,
}));

console.log(JSON.stringify({
  check: 'm036-bm4-unilateral-liftoff',
  status: 'PASS',
  baseline: '9f1fb039511b7304c0208140d81543f11735c0a0',
  t5Hashes: { BM1: bm1Hash, BM2: bm2Hash, BM3: bm3Hash, BM4: bm4Hash },
  opeReleasedPlusY: opeReleased,
  susIndependentReleasedPlusY: susH1Released,
  susVerdict: verdict,
  h1AdvancePrediction: { released: H1_PREDICTED_RELEASED, engaged: H1_PREDICTED_ENGAGED, anchor: '22490' },
  targetReactions: Object.fromEntries(BM4_LIFTOFF_NODES.map((nodeId) => [nodeId, {
    linearOpe: bm4Linear.report.nodes.find((row) => row.sourceNodeId === nodeId).operating.reaction.UY,
    unilateralOpe: reaction(ope.unilateralExecution.finalExecution, nodeId),
    ciiOpe: ciiReaction(cii, 'OPE', nodeId),
    unilateralSus: reaction(acceptedSusExecution, nodeId),
    ciiSus: ciiReaction(cii, 'SUS', nodeId),
  }])),
  equilibrium: { OPE: opeEquilibrium, SUS: susEquilibrium },
  neighborRedistribution: neighbors,
  node20090OpeTrace: trace20090,
  frictionLimitations: ope.unilateralExecution.diagnostics.limitations,
  h2ExecutionHash: h2?.execution.semanticHash ?? null,
}, null, 2));
console.log('M036 BM4 T5/T6/T7 PASS');
