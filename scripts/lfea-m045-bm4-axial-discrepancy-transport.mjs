#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';
import { BM4_M040_FRICTION_NODE_IDS } from './lfea-m040-bm4-friction-authority.mjs';
import { normalizeBm4CiiLocalForceForM035 } from './lfea-bm4-local-force-reference-normalization.mjs';

const CASES = Object.freeze(['SUS', 'OPE', 'EXP']);
const FRICTION = new Set(BM4_M040_FRICTION_NODE_IDS);
const FORCE_EPS = 5;
const PLATEAU_REL = 0.02;

function pairKey(entry) {
  return `${entry.sourceSegment.startNodeId}-${entry.sourceSegment.endNodeId}`;
}
function subtract(a, b) {
  return { fx: a.fx - b.fx, fy: a.fy - b.fy, fz: a.fz - b.fz, mx: a.mx - b.mx, my: a.my - b.my, mz: a.mz - b.mz };
}
function sourceLocal(solved, recovery) {
  const recovered = new Map(recovery.elementActions.map((row) => [row.elementId, row]));
  const out = new Map();
  for (const source of solved.authorities.base.entries) {
    const sourceId = String(source.sourceSegment.id);
    const descendants = solved.authorities.entries.filter((entry) => entry.sourceSegmentId === sourceId);
    const first = recovered.get(descendants[0]?.elementId);
    const last = recovered.get(descendants.at(-1)?.elementId);
    if (!first || !last) throw new Error(`M045 missing recovery for ${sourceId}.`);
    out.set(pairKey(source), Object.freeze({
      sourceId,
      type: source.sourceSegment.type,
      fromNode: String(source.sourceSegment.startNodeId),
      toNode: String(source.sourceSegment.endNodeId),
      I: first.local.I,
      J: last.local.J,
    }));
  }
  return out;
}
function lfeaCases(solved) {
  const sus = sourceLocal(solved, solved.sustained.recovery);
  const ope = sourceLocal(solved, solved.operating.recovery);
  const exp = new Map();
  for (const [key, hot] of ope) {
    const cold = sus.get(key);
    exp.set(key, Object.freeze({
      ...hot,
      I: subtract(hot.I, cold.I),
      J: subtract(hot.J, cold.J),
    }));
  }
  return new Map([['SUS', sus], ['OPE', ope], ['EXP', exp]]);
}
function segmentRows(solved, ours, cii) {
  const rows = new Map(CASES.map((label) => [label, new Map()]));
  const sourceByPair = new Map(solved.authorities.base.entries.map((entry) => [pairKey(entry), entry]));
  for (const label of CASES) for (const [key, refs] of cii.localForce.get(label).byPair) {
    const actual = ours.get(label).get(key);
    const source = sourceByPair.get(key);
    if (!source || !actual || refs.length !== 1) continue;
    const ref = refs[0];
    const dI = actual.I.fx - ref.I.fx;
    const dJ = actual.J.fx - ref.J.fx;
    const straightScalarValid = source.sourceSegment.type !== 'BEND';
    rows.get(label).set(key, Object.freeze({
      caseLabel: label,
      pairKey: key,
      sourceId: actual.sourceId,
      type: actual.type,
      fromNode: actual.fromNode,
      toNode: actual.toNode,
      endDiscrepancyI: dI,
      endDiscrepancyJ: dJ,
      straightScalarValid,
      netEndSumDiscrepancy: straightScalarValid ? dI + dJ : null,
      sectionOffset: straightScalarValid ? 0.5 * (dI - dJ) : null,
      absSectionOffset: straightScalarValid ? Math.abs(0.5 * (dI - dJ)) : null,
      sourceComponentUid: source.sourceSegment.sourceComponentUid ?? null,
      rigidAuthority: source.rigidAuthority?.rigidElementId ?? null,
    }));
  }
  return rows;
}
function point(geometry, id) {
  const row = geometry.nodes.find((node) => String(node.id) === String(id));
  if (!row) throw new Error(`M045 missing node ${id}.`);
  return [row.x, row.y, row.z];
}
function minus(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function unit(a) {
  const n = Math.hypot(...a);
  if (!(n > 0)) throw new Error('M045 zero-length tangent.');
  return a.map((v) => v / n);
}
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
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
function lfeaReactionCases(solved) {
  const sus = reactionMap(solved.sustained.execution);
  const ope = reactionMap(solved.operating.execution);
  const exp = new Map();
  for (const id of new Set([...sus.keys(), ...ope.keys()])) {
    const a = ope.get(id) ?? { x: 0, y: 0, z: 0 };
    const b = sus.get(id) ?? { x: 0, y: 0, z: 0 };
    exp.set(id, { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  }
  return new Map([['SUS', sus], ['OPE', ope], ['EXP', exp]]);
}
function ciiReactionCases(raw) {
  return new Map(CASES.map((label) => [label, new Map([...raw.restraint.get(label)].map(([id, r]) => [id, { x: -r.FX, y: -r.FY, z: -r.FZ }]))]));
}
function projection(v, t) { return (v?.x ?? 0) * t[0] + (v?.y ?? 0) * t[1] + (v?.z ?? 0) * t[2]; }
function topology(solved) {
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
  return { incoming, outgoing };
}
function nodeTransition({ solved, label, nodeId, incomingEntry, outgoingEntry, rows, lReactions, cReactions }) {
  const left = rows.get(label).get(pairKey(incomingEntry));
  const right = rows.get(label).get(pairKey(outgoingEntry));
  if (!left || !right || !left.straightScalarValid || !right.straightScalarValid) return null;
  const p = point(solved.authorities.analysisGeometry, nodeId);
  const tIn = unit(minus(p, point(solved.authorities.analysisGeometry, incomingEntry.sourceSegment.startNodeId)));
  const tOut = unit(minus(point(solved.authorities.analysisGeometry, outgoingEntry.sourceSegment.endNodeId), p));
  const alignment = dot(tIn, tOut);
  if (alignment < 0.9999) return Object.freeze({ nodeId, label, kind: 'NON_COLLINEAR_BOUNDARY', alignment });
  const lReaction = lReactions.get(label).get(nodeId) ?? { x: 0, y: 0, z: 0 };
  const cReaction = cReactions.get(label).get(nodeId) ?? { x: 0, y: 0, z: 0 };
  const reactionDiscrepancy = projection(lReaction, tIn) - projection(cReaction, tIn);
  const offsetChange = right.sectionOffset - left.sectionOffset;
  return Object.freeze({
    nodeId,
    label,
    kind: 'COLLINEAR',
    alignment,
    incomingPair: left.pairKey,
    outgoingPair: right.pairKey,
    incomingSectionOffset: left.sectionOffset,
    outgoingSectionOffset: right.sectionOffset,
    offsetChange,
    reactionDiscrepancy,
    expectedOffsetChangeFromReaction: -reactionDiscrepancy,
    closureResidual: offsetChange + reactionDiscrepancy,
    frictionAuthority: FRICTION.has(nodeId),
  });
}
function allTransitions(solved, rows, lReactions, cReactions) {
  const { incoming, outgoing } = topology(solved);
  const out = [];
  for (const nodeId of new Set([...incoming.keys(), ...outgoing.keys()])) {
    const ins = incoming.get(nodeId) ?? [];
    const outs = outgoing.get(nodeId) ?? [];
    if (ins.length !== 1 || outs.length !== 1) continue;
    for (const label of CASES) {
      const row = nodeTransition({ solved, label, nodeId, incomingEntry: ins[0], outgoingEntry: outs[0], rows, lReactions, cReactions });
      if (row) out.push(row);
    }
  }
  return out;
}
function topBy(rows, field, n = 10) {
  return [...rows].filter((row) => Number.isFinite(row[field])).sort((a, b) => Math.abs(b[field]) - Math.abs(a[field]) || a.sourceId?.localeCompare(b.sourceId ?? '') || 0).slice(0, n);
}
function distributionSummary(rows) {
  const straight = rows.filter((row) => row.straightScalarValid);
  const significantNet = straight.filter((row) => Math.abs(row.netEndSumDiscrepancy) > FORCE_EPS);
  const significantOffset = straight.filter((row) => Math.abs(row.sectionOffset) > FORCE_EPS);
  return Object.freeze({
    comparableStraightSegments: straight.length,
    significantNetEndSumMismatch: significantNet.length,
    significantSelfEquilibratingSectionOffset: significantOffset.length,
    maxNetEndSumMismatch: topBy(straight, 'netEndSumDiscrepancy', 1)[0] ?? null,
    maxSectionOffset: topBy(straight, 'sectionOffset', 1)[0] ?? null,
    topSectionOffsets: Object.freeze(topBy(straight, 'sectionOffset')),
  });
}
function samePlateau(a, b) {
  const scale = Math.max(Math.abs(a.sectionOffset), Math.abs(b.sectionOffset), 1);
  return Math.abs(a.sectionOffset - b.sectionOffset) <= FORCE_EPS || Math.abs(a.sectionOffset - b.sectionOffset) / scale <= PLATEAU_REL;
}
function tracePlateau(solved, rows, label, seed) {
  const { incoming, outgoing } = topology(solved);
  const chain = [seed];
  let current = seed;
  let backwardBoundary = null;
  while (true) {
    const ins = incoming.get(current.fromNode) ?? [];
    const outs = outgoing.get(current.fromNode) ?? [];
    if (ins.length !== 1 || outs.length !== 1) { backwardBoundary = { nodeId: current.fromNode, kind: 'TOPOLOGY_BOUNDARY' }; break; }
    const previous = rows.get(label).get(pairKey(ins[0]));
    if (!previous || !previous.straightScalarValid) { backwardBoundary = { nodeId: current.fromNode, kind: 'NON_STRAIGHT_OR_UNMATCHED' }; break; }
    const p = point(solved.authorities.analysisGeometry, current.fromNode);
    const tPrev = unit(minus(p, point(solved.authorities.analysisGeometry, previous.fromNode)));
    const tCur = unit(minus(point(solved.authorities.analysisGeometry, current.toNode), p));
    if (dot(tPrev, tCur) < 0.9999) { backwardBoundary = { nodeId: current.fromNode, kind: 'NON_COLLINEAR' }; break; }
    if (!samePlateau(previous, current)) { backwardBoundary = { nodeId: current.fromNode, kind: 'OFFSET_CHANGE', previousPair: previous.pairKey, previousOffset: previous.sectionOffset }; break; }
    chain.unshift(previous);
    current = previous;
  }
  current = seed;
  let forwardBoundary = null;
  while (true) {
    const ins = incoming.get(current.toNode) ?? [];
    const outs = outgoing.get(current.toNode) ?? [];
    if (ins.length !== 1 || outs.length !== 1) { forwardBoundary = { nodeId: current.toNode, kind: 'TOPOLOGY_BOUNDARY' }; break; }
    const next = rows.get(label).get(pairKey(outs[0]));
    if (!next || !next.straightScalarValid) { forwardBoundary = { nodeId: current.toNode, kind: 'NON_STRAIGHT_OR_UNMATCHED' }; break; }
    const p = point(solved.authorities.analysisGeometry, current.toNode);
    const tCur = unit(minus(p, point(solved.authorities.analysisGeometry, current.fromNode)));
    const tNext = unit(minus(point(solved.authorities.analysisGeometry, next.toNode), p));
    if (dot(tCur, tNext) < 0.9999) { forwardBoundary = { nodeId: current.toNode, kind: 'NON_COLLINEAR' }; break; }
    if (!samePlateau(current, next)) { forwardBoundary = { nodeId: current.toNode, kind: 'OFFSET_CHANGE', nextPair: next.pairKey, nextOffset: next.sectionOffset }; break; }
    chain.push(next);
    current = next;
  }
  return Object.freeze({
    caseLabel: label,
    seedPair: seed.pairKey,
    seedOffset: seed.sectionOffset,
    chain: Object.freeze(chain.map((row) => ({ pairKey: row.pairKey, sourceId: row.sourceId, type: row.type, sectionOffset: row.sectionOffset, netEndSumDiscrepancy: row.netEndSumDiscrepancy }))),
    backwardBoundary,
    forwardBoundary,
  });
}

const solved = solveBm4M035M036Combined();
const rawCii = loadBm4CiiOutputCases1921();
const cii = normalizeBm4CiiLocalForceForM035(rawCii, solved.authorities);
const rows = segmentRows(solved, lfeaCases(solved), cii);
const lReactions = lfeaReactionCases(solved);
const cReactions = ciiReactionCases(rawCii);
const transitions = allTransitions(solved, rows, lReactions, cReactions);
const summaries = Object.fromEntries(CASES.map((label) => [label, distributionSummary([...rows.get(label).values()])]));
const expStraight = [...rows.get('EXP').values()].filter((row) => row.straightScalarValid);
const largestExp = topBy(expStraight, 'sectionOffset', 1)[0];
const expPlateau = tracePlateau(solved, rows, 'EXP', largestExp);
const collinearExp = transitions.filter((row) => row.label === 'EXP' && row.kind === 'COLLINEAR');
const reactionDrivenExp = collinearExp.filter((row) => Math.abs(row.reactionDiscrepancy) > FORCE_EPS);
const freeExp = collinearExp.filter((row) => Math.abs(row.reactionDiscrepancy) <= FORCE_EPS);
const freeClosureWorst = [...freeExp].sort((a, b) => Math.abs(b.closureResidual) - Math.abs(a.closureResidual))[0] ?? null;

assert.ok(largestExp, 'M045 requires at least one comparable EXP straight segment.');
assert.ok(summaries.EXP.significantSelfEquilibratingSectionOffset > 0, 'M045 requires the M042 EXP section discrepancy to remain visible.');
assert.ok(Math.abs(largestExp.sectionOffset) > Math.abs(largestExp.netEndSumDiscrepancy),
  'M045 expects the dominant EXP segment discrepancy to be self-equilibrating rather than a net distributed axial-load mismatch.');
assert.ok(freeClosureWorst === null || Math.abs(freeClosureWorst.closureResidual) <= FORCE_EPS,
  'M045 free straight-node discrepancy transport must remain continuous after M044 convention correction.');

const report = Object.freeze({
  schema: 'lfea-m045-bm4-axial-discrepancy-transport/v1',
  targetCases: Object.freeze({ SUS: 19, OPE: 20, EXP: 21 }),
  conventionAuthority: Object.freeze({
    source: 'M044',
    elementEndSigns: Object.freeze({ LFEA: { I: 1, J: 1 }, CAESAR: { I: 1, J: 1 } }),
    reactionSigns: Object.freeze({ LFEA: 1, CAESAR: -1 }),
  }),
  segmentDecomposition: summaries,
  expansionTransport: Object.freeze({
    largestSectionOffset: largestExp,
    largestOffsetPlateau: expPlateau,
    collinearTransitionCount: collinearExp.length,
    reactionDrivenTransitionCount: reactionDrivenExp.length,
    freeTransitionCount: freeExp.length,
    largestReactionDrivenChanges: Object.freeze(topBy(reactionDrivenExp, 'reactionDiscrepancy')),
    worstFreeTransitionClosure: freeClosureWorst,
  }),
  disposition: Object.freeze({
    mechanicsChangedByM045: false,
    forcmntReopened: false,
    frictionStateSelectedFromOutput: false,
    simpleCommonModePressureThrustReopened: false,
    dominantExpansionDiscrepancyIsNetDistributedAxialLoadMismatch: Math.abs(largestExp.netEndSumDiscrepancy) >= Math.abs(largestExp.sectionOffset),
    conclusion: 'EXP_LEVEL1_DISCREPANCY_IS_PRIMARILY_A_SELF_EQUILIBRATING_SECTION_FORCE_OFFSET_TRANSPORTED_THROUGH_STRAIGHT_RUNS',
    nextRcaBoundary: 'INSPECT_LARGEST_EXP_OFFSET_PLATEAU_BOUNDARY_FOR_THERMAL_STIFFNESS_COMPONENT_OR_STATE_AUTHORITY',
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
console.log(`M045 segment decomposition: ${JSON.stringify(report.segmentDecomposition)}`);
console.log(`M045 largest EXP section offset: ${JSON.stringify(report.expansionTransport.largestSectionOffset)}`);
console.log(`M045 largest EXP plateau: ${JSON.stringify(report.expansionTransport.largestOffsetPlateau)}`);
console.log(`M045 EXP reaction/free transitions: ${reactionDrivenExp.length}/${freeExp.length}`);
console.log(`M045 top reaction-driven changes: ${JSON.stringify(report.expansionTransport.largestReactionDrivenChanges.slice(0, 5))}`);
console.log(`M045 conclusion: ${report.disposition.conclusion}`);
