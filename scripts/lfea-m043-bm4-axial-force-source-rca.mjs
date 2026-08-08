#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  BM4_COMPARISON_POLICY,
  loadBm4CiiOutputCases1921,
} from './lfea-m034-bm4-output-comparison.mjs';
import {
  BM4_M036_LIFTOFF_NODE_IDS,
} from './lfea-m034-bm4-solve-fixtures.mjs';
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
const FORCE_DOFS = Object.freeze(['UX', 'UY', 'UZ']);
const FRICTION = new Set(BM4_M040_FRICTION_NODE_IDS);
const MU = BM4_M040_FRICTION_AUTHORITY.source.frictionCoefficient;
const FORCE_TOL = BM4_COMPARISON_POLICY.absoluteTolerance.force;

function pairKey(entry) {
  return `${entry.sourceSegment.startNodeId}-${entry.sourceSegment.endNodeId}`;
}
function sourceAxial(solved, recovery) {
  const recovered = new Map(recovery.elementActions.map((row) => [row.elementId, row]));
  const result = new Map();
  for (const sourceEntry of solved.authorities.base.entries) {
    const sourceId = String(sourceEntry.sourceSegment.id);
    const descendants = solved.authorities.entries.filter((entry) => entry.sourceSegmentId === sourceId);
    const first = recovered.get(descendants[0]?.elementId);
    const last = recovered.get(descendants.at(-1)?.elementId);
    if (!first || !last) throw new Error(`M043 missing source recovery for ${sourceId}.`);
    result.set(pairKey(sourceEntry), Object.freeze({
      sourceId,
      fromNode: String(sourceEntry.sourceSegment.startNodeId),
      toNode: String(sourceEntry.sourceSegment.endNodeId),
      I: first.local.I.fx,
      J: last.local.J.fx,
    }));
  }
  return result;
}
function sourceCaseAxial(solved) {
  const sus = sourceAxial(solved, solved.sustained.recovery);
  const ope = sourceAxial(solved, solved.operating.recovery);
  const exp = new Map();
  for (const [key, hot] of ope) {
    const cold = sus.get(key);
    exp.set(key, Object.freeze({
      ...hot,
      I: hot.I - cold.I,
      J: hot.J - cold.J,
    }));
  }
  return new Map([['SUS', sus], ['OPE', ope], ['EXP', exp]]);
}
function axialComparisons(oursByCase, cii) {
  const result = new Map(CASES.map((label) => [label, new Map()]));
  for (const label of CASES) {
    for (const [key, refs] of cii.localForce.get(label).byPair) {
      const ours = oursByCase.get(label).get(key);
      if (refs.length !== 1 || !ours) continue;
      const ref = refs[0];
      result.get(label).set(key, Object.freeze({
        sourceId: ours.sourceId,
        fromNode: ours.fromNode,
        toNode: ours.toNode,
        I: Object.freeze({ ours: ours.I, cii: ref.I.fx, delta: ours.I - ref.I.fx }),
        J: Object.freeze({ ours: ours.J, cii: ref.J.fx, delta: ours.J - ref.J.fx }),
      }));
    }
  }
  return result;
}
function axialFailureCounts(axial) {
  const result = {};
  for (const label of CASES) {
    let compared = 0;
    let failed = 0;
    for (const row of axial.get(label).values()) for (const end of ENDS) {
      const ref = Math.abs(row[end].cii);
      const delta = Math.abs(row[end].delta);
      const passed = ref <= BM4_COMPARISON_POLICY.nearZeroReferenceThreshold
        ? delta <= FORCE_TOL
        : delta / ref * 100 <= BM4_COMPARISON_POLICY.targetTolerancePercent;
      compared += 1;
      if (!passed) failed += 1;
    }
    result[label] = Object.freeze({ compared, failed });
  }
  return Object.freeze(result);
}
function point(geometry, nodeId) {
  const row = geometry.nodes.find((node) => String(node.id) === String(nodeId));
  if (!row) throw new Error(`M043 missing geometry node ${nodeId}.`);
  return [row.x, row.y, row.z];
}
function minus(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function unit(a) {
  const length = Math.hypot(...a);
  if (!(length > 0)) throw new Error('M043 zero-length tangent.');
  return a.map((value) => value / length);
}
function reactionMap(execution) {
  const result = new Map();
  for (const row of execution.reactions) {
    if (!FORCE_DOFS.includes(row.dof)) continue;
    const nodeId = String(row.nodeId).replace(/^BM4M035\.N/u, '');
    if (!result.has(nodeId)) result.set(nodeId, { x: 0, y: 0, z: 0 });
    result.get(nodeId)[{ UX: 'x', UY: 'y', UZ: 'z' }[row.dof]] += row.value;
  }
  return result;
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
function project(vector, tangent) {
  return vector.x * tangent[0] + vector.y * tangent[1] + vector.z * tangent[2];
}
function nodeDofs(rows, nodeId, excludeUy = false) {
  return rows
    .filter((row) => String(row.nodeId).replace(/^BM4M035\.N/u, '') === nodeId && (!excludeUy || row.dof !== 'UY'))
    .map((row) => row.dof).sort();
}
function straightThroughRows(solved, axial, rawCii, oursReactions) {
  const entries = solved.authorities.base.entries;
  const incoming = new Map();
  const outgoing = new Map();
  for (const entry of entries) {
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
    const inEntry = ins[0];
    const outEntry = outs[0];
    const p = point(solved.authorities.analysisGeometry, nodeId);
    const tangentIn = unit(minus(p, point(solved.authorities.analysisGeometry, inEntry.sourceSegment.startNodeId)));
    const tangentOut = unit(minus(point(solved.authorities.analysisGeometry, outEntry.sourceSegment.endNodeId), p));
    const alignment = dot(tangentIn, tangentOut);
    if (alignment < 0.9999) continue;
    const inKey = pairKey(inEntry);
    const outKey = pairKey(outEntry);
    const baseDofs = nodeDofs(solved.inventory.base, nodeId);
    const otherUnilateralDofs = nodeDofs(solved.inventory.unilateral, nodeId, true);
    for (const label of CASES) {
      const incomingAxial = axial.get(label).get(inKey);
      const outgoingAxial = axial.get(label).get(outKey);
      if (!incomingAxial || !outgoingAxial) continue;
      const jump = outgoingAxial.I.delta - incomingAxial.J.delta;
      const ours = oursReactions.get(label).get(nodeId) ?? { x: 0, y: 0, z: 0 };
      const cii = ciiReaction(rawCii.restraint.get(label).get(nodeId));
      const reactionDeltaTangent = project(ours, tangentIn) - project(cii, tangentIn);
      const plusResidual = jump + reactionDeltaTangent;
      const minusResidual = jump - reactionDeltaTangent;
      const scale = Math.max(Math.abs(jump), Math.abs(reactionDeltaTangent), 1);
      const frictionOnly = FRICTION.has(nodeId) && baseDofs.length === 0 && otherUnilateralDofs.length === 0;
      const normalMagnitude = Math.abs(cii.y);
      const frictionPlaneMagnitude = Math.hypot(cii.x, cii.z);
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
        frictionOnlyPlusYSupport: frictionOnly,
        baseDofs,
        otherUnilateralDofs,
        ciiRawFy: cii.y,
        ciiNormalMagnitude: normalMagnitude,
        ciiFrictionPlaneMagnitude: frictionPlaneMagnitude,
        coulombCapacityMagnitude: MU * normalMagnitude,
        ciiTangentialMagnitudeWithinCoulombEnvelope: !FRICTION.has(nodeId) || frictionPlaneMagnitude <= MU * normalMagnitude + FORCE_TOL,
      }));
    }
  }
  return rows;
}
function pressureRows(solved) {
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
      identicalPhysicalPressure: Boolean(hot) && hot.pressure === row.pressure && hot.pressureBasis === row.pressureBasis,
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
function maxAbsRow(rows, field) {
  return [...rows].sort((a, b) => Math.abs(b[field]) - Math.abs(a[field]) || a.nodeId.localeCompare(b.nodeId))[0] ?? null;
}

const solved = solveBm4M035M036Combined();
const rawCii = loadBm4CiiOutputCases1921();
const cii = normalizeBm4CiiLocalForceForM035(rawCii, solved.authorities);
const ours = sourceCaseAxial(solved);
const axial = axialComparisons(ours, cii);
const counts = axialFailureCounts(axial);
const reactions = reactionCases(solved);
const straight = straightThroughRows(solved, axial, rawCii, reactions);
const friction = straight.filter((row) => row.frictionAuthority);
const pureFriction = straight.filter((row) => row.frictionOnlyPlusYSupport);
const nonzeroPureFriction = pureFriction.filter((row) => row.ciiFrictionPlaneMagnitude > FORCE_TOL);
const pressure = pressureRows(solved);
const currentReleased = Object.freeze({
  SUS: releasedTargetIds(solved.sustainedRun, BM4_M036_LIFTOFF_NODE_IDS),
  OPE: releasedTargetIds(solved.operatingRun, BM4_M036_LIFTOFF_NODE_IDS),
});
const authorityReleased = Object.freeze({ SUS: ciiReleased(rawCii, 'SUS'), OPE: ciiReleased(rawCii, 'OPE') });
const known22370 = straight.find((row) => row.caseLabel === 'OPE' && row.nodeId === '22370') ?? null;
const prior22370 = BM4_M040_FRICTION_AUTHORITY.bm4ReachabilityDiagnostic;
const plusClosure = friction.filter((row) => row.plusNormalizedResidual <= 0.05 || Math.abs(row.plusResidual) <= 5);
const minusClosure = friction.filter((row) => row.minusNormalizedResidual <= 0.05 || Math.abs(row.minusResidual) <= 5);
const commonPressure = pressure.every((row) => row.identicalPhysicalPressure && !row.susAxialThrust && !row.opeAxialThrust);

assert.ok(straight.length > 0, 'M043 requires straight-through source-node diagnostics.');
assert.ok(friction.length > 0, 'M043 requires friction-authority source-node diagnostics.');
assert.ok(known22370, 'M043 must retain node 22370 in the generalized straight-through diagnostic.');
assert.ok(commonPressure, 'M043 expects identical P1 pressure primitives in SUS/OPE with axialThrust disabled.');
assert.deepEqual(currentReleased.OPE, authorityReleased.OPE,
  'M043 expects M036 OPE target +Y liftoff state to match CAESAR before rejecting liftoff as the sole OPE cause.');
assert.ok(counts.EXP.failed > 0, 'M043 requires nonzero EXP axial divergence for the common-mode pressure test.');
assert.ok(nonzeroPureFriction.length > 0,
  'M043 requires at least one pure +Y friction location with nonzero CAESAR tangential reaction before identifying a friction reaction boundary.');

const report = Object.freeze({
  schema: 'lfea-m043-bm4-axial-force-source-rca/v2',
  targetCases: Object.freeze({ SUS: 19, OPE: 20, EXP: 21 }),
  axialFailureCounts: counts,
  pressureCommonModeTest: Object.freeze({
    pressurePrimitiveCount: pressure.length,
    identicalP1InSusAndOpe: pressure.every((row) => row.identicalPhysicalPressure),
    axialThrustAuthorizedInQualifiedPath: pressure.some((row) => row.susAxialThrust || row.opeAxialThrust),
    expansionAxialFailureCount: counts.EXP.failed,
    simpleStateIndependentCommonModePressureThrustSufficient: false,
    interpretation: 'IDENTICAL_ADDITIVE_P1_AXIAL_THRUST_WOULD_CANCEL_IN_L20_MINUS_L19_AND_CANNOT_BY_ITSELF_EXPLAIN_NONZERO_EXP_AXIAL_DIVERGENCE',
    rows: pressure,
  }),
  liftoffStateTest: Object.freeze({
    currentReleased,
    authorityReleased,
    opeTargetStateMatchesAuthority: JSON.stringify(currentReleased.OPE) === JSON.stringify(authorityReleased.OPE),
    sustainedTargetStateMatchesAuthority: JSON.stringify(currentReleased.SUS) === JSON.stringify(authorityReleased.SUS),
    liftoffMismatchSufficientForOpeAxialDivergence: false,
    interpretation: 'OPE_TARGET_PLUS_Y_RELEASE_SET_MATCHES_CAESAR_WHILE_OPE_AXIAL_DIVERGENCE_REMAINS_WIDESPREAD',
  }),
  supportReactionBoundary: Object.freeze({
    straightThroughRows: straight.length,
    frictionAuthorityRows: friction.length,
    pureFrictionRows: pureFriction.length,
    nonzeroPureFrictionRows: nonzeroPureFriction.length,
    plusEquilibriumClosureRows: plusClosure.length,
    minusEquilibriumClosureRows: minusClosure.length,
    strongestAxialMismatchJump: maxAbsRow(friction, 'axialMismatchJump'),
    strongestReactionDeltaTangent: maxAbsRow(friction, 'reactionDeltaTangent'),
    rows: straight,
  }),
  m040CrossAuthorityCheck: Object.freeze({
    priorDiagnostic: prior22370,
    currentCase20StraightThroughRow: known22370,
    normalMagnitudeDifference: known22370.ciiNormalMagnitude - prior22370.normalReactionN,
    axialMismatchJumpMagnitudeDifference: Math.abs(known22370.axialMismatchJump) - prior22370.adjacentAxialResidualN,
    disposition: 'PRIOR_M037_ISSUE_DIAGNOSTIC_RETAINED_AS_SEPARATE_EVIDENCE_TIER_NOT_FORCED_EQUAL_TO_CURRENT_AGGREGATED_OUTPUT',
  }),
  frictionAuthorityBoundary: Object.freeze({
    sourceAuthorizedNodeCount: BM4_M040_FRICTION_NODE_IDS.length,
    coefficient: MU,
    currentBm4ActivationQualified: BM4_M040_FRICTION_AUTHORITY.disposition.qualifiedBm4Activation,
    outputFitMayAuthorizeState: false,
    pureFrictionTangentialReactionObserved: true,
    interpretation: 'SOURCE_AUTHORIZED_FRICTION_IS_ABSENT_FROM_THE_QUALIFIED_BM4_SOLVE_WHILE_CAESAR_REPORTS_NONZERO_TANGENTIAL_REACTION_AT_PURE_PLUS_Y_FRICTION_LOCATIONS; THIS_IDENTIFIES_A_REAL_LEVEL1_SUPPORT_REACTION_BOUNDARY_WITHOUT_SELECTING_FRICTION_STATES_FROM_OUTPUT',
  }),
  disposition: Object.freeze({
    mechanicsChangedByM043: false,
    forcmntReopened: false,
    bourdonErrorConcluded: false,
    simpleCommonModePressureThrustConcluded: false,
    plusYLiftoffMismatchConcludedAsSoleCause: false,
    frictionProductionActivationPermitted: false,
    conclusion: 'FIRST_IDENTIFIED_MISSING_SOURCE_AUTHORIZED_LEVEL1_MECHANISM_IS_FRICTION_SUPPORT_REACTION',
    nextRcaBoundary: 'BM4_FRICTION_GLOBAL_STATE_UNIQUENESS_OR_INDEPENDENT_STATE_HISTORY_AUTHORITY',
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
console.log(`M043 pressure common-mode sufficient: ${report.pressureCommonModeTest.simpleStateIndependentCommonModePressureThrustSufficient}`);
console.log(`M043 liftoff states: ${JSON.stringify(report.liftoffStateTest)}`);
console.log(`M043 pure friction nonzero tangential rows: ${report.supportReactionBoundary.nonzeroPureFrictionRows}/${report.supportReactionBoundary.pureFrictionRows}`);
console.log(`M043 friction equilibrium closure plus/minus: ${report.supportReactionBoundary.plusEquilibriumClosureRows}/${report.supportReactionBoundary.minusEquilibriumClosureRows} of ${report.supportReactionBoundary.frictionAuthorityRows}`);
console.log(`M043 node 22370 evidence tiers: ${JSON.stringify(report.m040CrossAuthorityCheck)}`);
console.log(`M043 conclusion: ${report.disposition.conclusion}`);
