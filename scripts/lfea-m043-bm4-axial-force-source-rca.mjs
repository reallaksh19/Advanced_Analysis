#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  BM4_COMPARISON_POLICY,
  loadBm4CiiOutputCases1921,
} from './lfea-m034-bm4-output-comparison.mjs';
import { BM4_M036_LIFTOFF_NODE_IDS } from './lfea-m034-bm4-solve-fixtures.mjs';
import {
  releasedTargetIds,
  solveBm4M035M036Combined,
} from './lfea-m035-m036-bm4-integration-runtime.mjs';
import {
  BM4_M040_FRICTION_AUTHORITY,
  BM4_M040_FRICTION_NODE_IDS,
} from './lfea-m040-bm4-friction-authority.mjs';
import { normalizeBm4CiiLocalForceForM035 } from './lfea-bm4-local-force-reference-normalization.mjs';

const CASES = Object.freeze(['SUS', 'OPE', 'EXP']);
const ENDS = Object.freeze(['I', 'J']);
const FRICTION = new Set(BM4_M040_FRICTION_NODE_IDS);
const FORCE_TOL = BM4_COMPARISON_POLICY.absoluteTolerance.force;

function pairKey(entry) {
  return `${entry.sourceSegment.startNodeId}-${entry.sourceSegment.endNodeId}`;
}
function sourceAxial(solved, recovery) {
  const recovered = new Map(recovery.elementActions.map((row) => [row.elementId, row]));
  const out = new Map();
  for (const source of solved.authorities.base.entries) {
    const sourceId = String(source.sourceSegment.id);
    const descendants = solved.authorities.entries.filter((entry) => entry.sourceSegmentId === sourceId);
    const first = recovered.get(descendants[0]?.elementId);
    const last = recovered.get(descendants.at(-1)?.elementId);
    if (!first || !last) throw new Error(`M043 missing recovery for ${sourceId}.`);
    out.set(pairKey(source), Object.freeze({
      sourceId,
      fromNode: String(source.sourceSegment.startNodeId),
      toNode: String(source.sourceSegment.endNodeId),
      I: first.local.I.fx,
      J: last.local.J.fx,
    }));
  }
  return out;
}
function oursByCase(solved) {
  const sus = sourceAxial(solved, solved.sustained.recovery);
  const ope = sourceAxial(solved, solved.operating.recovery);
  const exp = new Map();
  for (const [key, hot] of ope) {
    const cold = sus.get(key);
    exp.set(key, Object.freeze({ ...hot, I: hot.I - cold.I, J: hot.J - cold.J }));
  }
  return new Map([['SUS', sus], ['OPE', ope], ['EXP', exp]]);
}
function compareAxial(ours, cii) {
  const out = new Map(CASES.map((label) => [label, new Map()]));
  for (const label of CASES) {
    for (const [key, refs] of cii.localForce.get(label).byPair) {
      const row = ours.get(label).get(key);
      if (refs.length !== 1 || !row) continue;
      const ref = refs[0];
      out.get(label).set(key, Object.freeze({
        ...row,
        I: Object.freeze({ ours: row.I, cii: ref.I.fx, delta: row.I - ref.I.fx }),
        J: Object.freeze({ ours: row.J, cii: ref.J.fx, delta: row.J - ref.J.fx }),
      }));
    }
  }
  return out;
}
function failureCounts(axial) {
  const result = {};
  for (const label of CASES) {
    let compared = 0;
    let failed = 0;
    for (const row of axial.get(label).values()) for (const end of ENDS) {
      const ref = Math.abs(row[end].cii);
      const delta = Math.abs(row[end].delta);
      const pass = ref <= BM4_COMPARISON_POLICY.nearZeroReferenceThreshold
        ? delta <= FORCE_TOL
        : delta / ref * 100 <= BM4_COMPARISON_POLICY.targetTolerancePercent;
      compared += 1;
      if (!pass) failed += 1;
    }
    result[label] = Object.freeze({ compared, failed });
  }
  return Object.freeze(result);
}
function point(geometry, id) {
  const row = geometry.nodes.find((node) => String(node.id) === String(id));
  if (!row) throw new Error(`M043 missing node ${id}.`);
  return [row.x, row.y, row.z];
}
function unit(a) {
  const n = Math.hypot(...a);
  if (!(n > 0)) throw new Error('M043 zero-length tangent.');
  return a.map((v) => v / n);
}
function minus(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function project(v, t) { return v.x * t[0] + v.y * t[1] + v.z * t[2]; }
function reactionMap(execution) {
  const out = new Map();
  for (const row of execution.reactions) {
    if (!['UX', 'UY', 'UZ'].includes(row.dof)) continue;
    const nodeId = String(row.nodeId).replace(/^BM4M035\.N/u, '');
    if (!out.has(nodeId)) out.set(nodeId, { x: 0, y: 0, z: 0 });
    out.get(nodeId)[{ UX: 'x', UY: 'y', UZ: 'z' }[row.dof]] += row.value;
  }
  return out;
}
function reactionCases(solved) {
  const sus = reactionMap(solved.sustained.execution);
  const ope = reactionMap(solved.operating.execution);
  const exp = new Map();
  for (const nodeId of new Set([...sus.keys(), ...ope.keys()])) {
    const a = ope.get(nodeId) ?? { x: 0, y: 0, z: 0 };
    const b = sus.get(nodeId) ?? { x: 0, y: 0, z: 0 };
    exp.set(nodeId, { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  }
  return new Map([['SUS', sus], ['OPE', ope], ['EXP', exp]]);
}
function ciiReaction(row) {
  return row ? { x: row.FX, y: row.FY, z: row.FZ } : { x: 0, y: 0, z: 0 };
}
function straightRows(solved, axial, rawCii, oursReactions) {
  const incoming = new Map();
  const outgoing = new Map();
  for (const entry of solved.authorities.base.entries) {
    const from = String(entry.sourceSegment.startNodeId);
    const to = String(entry.sourceSegment.endNodeId);
    if (!incoming.has(to)) incoming.set(to, []);
    if (!outgoing.has(from)) outgoing.set(from, []);
    incoming.get(to).push(entry);
    outgoing.get(from).push(entry);
  }
  const rows = [];
  for (const nodeId of new Set([...incoming.keys(), ...outgoing.keys()])) {
    const ins = incoming.get(nodeId) ?? [];
    const outs = outgoing.get(nodeId) ?? [];
    if (ins.length !== 1 || outs.length !== 1) continue;
    const p = point(solved.authorities.analysisGeometry, nodeId);
    const tIn = unit(minus(p, point(solved.authorities.analysisGeometry, ins[0].sourceSegment.startNodeId)));
    const tOut = unit(minus(point(solved.authorities.analysisGeometry, outs[0].sourceSegment.endNodeId), p));
    const alignment = dot(tIn, tOut);
    if (alignment < 0.9999) continue;
    const inKey = pairKey(ins[0]);
    const outKey = pairKey(outs[0]);
    for (const label of CASES) {
      const left = axial.get(label).get(inKey);
      const right = axial.get(label).get(outKey);
      if (!left || !right) continue;
      const jump = right.I.delta - left.J.delta;
      const ours = oursReactions.get(label).get(nodeId) ?? { x: 0, y: 0, z: 0 };
      const cii = ciiReaction(rawCii.restraint.get(label).get(nodeId));
      const reactionDeltaTangent = project(ours, tIn) - project(cii, tIn);
      const plusResidual = jump + reactionDeltaTangent;
      const minusResidual = jump - reactionDeltaTangent;
      const scale = Math.max(Math.abs(jump), Math.abs(reactionDeltaTangent), 1);
      rows.push(Object.freeze({
        caseLabel: label,
        nodeId,
        incomingPair: inKey,
        outgoingPair: outKey,
        alignment,
        axialMismatchJump: jump,
        reactionDeltaTangent,
        plusResidual,
        minusResidual,
        plusNormalizedResidual: Math.abs(plusResidual) / scale,
        minusNormalizedResidual: Math.abs(minusResidual) / scale,
        frictionAuthority: FRICTION.has(nodeId),
        ciiFx: cii.x,
        ciiFy: cii.y,
        ciiFz: cii.z,
        ciiFrictionPlaneMagnitude: Math.hypot(cii.x, cii.z),
      }));
    }
  }
  return rows;
}
function pressureInventory(solved) {
  const read = (analysis) => new Map(analysis.loadCase.primitives
    .filter((row) => row.kind === 'PRESSURE')
    .map((row) => [row.elementId, row]));
  const sus = read(solved.sustained);
  const ope = read(solved.operating);
  return [...sus].map(([elementId, row]) => {
    const hot = ope.get(elementId);
    return Object.freeze({
      elementId,
      pressure: row.pressure,
      identicalP1: Boolean(hot) && hot.pressure === row.pressure && hot.pressureBasis === row.pressureBasis,
      susAxialThrust: row.authorizedEffects.axialThrust,
      opeAxialThrust: hot?.authorizedEffects.axialThrust,
    });
  });
}
function ciiReleased(rawCii, label) {
  return BM4_M036_LIFTOFF_NODE_IDS.filter((nodeId) => {
    const row = rawCii.restraint.get(label).get(nodeId);
    return !row || Math.abs(row.FY) <= FORCE_TOL;
  }).sort();
}
function maxAbs(rows, field) {
  return [...rows].sort((a, b) => Math.abs(b[field]) - Math.abs(a[field]) || a.nodeId.localeCompare(b.nodeId))[0] ?? null;
}

const solved = solveBm4M035M036Combined();
const rawCii = loadBm4CiiOutputCases1921();
const cii = normalizeBm4CiiLocalForceForM035(rawCii, solved.authorities);
const axial = compareAxial(oursByCase(solved), cii);
const counts = failureCounts(axial);
const straight = straightRows(solved, axial, rawCii, reactionCases(solved));
const frictionRows = straight.filter((row) => row.frictionAuthority);
const significantFrictionRows = frictionRows.filter((row) => Math.abs(row.axialMismatchJump) > FORCE_TOL || Math.abs(row.reactionDeltaTangent) > FORCE_TOL);
const plusClosure = significantFrictionRows.filter((row) => row.plusNormalizedResidual <= 0.05 || Math.abs(row.plusResidual) <= 5);
const minusClosure = significantFrictionRows.filter((row) => row.minusNormalizedResidual <= 0.05 || Math.abs(row.minusResidual) <= 5);
const nonzeroCiiTangential = frictionRows.filter((row) => row.ciiFrictionPlaneMagnitude > FORCE_TOL);
const pressure = pressureInventory(solved);
const commonPressure = pressure.every((row) => row.identicalP1 && !row.susAxialThrust && !row.opeAxialThrust);
const currentReleased = Object.freeze({
  SUS: releasedTargetIds(solved.sustainedRun, BM4_M036_LIFTOFF_NODE_IDS),
  OPE: releasedTargetIds(solved.operatingRun, BM4_M036_LIFTOFF_NODE_IDS),
});
const authorityReleased = Object.freeze({ SUS: ciiReleased(rawCii, 'SUS'), OPE: ciiReleased(rawCii, 'OPE') });
const known22370 = straight.find((row) => row.caseLabel === 'OPE' && row.nodeId === '22370') ?? null;
const prior22370 = BM4_M040_FRICTION_AUTHORITY.bm4ReachabilityDiagnostic;
const bestClosureCount = Math.max(plusClosure.length, minusClosure.length);
const closureFraction = significantFrictionRows.length ? bestClosureCount / significantFrictionRows.length : 0;

assert.ok(straight.length > 0, 'M043 requires straight-through source-node diagnostics.');
assert.ok(frictionRows.length > 0, 'M043 requires friction-authority straight-through diagnostics.');
assert.ok(known22370, 'M043 must retain node 22370 in the generalized diagnostic.');
assert.ok(commonPressure, 'M043 expects identical P1 in SUS/OPE with axialThrust disabled.');
assert.deepEqual(currentReleased.OPE, authorityReleased.OPE,
  'M043 expects OPE target +Y release set to match CAESAR before rejecting liftoff as the sole OPE cause.');
assert.ok(counts.EXP.failed > 0, 'M043 requires nonzero EXP axial divergence for the common-mode pressure test.');

const reactionBoundaryObserved = significantFrictionRows.length > 0 && bestClosureCount > 0;
const report = Object.freeze({
  schema: 'lfea-m043-bm4-axial-force-source-rca/v3',
  targetCases: Object.freeze({ SUS: 19, OPE: 20, EXP: 21 }),
  axialFailureCounts: counts,
  pressureCommonModeTest: Object.freeze({
    pressurePrimitiveCount: pressure.length,
    identicalP1InSusAndOpe: pressure.every((row) => row.identicalP1),
    axialThrustAuthorizedInQualifiedPath: pressure.some((row) => row.susAxialThrust || row.opeAxialThrust),
    expansionAxialFailureCount: counts.EXP.failed,
    simpleStateIndependentCommonModePressureThrustSufficient: false,
    interpretation: 'IDENTICAL_ADDITIVE_P1_AXIAL_THRUST_WOULD_CANCEL_IN_L20_MINUS_L19_AND_CANNOT_BY_ITSELF_EXPLAIN_NONZERO_EXP_AXIAL_DIVERGENCE',
  }),
  liftoffStateTest: Object.freeze({
    currentReleased,
    authorityReleased,
    opeTargetStateMatchesAuthority: JSON.stringify(currentReleased.OPE) === JSON.stringify(authorityReleased.OPE),
    sustainedTargetStateMatchesAuthority: JSON.stringify(currentReleased.SUS) === JSON.stringify(authorityReleased.SUS),
    liftoffMismatchSufficientForOpeAxialDivergence: false,
  }),
  supportReactionBoundary: Object.freeze({
    straightThroughRows: straight.length,
    frictionAuthorityRows: frictionRows.length,
    significantFrictionRows: significantFrictionRows.length,
    nonzeroCiiTangentialRowsAtFrictionAuthorityNodes: nonzeroCiiTangential.length,
    plusEquilibriumClosureRows: plusClosure.length,
    minusEquilibriumClosureRows: minusClosure.length,
    bestClosureCount,
    bestClosureFraction: closureFraction,
    strongestAxialMismatchJump: maxAbs(frictionRows, 'axialMismatchJump'),
    strongestReactionDeltaTangent: maxAbs(frictionRows, 'reactionDeltaTangent'),
    rows: frictionRows,
  }),
  m040CrossAuthorityCheck: Object.freeze({
    priorDiagnostic: prior22370,
    currentCase20Row: known22370,
    normalMagnitudeComparisonNotEnforced: true,
    axialResidualComparisonNotEnforced: true,
    disposition: 'PRIOR_M037_ISSUE_DIAGNOSTIC_IS_A_SEPARATE_EVIDENCE_TIER_AND_IS_NOT_FORCED_EQUAL_TO_CURRENT_AGGREGATED_CASE20_OUTPUT',
  }),
  disposition: Object.freeze({
    mechanicsChangedByM043: false,
    forcmntReopened: false,
    bourdonErrorConcluded: false,
    simpleCommonModePressureThrustConcluded: false,
    plusYLiftoffMismatchConcludedAsSoleCause: false,
    frictionProductionActivationPermitted: false,
    supportReactionBoundaryObserved: reactionBoundaryObserved,
    conclusion: reactionBoundaryObserved
      ? 'LEVEL1_AXIAL_DIVERGENCE_REACHES_SUPPORT_REACTION_DIFFERENCE_AT_FRICTION_AUTHORITY_NODES'
      : 'LEVEL1_FRICTION_REACTION_BOUNDARY_NOT_YET_ISOLATED',
    nextRcaBoundary: reactionBoundaryObserved
      ? 'QUANTIFY_WHICH_FRICTION_AUTHORITY_NODES_CLOSE_AXIAL_JUMPS_AND_KEEP_STATE_SELECTION_FAIL_CLOSED'
      : 'CONTINUE_LEVEL1_PRESSURE_SECTION_OR_SUPPORT_AUTHORITY_ISOLATION',
  }),
});

const arg = process.argv.indexOf('--report');
if (arg >= 0) {
  const requested = process.argv[arg + 1];
  if (!requested) throw new Error('--report requires a path.');
  const path = resolve(requested);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(`M043 axial failures: ${JSON.stringify(report.axialFailureCounts)}`);
console.log(`M043 common-mode pressure sufficient: ${report.pressureCommonModeTest.simpleStateIndependentCommonModePressureThrustSufficient}`);
console.log(`M043 liftoff states: ${JSON.stringify(report.liftoffStateTest)}`);
console.log(`M043 friction rows/significant/nonzero-CII-tangent: ${frictionRows.length}/${significantFrictionRows.length}/${nonzeroCiiTangential.length}`);
console.log(`M043 friction closure plus/minus: ${plusClosure.length}/${minusClosure.length}; best fraction ${closureFraction}`);
console.log(`M043 strongest axial jump: ${JSON.stringify(report.supportReactionBoundary.strongestAxialMismatchJump)}`);
console.log(`M043 strongest tangent reaction delta: ${JSON.stringify(report.supportReactionBoundary.strongestReactionDeltaTangent)}`);
console.log(`M043 node 22370 evidence tiers: ${JSON.stringify(report.m040CrossAuthorityCheck)}`);
console.log(`M043 conclusion: ${report.disposition.conclusion}`);
