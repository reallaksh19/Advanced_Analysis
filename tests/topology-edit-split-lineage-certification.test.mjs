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
import { buildCanonicalTopologyFromWorkspaceDataset } from '../src/workspace/topology-edit/topology-edit-source-adapter.js';

const DEMO_URL = new URL('../public/fixtures/topology-edit-20-element-demo.staged.json', import.meta.url);

async function loadDemoTopology() {
  const bytes = new Uint8Array(await readFile(DEMO_URL));
  const raw = JSON.parse(new TextDecoder().decode(bytes).replace(/^\uFEFF/u, ''));
  const dataset = normalizeWorkspaceDataset(raw, 'topology-edit-demo', {
    sourceBytes: bytes,
    sourceSha256: createHash('sha256').update(bytes).digest('hex'),
  });
  const graph = buildPipingPortTopologyGraph(dataset.sharedModel);
  const attachments = buildSupportAttachmentModel(dataset.sharedModel, graph);
  const restraints = buildRestraintCapabilityModel(attachments);
  return finalizeCanonicalTopology(buildCanonicalTopologyFromWorkspaceDataset(
    dataset,
    graph,
    attachments,
    restraints,
  ));
}

function parallelTopology(offsetMm) {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: `parallel-${offsetMm}`,
    datasetVersion: 0,
    sourceHash: `source:parallel-${offsetMm}`,
    topologyGraphHash: `graph:parallel-${offsetMm}`,
    nodes: [
      { id: 'node:a1', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:a2', position: { x: 100, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:b1', position: { x: 0, y: offsetMm, z: 0 }, portKeys: [] },
      { id: 'node:b2', position: { x: 100, y: offsetMm, z: 0 }, portKeys: [] },
    ],
    edges: [
      {
        id: 'edge:a', componentKey: 'A', fromNodeId: 'node:a1', toNodeId: 'node:a2',
        diameterMm: 10, outsideDiameterMm: 10, diameterAuthority: 'OUTSIDE_DIAMETER',
        entityType: 'PIPE', sourcePath: '/A',
      },
      {
        id: 'edge:b', componentKey: 'B', fromNodeId: 'node:b1', toNodeId: 'node:b2',
        diameterMm: 10, outsideDiameterMm: 10, diameterAuthority: 'OUTSIDE_DIAMETER',
        entityType: 'PIPE', sourcePath: '/B',
      },
    ],
    junctions: [], supports: [], boundaries: [], rigids: [],
  });
}

test('demo P-001 split accepts inherited physical-clearance findings through edge lineage', async () => {
  const topology = await loadDemoTopology();
  const session = new TopologyEditCertifiedSession(topology);
  const transition = session.execute('SPLIT_EDGE', { edgeId: 'edge:P-001', fraction: 0.5 });

  assert.equal(transition.disposition, 'ACCEPTED');
  const candidate = transition.certification.candidate;
  const children = candidate.canonicalTopology.edges.filter((edge) => (
    edge.derivedFromEdgeId === 'edge:P-001'
  ));
  assert.equal(children.length, 2);
  assert.equal(
    candidate.checkerDelta.introducedIssues.some((issue) => (
      issue.kind === 'PHYSICAL_CLEARANCE_CLASH'
      && issue.edgeIds.includes('edge:E-001')
    )),
    false,
  );
});

test('subdividing an already-clashing edge does not fabricate a new high checker regression', () => {
  const topology = parallelTopology(8);
  const session = new TopologyEditCertifiedSession(topology);
  const transition = session.execute('SPLIT_EDGE', { edgeId: 'edge:a', fraction: 0.5 });

  assert.equal(transition.disposition, 'ACCEPTED');
  const candidate = transition.certification.candidate;
  assert.equal(
    candidate.beforeChecker.issues.some((issue) => issue.kind === 'PHYSICAL_CLEARANCE_CLASH'),
    true,
  );
  assert.equal(
    candidate.checkerDelta.introducedIssues.some((issue) => issue.kind === 'PHYSICAL_CLEARANCE_CLASH'),
    false,
  );
});

test('a genuinely new physical-clearance clash remains blocking', () => {
  const topology = parallelTopology(30);
  const session = new TopologyEditCertifiedSession(topology);
  const transition = session.execute('MOVE_NODE', {
    nodeId: 'node:a2',
    position: { x: 100, y: 25, z: 0 },
  });

  assert.equal(transition.disposition, 'REJECTED');
  assert.ok(transition.certification.validationReport.errors.some((row) => (
    row.code === 'CHECKER_REGRESSION'
    && row.message.includes('PHYSICAL_CLEARANCE_CLASH')
  )));
});
