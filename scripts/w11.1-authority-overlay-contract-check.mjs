#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import {
  ANALYSIS_AUTHORITY_OVERLAY_SCHEMA,
  requireAnalysisAuthorityOverlay,
  sealAnalysisAuthorityOverlay,
} from '../src/workspace/analysis-authority-overlay/index.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceId = 'benchmarks/1885Sjson/EnrichedSjson';
const targetBranchId = '/ASIM-1885-8"-S8810103-91261M7-HC-01/B1';
const sourceBytes = await readFile(resolve(root, sourceId));
const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
const dataset = normalizeWorkspaceDataset(
  JSON.parse(sourceBytes.toString('utf8')),
  sourceId,
  { sourceBytes, sourceSha256 },
);
const targetEntities = dataset.entities.filter((entity) => entity.branchId === targetBranchId);
assert.equal(targetEntities.length, 16, 'Owner-verified Benchmark B branch must retain 16 entities');
const support = targetEntities.find((entity) => entity.category === 'support');
assert.ok(support, 'target branch must retain a support entity for entity-level authority coverage');

const resolutionHash = (kind) => semanticHash({ fixture: 'M008-A', kind });
const evidence = (locator) => ({
  source: 'M008-A contract fixture',
  sourceKey: 'dataset',
  sourceHash: dataset.sourceSha256,
  locator,
});
const input = () => ({
  schema: ANALYSIS_AUTHORITY_OVERLAY_SCHEMA,
  overlayId: 'benchmark-b-1885-s8810103-b1-r1',
  revision: 1,
  datasetRef: {
    datasetId: dataset.datasetId,
    sourceId: dataset.sourceName,
    sourceSha256: dataset.sourceSha256,
    sourceSnapshotSemanticHash: dataset.sourceSnapshot.sourceSemanticHash,
  },
  scope: { kind: 'BRANCH', branchId: targetBranchId },
  authorityRecords: {
    materials: [{ materialStateId: 'MAT:A106-B:598.15K', resolutionSemanticHash: resolutionHash('material') }],
    sections: [{ sectionStateId: 'SEC:NPS8:SCH80', resolutionSemanticHash: resolutionHash('section') }],
    supports: [{ supportAuthorityId: 'SUP:PS-12228', resolutionSemanticHash: resolutionHash('support') }],
    loadCases: [{ loadCaseId: 'SUS', resolutionSemanticHash: resolutionHash('load-case') }],
  },
  assignments: {
    branches: [{
      branchId: targetBranchId,
      material: { value: { materialStateId: 'MAT:A106-B:598.15K' }, evidence: evidence('branch/material'), approved: true },
      section: { value: { sectionStateId: 'SEC:NPS8:SCH80' }, evidence: evidence('branch/section'), approved: true },
      loadCases: { value: { loadCaseIds: ['SUS'] }, evidence: evidence('branch/load-cases'), approved: true },
    }],
    entities: [{
      entityId: support.entityId,
      support: { value: { supportAuthorityId: 'SUP:PS-12228' }, evidence: evidence(support.jsonPointer), approved: true },
    }],
  },
  governance: {
    precedence: ['ENTITY', 'BRANCH'],
    missingAssignment: 'BLOCK',
    ambiguousAssignment: 'BLOCK',
    conflictingAssignment: 'BLOCK',
    orphanAssignment: 'BLOCK',
    staleEvidence: 'BLOCK',
  },
});

const sealed = sealAnalysisAuthorityOverlay(input(), { dataset });
assert.equal(requireAnalysisAuthorityOverlay(sealed, { dataset }), sealed);
assert.equal(Object.isFrozen(sealed), true);
assert.equal(Object.isFrozen(sealed.assignments.branches[0].material.evidence), true);
assert.equal(sealAnalysisAuthorityOverlay(input(), { dataset }).semanticHash, sealed.semanticHash);
assert.equal(sealAnalysisAuthorityOverlay(input(), { dataset }).evidenceHash, sealed.evidenceHash);

expectCode(() => {
  const draft = input(); draft.datasetRef.sourceSha256 = '0'.repeat(64);
  sealAnalysisAuthorityOverlay(draft, { dataset });
}, 'AUTHORITY_OVERLAY_DATASET_STALE');
expectCode(() => {
  const draft = input(); draft.scope.kind = 'LINE';
  sealAnalysisAuthorityOverlay(draft, { dataset });
}, 'AUTHORITY_OVERLAY_SCOPE_UNSUPPORTED');
expectCode(() => {
  const draft = input();
  draft.authorityRecords.materials.push({ materialStateId: 'MAT:A106-B:598.15K', resolutionSemanticHash: resolutionHash('other') });
  sealAnalysisAuthorityOverlay(draft, { dataset });
}, 'AUTHORITY_OVERLAY_RECORD_HASH_CONFLICT');
expectCode(() => {
  const draft = input(); draft.governance.precedence = ['BRANCH', 'ENTITY'];
  sealAnalysisAuthorityOverlay(draft, { dataset });
}, 'AUTHORITY_OVERLAY_PRECEDENCE_UNSUPPORTED');
expectCode(() => {
  const draft = input(); draft.governance.missingAssignment = 'WARN';
  sealAnalysisAuthorityOverlay(draft, { dataset });
}, 'AUTHORITY_OVERLAY_GOVERNANCE_UNSUPPORTED');
expectCode(() => {
  const draft = input(); draft.assignments.entities[0].entityId = 'missing-entity';
  sealAnalysisAuthorityOverlay(draft, { dataset });
}, 'AUTHORITY_OVERLAY_ASSIGNMENT_ORPHANED');
expectCode(() => {
  const stale = clone(sealed); stale.revision += 1;
  requireAnalysisAuthorityOverlay(stale, { dataset });
}, 'AUTHORITY_OVERLAY_HASH_MISMATCH');

console.log(JSON.stringify({
  check: 'w11.1-authority-overlay-contract',
  status: 'PASS',
  datasetId: dataset.datasetId,
  branchId: targetBranchId,
  entityCount: targetEntities.length,
  semanticHash: sealed.semanticHash,
  evidenceHash: sealed.evidenceHash,
}, null, 2));

function expectCode(action, code) {
  assert.throws(action, (error) => error?.code === code, `expected ${code}`);
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
