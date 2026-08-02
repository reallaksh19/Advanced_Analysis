import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  TopologyEditReviewStore,
  assertTopologyEditReviewBookmark,
  captureTopologyEditCamera,
  restoreTopologyEditCamera,
} from '../src/workspace/viewport-productivity/topology-edit-review-bookmark.js';
import {
  assertTopologyEditProvenanceModel,
  buildTopologyEditProvenanceModel,
} from '../src/workspace/viewport-productivity/topology-edit-provenance-model.js';
import { topologyEditReviewMarkup } from '../src/workspace/viewport-productivity/topology-edit-review-panel.js';

const basis = { sourceHash: 's', baseCanonicalHash: 'b', draftCanonicalHash: 'd', visualModelHash: 'v', scopeHash: 'x' };
const presentationState = { schema: 'TopologyEditViewportPresentation.v1', basis, presentationHash: 'p', canonicalVisibility: { hiddenCanonicalIds: [], isolatedCanonicalIds: [] } };
const selection = { schema: 'TopologyEditSelection.v1', nodeIds: ['node:A'], edgeId: null };
const topology = {
  canonicalTopologyHash: 'canonical:1',
  nodes: [{ id: 'node:A', position: { x: 1, y: 2, z: 3 }, sourcePaths: ['/A'] }, { id: 'node:B', position: { x: 4, y: 2, z: 3 } }],
  edges: [{ id: 'edge:E', fromNodeId: 'node:A', toNodeId: 'node:B', componentKey: 'PIPE-1', componentType: 'PIPE', boreMm: 80, outsideDiameterMm: 100, sourcePath: '/E' }],
  supports: [{ id: 'support:S', nodeId: 'node:A', restraints: [{ id: 'R1', family: 'GUIDE', direction: 'X' }] }],
  junctions: [{ id: 'junction:J', nodeId: 'node:A' }],
};

function camera() {
  const settable = (initial) => ({ ...initial, set(x, y, z, w) { this.x = x; this.y = y; this.z = z; if (w !== undefined) this.w = w; } });
  return { isPerspectiveCamera: true, position: settable({ x: 5, y: 6, z: 7 }), quaternion: settable({ x: 0, y: 0, z: 0, w: 1 }), up: settable({ x: 0, y: 1, z: 0 }), near: 0.1, far: 1000, zoom: 1, fov: 45, updated: 0, updateProjectionMatrix() { this.updated += 1; } };
}

test('provenance binds exact canonical source, dimensions, restraint, and diagnostics', () => {
  const model = buildTopologyEditProvenanceModel({ canonicalTopology: topology, selection, diagnostics: [{ code: 'D1', message: 'review', canonicalIds: ['node:A'] }] });
  assert.equal(model.status, 'READY');
  assert.deepEqual(model.entries[0].incidentEdgeIds, ['edge:E']);
  assert.deepEqual(model.entries[0].supportIds, ['support:S']);
  assert.equal(model.entries[0].restraintEvidence[0].family, 'GUIDE');
  assert.equal(model.entries[0].diagnostics[0].code, 'D1');
  assertTopologyEditProvenanceModel(model);
});

test('missing provenance remains explicit and stale IDs fail closed', () => {
  const edge = buildTopologyEditProvenanceModel({ canonicalTopology: topology, selection: { nodeIds: [], edgeId: 'edge:E' } });
  assert.equal(edge.entries[0].branchId.status, 'UNAVAILABLE');
  const stale = buildTopologyEditProvenanceModel({ canonicalTopology: topology, selection: { nodeIds: ['node:missing'], edgeId: null } });
  assert.equal(stale.status, 'STALE_SELECTION');
});

test('session review store is deterministic, basis-bound, removable, and tamper rejecting', () => {
  const provenance = buildTopologyEditProvenanceModel({ canonicalTopology: topology, selection });
  const store = new TopologyEditReviewStore();
  const record = store.save({ title: 'Node A', note: 'check guide', basis, camera: captureTopologyEditCamera(camera()), presentationState, selection, provenance });
  assert.equal(record.sequence, 1);
  assert.equal(store.resolve(record.bookmarkId, basis).status, 'CURRENT');
  assert.equal(store.resolve(record.bookmarkId, { ...basis, draftCanonicalHash: 'changed' }).status, 'STALE_BASIS');
  assert.throws(() => assertTopologyEditReviewBookmark({ ...record, title: 'tampered' }), /hash mismatch/);
  assert.equal(store.remove(record.bookmarkId), true);
  assert.equal(store.list().length, 0);
});

test('camera capture and restore are exact at the renderer-owned boundary', () => {
  const value = camera();
  const snapshot = captureTopologyEditCamera(value);
  value.position.set(99, 99, 99);
  restoreTopologyEditCamera(value, snapshot);
  assert.deepEqual({ x: value.position.x, y: value.position.y, z: value.position.z }, { x: 5, y: 6, z: 7 });
  assert.equal(value.updated, 1);
});

test('review markup discloses session-only authority and escapes content', () => {
  const provenance = buildTopologyEditProvenanceModel({ canonicalTopology: topology, selection });
  const store = new TopologyEditReviewStore();
  const record = store.save({ title: '<unsafe>', basis, camera: captureTopologyEditCamera(camera()), presentationState, selection, provenance });
  const markup = topologyEditReviewMarkup({ records: [record], provenance });
  assert.match(markup, /Session-only display artifact/);
  assert.match(markup, /&lt;unsafe&gt;/);
  assert.doesNotMatch(markup, /localStorage|WorkspaceState|commitDraft/);
});

test('production inspection controller consumes review services without persistence authority', () => {
  const source = readFileSync(new URL('../src/workspace/topology-edit-3d-inspection-controller.js', import.meta.url), 'utf8');
  assert.match(source, /TopologyEditReviewStore/);
  assert.match(source, /buildTopologyEditProvenanceModel/);
  assert.match(source, /renderTopologyEditReviewPanel/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|WorkspaceState\.update|prepareTopologyEditExport|commitTopologyEdit/);
});
