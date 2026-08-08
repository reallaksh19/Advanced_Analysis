#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';

const TARGET_SOURCE_ID = 'IX-S21';
const FORCE_TOL = 0.05;
const MATERIAL_TOL = 5;

function pairKey(entry) { return `${entry.sourceSegment.startNodeId}-${entry.sourceSegment.endNodeId}`; }
function v(action) { return { x: action.fx, y: action.fy, z: action.fz }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function norm(a) { return Math.hypot(a.x, a.y, a.z); }
function zero() { return { x: 0, y: 0, z: 0 }; }
function recovered(recovery) { return new Map(recovery.elementActions.map((row) => [row.elementId, row])); }
function sourceSummary(entry) {
  return Object.freeze({ sourceId: String(entry.sourceSegment.id), pair: pairKey(entry), type: entry.sourceSegment.type,
    fromNode: String(entry.sourceSegment.startNodeId), toNode: String(entry.sourceSegment.endNodeId),
    sourceComponentUid: entry.sourceSegment.sourceComponentUid ?? null });
}
function sourceExpansionEnds(solved, entry) {
  const sourceId = String(entry.sourceSegment.id);
  const descendants = solved.authorities.entries.filter((row) => row.sourceSegmentId === sourceId);
  assert.ok(descendants.length > 0, `M053 missing descendants for ${sourceId}.`);
  const sus = recovered(solved.sustained.recovery);
  const ope = recovered(solved.operating.recovery);
  const firstS = sus.get(descendants[0].elementId);
  const firstO = ope.get(descendants[0].elementId);
  const lastS = sus.get(descendants.at(-1).elementId);
  const lastO = ope.get(descendants.at(-1).elementId);
  assert.ok(firstS && firstO && lastS && lastO, `M053 missing recovery for ${sourceId}.`);
  return Object.freeze({ I: sub(v(firstO.global.I), v(firstS.global.I)), J: sub(v(lastO.global.J), v(lastS.global.J)) });
}
function ciiIncidence(raw, nodeId) {
  const out = [];
  for (const [reportedPair, rows] of raw.globalForce.get('EXP').byPair) rows.forEach((row, index) => {
    if (String(row.fromNode) !== nodeId && String(row.toNode) !== nodeId) return;
    out.push(Object.freeze({ id: `${reportedPair}#${index}`, reportedPair, row }));
  });
  return out;
}
function physicalEnd(row, nodeId) {
  if (String(row.fromNode) === nodeId) return Object.freeze({ end: 'I', action: v(row.I) });
  if (String(row.toNode) === nodeId) return Object.freeze({ end: 'J', action: v(row.J) });
  throw new Error(`M053 row ${row.fromNode}-${row.toNode} does not touch ${nodeId}.`);
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
function reactionDiscrepancy(raw, solved, nodeId) {
  const sus = reactionMap(solved.sustained.execution).get(nodeId) ?? zero();
  const ope = reactionMap(solved.operating.execution).get(nodeId) ?? zero();
  const lfea = sub(ope, sus);
  const row = raw.restraint.get('EXP').get(nodeId);
  const mappedCii = row ? { x: -row.FX, y: -row.FY, z: -row.FZ } : zero();
  return Object.freeze({ lfea, mappedCii, discrepancy: sub(lfea, mappedCii), discrepancyNorm: norm(sub(lfea, mappedCii)) });
}
function nodalForceMap(analysis) {
  const out = new Map();
  for (const row of analysis.loadCase.primitives) {
    if (row.kind !== 'NODAL_FORCE_MOMENT') continue;
    const nodeId = String(row.nodeId).replace(/^BM4M035\.N/u, '');
    if (!out.has(nodeId)) out.set(nodeId, zero());
    out.set(nodeId, add(out.get(nodeId), { x: row.force.fx, y: row.force.fy, z: row.force.fz }));
  }
  return out;
}
function nodalLoadDiscrepancy(solved, nodeId) {
  const sus = nodalForceMap(solved.sustained).get(nodeId) ?? zero();
  const ope = nodalForceMap(solved.operating).get(nodeId) ?? zero();
  return sub(ope, sus);
}
function componentSources(sourceEntries, targetId) {
  const byNode = new Map();
  for (const entry of sourceEntries) for (const nodeId of [String(entry.sourceSegment.startNodeId), String(entry.sourceSegment.endNodeId)]) {
    if (!byNode.has(nodeId)) byNode.set(nodeId, []);
    byNode.get(nodeId).push(entry);
  }
  const target = sourceEntries.find((entry) => String(entry.sourceSegment.id) === targetId);
  assert.ok(target, `M053 missing target ${targetId}.`);
  const queue = [String(target.sourceSegment.startNodeId), String(target.sourceSegment.endNodeId)];
  const nodes = new Set();
  const sources = new Set();
  while (queue.length) {
    const nodeId = queue.shift();
    if (nodes.has(nodeId)) continue;
    nodes.add(nodeId);
    for (const entry of byNode.get(nodeId) ?? []) {
      const sourceId = String(entry.sourceSegment.id);
      if (sources.has(sourceId)) continue;
      sources.add(sourceId);
      queue.push(String(entry.sourceSegment.startNodeId), String(entry.sourceSegment.endNodeId));
    }
  }
  return Object.freeze({ nodes, sources, byNode });
}
function mapNode(raw, solved, nodeId, incidents, sourceEnds) {
  const cii = ciiIncidence(raw, nodeId);
  const mappings = [];
  const usedSources = new Set();
  const usedCii = new Set();
  for (const entry of incidents) {
    const sourceId = String(entry.sourceSegment.id);
    const key = pairKey(entry);
    const rows = raw.globalForce.get('EXP').byPair.get(key) ?? [];
    if (rows.length !== 1) continue;
    const candidate = cii.find((row) => row.reportedPair === key && row.row === rows[0]);
    if (!candidate) continue;
    mappings.push({ sourceId, entry, cii: candidate, method: 'CANONICAL_PAIR' });
    usedSources.add(sourceId);
    usedCii.add(candidate.id);
  }
  const sourceRemaining = incidents.filter((entry) => !usedSources.has(String(entry.sourceSegment.id)));
  const ciiRemaining = cii.filter((row) => !usedCii.has(row.id));
  if (sourceRemaining.length === 1 && ciiRemaining.length === 1) {
    mappings.push({ sourceId: String(sourceRemaining[0].sourceSegment.id), entry: sourceRemaining[0], cii: ciiRemaining[0], method: 'UNIQUE_RESIDUAL_INCIDENCE' });
    usedSources.add(String(sourceRemaining[0].sourceSegment.id));
    usedCii.add(ciiRemaining[0].id);
  }
  const mapped = mappings.map((mapping) => {
    const summary = sourceSummary(mapping.entry);
    const end = summary.fromNode === nodeId ? 'I' : 'J';
    const lfea = sourceEnds.get(mapping.sourceId)[end];
    const ciiEnd = physicalEnd(mapping.cii.row, nodeId);
    const discrepancy = sub(lfea, ciiEnd.action);
    return Object.freeze({ source: summary, method: mapping.method, caesarReportedPair: mapping.cii.reportedPair,
      lfeaEnd: end, caesarEnd: ciiEnd.end, discrepancy, discrepancyNorm: norm(discrepancy) });
  });
  const complete = usedSources.size === incidents.length && usedCii.size === cii.length;
  const reaction = reactionDiscrepancy(raw, solved, nodeId);
  const nodalLoad = nodalLoadDiscrepancy(solved, nodeId);
  const incidentSum = mapped.reduce((sum, row) => add(sum, row.discrepancy), zero());
  const residual = complete ? sub(sub(incidentSum, reaction.discrepancy), nodalLoad) : null;
  return Object.freeze({ nodeId, sourceDegree: incidents.length, caesarDegree: cii.length, complete,
    mappings: Object.freeze(mapped), unresolvedSourceIds: Object.freeze(sourceRemaining.filter((entry) => !usedSources.has(String(entry.sourceSegment.id))).map((entry) => String(entry.sourceSegment.id))),
    unmatchedCaesarPairs: Object.freeze(ciiRemaining.filter((row) => !usedCii.has(row.id)).map((row) => row.reportedPair)),
    reaction, nodalLoadDiscrepancy: nodalLoad, incidentEndDiscrepancySum: incidentSum,
    residual, residualNorm: residual ? norm(residual) : null, closed: residual ? norm(residual) <= FORCE_TOL : false });
}
function strongest(rows, field) {
  return [...rows].filter((row) => Number.isFinite(row[field])).sort((a, b) => Math.abs(b[field]) - Math.abs(a[field]) || String(a.nodeId ?? a.sourceId).localeCompare(String(b.nodeId ?? b.sourceId)))[0] ?? null;
}

const solved = solveBm4M035M036Combined();
const raw = loadBm4CiiOutputCases1921();
const sourceEntries = solved.authorities.base.entries;
const component = componentSources(sourceEntries, TARGET_SOURCE_ID);
const componentEntries = sourceEntries.filter((entry) => component.sources.has(String(entry.sourceSegment.id)));
const sourceEnds = new Map(componentEntries.map((entry) => [String(entry.sourceSegment.id), sourceExpansionEnds(solved, entry)]));
const nodes = [...component.nodes].sort((a, b) => Number(a) - Number(b));
const nodeRows = nodes.map((nodeId) => mapNode(raw, solved, nodeId, component.byNode.get(nodeId) ?? [], sourceEnds));
const mappingBySourceNode = new Map();
for (const node of nodeRows) for (const mapping of node.mappings) mappingBySourceNode.set(`${mapping.source.sourceId}:${node.nodeId}`, mapping);
const edgeRows = componentEntries.map((entry) => {
  const summary = sourceSummary(entry);
  const from = mappingBySourceNode.get(`${summary.sourceId}:${summary.fromNode}`);
  const to = mappingBySourceNode.get(`${summary.sourceId}:${summary.toNode}`);
  if (!from || !to) return Object.freeze({ ...summary, complete: false, endSumDiscrepancy: null, endSumDiscrepancyNorm: null, closed: false });
  const endSum = add(from.discrepancy, to.discrepancy);
  return Object.freeze({ ...summary, complete: true, endSumDiscrepancy: endSum, endSumDiscrepancyNorm: norm(endSum), closed: norm(endSum) <= FORCE_TOL });
});
const completeNodes = nodeRows.filter((row) => row.complete);
const unresolvedNodes = nodeRows.filter((row) => !row.complete);
const nodeFailures = completeNodes.filter((row) => !row.closed);
const completeEdges = edgeRows.filter((row) => row.complete);
const unresolvedEdges = edgeRows.filter((row) => !row.complete);
const edgeFailures = completeEdges.filter((row) => !row.closed);
const materialReactionNodes = completeNodes.filter((row) => row.reaction.discrepancyNorm > MATERIAL_TOL);
const materialNodalLoadNodes = completeNodes.filter((row) => norm(row.nodalLoadDiscrepancy) > MATERIAL_TOL);
const tee20295 = nodeRows.find((row) => row.nodeId === '20295');
assert.ok(tee20295?.complete && tee20295.closed, 'M053 must reproduce M052 node-20295 incidence mapping and free-body closure.');
assert.ok(tee20295.mappings.some((row) => row.source.sourceId === 'IX-S36' && row.method === 'UNIQUE_RESIDUAL_INCIDENCE'), 'M053 must preserve M052 branch mapping method.');
const target = edgeRows.find((row) => row.sourceId === TARGET_SOURCE_ID);
assert.ok(target?.complete, 'M053 governing target source must have mapped endpoint authority.');

const graphFullyQualified = unresolvedNodes.length === 0 && unresolvedEdges.length === 0 && nodeFailures.length === 0 && edgeFailures.length === 0;
const conclusion = graphFullyQualified
  ? 'EXP_FORCE_DISCREPANCY_FIELD_IS_GLOBALLY_SELF_EQUILIBRATED_ON_THE_CONNECTED_SOURCE_GRAPH'
  : unresolvedNodes.length || unresolvedEdges.length
    ? 'EXP_FORCE_DISCREPANCY_GRAPH_AUTHORITY_IS_INCOMPLETE'
    : 'EXP_FORCE_DISCREPANCY_GRAPH_HAS_NONCONSERVATIVE_RESIDUALS';
const next = graphFullyQualified
  ? 'MOVE_FROM_FORCE_EQUILIBRIUM_TO_AXIAL_COMPATIBILITY_FREE_STRAIN_AND_EA_STIFFNESS_RCA'
  : unresolvedNodes.length || unresolvedEdges.length
    ? 'RESOLVE_FIRST_UNMAPPED_SOURCE_NODE_INCIDENCE_WITHOUT_FORCE_FIT_OR_INTERPOLATION'
    : 'AUDIT_FIRST_NONCLOSING_NODE_OR_SOURCE_FOR_MISSING_EXTERNAL_EXP_FORCE_TERM';
const report = Object.freeze({
  schema: 'lfea-m053-bm4-exp-discrepancy-graph/v1', targetSourceId: TARGET_SOURCE_ID,
  policy: Object.freeze({ forceClosureToleranceN: FORCE_TOL, materialExternalTermThresholdN: MATERIAL_TOL,
    mapping: 'CANONICAL_PAIR_THEN_SINGLE_REMAINING_BIJECTIVE_NODE_INCIDENCE', forceFitUsed: false, stationInterpolationUsed: false }),
  graph: Object.freeze({ sourceCount: componentEntries.length, sourceNodeCount: nodes.length,
    completeNodeCount: completeNodes.length, unresolvedNodeCount: unresolvedNodes.length, nodeFailureCount: nodeFailures.length,
    completeEdgeCount: completeEdges.length, unresolvedEdgeCount: unresolvedEdges.length, edgeFailureCount: edgeFailures.length }),
  targetSource: target,
  tee20295,
  materialExternalTerms: Object.freeze({ reactionNodes: Object.freeze(materialReactionNodes), nodalLoadNodes: Object.freeze(materialNodalLoadNodes) }),
  strongestResiduals: Object.freeze({ node: strongest(completeNodes, 'residualNorm'), edge: strongest(completeEdges, 'endSumDiscrepancyNorm') }),
  unresolvedNodes: Object.freeze(unresolvedNodes), unresolvedEdges: Object.freeze(unresolvedEdges),
  nodeFailures: Object.freeze(nodeFailures), edgeFailures: Object.freeze(edgeFailures),
  disposition: Object.freeze({ mechanicsChangedByM053: false, forceFitUsed: false, stationInterpolationUsed: false,
    globallySelfEquilibrated: graphFullyQualified, missingExternalForceCauseConcluded: false,
    frictionCauseConcluded: false, pressureOrBourdonCauseConcluded: false, conclusion, nextRcaBoundary: next }),
});

const arg = process.argv.indexOf('--report');
if (arg >= 0) {
  const requested = process.argv[arg + 1];
  if (!requested) throw new Error('--report requires a path.');
  const path = resolve(requested);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(`M053 graph coverage: ${JSON.stringify(report.graph)}`);
console.log(`M053 target source: ${JSON.stringify(target)}`);
console.log(`M053 tee20295 residual: ${tee20295.residualNorm}; branch=${JSON.stringify(tee20295.mappings.find((row) => row.source.sourceId === 'IX-S36'))}`);
console.log(`M053 material reaction/nodal-load nodes: ${materialReactionNodes.length}/${materialNodalLoadNodes.length}`);
console.log(`M053 strongest residuals: ${JSON.stringify(report.strongestResiduals)}`);
console.log(`M053 unresolved nodes: ${JSON.stringify(unresolvedNodes.map((row) => ({ nodeId: row.nodeId, sourceDegree: row.sourceDegree, caesarDegree: row.caesarDegree, unresolvedSourceIds: row.unresolvedSourceIds, unmatchedCaesarPairs: row.unmatchedCaesarPairs })))}`);
console.log(`M053 conclusion: ${conclusion}; next=${next}`);
