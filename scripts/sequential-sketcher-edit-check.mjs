#!/usr/bin/env node

/**
 * Automated verification for sequential-sketcher editing operations.
 *
 * The check is repository-portable: it uses the governed workspace dataset
 * normalizer rather than an external developer-machine benchmark path.
 */
import assert from 'node:assert/strict';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { SequentialCommandGateway } from '../src/workspace/sequential-sketcher/sequential-command-gateway.js';

console.log('=== VERIFYING SEQUENTIAL SKETCHER EDITING OPERATIONS ===');

let currentDataset = canonicalFixture();
const mockWorkspaceState = {
  getSnapshot: () => ({ dataset: currentDataset }),
  loadDataset(dataset) {
    currentDataset = dataset;
    return { dataset, status: 'ready' };
  },
};
const gateway = new SequentialCommandGateway(mockWorkspaceState, null);

assert.equal(currentDataset.schema, 'analysis-workspace-dataset/v1');
assert.ok(currentDataset.sourceSnapshot, 'Canonical source snapshot is required.');
assert.ok(currentDataset.sourceModel, 'Canonical source model is required.');
assert.ok(currentDataset.sharedModel, 'Canonical shared model is required.');

// T01: Add Straight Pipe
const initialCount = currentDataset.entities.length;
const addTarget = requireEntity((entity) => entity.entityType === 'PIPE', 'PIPE');
const addResult = gateway.execute({
  op: 'ADD_STRAIGHT',
  targetEntityId: addTarget.entityId,
  lengthMm: 1500,
  direction: 'X',
});
assert.equal(addResult.status, 'applied', addResult.reason);
assert.equal(currentDataset.entities.length, initialCount + 1);
console.log('SEQUENTIAL-EDIT-T01 PASS ADD_STRAIGHT extended pipe segment.');

// T02: Split Pipe
const splitTarget = requireEntity(
  (entity) => entity.entityType === 'PIPE' && entity.entityId === addTarget.entityId,
  'original PIPE',
);
const splitResult = gateway.execute({
  op: 'SPLIT_PIPE',
  targetEntityId: splitTarget.entityId,
});
assert.equal(splitResult.status, 'applied', splitResult.reason);
console.log('SEQUENTIAL-EDIT-T02 PASS SPLIT_PIPE inserted junction node.');

// T03: Stretch Node
const stretchTarget = requireEntity((entity) => entity.entityType === 'PIPE', 'split PIPE');
const beforeStretch = structuredClone(stretchTarget.properties.geometry.start);
const stretchResult = gateway.execute({
  op: 'STRETCH_NODE',
  targetEntityId: stretchTarget.entityId,
  offset: { x: 100, y: 50, z: 0 },
});
assert.equal(stretchResult.status, 'applied', stretchResult.reason);
const afterStretch = requireEntity(
  (entity) => entity.entityId === stretchTarget.entityId,
  'stretched PIPE',
).properties.geometry.start;
assert.deepEqual(afterStretch, {
  x: beforeStretch.x + 100,
  y: beforeStretch.y + 50,
  z: beforeStretch.z,
});
console.log('SEQUENTIAL-EDIT-T03 PASS STRETCH_NODE updated coordinates.');

// T04: Rotate Component
const elbowTarget = requireEntity((entity) => entity.entityType === 'ELBO', 'ELBO');
const rotateResult = gateway.execute({
  op: 'ROTATE_COMPONENT',
  targetEntityId: elbowTarget.entityId,
  angleDeg: 45,
});
assert.equal(rotateResult.status, 'applied', rotateResult.reason);
assert.equal(
  requireEntity((entity) => entity.entityId === elbowTarget.entityId, 'rotated ELBO')
    .properties.attributes.ANGL,
  '45degree',
);
console.log('SEQUENTIAL-EDIT-T04 PASS ROTATE_COMPONENT updated angle.');

// T05: Move Support
const supportTarget = requireEntity((entity) => entity.category === 'support', 'SUPPORT');
const supportBefore = structuredClone(supportTarget.properties.geometry.center);
const supportResult = gateway.execute({
  op: 'MOVE_SUPPORT',
  targetEntityId: supportTarget.entityId,
  offset: { x: 0, y: 0, z: 200 },
});
assert.equal(supportResult.status, 'applied', supportResult.reason);
const supportAfter = requireEntity(
  (entity) => entity.entityId === supportTarget.entityId,
  'moved SUPPORT',
).properties.geometry.center;
assert.equal(supportAfter.z, supportBefore.z + 200);
console.log('SEQUENTIAL-EDIT-T05 PASS MOVE_SUPPORT updated position.');

// T06: Retire Component
const retireTarget = [...currentDataset.entities]
  .reverse()
  .find((entity) => entity.category !== 'support');
assert.ok(retireTarget, 'A retire target is required.');
const countBeforeRetire = currentDataset.entities.length;
const retireResult = gateway.execute({
  op: 'RETIRE_COMPONENT',
  targetEntityId: retireTarget.entityId,
});
assert.equal(retireResult.status, 'applied', retireResult.reason);
assert.equal(currentDataset.entities.length, countBeforeRetire - 1);
assert.equal(
  currentDataset.entities.some((entity) => entity.entityId === retireTarget.entityId),
  false,
);
console.log('SEQUENTIAL-EDIT-T06 PASS RETIRE_COMPONENT removed entity.');

// T07: Undo & Redo
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

function canonicalFixture() {
  const normalized = normalizeWorkspaceDataset({
    schema: 'inputxml-managed-stage/v1',
    packageHash: 'SEQUENTIAL-EDIT-CANONICAL-FIXTURE',
    unit: 'mm',
    project: { name: 'Sequential edit canonical fixture' },
    objects: [
      sourceObject('PIPE-1', 'PIPE', {
        startPoint: [0, 0, 0],
        endPoint: [1000, 0, 0],
        center: [500, 0, 0],
      }, { CUTLENGTH: '1000mm' }),
      sourceObject('ELBO-1', 'ELBO', {
        startPoint: [1000, 0, 0],
        endPoint: [1000, 500, 0],
        center: [1000, 0, 0],
      }, { ANGL: '90degree' }),
      sourceObject('SUPPORT-1', 'SUPP', {
        startPoint: [500, 0, 0],
        endPoint: [500, 0, 0],
        center: [500, 0, 0],
      }),
    ],
  }, '[SIMULATED] sequential editing verification fixture');
  return Object.freeze({ ...normalized, version: 1 });
}

function sourceObject(id, type, nativeParams, extraAttributes = {}) {
  return {
    id,
    name: id,
    type,
    sourcePath: `/${id}`,
    nativeParams,
    attributes: { TYPE: type, ...extraAttributes },
  };
}

function requireEntity(predicate, label) {
  const entity = currentDataset.entities.find(predicate);
  assert.ok(entity, `${label} entity is required.`);
  return entity;
}
