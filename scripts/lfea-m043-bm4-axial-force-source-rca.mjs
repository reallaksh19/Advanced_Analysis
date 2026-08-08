#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  BM4_COMPARISON_POLICY,
  loadBm4CiiOutputCases1921,
} from './lfea-m034-bm4-output-comparison.mjs';
import {
  releasedTargetIds,
  solveBm4M035M036Combined,
} from './lfea-m035-m036-bm4-integration-runtime.mjs';
import { BM4_M036_LIFTOFF_NODE_IDS } from './lfea-m034-bm4-solve-fixtures.mjs';
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
function subtract(left, right) {
  return {
    fx: (left?.fx ?? 0) - (right?.fx ?? 0),
    fy: (left?.fy ?? 0) - (right?.fy ?? 0),
    fz: (left?.fz ?? 0) - (right?.fz ?? 0),
    mx: (left?.mx ?? 0) - (right?.mx ?? 0),
    my: (left?.my ?? 0) - (right?.my ?? 0),
    mz: (left?.mz ?? 0) - (right?.mz ?? 0),
  };
}
function sourceActions(solved, recovery) {
  const recovered = new Map(recovery.elementActions.map((row) => [row.elementId, row]));
  const result = new Map();
  for (const sourceEntry of solved.authorities.base.entries) {
    const sourceId = String(sourceEntry.sourceSegment.id);
    const descendants = solved.authorities.entries.filter((entry) => entry.sourceSegmentId === sourceId);
    const first = recovered.get(descendants[0]?.elementId);
    const last = recovered.get(descendants.at(-1)?.elementId);
    if (!first || !last) throw new Error(`M043 missing recovered source actions for ${sourceId}.`);
    result.set(pairKey(sourceEntry), Object.freeze({
      sourceId,
      fromNode: String(sourceEntry.sourceSegment.startNodeId),
      toNode: String(sourceEntry.sourceSegment.endNodeId),
      local: Object.freeze({ I: first.local.I, J: last.local.J }),
      global: Object.freeze({ I: first.global.I, J: last.global.J }),
    }));
  }
  return result;
}
function sourceCaseActions(solved) {
  const sus = sourceActions(solved, solved.sustained.recovery);
  const ope = sourceActions(solved, solved.operating.recovery);
  const exp = new Map();
  for (const [key, operating] of ope) {
    const sustained = sus.get(key);
    exp.set(key, Object.freeze({
      ...operating,
      local: Object.freeze({
        I: subtract(operating.local.I, sustained.local.I),
        J: subtract(operating.local.J, sustained.local.J),
      }),
      global: Object.freeze({
        I: subtract(operating.global.I, sustained.global.I),
        J: subtract(operating.global.J, sustained.global.J),
      }),
    }));
  }
  return new Map([['SUS', sus], ['OPE', ope], ['EXP', exp]]);
}
function axialComparisons(oursByCase, cii) {
  const result = new Map(CASES.map((label) => [label, new Map()]));
  for (const label of CASES) {
    for (const [key, rows] of cii.localForce.get(label).byPair) {
      if (rows.length !== 1 || !oursByCase.get(label).has(key)) continue;
      const ours = oursByCase.get(label).get(key);
      const ref = rows[0];
      result.get(label).set(key, Object.freeze({
        sourceId: ours.sourceId,
        fromNode: ours.fromNode,
        toNode: ours.toNode,
        I: Object.freeze({ ours: ours.local.I.fx, cii: ref.I.fx, delta: ours.local.I.fx - ref.I.fx }),
        J: Object.freeze({ ours: ours.local.J.fx, cii: ref.J.fx, delta: ours.local.J.fx - ref.J.fx }),
      }));
    }
  }
  return result;
}
function point(geometry, nodeId) {
  const row = geometry.nodes.find((node) => String(node.id) === String(nodeId));
  if (!row) throw new Error(`M043 missing geometry node ${nodeId}.`);
  return [row.x, row.y, row.z];
}
function minus(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function norm(a) { return Math.hypot(...a); }
function unit(a) {
  const n = norm(a);
  if (!(n > 0)) throw new Error('M043 zero-length tangent.');
  return a.map((value) => value / n);
}
function reactionMap(execution) {
  const byNode = new Map();
  for (const row of execution.reactions) {
    if (!FORCE_DOFS.includes(row.dof)) continue;
    const nodeId = String(row.nodeId).replace(/^BM4M035\.N/u, '');
    if (!byNode.has(nodeId)) byNode.set(nodeId, { x: 0, y: 0, z: 0 });
    byNode.get(nodeId)[{ UX: 'x', UY: 'y', UZ: 'z' }[row.dof]] += row.value;
  }
  return byNode;
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
function project(vector, tangent) { return vector.x * tangent[0] + vector.y * tangent[1] + vector.z * tangent[2]; }
function baseDofsAtNode(solved, nodeId) {
  return solved.inventory.base
    .filter((row) => String(row.nodeId).replace(/^BM4M035\.N/u, '') === nodeId)
    .map((row) => row.dof).sort();
}
function otherUnilateralDofsAtNode(solved, nodeId) {
  return solved.inventory.unilateral
    .filter((row) => String(row.nodeId).replace(/^BM4M035\.N/u, '') === nodeId && row.dof !== 'UY')
    .map((row) => row.dof).sort();
}
function straightThroughRows(solved, axial, rawCii, oursReactions) {
  const geometry = solved.authorities.analysisGeometry;
  const sourceEntries = solved.authorities.base.entries;
  const incoming = new Map();
  const outgoing = new Map();
  for (const entry of sourceEntries) {
    const from = String(entry.sourceSegment.startNodeId);
    const to = String(entry.sourceSegment.endNodeId);
    if (!outgoing.has(from)) outgoing.set(from, []);
    if (!incoming.has(to)) incoming.set(to, []);
    outgoing.get(from).push(entry);
    incoming.get(to).push(entry);
  }
  const rows = [];
  for (const nodeId of new Set([...incoming.keys(), ...outgoing.keys()])) {
    const ins = incoming.get(nodeId) ?? [];
    const outs = outgoing.get(nodeId) ?? [];
    if (ins.length !== 1 || outs.length !== 1) continue;
    const inEntry = ins[0];
    const outEntry = outs[0];
    const p = point(geometry, nodeId);
    const tangentIn = unit(minus(p, point(geometry, inEntry.sourceSegment.startNodeId)));
    const tangentOut = unit(minus(point(geometry, outEntry.sourceSegment.endNodeId), p));
    const alignment = dot(tangentIn, tangentOut);
    if (alignment < 0.9999) continue;
    const inKey = pairKey(inEntry);
    const outKey = pairKey(outEntry);
    const baseDofs = baseDofsAtNode(solved, nodeId);
    const otherUnilateralDofs = otherUnilateralDofsAtNode(solved, nodeId);
    for (const label of CASES) {
      const inAxial = axial.get(label).get(inKey);
      const outAxial = axial.get(label).get(outKey);
      if (!inAxial || !outAxial) continue;
      const jump = outAxial.I.delta - inAxial.J.delta;
      const ours = oursReactions.get(label).get(nodeId) ?? { x: 0, y: 0, z: 0 };
      const cii = ciiReaction(rawCii.restraint.get(label).get(nodeId));
      const oursT = project(ours, tangentIn);
      const ciiT = project(cii, tangentIn);
      const reactionDeltaT = oursT - ciiT;
      const expectedResidual = jump + reactionDeltaT;
      const alternateResidual = jump - reactionDeltaT;
      const scale = Math.max(Math.abs(jump), Math.abs(reactionDeltaT), 1);
      const normalReaction = Math.max(0, cii.y);
      const ciiFrictionPlaneMagnitude = Math.hypot(cii.x, cii.z);
      rows.push(Object.freeze({
        caseLabel: label,
        nodeId,
        incomingPair: inKey,
        outgoingPair: outKey,
        alignment,
        axialMismatchJump: jump,
        oursReactionTangent: oursT,
        ciiReactionTangent: ciiT,
        reactionDeltaTangent: reactionDeltaT,
        expectedEquilibriumResidual: expectedResidual,
        expectedNormalizedResidual: Math.abs(expectedResidual) / scale,
        alternateNormalizedResidual: Math.abs(alternateResidual) / scale,
        frictionAuthority: FRICTION.has(nodeId),
        baseDofs,
        otherUnilateralDofs,
        frictionOnlyPlusYSupport: FRICTION.has(nodeId) && baseDofs.length === 0 && otherUnilateralDofs.length === 0,
        ciiNormalReaction: normalReaction,
        ciiFrictionPlaneMagnitude,
        coulombCapacity: MU * normalReaction,
        ciiFrictionWithinCoulomb: !FRICTION.has(nodeId) || ciiFrictionPlaneMagnitude <= MU * normalReaction + FORCE_TOL,
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
  const rows = [];
  for (const [elementId, row] of sus) {
    const hot = ope.get(elementId);
    rows.push(Object.freeze({
      elementId,
      pressure: row.pressure,
      susAxialThrust: row.authorizedEffects.axialThrust,
      opeAxialThrust: hot?.authorizedEffects.axialThrust,
      identicalPhysicalPressure: Boolean(hot) && hot.pressure === row.pressure && hot.pressureBasis === row.pressureBasis,
    }));
  }
  return rows;
}
function ciiReleasedTargets(rawCii, label) {
  return BM4_M036_LIFTOFF_NODE_IDS.filter((nodeId) => {
    const row = rawCii.restraint.get(label).get(nodeId);
    return !row || Math.abs(row.FY) <= FORCE_TOL;
  }).sort();
}
function axialFailureCounts(axial) {
  const byCase = {};
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
    byCase[label] = Object.freeze({ compared, failed });
  }
  return Object.freeze(byCase);
}

const solved = solveBm4M035M036Combined();
const rawCii = loadBm4CiiOutputCases1921();
const normalizedCii = normalizeBm4CiiLocalForceForM035(rawCii, solved.authorities);
const oursByCase = sourceCaseActions(solved);
const axial = axialComparisons(oursByCase, normalizedCii);
const oursReactions = reactionCases(solved);
const straightRows = straightThroughRows(solved, axial, rawCii, oursReactions);
const pressureRows = pressureInventory(solved);
const counts = axialFailureCounts(axial);
const frictionRows = straightRows.filter((row) => row.frictionAuthority);
const frictionOnlyRows = straightRows.filter((row) => row.frictionOnlyPlusYSupport);
const nonzeroCiiFrictionOnly = frictionOnlyRows.filter((row) => row.ciiFrictionPlaneMagnitude > FORCE_TOL);
const closeExpected = frictionRows.filter((row) => row.expectedNormalizedResidual <= 0.05 || Math.abs(row.expectedEquilibriumResidual) <= 5);
const closeAlternate = frictionRows.filter((row) => row.alternateNormalizedResidual <= 0.05);
const known = straightRows.find((row) => row.caseLabel === 'OPE' && row.nodeId === '22370');
const pressureCommonMode = pressureRows.every((row) => row.identicalPhysicalPressure && !row.susAxialThrust && !row.opeAxialThrust);
const currentReleased = Object.freeze({
  SUS: releasedTargetIds(solved.sustainedRun, BM4_M036_LIFTOFF_NODE_IDS),
  OPE: releasedTargetIds(solved.operatingRun, BM4_M036_LIFTOFF_NODE_IDS),
});
const authorityReleased = Object.freeze({ SUS: ciiReleasedTargets(rawCii, 'SUS'), OPE: ciiReleasedTargets(rawCii, 'OPE') });

assert.ok(straightRows.length > 0, 'M043 requires straight-through source-node diagnostics.');
assert.ok(frictionRows.length > 0, 'M043 requires friction-authority straight-through diagnostics.');
assert.ok(known, 'M043 must reproduce the prior node 22370 OPE reachability diagnostic.');
assert.ok(Math.abs(known.ciiNormalReaction - BM4_M040_FRICTION_AUTHORITY.bm4ReachabilityDiagnostic.normalReactionN) <= 0.01,
  'M043 node 22370 normal reaction must reproduce M040 authority.');
assert.ok(Math.abs(Math.abs(known.axialMismatchJump) - BM4_M040_FRICTION_AUTHORITY.bm4ReachabilityDiagnostic.adjacentAxialResidualN) <= 0.05,
  'M043 node 22370 axial mismatch jump must reproduce M040 reachability evidence.');
assert.ok(pressureCommonMode, 'M043 expects identical P1 pressure primitives in SUS/OPE with axialThrust disabled.');
assert.deepEqual(currentReleased.OPE, authorityReleased.OPE, 'M043 expects M036 OPE +Y liftoff targets to match CAESAR before blaming liftoff state alone.');
assert.ok(counts.EXP.failed > 0, 'M043 requires nonzero EXP axial divergence to test common-mode pressure sufficiency.');

const report = Object.freeze({
  schema: 'lfea-m043-bm4-axial-force-source-rca/v1',
  targetCases: Object.freeze({ SUS: 19, OPE: 20, EXP: 21 }),
  axialFailureCounts: counts,
  pressureCommonModeTest: Object.freeze({
    pressurePrimitiveCount: pressureRows.length,
    identicalP1InSusAndOpe: pressureRows.every((row) => row.identicalPhysicalPressure),
    axialThrustAuthorizedInQualifiedPath: pressureRows.some((row) => row.susAxialThrust || row.opeAxialThrust),
    expansionAxialFailureCount: counts.EXP.failed,
    simpleStateIndependentCommonModePressureThrustSufficient: false,
    interpretation: 'AN_IDENTICAL_ADDITIVE_P1_AXIAL_THRUST_TERM_WOULD_CANCEL_IN_L20_MINUS_L19_AND_CANNOT_BY_ITSELF_EXPLAIN_NONZERO_EXP_DIVERGENCE',
    rows: pressureRows,
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
    straightThroughRowCount: straightRows.length,
    frictionAuthorityRowCount: frictionRows.length,
    frictionOnlyPlusYRowCount: frictionOnlyRows.length,
    nonzeroCiiTangentialReactionAtFrictionOnlyRows: nonzeroCiiFrictionOnly.length,
    expectedEquilibriumClosureCountAtFrictionRows: closeExpected.length,
    alternateSignClosureCountAtFrictionRows: closeAlternate.length,
    priorReachabilityReproduction: known,
    rows: straightRows,
  }),
  frictionAuthorityBoundary: Object.freeze({
    sourceAuthorizedNodeCount: BM4_M040_FRICTION_NODE_IDS.length,
    coefficient: MU,
    currentBm4ActivationQualified: BM4_M040_FRICTION_AUTHORITY.disposition.qualifiedBm4Activation,
    outputFitMayAuthorizeState: false,
    nonzeroTangentialSupportReactionObservedAtPureFrictionRows: nonzeroCiiFrictionOnly.length > 0,
    interpretation: 'SOURCE_AUTHORIZED_FRICTION_IS_ABSENT_FROM_THE_QUALIFIED_BM4_SOLVE_BUT_CAESAR_REPORTS_NONZERO_TANGENTIAL_SUPPORT_REACTION_AT_PURE_PLUS_Y_FRICTION_LOCATIONS; THIS_IDENTIFIES_A_REAL_UPSTREAM_REACTION_BOUNDARY_WITHOUT_SELECTING_STATES_FROM_OUTPUT',
  }),
  disposition: Object.freeze({
    mechanicsChangedByM043: false,
    forcmntReopened: false,
    bourdonErrorConcluded: false,
    simpleCommonModePressureThrustConcluded: false,
    plusYLiftoffMismatchConcludedAsSoleCause: false,
    frictionProductionActivationPermitted: false,
    nextRcaBoundary: 'BM4_FRICTION_GLOBAL_STATE_UNIQUENESS_OR_INDEPENDENT_STATE_HISTORY_AUTHORITY',
    conclusion: 'FIRST_IDENTIFIED_MISSING_SOURCE_AUTHORIZED_LEVEL1_MECHANISM_IS_FRICTION_SUPPORT_REACTION;_GLOBAL_BM4_FRICTION_STATE_REMAINS_UNQUALIFIED',
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
console.log(`M043 pressure common-mode sufficiency: ${report.pressureCommonModeTest.simpleStateIndependentCommonModePressureThrustSufficient}`);
console.log(`M043 liftoff state: ${JSON.stringify(report.liftoffStateTest)}`);
console.log(`M043 friction-only nonzero CAESAR tangential rows: ${report.supportReactionBoundary.nonzeroCiiTangentialReactionAtFrictionOnlyRows}/${report.supportReactionBoundary.frictionOnlyPlusYRowCount}`);
console.log(`M043 friction reaction closure expected/alternate: ${report.supportReactionBoundary.expectedEquilibriumClosureCountAtFrictionRows}/${report.supportReactionBoundary.alternateSignClosureCountAtFrictionRows} of ${report.supportReactionBoundary.frictionAuthorityRowCount}`);
console.log(`M043 prior node 22370 reproduction: ${JSON.stringify(report.supportReactionBoundary.priorReachabilityReproduction)}`);
console.log(`M043 conclusion: ${report.disposition.conclusion}`);
