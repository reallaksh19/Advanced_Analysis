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

test('production SJSON canonical baseline contains no unexplained zero-length route edges', async () => {
  const { canonical } = await loadProductionSjson();
  const zeroLength = zeroLengthEdges(canonical);
  assert.deepEqual(
    zeroLength,
    [],
    `Production SJSON zero-length canonical edges:\n${JSON.stringify(zeroLength, null, 2)}`,
  );
});
