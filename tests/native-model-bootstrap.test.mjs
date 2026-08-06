import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNativeModelBootstrap,
  assertNativeModelBootstrapRequest,
  createEmptyNativeCanonicalTopology,
  createNativeModelBootstrap,
  createNativeModelBootstrapRequest,
  NATIVE_MODEL_IDENTITY_POLICY,
  NATIVE_MODEL_SOURCE_KIND,
} from '../src/workspace/topology-edit/native-model-bootstrap.js';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const IDENTITY = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

function request(overrides = {}) {
  return {
    modelKey: 'MODEL-001',
    documentId: 'NATIVE-DOC-001',
    revision: 'A',
    sourceKind: NATIVE_MODEL_SOURCE_KIND,
    unitSystem: { length: 'MM', angle: 'DEG' },
    coordinateSystem: {
      coordinateSystemId: 'MODEL-CS',
      datumId: 'MODEL-ORIGIN',
      transformToModel: IDENTITY,
    },
    catalogueBasis: {
      catalogueId: 'PIPE-SPEC',
      catalogueVersion: '2026.08',
      catalogueHash: HASH_A,
      sourceHash: HASH_B,
    },
    identityPolicy: NATIVE_MODEL_IDENTITY_POLICY,
    authoringPolicyHash: HASH_A,
    ...overrides,
  };
}

function reorderedRequest() {
  return {
    authoringPolicyHash: HASH_A,
    identityPolicy: NATIVE_MODEL_IDENTITY_POLICY,
    catalogueBasis: {
      sourceHash: HASH_B,
      catalogueHash: HASH_A,
      catalogueVersion: '2026.08',
      catalogueId: 'PIPE-SPEC',
    },
    coordinateSystem: {
      transformToModel: [...IDENTITY],
      datumId: 'MODEL-ORIGIN',
      coordinateSystemId: 'MODEL-CS',
    },
    unitSystem: { angle: 'deg', length: 'mm' },
    sourceKind: 'native_3d_authoring',
    revision: 'A',
    documentId: 'NATIVE-DOC-001',
    modelKey: 'MODEL-001',
  };
}

test('native bootstrap is deterministic and immutable', () => {
  const left = createNativeModelBootstrap(request());
  const right = createNativeModelBootstrap(reorderedRequest());

  assert.equal(left.requestHash, right.requestHash);
  assert.equal(left.dataset.datasetId, right.dataset.datasetId);
  assert.equal(left.datasetHash, right.datasetHash);
  assert.equal(left.sourceHash, right.sourceHash);
  assert.equal(left.canonicalTopologyHash, right.canonicalTopologyHash);
  assert.equal(left.bootstrapHash, right.bootstrapHash);
  assert.ok(Object.isFrozen(left));
  assert.ok(Object.isFrozen(left.request));
  assert.ok(Object.isFrozen(left.dataset));
  assert.ok(Object.isFrozen(left.canonicalTopology));
  assert.equal(assertNativeModelBootstrap(left), left);
});

test('blank native model has zero engineering entities and empty crosswalk', () => {
  const bootstrap = createNativeModelBootstrap(request());
  const { dataset, canonicalTopology } = bootstrap;

  assert.equal(dataset.version, 0);
  assert.deepEqual(dataset.entities, []);
  assert.equal(dataset.summary.pipes, 0);
  assert.equal(dataset.summary.supports, 0);
  assert.equal(dataset.summary.components, 0);
  assert.deepEqual(canonicalTopology.nodes, []);
  assert.deepEqual(canonicalTopology.edges, []);
  assert.deepEqual(canonicalTopology.junctions, []);
  assert.deepEqual(canonicalTopology.supports, []);
  assert.deepEqual(canonicalTopology.boundaries, []);
  assert.deepEqual(canonicalTopology.rigids, []);
  assert.deepEqual(canonicalTopology.bends, []);
  assert.deepEqual(canonicalTopology.crosswalk, {
    nodeIdToPortKeys: {},
    edgeIdToComponentKey: {},
    junctionIdToComponentKey: {},
    supportIdToEntityId: {},
  });
  assert.equal(canonicalTopology.sourceHash, dataset.sourceSnapshot.sourceSemanticHash);
  assert.equal(dataset.datasetId, dataset.sourceSnapshot.datasetId);
  assert.equal(dataset.sourceSnapshot.sourceByteHash, null);
  assert.ok(dataset.sourceSnapshot.diagnostics.some((row) => (
    row.code === 'SOURCE_BYTES_UNAVAILABLE'
  )));
});

test('distinct explicit model custody produces distinct identities', () => {
  const left = createNativeModelBootstrap(request());
  const right = createNativeModelBootstrap(request({
    modelKey: 'MODEL-002',
    documentId: 'NATIVE-DOC-002',
  }));

  assert.notEqual(left.requestHash, right.requestHash);
  assert.notEqual(left.dataset.datasetId, right.dataset.datasetId);
  assert.notEqual(
    left.dataset.nativeAuthoring.nativeModelId,
    right.dataset.nativeAuthoring.nativeModelId,
  );
  assert.notEqual(left.sourceHash, right.sourceHash);
});

test('request authority rejects tamper and unsupported authority input', () => {
  const normalized = createNativeModelBootstrapRequest(request());
  const tampered = { ...normalized, revision: 'B' };

  assert.throws(
    () => assertNativeModelBootstrapRequest(tampered),
    /immutable normalized authority/u,
  );
  assert.throws(
    () => createNativeModelBootstrapRequest(request({
      unitSystem: { length: 'M', angle: 'DEG' },
    })),
    /unitSystem must be/u,
  );
  assert.throws(
    () => createNativeModelBootstrapRequest({ ...request(), sessionId: 'UI-ONLY' }),
    /unsupported field/u,
  );
  assert.throws(
    () => createNativeModelBootstrapRequest(request({
      catalogueBasis: {
        ...request().catalogueBasis,
        catalogueHash: 'not-a-hash',
      },
    })),
    /sha256/u,
  );
});

test('source snapshot tamper fails before canonical finalization', () => {
  const bootstrap = createNativeModelBootstrap(request());
  const dataset = JSON.parse(JSON.stringify(bootstrap.dataset));
  dataset.sourceSnapshot.sourcePackage.revision = 'TAMPERED';

  assert.throws(
    () => createEmptyNativeCanonicalTopology(dataset),
    /source snapshot is invalid/u,
  );
});

test('bootstrap envelope detects dataset and hash tamper', () => {
  const bootstrap = createNativeModelBootstrap(request());
  const tampered = {
    ...bootstrap,
    dataset: {
      ...bootstrap.dataset,
      sourceName: 'CHANGED',
    },
  };

  assert.throws(
    () => assertNativeModelBootstrap(tampered),
    /dataset differs from datasetHash/u,
  );
});
