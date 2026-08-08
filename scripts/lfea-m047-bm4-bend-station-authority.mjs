#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';

const SOURCE_ID = 'IX-S20';
const DOWNSTREAM_PAIR = '20340-20350';
const CASES = Object.freeze(['SUS', 'OPE', 'EXP']);
const FORCE_TOL = 0.05;

function vector(action) { return { x: action.fx, y: action.fy, z: action.fz }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function scale(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
function norm(a) { return Math.hypot(a.x, a.y, a.z); }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function pair(a, b) { return `${a}-${b}`; }
function isNumericNode(id) { return /^\d+(?:\.\d+)?$/u.test(String(id)); }
function point(geometry, id) {
  const row = geometry.nodes.find((node) => String(node.id) === String(id));
  if (!row) throw new Error(`M047 missing node ${id}.`);
  return { x: row.x, y: row.y, z: row.z };
}
function tangent(geometry, from, to) {
  const a = point(geometry, from);
  const b = point(geometry, to);
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const length = norm(d);
  if (!(length > 0)) throw new Error(`M047 zero-length ${from}-${to}.`);
  return scale(d, 1 / length);
}
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
  if (start < 0 || end < start) throw new Error(`M047 cannot resolve exact descendant subpath ${from}-${to}.`);
  return descendants.slice(start, end + 1);
}
function recoveredMap(recovery) {
  return new Map(recovery.elementActions.map((row) => [row.elementId, row]));
}
function subpathAction(subpath, recovery) {
  const recovered = recoveredMap(recovery);
  const first = recovered.get(subpath[0].elementId);
  const last = recovered.get(subpath.at(-1).elementId);
  if (!first || !last) throw new Error(`M047 missing subpath recovery ${subpath[0].elementId}..${subpath.at(-1).elementId}.`);
  return Object.freeze({ I: vector(first.global.I), J: vector(last.global.J) });
}
function caseSubpathActions(solved, subpath) {
  const sus = subpathAction(subpath, solved.sustained.recovery);
  const ope = subpathAction(subpath, solved.operating.recovery);
  return new Map([
    ['SUS', sus],
    ['OPE', ope],
    ['EXP', Object.freeze({ I: sub(ope.I, sus.I), J: sub(ope.J, sus.J) })],
  ]);
}
function ciiRows(raw, label, stationPair) {
  const global = raw.globalForce.get(label).byPair.get(stationPair) ?? [];
  const local = raw.localForce.get(label).byPair.get(stationPair) ?? [];
  return Object.freeze({ global, local });
}
function simplifyCii(row) {
  return Object.freeze({ fromNode: String(row.fromNode), toNode: String(row.toNode), I: row.I, J: row.J });
}
function compareExactStation(raw, solved, descendants, from, to) {
  const stationPair = pair(from, to);
  const subpath = exactSubpath(descendants, from, to);
  const ours = caseSubpathActions(solved, subpath);
  const byCase = {};
  for (const label of CASES) {
    const rows = ciiRows(raw, label, stationPair);
    const result = {
      globalRowCount: rows.global.length,
      localRowCount: rows.local.length,
      globalRows: rows.global.map(simplifyCii),
      localRows: rows.local.map(simplifyCii),
      comparable: rows.global.length === 1,
      discrepancy: null,
    };
    if (rows.global.length === 1) {
      const actual = ours.get(label);
      const ref = rows.global[0];
      const dI = sub(actual.I, vector(ref.I));
      const dJ = sub(actual.J, vector(ref.J));
      result.discrepancy = Object.freeze({
        I: dI,
        J: dJ,
        netEndSum: add(dI, dJ),
        netEndSumNorm: norm(add(dI, dJ)),
        iNorm: norm(dI),
        jNorm: norm(dJ),
      });
    }
    byCase[label] = Object.freeze(result);
  }
  return Object.freeze({
    stationPair,
    fromNode: String(from),
    toNode: String(to),
    descendantCount: subpath.length,
    firstElementId: subpath[0].elementId,
    lastElementId: subpath.at(-1).elementId,
    byCase: Object.freeze(byCase),
  });
}
function sourceAction(solved, sourceId, recovery) {
  const descendants = solved.authorities.entries.filter((entry) => entry.sourceSegmentId === sourceId);
  const recovered = recoveredMap(recovery);
  const first = recovered.get(descendants[0].elementId);
  const last = recovered.get(descendants.at(-1).elementId);
  return { I: vector(first.global.I), J: vector(last.global.J) };
}
function expansionSourceAction(solved, sourceId) {
  const sus = sourceAction(solved, sourceId, solved.sustained.recovery);
  const ope = sourceAction(solved, sourceId, solved.operating.recovery);
  return { I: sub(ope.I, sus.I), J: sub(ope.J, sus.J) };
}
function downstreamDiscrepancy(raw, solved) {
  const rows = raw.globalForce.get('EXP').byPair.get(DOWNSTREAM_PAIR) ?? [];
  assert.equal(rows.length, 1, 'M047 downstream straight pair must remain one-to-one.');
  const source = solved.authorities.base.entries.find((entry) => `${entry.sourceSegment.startNodeId}-${entry.sourceSegment.endNodeId}` === DOWNSTREAM_PAIR);
  assert.ok(source, 'M047 missing downstream source pair.');
  const actual = expansionSourceAction(solved, String(source.sourceSegment.id));
  return Object.freeze({ I: sub(actual.I, vector(rows[0].I)), J: sub(actual.J, vector(rows[0].J)) });
}
function boundaryReactionDiscrepancy(raw, solved, nodeId) {
  const map = (execution) => {
    const out = { x: 0, y: 0, z: 0 };
    for (const row of execution.reactions) {
      if (String(row.nodeId).replace(/^BM4M035\.N/u, '') !== String(nodeId)) continue;
      if (row.dof === 'UX') out.x += row.value;
      if (row.dof === 'UY') out.y += row.value;
      if (row.dof === 'UZ') out.z += row.value;
    }
    return out;
  };
  const lfea = sub(map(solved.operating.execution), map(solved.sustained.execution));
  const row = raw.restraint.get('EXP').get(String(nodeId));
  const caesarMapped = row ? { x: -row.FX, y: -row.FY, z: -row.FZ } : { x: 0, y: 0, z: 0 };
  return Object.freeze({ lfea, caesarMapped, discrepancy: sub(lfea, caesarMapped) });
}

const solved = solveBm4M035M036Combined();
const raw = loadBm4CiiOutputCases1921();
const source = solved.authorities.base.entries.find((entry) => String(entry.sourceSegment.id) === SOURCE_ID);
assert.ok(source, `M047 missing source ${SOURCE_ID}.`);
assert.equal(source.sourceSegment.type, 'BEND', 'M047 target must remain a bend.');
const descendants = solved.authorities.entries.filter((entry) => entry.sourceSegmentId === SOURCE_ID);
assert.ok(descendants.length > 1, 'M047 target bend must retain expanded descendants.');
const stations = exactStationNodes(descendants);
assert.deepEqual(stations, ['20330', '20339', '20340'], 'M047 exact numeric bend stations drifted.');
const stationPairs = stations.slice(0, -1).map((from, index) => compareExactStation(raw, solved, descendants, from, stations[index + 1]));
const allExpComparable = stationPairs.every((row) => row.byCase.EXP.comparable);
const allExpNetClose = stationPairs.every((row) => row.byCase.EXP.discrepancy && row.byCase.EXP.discrepancy.netEndSumNorm <= FORCE_TOL);
const downstream = downstreamDiscrepancy(raw, solved);
const reaction20340 = boundaryReactionDiscrepancy(raw, solved, '20340');
const lastHalf = stationPairs.at(-1);
let boundaryResidual = null;
let boundaryResidualNorm = null;
if (lastHalf.byCase.EXP.discrepancy) {
  boundaryResidual = sub(add(lastHalf.byCase.EXP.discrepancy.J, downstream.I), reaction20340.discrepancy);
  boundaryResidualNorm = norm(boundaryResidual);
}
const firstHalf = stationPairs[0];
const internalReaction = boundaryReactionDiscrepancy(raw, solved, '20339');
let station20339Residual = null;
let station20339ResidualNorm = null;
if (firstHalf.byCase.EXP.discrepancy && lastHalf.byCase.EXP.discrepancy) {
  station20339Residual = sub(add(firstHalf.byCase.EXP.discrepancy.J, lastHalf.byCase.EXP.discrepancy.I), internalReaction.discrepancy);
  station20339ResidualNorm = norm(station20339Residual);
}
const outgoingTangent = tangent(solved.authorities.sourceGeometry, '20340', '20350');
const downstreamAxialProjection = dot(downstream.I, outgoingTangent);
const incomingUpstreamNorm = firstHalf.byCase.EXP.discrepancy?.iNorm ?? null;
const incomingDownstreamNorm = lastHalf.byCase.EXP.discrepancy?.jNorm ?? null;
const forceMagnitudeTransported = incomingUpstreamNorm !== null && incomingDownstreamNorm !== null
  && Math.abs(incomingUpstreamNorm - incomingDownstreamNorm) <= FORCE_TOL;

assert.ok(allExpComparable, 'M047 requires exact one-to-one CAESAR EXP rows at both preserved bend station pairs.');
assert.ok(allExpNetClose, 'M047 exact bend station subpaths must have negligible EXP net-end discrepancy before transport attribution.');
assert.ok(boundaryResidualNorm !== null && boundaryResidualNorm <= FORCE_TOL,
  'M047 exact 20340 bend-to-straight global discrepancy balance must close.');
assert.ok(station20339ResidualNorm !== null && station20339ResidualNorm <= FORCE_TOL,
  'M047 exact internal station 20339 discrepancy balance must close.');
assert.ok(Math.abs(downstreamAxialProjection + 728.7263345223982) <= 1e-3,
  'M047 must reproduce the governing M045 downstream axial projection.');

const report = Object.freeze({
  schema: 'lfea-m047-bm4-bend-station-authority/v1',
  source: Object.freeze({
    sourceId: SOURCE_ID,
    pair: `${source.sourceSegment.startNodeId}-${source.sourceSegment.endNodeId}`,
    type: source.sourceSegment.type,
    sourceComponentUid: source.sourceSegment.sourceComponentUid,
    exactNumericStations: Object.freeze(stations),
    descendantCount: descendants.length,
  }),
  exactStationAuthority: Object.freeze(stationPairs),
  expansionChecks: Object.freeze({
    allExactStationsComparable: allExpComparable,
    allExactStationSubpathsNetEndClose: allExpNetClose,
    station20339Reaction: internalReaction,
    station20339Residual,
    station20339ResidualNorm,
    node20340Reaction: reaction20340,
    bendToStraightBoundaryResidual: boundaryResidual,
    bendToStraightBoundaryResidualNorm: boundaryResidualNorm,
    downstreamStraightDiscrepancy: downstream,
    downstreamAxialProjection,
    upstreamBendDiscrepancyNorm: incomingUpstreamNorm,
    downstreamBendDiscrepancyNorm: incomingDownstreamNorm,
    forceMagnitudeTransportedThroughTargetBend: forceMagnitudeTransported,
  }),
  disposition: Object.freeze({
    mechanicsChangedByM047: false,
    stationInterpolationUsed: false,
    exactBendStationAuthorityResolved: allExpComparable,
    bendCreatesNetExpansionAxialLoadMismatch: !allExpNetClose,
    bendMechanicsErrorConcluded: false,
    frictionCauseConcluded: false,
    pressureCauseConcluded: false,
    conclusion: allExpComparable && allExpNetClose && boundaryResidualNorm <= FORCE_TOL
      ? 'EXACT_CAESAR_BEND_STATIONS_RESOLVE_IX_S20_AND_EXP_FORCE_DISCREPANCY_IS_TRANSPORTED_THROUGH_THE_BEND_WITHOUT_NET_AXIAL_LOAD_CREATION'
      : 'BEND_STATION_AUTHORITY_REMAINS_INCOMPLETE',
    nextRcaBoundary: allExpComparable && allExpNetClose
      ? 'TRACE_THE_DISCREPANCY_ACROSS_THE_UPSTREAM_IX_S19_BEND_AND_PRECEDING_STRAIGHT_OR_REACTION_BOUNDARY'
      : 'RESOLVE_REMAINING_EXACT_BEND_STATION_AUTHORITY',
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
console.log(`M047 exact stations: ${JSON.stringify(stations)}`);
console.log(`M047 authority counts: ${JSON.stringify(stationPairs.map((row) => ({ pair: row.stationPair, SUS: row.byCase.SUS.globalRowCount, OPE: row.byCase.OPE.globalRowCount, EXP: row.byCase.EXP.globalRowCount })))}`);
console.log(`M047 EXP station discrepancies: ${JSON.stringify(stationPairs.map((row) => ({ pair: row.stationPair, discrepancy: row.byCase.EXP.discrepancy })))}`);
console.log(`M047 20339/20340 closure norms: ${station20339ResidualNorm}/${boundaryResidualNorm}`);
console.log(`M047 transported magnitude: ${incomingUpstreamNorm} -> ${incomingDownstreamNorm}`);
console.log(`M047 conclusion: ${report.disposition.conclusion}`);
