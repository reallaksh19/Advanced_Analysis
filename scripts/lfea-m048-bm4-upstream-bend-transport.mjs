#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';

const SOURCE_ID = 'IX-S19';
const DOWNSTREAM_SOURCE_ID = 'IX-S20';
const START_NODE = '20300';
const END_NODE = '20330';
const FORCE_TOL = 0.05;

function pairKey(entry) { return `${entry.sourceSegment.startNodeId}-${entry.sourceSegment.endNodeId}`; }
function vector(action) { return { x: action.fx, y: action.fy, z: action.fz }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function norm(a) { return Math.hypot(a.x, a.y, a.z); }
function isNumericNode(id) { return /^\d+(?:\.\d+)?$/u.test(String(id)); }
function recoveredMap(recovery) { return new Map(recovery.elementActions.map((row) => [row.elementId, row])); }
function exactStationNodes(descendants) {
  const nodes = [String(descendants[0].segment.startNodeId)];
  for (const entry of descendants) {
    const id = String(entry.segment.endNodeId);
    if (isNumericNode(id) && id !== nodes.at(-1)) nodes.push(id);
  }
  return nodes;
}
function exactSubpath(descendants, from, to) {
  const start = descendants.findIndex((entry) => String(entry.segment.startNodeId) === String(from));
  let end = -1;
  for (let index = start; index < descendants.length; index += 1) {
    if (String(descendants[index].segment.endNodeId) === String(to)) { end = index; break; }
  }
  if (start < 0 || end < start) throw new Error(`M048 cannot resolve exact subpath ${from}-${to}.`);
  return descendants.slice(start, end + 1);
}
function subpathAction(subpath, recovery) {
  const recovered = recoveredMap(recovery);
  const first = recovered.get(subpath[0].elementId);
  const last = recovered.get(subpath.at(-1).elementId);
  if (!first || !last) throw new Error(`M048 missing recovery ${subpath[0].elementId}..${subpath.at(-1).elementId}.`);
  return { I: vector(first.global.I), J: vector(last.global.J) };
}
function expansionSubpathAction(solved, subpath) {
  const sus = subpathAction(subpath, solved.sustained.recovery);
  const ope = subpathAction(subpath, solved.operating.recovery);
  return { I: sub(ope.I, sus.I), J: sub(ope.J, sus.J) };
}
function sourceAction(solved, sourceId, recovery) {
  const descendants = solved.authorities.entries.filter((entry) => entry.sourceSegmentId === sourceId);
  return subpathAction(descendants, recovery);
}
function expansionSourceAction(solved, sourceId) {
  const sus = sourceAction(solved, sourceId, solved.sustained.recovery);
  const ope = sourceAction(solved, sourceId, solved.operating.recovery);
  return { I: sub(ope.I, sus.I), J: sub(ope.J, sus.J) };
}
function ciiForceRows(raw, label, pair) { return raw.globalForce.get(label).byPair.get(pair) ?? []; }
function exactPairComparison(raw, solved, descendants, from, to) {
  const stationPair = `${from}-${to}`;
  const subpath = exactSubpath(descendants, from, to);
  const ours = expansionSubpathAction(solved, subpath);
  const rows = ciiForceRows(raw, 'EXP', stationPair);
  const result = {
    stationPair,
    descendantCount: subpath.length,
    firstElementId: subpath[0].elementId,
    lastElementId: subpath.at(-1).elementId,
    caesarGlobalRowCount: rows.length,
    discrepancy: null,
  };
  if (rows.length === 1) {
    const dI = sub(ours.I, vector(rows[0].I));
    const dJ = sub(ours.J, vector(rows[0].J));
    result.discrepancy = Object.freeze({
      I: dI,
      J: dJ,
      iNorm: norm(dI),
      jNorm: norm(dJ),
      netEndSum: add(dI, dJ),
      netEndSumNorm: norm(add(dI, dJ)),
    });
  }
  return Object.freeze(result);
}
function reactionMap(execution) {
  const out = new Map();
  for (const row of execution.reactions) {
    if (!['UX', 'UY', 'UZ'].includes(row.dof)) continue;
    const id = String(row.nodeId).replace(/^BM4M035\.N/u, '');
    if (!out.has(id)) out.set(id, { x: 0, y: 0, z: 0 });
    out.get(id)[{ UX: 'x', UY: 'y', UZ: 'z' }[row.dof]] += row.value;
  }
  return out;
}
function reactionDiscrepancy(raw, solved, nodeId) {
  const sus = reactionMap(solved.sustained.execution).get(nodeId) ?? { x: 0, y: 0, z: 0 };
  const ope = reactionMap(solved.operating.execution).get(nodeId) ?? { x: 0, y: 0, z: 0 };
  const lfea = sub(ope, sus);
  const row = raw.restraint.get('EXP').get(nodeId);
  const caesarMapped = row ? { x: -row.FX, y: -row.FY, z: -row.FZ } : { x: 0, y: 0, z: 0 };
  return Object.freeze({ lfea, caesarMapped, discrepancy: sub(lfea, caesarMapped) });
}
function closeResidual(leftJ, rightI, reaction) {
  const residual = sub(add(leftJ, rightI), reaction.discrepancy);
  return Object.freeze({ residual, norm: norm(residual) });
}
function sourceSummary(entry) {
  return entry ? Object.freeze({
    sourceId: String(entry.sourceSegment.id),
    pair: pairKey(entry),
    type: entry.sourceSegment.type,
    fromNode: String(entry.sourceSegment.startNodeId),
    toNode: String(entry.sourceSegment.endNodeId),
    sourceComponentUid: entry.sourceSegment.sourceComponentUid ?? null,
  }) : null;
}
function directSourceDiscrepancy(raw, solved, entry) {
  if (!entry) return Object.freeze({ source: null, caesarGlobalRowCount: 0, discrepancy: null });
  const pair = pairKey(entry);
  const rows = ciiForceRows(raw, 'EXP', pair);
  let discrepancy = null;
  if (rows.length === 1) {
    const ours = expansionSourceAction(solved, String(entry.sourceSegment.id));
    discrepancy = Object.freeze({
      I: sub(ours.I, vector(rows[0].I)),
      J: sub(ours.J, vector(rows[0].J)),
    });
  }
  return Object.freeze({ source: sourceSummary(entry), caesarGlobalRowCount: rows.length, discrepancy });
}

const solved = solveBm4M035M036Combined();
const raw = loadBm4CiiOutputCases1921();
const source = solved.authorities.base.entries.find((entry) => String(entry.sourceSegment.id) === SOURCE_ID);
assert.ok(source, `M048 missing ${SOURCE_ID}.`);
assert.equal(source.sourceSegment.type, 'BEND', 'M048 target must remain a bend.');
assert.equal(String(source.sourceSegment.startNodeId), START_NODE);
assert.equal(String(source.sourceSegment.endNodeId), END_NODE);
const descendants = solved.authorities.entries.filter((entry) => entry.sourceSegmentId === SOURCE_ID);
const stations = exactStationNodes(descendants);
assert.equal(stations[0], START_NODE, 'M048 first preserved station drifted.');
assert.equal(stations.at(-1), END_NODE, 'M048 last preserved station drifted.');
assert.ok(stations.length >= 2, 'M048 requires at least bend start/end numeric stations.');
const exactPairs = stations.slice(0, -1).map((from, index) => exactPairComparison(raw, solved, descendants, from, stations[index + 1]));
assert.ok(exactPairs.every((row) => row.caesarGlobalRowCount === 1), 'M048 requires one-to-one CAESAR EXP authority at every exact preserved IX-S19 station pair.');
assert.ok(exactPairs.every((row) => row.discrepancy.netEndSumNorm <= FORCE_TOL), 'M048 IX-S19 exact subpaths must not create net EXP force discrepancy.');

const internalClosures = [];
for (let index = 0; index < exactPairs.length - 1; index += 1) {
  const nodeId = stations[index + 1];
  const closure = closeResidual(exactPairs[index].discrepancy.J, exactPairs[index + 1].discrepancy.I, reactionDiscrepancy(raw, solved, nodeId));
  internalClosures.push(Object.freeze({ nodeId, ...closure }));
}
assert.ok(internalClosures.every((row) => row.norm <= FORCE_TOL), 'M048 IX-S19 internal exact-station discrepancy equilibrium must close.');

const downstream = solved.authorities.base.entries.find((entry) => String(entry.sourceSegment.id) === DOWNSTREAM_SOURCE_ID);
assert.ok(downstream, `M048 missing downstream ${DOWNSTREAM_SOURCE_ID}.`);
const downstreamDescendants = solved.authorities.entries.filter((entry) => entry.sourceSegmentId === DOWNSTREAM_SOURCE_ID);
const downstreamStations = exactStationNodes(downstreamDescendants);
const downstreamFirst = exactPairComparison(raw, solved, downstreamDescendants, downstreamStations[0], downstreamStations[1]);
assert.equal(downstreamFirst.caesarGlobalRowCount, 1, 'M048 downstream IX-S20 exact first station must remain one-to-one.');
const endClosure = closeResidual(exactPairs.at(-1).discrepancy.J, downstreamFirst.discrepancy.I, reactionDiscrepancy(raw, solved, END_NODE));
assert.ok(endClosure.norm <= FORCE_TOL, 'M048 IX-S19→IX-S20 discrepancy boundary must close.');

const predecessors = solved.authorities.base.entries.filter((entry) => String(entry.sourceSegment.endNodeId) === START_NODE);
assert.equal(predecessors.length, 1, 'M048 requires exactly one source predecessor at node 20300.');
const predecessor = directSourceDiscrepancy(raw, solved, predecessors[0]);
const startReaction = reactionDiscrepancy(raw, solved, START_NODE);
let startClosure = null;
if (predecessor.discrepancy) {
  startClosure = closeResidual(predecessor.discrepancy.J, exactPairs[0].discrepancy.I, startReaction);
  assert.ok(startClosure.norm <= FORCE_TOL, 'M048 direct predecessor→IX-S19 boundary must close when one-to-one authority is available.');
}
const upstreamNorm = exactPairs[0].discrepancy.iNorm;
const downstreamNorm = exactPairs.at(-1).discrepancy.jNorm;
const transported = Math.abs(upstreamNorm - downstreamNorm) <= FORCE_TOL;
assert.ok(transported, 'M048 discrepancy-vector magnitude must be transported through IX-S19 before moving upstream.');

const upstreamClassification = predecessor.caesarGlobalRowCount === 1
  ? 'DIRECT_PREDECESSOR_ONE_TO_ONE'
  : `${predecessor.source?.type ?? 'UNKNOWN'}_PREDECESSOR_NON_ONE_TO_ONE`;
const predecessorNorm = predecessor.discrepancy ? norm(predecessor.discrepancy.J) : null;
const reactionNorm = norm(startReaction.discrepancy);
const reactionSeedCandidate = predecessorNorm !== null && predecessorNorm <= FORCE_TOL && upstreamNorm > FORCE_TOL && reactionNorm > FORCE_TOL;

const report = Object.freeze({
  schema: 'lfea-m048-bm4-upstream-bend-transport/v1',
  source: Object.freeze({ ...sourceSummary(source), exactNumericStations: Object.freeze(stations), descendantCount: descendants.length }),
  exactStationAuthority: Object.freeze(exactPairs),
  internalClosures: Object.freeze(internalClosures),
  downstreamBoundary: Object.freeze({
    downstreamSource: sourceSummary(downstream),
    firstExactPair: downstreamFirst.stationPair,
    reaction: reactionDiscrepancy(raw, solved, END_NODE),
    closure: endClosure,
  }),
  upstreamBoundary: Object.freeze({
    nodeId: START_NODE,
    predecessor,
    reaction: startReaction,
    closure: startClosure,
    classification: upstreamClassification,
    predecessorDiscrepancyNorm: predecessorNorm,
    ixS19IncomingDiscrepancyNorm: upstreamNorm,
    reactionDiscrepancyNorm: reactionNorm,
    reactionSeedCandidate,
  }),
  transport: Object.freeze({ upstreamDiscrepancyNorm: upstreamNorm, downstreamDiscrepancyNorm: downstreamNorm, magnitudeTransported: transported }),
  disposition: Object.freeze({
    mechanicsChangedByM048: false,
    stationInterpolationUsed: false,
    ixS19CreatesNetExpansionForceMismatch: false,
    reactionSeedConcluded: reactionSeedCandidate,
    conclusion: 'EXACT_CAESAR_STATIONS_SHOW_IX_S19_TRANSPORTS_THE_EXP_FORCE_DISCREPANCY_WITHOUT_NET_FORCE_CREATION',
    nextRcaBoundary: predecessor.caesarGlobalRowCount === 1
      ? (reactionSeedCandidate ? 'NODE_20300_REACTION_DISCREPANCY_IS_THE_FIRST_RESOLVED_SEED_BOUNDARY' : 'CONTINUE_THROUGH_DIRECT_PREDECESSOR_UPSTREAM_OF_20300')
      : 'RESOLVE_EXACT_CAESAR_STATIONS_FOR_THE_PREDECESSOR_ENTERING_NODE_20300',
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
console.log(`M048 IX-S19 stations: ${JSON.stringify(stations)}`);
console.log(`M048 exact EXP station pairs: ${JSON.stringify(exactPairs.map((row) => ({ pair: row.stationPair, netEndSumNorm: row.discrepancy.netEndSumNorm, iNorm: row.discrepancy.iNorm, jNorm: row.discrepancy.jNorm })))}`);
console.log(`M048 internal/downstream closures: ${JSON.stringify({ internal: internalClosures, downstream: endClosure })}`);
console.log(`M048 upstream boundary: ${JSON.stringify(report.upstreamBoundary)}`);
console.log(`M048 transport: ${JSON.stringify(report.transport)}`);
console.log(`M048 conclusion: ${report.disposition.conclusion}; next=${report.disposition.nextRcaBoundary}`);
