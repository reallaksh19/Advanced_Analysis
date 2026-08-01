#!/usr/bin/env node

/** Repository-portable sequential-sketcher editing verification. */
import assert from 'node:assert/strict';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { SequentialCommandGateway } from '../src/workspace/sequential-sketcher/sequential-command-gateway.js';

console.log('=== VERIFYING SEQUENTIAL SKETCHER EDITING OPERATIONS ===');

let currentDataset = canonicalFixture();
const workspaceState = {
  getSnapshot: () => ({ dataset: currentDataset }),
  loadDataset(dataset) {
    currentDataset = dataset;
    return { dataset, status: 'ready' };
  },
};
const gateway = new SequentialCommandGateway(workspaceState, null);

assert.equal(currentDataset.schema, 'analysis-workspace-dataset/v1');
assert.ok(currentDataset.sourceSnapshot);
assert.ok(currentDataset.sourceModel);
assert.ok(currentDataset.sharedModel);

const initialCount = currentDataset.entities.length;
const originalPipe = requireEntity((row) => row.entityType === 'PIPE', 'PIPE');
apply('T01', {
  op: 'ADD_STRAIGHT',
  targetEntityId: originalPipe.entityId,
  lengthMm: 1500,
  direction: 'X',
});
assert.equal(currentDataset.entities.length, initialCount + 1);

apply('T02', {
  op: 'SPLIT_PIPE',
  targetEntityId: originalPipe.entityId,
});

const stretchTarget = requireEntity((row) => row.entityType === 'PIPE', 'split PIPE');
const beforeStretch = structuredClone(stretchTarget.properties.geometry.start);
apply('T03', {
  op: 'STRETCH_NODE',
  targetEntityId: stretchTarget.entityId,
  offset: { x: 100, y: 50, z: 0 },
});
assert.deepEqual(
  requireEntity((row) => row.entityId === stretchTarget.entityId, 'stretched PIPE')
    .properties.geometry.start,
  { x: beforeStretch.x + 100, y: beforeStretch.y + 50, z: beforeStretch.z },
);

const elbow = requireEntity((row) => row.entityType === 'ELBO', 'ELBO');
apply('T04', {
  op: 'ROTATE_COMPONENT',
  targetEntityId: elbow.entityId,
  angleDeg: 45,
});
assert.equal(
  requireEntity((row) => row.entityId === elbow.entityId, 'rotated ELBO')
    .properties.attributes.ANGL,
  '45degree',
);

const support = requireEntity((row) => row.category === 'support', 'SUPPORT');
const supportBefore = structuredClone(support.properties.geometry.center);
apply('T05', {
  op: 'MOVE_SUPPORT',
  targetEntityId: support.entityId,
  offset: { x: 0, y: 0, z: 200 },
});
assert.equal(
  requireEntity((row) => row.entityId === support.entityId, 'moved SUPPORT')
    .properties.geometry.center.z,
  supportBefore.z + 200,
);

const retireTarget = [...currentDataset.entities]
  .reverse()
  .find((row) => row.category !== 'support');
assert.ok(retireTarget);
const countBeforeRetire = currentDataset.entities.length;
apply('T06', {
  op: 'RETIRE_COMPONENT',
  targetEntityId: retireTarget.entityId,
});
assert.equal(currentDataset.entities.length, countBeforeRetire - 1);
assert.equal(currentDataset.entities.some((row) => row.entityId === retireTarget.entityId), false);

assert.equal(gateway.undo(), true);
assert.equal(currentDataset.entities.length, countBeforeRetire);
console.log('SEQUENTIAL-EDIT-T07 PASS UNDO restored previous dataset state.');
assert.equal(gateway.redo(), true);
assert.equal(currentDataset.entities.length, countBeforeRetire - 1);
console.log('SEQUENTIAL-EDIT-T07 PASS REDO reapplied operation.');

assert.equal(gateway.history.length, 6);
assert.equal(gateway.future.length, 0);
assert.ok(currentDataset.sourceSnapshot);
assert.ok(currentDataset.sourceModel);
assert.ok(currentDataset.sharedModel);

console.log(JSON.stringify({
  check: 'sequential-sketcher-edit',
  status: 'PASS',
  fixture: 'CANONICAL_SYNTHETIC_WORKSPACE_DATASET',
  externalPathRequired: false,
  operationCount: 6,
  undoRedoPassed: true,
  canonicalLineageRetained: true,
}));

function apply(caseId, command) {
  const result = gateway.execute(command);
  assert.equal(result.status, 'applied', result.reason);
  console.log(`SEQUENTIAL-EDIT-${caseId} PASS ${command.op}.`);
}

function canonicalFixture() {
  const normalized = normalizeWorkspaceDataset({
    schema: 'inputxml-managed-stage/v1',
    packageHash: 'SEQUENTIAL-EDIT-CANONICAL-FIXTURE',
    unit: 'mm',
    project: { name: 'Sequential edit canonical fixture' },
    objects: [
      sourceObject('PIPE-1', 'PIPE', [0, 0, 0], [1000, 0, 0], {
        CUTLENGTH: '1000mm',
      }),
      sourceObject('ELBO-1', 'ELBO', [1000, 0, 0], [1000, 500, 0], {
        ANGL: '90degree',
      }),
      sourceObject('SUPPORT-1', 'SUPPORT', [500, 0, 0], [500, 0, 0]),
    ],
  }, '[SIMULATED] sequential editing verification fixture');
  return Object.freeze({ ...normalized, version: 1 });
}

function sourceObject(id, type, startPoint, endPoint, attributes = {}) {
  return {
    id,
    name: id,
    type,
    sourcePath: `/${id}`,
    nativeParams: {
      startPoint,
      endPoint,
      center: midpoint(startPoint, endPoint),
    },
    attributes: { TYPE: type, ...attributes },
  };
}

function midpoint(start, end) {
  return start.map((value, index) => (value + end[index]) / 2);
}

function requireEntity(predicate, label) {
  const entity = currentDataset.entities.find(predicate);
  assert.ok(entity, `${label} entity is required.`);
  return entity;
}
