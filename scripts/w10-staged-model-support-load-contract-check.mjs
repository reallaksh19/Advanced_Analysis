#!/usr/bin/env node

import assert from 'node:assert/strict';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { buildCalculationWorkspaceBridge } from '../src/workspace/calculation-workspace-bridge.js';
import { assessModelSupportLoadReadiness } from '../src/workspace/model-support-load-readiness.js';
import { STAGED_MODEL_INDEX_SCHEMA } from '../src/workspace/staged-model-index.js';

console.log('\n--- W10 Staged Model / Whole-Model Support Load Contract Check ---');

const rawPackage = fixture();
const original = JSON.stringify(rawPackage);
const dataset = normalizeWorkspaceDataset(rawPackage, 'w10-stage.json');

assert.equal(JSON.stringify(rawPackage), original, 'Import mutated the source package.');
assert.equal(dataset.sourceModel.schema, STAGED_MODEL_INDEX_SCHEMA);
assert.equal(dataset.sourceModel.summary.nodeCount, 5);
assert.equal(dataset.sourceModel.summary.rootCount, 1);
assert.equal(dataset.sourceModel.rootNodeIds.length, 1);
assert.equal(dataset.entities.length, 5);
assert.ok(Object.isFrozen(dataset.sourceModel));
assert.ok(Object.isFrozen(dataset.sourceModel.sourcePackage));

const root = dataset.sourceModel.nodes.find((node) => node.entityId === 'MODEL-ROOT');
const pipe = dataset.entities.find((entity) => entity.entityId === 'PIPE-1');
const valve = dataset.entities.find((entity) => entity.entityId === 'VALVE-1');
const support1 = dataset.entities.find((entity) => entity.entityId === 'SUP-1');
assert.equal(root.childNodeIds.length, 4);
assert.equal(pipe.parentSourceNodeId, root.nodeId);
assert.equal(pipe.sourceChildIndex, 0);
assert.equal(valve.sourceChildIndex, 1);
assert.equal(support1.sourceChildIndex, 2);
assert.equal(pipe.sourceDepth, 1);
assert.equal(pipe.sourcePath, '/MODEL/LINE-1/PIPE-1');
console.log('✅ Parent identity, child order, source tree, and source paths are preserved.');

const bridge = buildCalculationWorkspaceBridge(dataset);
assert.equal(bridge.schema, 'calculation-workspace-bridge/v1');
assert.equal(bridge.calculationWorkspace.schema, 'calculation-workspace/v1');
assert.equal(bridge.summary.objects, 3);
assert.equal(bridge.summary.supports, 2);
const bridgedPipe = bridge.calculationWorkspace.dataset.objects.find((item) => item.id === 'PIPE-1');
assert.equal(bridgedPipe.attributes.enrichment.weight.unitPipeWeightKgPerM, 10);
assert.equal(bridgedPipe.attributes.enrichment.lineList.fluidWeightOpeKgPerM, 2);
assert.equal(bridgedPipe.attributes.enrichment.lineList.fluidWeightHydKgPerM, 3);
console.log('✅ Preserved staged JSON is bridged into the existing calculation workspace with enrichment evidence.');

const readiness = assessModelSupportLoadReadiness(dataset);
assert.equal(readiness.schema, 'model-support-load-readiness/v1');
assert.equal(readiness.scope, 'MODEL');
assert.equal(readiness.elements.total, 2);
assert.equal(readiness.elements.excludedContainers, 1);
assert.equal(readiness.elements.opeReady, 2);
assert.equal(readiness.elements.hydReady, 2);
assert.equal(readiness.supports.total, 2);
assert.equal(readiness.supports.usable, 2);
assert.equal(readiness.legacyGlobalChainageEligible, true);
assert.equal(readiness.readyForRoutePartitionedDistribution, false);
assert.deepEqual(readiness.distributionBlockers, ['ROUTE_PARTITION_MODEL_NOT_BUILT']);
console.log('✅ Whole-model readiness counts all physical elements/supports and excludes the staged container node.');

console.log('\n✅ W10 staged-model bridge contract check passed.\n');

function fixture() {
  return {
    schema: 'inputxml-managed-stage/v1',
    packageHash: 'W10-STAGED-MODEL',
    objects: [{
      id: 'MODEL-ROOT',
      name: 'MODEL',
      type: 'BRANCH',
      sourcePath: '/MODEL',
      children: [
        {
          id: 'PIPE-1',
          name: 'PIPE-1',
          type: 'PIPE',
          sourcePath: '/MODEL/LINE-1/PIPE-1',
          nativeParams: { startPoint: [0, 0, 0], endPoint: [1000, 0, 0] },
          sourceAttributes: {
            CHAINAGE_START_MM: 0,
            CHAINAGE_END_MM: 1000,
            CHAINAGE_CENTER_MM: 500,
            LENGTH_MM: 1000,
          },
          enrichedAttributes: {
            pipeWeightKgPerM: 10,
            fluidWeightOpeKgPerM: 2,
            fluidWeightHydKgPerM: 3,
            insulationWeightKgPerM: 1,
          },
        },
        {
          id: 'VALVE-1',
          name: 'VALVE-1',
          type: 'VALVE',
          sourcePath: '/MODEL/LINE-1/VALVE-1',
          nativeParams: { center: [1500, 0, 0] },
          sourceAttributes: {
            CENTER: { x: 1500, y: 0, z: 0 },
            CHAINAGE_CENTER_MM: 1500,
          },
          enrichedAttributes: { componentWeightKg: 50 },
        },
        support('SUP-1', 0),
        support('SUP-2', 2000),
      ],
    }],
  };
}

function support(id, chainageMm) {
  return {
    id,
    name: id,
    type: 'SUPPORT',
    sourcePath: `/MODEL/LINE-1/${id}`,
    sourceAttributes: {
      POS: { x: chainageMm, y: 0, z: 0 },
      CHAINAGE_CENTER_MM: chainageMm,
      VERTICAL_CAPABILITY: 'YES',
      SUPPORT_TYPE: 'REST',
    },
  };
}
