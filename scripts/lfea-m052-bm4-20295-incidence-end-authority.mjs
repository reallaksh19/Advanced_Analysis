#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';

const NODE_ID = '20295';
const BRANCH_SOURCE_ID = 'IX-S36';
const CANONICAL_SOURCE_IDS = Object.freeze(['IX-S17', 'IX-S18']);
const FORCE_TOL = 0.05;

function pairKey(entry) { return `${entry.sourceSegment.startNodeId}-${entry.sourceSegment.endNodeId}`; }
function v(action) { return { x: action.fx, y: action.fy, z: action.fz }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function norm(a) { return Math.hypot(a.x, a.y, a.z); }
function zero() { return { x: 0, y: 0, z: 0 }; }
function recovered(recovery) { return new Map(recovery.elementActions.map((row) => [row.elementId, row])); }
function sourceSummary(entry) {
  return Object.freeze({
    sourceId: String(entry.sourceSegment.id), pair: pairKey(entry), type: entry.sourceSegment.type,
    fromNode: String(entry.sourceSegment.startNodeId), toNode: String(entry.sourceSegment.endNodeId),
    sourceComponentUid: entry.sourceSegment.sourceComponentUid ?? null,
  });
}
function sourceExpansionEnd(solved, entry, nodeId) {
  const descendants = solved.authorities.entries.filter((row) => row.sourceSegmentId === String(entry.sourceSegment.id));
  assert.ok(descendants.length > 0, `M052 missing descendants for ${entry.sourceSegment.id}.`);
  const atI = String(entry.sourceSegment.startNodeId) === nodeId;
  const atJ = String(entry.sourceSegment.endNodeId) === nodeId;
  assert.ok(atI !== atJ, `M052 source ${entry.sourceSegment.id} must touch ${nodeId} at one end.`);
  const end = atI ? 'I' : 'J';
  const elementId = atI ? descendants[0].elementId : descendants.at(-1).elementId;
  const sus = recovered(solved.sustained.recovery).get(elementId);
  const ope = recovered(solved.operating.recovery).get(elementId);
  assert.ok(sus && ope, `M052 missing recovery for ${elementId}.`);
  return Object.freeze({ end, elementId, action: sub(v(ope.global[end]), v(sus.global[end])) });
}
function physicalEnd(row, nodeId) {
  if (String(row.fromNode) === nodeId) return Object.freeze({ end: 'I', action: v(row.I) });
  if (String(row.toNode) === nodeId) return Object.freeze({ end: 'J', action: v(row.J) });
  throw new Error(`M052 CAESAR row ${row.fromNode}-${row.toNode} does not touch ${nodeId}.`);
}
function incidentCiiRows(raw) {
  const rows = [];
  for (const [reportedPair, group] of raw.globalForce.get('EXP').byPair) for (const row of group) {
    if (String(row.fromNode) !== NODE_ID && String(row.toNode) !== NODE_ID) continue;
    rows.push(Object.freeze({ reportedPair, row }));
  }
  return rows;
}
function mappedCanonical(raw, solved, entry) {
  const key = pairKey(entry);
  const rows = raw.globalForce.get('EXP').byPair.get(key) ?? [];
  assert.equal(rows.length, 1, `M052 canonical ${key} must remain one-to-one.`);
  const ours = sourceExpansionEnd(solved, entry, NODE_ID);
  const cii = physicalEnd(rows[0], NODE_ID);
  return Object.freeze({
    source: sourceSummary(entry), caesarReportedPair: key, lfeaEnd: ours.end, caesarEnd: cii.end,
    lfeaExpansionEndAction: ours.action, caesarExpansionEndAction: cii.action,
    discrepancy: sub(ours.action, cii.action), discrepancyNorm: norm(sub(ours.action, cii.action)),
  });
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
  const mappedCii = row ? { x: -row.FX, y: -row.FY, z: -row.FZ } : zero();
  return Object.freeze({ lfea, mappedCii, discrepancy: sub(lfea, mappedCii) });
}
function nodalPrimitives(analysis) {
  return analysis.loadCase.primitives.filter((row) =>
    row.kind === 'NODAL_FORCE_MOMENT' && String(row.nodeId ?? '').replace(/^BM4M035\.N/u, '') === NODE_ID);
}
function sumNodalForce(rows) {
  return rows.reduce((sum, row) => add(sum, { x: row.force.fx, y: row.force.fy, z: row.force.fz }), zero());
}

const solved = solveBm4M035M036Combined();
const raw = loadBm4CiiOutputCases1921();
const sourceIncidents = solved.authorities.base.entries.filter((entry) =>
  String(entry.sourceSegment.startNodeId) === NODE_ID || String(entry.sourceSegment.endNodeId) === NODE_ID);
assert.equal(sourceIncidents.length, 3, 'M052 source tee degree at node 20295 must remain three.');
const sourceById = new Map(sourceIncidents.map((entry) => [String(entry.sourceSegment.id), entry]));
for (const sourceId of [...CANONICAL_SOURCE_IDS, BRANCH_SOURCE_ID]) assert.ok(sourceById.has(sourceId), `M052 missing incident ${sourceId}.`);

const ciiIncidents = incidentCiiRows(raw);
assert.equal(ciiIncidents.length, 3, 'M052 CAESAR CASE21 force-result degree at node 20295 must remain three.');
const canonical = CANONICAL_SOURCE_IDS.map((sourceId) => mappedCanonical(raw, solved, sourceById.get(sourceId)));
const consumedPairs = new Set(canonical.map((row) => row.caesarReportedPair));
const unmatched = ciiIncidents.filter((row) => !consumedPairs.has(row.reportedPair));
assert.equal(unmatched.length, 1, 'M052 incidence bijection requires exactly one unmatched CAESAR row after canonical main-line mapping.');
const branchSource = sourceById.get(BRANCH_SOURCE_ID);
const branchLfea = sourceExpansionEnd(solved, branchSource, NODE_ID);
const branchCii = physicalEnd(unmatched[0].row, NODE_ID);
const branchDiscrepancy = sub(branchLfea.action, branchCii.action);

const reaction = reactionDiscrepancy(raw, solved);
const susNodal = nodalPrimitives(solved.sustained);
const opeNodal = nodalPrimitives(solved.operating);
assert.equal(susNodal.length, 0, 'M052 SUS unexpectedly gained node-20295 nodal force primitive.');
assert.equal(opeNodal.length, 0, 'M052 OPE unexpectedly gained node-20295 nodal force primitive.');
const nodalLoadDiscrepancy = sub(sumNodalForce(opeNodal), sumNodalForce(susNodal));
const incidentSum = [...canonical.map((row) => row.discrepancy), branchDiscrepancy].reduce(add, zero());
const residual = sub(sub(incidentSum, reaction.discrepancy), nodalLoadDiscrepancy);
const residualNorm = norm(residual);
assert.ok(residualNorm <= FORCE_TOL, `M052 topology-qualified three-member tee free body does not close: ${residualNorm} N.`);

const unmatchedOtherNode = String(unmatched[0].row.fromNode) === NODE_ID ? String(unmatched[0].row.toNode) : String(unmatched[0].row.fromNode);
const sourceGeometryContainsUnmatchedOtherNode = solved.authorities.sourceGeometry.nodes.some((node) => String(node.id) === unmatchedOtherNode);
const resultGeometryContainsUnmatchedOtherNode = raw.displacement.get('EXP')?.has?.(unmatchedOtherNode) ?? false;
const report = Object.freeze({
  schema: 'lfea-m052-bm4-20295-incidence-end-authority/v1',
  nodeId: NODE_ID,
  targetCase: Object.freeze({ label: 'EXP', number: 21, expression: 'L20-L19' }),
  authorityRule: 'BIJECTIVE_NODE_INCIDENCE_AFTER_CANONICAL_MAIN_LINE_MAPPING_NO_FORCE_FIT_NO_STATION_INTERPOLATION',
  sourceIncidence: Object.freeze({ degree: sourceIncidents.length, rows: Object.freeze(sourceIncidents.map(sourceSummary)) }),
  caesarIncidence: Object.freeze({
    degree: ciiIncidents.length,
    rows: Object.freeze(ciiIncidents.map(({ reportedPair, row }) => ({ reportedPair, fromNode: String(row.fromNode), toNode: String(row.toNode) }))),
    consumedCanonicalPairs: Object.freeze([...consumedPairs]),
    unmatchedPair: unmatched[0].reportedPair,
    unmatchedOtherNode,
    unmatchedOtherNodeInInputSourceGeometry: sourceGeometryContainsUnmatchedOtherNode,
    unmatchedOtherNodeInCaesarOutputDisplacementAuthority: resultGeometryContainsUnmatchedOtherNode,
  }),
  canonicalMappings: Object.freeze(canonical),
  branchMapping: Object.freeze({
    source: sourceSummary(branchSource),
    caesarReportedPair: unmatched[0].reportedPair,
    lfeaEnd: branchLfea.end,
    caesarPhysicalNodeEnd: branchCii.end,
    lfeaExpansionEndAction: branchLfea.action,
    caesarExpansionEndAction: branchCii.action,
    discrepancy: branchDiscrepancy,
    discrepancyNorm: norm(branchDiscrepancy),
    station20296MappedToM035InternalNode: false,
  }),
  freeBody: Object.freeze({ reaction, nodalLoadDiscrepancy, incidentEndDiscrepancySum: incidentSum, residual, residualNorm }),
  disposition: Object.freeze({
    mechanicsChangedByM052: false,
    stationInterpolationUsed: false,
    forceValuesUsedToSelectBranchRow: false,
    branchEndAuthorityResolvedByIncidence: true,
    node20295ThreeMemberFreeBodyQualified: true,
    frictionCauseConcluded: false,
    pressureOrBourdonCauseConcluded: false,
    conclusion: 'NODE_20295_BRANCH_END_AUTHORITY_RESOLVED_BY_BIJECTIVE_INCIDENCE_AND_THREE_MEMBER_DISCREPANCY_FREE_BODY_CLOSES',
    nextRcaBoundary: 'BUILD_MULTI_MEMBER_GRAPH_CONSERVATION_TRACE_FOR_EXP_SECTION_FORCE_DISCREPANCY',
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
console.log(`M052 source/CAESAR degree: ${sourceIncidents.length}/${ciiIncidents.length}`);
console.log(`M052 canonical mappings: ${JSON.stringify(canonical.map((row) => ({ sourceId: row.source.sourceId, pair: row.caesarReportedPair })))}`);
console.log(`M052 unmatched branch pair: ${unmatched[0].reportedPair}; otherNode=${unmatchedOtherNode}; inSource=${sourceGeometryContainsUnmatchedOtherNode}`);
console.log(`M052 branch discrepancy: ${JSON.stringify(branchDiscrepancy)} norm=${norm(branchDiscrepancy)}`);
console.log(`M052 tee residual: ${JSON.stringify(residual)} norm=${residualNorm}`);
console.log(`M052 conclusion: ${report.disposition.conclusion}`);
