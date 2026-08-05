import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildPipingPortTopologyGraph } from '../src/core/piping-topology/index.js';
import {
  buildRestraintCapabilityModel,
  buildSupportAttachmentModel,
} from '../src/core/support-restraints/index.js';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import {
  buildCanonicalTopologyFromWorkspaceDataset,
} from '../src/workspace/topology-edit/topology-edit-source-adapter.js';

const SJSON_URL = new URL('../public/Sjson.json', import.meta.url);

async function loadProductionSjson() {
  const bytes = new Uint8Array(await readFile(SJSON_URL));
  const raw = JSON.parse(new TextDecoder().decode(bytes).replace(/^\uFEFF/u, ''));
  const dataset = normalizeWorkspaceDataset(raw, 'Sjson.json', {
    sourceBytes: bytes,
    sourceSha256: createHash('sha256').update(bytes).digest('hex'),
  });
  const graph = buildPipingPortTopologyGraph(dataset.sharedModel);
  const attachments = buildSupportAttachmentModel(dataset.sharedModel, graph);
  const restraints = buildRestraintCapabilityModel(attachments);
  const canonical = finalizeCanonicalTopology(
    buildCanonicalTopologyFromWorkspaceDataset(dataset, graph, attachments, restraints),
  );
  return { dataset, canonical };
}

function zeroLengthEdges(topology) {
  const nodes = new Map((topology.nodes || []).map((node) => [node.id, node]));
  return (topology.edges || []).flatMap((edge) => {
    const from = nodes.get(edge.fromNodeId)?.position;
    const to = nodes.get(edge.toNodeId)?.position;
    if (!from || !to) return [];
    const lengthMm = Math.hypot(
      Number(to.x) - Number(from.x),
      Number(to.y) - Number(from.y),
      Number(to.z) - Number(from.z),
    );
    return lengthMm > 0 ? [] : [{
      edgeId: edge.id,
      componentKey: edge.componentKey,
      entityType: edge.entityType,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      sourcePath: edge.sourcePath,
    }];
  });
}

function incidence(topology) {
  const result = new Map();
  for (const edge of topology.edges || []) {
    for (const nodeId of [edge.fromNodeId, edge.toNodeId]) {
      result.set(nodeId, (result.get(nodeId) || 0) + 1);
    }
  }
  return result;
}

test('production SJSON retains fourteen governed point components without blocking an unrelated edit', async () => {
  const { canonical } = await loadProductionSjson();
  const zeroLength = zeroLengthEdges(canonical);
  assert.equal(zeroLength.length, 14);
  assert.deepEqual(
    Object.fromEntries([...new Set(zeroLength.map((row) => row.entityType))]
      .sort()
      .map((entityType) => [
        entityType,
        zeroLength.filter((row) => row.entityType === entityType).length,
      ])),
    { FLANGE: 2, INSTRUMENT: 2, OLET: 10 },
  );

  const excludedNodes = new Set(zeroLength.flatMap((row) => [row.fromNodeId, row.toNodeId]));
  const degree = incidence(canonical);
  const safeNode = canonical.nodes.find((node) => (
    !excludedNodes.has(node.id) && degree.get(node.id) === 1
  ));
  assert.ok(safeNode, 'Production SJSON requires a terminal non-point-component node for edit qualification.');

  const session = new TopologyEditCertifiedSession(canonical);
  const beforeHash = session.currentTopology().canonicalTopologyHash;
  const transition = session.execute('MOVE_NODE', {
    nodeId: safeNode.id,
    position: {
      x: safeNode.position.x,
      y: safeNode.position.y,
      z: safeNode.position.z + 1,
    },
  });
  assert.equal(transition.disposition, 'ACCEPTED', transition.reason || 'production edit rejected');
  assert.equal(
    transition.certification.validationReport.warnings
      .filter((row) => row.code === 'INHERITED_EDGE_ZERO_LENGTH').length,
    14,
  );
  assert.equal(transition.certification.validationReport.errors.length, 0);
  assert.equal(session.journal.activeCommandIds.length, 1);
  assert.notEqual(session.currentTopology().canonicalTopologyHash, beforeHash);
});

test('baseline-aware validation still rejects a newly created zero-length edge', () => {
  const base = finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'zero-length-baseline',
    datasetVersion: 0,
    sourceHash: 'source:zero-length-baseline',
    topologyGraphHash: 'graph:zero-length-baseline',
    nodes: [
      { id: 'node:p1', position: { x: 0, y: 0, z: 0 }, portKeys: ['point:start'] },
      { id: 'node:p2', position: { x: 0, y: 0, z: 0 }, portKeys: ['point:end'] },
      { id: 'node:r1', position: { x: 100, y: 0, z: 0 }, portKeys: ['route:start'] },
      { id: 'node:r2', position: { x: 200, y: 0, z: 0 }, portKeys: ['route:end'] },
      { id: 'node:free', position: { x: 400, y: 0, z: 0 }, portKeys: [] },
    ],
    edges: [
      {
        id: 'edge:point', componentKey: 'point', fromNodeId: 'node:p1', toNodeId: 'node:p2',
        diameterMm: 100, entityType: 'INSTRUMENT', sourcePath: '/point',
      },
      {
        id: 'edge:route', componentKey: 'route', fromNodeId: 'node:r1', toNodeId: 'node:r2',
        diameterMm: 100, entityType: 'PIPE', sourcePath: '/route',
      },
    ],
    junctions: [], supports: [], boundaries: [], rigids: [],
  });

  const acceptedSession = new TopologyEditCertifiedSession(base);
  const accepted = acceptedSession.execute('MOVE_NODE', {
    nodeId: 'node:free', position: { x: 401, y: 0, z: 0 },
  });
  assert.equal(accepted.disposition, 'ACCEPTED');
  assert.equal(
    accepted.certification.validationReport.warnings[0]?.code,
    'INHERITED_EDGE_ZERO_LENGTH',
  );

  const rejectedSession = new TopologyEditCertifiedSession(base);
  const rejected = rejectedSession.execute('MOVE_NODE', {
    nodeId: 'node:r2', position: { x: 100, y: 0, z: 0 },
  });
  assert.equal(rejected.disposition, 'REJECTED');
  assert.match(rejected.reason, /EDGE_ZERO_LENGTH/);
});
