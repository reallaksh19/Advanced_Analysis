import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSharedPipingModel,
} from '../src/core/shared-piping-model/shared-piping-model.js';
import {
  assertEngineeringEnrichmentCandidateProjection,
  assertEngineeringEnrichmentStructuralImpact,
  buildComponentWeightProposals,
  buildEnrichmentStructuralImpactReport,
  buildEnrichmentTarget,
  buildMasterDataSnapshot,
  buildShadowCandidateProjection,
  resolveExactEnrichmentProposals,
} from '../src/workspace/engineering-enrichment/index.js';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

function sharedModel({ explicitWeight = false } = {}) {
  const engineeringProperties = explicitWeight
    ? {
      componentWeightKg: {
        value: 9,
        unit: 'kg',
        sourceKind: 'EXPLICIT_SOURCE',
        sourcePath: '/components/0/weight',
      },
    }
    : {};
  return createSharedPipingModel({
    project: { datasetId: 'dataset:test', name: 'Test', sourceName: 'test.json' },
    units: { length: 'mm', force: 'N', mass: 'kg' },
    sourceSnapshotRef: {
      schema: 'source-package-snapshot/v1',
      datasetId: 'dataset:test',
      sourceSchema: 'test/v1',
      sourceSemanticHash: 'fnv1a64:1111111111111111',
      sourceByteHash: SHA_B,
    },
    components: [{
      componentKey: 'entity:1',
      sourceEntityId: 'C-1',
      name: 'Gate valve',
      type: 'VALVE',
      identity: { lineId: 'L1', branchId: 'B1', systemId: 'S1', zoneId: 'Z1' },
      geometry: {
        center: { x: 0, y: 0, z: 0 },
        applicationPoint: { x: 0, y: 0, z: 0 },
        ports: [{
          portKey: 'entity:1:port:start',
          role: 'start',
          position: { x: 0, y: 0, z: 0 },
          sourceReference: { sourcePath: '/components/0/start' },
        }],
      },
      engineeringProperties,
      compatibilityEvidence: {},
      sourceReferences: {
        sourceNodeKey: 'node:1',
        sourceEntityId: 'C-1',
        jsonPointer: '/components/0',
        sourcePath: '/components/0',
      },
      diagnostics: [],
    }],
    supports: [],
    sourceReferences: {
      nodes: [{
        sourceNodeKey: 'node:1',
        sourceEntityId: 'C-1',
        jsonPointer: '/components/0',
        parentSourceNodeKey: null,
        childSourceNodeKeys: [],
        childIndex: 0,
        depth: 0,
        type: 'VALVE',
        name: 'Gate valve',
        sourcePath: '/components/0',
        lineId: 'L1',
        branchId: 'B1',
        systemId: 'S1',
        zoneId: 'Z1',
      }],
    },
    diagnostics: [],
  });
}

function snapshot(rows = [{
  _sourceRowNumber: 2,
  bore: 50,
  valveType: 'VALVE',
  weight: 12,
}]) {
  return buildMasterDataSnapshot({
    masterKey: 'weight',
    source: {
      fileName: 'weights.xlsx',
      sheetName: 'Weights',
      sha256: SHA_A,
      byteLength: 100,
    },
    mapping: { bore: 'Size', valveType: 'Type', weight: 'Weight' },
    normalizedRows: rows,
    diagnostics: [],
  });
}

function proposals(masterSnapshot) {
  return buildComponentWeightProposals({
    snapshot: masterSnapshot,
    policy: {
      schema: 'ComponentWeightAdapterPolicy.v1',
      adapterId: 'component-weight:test:v1',
      selectorKind: 'COMPONENT_TYPE_BORE',
      selectorMap: { componentType: 'valveType', boreMm: 'bore' },
      valueColumn: 'weight',
      sourceUnit: 'kg',
      canonicalUnit: 'kg',
    },
  });
}

function exactTarget(proposal, targetId = 'entity:1') {
  return buildEnrichmentTarget({ targetId, selector: proposal.selector });
}

function exactResolution(model, masterSnapshot, proposalRows, targets) {
  return resolveExactEnrichmentProposals({
    sourceDatasetHash: SHA_B,
    sourceSharedModelHash: model.semanticHash,
    masterSnapshots: [masterSnapshot],
    proposals: proposalRows,
    targets,
  });
}

test('all exact matches are projected as shadow candidate values', () => {
  const model = sharedModel();
  const masterSnapshot = snapshot();
  const proposalRows = proposals(masterSnapshot);
  const resolution = exactResolution(
    model,
    masterSnapshot,
    proposalRows,
    [exactTarget(proposalRows[0])],
  );
  const before = structuredClone(model);
  const candidate = buildShadowCandidateProjection({
    sourceSharedModel: model,
    resolution,
    proposals: proposalRows,
  });
  assert.equal(candidate.summary.status, 'READY_FOR_STRUCTURAL_IMPACT');
  assert.equal(candidate.rows[0].disposition, 'SHADOW_CANDIDATE_VALUE');
  assert.equal(candidate.rows[0].bindingCreated, false);
  assert.equal(candidate.bindingCreated, false);
  assert.equal(candidate.reviewSelectionCreated, false);
  assert.equal(candidate.approvalGranted, false);
  assert.equal(candidate.current, false);
  assert.equal(candidate.sealEligible, false);
  assert.equal(candidate.calculationEligible, false);
  assert.deepEqual(model, before);
  assert.equal(assertEngineeringEnrichmentCandidateProjection(candidate), candidate);
});

test('candidate projection is deterministic across proposal input order', () => {
  const model = sharedModel();
  const masterSnapshot = snapshot([
    { _sourceRowNumber: 2, bore: 50, valveType: 'VALVE', weight: 12 },
    { _sourceRowNumber: 3, bore: 80, valveType: 'VALVE', weight: 15 },
  ]);
  const proposalRows = proposals(masterSnapshot);
  const targets = proposalRows.map((proposal, index) => exactTarget(
    proposal,
    index === 0 ? 'entity:1' : `missing:${index}`,
  ));
  const resolution = exactResolution(
    model,
    masterSnapshot,
    proposalRows,
    targets,
  );
  const first = buildShadowCandidateProjection({
    sourceSharedModel: model,
    resolution,
    proposals: proposalRows,
  });
  const second = buildShadowCandidateProjection({
    sourceSharedModel: model,
    resolution,
    proposals: [...proposalRows].reverse(),
  });
  assert.equal(first.projectionHash, second.projectionHash);
  assert.deepEqual(first, second);
});

test('explicit source evidence blocks authorized-master shadow displacement', () => {
  const model = sharedModel({ explicitWeight: true });
  const masterSnapshot = snapshot();
  const proposalRows = proposals(masterSnapshot);
  const resolution = exactResolution(
    model,
    masterSnapshot,
    proposalRows,
    [exactTarget(proposalRows[0])],
  );
  const candidate = buildShadowCandidateProjection({
    sourceSharedModel: model,
    resolution,
    proposals: proposalRows,
  });
  assert.equal(candidate.summary.status, 'BLOCKED');
  assert.equal(
    candidate.rows[0].disposition,
    'BLOCKED_EXPLICIT_SOURCE_PRECEDENCE',
  );
  assert.equal(
    candidate.rows[0].blockers[0].code,
    'EXPLICIT_SOURCE_HAS_PRECEDENCE',
  );
  assert.equal(candidate.rows[0].existingExplicitEvidence.value, 9);
});

test('same-authority proposals for one target and field block each other', () => {
  const model = sharedModel();
  const masterSnapshot = snapshot([
    { _sourceRowNumber: 2, bore: 50, valveType: 'VALVE', weight: 12 },
    { _sourceRowNumber: 3, bore: 50, valveType: 'VALVE', weight: 13 },
  ]);
  const proposalRows = proposals(masterSnapshot);
  const resolution = exactResolution(
    model,
    masterSnapshot,
    proposalRows,
    [exactTarget(proposalRows[0])],
  );
  const candidate = buildShadowCandidateProjection({
    sourceSharedModel: model,
    resolution,
    proposals: proposalRows,
  });
  assert.equal(candidate.summary.status, 'BLOCKED');
  assert.ok(candidate.rows.every((row) => (
    row.disposition === 'BLOCKED_SAME_AUTHORITY_CONFLICT'
  )));
  assert.ok(candidate.rows.every((row) => (
    row.blockers[0].proposalIds.length === 2
  )));
});

test('unresolved proposals are retained and never projected', () => {
  const model = sharedModel();
  const masterSnapshot = snapshot();
  const proposalRows = proposals(masterSnapshot);
  const resolution = exactResolution(model, masterSnapshot, proposalRows, []);
  const candidate = buildShadowCandidateProjection({
    sourceSharedModel: model,
    resolution,
    proposals: proposalRows,
  });
  assert.equal(candidate.summary.status, 'BLOCKED');
  assert.equal(candidate.rows[0].targetId, null);
  assert.equal(candidate.rows[0].disposition, 'NOT_PROJECTED_UNRESOLVED');
  assert.equal(candidate.rows[0].bindingCreated, false);
});

test('stale or different shared-model authority is rejected', () => {
  const model = sharedModel();
  const masterSnapshot = snapshot();
  const proposalRows = proposals(masterSnapshot);
  const resolution = resolveExactEnrichmentProposals({
    sourceDatasetHash: SHA_B,
    sourceSharedModelHash: 'fnv1a64:0000000000000000',
    masterSnapshots: [masterSnapshot],
    proposals: proposalRows,
    targets: [exactTarget(proposalRows[0])],
  });
  assert.throws(() => buildShadowCandidateProjection({
    sourceSharedModel: model,
    resolution,
    proposals: proposalRows,
  }), /differs from resolution authority/u);
});

test('Step 2 report proves the sidecar changed no structural authority', () => {
  const model = sharedModel();
  const masterSnapshot = snapshot();
  const proposalRows = proposals(masterSnapshot);
  const resolution = exactResolution(
    model,
    masterSnapshot,
    proposalRows,
    [exactTarget(proposalRows[0])],
  );
  const candidate = buildShadowCandidateProjection({
    sourceSharedModel: model,
    resolution,
    proposals: proposalRows,
  });
  const report = buildEnrichmentStructuralImpactReport({
    sourceSharedModel: model,
    candidateProjection: candidate,
  });
  assert.equal(report.status, 'PASS_SHADOW_NO_STRUCTURAL_CHANGE');
  assert.equal(report.topologyChanged, false);
  assert.equal(report.sourceStructuralHash, report.candidateStructuralAuthorityHash);
  assert.ok(Object.values(report.changes).every((rows) => rows.length === 0));
  assert.equal(report.sealEligible, false);
  assert.equal(report.calculationEligible, false);
  assert.equal(assertEngineeringEnrichmentStructuralImpact(report), report);
});

test('tampered candidate structural authority is rejected', () => {
  const model = sharedModel();
  const masterSnapshot = snapshot();
  const proposalRows = proposals(masterSnapshot);
  const resolution = exactResolution(
    model,
    masterSnapshot,
    proposalRows,
    [exactTarget(proposalRows[0])],
  );
  const candidate = buildShadowCandidateProjection({
    sourceSharedModel: model,
    resolution,
    proposals: proposalRows,
  });
  const tampered = {
    ...candidate,
    sourceStructuralHash: 'fnv1a64:ffffffffffffffff',
  };
  assert.throws(() => buildEnrichmentStructuralImpactReport({
    sourceSharedModel: model,
    candidateProjection: tampered,
  }), /projectionHash is invalid/u);
});
