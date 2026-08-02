import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  assertTopologyEditReviewDossier,
  createTopologyEditReviewDossier,
  topologyEditReviewDossierFilename,
  topologyEditReviewDossierJson,
} from '../src/workspace/viewport-productivity/topology-edit-review-dossier.js';
import {
  topologyEditReviewDossierMarkup,
} from '../src/workspace/viewport-productivity/topology-edit-review-dossier-panel.js';
import {
  TopologyEditReviewDossierRenderer,
} from '../src/workspace/viewport-productivity/topology-edit-review-dossier-renderer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function dossierInput() {
  return {
    basis: {
      sourceHash: 'source:1',
      baseCanonicalHash: 'canonical:base',
      draftCanonicalHash: 'canonical:draft',
      visualModelHash: 'visual:1',
      scopeHash: 'scope:all',
    },
    camera: {
      projection: 'PERSPECTIVE',
      position: { x: 10, y: 20, z: 30 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
      up: { x: 0, y: 1, z: 0 },
      near: 0.1,
      far: 1000,
      zoom: 1,
      fov: 45,
    },
    presentationState: {
      schema: 'TopologyEditPresentationState.v1',
      presentationHash: 'presentation:1',
      basis: { draftCanonicalHash: 'canonical:draft' },
    },
    selection: { nodeIds: ['node:a', 'node:b'], edgeId: null },
    bookmarks: [
      {
        sequence: 2,
        bookmarkId: 'bookmark:2',
        selection: { nodeIds: [], edgeId: 'edge:bc' },
        provenance: { entries: [{ canonicalId: 'edge:bc' }] },
      },
      {
        sequence: 1,
        bookmarkId: 'bookmark:1',
        selection: { nodeIds: ['node:c'], edgeId: null },
        provenance: { entries: [{ canonicalId: 'node:c' }] },
      },
    ],
    provenance: {
      schema: 'TopologyEditProvenanceModel.v1',
      provenanceHash: 'provenance:1',
      entries: [
        { canonicalId: 'edge:ab', objectKind: 'edge' },
        { canonicalId: 'node:a', objectKind: 'node' },
      ],
    },
    comparison: {
      schema: 'TopologyEditSourceDraftComparison.v1',
      comparisonHash: 'comparison:1',
      changedCanonicalIds: ['edge:ab', 'node:b'],
      entries: [
        { canonicalId: 'node:b', objectKind: 'node' },
        { canonicalId: 'edge:ab', objectKind: 'edge' },
      ],
    },
    issueOverlay: {
      schema: 'TopologyEditIssueOverlay.v1',
      overlayHash: 'issues:1',
      entries: [
        { issueId: 'issue:2', canonicalIds: ['node:c'] },
        { issueId: 'issue:1', canonicalIds: ['edge:bc'] },
      ],
    },
    inspection: {
      schema: 'TopologyEditInspectionModel.v1',
      status: 'READY',
      inspectionHash: 'inspection:1',
      canonicalIds: ['node:a', 'node:b'],
    },
    routeTrace: {
      schema: 'TopologyEditRouteTraceModel.v1',
      status: 'READY',
      routeTraceHash: 'route:1',
      canonicalIds: ['node:a', 'node:b', 'edge:ab'],
    },
    visualDiagnostics: [
      { code: 'VISUAL-B', message: 'Second' },
      { code: 'VISUAL-A', message: 'First' },
    ],
  };
}

function topology() {
  return {
    nodes: [
      { id: 'node:a', position: { x: 0, y: 0, z: 0 } },
      { id: 'node:b', position: { x: 10, y: 0, z: 0 } },
      { id: 'node:c', position: { x: 10, y: 10, z: 0 } },
    ],
    edges: [
      { id: 'edge:ab', fromNodeId: 'node:a', toNodeId: 'node:b' },
      { id: 'edge:bc', fromNodeId: 'node:b', toNodeId: 'node:c' },
    ],
  };
}

test('builds deterministic dossier under reordered evidence collections', () => {
  const input = dossierInput();
  const reordered = structuredClone(input);
  reordered.bookmarks.reverse();
  reordered.provenance.entries.reverse();
  reordered.comparison.entries.reverse();
  reordered.issueOverlay.entries.reverse();
  reordered.visualDiagnostics.reverse();
  const left = createTopologyEditReviewDossier(input);
  const right = createTopologyEditReviewDossier(reordered);
  assert.equal(left.dossierHash, right.dossierHash);
  assert.deepEqual(left.coverageCanonicalIds, [
    'edge:ab', 'edge:bc', 'node:a', 'node:b', 'node:c',
  ]);
  assert.equal(left.summary.bookmarkCount, 2);
  assert.equal(left.summary.comparisonChangeCount, 2);
  assert.equal(left.releaseQualified, false);
  assert.equal(Object.isFrozen(left), true);
});

test('rejects dossier tampering and emits deterministic handoff bytes', () => {
  const dossier = createTopologyEditReviewDossier(dossierInput());
  const tampered = structuredClone(dossier);
  tampered.summary.coverageCanonicalCount += 1;
  assert.throws(() => assertTopologyEditReviewDossier(tampered), /hash mismatch/);
  assert.match(topologyEditReviewDossierFilename(dossier), /^topology-edit-review-[a-f0-9]{16}\.json$/);
  assert.equal(topologyEditReviewDossierJson(dossier).endsWith('\n'), true);
});

test('allows unavailable optional evidence without inventing coverage', () => {
  const input = dossierInput();
  input.bookmarks = [];
  input.provenance = null;
  input.comparison = null;
  input.issueOverlay = null;
  input.inspection = null;
  input.routeTrace = null;
  input.visualDiagnostics = [];
  input.selection = { nodeIds: [], edgeId: null };
  const dossier = createTopologyEditReviewDossier(input);
  assert.deepEqual(dossier.coverageCanonicalIds, []);
  assert.equal(dossier.summary.inspectionStatus, 'UNAVAILABLE');
  assert.equal(dossier.summary.routeStatus, 'UNAVAILABLE');
});

test('renders exact non-pickable transient coverage and disposes it', () => {
  const group = new THREE.Group();
  const renderer = new TopologyEditReviewDossierRenderer(group);
  const dossier = createTopologyEditReviewDossier(dossierInput());
  const count = renderer.render(dossier, topology(), new THREE.Box3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(10, 10, 0),
  ));
  assert.equal(count, 5);
  assert.equal(group.userData.nonPickable, true);
  group.traverse((object) => {
    if (object !== group) {
      assert.equal(object.userData.nonPickable, true);
      assert.equal(object.userData.dossierHash, dossier.dossierHash);
    }
  });
  renderer.clear();
  assert.equal(group.children.length, 0);
});

test('panel exposes build, focus, download and clear with authority disclosure', () => {
  const dossier = createTopologyEditReviewDossier(dossierInput());
  const markup = topologyEditReviewDossierMarkup(dossier);
  assert.match(markup, /data-action="build-review-dossier"/);
  assert.match(markup, /data-action="focus-review-dossier"/);
  assert.match(markup, /data-action="download-review-dossier"/);
  assert.match(markup, /data-action="clear-review-dossier"/);
  assert.match(markup, /not topology draft persistence/i);
  assert.doesNotMatch(markup, /<script/i);
});

test('production composition is portable review only and retains Wave 6', async () => {
  const paths = [
    'src/workspace/load-calc-consumer-controller.js',
    'src/workspace/topology-edit-3d-dossier-controller.js',
    'src/workspace/topology-edit-3d-route-controller.js',
    'src/workspace/viewport-productivity/topology-edit-review-dossier.js',
    'src/workspace/viewport-productivity/topology-edit-review-dossier-panel.js',
    'src/workspace/viewport-productivity/topology-edit-review-dossier-renderer.js',
  ];
  const [consumer, controller, route, model, panel, renderer] = await Promise.all(
    paths.map((file) => readFile(path.join(ROOT, file), 'utf8')),
  );
  assert.match(consumer, /topology-edit-3d-dossier-controller\.js/);
  assert.match(controller, /topology-edit-3d-route-controller\.js/);
  assert.match(controller, /createTopologyEditReviewDossier/);
  assert.match(controller, /transientGroup/);
  assert.match(controller, /topologyEditReviewDossierJson/);
  assert.match(route, /buildTopologyEditRouteTrace/);
  assert.match(model, /PORTABLE_DISPLAY_REVIEW_ARTIFACT/);
  assert.match(panel, /Review dossier handoff/);
  assert.match(renderer, /nonPickable/);
  const combined = [controller, model, panel, renderer].join('\n');
  for (const prohibited of [
    'exportTopologyEditDraft', 'commitToWorkspace', 'rollbackWorkspace',
    'createTopologyEditCommandIntent', 'acceptAutofix(', 'releaseQualified: true',
    'nearest', 'raycast', 'screenX', 'screenY', 'mesh.name',
  ]) {
    assert.equal(combined.includes(prohibited), false, `dossier workflow must not use ${prohibited}`);
  }
});
