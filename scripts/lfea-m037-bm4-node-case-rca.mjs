#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';

const REPORT_DIR = fileURLToPath(new URL('../reports', import.meta.url));
const ATTRIBUTION_PATH = `${REPORT_DIR}/m035-m036-bm4-failure-attribution.json`;
const SOURCE_AUDIT_PATH = `${REPORT_DIR}/m037-bm4-source-level-ope-audit.json`;
const OUTPUT_PATH = `${REPORT_DIR}/m037-bm4-node-case-rca.json`;
const CASES = Object.freeze(['SUS', 'OPE', 'EXP']);
const FRICTION_DISTANCE_LIMIT = 2;

function rowKey(row) {
  return `${row.caseLabel}|${row.family}|${row.identifier}|${row.end ?? ''}|${row.field}`;
}

function touchedNodes(row) {
  if (row.family === 'displacement' || row.family === 'restraint') return [String(row.identifier)];
  return String(row.identifier).split('-').map(String);
}

function sourceGraph(geometry) {
  const graph = new Map(geometry.nodes.map((node) => [String(node.id), new Set()]));
  for (const segment of geometry.segments) {
    const i = String(segment.startNodeId);
    const j = String(segment.endNodeId);
    graph.get(i)?.add(j);
    graph.get(j)?.add(i);
  }
  return graph;
}

function distanceToNode(startNodes, target, graph, limit = FRICTION_DISTANCE_LIMIT) {
  const queue = startNodes.map((node) => [String(node), 0]);
  const visited = new Set();
  while (queue.length > 0) {
    const [node, distance] = queue.shift();
    if (visited.has(node) || distance > limit) continue;
    visited.add(node);
    if (node === target) return distance;
    if (distance < limit) for (const next of graph.get(node) ?? []) queue.push([next, distance + 1]);
  }
  return null;
}

function reactionUy(execution, sourceNodeId) {
  return execution.reactions.find((row) => (
    row.nodeId === `BM4M035.N${sourceNodeId}` && row.dof === 'UY'
  ))?.value ?? 0;
}

function frictionSupports(geometry, execution) {
  const result = [];
  for (const node of geometry.nodes) {
    const frictionRows = (node.meta?.restraints ?? []).filter((row) => (
      row.typeCode === '14' && Number.isFinite(row.frictionCoefficient) && row.frictionCoefficient > 0
    ));
    if (frictionRows.length === 0) continue;
    const mu = Math.max(...frictionRows.map((row) => row.frictionCoefficient));
    const normalReactionUy = reactionUy(execution, node.id);
    result.push(Object.freeze({
      nodeId: String(node.id),
      mu,
      normalReactionUy,
      engagedByReaction: normalReactionUy > 1,
      coulombCapacity: mu * Math.max(normalReactionUy, 0),
    }));
  }
  return Object.freeze(result.sort((a, b) => a.nodeId.localeCompare(b.nodeId, 'en')));
}

function nearestFriction(row, supports, graph) {
  const nodes = touchedNodes(row);
  let best = null;
  for (const support of supports) {
    const distanceEdges = distanceToNode(nodes, support.nodeId, graph);
    if (distanceEdges === null) continue;
    if (best === null || distanceEdges < best.distanceEdges) best = { distanceEdges, supports: [support] };
    else if (distanceEdges === best.distanceEdges) best.supports.push(support);
  }
  return best;
}

function countBy(rows, selector) {
  const result = {};
  for (const row of rows) {
    const key = selector(row);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function refinedCategory(row, sourceByKey, friction, graph) {
  const source = sourceByKey.get(rowKey(row));
  const sourceCategory = source?.sourceCandidate ?? row.primaryCategory;
  if (!['SOURCE_LEVEL_RESIDUAL_UNEXPLAINED', 'FRICTION_SOURCE_EVIDENCE_ADJACENT'].includes(sourceCategory)) {
    return sourceCategory;
  }
  const nearest = nearestFriction(row, friction, graph);
  if (nearest?.supports.some((support) => support.engagedByReaction)) return 'FRICTION_NOT_MODELED_CANDIDATE';
  return sourceCategory;
}

function nodeSummary(rows, categoryOf) {
  const byNode = new Map();
  for (const row of rows) {
    for (const nodeId of touchedNodes(row)) {
      if (!byNode.has(nodeId)) byNode.set(nodeId, []);
      byNode.get(nodeId).push(row);
    }
  }
  return [...byNode].map(([nodeId, nodeRows]) => {
    const worst = [...nodeRows].sort((a, b) => b.normalizedSeverity - a.normalizedSeverity)[0];
    return Object.freeze({
      nodeId,
      failedRowsTouchingNode: nodeRows.length,
      categoryCounts: countBy(nodeRows, categoryOf),
      familyCounts: countBy(nodeRows, (row) => row.family),
      worst: Object.freeze({
        family: worst.family,
        identifier: worst.identifier,
        end: worst.end,
        field: worst.field,
        percentDifference: worst.percentDifference,
        absoluteDifference: worst.absoluteDifference,
        normalizedSeverity: worst.normalizedSeverity,
        category: categoryOf(worst),
      }),
    });
  }).sort((a, b) => (
    b.failedRowsTouchingNode - a.failedRowsTouchingNode
    || b.worst.normalizedSeverity - a.worst.normalizedSeverity
    || a.nodeId.localeCompare(b.nodeId, 'en')
  ));
}

const attribution = JSON.parse(readFileSync(ATTRIBUTION_PATH, 'utf8'));
const sourceAudit = JSON.parse(readFileSync(SOURCE_AUDIT_PATH, 'utf8'));
const solved = solveBm4M035M036Combined();
const graph = sourceGraph(solved.authorities.sourceGeometry);
const friction = frictionSupports(solved.authorities.sourceGeometry, solved.operating.execution);
const sourceByKey = new Map(sourceAudit.auditedPreviouslyUnexplainedOpeRows.map((row) => [rowKey(row), row]));
const categoryOf = (row) => refinedCategory(row, sourceByKey, friction, graph);
const rowsByCase = new Map(CASES.map((caseLabel) => [
  caseLabel,
  attribution.matchedFailures.filter((row) => row.caseLabel === caseLabel),
]));
const matchedRowsPerCase = attribution.summary.matchedRows / CASES.length;
assert.equal(Number.isInteger(matchedRowsPerCase), true, 'BM4 matched rows must divide evenly across CASE 19/20/21.');

const cases = {};
for (const caseLabel of CASES) {
  const failures = rowsByCase.get(caseLabel);
  cases[caseLabel] = Object.freeze({
    matchedRows: matchedRowsPerCase,
    failed5pct: failures.length,
    passed5pct: matchedRowsPerCase - failures.length,
    passRate5pct: (matchedRowsPerCase - failures.length) / matchedRowsPerCase,
    categoryCounts: countBy(failures, categoryOf),
    familyCounts: countBy(failures, (row) => row.family),
    topNodes: Object.freeze(nodeSummary(failures, categoryOf).slice(0, 25)),
  });
}

const frictionSourceRows = sourceAudit.auditedPreviouslyUnexplainedOpeRows.filter((row) => (
  row.sourceCandidate === 'FRICTION_SOURCE_EVIDENCE_ADJACENT'
  || row.sourceCandidate === 'SOURCE_LEVEL_RESIDUAL_UNEXPLAINED'
));
const frictionCandidates = frictionSourceRows.map((row) => {
  const nearest = nearestFriction(row, friction, graph);
  const maxCapacity = Math.max(0, ...(nearest?.supports ?? []).map((support) => support.coulombCapacity));
  const forceLike = row.family === 'globalForce' || row.family === 'localForce' || row.family === 'restraint';
  return Object.freeze({
    row: Object.freeze({
      family: row.family, identifier: row.identifier, end: row.end, field: row.field,
      ours: row.ours, cii: row.cii, absoluteDifference: row.absoluteDifference,
      percentDifference: row.percentDifference, normalizedSeverity: row.normalizedSeverity,
    }),
    nearestFrictionSupport: nearest,
    forceResidualToMaxCoulombCapacityRatio: forceLike && maxCapacity > 0
      ? Math.abs(row.absoluteDifference) / maxCapacity
      : null,
    finalCandidate: nearest?.supports.some((support) => support.engagedByReaction)
      ? 'FRICTION_NOT_MODELED_CANDIDATE'
      : 'FRICTION_SOURCE_EVIDENCE_ONLY',
  });
});

const frictionCandidateCounts = countBy(frictionCandidates, (row) => row.finalCandidate);
const node21470Sus = attribution.matchedFailures.find((row) => (
  row.caseLabel === 'SUS' && row.family === 'restraint' && String(row.identifier) === '21470' && row.field === 'UY'
));
assert.ok(node21470Sus, 'CASE 19 RCA must retain the known node 21470 UY contact mismatch.');
assert.ok(friction.length > 0, 'BM4 source must retain frictional +Y supports.');
assert.ok(
  (frictionCandidateCounts.FRICTION_NOT_MODELED_CANDIDATE ?? 0) > 0,
  'Node-level RCA must identify at least one engaged friction-support candidate among friction-source OPE rows.',
);

const report = Object.freeze({
  schema: 'm037-bm4-node-case-rca/v2',
  benchmarkHead: solved.operating.execution.modelReference?.modelSemanticHash ?? null,
  cases: Object.freeze(cases),
  case19ContactHistoryAnchor: Object.freeze({
    nodeId: '21470',
    oursReactionUy: node21470Sus.ours,
    caesarReactionUy: node21470Sus.cii,
    absoluteDifference: node21470Sus.absoluteDifference,
    interpretation: 'LFEA SUS keeps +Y contact engaged while CAESAR CASE 19 reports separation; EXP inherits this SUS-state discrepancy because EXP=OPE-SUS.',
  }),
  frictionAuthority: Object.freeze({
    sourceCoefficientPresent: true,
    modeledByM036: false,
    limitationCode: 'BM4_FRICTION_NOT_MODELED',
    operatingSupports: friction,
  }),
  frictionSourceOpeRows: frictionSourceRows.length,
  frictionCandidates: Object.freeze(frictionCandidates),
  frictionCandidateCounts: Object.freeze(frictionCandidateCounts),
});

writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  casePassRates5pct: Object.fromEntries(CASES.map((caseLabel) => [caseLabel, cases[caseLabel].passRate5pct])),
  frictionCandidateCounts,
  node21470SusReactionUy: { ours: node21470Sus.ours, cii: node21470Sus.cii },
}, null, 2));
console.log(`M037 node-level case RCA PASS; evidence written to ${OUTPUT_PATH}`);
