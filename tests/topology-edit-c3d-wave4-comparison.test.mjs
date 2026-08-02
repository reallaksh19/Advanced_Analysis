import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertTopologyEditComparisonModel,
  buildTopologyEditComparisonModel,
} from '../src/workspace/viewport-productivity/topology-edit-comparison-model.js';
import {
  topologyEditComparisonMarkup,
} from '../src/workspace/viewport-productivity/topology-edit-comparison-panel.js';

function sourceFixture() {
  return {
    canonicalTopologyHash: 'source:1',
    nodes: [
      { id: 'node:A', position: { x: 0, y: 0, z: 0 } },
      { id: 'node:B', position: { x: 3, y: 4, z: 12 } },
      { id: 'node:REMOVE', position: { x: 1, y: 1, z: 1 } },
    ],
    edges: [
      { id: 'edge:E', fromNodeId: 'node:A', toNodeId: 'node:B', componentKey: 'PIPE-1', boreMm: 80, outsideDiameterMm: 100 },
      { id: 'edge:REMOVE', fromNodeId: 'node:A', toNodeId: 'node:REMOVE' },
    ],
    supports: [{ id: 'support:S', nodeId: 'node:A', type: 'GUIDE' }],
    junctions: [{ id: 'junction:J', nodeId: 'node:B', kind: 'TEE' }],
  };
}

function draftFixture() {
  return {
    canonicalTopologyHash: 'draft:1',
    nodes: [
      { id: 'node:A', position: { x: 0, y: 0, z: 0 } },
      { id: 'node:B', position: { x: 6, y: 8, z: 24 } },
      { id: 'node:ADD', position: { x: 10, y: 0, z: 0 } },
    ],
    edges: [
      { id: 'edge:E', fromNodeId: 'node:A', toNodeId: 'node:B', componentKey: 'PIPE-1', boreMm: 90, outsideDiameterMm: 110 },
      { id: 'edge:ADD', fromNodeId: 'node:A', toNodeId: 'node:ADD' },
    ],
    supports: [{ id: 'support:S', nodeId: 'node:A', type: 'LINE_STOP' }],
    junctions: [{ id: 'junction:ADD', nodeId: 'node:B', kind: 'OLET' }],
  };
}

function reordered(topology) {
  return {
    ...topology,
    nodes: [...topology.nodes].reverse(),
    edges: [...topology.edges].reverse(),
    supports: [...topology.supports].reverse(),
    junctions: [...topology.junctions].reverse(),
  };
}

test('comparison is deterministic under canonical collection reordering', () => {
  const first = buildTopologyEditComparisonModel({ sourceTopology: sourceFixture(), draftTopology: draftFixture() });
  const second = buildTopologyEditComparisonModel({ sourceTopology: reordered(sourceFixture()), draftTopology: reordered(draftFixture()) });
  assert.equal(first.comparisonHash, second.comparisonHash);
  assert.deepEqual(first.changedCanonicalIds, second.changedCanonicalIds);
  assert.equal(first.identityAuthority, 'EXACT_CANONICAL_ID');
  assert.equal(first.proximityRetargetingAllowed, false);
});

test('comparison classifies added removed and modified exact canonical identities', () => {
  const model = buildTopologyEditComparisonModel({ sourceTopology: sourceFixture(), draftTopology: draftFixture() });
  const dispositions = new Map(model.entries.map((entry) => [entry.canonicalId, entry.changeType]));
  assert.equal(dispositions.get('node:ADD'), 'ADDED');
  assert.equal(dispositions.get('node:REMOVE'), 'REMOVED');
  assert.equal(dispositions.get('node:B'), 'MODIFIED');
  assert.equal(dispositions.get('edge:E'), 'MODIFIED');
  assert.equal(dispositions.get('support:S'), 'MODIFIED');
  assert.equal(dispositions.get('junction:J'), 'REMOVED');
  assert.equal(dispositions.get('junction:ADD'), 'ADDED');
  assert.equal(model.summary.totalChanged, model.entries.length);
});

test('node movement and edge endpoint/dimension evidence are exact', () => {
  const model = buildTopologyEditComparisonModel({ sourceTopology: sourceFixture(), draftTopology: draftFixture() });
  const node = model.entries.find((entry) => entry.canonicalId === 'node:B');
  assert.deepEqual(node.details.movement.delta, { x: 3, y: 4, z: 12 });
  assert.equal(node.details.movement.distanceMm, 13);
  const edge = model.entries.find((entry) => entry.canonicalId === 'edge:E');
  assert.deepEqual(edge.details.sourceEndpointIds, ['node:A', 'node:B']);
  assert.deepEqual(edge.details.draftEndpointIds, ['node:A', 'node:B']);
  assert.equal(edge.details.sourceDimensions.boreMm, 80);
  assert.equal(edge.details.draftDimensions.boreMm, 90);
  assert.equal(edge.details.sourceSegment.end.z, 12);
  assert.equal(edge.details.draftSegment.end.z, 24);
});

test('missing endpoint evidence is explicit and comparison tampering fails closed', () => {
  const draft = draftFixture();
  draft.edges.push({ id: 'edge:MISSING', fromNodeId: 'node:A', toNodeId: 'node:NOPE' });
  const model = buildTopologyEditComparisonModel({ sourceTopology: sourceFixture(), draftTopology: draft });
  assert.deepEqual(model.diagnostics.find((row) => row.canonicalId === 'edge:MISSING'), {
    code: 'DRAFT_ENDPOINT_UNAVAILABLE',
    canonicalId: 'edge:MISSING',
    status: 'UNAVAILABLE',
  });
  assert.throws(() => assertTopologyEditComparisonModel({ ...model, status: 'UNCHANGED' }), /hash mismatch/);
});

test('comparison panel discloses authority, escapes IDs, and exposes bounded controls', () => {
  const source = sourceFixture();
  const draft = draftFixture();
  draft.nodes.push({ id: 'node:<unsafe>', position: { x: 1, y: 2, z: 3 } });
  const model = buildTopologyEditComparisonModel({ sourceTopology: source, draftTopology: draft });
  const markup = topologyEditComparisonMarkup(model);
  assert.match(markup, /VISUAL REVIEW DELTA — NOT ENGINEERING AUTHORITY/);
  assert.match(markup, /data-action="focus-comparison"/);
  assert.match(markup, /data-action="isolate-comparison"/);
  assert.match(markup, /data-action="show-all-comparison"/);
  assert.match(markup, /node:&lt;unsafe&gt;/);
  assert.doesNotMatch(markup, /WorkspaceState|commitDraft|execute\(/);
});

test('production comparison composition remains read-only and exact-ID based', () => {
  const source = readFileSync(new URL('../src/workspace/topology-edit-3d-comparison-controller.js', import.meta.url), 'utf8');
  assert.match(source, /buildTopologyEditComparisonModel/);
  assert.match(source, /renderTopologyEditComparisonPanel/);
  assert.match(source, /ISOLATE_IDS/);
  assert.match(source, /focusCanonicalIds/);
  assert.doesNotMatch(source, /WorkspaceState|execute\(|commitDraft|prepareTopologyEditExport|nearest|proximity|Raycaster/);
});

test('retained canonical measurement panel carries explicit non-authoritative disclosure', () => {
  const source = readFileSync(new URL('../src/workspace/topology-edit/topology-edit-inspection-panel.js', import.meta.url), 'utf8');
  assert.match(source, /CANONICAL COORDINATE MEASUREMENT — NOT ENGINEERING AUTHORITY/);
});
