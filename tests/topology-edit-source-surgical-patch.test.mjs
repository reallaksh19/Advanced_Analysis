import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { createSourcePackageSnapshot } from '../src/core/shared-piping-model/source-package-snapshot.js';
import {
  assertTopologyEditSourceSurgicalPatch,
  createTopologyEditSourcePatch,
  prepareTopologyEditSourceSurgicalPatch,
  readTopologyEditSourceJsonPointer,
} from '../src/workspace/topology-edit/export/topology-edit-source-surgical-patch.js';

function snapshot() {
  return createSourcePackageSnapshot({
    datasetId: 'dataset-sjson',
    sourceSchema: 'staged-json/v1',
    sourceBytes: '{fixture}',
    sourcePackage: {
      selected: [{
        item: {
          name: 'BRANCH-1', type: 'BRANCH', attributes: { VENDOR_BRANCH_TOKEN: 'KEEP-BRANCH' },
          children: [{
            id: 'P-001', type: 'PIPE', sourcePath: '/BRANCH-1/P-001',
            attributes: {
              TYPE: 'PIPE', MATERIAL: 'A106-B', VENDOR_CUSTOM_FIELD: 'KEEP-ME',
              POS: { x: 500, y: 0, z: 0 },
            },
            nativeParams: {
              startPoint: [0, 0, 0], endPoint: [1000, 0, 0], center: [500, 0, 0],
              vendorOpaqueNested: { code: 'DO-NOT-DROP' },
            },
          }],
        },
      }],
      vendorTopLevel: { retained: true, code: 'TOP-OPAQUE' },
    },
  });
}

test('surgical patch changes only exact existing source fields and preserves opaque vendor custody', () => {
  const sourceSnapshot = snapshot();
  const endPointer = '/selected/0/item/children/0/nativeParams/endPoint';
  const centerPointer = '/selected/0/item/children/0/nativeParams/center';
  const patches = [
    createTopologyEditSourcePatch({
      pointer: endPointer,
      canonicalId: 'edge:P-001',
      property: 'geometry.endPoint',
      expectedPreimageHash: semanticHash([1000, 0, 0]),
      value: [1120, 0, 0],
    }),
    createTopologyEditSourcePatch({
      pointer: centerPointer,
      canonicalId: 'edge:P-001',
      property: 'geometry.center',
      expectedPreimageHash: semanticHash([500, 0, 0]),
      value: [560, 0, 0],
    }),
  ];
  const result = prepareTopologyEditSourceSurgicalPatch({ sourceSnapshot, patches });
  assertTopologyEditSourceSurgicalPatch(result);
  assert.equal(result.originalSourceSemanticHash, sourceSnapshot.sourceSemanticHash);
  assert.notEqual(result.resultingSourceSemanticHash, sourceSnapshot.sourceSemanticHash);
  assert.deepEqual(readTopologyEditSourceJsonPointer(result.sourcePackage, endPointer), [1120, 0, 0]);
  assert.deepEqual(readTopologyEditSourceJsonPointer(result.sourcePackage, centerPointer), [560, 0, 0]);
  assert.equal(
    result.sourcePackage.selected[0].item.children[0].attributes.VENDOR_CUSTOM_FIELD,
    'KEEP-ME',
  );
  assert.equal(
    result.sourcePackage.selected[0].item.children[0].nativeParams.vendorOpaqueNested.code,
    'DO-NOT-DROP',
  );
  assert.deepEqual(result.sourcePackage.vendorTopLevel, { retained: true, code: 'TOP-OPAQUE' });
  assert.deepEqual(sourceSnapshot.sourcePackage.selected[0].item.children[0].nativeParams.endPoint, [1000, 0, 0]);
});

test('stale source preimage fails closed instead of overwriting a changed snapshot', () => {
  const sourceSnapshot = snapshot();
  const patch = createTopologyEditSourcePatch({
    pointer: '/selected/0/item/children/0/nativeParams/endPoint',
    canonicalId: 'edge:P-001',
    property: 'geometry.endPoint',
    expectedPreimageHash: semanticHash([999, 0, 0]),
    value: [1120, 0, 0],
  });
  assert.throws(() => prepareTopologyEditSourceSurgicalPatch({ sourceSnapshot, patches: [patch] }), /stale preimage/);
});

test('duplicate, parent-child, missing, root, and malformed JSON pointers fail closed', () => {
  const sourceSnapshot = snapshot();
  const existing = '/selected/0/item/children/0/nativeParams/endPoint';
  const patch = createTopologyEditSourcePatch({
    pointer: existing,
    canonicalId: 'edge:P-001', property: 'geometry.endPoint',
    expectedPreimageHash: semanticHash([1000, 0, 0]), value: [1100, 0, 0],
  });
  assert.throws(() => prepareTopologyEditSourceSurgicalPatch({ sourceSnapshot, patches: [patch, patch] }), /duplicate patch pointer/);
  const parent = createTopologyEditSourcePatch({
    pointer: '/selected/0/item/children/0/nativeParams',
    canonicalId: 'edge:P-001', property: 'nativeParams',
    expectedPreimageHash: semanticHash(sourceSnapshot.sourcePackage.selected[0].item.children[0].nativeParams),
    value: sourceSnapshot.sourcePackage.selected[0].item.children[0].nativeParams,
  });
  assert.throws(() => prepareTopologyEditSourceSurgicalPatch({ sourceSnapshot, patches: [parent, patch] }), /overlapping patch pointers/);
  const missing = createTopologyEditSourcePatch({
    pointer: '/selected/0/item/children/0/nativeParams/missing',
    canonicalId: 'edge:P-001', property: 'missing', expectedPreimageHash: semanticHash(null), value: 1,
  });
  assert.throws(() => prepareTopologyEditSourceSurgicalPatch({ sourceSnapshot, patches: [missing] }), /does not exist/);
  assert.throws(() => createTopologyEditSourcePatch({
    pointer: '/', canonicalId: 'edge:P-001', property: 'root', expectedPreimageHash: 'hash', value: {},
  }), /non-root RFC 6901/);
  assert.throws(() => createTopologyEditSourcePatch({
    pointer: '/bad~2pointer', canonicalId: 'edge:P-001', property: 'bad', expectedPreimageHash: 'hash', value: 1,
  }), /invalid JSON Pointer escape/);
});

test('pre-hashed patches still pass normal pointer and custody validation', () => {
  const sourceSnapshot = snapshot();
  const malformed = {
    pointer: '/bad~2pointer', canonicalId: 'edge:P-001', property: 'vendorToken',
    expectedPreimageHash: semanticHash('before'), value: 'after',
  };
  const hashedMalformed = { ...malformed, patchHash: semanticHash(malformed) };
  assert.throws(() => prepareTopologyEditSourceSurgicalPatch({
    sourceSnapshot, patches: [hashedMalformed],
  }), /invalid JSON Pointer escape/);

  const missingCustody = {
    pointer: '/selected/0/item/children/0/nativeParams/endPoint',
    canonicalId: '', property: 'geometry.endPoint',
    expectedPreimageHash: semanticHash([1000, 0, 0]), value: [1100, 0, 0],
  };
  const hashedMissingCustody = { ...missingCustody, patchHash: semanticHash(missingCustody) };
  assert.throws(() => prepareTopologyEditSourceSurgicalPatch({
    sourceSnapshot, patches: [hashedMissingCustody],
  }), /canonicalId is required/);
});

test('RFC 6901 escaped source keys are addressed exactly', () => {
  const sourceSnapshot = createSourcePackageSnapshot({
    datasetId: 'dataset-escaped', sourceSchema: 'staged-json/v1',
    sourcePackage: { 'a/b': { '~token': 'before', untouched: 'keep' } },
  });
  const patch = createTopologyEditSourcePatch({
    pointer: '/a~1b/~0token', canonicalId: 'edge:P-1', property: 'vendorToken',
    expectedPreimageHash: semanticHash('before'), value: 'after',
  });
  const result = prepareTopologyEditSourceSurgicalPatch({ sourceSnapshot, patches: [patch] });
  assert.equal(result.sourcePackage['a/b']['~token'], 'after');
  assert.equal(result.sourcePackage['a/b'].untouched, 'keep');
});
