import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { checkCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-checker.js';
import {
  assertTopologyEditIncrementalValidationReceipt,
  runTopologyEditIncrementalValidation,
} from '../src/workspace/topology-edit/professional/topology-edit-incremental-validation.js';
import {
  createTopologyEditOperationPlan,
} from '../src/workspace/topology-edit/professional/topology-edit-operation-plan.js';
import {
  planExtendEdge,
  planShortenEdge,
} from '../src/workspace/topology-edit/professional/topology-edit-route-operations.js';
import {
  compareTopologyEditDiagnostics,
  normalizeTopologyEditDiagnostics,
} from '../src/workspace/topology-edit/professional/topology-edit-validation-diagnostics.js';
import {
  projectTopologyEditValidationScope,
} from '../src/workspace/topology-edit/professional/topology-edit-validation-scope.js';

async function fixture() {
  const url = new URL('./fixtures/topology-edit/professional/large-edit-scope.json', import.meta.url);
  return JSON.parse(await readFile(url, 'utf8'));
}

function linearTopology(segmentCount, segmentLengthMm, hash) {
  const nodes = Array.from({ length: segmentCount + 1 }, (_, index) => ({
    id: nodeId(index),
    position: { x: index * segmentLengthMm, y: 0, z: 0 },
    portKeys: [],
  }));
  const edges = Array.from({ length: segmentCount }, (_, index) => ({
    id: edgeId(index),
    componentKey: `P-${String(index).padStart(4, '0')}`,
    fromNodeId: nodeId(index),
    toNodeId: nodeId(index + 1),
    diameterMm: 100,
    entityType: 'PIPE',
  }));
  return canonical(hash, nodes, edges);
}

function canonical(hash, nodes, edges) {
  return {
    schema: 'topology-edit-canonical-topology/v1',
    canonicalTopologyHash: hash,
    sourceHash: 'fnv1a64:source',
    nodes,
    edges,
    junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
    crosswalk: {
      nodeIdToPortKeys: {},
      edgeIdToComponentKey: Object.fromEntries(edges.map((edge) => [
        edge.id,
        edge.componentKey,
      ])),
      junctionIdToComponentKey: {},
      supportIdToEntityId: {},
    },
  };
}

function shortenedPostTopology(base, finalLengthMm) {
  const post = structuredClone(base);
  const finalEdge = post.edges.at(-1);
  const from = post.nodes.find((node) => node.id === finalEdge.fromNodeId);
  const to = post.nodes.find((node) => node.id === finalEdge.toNodeId);
  to.position.x = from.position.x + finalLengthMm;
  post.canonicalTopologyHash = 'fnv1a64:large-post';
  return post;
}

function clock(values) {
  let index = 0;
  return () => {
    assert.ok(index < values.length, 'clock sequence exhausted');
    const value = values[index];
    index += 1;
    return value;
  };
}

function checkerOptions(config) {
  return {
    shortElementThresholdMm: config.shortElementThresholdMm,
    snapGapToleranceMm: config.snapGapToleranceMm,
  };
}

test('validation scope contains exact changed records plus declared one-hop nodes', async () => {
  const config = await fixture();
  const base = linearTopology(
    config.segmentCount,
    config.segmentLengthMm,
    'fnv1a64:large-base',
  );
  const plan = planShortenEdge({
    topology: base,
    edgeId: edgeId(config.segmentCount - 1),
    endpoint: 'TO',
    distanceMm: config.segmentLengthMm - config.shortenedFinalLengthMm,
  });
  const projection = projectTopologyEditValidationScope(base, plan.changedScope);

  assert.deepEqual(projection.ids.edges, [edgeId(config.segmentCount - 1)]);
  assert.deepEqual(projection.ids.nodes, [
    nodeId(config.segmentCount - 1),
    nodeId(config.segmentCount),
  ]);
  assert.deepEqual(
    projection.canonical.edges.map((edge) => edge.id),
    projection.ids.edges,
  );
  assert.deepEqual(
    projection.canonical.nodes.map((node) => node.id),
    projection.ids.nodes,
  );
  assert.equal(Object.isFrozen(projection), true);
});

test('large scoped result is accepted only when exactly equivalent to full checker', async () => {
  const config = await fixture();
  const base = linearTopology(
    config.segmentCount,
    config.segmentLengthMm,
    'fnv1a64:large-base',
  );
  const plan = planShortenEdge({
    topology: base,
    edgeId: edgeId(config.segmentCount - 1),
    endpoint: 'TO',
    distanceMm: config.segmentLengthMm - config.shortenedFinalLengthMm,
  });
  const post = shortenedPostTopology(base, config.shortenedFinalLengthMm);
  const options = checkerOptions(config);
  const previous = checkCanonicalTopology(base, options);
  const full = checkCanonicalTopology(post, options);
  const receipt = runTopologyEditIncrementalValidation({
    canonicalTopology: post,
    operationPlan: plan,
    previousDiagnostics: previous,
    checkerOptions: options,
    performancePolicy: config.performancePolicy,
    now: clock([0, 0, 1, 1, 4, 4, 5, 5, 25, 25, 26, 30]),
  });

  assert.equal(receipt.status, 'INCREMENTAL_EQUIVALENT');
  assert.equal(receipt.equivalence, true);
  assert.equal(receipt.performanceEvidence.classification, 'FAST_PATH');
  assert.equal(receipt.performanceEvidence.incrementalPathMs, 5);
  assert.deepEqual(receipt.finalDiagnostics, full);
  assert.deepEqual(receipt.finalDiagnostics.map((row) => row.kind), ['SHORT_ELEMENT']);
  assert.equal(receipt.catalogueCompatibility.status, 'NOT_REQUIRED');
  assert.deepEqual(assertTopologyEditIncrementalValidationReceipt(receipt), receipt);
});

test('global issue missed by scope forces explicit full-check fallback', async () => {
  const base = canonical('fnv1a64:fallback-base', [
    { id: 'node:a', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
    { id: 'node:b', position: { x: 100, y: 0, z: 0 }, portKeys: [] },
    { id: 'node:x', position: { x: 130, y: 0, z: 0 }, portKeys: [] },
    { id: 'node:y', position: { x: 230, y: 0, z: 0 }, portKeys: [] },
  ], [
    { id: 'edge:main', componentKey: 'P-MAIN', fromNodeId: 'node:a', toNodeId: 'node:b', entityType: 'PIPE' },
    { id: 'edge:other', componentKey: 'P-OTHER', fromNodeId: 'node:x', toNodeId: 'node:y', entityType: 'PIPE' },
  ]);
  const plan = planExtendEdge({
    topology: base,
    edgeId: 'edge:main',
    endpoint: 'TO',
    distanceMm: 10,
  });
  const post = structuredClone(base);
  post.nodes.find((node) => node.id === 'node:b').position.x = 110;
  post.canonicalTopologyHash = 'fnv1a64:fallback-post';
  const options = { snapGapToleranceMm: 25 };
  const previous = checkCanonicalTopology(base, options);
  const full = checkCanonicalTopology(post, options);
  const receipt = runTopologyEditIncrementalValidation({
    canonicalTopology: post,
    operationPlan: plan,
    previousDiagnostics: previous,
    checkerOptions: options,
    performancePolicy: {
      fastPathBudgetMs: 60,
      warningBudgetMs: 100,
      hysteresisMs: 10,
    },
    now: clock([0, 0, 1, 1, 3, 3, 4, 4, 9, 9, 10, 12]),
  });

  assert.equal(receipt.status, 'FULL_FALLBACK');
  assert.equal(receipt.fallback.code, 'INCREMENTAL_FULL_MISMATCH');
  assert.equal(receipt.performanceEvidence.classification, 'FULL_FALLBACK');
  assert.deepEqual(receipt.finalDiagnostics, full);
  assert.ok(full.some((row) => row.kind === 'SNAP_GAP'));
});

test('diagnostic equivalence ignores time-only fields but preserves engineering identity', () => {
  const left = [{
    id: 'issue:SHORT_ELEMENT:edge:e1',
    kind: 'SHORT_ELEMENT',
    severity: 'MEDIUM',
    edgeId: 'edge:e1',
    nodeIds: ['node:b', 'node:a'],
    durationMs: 2,
    timings: { checkerMs: 1 },
  }];
  const right = [{
    id: 'issue:SHORT_ELEMENT:edge:e1',
    kind: 'SHORT_ELEMENT',
    severity: 'MEDIUM',
    edgeId: 'edge:e1',
    nodeIds: ['node:a', 'node:b'],
    durationMs: 200,
    timings: { checkerMs: 99 },
  }];

  assert.equal(compareTopologyEditDiagnostics(left, right).equivalent, true);
  assert.equal('durationMs' in normalizeTopologyEditDiagnostics(left)[0], false);
  assert.equal('timings' in normalizeTopologyEditDiagnostics(left)[0], false);
  assert.equal(compareTopologyEditDiagnostics(left, [{
    ...right[0], severity: 'HIGH',
  }]).equivalent, false);
});

test('performance thresholds classify measured fast-path evidence with hysteresis', async () => {
  const config = await fixture();
  const base = linearTopology(2, 100, 'fnv1a64:timing-base');
  const plan = planShortenEdge({
    topology: base,
    edgeId: 'edge:e0001',
    endpoint: 'TO',
    distanceMm: 10,
  });
  const receipt = runTopologyEditIncrementalValidation({
    canonicalTopology: { ...base, canonicalTopologyHash: 'fnv1a64:timing-post' },
    operationPlan: plan,
    previousDiagnostics: [],
    checker: () => [],
    performancePolicy: config.performancePolicy,
    now: clock([0, 0, 10, 10, 55, 55, 65, 65, 80, 80, 81, 90]),
  });
  assert.equal(receipt.status, 'INCREMENTAL_EQUIVALENT');
  assert.equal(receipt.performanceEvidence.incrementalPathMs, 65);
  assert.equal(
    receipt.performanceEvidence.classification,
    'FAST_PATH_HYSTERESIS',
  );
});

test('receipt carries compatible catalogue authority and rejects tampering', async () => {
  const config = await fixture();
  const base = linearTopology(1, 100, 'fnv1a64:catalogue-base');
  const rawPlan = planShortenEdge({
    topology: base,
    edgeId: 'edge:e0000',
    endpoint: 'TO',
    distanceMm: 10,
  });
  const plan = createTopologyEditOperationPlan({
    ...rawPlan,
    parameters: {
      ...rawPlan.parameters,
      catalogueCompatibility: {
        status: 'COMPATIBLE',
        catalogueHash: 'fnv1a64:catalogue',
        queryHash: 'fnv1a64:query',
        compatibilityHash: 'fnv1a64:compatibility',
        selectedRecordId: 'PIPE-DN100-SCH40-A',
      },
    },
  });
  const receipt = runTopologyEditIncrementalValidation({
    canonicalTopology: { ...base, canonicalTopologyHash: 'fnv1a64:catalogue-post' },
    operationPlan: plan,
    previousDiagnostics: [],
    checker: () => [],
    performancePolicy: config.performancePolicy,
    now: clock([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6]),
  });

  assert.equal(receipt.catalogueCompatibility.status, 'COMPATIBLE');
  assert.equal(
    receipt.catalogueCompatibility.selectedRecordId,
    'PIPE-DN100-SCH40-A',
  );
  assert.throws(() => assertTopologyEditIncrementalValidationReceipt({
    ...receipt,
    finalDiagnostics: [{ id: 'issue:tampered', kind: 'ORPHAN_NODE' }],
  }), /final diagnostics differ/i);
  assert.throws(() => assertTopologyEditIncrementalValidationReceipt({
    ...receipt,
    performanceEvidence: {
      ...receipt.performanceEvidence,
      timings: { ...receipt.performanceEvidence.timings, fullCheckerMs: -1 },
    },
  }), /must be non-negative/i);
});

function nodeId(index) { return `node:n${String(index).padStart(4, '0')}`; }
function edgeId(index) { return `edge:e${String(index).padStart(4, '0')}`; }
