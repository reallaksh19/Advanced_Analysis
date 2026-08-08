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
  if (start < 0 || end < start) return null;
  return descendants.slice(start, end + 1);
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
function caesarEnd(row, end) { return vec(row[end]); }
function incidentEndAuthority(raw, solved, source) {
  const summary = sourceSummary(source);
  const descendants = solved.authorities.entries.filter((row) => row.sourceSegmentId === summary.sourceId);
  assert.ok(descendants.length > 0, `M050 ${summary.sourceId} needs analysis descendants.`);
  const atI = summary.fromNode === NODE_ID;
  const atJ = summary.toNode === NODE_ID;
  assert.ok(atI !== atJ, `M050 ${summary.sourceId} must touch node ${NODE_ID} at one end.`);
  let authorityPair = summary.pair;
  let subpath = descendants;
  let end = atI ? 'I' : 'J';
  let exactStationMode = false;
  let stations = [summary.fromNode, summary.toNode];
  let rows = raw.globalForce.get('EXP').byPair.get(authorityPair) ?? [];
  if (rows.length !== 1 && summary.type === 'BEND') {
    stations = exactStations(descendants);
    assert.ok(stations.length >= 2, `M050 ${summary.sourceId} bend has no exact station pair.`);
    if (atI) {
      authorityPair = `${stations[0]}-${stations[1]}`;
      subpath = exactSubpath(descendants, stations[0], stations[1]);
      end = 'I';
    } else {
      authorityPair = `${stations.at(-2)}-${stations.at(-1)}`;
      subpath = exactSubpath(descendants, stations.at(-2), stations.at(-1));
      end = 'J';
    }
    exactStationMode = true;
    rows = raw.globalForce.get('EXP').byPair.get(authorityPair) ?? [];
  }
  const result = {
    source: summary,
    nodeEnd: end,
    exactStationMode,
    exactNumericStations: Object.freeze(stations),
    authorityPair,
    caesarGlobalRowCount: rows.length,
    descendantCount: subpath?.length ?? 0,
    lfeaExpansionEndAction: null,
    caesarExpansionEndAction: null,
    discrepancy: null,
    discrepancyNorm: null,
  };
  if (rows.length === 1 && subpath?.length) {
    const elementId = end === 'I' ? subpath[0].elementId : subpath.at(-1).elementId;
    const lfea = expansionEnd(solved, elementId, end);
    const cii = caesarEnd(rows[0], end);
    const discrepancy = sub(lfea, cii);
    result.lfeaExpansionEndAction = lfea;
    result.caesarExpansionEndAction = cii;
    result.discrepancy = discrepancy;
    result.discrepancyNorm = norm(discrepancy);
  }
  return Object.freeze(result);
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
function primitiveNodeId(primitive) {
  return primitive.nodeId ? String(primitive.nodeId).replace(/^BM4M035\.N/u, '') : null;
}
function nodalPrimitiveSummary(analysis) {
  return Object.freeze(analysis.loadCase.primitives
    .filter((primitive) => primitive.kind === 'NODAL_FORCE_MOMENT' && primitiveNodeId(primitive) === NODE_ID)
    .map((primitive) => Object.freeze({
      primitiveId: primitive.primitiveId,
      nodeId: primitiveNodeId(primitive),
      force: primitive.force,
      moment: primitive.moment,
      basis: primitive.basis,
    })));
}
function sumNodalForces(rows) {
  return rows.reduce((sum, row) => add(sum, { x: row.force.fx, y: row.force.fy, z: row.force.fz }), zero());
}
function adjacentPrimitiveSummary(analysis, elementIds) {
  return Object.freeze(analysis.loadCase.primitives
    .filter((primitive) => primitive.elementId && elementIds.has(primitive.elementId))
    .map((primitive) => Object.freeze({
      primitiveId: primitive.primitiveId,
      kind: primitive.kind,
      elementId: primitive.elementId,
      ...(primitive.kind === 'DISTRIBUTED_LOAD' ? { startIntensity: primitive.startIntensity, endIntensity: primitive.endIntensity } : {}),
      ...(primitive.kind === 'TEMPERATURE' ? { operatingTemperature: primitive.operatingTemperature, installationTemperature: primitive.installationTemperature } : {}),
      ...(primitive.kind === 'PRESSURE' ? { pressure: primitive.pressure, authorizedEffects: primitive.authorizedEffects } : {}),
    })));
}

const solved = solveBm4M035M036Combined();
const raw = loadBm4CiiOutputCases1921();
const incidentSources = solved.authorities.base.entries.filter((entry) =>
  String(entry.sourceSegment.startNodeId) === NODE_ID || String(entry.sourceSegment.endNodeId) === NODE_ID);
const incident = incidentSources.map((entry) => incidentEndAuthority(raw, solved, entry));
assert.ok(incident.length >= 2, 'M050 node 20295 must have at least two incident source members.');
assert.ok(incident.every((row) => row.caesarGlobalRowCount === 1 && row.discrepancy),
  'M050 requires exact one-to-one CAESAR end authority for every incident source member.');
const incidentSum = incident.reduce((sum, row) => add(sum, row.discrepancy), zero());
const reaction = reactionDiscrepancy(raw, solved);
const susNodal = nodalPrimitiveSummary(solved.sustained);
const opeNodal = nodalPrimitiveSummary(solved.operating);
const lfeaNodalExp = sub(sumNodalForces(opeNodal), sumNodalForces(susNodal));
const caesarNodalExp = zero();
const nodalLoadDiscrepancy = sub(lfeaNodalExp, caesarNodalExp);
const residual = sub(sub(incidentSum, reaction.discrepancy), nodalLoadDiscrepancy);
const residualNorm = norm(residual);
const adjacentElementIds = new Set(incidentSources.flatMap((source) =>
  solved.authorities.entries.filter((entry) => entry.sourceSegmentId === String(source.sourceSegment.id)).map((entry) => entry.elementId)));
const sustainedAdjacentPrimitives = adjacentPrimitiveSummary(solved.sustained, adjacentElementIds);
const operatingAdjacentPrimitives = adjacentPrimitiveSummary(solved.operating, adjacentElementIds);

assert.equal(susNodal.length, 0, 'M050 qualified SUS path unexpectedly gained a node-20295 nodal force primitive.');
assert.equal(opeNodal.length, 0, 'M050 qualified OPE path unexpectedly gained a node-20295 nodal force primitive.');
assert.ok(residualNorm <= FORCE_TOL,
  `M050 complete node-20295 incident-member free body does not close: ${residualNorm} N.`);

const twoMemberResidual = incident.length >= 2
  ? add(incident[0].discrepancy, incident[1].discrepancy)
  : null;
const omittedIncidentContribution = incident.length > 2
  ? incident.slice(2).reduce((sum, row) => add(sum, row.discrepancy), zero())
  : zero();
const topologyWasMissingTerm = incident.length > 2 && norm(omittedIncidentContribution) > FORCE_TOL;

const report = Object.freeze({
  schema: 'lfea-m050-bm4-20295-node-free-body/v1',
  nodeId: NODE_ID,
  targetCase: Object.freeze({ label: 'EXP', number: 21, expression: 'L20-L19' }),
  sourceTopology: Object.freeze({
    incidentSourceCount: incident.length,
    incidentSourceEnds: Object.freeze(incident),
  }),
  externalTerms: Object.freeze({
    reaction,
    sustainedNodalForcePrimitives: susNodal,
    operatingNodalForcePrimitives: opeNodal,
    lfeaExpansionNodalForce: lfeaNodalExp,
    caesarExpansionNodalForceAuthority: caesarNodalExp,
    nodalLoadDiscrepancy,
    sustainedAdjacentElementPrimitives,
    operatingAdjacentElementPrimitives,
    distributedAndThermalElementEffectsAlreadyIncludedInRecoveredEndActions: true,
  }),
  freeBody: Object.freeze({
    incidentEndDiscrepancySum: incidentSum,
    residual,
    residualNorm,
    twoMemberDiagnosticResidual: twoMemberResidual,
    omittedIncidentContribution,
  }),
  disposition: Object.freeze({
    mechanicsChangedByM050: false,
    explicitNode20295NodalLoadPresent: susNodal.length > 0 || opeNodal.length > 0,
    topologyWasMissingTerm,
    m049BoundaryWasMechanicsDiscontinuity: false,
    frictionCauseConcluded: false,
    pressureOrBourdonCauseConcluded: false,
    conclusion: topologyWasMissingTerm
      ? 'M049_NODE_20295_STOP_WAS_AN_INCOMPLETE_MULTI_MEMBER_NODE_FREE_BODY_AND_CLOSES_WITH_ALL_INCIDENT_SOURCE_ENDS'
      : 'NODE_20295_COMPLETE_FREE_BODY_CLOSES_WITHOUT_AN_EXPLICIT_NODAL_LOAD_TERM',
    nextRcaBoundary: 'RESTART_UPSTREAM_PROVENANCE_WITH_MULTI_MEMBER_NODE_EQUILIBRIUM_AND_STOP_AT_FIRST_COMPLETE_FREE_BODY_SEED_OR_AUTHORITY_BREAK',
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
console.log(`M050 incident source count: ${incident.length}`);
console.log(`M050 incident ends: ${JSON.stringify(incident.map((row) => ({ source: row.source, authorityPair: row.authorityPair, end: row.nodeEnd, discrepancy: row.discrepancy, norm: row.discrepancyNorm })))}`);
console.log(`M050 explicit nodal primitives SUS/OPE: ${susNodal.length}/${opeNodal.length}`);
console.log(`M050 incident sum/reaction/nodal/residual: ${JSON.stringify({ incidentSum, reaction: reaction.discrepancy, nodalLoadDiscrepancy, residual, residualNorm })}`);
console.log(`M050 omitted incident contribution: ${JSON.stringify(omittedIncidentContribution)}`);
console.log(`M050 conclusion: ${report.disposition.conclusion}`);
