#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileUnilateralSolverExecution } from '../src/core/linear-fea-unilateral-solver/index.js';
import { loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { buildBm4SolveAuthorities, BM4_SOLVER_CONDITIONING_PROFILE } from './lfea-m034-bm4-solve-fixtures.mjs';
import { solveBm4InputXmlConditioned } from './lfea-m034-bm4-solve-runtime.mjs';
import { solveBm4M035FeatureCases } from './lfea-m035-bm4-feature-solve-runtime.mjs';
import {
  M036_BM4_TARGETS,
  analyseM036Bm4,
  buildM036Bm4Inventory,
  finalM036Bm4,
  m036Bm4Reaction,
} from './lfea-m036-bm4-runtime.mjs';
import {
  reactionUy,
  releasedTargetIds,
  solveBm4M035M036Combined,
} from './lfea-m035-m036-bm4-integration-runtime.mjs';

function m035Reaction(execution, nodeId) {
  return execution.reactions.find((row) => row.nodeId === `BM4M035.N${nodeId}` && row.dof === 'UY')?.value ?? 0;
}

function ciiReaction(cii, label, nodeId) {
  const row = cii.restraint.get(label).get(String(nodeId));
  return row ? -row.FY : null;
}

function equilibrium(analysis) {
  const lengthByElement = new Map();
  for (const frame of analysis.frames) lengthByElement.set(frame.elementId, frame.geometry.length);
  for (const component of analysis.pipingComponents) {
    for (const element of component.elements) {
      lengthByElement.set(element.elementId, element.frameElement.geometry.length);
    }
  }
  let appliedY = 0;
  for (const primitive of analysis.loadCase.primitives) {
    if (primitive.kind !== 'DISTRIBUTED_LOAD') continue;
    const length = lengthByElement.get(primitive.elementId);
    assert.ok(Number.isFinite(length) && length > 0, `loaded element ${primitive.elementId} must have an actual frame length`);
    appliedY += 0.5 * (primitive.startIntensity.fy + primitive.endIntensity.fy) * length;
  }
  const reactionY = analysis.execution.reactions
    .filter((row) => row.dof === 'UY')
    .reduce((sum, row) => sum + row.value, 0);
  const relative = Math.abs(reactionY + appliedY) / Math.max(Math.abs(appliedY), 1);
  const envelope = Math.max(
    analysis.execution.diagnostics.forceEquilibrium.limit,
    BM4_SOLVER_CONDITIONING_PROFILE.normalizedResidualWarnLimit.value,
  );
  return { appliedY, reactionY, relative, envelope, accepted: relative <= envelope };
}

const cii = loadBm4CiiOutputCases1921();
const a = solveBm4InputXmlConditioned();
const b = solveBm4M035FeatureCases();

const cAuthorities = buildBm4SolveAuthorities();
const cInventory = buildM036Bm4Inventory(cAuthorities);
const cRun = compileUnilateralSolverExecution({
  baseDeclarations: cInventory.base,
  unilateral: cInventory.unilateral,
  buildAndSolve: (constraints, active) => analyseM036Bm4(cAuthorities, constraints, 'OPE', true, active.prescribedMovements).execution,
});
const c = finalM036Bm4(cAuthorities, cInventory, cRun, 'OPE', true);
const d = solveBm4M035M036Combined();

assert.deepEqual(releasedTargetIds(d.operatingRun, M036_BM4_TARGETS), [...M036_BM4_TARGETS].sort(), 'combined OPE must release all four target shoes');
for (const nodeId of M036_BM4_TARGETS) {
  assert.ok(Math.abs(reactionUy(d.operating.execution, nodeId)) <= 1, `${nodeId} combined OPE reaction must be within 1 N zero band`);
}
assert.equal(d.authorities.bendExpansion.components.length, 12, 'combined model retains all 12 physical bend components');
assert.equal(d.authorities.teeJunctions.length, 2, 'combined model retains 2 tee junctions');
assert.equal(d.authorities.inlineReducers.transitionCount, 6, 'combined model retains 6 reducer candidates');
assert.equal(d.inventory.gappedGuideEvidence.length, 6, 'combined model retains 6 nonzero guide gaps');

const node20170 = {
  cii: ciiReaction(cii, 'OPE', '20170'),
  A_M034_bilateral: a.operating.execution.reactions.find((row) => row.nodeId === 'BM4.N20170' && row.dof === 'UY')?.value ?? 0,
  B_M035_bilateral: m035Reaction(b.operating.execution, '20170'),
  C_M034_M036: m036Bm4Reaction(c.execution, '20170'),
  D_M035_M036: reactionUy(d.operating.execution, '20170'),
};
node20170.errors = Object.fromEntries(Object.entries(node20170)
  .filter(([key]) => key.startsWith('A_') || key.startsWith('B_') || key.startsWith('C_') || key.startsWith('D_'))
  .map(([key, value]) => [key, Math.abs(value - node20170.cii)]));
assert.ok(node20170.errors.D_M035_M036 < node20170.errors.B_M035_bilateral, 'combined active set must improve node 20170 OPE over M035 bilateral');

const eq = {
  SUS: equilibrium(d.sustained),
  OPE: equilibrium(d.operating),
};
assert.ok(eq.SUS.accepted, `combined SUS equilibrium ${eq.SUS.relative} exceeds ${eq.SUS.envelope}`);
assert.ok(eq.OPE.accepted, `combined OPE equilibrium ${eq.OPE.relative} exceeds ${eq.OPE.envelope}`);

const targets = M036_BM4_TARGETS.map((nodeId) => ({
  nodeId,
  cii: ciiReaction(cii, 'OPE', nodeId),
  A_M034_bilateral: a.operating.execution.reactions.find((row) => row.nodeId === `BM4.N${nodeId}` && row.dof === 'UY')?.value ?? 0,
  B_M035_bilateral: m035Reaction(b.operating.execution, nodeId),
  C_M034_M036: m036Bm4Reaction(c.execution, nodeId),
  D_M035_M036: reactionUy(d.operating.execution, nodeId),
}));

const report = {
  check: 'lfea-m035-m036-bm4-integration',
  status: 'PASS',
  topology: {
    sourceNodes: d.authorities.sourceGeometry.nodes.length,
    analysisNodes: d.authorities.analysisGeometry.nodes.length,
    analysisElements: d.authorities.entries.length,
    bends: d.authorities.bendExpansion.components.length,
    tees: d.authorities.teeJunctions.length,
    reducerCandidates: d.authorities.inlineReducers.transitionCount,
    reducerCondensationActive: 0,
    gappedGuides: d.inventory.gappedGuideEvidence.length,
  },
  released: {
    SUS: releasedTargetIds(d.sustainedRun, M036_BM4_TARGETS),
    OPE: releasedTargetIds(d.operatingRun, M036_BM4_TARGETS),
  },
  targets,
  node20170,
  equilibrium: eq,
  solver: {
    SUS: d.sustained.execution.status,
    OPE: d.operating.execution.status,
    susHash: d.sustained.execution.semanticHash,
    opeHash: d.operating.execution.semanticHash,
  },
};

console.log(JSON.stringify(report, null, 2));
console.log(`M035_M036_INTEGRATION_SUMMARY=${JSON.stringify(report)}`);
