#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';

const NODE_ID = '20295';
const FORCE_TOL = 0.05;

function pairKey(entry) { return `${entry.sourceSegment.startNodeId}-${entry.sourceSegment.endNodeId}`; }
function vec(action) { return { x: action.fx, y: action.fy, z: action.fz }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function norm(a) { return Math.hypot(a.x, a.y, a.z); }
function zero() { return { x: 0, y: 0, z: 0 }; }
function isNumericNode(id) { return /^\d+(?:\.\d+)?$/u.test(String(id)); }
function recoveredMap(recovery) { return new Map(recovery.elementActions.map((row) => [row.elementId, row])); }
function expansionEnd(solved, elementId, end) {
  const sus = recoveredMap(solved.sustained.recovery).get(elementId);
  const ope = recoveredMap(solved.operating.recovery).get(elementId);
  if (!sus || !ope) throw new Error(`M050 missing recovered element ${elementId}.`);
  return sub(vec(ope.global[end]), vec(sus.global[end]));
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
  return start >= 0 && end >= start ? descendants.slice(start, end + 1) : null;
}
function sourceSummary(entry) {
  return Object.freeze({
    sourceId: String(entry.sourceSegment.id),
    pair: pairKey(entry),
    type: entry.sourceSegment.type,
    fromNode: String(entry.sourceSegment.startNodeId),
    toNode: String(entry.sourceSegment.endNodeId),
    sourceComponentUid: entry.sourceSegment.sourceComponentUid ?? null,
    metaKeys: Object.freeze(Object.keys(entry.sourceSegment.meta ?? {}).sort()),
  });
}
function incidentEndAuthority(raw, solved, source) {
  const summary = sourceSummary(source);
  const descendants = solved.authorities.entries.filter((row) => row.sourceSegmentId === summary.sourceId);
  assert.ok(descendants.length > 0, `M050 ${summary.sourceId} needs analysis descendants.`);
  const atI = summary.fromNode === NODE_ID;
  const atJ = summary.toNode === NODE_ID;
  assert.ok(atI !== atJ, `M050 ${summary.sourceId} must touch ${NODE_ID} at exactly one end.`);
  let authorityPair = summary.pair;
  let subpath = descendants;
  let end = atI ? 'I' : 'J';
  let exactStationMode = false;
  let stations = [summary.fromNode, summary.toNode];
  let rows = raw.globalForce.get('EXP').byPair.get(authorityPair) ?? [];
  if (rows.length !== 1 && summary.type === 'BEND') {
    stations = exactStations(descendants);
    if (stations.length >= 2) {
      const from = atI ? stations[0] : stations.at(-2);
      const to = atI ? stations[1] : stations.at(-1);
      authorityPair = `${from}-${to}`;
      subpath = exactSubpath(descendants, from, to);
      end = atI ? 'I' : 'J';
      exactStationMode = true;
      rows = raw.globalForce.get('EXP').byPair.get(authorityPair) ?? [];
    }
  }
  let lfea = null;
  let cii = null;
  let discrepancy = null;
  if (rows.length === 1 && subpath?.length) {
    const elementId = end === 'I' ? subpath[0].elementId : subpath.at(-1).elementId;
    lfea = expansionEnd(solved, elementId, end);
    cii = vec(rows[0][end]);
    discrepancy = sub(lfea, cii);
  }
  return Object.freeze({
    source: summary,
    nodeEnd: end,
    exactStationMode,
    exactNumericStations: Object.freeze(stations),
    authorityPair,
    caesarGlobalRowCount: rows.length,
    descendantCount: subpath?.length ?? 0,
    lfeaExpansionEndAction: lfea,
    caesarExpansionEndAction: cii,
    discrepancy,
    discrepancyNorm: discrepancy ? norm(discrepancy) : null,
  });
}
function reactionMap(execution) {
  const out = new Map();
  for (const row of execution.reactions) {
    if (!['UX', 'UY', 'UZ'].includes(row.dof)) continue;
    const id = String(row.nodeId).replace(/^BM4M035\.N/u, '');
    if (!out.has(id)) out.set(id, zero());
    out.get(id)[{ UX: 'x', UY: 'y', UZ: 'z' }[row.dof]] += row.value;
  }
  return out;
}
function reactionDiscrepancy(raw, solved) {
  const sus = reactionMap(solved.sustained.execution).get(NODE_ID) ?? zero();
  const ope = reactionMap(solved.operating.execution).get(NODE_ID) ?? zero();
  const lfea = sub(ope, sus);
  const row = raw.restraint.get('EXP').get(NODE_ID);
  const caesarMapped = row ? { x: -row.FX, y: -row.FY, z: -row.FZ } : zero();
  const discrepancy = sub(lfea, caesarMapped);
  return Object.freeze({ lfea, caesarMapped, discrepancy, discrepancyNorm: norm(discrepancy) });
}
function nodeIdOf(primitive) {
  return primitive.nodeId ? String(primitive.nodeId).replace(/^BM4M035\.N/u, '') : null;
}
function nodalPrimitives(analysis) {
  return Object.freeze(analysis.loadCase.primitives
    .filter((row) => row.kind === 'NODAL_FORCE_MOMENT' && nodeIdOf(row) === NODE_ID)
    .map((row) => Object.freeze({ primitiveId: row.primitiveId, nodeId: nodeIdOf(row), force: row.force, moment: row.moment, basis: row.basis })));
}
function sumNodalForces(rows) {
  return rows.reduce((sum, row) => add(sum, { x: row.force.fx, y: row.force.fy, z: row.force.fz }), zero());
}
function adjacentPrimitives(analysis, elementIds) {
  return Object.freeze(analysis.loadCase.primitives
    .filter((row) => row.elementId && elementIds.has(row.elementId))
    .map((row) => Object.freeze({
      primitiveId: row.primitiveId,
      kind: row.kind,
      elementId: row.elementId,
      ...(row.kind === 'DISTRIBUTED_LOAD' ? { startIntensity: row.startIntensity, endIntensity: row.endIntensity } : {}),
      ...(row.kind === 'TEMPERATURE' ? { operatingTemperature: row.operatingTemperature, installationTemperature: row.installationTemperature } : {}),
      ...(row.kind === 'PRESSURE' ? { pressure: row.pressure, authorizedEffects: row.authorizedEffects } : {}),
    })));
}

const solved = solveBm4M035M036Combined();
const raw = loadBm4CiiOutputCases1921();
const incidentSources = solved.authorities.base.entries.filter((entry) =>
  String(entry.sourceSegment.startNodeId) === NODE_ID || String(entry.sourceSegment.endNodeId) === NODE_ID);
const incident = incidentSources.map((entry) => incidentEndAuthority(raw, solved, entry));
assert.ok(incident.length >= 2, 'M050 node 20295 must have at least two incident source members.');
const completeIncident = incident.filter((row) => row.discrepancy);
const incompleteIncident = incident.filter((row) => !row.discrepancy);
const authorityComplete = incompleteIncident.length === 0;
const incidentSum = completeIncident.reduce((sum, row) => add(sum, row.discrepancy), zero());
const reaction = reactionDiscrepancy(raw, solved);
const susNodal = nodalPrimitives(solved.sustained);
const opeNodal = nodalPrimitives(solved.operating);
const lfeaNodalExp = sub(sumNodalForces(opeNodal), sumNodalForces(susNodal));
const caesarNodalExp = zero();
const nodalLoadDiscrepancy = sub(lfeaNodalExp, caesarNodalExp);
const residual = authorityComplete ? sub(sub(incidentSum, reaction.discrepancy), nodalLoadDiscrepancy) : null;
const residualNorm = residual ? norm(residual) : null;
const adjacentElementIds = new Set(incidentSources.flatMap((source) =>
  solved.authorities.entries.filter((entry) => entry.sourceSegmentId === String(source.sourceSegment.id)).map((entry) => entry.elementId)));

assert.equal(susNodal.length, 0, 'M050 qualified SUS path unexpectedly gained a node-20295 nodal force primitive.');
assert.equal(opeNodal.length, 0, 'M050 qualified OPE path unexpectedly gained a node-20295 nodal force primitive.');
if (authorityComplete) assert.ok(residualNorm <= FORCE_TOL, `M050 complete node-20295 free body does not close: ${residualNorm} N.`);

const omittedIncidentContribution = authorityComplete && incident.length > 2
  ? incident.slice(2).reduce((sum, row) => add(sum, row.discrepancy), zero())
  : null;
const topologyWasMissingTerm = authorityComplete && incident.length > 2 && norm(omittedIncidentContribution) > FORCE_TOL;
const conclusion = !authorityComplete
  ? 'NODE_20295_MULTI_MEMBER_TOPOLOGY_CONFIRMED_BUT_EXACT_INCIDENT_END_AUTHORITY_IS_INCOMPLETE'
  : topologyWasMissingTerm
    ? 'M049_NODE_20295_STOP_WAS_AN_INCOMPLETE_MULTI_MEMBER_NODE_FREE_BODY_AND_CLOSES_WITH_ALL_INCIDENT_SOURCE_ENDS'
    : 'NODE_20295_COMPLETE_FREE_BODY_CLOSES_WITHOUT_AN_EXPLICIT_NODAL_LOAD_TERM';
const nextRcaBoundary = !authorityComplete
  ? 'RESOLVE_EXACT_CAESAR_END_AUTHORITY_FOR_INCOMPLETE_NODE_20295_INCIDENT_MEMBER'
  : 'RESTART_UPSTREAM_PROVENANCE_WITH_MULTI_MEMBER_NODE_EQUILIBRIUM';

const report = Object.freeze({
  schema: 'lfea-m050-bm4-20295-node-free-body/v2',
  nodeId: NODE_ID,
  targetCase: Object.freeze({ label: 'EXP', number: 21, expression: 'L20-L19' }),
  sourceTopology: Object.freeze({
    incidentSourceCount: incident.length,
    authorityComplete,
    completeIncidentCount: completeIncident.length,
    incompleteIncidentCount: incompleteIncident.length,
    incidentSourceEnds: Object.freeze(incident),
    incompleteIncidentSourceEnds: Object.freeze(incompleteIncident),
  }),
  externalTerms: Object.freeze({
    reaction,
    sustainedNodalForcePrimitives: susNodal,
    operatingNodalForcePrimitives: opeNodal,
    lfeaExpansionNodalForce: lfeaNodalExp,
    caesarExpansionNodalForceAuthority: caesarNodalExp,
    nodalLoadDiscrepancy,
    sustainedAdjacentElementPrimitives: adjacentPrimitives(solved.sustained, adjacentElementIds),
    operatingAdjacentElementPrimitives: adjacentPrimitives(solved.operating, adjacentElementIds),
    distributedAndThermalElementEffectsAlreadyIncludedInRecoveredEndActions: true,
  }),
  freeBody: Object.freeze({ incidentEndDiscrepancySumFromResolvedAuthority: incidentSum, residual, residualNorm, omittedIncidentContribution }),
  disposition: Object.freeze({
    mechanicsChangedByM050: false,
    explicitNode20295NodalLoadPresent: false,
    topologyWasMissingTerm,
    m049BoundaryWasMechanicsDiscontinuity: false,
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
console.log(`M050 incident source count: ${incident.length}; complete/incomplete=${completeIncident.length}/${incompleteIncident.length}`);
console.log(`M050 incident ends: ${JSON.stringify(incident.map((row) => ({ source: row.source, authorityPair: row.authorityPair, end: row.nodeEnd, ciiRows: row.caesarGlobalRowCount, discrepancy: row.discrepancy, norm: row.discrepancyNorm })))}`);
console.log(`M050 explicit nodal primitives SUS/OPE: ${susNodal.length}/${opeNodal.length}`);
console.log(`M050 free body: ${JSON.stringify({ incidentSum, reaction: reaction.discrepancy, nodalLoadDiscrepancy, residual, residualNorm })}`);
console.log(`M050 conclusion: ${conclusion}; next=${nextRcaBoundary}`);
