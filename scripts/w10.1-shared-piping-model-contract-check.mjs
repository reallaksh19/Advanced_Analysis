#!/usr/bin/env node

import assert from 'node:assert/strict';
import { canonicalStringify } from '../src/core/shared-piping-model/canonical-json.js';
import { buildSharedPipingModelFromCanonicalGeometry } from '../src/core/shared-piping-model/adapters/canonical-geometry-to-shared.js';
import { buildSharedPipingModelFromWorkspaceDataset } from '../src/core/shared-piping-model/adapters/workspace-dataset-to-shared.js';
import { projectSharedPipingModelToCalculationWorkspace } from '../src/core/shared-piping-model/adapters/shared-to-calculation-workspace.js';
import { projectSharedPipingModelToCanonicalGeometry } from '../src/core/shared-piping-model/adapters/shared-to-canonical-geometry.js';
import { validateSharedPipingModel } from '../src/core/shared-piping-model/shared-piping-model.js';
import { createSourcePackageSnapshot, validateSourcePackageSnapshot } from '../src/core/shared-piping-model/source-package-snapshot.js';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { indexWorkspaceSourcePackage, validateStagedModelIndex } from '../src/workspace/staged-model-index.js';
import {
  canonicalGeometryFixture,
  cyclicSourceGraph,
  duplicateAndMissingIdentityFixture,
  invalidChildrenFixture,
  lossyCanonicalFixture,
  repeatedReferenceGraph,
  stagedPackageFixture,
} from './w10.1-shared-model-fixtures.mjs';

console.log('\n--- W10.1 Shared Piping Model Contract Check ---');
checkSnapshotContract();
checkStagedIndexContract();
checkWorkspaceAdapter();
checkCanonicalAdapters();
checkCalculationProjection();
console.log('\n✅ W10.1 shared piping model contract check passed.\n');

function checkSnapshotContract() {
  const source = stagedPackageFixture();
  const reordered = reorderRootKeys(source);
  const first = createSourcePackageSnapshot({ datasetId: 'W10.1', sourceSchema: source.schema, sourcePackage: source });
  const second = createSourcePackageSnapshot({ datasetId: 'W10.1', sourceSchema: source.schema, sourcePackage: reordered });
  assert(validateSourcePackageSnapshot(first).ok);
  assert.equal(first.sourceSemanticHash, second.sourceSemanticHash);
  assert.equal(first.sourceByteHash, null);
  assert(first.diagnostics.some((row) => row.code === 'SOURCE_BYTES_UNAVAILABLE'));
  assert(Object.isFrozen(first.sourcePackage));
  console.log('✅ SourcePackageSnapshot.v1 validates semantic hashing and unavailable-byte evidence.');
}

function checkStagedIndexContract() {
  const duplicateDataset = normalizeWorkspaceDataset(duplicateAndMissingIdentityFixture(), 'duplicates.json');
  const index = duplicateDataset.sourceModel;
  assert(validateStagedModelIndex(index).ok);
  assert.equal(index.schema, 'staged-model-index/v2');
  assert.equal(index.validation.duplicateSourceIds.length, 1);
  assert.equal(index.validation.missingSourceIds.length, 1);
  assert.equal(index.indexes.bySourceEntityId.DUP.length, 2);
  assert.equal(new Set(index.nodes.map((node) => node.sourceNodeKey)).size, index.nodes.length);
  assert.equal(new Set(duplicateDataset.entities.map((row) => row.entityId)).size, duplicateDataset.entities.length);

  const invalid = directIndex(invalidChildrenFixture());
  assert.equal(invalid.validation.invalidChildren.length, 1);
  const repeated = directIndex(repeatedReferenceGraph());
  assert.equal(repeated.validation.repeatedChildReferences.length, 1);
  const cyclic = directIndex(cyclicSourceGraph());
  assert.equal(cyclic.validation.cycles.length, 1);
  console.log('✅ StagedModelIndex.v2 preserves source IDs and audits malformed source graphs.');
}

function checkWorkspaceAdapter() {
  const source = stagedPackageFixture();
  const before = canonicalStringify(source);
  const first = normalizeWorkspaceDataset(source, 'staged.json');
  const second = normalizeWorkspaceDataset(source, 'staged.json');
  const direct = buildSharedPipingModelFromWorkspaceDataset(first);
  assert.equal(canonicalStringify(source), before);
  assert(validateSharedPipingModel(first.sharedModel).ok);
  assert.equal(first.sharedModel.semanticHash, second.sharedModel.semanticHash);
  assert.equal(first.sharedModel.semanticHash, direct.semanticHash);
  assert.equal(canonicalStringify(first.sharedModel), canonicalStringify(second.sharedModel));
  assert.equal(first.sharedModel.summary.componentCount, 2);
  assert.equal(first.sharedModel.summary.supportCount, 1);
  assert.equal(first.sharedModel.summary.unconnectedPortCount, 2);
  assert(Object.isFrozen(first.sharedModel.components[0].engineeringProperties));
  assert.equal(first.sharedModel.sourceSnapshotRef.sourceSemanticHash, first.sourceSnapshot.sourceSemanticHash);
  console.log('✅ Workspace dataset adapter is deterministic, immutable, and source-preserving.');
}

function checkCanonicalAdapters() {
  const source = canonicalGeometryFixture();
  const before = canonicalStringify(source);
  const first = buildSharedPipingModelFromCanonicalGeometry(source);
  const second = buildSharedPipingModelFromCanonicalGeometry(source);
  assert(validateSharedPipingModel(first).ok);
  assert.equal(canonicalStringify(source), before);
  assert.equal(first.semanticHash, second.semanticHash);
  const projected = projectSharedPipingModelToCanonicalGeometry(first);
  assert.equal(projected.schemaVersion, 'canonical-geometry-v1');
  assert.equal(projected.unit, source.unit);
  assertCanonicalSegmentParity(source.segments[0], projected.segments[0]);
  assert.equal(projected.components[0].id, source.components[0].id);
  assert.equal(projected.components[0].nodeId, source.components[0].nodeId);
  assert.equal(projected.supports[0].id, source.supports[0].id);
  assert.equal(projected.supports[0].nodeId, source.supports[0].nodeId);

  const lossy = buildSharedPipingModelFromCanonicalGeometry(lossyCanonicalFixture());
  const codes = new Set(lossy.diagnostics.map((row) => row.code));
  assert(codes.has('CANONICAL_LOADS_EXCLUDED'));
  assert(codes.has('CANONICAL_MATERIALS_EXCLUDED'));
  assert(codes.has('CANONICAL_FIELD_UNSUPPORTED'));
  console.log('✅ Canonical adapters preserve supported fields and diagnose unsupported families.');
}

function checkCalculationProjection() {
  const dataset = normalizeWorkspaceDataset(stagedPackageFixture(), 'staged.json');
  const first = projectSharedPipingModelToCalculationWorkspace(dataset.sharedModel);
  const second = projectSharedPipingModelToCalculationWorkspace(dataset.sharedModel);
  assert.equal(first.schema, 'calculation-workspace/v1');
  assert.equal(canonicalStringify(first), canonicalStringify(second));
  assert.equal(first.dataset.objects.length, 3);
  assert.equal(first.dataset.supports.length, 1);
  const pipe = first.dataset.objects.find((row) => row.id === 'PIPE-1');
  const support = first.dataset.supports.find((row) => row.id === 'SUP-1');
  assert.equal(pipe.sourceAttributes.CHAINAGE_START_MM, 0);
  assert.equal(pipe.attributes.enrichment.weight.unitPipeWeightKgPerM, 28);
  assert.equal(pipe.attributes.enrichment.lineList.fluidWeightHydKgPerM, 15);
  assert.equal(support.sourceAttributes.VERTICAL_CAPABILITY, 'YES');
  assert.deepEqual(support.sourceAttributes.POS, { x: 500, y: 0, z: 0 });
  console.log('✅ Shared model projects directly and deterministically to calculation-workspace/v1.');
}

function directIndex(packageJson) {
  return indexWorkspaceSourcePackage(packageJson, packageJson.schema).model;
}

function reorderRootKeys(value) {
  return Object.fromEntries(Object.entries(value).reverse());
}

function assertCanonicalSegmentParity(expected, actual) {
  for (const field of ['id', 'startNodeId', 'endNodeId', 'type', 'length', 'diameter', 'thickness', 'material']) {
    assert.equal(actual[field], expected[field], `Canonical segment field mismatch: ${field}`);
  }
}
