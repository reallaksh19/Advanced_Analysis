import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  isTopologyEditCanonicalId,
  normalizeTopologyEditCanonicalId,
  normalizeTopologyEditCanonicalIds,
} from '../src/workspace/topology-edit/professional/topology-edit-canonical-id.js';
import {
  createTopologyEditSpecificationCatalogue,
  createTopologyEditSpecificationRecord,
} from '../src/workspace/topology-edit/professional/topology-edit-spec-catalog.js';

async function catalogueInput() {
  const url = new URL(
    './fixtures/topology-edit/professional/spec-compatibility.json',
    import.meta.url,
  );
  return JSON.parse(await readFile(url, 'utf8'));
}

test('canonical identities require exact namespaces, suffixes, and strings', () => {
  assert.equal(normalizeTopologyEditCanonicalId('node:P-001:to', 'nodeId'), 'node:P-001:to');
  assert.equal(isTopologyEditCanonicalId('edge:P-001', 'edge'), true);
  assert.deepEqual(
    normalizeTopologyEditCanonicalIds(
      ['node:b', 'node:a', 'node:b'],
      'nodeIds',
      'node',
    ),
    ['node:a', 'node:b'],
  );
  for (const value of [
    'node:',
    'edge:',
    'node:a b',
    ' node:a',
    'node:a ',
    'mesh:a',
    { toString: () => 'node:a' },
  ]) {
    assert.throws(
      () => normalizeTopologyEditCanonicalId(value, 'targetId'),
      /exact canonical ID/i,
    );
  }
  assert.throws(
    () => normalizeTopologyEditCanonicalId('edge:e1', 'nodeId', 'node'),
    /node: canonical namespace/i,
  );
});

test('catalogue requires a real SHA-256 source digest', async () => {
  const input = await catalogueInput();
  const catalogue = createTopologyEditSpecificationCatalogue(input);
  assert.match(catalogue.authority.sourceHash, /^sha256:[a-f0-9]{64}$/u);
  for (const sourceHash of [
    'sha256:demo-spec-authority',
    'sha256:ABCDEF',
    'fnv1a64:source',
    '',
  ]) {
    assert.throws(
      () => createTopologyEditSpecificationCatalogue({
        ...input,
        authority: { ...input.authority, sourceHash },
      }),
      /sha256:<64 lowercase hex>/i,
    );
  }
});

test('valves, tees, and olets fail closed without construction evidence', async () => {
  const catalogue = createTopologyEditSpecificationCatalogue(await catalogueInput());
  const valve = catalogue.records.find((record) => record.componentType === 'VALVE');
  const tee = catalogue.records.find((record) => record.componentType === 'TEE');
  const olet = catalogue.records.find((record) => record.componentType === 'OLET');

  assert.equal(valve.valveType, 'GATE');
  assert.equal(tee.branchNominalSizeMm, 50);
  assert.equal(olet.oletType, 'WELDOLET');

  assert.throws(
    () => createTopologyEditSpecificationRecord({ ...valve, valveType: null }),
    /VALVE\.valveType is required/i,
  );
  assert.throws(
    () => createTopologyEditSpecificationRecord({ ...tee, centerToBranchMm: null }),
    /TEE\.centerToBranchMm is required/i,
  );
  assert.throws(
    () => createTopologyEditSpecificationRecord({ ...olet, hostComponentType: null }),
    /OLET\.hostComponentType is required/i,
  );
  assert.throws(
    () => createTopologyEditSpecificationRecord({
      ...catalogue.records.find((record) => record.componentType === 'PIPE'),
      valveType: 'GATE',
    }),
    /valveType is not valid for componentType PIPE/i,
  );
});
