#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';

const NODE_ID = '20340';
const CASES = Object.freeze(['SUS', 'OPE', 'EXP']);
const OUTGOING_PAIR = '20340-20350';
const VECTOR_TOL = 1e-6;

function pairKey(entry) {
  return `${entry.sourceSegment.startNodeId}-${entry.sourceSegment.endNodeId}`;
}
function sourceSummary(entry) {
  return Object.freeze({
    sourceId: String(entry.sourceSegment.id),
    pairKey: pairKey(entry),
    type: entry.sourceSegment.type,
    fromNode: String(entry.sourceSegment.startNodeId),
    toNode: String(entry.sourceSegment.endNodeId),
    sourceComponentUid: entry.sourceSegment.sourceComponentUid ?? null,
    rigidAuthority: entry.rigidAuthority?.rigidElementId ?? null,
  });
}
function descendantSummary(entry) {
  return Object.freeze({
    sourceSegmentId: String(entry.sourceSegmentId),
    elementId: entry.elementId,
    analysisSegmentId: String(entry.segment.id),
    fromNode: String(entry.segment.startNodeId),
    toNode: String(entry.segment.endNodeId),
    analysisRole: entry.segment.meta?.analysisRole ?? null,
    componentId: entry.segment.meta?.componentId ?? entry.bendComponent?.componentId ?? null,
    componentElementIndex: entry.componentElementIndex,
  });
}
function forceVector(action) {
  return { x: action.fx, y: action.fy, z: action.fz };
}
function subtractVector(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function addVector(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function scaleVector(a, factor) {
  return { x: factor * a.x, y: factor * a.y, z: factor * a.z };
}
function norm(a) {
  return Math.hypot(a.x, a.y, a.z);
}
function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function point(geometry, nodeId) {
  const row = geometry.nodes.find((node) => String(node.id) === String(nodeId));
  if (!row) throw new Error(`M046 missing node ${nodeId}.`);
  return { x: row.x, y: row.y, z: row.z };
}
function tangent(geometry, fromNode, toNode) {
  const a = point(geometry, fromNode);
  const b = point(geometry, toNode);
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const length = norm(d);
  if (!(length > 0)) throw new Error(`M046 zero-length source pair ${fromNode}-${toNode}.`);
  return scaleVector(d, 1 / length);
}
function sourceGlobal(solved, recovery) {
  const recovered = new Map(recovery.elementActions.map((row) => [row.elementId, row]));
  const out = new Map();
  for (const source of solved.authorities.base.entries) {
    const sourceId = String(source.sourceSegment.id);
    const descendants = solved.authorities.entries.filter((entry) => entry.sourceSegmentId === sourceId);
    const first = recovered.get(descendants[0]?.elementId);
    const last = recovered.get(descendants.at(-1)?.elementId);
    if (!first || !last) throw new Error(`M046 missing recovered source actions for ${sourceId}.`);
    out.set(pairKey(source), Object.freeze({
      sourceId,
      I: forceVector(first.global.I),
      J: forceVector(last.global.J),
    }));
  }
  return out;
}
function sourceCaseGlobal(solved) {
  const sus = sourceGlobal(solved, solved.sustained.recovery);
  const ope = sourceGlobal(solved, solved.operating.recovery);
  const exp = new Map();
  for (const [key, hot] of ope) {
    const cold = sus.get(key);
    exp.set(key, Object.freeze({
      sourceId: hot.sourceId,
      I: subtractVector(hot.I, cold.I),
      J: subtractVector(hot.J, cold.J),
    }));
  }
  return new Map([['SUS', sus], ['OPE', ope], ['EXP', exp]]);
}
function ciiRowSummary(row) {
  return Object.freeze({
    fromNode: String(row.fromNode),
    toNode: String(row.toNode),
    I: row.I,
    J: row.J,
  });
}
function authorityMultiplicity(raw, pair) {
  return Object.fromEntries(CASES.map((label) => {
    const localRows = raw.localForce.get(label).byPair.get(pair) ?? [];
    const globalRows = raw.globalForce.get(label).byPair.get(pair) ?? [];
    return [label, Object.freeze({
      localRowCount: localRows.length,
      globalRowCount: globalRows.length,
      localRows: Object.freeze(localRows.map(ciiRowSummary)),
      globalRows: Object.freeze(globalRows.map(ciiRowSummary)),
    })];
  }));
}
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
function expansionReaction(solved, nodeId) {
  const sus = reactionMap(solved.sustained.execution).get(nodeId) ?? { x: 0, y: 0, z: 0 };
  const ope = reactionMap(solved.operating.execution).get(nodeId) ?? { x: 0, y: 0, z: 0 };
  return subtractVector(ope, sus);
}
function mappedCiiReaction(raw, label, nodeId) {
  const row = raw.restraint.get(label).get(nodeId);
  return row ? { x: -row.FX, y: -row.FY, z: -row.FZ } : { x: 0, y: 0, z: 0 };
}
function boundaryVectorAudit(solved, raw, actions, incomingPair, outgoingPair) {
  const incomingRows = raw.globalForce.get('EXP').byPair.get(incomingPair) ?? [];
  const outgoingRows = raw.globalForce.get('EXP').byPair.get(outgoingPair) ?? [];
  const oursOutgoing = actions.get('EXP').get(outgoingPair);
  assert.ok(oursOutgoing, `M046 missing LFEA EXP outgoing source action ${outgoingPair}.`);
  assert.equal(outgoingRows.length, 1, 'M046 governing outgoing straight pair must retain one-to-one CAESAR authority.');
  const outgoingDiscrepancy = subtractVector(oursOutgoing.I, forceVector(outgoingRows[0].I));
  const outgoingTangent = tangent(solved.authorities.sourceGeometry, NODE_ID, outgoingPair.split('-')[1]);
  const oursReaction = expansionReaction(solved, NODE_ID);
  const ciiReaction = mappedCiiReaction(raw, 'EXP', NODE_ID);
  const reactionDiscrepancy = subtractVector(oursReaction, ciiReaction);
  const result = {
    incomingAuthorityRowCount: incomingRows.length,
    outgoingAuthorityRowCount: outgoingRows.length,
    outgoingGlobalDiscrepancy: outgoingDiscrepancy,
    outgoingAxialProjection: dot(outgoingDiscrepancy, outgoingTangent),
    lfeaExpansionReaction: oursReaction,
    mappedCiiExpansionReaction: ciiReaction,
    reactionDiscrepancy,
    directBoundaryClosurePermitted: incomingRows.length === 1,
    incomingGlobalDiscrepancy: null,
    boundaryResidual: null,
    boundaryResidualNorm: null,
  };
  if (incomingRows.length === 1) {
    const oursIncoming = actions.get('EXP').get(incomingPair);
    assert.ok(oursIncoming, `M046 missing LFEA EXP incoming source action ${incomingPair}.`);
    const incomingDiscrepancy = subtractVector(oursIncoming.J, forceVector(incomingRows[0].J));
    const residual = subtractVector(addVector(incomingDiscrepancy, outgoingDiscrepancy), reactionDiscrepancy);
    result.incomingGlobalDiscrepancy = incomingDiscrepancy;
    result.boundaryResidual = residual;
    result.boundaryResidualNorm = norm(residual);
  }
  return Object.freeze(result);
}
function componentSummary(descendants) {
  const component = descendants.find((entry) => entry.bendComponent)?.bendComponent ?? null;
  if (!component) return null;
  const geometry = component.geometry ?? {};
  return Object.freeze({
    componentId: component.componentId,
    elementCount: component.elements?.length ?? 0,
    geometry: Object.freeze({
      radius: geometry.radius ?? geometry.centerlineRadius ?? null,
      bendAngle: geometry.bendAngle ?? geometry.bendAngleRadians ?? null,
      planeNormal: geometry.planeNormal ?? null,
      center: geometry.center ?? null,
      tangentIntersection: geometry.tangentIntersection ?? null,
    }),
  });
}

const solved = solveBm4M035M036Combined();
const raw = loadBm4CiiOutputCases1921();
const sourceEntries = solved.authorities.base.entries;
const incoming = sourceEntries.filter((entry) => String(entry.sourceSegment.endNodeId) === NODE_ID);
const outgoing = sourceEntries.filter((entry) => String(entry.sourceSegment.startNodeId) === NODE_ID);
assert.equal(incoming.length, 1, 'M046 requires exactly one source segment entering node 20340.');
assert.equal(outgoing.length, 1, 'M046 requires exactly one source segment leaving node 20340.');
assert.equal(pairKey(outgoing[0]), OUTGOING_PAIR, 'M046 governing outgoing source pair drifted.');

const incomingSummary = sourceSummary(incoming[0]);
const outgoingSummary = sourceSummary(outgoing[0]);
const incomingDescendants = solved.authorities.entries.filter((entry) => entry.sourceSegmentId === incomingSummary.sourceId);
const outgoingDescendants = solved.authorities.entries.filter((entry) => entry.sourceSegmentId === outgoingSummary.sourceId);
const predecessors = sourceEntries.filter((entry) => String(entry.sourceSegment.endNodeId) === incomingSummary.fromNode);
const actions = sourceCaseGlobal(solved);
const incomingAuthority = authorityMultiplicity(raw, incomingSummary.pairKey);
const outgoingAuthority = authorityMultiplicity(raw, outgoingSummary.pairKey);
const vectorAudit = boundaryVectorAudit(solved, raw, actions, incomingSummary.pairKey, outgoingSummary.pairKey);
const isBend = incomingSummary.type === 'BEND';
const multirowExpAuthority = incomingAuthority.EXP.globalRowCount !== 1 || incomingAuthority.EXP.localRowCount !== 1;
const classification = isBend
  ? (multirowExpAuthority ? 'BEND_WITH_NON_ONE_TO_ONE_CAESAR_STATION_AUTHORITY' : 'BEND_WITH_ONE_TO_ONE_CAESAR_END_AUTHORITY')
  : (multirowExpAuthority ? 'NON_BEND_WITH_NON_ONE_TO_ONE_CAESAR_AUTHORITY' : 'NON_BEND_ONE_TO_ONE_BOUNDARY');

assert.ok(incomingDescendants.length > 0, 'M046 incoming source segment must have analysis descendants.');
assert.ok(outgoingDescendants.length > 0, 'M046 outgoing source segment must have analysis descendants.');
assert.ok(Math.abs(vectorAudit.outgoingAxialProjection + 728.7263345223982) <= 1e-3,
  'M046 must reproduce the M045 governing EXP straight-section offset at node 20340.');
if (vectorAudit.directBoundaryClosurePermitted) {
  assert.ok(vectorAudit.boundaryResidualNorm <= VECTOR_TOL,
    'M046 one-to-one boundary vector equilibrium must close before mechanics attribution.');
}

const report = Object.freeze({
  schema: 'lfea-m046-bm4-20340-boundary-authority/v1',
  boundaryNode: NODE_ID,
  targetCase: Object.freeze({ label: 'EXP', number: 21, expression: 'L20-L19' }),
  sourceTopology: Object.freeze({
    incoming: incomingSummary,
    outgoing: outgoingSummary,
    predecessors: Object.freeze(predecessors.map(sourceSummary)),
    incomingAnalysisDescendants: Object.freeze(incomingDescendants.map(descendantSummary)),
    outgoingAnalysisDescendants: Object.freeze(outgoingDescendants.map(descendantSummary)),
    incomingBendComponent: componentSummary(incomingDescendants),
  }),
  caesarAuthority: Object.freeze({
    incomingPair: incomingAuthority,
    outgoingPair: outgoingAuthority,
    incomingExpOneToOne: incomingAuthority.EXP.globalRowCount === 1 && incomingAuthority.EXP.localRowCount === 1,
    outgoingExpOneToOne: outgoingAuthority.EXP.globalRowCount === 1 && outgoingAuthority.EXP.localRowCount === 1,
  }),
  boundaryVectorAudit: vectorAudit,
  disposition: Object.freeze({
    mechanicsChangedByM046: false,
    classification,
    bendMechanicsErrorConcluded: false,
    frictionCauseConcluded: false,
    pressureCauseConcluded: false,
    stationInterpolationPermitted: false,
    conclusion: multirowExpAuthority
      ? 'GOVERNING_EXP_SECTION_OFFSET_ENTERS_STRAIGHT_RUN_ACROSS_A_NON_ONE_TO_ONE_SOURCE_AUTHORITY_BOUNDARY'
      : 'GOVERNING_EXP_SECTION_OFFSET_BOUNDARY_HAS_ONE_TO_ONE_END_AUTHORITY_AND_FULL_VECTOR_EQUILIBRIUM_IS_AVAILABLE',
    nextRcaBoundary: multirowExpAuthority
      ? 'RESOLVE_CAESAR_INCOMING_COMPONENT_STATION_TO_SOURCE_END_ATTRIBUTION_BEFORE_MECHANICS_CLAIM'
      : 'TRACE_FULL_VECTOR_SECTION_DISCREPANCY_THROUGH_INCOMING_COMPONENT_TO_ITS_UPSTREAM_END',
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
console.log(`M046 boundary classification: ${classification}`);
console.log(`M046 source topology: ${JSON.stringify(report.sourceTopology)}`);
console.log(`M046 CII incoming authority multiplicity: ${JSON.stringify(Object.fromEntries(CASES.map((label) => [label, { local: incomingAuthority[label].localRowCount, global: incomingAuthority[label].globalRowCount }])))}`);
console.log(`M046 boundary vector audit: ${JSON.stringify(vectorAudit)}`);
console.log(`M046 conclusion: ${report.disposition.conclusion}`);
