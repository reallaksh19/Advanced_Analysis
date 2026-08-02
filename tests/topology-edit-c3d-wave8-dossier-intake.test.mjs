import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  createTopologyEditReviewDossier,
} from '../src/workspace/viewport-productivity/topology-edit-review-dossier.js';
import {
  parseTopologyEditReviewDossierJson,
  reconcileTopologyEditReviewDossier,
  TOPOLOGY_EDIT_REVIEW_DOSSIER_MAX_BYTES,
  topologyEditCurrentEvidenceHashes,
} from '../src/workspace/viewport-productivity/topology-edit-review-dossier-intake.js';
import {
  topologyEditReviewDossierIntakeMarkup,
} from '../src/workspace/viewport-productivity/topology-edit-review-dossier-intake-panel.js';
import {
  TopologyEditReviewDossierRenderer,
} from '../src/workspace/viewport-productivity/topology-edit-review-dossier-renderer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function basis(overrides = {}) {
  return {
    sourceHash: 'source:1',
    baseCanonicalHash: 'base:1',
    draftCanonicalHash: 'draft:1',
    visualModelHash: 'visual:1',
    scopeHash: 'scope:1',
    ...overrides,
  };
}

function camera() {
  return {
    projection: 'PERSPECTIVE',
    position: { x: 10, y: 20, z: 30 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    up: { x: 0, y: 1, z: 0 },
    near: 0.1,
    far: 10000,
    zoom: 1,
    fov: 50,
  };
}

function dossier() {
  const reviewBasis = basis();
  return createTopologyEditReviewDossier({
    basis: reviewBasis,
    camera: camera(),
    presentationState: { presentationHash: 'presentation:1', basis: reviewBasis },
    selection: { nodeIds: ['node:a'], edgeId: 'edge:ab' },
    bookmarks: [],
    provenance: {
      entries: [{ canonicalId: 'support:s1', objectKind: 'support' }],
      provenanceHash: 'provenance:1',
    },
    comparison: {
      entries: [{ canonicalId: 'junction:j1', objectKind: 'junction' }],
      changedCanonicalIds: ['junction:j1'],
      comparisonHash: 'comparison:1',
    },
    issueOverlay: {
      entries: [{ issueId: 'issue:1', canonicalIds: ['node:b', 'missing:x'] }],
      overlayHash: 'overlay:1',
    },
    inspection: {
      status: 'READY', canonicalIds: ['node:a'], inspectionHash: 'inspection:1',
    },
    routeTrace: {
      status: 'READY', canonicalIds: ['edge:ab'], routeTraceHash: 'route:1',
    },
    visualDiagnostics: [{ code: 'DISPLAY_ONLY' }],
  });
}

function topology({ includeMissing = false } = {}) {
  return {
    canonicalTopologyHash: 'draft:1',
    nodes: [
      { id: 'node:a', position: { x: 0, y: 0, z: 0 } },
      { id: 'node:b', position: { x: 3, y: 4, z: 0 } },
      ...(includeMissing ? [{ id: 'missing:x', position: { x: 6, y: 4, z: 0 } }] : []),
    ],
    edges: [{ id: 'edge:ab', fromNodeId: 'node:a', toNodeId: 'node:b' }],
    supports: [{ id: 'support:s1' }],
    junctions: [{ id: 'junction:j1' }],
  };
}

function currentEvidence(overrides = {}) {
  return topologyEditCurrentEvidenceHashes({
    presentationState: { presentationHash: 'presentation:1' },
    provenance: { provenanceHash: 'provenance:1' },
    comparison: { comparisonHash: 'comparison:1' },
    issueOverlay: { overlayHash: 'overlay:1' },
    inspection: { inspectionHash: 'inspection:1' },
    routeTrace: { routeTraceHash: 'route:1' },
    ...overrides,
  });
}

test('parses an integrity-valid bounded Wave 7 dossier', () => {
  const value = dossier();
  const text = JSON.stringify(value);
  const parsed = parseTopologyEditReviewDossierJson(text, {
    byteLength: new TextEncoder().encode(text).length,
  });
  assert.equal(parsed.dossierHash, value.dossierHash);
  assert.equal(Object.isFrozen(parsed), true);
});

test('rejects malformed, oversized, unsupported and tampered intake', () => {
  assert.throws(
    () => parseTopologyEditReviewDossierJson('{broken'),
    /malformed/,
  );
  assert.throws(
    () => parseTopologyEditReviewDossierJson('{}', {
      byteLength: TOPOLOGY_EDIT_REVIEW_DOSSIER_MAX_BYTES + 1,
    }),
    /exceeds/,
  );
  assert.throws(
    () => parseTopologyEditReviewDossierJson(JSON.stringify({ schema: 'Other.v1' })),
    /TopologyEditReviewDossier\.v1/,
  );
  const tampered = structuredClone(dossier());
  tampered.selection.nodeIds = ['node:changed'];
  assert.throws(
    () => parseTopologyEditReviewDossierJson(JSON.stringify(tampered)),
    /hash mismatch/,
  );
});

test('classifies current partial coverage and blocks viewpoint replay', () => {
  const intake = reconcileTopologyEditReviewDossier({
    dossier: dossier(),
    currentBasis: basis(),
    canonicalTopology: topology(),
    currentEvidenceHashes: currentEvidence(),
  });
  assert.equal(intake.basisStatus, 'CURRENT');
  assert.equal(intake.coverageStatus, 'PARTIAL');
  assert.deepEqual(intake.missingCanonicalIds, ['missing:x']);
  assert.equal(intake.summary.evidenceMatchCount, 6);
  assert.equal(intake.viewpointReplayEligible, false);
  assert.equal(intake.releaseQualified, false);
});

test('allows replay only for current basis with complete exact coverage', () => {
  const complete = reconcileTopologyEditReviewDossier({
    dossier: dossier(),
    currentBasis: basis(),
    canonicalTopology: topology({ includeMissing: true }),
    currentEvidenceHashes: currentEvidence(),
  });
  assert.equal(complete.coverageStatus, 'COMPLETE');
  assert.equal(complete.viewpointReplayEligible, true);

  const stale = reconcileTopologyEditReviewDossier({
    dossier: dossier(),
    currentBasis: basis({ draftCanonicalHash: 'draft:2' }),
    canonicalTopology: topology({ includeMissing: true }),
    currentEvidenceHashes: currentEvidence(),
  });
  assert.equal(stale.basisStatus, 'STALE_BASIS');
  assert.equal(stale.viewpointReplayEligible, false);

  const incomplete = reconcileTopologyEditReviewDossier({
    dossier: dossier(),
    currentBasis: basis({ scopeHash: null }),
    canonicalTopology: topology({ includeMissing: true }),
    currentEvidenceHashes: currentEvidence(),
  });
  assert.equal(incomplete.basisStatus, 'INCOMPLETE_BASIS');
  assert.equal(incomplete.viewpointReplayEligible, false);
});

test('reports evidence mismatches and unavailable current evidence', () => {
  const intake = reconcileTopologyEditReviewDossier({
    dossier: dossier(),
    currentBasis: basis(),
    canonicalTopology: topology({ includeMissing: true }),
    currentEvidenceHashes: currentEvidence({
      comparison: { comparisonHash: 'comparison:2' },
      routeTrace: null,
    }),
  });
  assert.deepEqual(intake.mismatchedEvidenceKeys, ['comparisonHash']);
  assert.deepEqual(intake.unavailableCurrentEvidenceKeys, ['routeTraceHash']);
});

test('intake identity is deterministic under canonical collection ordering', () => {
  const source = topology({ includeMissing: true });
  const reversed = {
    ...source,
    nodes: [...source.nodes].reverse(),
    edges: [...source.edges].reverse(),
    supports: [...source.supports].reverse(),
    junctions: [...source.junctions].reverse(),
  };
  const left = reconcileTopologyEditReviewDossier({
    dossier: dossier(), currentBasis: basis(), canonicalTopology: source,
    currentEvidenceHashes: currentEvidence(),
  });
  const right = reconcileTopologyEditReviewDossier({
    dossier: dossier(), currentBasis: basis(), canonicalTopology: reversed,
    currentEvidenceHashes: currentEvidence(),
  });
  assert.equal(left.intakeHash, right.intakeHash);
  assert.deepEqual(left.availableCanonicalIds, right.availableCanonicalIds);
});

test('renders only exact available node and edge coverage as non-pickable', () => {
  const group = new THREE.Group();
  const renderer = new TopologyEditReviewDossierRenderer(group);
  const count = renderer.render(dossier(), topology(), new THREE.Box3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(3, 4, 0),
  ));
  assert.equal(count, 3);
  assert.equal(group.userData.nonPickable, true);
  group.traverse((object) => {
    if (object !== group) assert.equal(object.userData.nonPickable, true);
  });
  renderer.clear();
  assert.equal(group.children.length, 0);
});

test('panel escapes file identity and gates replay controls', () => {
  const intake = reconcileTopologyEditReviewDossier({
    dossier: dossier(), currentBasis: basis(), canonicalTopology: topology(),
    currentEvidenceHashes: currentEvidence(),
  });
  const markup = topologyEditReviewDossierIntakeMarkup({
    intake,
    fileName: '<unsafe>.json',
  });
  assert.match(markup, /data-action="choose-review-dossier"/);
  assert.match(markup, /data-action="focus-dossier-intake"/);
  assert.match(markup, /data-action="apply-dossier-viewpoint" disabled/);
  assert.match(markup, /&lt;unsafe&gt;\.json/);
  assert.doesNotMatch(markup, /<unsafe>/);
});

test('production composition remains local, read-only and exact-ID based', async () => {
  const paths = [
    'src/workspace/load-calc-consumer-controller.js',
    'src/workspace/topology-edit-3d-dossier-intake-controller.js',
    'src/workspace/viewport-productivity/topology-edit-review-dossier-intake.js',
    'src/workspace/viewport-productivity/topology-edit-review-dossier-intake-panel.js',
  ];
  const [consumer, controller, model, panel] = await Promise.all(
    paths.map((file) => readFile(path.join(ROOT, file), 'utf8')),
  );
  assert.match(consumer, /topology-edit-3d-dossier-intake-controller\.js/);
  assert.match(controller, /topology-edit-3d-dossier-controller\.js/);
  assert.match(controller, /input\.type = 'file'/);
  assert.match(controller, /file\.text\(\)/);
  assert.match(controller, /restoreDisplayState/);
  assert.match(controller, /restoreTopologyEditCamera/);
  assert.match(model, /classifyReviewBasis/);
  assert.match(model, /availableCanonicalIds/);
  assert.match(model, /missingCanonicalIds/);
  assert.match(panel, /Review dossier intake/);
  const combined = [controller, model, panel].join('\n');
  for (const prohibited of [
    'WorkspaceState.', 'createTopologyEditCommandIntent', 'previewAutofix(',
    'acceptAutofix(', 'commitToWorkspace(', 'exportTopologyEditAudit(',
    'nearestNeighbor', 'raycast(', 'screenX', 'screenY', 'mesh.name',
  ]) {
    assert.equal(combined.includes(prohibited), false, `intake must not use ${prohibited}`);
  }
});
