#!/usr/bin/env node
import assert from 'node:assert/strict';
import { BM4_COMPARISON_POLICY, loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4InputXmlConditioned } from './lfea-m034-bm4-solve-runtime.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';
import {
  BM4_M038_FORCMNT_AUTHORITY,
  BM4_M038_FORCMNT_NODE_IDS,
} from './lfea-m038-bm4-forcmnt-authority.mjs';

const DOFS = Object.freeze(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']);
const TRANSLATIONS = new Set(['UX', 'UY', 'UZ']);

function nodalPrimitives(loadCase) {
  return loadCase.primitives.filter((row) => row.kind === 'NODAL_FORCE_MOMENT');
}

function primitiveVector(row) {
  return [row.force.fx, row.force.fy, row.force.fz, row.moment.mx, row.moment.my, row.moment.mz];
}

function mechanicalRows(loadCase, prefix) {
  return nodalPrimitives(loadCase).map((row) => ({
    sourceNodeId: row.nodeId.replace(prefix, ''),
    vector: primitiveVector(row),
  })).sort((left, right) => left.sourceNodeId.localeCompare(right.sourceNodeId));
}

function assertMembership(label, loadCase, prefix) {
  const rows = mechanicalRows(loadCase, prefix);
  assert.equal(rows.length, 12, `${label} must contain exactly 12 BM4 FORCMNT primitives.`);
  assert.deepEqual(rows.map((row) => row.sourceNodeId), [...BM4_M038_FORCMNT_NODE_IDS]);
  return rows;
}

function displacementVector(execution, sourceNodeId) {
  const kernelNodeId = `BM4M035.N${sourceNodeId}`;
  return Object.fromEntries(DOFS.map((dof) => [
    dof,
    execution.displacement.find((row) => row.nodeId === kernelNodeId && row.dof === dof)?.value ?? 0,
  ]));
}

function ciiVector(row) {
  return {
    UX: row.DX / 1000,
    UY: row.DY / 1000,
    UZ: row.DZ / 1000,
    RX: row.RX * Math.PI / 180,
    RY: row.RY * Math.PI / 180,
    RZ: row.RZ * Math.PI / 180,
  };
}

function passes(ours, reference, dof, percentLimit) {
  if (Math.abs(reference) <= BM4_COMPARISON_POLICY.nearZeroReferenceThreshold) {
    const tolerance = TRANSLATIONS.has(dof)
      ? BM4_COMPARISON_POLICY.absoluteTolerance.translation
      : BM4_COMPARISON_POLICY.absoluteTolerance.rotation;
    return Math.abs(ours - reference) <= tolerance;
  }
  return Math.abs((ours - reference) / Math.abs(reference) * 100) <= percentLimit;
}

function displacementPassSummary(execution, ciiRows) {
  let total = 0;
  let targetPass = 0;
  let standingBarPass = 0;
  const nodes = [];
  for (const sourceNodeId of BM4_M038_FORCMNT_NODE_IDS) {
    const referenceRow = ciiRows.get(sourceNodeId);
    assert.ok(referenceRow, `CAESAR displacement row missing FORCMNT node ${sourceNodeId}.`);
    const ours = displacementVector(execution, sourceNodeId);
    const reference = ciiVector(referenceRow);
    let nodeTarget = 0;
    let nodeStanding = 0;
    for (const dof of DOFS) {
      total += 1;
      if (passes(ours[dof], reference[dof], dof, BM4_COMPARISON_POLICY.targetTolerancePercent)) {
        targetPass += 1;
        nodeTarget += 1;
      }
      if (passes(ours[dof], reference[dof], dof, BM4_COMPARISON_POLICY.relativeTolerancePercent)) {
        standingBarPass += 1;
        nodeStanding += 1;
      }
    }
    nodes.push({ sourceNodeId, targetPass: nodeTarget, standingBarPass: nodeStanding, total: DOFS.length });
  }
  return Object.freeze({
    target: Object.freeze({ pass: targetPass, total, percent: targetPass / total * 100 }),
    standingBar: Object.freeze({ pass: standingBarPass, total, percent: standingBarPass / total * 100 }),
    nodes: Object.freeze(nodes),
  });
}

const baseline = solveBm4InputXmlConditioned();
const baselineSus = assertMembership('M034 SUS', baseline.sustained.loadCase, 'BM4.N');
const baselineOpe = assertMembership('M034 OPE', baseline.operating.loadCase, 'BM4.N');
assert.deepEqual(baselineSus, baselineOpe, 'M034 SUS/OPE FORCMNT mechanics must be identical.');

const combined = solveBm4M035M036Combined();
const combinedSus = assertMembership('M035+M036 SUS', combined.sustained.loadCase, 'BM4M035.N');
const combinedOpe = assertMembership('M035+M036 OPE', combined.operating.loadCase, 'BM4M035.N');
assert.deepEqual(combinedSus, combinedOpe, 'M035+M036 SUS/OPE FORCMNT mechanics must be identical.');

for (let row = 0; row < combinedSus.length; row += 1) {
  for (let component = 0; component < 6; component += 1) {
    assert.equal(
      combinedOpe[row].vector[component] - combinedSus[row].vector[component],
      0,
      `EXP cancellation failed at ${combinedSus[row].sourceNodeId} component ${component}.`,
    );
  }
}

for (const loadCase of [baseline.sustained.loadCase, baseline.operating.loadCase, combined.sustained.loadCase, combined.operating.loadCase]) {
  for (const pressure of loadCase.primitives.filter((row) => row.kind === 'PRESSURE')) {
    assert.equal(pressure.authorizedEffects.bourdon, false, 'M038 FORCMNT must not silently authorize Bourdon mechanics.');
  }
}

const cii = loadBm4CiiOutputCases1921();
const susPass = displacementPassSummary(combined.sustained.execution, cii.displacement.get('SUS'));
const opePass = displacementPassSummary(combined.operating.execution, cii.displacement.get('OPE'));

console.log(JSON.stringify({
  schema: 'm038-bm4-forcmnt-check/v1',
  authority: BM4_M038_FORCMNT_AUTHORITY,
  mechanics: {
    realVectorRows: combinedSus.length,
    nodeIds: combinedSus.map((row) => row.sourceNodeId),
    susOpeMembershipIdentical: true,
    expansionCancellationExact: true,
    bourdonStillDisabled: true,
  },
  activeSet: {
    sustained: combined.sustainedRun.convergedState,
    operating: combined.operatingRun.convergedState,
  },
  forcmntNodeDisplacementComparison: {
    SUS: susPass,
    OPE: opePass,
  },
}, null, 2));
