#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';

const BASELINE_HEAD = '65acbd5ca6f13e431d913ae8b227148894171812';
const REPORT_DIR = fileURLToPath(new URL('../reports', import.meta.url));
const ATTRIBUTION_PATH = `${REPORT_DIR}/m035-m036-bm4-failure-attribution.json`;
const OUTPUT_PATH = `${REPORT_DIR}/m037-bm4-source-level-ope-audit.json`;
const ATTRIBUTION_SCRIPT = fileURLToPath(new URL('./lfea-m035-m036-bm4-failure-attribution.mjs', import.meta.url));
const MAX_SOURCE_DISTANCE = 2;

function ensureAttributionReport() {
  if (existsSync(ATTRIBUTION_PATH)) return;
  execFileSync(process.execPath, [ATTRIBUTION_SCRIPT], { stdio: 'inherit' });
}

function sourceGraph(geometry) {
  const graph = new Map(geometry.nodes.map((node) => [String(node.id), new Set()]));
  for (const segment of geometry.segments) {
    const i = String(segment.startNodeId);
    const j = String(segment.endNodeId);
    if (!graph.has(i)) graph.set(i, new Set());
    if (!graph.has(j)) graph.set(j, new Set());
    graph.get(i).add(j);
    graph.get(j).add(i);
  }
  return graph;
}

function distanceToSet(startNodes, targets, graph, limit = MAX_SOURCE_DISTANCE) {
  const queue = startNodes.map((node) => [String(node), 0]);
  const visited = new Set();
  while (queue.length > 0) {
    const [node, distance] = queue.shift();
    if (visited.has(node) || distance > limit) continue;
    visited.add(node);
    if (targets.has(node)) return distance;
    if (distance < limit) {
      for (const next of graph.get(node) ?? []) queue.push([next, distance + 1]);
    }
  }
  return null;
}

function touchedNodes(row) {
  if (row.family === 'displacement' || row.family === 'restraint') return [String(row.identifier)];
  return String(row.identifier).split('-').map(String);
}

function finiteNonzero(value) {
  return Number.isFinite(value) && Math.abs(value) > 0;
}

function activeVector(vector) {
  const values = [
    vector.force?.fx, vector.force?.fy, vector.force?.fz,
    vector.moment?.mx, vector.moment?.my, vector.moment?.mz,
  ];
  return values.some(finiteNonzero);
}

function forceMomentEvidence(entries) {
  const byNode = new Map();
  for (const entry of entries) {
    const groups = entry.sourceSegment.meta?.analysis?.forcesMoments ?? [];
    for (const group of groups) {
      const nodeId = String(group.nodeId ?? '');
      if (!nodeId) continue;
      const vectors = (group.vectors ?? []).filter(activeVector).map((vector) => Object.freeze({
        number: vector.number,
        force: vector.force,
        moment: vector.moment,
      }));
      if (vectors.length === 0) continue;
      if (!byNode.has(nodeId)) byNode.set(nodeId, []);
      byNode.get(nodeId).push(Object.freeze({
        sourceSegmentId: String(entry.sourceSegment.id),
        forceMomentNumber: group.forceMomentNumber,
        vectors: Object.freeze(vectors),
      }));
    }
  }
  return byNode;
}

function rigidEvidence(entries) {
  const pairs = [];
  const nodes = new Set();
  for (const entry of entries) {
    if (!entry.rigidAuthority) continue;
    const i = String(entry.sourceSegment.startNodeId);
    const j = String(entry.sourceSegment.endNodeId);
    pairs.push(`${i}-${j}`);
    nodes.add(i);
    nodes.add(j);
  }
  return { pairs: Object.freeze(pairs.sort()), nodes };
}

function bendEvidence(entries) {
  const nodes = new Set();
  for (const entry of entries) {
    if (entry.sourceSegment.type !== 'BEND') continue;
    nodes.add(String(entry.sourceSegment.startNodeId));
    nodes.add(String(entry.sourceSegment.endNodeId));
    const meta = entry.sourceSegment.meta ?? {};
    if (meta.bendStationNode1) nodes.add(String(meta.bendStationNode1));
    if (meta.bendStationNode2) nodes.add(String(meta.bendStationNode2));
  }
  return nodes;
}

function teeEvidence(graph) {
  return new Set([...graph].filter(([, neighbors]) => neighbors.size >= 3).map(([node]) => node));
}

function nearestForceMoment(nodes, forceMoments, graph) {
  const targetNodes = new Set(forceMoments.keys());
  const distance = distanceToSet(nodes, targetNodes, graph);
  if (distance === null) return null;
  const matching = [];
  for (const nodeId of targetNodes) {
    const nodeDistance = distanceToSet(nodes, new Set([nodeId]), graph);
    if (nodeDistance === distance) matching.push({ nodeId, groups: forceMoments.get(nodeId) });
  }
  return { distanceEdges: distance, nodes: matching };
}

function classifyCandidate({ row, graph, rigid, forceMoments, reducers, bends, tees }) {
  const nodes = touchedNodes(row);
  const rigidDistance = distanceToSet(nodes, rigid.nodes, graph);
  const forceMoment = nearestForceMoment(nodes, forceMoments, graph);
  const reducerDistance = distanceToSet(nodes, reducers, graph);
  const bendDistance = distanceToSet(nodes, bends, graph);
  const teeDistance = distanceToSet(nodes, tees, graph);

  let sourceCandidate = 'SOURCE_LEVEL_RESIDUAL_UNEXPLAINED';
  if (rigidDistance !== null && rigidDistance <= 1) {
    sourceCandidate = 'RIGID_CHAIN_SOURCE_OR_RESULT_SEMANTICS_CANDIDATE';
  } else if (forceMoment && forceMoment.distanceEdges <= 1) {
    sourceCandidate = 'RETAINED_FORCEMOMENT_CASE_AUTHORITY_MISSING';
  } else if (reducerDistance !== null) {
    sourceCandidate = 'REDUCER_SOURCE_EVIDENCE_ADJACENT';
  } else if (bendDistance !== null) {
    sourceCandidate = 'BEND_STATION_OR_SOURCE_SEMANTICS_CANDIDATE';
  } else if (teeDistance !== null) {
    sourceCandidate = 'TEE_JUNCTION_SOURCE_SEMANTICS_CANDIDATE';
  }

  return Object.freeze({
    ...row,
    sourceCandidate,
    sourceEvidence: Object.freeze({
      rigidDistanceEdges: rigidDistance,
      nearestRetainedForceMoment: forceMoment,
      reducerDistanceEdges: reducerDistance,
      bendDistanceEdges: bendDistance,
      teeDistanceEdges: teeDistance,
    }),
  });
}

function countBy(rows, key) {
  const result = {};
  for (const row of rows) result[row[key]] = (result[row[key]] ?? 0) + 1;
  return result;
}

ensureAttributionReport();
const attribution = JSON.parse(readFileSync(ATTRIBUTION_PATH, 'utf8'));
const solved = solveBm4M035M036Combined();
const entries = solved.authorities.base.entries;
const graph = sourceGraph(solved.authorities.sourceGeometry);
const rigid = rigidEvidence(entries);
const forceMoments = forceMomentEvidence(entries);
const reducers = new Set((attribution.evidence?.reducerNodes ?? []).map(String));
const bends = bendEvidence(entries);
const tees = teeEvidence(graph);

const unexplainedOpe = attribution.matchedFailures.filter((row) => (
  row.caseLabel === 'OPE' && row.primaryCategory === 'UNEXPLAINED_MATCHED'
));
assert.equal(
  unexplainedOpe.length,
  attribution.summary.genuinelyUnexplainedMatchedRows,
  'Final #840 unexplained matched inventory must be entirely OPE before M037 source audit.',
);

const audited = unexplainedOpe.map((row) => classifyCandidate({
  row, graph, rigid, forceMoments, reducers, bends, tees,
}));
const counts = countBy(audited, 'sourceCandidate');
const trulyResidual = audited.filter((row) => row.sourceCandidate === 'SOURCE_LEVEL_RESIDUAL_UNEXPLAINED');

const sourceForceMomentGroups = [...forceMoments.entries()].flatMap(([nodeId, groups]) => (
  groups.map((group) => ({ nodeId, ...group }))
));
const node20690 = forceMoments.get('20690') ?? [];
assert.ok(sourceForceMomentGroups.length > 0, 'BM4 must retain at least one nonzero FORCESMOMENTS group.');
assert.ok(
  node20690.some((group) => group.vectors.some((vector) => vector.number === 1)),
  'BM4 source audit expects retained vector 1 at node 20690.',
);

const operatingForceMomentPrimitives = solved.operating.loadCase.primitives
  .filter((primitive) => primitive.kind === 'NODAL_FORCE_MOMENT');
assert.equal(
  operatingForceMomentPrimitives.length,
  0,
  'Current #840 OPE authority must not silently apply retained FORCESMOMENTS.',
);
assert.ok(
  (counts.RIGID_CHAIN_SOURCE_OR_RESULT_SEMANTICS_CANDIDATE ?? 0) > 0,
  'Source audit must identify rigid-chain candidates among the previously unexplained OPE rows.',
);
assert.ok(
  trulyResidual.length < unexplainedOpe.length,
  'Source audit must narrow the unexplained OPE inventory without changing mechanics.',
);

const report = Object.freeze({
  schema: 'm037-bm4-source-level-ope-audit/v1',
  baselineHead: BASELINE_HEAD,
  mechanicsChanged: false,
  sourceAuthority: Object.freeze({
    retainedNonzeroForceMomentGroups: sourceForceMomentGroups,
    operatingNodalForceMomentPrimitiveCount: operatingForceMomentPrimitives.length,
    caseMembershipStatus: 'UNRESOLVED_NOT_SERIALIZED_IN_CURRENT_BM4_INPUTXML_OR_CASE19_21_OUTPUT_PARSER',
    limitationCode: 'BM4_FORCE_MOMENT_CASE_MEMBERSHIP_UNRESOLVED',
    policy: 'DO_NOT_ACTIVATE_A_VECTOR_FROM_OUTPUT_FIT; REQUIRE_INDEPENDENT_CASE_DEFINITION_EVIDENCE',
  }),
  evidenceBoundaries: Object.freeze({
    rigidElementPairs: rigid.pairs,
    reducerNodes: Object.freeze([...reducers].sort()),
    bendEvidenceNodes: Object.freeze([...bends].sort()),
    teeNodes: Object.freeze([...tees].sort()),
  }),
  summary: Object.freeze({
    previouslyUnexplainedOpeRows: unexplainedOpe.length,
    sourceCandidateCounts: counts,
    remainingSourceLevelResidualRows: trulyResidual.length,
  }),
  topSourceLevelResiduals: Object.freeze(
    [...trulyResidual].sort((a, b) => b.normalizedSeverity - a.normalizedSeverity).slice(0, 100),
  ),
  auditedPreviouslyUnexplainedOpeRows: Object.freeze(audited),
});

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));
console.log(`M037 source-level OPE audit PASS; evidence written to ${OUTPUT_PATH}`);
