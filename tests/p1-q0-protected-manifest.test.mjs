import assert from 'node:assert/strict';
import test from 'node:test';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  compareP1ProtectedManifests,
  requireP1ProtectedManifest,
} from '../scripts/p1/p1-protected-manifest.mjs';

function pickRow(entityId = 'E-1') {
  return {
    mapEntityId: entityId,
    rootIndex: 0,
    rootResolvedEntityId: entityId,
    nodes: [{ path: '0', objectType: 'Mesh', entityId }],
  };
}
function manifest(overrides = {}) {
  const hash = 'fnv1a64:0123456789abcdef';
  const value = {
    schema: 'non-fea-p1-protected-manifest/v1',
    exactHeadSha: 'a'.repeat(40),
    executionId: 'p1-q0-test',
    fixtureRole: 'LARGE_MODEL_4884_ENTITY',
    fixturePath: 'cache/large-model.json',
    sourceSha256: 'b'.repeat(64),
    sourcePackageHash: hash,
    sourcePackageHashAfter: hash,
    sourceMutationStatus: 'UNCHANGED',
    materializationAuthority: 'PRODUCTION_RENDER_THREE_MODEL',
    datasetHash: hash,
    hierarchyHash: hash,
    sharedModelHash: hash,
    supportSiteHash: hash,
    routePartitionHash: hash,
    modelZoneHash: hash,
    resolvedGeometryHash: hash,
    renderModelHash: hash,
    diagnosticManifestHash: hash,
    canonicalObjectManifestHash: hash,
    pickTargetManifestHash: hash,
    sceneBoundsHash: hash,
    diagnosticManifest: [],
    canonicalObjectManifest: [],
    pickTargetManifest: [],
    sceneBounds: {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 1, y: 1, z: 1 },
      center: { x: 0.5, y: 0.5, z: 0.5 },
      size: { x: 1, y: 1, z: 1 },
    },
    counts: {
      entityCount: 1,
      diagnosticCount: 0,
      renderItemCount: 0,
      materializedPickRootCount: 0,
      materializedPickNodeCount: 0,
    },
    ...overrides,
  };
  value.counts = {
    ...value.counts,
    diagnosticCount: value.diagnosticManifest.length,
    renderItemCount: value.canonicalObjectManifest.length,
    materializedPickRootCount: value.pickTargetManifest.length,
    materializedPickNodeCount: value.pickTargetManifest.reduce(
      (total, row) => total + row.nodes.length, 0,
    ),
  };
  if (!Object.hasOwn(overrides, 'diagnosticManifestHash')) {
    value.diagnosticManifestHash = semanticHash(value.diagnosticManifest);
  }
  if (!Object.hasOwn(overrides, 'canonicalObjectManifestHash')) {
    value.canonicalObjectManifestHash = semanticHash(value.canonicalObjectManifest);
  }
  if (!Object.hasOwn(overrides, 'pickTargetManifestHash')) {
    value.pickTargetManifestHash = semanticHash(value.pickTargetManifest);
  }
  if (!Object.hasOwn(overrides, 'sceneBoundsHash')) {
    value.sceneBoundsHash = semanticHash(value.sceneBounds);
  }
  return value;
}

test('P1-Q0 comparison ignores execution custody but rejects protected pick drift', () => {
  const before = manifest({ pickTargetManifest: [pickRow()] });
  const sameEngineering = manifest({
    exactHeadSha: 'c'.repeat(40),
    executionId: 'p1-after',
    pickTargetManifest: [pickRow()],
  });
  assert.equal(compareP1ProtectedManifests(before, sameEngineering).differenceCount, 0);

  const changedPickIdentity = manifest({
    exactHeadSha: 'c'.repeat(40),
    executionId: 'p1-after',
    pickTargetManifest: [pickRow('E-2')],
  });
  const comparison = compareP1ProtectedManifests(before, changedPickIdentity);
  assert.equal(comparison.status, 'REJECTED_IDENTITY_DRIFT');
  assert.deepEqual(comparison.differences.map((row) => row.field),
    ['pickTargetManifestHash']);
});

test('P1-Q0 manifest requires exact keys and unchanged source custody', () => {
  assert.equal(requireP1ProtectedManifest(manifest()).sourceMutationStatus, 'UNCHANGED');
  assert.throws(() => requireP1ProtectedManifest({ ...manifest(), extra: true }), /keys/u);
  assert.throws(() => requireP1ProtectedManifest(
    manifest({ sourceMutationStatus: 'CHANGED' })), /P1_MANIFEST_SOURCE_MUTATED/u);
});

test('P1-Q0 manifest recomputes evidence hashes and counts', () => {
  assert.throws(() => requireP1ProtectedManifest(manifest({
    pickTargetManifest: [pickRow()],
    pickTargetManifestHash: 'fnv1a64:0000000000000000',
  })), /P1_MANIFEST_PICK_HASH_MISMATCH/u);
  const value = manifest({ pickTargetManifest: [pickRow()] });
  value.counts.materializedPickNodeCount = 2;
  assert.throws(() => requireP1ProtectedManifest(value), /P1_MANIFEST_COUNT_MISMATCH/u);
});

test('P1-Q0 manifest rejects evidence code that repairs pick identity', () => {
  const value = manifest({ pickTargetManifest: [{
    ...pickRow(),
    rootResolvedEntityId: 'DIFFERENT',
  }] });
  assert.throws(() => requireP1ProtectedManifest(value),
    /P1_MANIFEST_PICK_ROOT_IDENTITY_MISMATCH/u);
});
