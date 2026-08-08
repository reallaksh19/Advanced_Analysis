#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';

const START_SOURCE_ID = 'IX-S18';
const FORCE_TOL = 0.05;
const SEED_TOL = 5;
const MAX_SOURCES = 40;

function pairKey(entry) { return `${entry.sourceSegment.startNodeId}-${entry.sourceSegment.endNodeId}`; }
function vec(action) { return { x: action.fx, y: action.fy, z: action.fz }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function scale(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
function norm(a) { return Math.hypot(a.x, a.y, a.z); }
function isNumericNode(id) { return /^\d+(?:\.\d+)?$/u.test(String(id)); }
function recoveredMap(recovery) { return new Map(recovery.elementActions.map((row) => [row.elementId, row])); }
function expansionSubpathAction(solved, subpath) {
  const sus = recoveredMap(solved.sustained.recovery);
  const ope = recoveredMap(solved.operating.recovery);
  const firstSus = sus.get(subpath[0].elementId);
  const lastSus = sus.get(subpath.at(-1).elementId);
  const firstOpe = ope.get(subpath[0].elementId);
  const lastOpe = ope.get(subpath.at(-1).elementId);
  if (!firstSus || !lastSus || !firstOpe || !lastOpe) throw new Error('M049 missing recovered subpath action.');
  return Object.freeze({
    I: sub(vec(firstOpe.global.I), vec(firstSus.global.I)),
    J: sub(vec(lastOpe.global.J), vec(lastSus.global.J)),
  });
}
function exactStations(descendants) {
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
  if (start < 0 || end < start) return null;
  return descendants.slice(start, end + 1);
}
function ciiRows(raw, pair) { return raw.globalForce.get('EXP').byPair.get(pair) ?? []; }
function piece(raw, solved, pair, subpath) {
  const rows = ciiRows(raw, pair);
  const result = { pair, caesarRowCount: rows.length, descendantCount: subpath?.length ?? 0, discrepancy: null };
  if (rows.length === 1 && subpath?.length) {
    const ours = expansionSubpathAction(solved, subpath);
    const dI = sub(ours.I, vec(rows[0].I));
    const dJ = sub(ours.J, vec(rows[0].J));
    result.discrepancy = Object.freeze({
      I: dI,
      J: dJ,
      sectionVectorUpstream: dI,
      sectionVectorDownstream: scale(dJ, -1),
      upstreamNorm: norm(dI),
      downstreamNorm: norm(dJ),
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
  return Object.freeze({ lfea, caesarMapped, discrepancy: sub(lfea, caesarMapped), discrepancyNorm: norm(sub(lfea, caesarMapped)) });
}
function closure(leftJ, rightI, reaction) {
  const residual = sub(add(leftJ, rightI), reaction.discrepancy);
  return Object.freeze({ residual, residualNorm: norm(residual), closed: norm(residual) <= FORCE_TOL });
}
function sourceSummary(entry) {
  return Object.freeze({
    sourceId: String(entry.sourceSegment.id),
    pair: pairKey(entry),
    type: entry.sourceSegment.type,
    fromNode: String(entry.sourceSegment.startNodeId),
    toNode: String(entry.sourceSegment.endNodeId),
    sourceComponentUid: entry.sourceSegment.sourceComponentUid ?? null,
  });
}
function analyzeSource(raw, solved, entry) {
  const summary = sourceSummary(entry);
  const descendants = solved.authorities.entries.filter((row) => row.sourceSegmentId === summary.sourceId);
  if (!descendants.length) return Object.freeze({ ...summary, authorityComplete: false, stopReason: 'NO_ANALYSIS_DESCENDANTS', pieces: Object.freeze([]) });
  let pieces;
  let stations;
  if (summary.type === 'BEND') {
    stations = exactStations(descendants);
    pieces = stations.slice(0, -1).map((from, index) => {
      const to = stations[index + 1];
      return piece(raw, solved, `${from}-${to}`, exactSubpath(descendants, from, to));
    });
  } else {
    stations = [summary.fromNode, summary.toNode];
    pieces = [piece(raw, solved, summary.pair, descendants)];
  }
  const authorityComplete = pieces.length > 0 && pieces.every((row) => row.caesarRowCount === 1 && row.discrepancy);
  const internalClosures = [];
  if (authorityComplete) {
    for (let index = 0; index < pieces.length - 1; index += 1) {
      const nodeId = stations[index + 1];
      internalClosures.push(Object.freeze({
        nodeId,
        ...closure(pieces[index].discrepancy.J, pieces[index + 1].discrepancy.I, reactionDiscrepancy(raw, solved, nodeId)),
      }));
    }
  }
  const maxNetEndSumNorm = authorityComplete ? Math.max(...pieces.map((row) => row.discrepancy.netEndSumNorm)) : null;
  const maxInternalResidualNorm = internalClosures.length ? Math.max(...internalClosures.map((row) => row.residualNorm)) : 0;
  return Object.freeze({
    ...summary,
    exactNumericStations: Object.freeze(stations),
    descendantCount: descendants.length,
    authorityComplete,
    pieces: Object.freeze(pieces),
    internalClosures: Object.freeze(internalClosures),
    maxNetEndSumNorm,
    maxInternalResidualNorm,
    distributedMismatch: authorityComplete && maxNetEndSumNorm > FORCE_TOL,
    internalEquilibriumClosed: authorityComplete && maxInternalResidualNorm <= FORCE_TOL,
    upstreamVector: authorityComplete ? pieces[0].discrepancy.sectionVectorUpstream : null,
    downstreamVector: authorityComplete ? pieces.at(-1).discrepancy.sectionVectorDownstream : null,
    upstreamNorm: authorityComplete ? pieces[0].discrepancy.upstreamNorm : null,
    downstreamNorm: authorityComplete ? pieces.at(-1).discrepancy.downstreamNorm : null,
  });
}
function uniquePredecessor(sourceEntries, nodeId) {
  const rows = sourceEntries.filter((entry) => String(entry.sourceSegment.endNodeId) === String(nodeId));
  return Object.freeze({ count: rows.length, entry: rows.length === 1 ? rows[0] : null, rows: Object.freeze(rows.map(sourceSummary)) });
}

const solved = solveBm4M035M036Combined();
const raw = loadBm4CiiOutputCases1921();
const sourceEntries = solved.authorities.base.entries;
const start = sourceEntries.find((entry) => String(entry.sourceSegment.id) === START_SOURCE_ID);
assert.ok(start, `M049 missing start source ${START_SOURCE_ID}.`);
const chain = [];
const boundaries = [];
let currentEntry = start;
let stop = null;
let seed = null;
for (let step = 0; step < MAX_SOURCES; step += 1) {
  const current = analyzeSource(raw, solved, currentEntry);
  chain.push(current);
  if (!current.authorityComplete) {
    stop = Object.freeze({ code: 'CAESAR_SOURCE_AUTHORITY_INCOMPLETE', source: sourceSummary(currentEntry) });
    break;
  }
  if (!current.internalEquilibriumClosed) {
    stop = Object.freeze({ code: 'INTERNAL_STATION_EQUILIBRIUM_NOT_CLOSED', source: sourceSummary(currentEntry), maxResidualNorm: current.maxInternalResidualNorm });
    break;
  }
  if (current.distributedMismatch) {
    stop = Object.freeze({ code: 'SOURCE_NET_END_FORCE_MISMATCH', source: sourceSummary(currentEntry), maxNetEndSumNorm: current.maxNetEndSumNorm });
    break;
  }
  const predecessorInfo = uniquePredecessor(sourceEntries, current.fromNode);
  if (predecessorInfo.count === 0) {
    stop = Object.freeze({ code: 'SOURCE_ROOT_REACHED', nodeId: current.fromNode, currentUpstreamNorm: current.upstreamNorm, reaction: reactionDiscrepancy(raw, solved, current.fromNode) });
    break;
  }
  if (predecessorInfo.count !== 1) {
    stop = Object.freeze({ code: 'SOURCE_TOPOLOGY_BRANCH', nodeId: current.fromNode, predecessors: predecessorInfo.rows });
    break;
  }
  const predecessor = analyzeSource(raw, solved, predecessorInfo.entry);
  if (!predecessor.authorityComplete) {
    chain.push(predecessor);
    stop = Object.freeze({ code: 'PREDECESSOR_CAESAR_AUTHORITY_INCOMPLETE', nodeId: current.fromNode, predecessor: sourceSummary(predecessorInfo.entry) });
    break;
  }
  const reaction = reactionDiscrepancy(raw, solved, current.fromNode);
  const boundaryClosure = closure(predecessor.pieces.at(-1).discrepancy.J, current.pieces[0].discrepancy.I, reaction);
  const boundary = Object.freeze({
    nodeId: current.fromNode,
    predecessorSourceId: predecessor.sourceId,
    downstreamSourceId: current.sourceId,
    predecessorDownstreamVector: predecessor.downstreamVector,
    downstreamSourceUpstreamVector: current.upstreamVector,
    predecessorDownstreamNorm: predecessor.downstreamNorm,
    downstreamSourceUpstreamNorm: current.upstreamNorm,
    reaction,
    closure: boundaryClosure,
  });
  boundaries.push(boundary);
  if (!boundaryClosure.closed) {
    stop = Object.freeze({ code: 'SOURCE_BOUNDARY_EQUILIBRIUM_NOT_CLOSED', boundary });
    break;
  }
  const reactionSeed = predecessor.downstreamNorm <= SEED_TOL && current.upstreamNorm > SEED_TOL && reaction.discrepancyNorm > SEED_TOL;
  if (reactionSeed) {
    seed = Object.freeze({ code: 'REACTION_DISCREPANCY_SEED', nodeId: current.fromNode, boundary });
    stop = seed;
    break;
  }
  if (!predecessor.internalEquilibriumClosed || predecessor.distributedMismatch) {
    chain.push(predecessor);
    stop = Object.freeze({
      code: predecessor.distributedMismatch ? 'PREDECESSOR_SOURCE_NET_END_FORCE_MISMATCH' : 'PREDECESSOR_INTERNAL_STATION_EQUILIBRIUM_NOT_CLOSED',
      source: sourceSummary(predecessorInfo.entry),
      maxNetEndSumNorm: predecessor.maxNetEndSumNorm,
      maxInternalResidualNorm: predecessor.maxInternalResidualNorm,
    });
    break;
  }
  currentEntry = predecessorInfo.entry;
  if (step === MAX_SOURCES - 1) stop = Object.freeze({ code: 'TRACE_LIMIT_REACHED', limit: MAX_SOURCES });
}

assert.ok(chain[0]?.authorityComplete, 'M049 start source must retain one-to-one/exact CAESAR authority.');
assert.ok(chain[0].maxNetEndSumNorm <= FORCE_TOL, 'M049 start source must not create net EXP force discrepancy.');
assert.ok(boundaries.length > 0, 'M049 must traverse at least one upstream source boundary.');
assert.ok(stop, 'M049 upstream trace must terminate with an explicit boundary code.');
const nonClosingBoundaries = boundaries.filter((row) => !row.closure.closed);
assert.ok(nonClosingBoundaries.length <= 1, 'M049 may preserve only the first non-closing boundary.');
if (nonClosingBoundaries.length === 1) {
  assert.equal(stop.code, 'SOURCE_BOUNDARY_EQUILIBRIUM_NOT_CLOSED', 'M049 first non-closing boundary must be the trace stop.');
  assert.equal(boundaries.at(-1), nonClosingBoundaries[0], 'M049 non-closing boundary must be last in the trace.');
} else {
  assert.ok(boundaries.every((row) => row.closure.closed), 'M049 traversed prefix must close before any other stop reason.');
}

const report = Object.freeze({
  schema: 'lfea-m049-bm4-upstream-discrepancy-provenance/v2',
  startSourceId: START_SOURCE_ID,
  policy: Object.freeze({ forceClosureToleranceN: FORCE_TOL, seedToleranceN: SEED_TOL, maxSources: MAX_SOURCES, stationInterpolationUsed: false }),
  tracedSourceCount: chain.length,
  traversedBoundaryCount: boundaries.length,
  closedBoundaryCount: boundaries.length - nonClosingBoundaries.length,
  sourceChainDownstreamToUpstream: Object.freeze(chain),
  boundariesDownstreamToUpstream: Object.freeze(boundaries),
  stop,
  seed,
  disposition: Object.freeze({
    mechanicsChangedByM049: false,
    forcmntReopened: false,
    frictionStateSelectedFromOutput: false,
    pressureOrBourdonCauseConcluded: false,
    resolvedReactionSeed: seed?.code === 'REACTION_DISCREPANCY_SEED',
    conclusion: seed?.code === 'REACTION_DISCREPANCY_SEED'
      ? 'FIRST_RESOLVED_UPSTREAM_EXP_FORCE_DISCREPANCY_SEED_IS_A_REACTION_DIFFERENCE'
      : `UPSTREAM_EXP_FORCE_DISCREPANCY_PROVENANCE_TRACE_STOPPED_AT_${stop.code}`,
    nextRcaBoundary: seed?.code === 'REACTION_DISCREPANCY_SEED'
      ? 'CLASSIFY_THE_SOURCE_RESTRAINT_OR_CONTACT_AUTHORITY_AT_THE_SEED_NODE_WITHOUT_OUTPUT_FIT'
      : stop.code,
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
console.log(`M049 traced sources/boundaries: ${chain.length}/${boundaries.length}; closed=${report.closedBoundaryCount}`);
console.log(`M049 source chain: ${JSON.stringify(chain.map((row) => ({ sourceId: row.sourceId, pair: row.pair, type: row.type, authorityComplete: row.authorityComplete, upstreamNorm: row.upstreamNorm, downstreamNorm: row.downstreamNorm, maxNetEndSumNorm: row.maxNetEndSumNorm, stations: row.exactNumericStations })))}`);
console.log(`M049 boundaries: ${JSON.stringify(boundaries.map((row) => ({ nodeId: row.nodeId, predecessor: row.predecessorSourceId, downstream: row.downstreamSourceId, predecessorNorm: row.predecessorDownstreamNorm, downstreamNorm: row.downstreamSourceUpstreamNorm, reactionNorm: row.reaction.discrepancyNorm, closureNorm: row.closure.residualNorm, closed: row.closure.closed })))}`);
console.log(`M049 stop: ${JSON.stringify(stop)}`);
console.log(`M049 conclusion: ${report.disposition.conclusion}`);
