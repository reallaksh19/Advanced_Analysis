#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';

const NODE_ID = '20295';
const SOURCE_ID = 'IX-S36';
const OTHER_INCIDENT_SOURCE_IDS = Object.freeze(['IX-S17', 'IX-S18']);
const FORCE_TOL = 0.05;

function pairKey(entry) { return `${entry.sourceSegment.startNodeId}-${entry.sourceSegment.endNodeId}`; }
function vec(action) { return { x: action.fx, y: action.fy, z: action.fz }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function norm(a) { return Math.hypot(a.x, a.y, a.z); }
function zero() { return { x: 0, y: 0, z: 0 }; }
function isNumericNode(id) { return /^\d+(?:\.\d+)?$/u.test(String(id)); }
function recoveredMap(recovery) { return new Map(recovery.elementActions.map((row) => [row.elementId, row])); }
function exactStations(descendants) {
  const nodes = [String(descendants[0].segment.startNodeId)];
  for (const entry of descendants) {
    const id = String(entry.segment.endNodeId);
    if (isNumericNode(id) && id !== nodes.at(-1)) nodes.push(id);
  }
  return nodes;
}
function exactSubpath(descendants, from, to) {
  const startIndex = descendants.findIndex((entry) => String(entry.segment.startNodeId) === String(from));
  let endIndex = -1;
  for (let index = startIndex; index < descendants.length; index += 1) {
    if (String(descendants[index].segment.endNodeId) === String(to)) { endIndex = index; break; }
  }
  if (startIndex < 0 || endIndex < startIndex) return null;
  return descendants.slice(startIndex, endIndex + 1);
}
function expansionActionForSubpath(solved, subpath) {
  const sus = recoveredMap(solved.sustained.recovery);
  const ope = recoveredMap(solved.operating.recovery);
  const sFirst = sus.get(subpath[0].elementId);
  const sLast = sus.get(subpath.at(-1).elementId);
  const oFirst = ope.get(subpath[0].elementId);
  const oLast = ope.get(subpath.at(-1).elementId);
  if (!sFirst || !sLast || !oFirst || !oLast) throw new Error('M051 missing recovered bend subpath action.');
  return Object.freeze({
    fromNode: String(subpath[0].segment.startNodeId),
    toNode: String(subpath.at(-1).segment.endNodeId),
    I: sub(vec(oFirst.global.I), vec(sFirst.global.I)),
    J: sub(vec(oLast.global.J), vec(sLast.global.J)),
  });
}
function physicalCiiEnds(row) {
  return new Map([
    [String(row.fromNode), vec(row.I)],
    [String(row.toNode), vec(row.J)],
  ]);
}
function exactCandidate(raw, solved, descendants, stations, row) {
  const fromNode = String(row.fromNode);
  const toNode = String(row.toNode);
  if (!stations.includes(fromNode) || !stations.includes(toNode)) return null;
  const fromIndex = stations.indexOf(fromNode);
  const toIndex = stations.indexOf(toNode);
  if (fromIndex === toIndex) return null;
  const sourceFrom = fromIndex < toIndex ? fromNode : toNode;
  const sourceTo = fromIndex < toIndex ? toNode : fromNode;
  const subpath = exactSubpath(descendants, sourceFrom, sourceTo);
  if (!subpath?.length) return null;
  const ours = expansionActionForSubpath(solved, subpath);
  const ciiPhysical = physicalCiiEnds(row);
  const dSourceFrom = sub(ours.I, ciiPhysical.get(sourceFrom));
  const dSourceTo = sub(ours.J, ciiPhysical.get(sourceTo));
  return Object.freeze({
    caesarPair: `${fromNode}-${toNode}`,
    caesarOrientationMatchesSource: fromIndex < toIndex,
    sourceSubpath: `${sourceFrom}-${sourceTo}`,
    sourceFrom,
    sourceTo,
    descendantCount: subpath.length,
    firstElementId: subpath[0].elementId,
    lastElementId: subpath.at(-1).elementId,
    discrepancyAtSourceFrom: dSourceFrom,
    discrepancyAtSourceTo: dSourceTo,
    netEndSumDiscrepancy: add(dSourceFrom, dSourceTo),
    netEndSumDiscrepancyNorm: norm(add(dSourceFrom, dSourceTo)),
  });
}
function rowsTouchingStations(rawCase, stations) {
  const set = new Set(stations);
  const out = [];
  for (const [key, rows] of rawCase.byPair) {
    for (const row of rows) {
      const fromNode = String(row.fromNode);
      const toNode = String(row.toNode);
      if (!set.has(fromNode) && !set.has(toNode)) continue;
      out.push(Object.freeze({ pairKey: key, fromNode, toNode }));
    }
  }
  return out;
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
function sourceExpansionEndDiscrepancy(raw, solved, sourceId, nodeId) {
  const source = solved.authorities.base.entries.find((entry) => String(entry.sourceSegment.id) === sourceId);
  assert.ok(source, `M051 missing incident source ${sourceId}.`);
  const rows = raw.globalForce.get('EXP').byPair.get(pairKey(source)) ?? [];
  assert.equal(rows.length, 1, `M051 ${sourceId} must retain one-to-one CAESAR EXP authority.`);
  const descendants = solved.authorities.entries.filter((entry) => entry.sourceSegmentId === sourceId);
  const atI = String(source.sourceSegment.startNodeId) === nodeId;
  const atJ = String(source.sourceSegment.endNodeId) === nodeId;
  assert.ok(atI !== atJ, `M051 ${sourceId} must touch ${nodeId} at one source end.`);
  const end = atI ? 'I' : 'J';
  const elementId = atI ? descendants[0].elementId : descendants.at(-1).elementId;
  const sus = recoveredMap(solved.sustained.recovery).get(elementId);
  const ope = recoveredMap(solved.operating.recovery).get(elementId);
  const lfea = sub(vec(ope.global[end]), vec(sus.global[end]));
  const ciiPhysical = physicalCiiEnds(rows[0]).get(nodeId);
  return Object.freeze({ source: sourceSummary(source), end, discrepancy: sub(lfea, ciiPhysical), discrepancyNorm: norm(sub(lfea, ciiPhysical)) });
}
function reactionMap(execution) {
  const out = new Map();
  for (const row of execution.reactions) {
    if (!['UX', 'UY', 'UZ'].includes(row.dof)) continue;
    const nodeId = String(row.nodeId).replace(/^BM4M035\.N/u, '');
    if (!out.has(nodeId)) out.set(nodeId, zero());
    out.get(nodeId)[{ UX: 'x', UY: 'y', UZ: 'z' }[row.dof]] += row.value;
  }
  return out;
}
function reactionDiscrepancy(raw, solved) {
  const sus = reactionMap(solved.sustained.execution).get(NODE_ID) ?? zero();
  const ope = reactionMap(solved.operating.execution).get(NODE_ID) ?? zero();
  const lfea = sub(ope, sus);
  const row = raw.restraint.get('EXP').get(NODE_ID);
  const caesarMapped = row ? { x: -row.FX, y: -row.FY, z: -row.FZ } : zero();
  return Object.freeze({ lfea, caesarMapped, discrepancy: sub(lfea, caesarMapped) });
}
function nodeIdOf(primitive) {
  return primitive.nodeId ? String(primitive.nodeId).replace(/^BM4M035\.N/u, '') : null;
}
function nodalPrimitives(analysis) {
  return analysis.loadCase.primitives.filter((row) => row.kind === 'NODAL_FORCE_MOMENT' && nodeIdOf(row) === NODE_ID);
}
function sumNodalForce(rows) {
  return rows.reduce((sum, row) => add(sum, { x: row.force.fx, y: row.force.fy, z: row.force.fz }), zero());
}

const solved = solveBm4M035M036Combined();
const raw = loadBm4CiiOutputCases1921();
const source = solved.authorities.base.entries.find((entry) => String(entry.sourceSegment.id) === SOURCE_ID);
assert.ok(source, `M051 missing source ${SOURCE_ID}.`);
assert.equal(source.sourceSegment.type, 'BEND', 'M051 target source must remain a bend.');
assert.equal(String(source.sourceSegment.startNodeId), NODE_ID, 'M051 branch bend must start at node 20295.');
const descendants = solved.authorities.entries.filter((entry) => entry.sourceSegmentId === SOURCE_ID);
assert.ok(descendants.length > 1, 'M051 target bend must retain expanded descendants.');
const stations = exactStations(descendants);
assert.equal(stations[0], NODE_ID, 'M051 first exact numeric station must remain node 20295.');

const expRowsTouchingStations = rowsTouchingStations(raw.globalForce.get('EXP'), stations);
const expRowsTouchingStart = expRowsTouchingStations.filter((row) => row.fromNode === NODE_ID || row.toNode === NODE_ID);
const exactStartCandidates = [];
for (const row of raw.globalForce.get('EXP').rows) {
  if (String(row.fromNode) !== NODE_ID && String(row.toNode) !== NODE_ID) continue;
  const candidate = exactCandidate(raw, solved, descendants, stations, row);
  if (candidate) exactStartCandidates.push(candidate);
}

const uniqueCandidates = new Map(exactStartCandidates.map((row) => [row.caesarPair, row]));
const candidates = [...uniqueCandidates.values()];
const resolvedBranch = candidates.length === 1 ? candidates[0] : null;
let branchEndDiscrepancy = null;
if (resolvedBranch) {
  branchEndDiscrepancy = resolvedBranch.sourceFrom === NODE_ID
    ? resolvedBranch.discrepancyAtSourceFrom
    : resolvedBranch.discrepancyAtSourceTo;
}

const otherIncident = OTHER_INCIDENT_SOURCE_IDS.map((sourceId) => sourceExpansionEndDiscrepancy(raw, solved, sourceId, NODE_ID));
const resolvedOtherSum = otherIncident.reduce((sum, row) => add(sum, row.discrepancy), zero());
const reaction = reactionDiscrepancy(raw, solved);
const susNodal = nodalPrimitives(solved.sustained);
const opeNodal = nodalPrimitives(solved.operating);
const nodalLoadDiscrepancy = sub(sumNodalForce(opeNodal), sumNodalForce(susNodal));
let teeResidual = null;
let teeResidualNorm = null;
if (branchEndDiscrepancy) {
  teeResidual = sub(sub(add(resolvedOtherSum, branchEndDiscrepancy), reaction.discrepancy), nodalLoadDiscrepancy);
  teeResidualNorm = norm(teeResidual);
}

assert.equal(susNodal.length, 0, 'M051 SUS path unexpectedly gained node-20295 nodal force primitive.');
assert.equal(opeNodal.length, 0, 'M051 OPE path unexpectedly gained node-20295 nodal force primitive.');
if (resolvedBranch) {
  assert.ok(resolvedBranch.netEndSumDiscrepancyNorm <= FORCE_TOL,
    'M051 exact branch subpath must not create a net EXP force mismatch before node free-body use.');
  assert.ok(teeResidualNorm <= FORCE_TOL,
    `M051 completed three-member node-20295 discrepancy free body does not close: ${teeResidualNorm} N.`);
}

const conclusion = resolvedBranch
  ? 'EXACT_CAESAR_BRANCH_BEND_END_AUTHORITY_RESOLVED_AND_NODE_20295_THREE_MEMBER_FREE_BODY_CLOSES'
  : candidates.length === 0
    ? 'NO_EXACT_CAESAR_PAIR_MAPS_NODE_20295_TO_AN_IX_S36_PRESERVED_STATION'
    : 'MULTIPLE_EXACT_CAESAR_PAIRS_MAP_NODE_20295_TO_IX_S36_AND_REQUIRE_DISAMBIGUATION';
const nextRcaBoundary = resolvedBranch
  ? 'RESTART_LEVEL1_DISCREPANCY_PROVENANCE_AS_A_MULTI_MEMBER_GRAPH_CONSERVATION_TRACE'
  : 'RESOLVE_IX_S36_CAESAR_STATION_TO_M035_SUBPATH_AUTHORITY_WITHOUT_INTERPOLATION';

const report = Object.freeze({
  schema: 'lfea-m051-bm4-20295-branch-bend-authority/v1',
  nodeId: NODE_ID,
  source: Object.freeze({ ...sourceSummary(source), exactNumericStations: Object.freeze(stations), descendantCount: descendants.length }),
  caesarStationInventory: Object.freeze({
    expRowsTouchingPreservedStations: Object.freeze(expRowsTouchingStations),
    expRowsTouchingNode20295: Object.freeze(expRowsTouchingStart),
    exactStartCandidateCount: candidates.length,
    exactStartCandidates: Object.freeze(candidates),
  }),
  resolvedBranchAuthority: resolvedBranch,
  branchEndDiscrepancy,
  otherIncidentEnds: Object.freeze(otherIncident),
  externalTerms: Object.freeze({ reaction, sustainedNodalPrimitiveCount: susNodal.length, operatingNodalPrimitiveCount: opeNodal.length, nodalLoadDiscrepancy }),
  completedTeeFreeBody: Object.freeze({
    resolvedOtherIncidentSum: resolvedOtherSum,
    branchEndDiscrepancy,
    incidentEndDiscrepancySum: branchEndDiscrepancy ? add(resolvedOtherSum, branchEndDiscrepancy) : null,
    residual: teeResidual,
    residualNorm: teeResidualNorm,
  }),
  disposition: Object.freeze({
    mechanicsChangedByM051: false,
    stationInterpolationUsed: false,
    branchEndAuthorityResolved: Boolean(resolvedBranch),
    node20295FreeBodyQualified: Boolean(resolvedBranch) && teeResidualNorm <= FORCE_TOL,
    frictionCauseConcluded: false,
    pressureOrBourdonCauseConcluded: false,
    conclusion,
    nextRcaBoundary,
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
console.log(`M051 IX-S36 exact stations: ${JSON.stringify(stations)}`);
console.log(`M051 EXP rows touching stations: ${JSON.stringify(expRowsTouchingStations)}`);
console.log(`M051 exact start candidates: ${JSON.stringify(candidates)}`);
console.log(`M051 branch end discrepancy: ${JSON.stringify(branchEndDiscrepancy)}`);
console.log(`M051 tee free body: ${JSON.stringify(report.completedTeeFreeBody)}`);
console.log(`M051 conclusion: ${conclusion}; next=${nextRcaBoundary}`);
