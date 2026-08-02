import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertEngineeringEnrichmentProposal,
  assertEngineeringEnrichmentResolution,
  buildComponentWeightProposals,
  buildEnrichmentTarget,
  buildExactSelector,
  buildMasterDataSnapshot,
  resolveExactEnrichmentProposals,
} from '../src/workspace/engineering-enrichment/index.js';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

function snapshot(overrides = {}) {
  return buildMasterDataSnapshot({
    masterKey: 'weight',
    source: {
      fileName: 'weights.xlsx',
      sheetName: 'Weights',
      sha256: SHA_A,
      byteLength: 2048,
      ...(overrides.source || {}),
    },
    mapping: overrides.mapping || {
      bore: 'Size',
      valveType: 'Type',
      weight: 'Weight',
    },
    normalizedRows: overrides.normalizedRows || [
      { _sourceRowNumber: 3, bore: 100, valveType: 'GATE', weight: 25 },
      { _sourceRowNumber: 2, bore: 50, valveType: 'GLOBE', weight: 12 },
    ],
    diagnostics: overrides.diagnostics || [],
  });
}

function policy(overrides = {}) {
  return {
    schema: 'ComponentWeightAdapterPolicy.v1',
    adapterId: 'component-weight:test:v1',
    selectorKind: 'COMPONENT_TYPE_BORE',
    selectorMap: { componentType: 'valveType', boreMm: 'bore' },
    valueColumn: 'weight',
    sourceUnit: 'kg',
    canonicalUnit: 'kg',
    ...overrides,
  };
}

test('snapshot identity is deterministic across row, mapping, and diagnostic order', () => {
  const first = snapshot({ diagnostics: [{ code: 'B' }, { code: 'A' }] });
  const second = snapshot({
    mapping: { weight: 'Weight', valveType: 'Type', bore: 'Size' },
    normalizedRows: [...first.normalizedRows].reverse(),
    diagnostics: [{ code: 'A' }, { code: 'B' }],
  });
  assert.equal(first.snapshotHash, second.snapshotHash);
  assert.equal(first.mappingHash, second.mappingHash);
  assert.equal(first.normalizedRowsHash, second.normalizedRowsHash);
});

test('mapping and source changes alter snapshot identity', () => {
  const base = snapshot();
  assert.notEqual(base.snapshotHash, snapshot({
    mapping: { ...base.mapping, weight: 'Mass' },
  }).snapshotHash);
  assert.notEqual(base.snapshotHash, snapshot({
    source: { sha256: SHA_B },
  }).snapshotHash);
});

test('invalid source SHA and unsupported master fail closed', () => {
  assert.throws(() => snapshot({ source: { sha256: 'bad' } }), /sha256/u);
  assert.throws(() => buildMasterDataSnapshot({
    masterKey: 'unknown',
    source: { fileName: 'x', sheetName: 'x', sha256: SHA_A, byteLength: 1 },
    mapping: {},
    normalizedRows: [],
    diagnostics: [],
  }), /unsupported masterKey/u);
});

test('snapshot creation does not mutate caller data', () => {
  const rows = [{ _sourceRowNumber: 2, valveType: 'GATE', bore: 50, weight: 11 }];
  const input = {
    masterKey: 'weight',
    source: { fileName: 'w.csv', sheetName: 'Sheet1', sha256: SHA_A, byteLength: 10 },
    mapping: { valveType: 'Type', bore: 'Bore', weight: 'Weight' },
    normalizedRows: rows,
    diagnostics: [],
  };
  const before = structuredClone(input);
  const result = buildMasterDataSnapshot(input);
  assert.deepEqual(input, before);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.normalizedRows[0]));
});

test('component-weight adapter creates deterministic exact proposal rows', () => {
  const first = buildComponentWeightProposals({ snapshot: snapshot(), policy: policy() });
  const second = buildComponentWeightProposals({ snapshot: snapshot(), policy: policy() });
  assert.deepEqual(first, second);
  assert.equal(first.length, 2);
  assert.ok(first.every((row) => row.status === 'PROPOSAL_ONLY'));
  assert.ok(first.every((row) => row.unit === 'kg'));
  assert.ok(first.every((row) => row.selector.kind === 'COMPONENT_TYPE_BORE'));
});

test('blocked proposal rows retain deterministic valid identity', () => {
  const masterSnapshot = snapshot({ normalizedRows: [
    { _sourceRowNumber: 2, bore: '', valveType: 'GATE', weight: 11 },
  ] });
  const [proposal] = buildComponentWeightProposals({
    snapshot: masterSnapshot,
    policy: policy(),
  });
  assert.equal(proposal.status, 'BLOCKED');
  assert.equal(proposal.selector, null);
  assert.equal(assertEngineeringEnrichmentProposal(proposal), proposal);
});

test('unregistered unit conversion is rejected', () => {
  assert.throws(() => buildComponentWeightProposals({
    snapshot: snapshot(),
    policy: policy({ sourceUnit: 'lb', canonicalUnit: 'kg' }),
  }), /conversion is not authorized/u);
});

test('exact target resolution remains proposal-only', () => {
  const masterSnapshot = snapshot();
  const proposals = buildComponentWeightProposals({ snapshot: masterSnapshot, policy: policy() });
  const targets = proposals.map((proposal, index) => buildEnrichmentTarget({
    targetId: `entity:${index + 1}`,
    selector: proposal.selector,
  }));
  const report = resolveExactEnrichmentProposals({
    sourceDatasetHash: SHA_B,
    sourceSharedModelHash: 'fnv1a64:1234567890abcdef',
    masterSnapshots: [masterSnapshot],
    proposals,
    targets,
  });
  assert.equal(report.summary.status, 'READY_FOR_REVIEW');
  assert.equal(report.summary.exactMatchCount, 2);
  assert.equal(report.bindingCreated, false);
  assert.ok(report.rows.every((row) => row.disposition === 'EXACT_MATCH_PROPOSAL_ONLY'));
  assert.ok(report.rows.every((row) => row.bindingCreated === false));
  assert.equal(assertEngineeringEnrichmentResolution(report), report);
});

test('multiple exact targets are ambiguous and do not bind', () => {
  const masterSnapshot = snapshot({ normalizedRows: [
    { _sourceRowNumber: 2, bore: 50, valveType: 'GATE', weight: 11 },
  ] });
  const proposals = buildComponentWeightProposals({ snapshot: masterSnapshot, policy: policy() });
  const selector = proposals[0].selector;
  const report = resolveExactEnrichmentProposals({
    sourceDatasetHash: SHA_B,
    sourceSharedModelHash: 'fnv1a64:1234567890abcdef',
    masterSnapshots: [masterSnapshot],
    proposals,
    targets: [
      buildEnrichmentTarget({ targetId: 'entity:1', selector }),
      buildEnrichmentTarget({ targetId: 'entity:2', selector }),
    ],
  });
  assert.equal(report.summary.status, 'BLOCKED');
  assert.equal(report.rows[0].disposition, 'AMBIGUOUS_MATCH');
  assert.equal(report.rows[0].bindingCreated, false);
});

test('fuzzy selector kinds are rejected at the contract boundary', () => {
  assert.throws(() => buildExactSelector(
    'FUZZY_COMPONENT_NAME',
    { name: 'gate' },
  ), /unsupported selector kind/u);
});
