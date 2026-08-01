/**
 * Automated Verification Check for Sequential Sketcher Editing Operations
 */
import assert from 'node:assert/strict';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { SequentialCommandGateway } from '../src/workspace/sequential-sketcher/sequential-command-gateway.js';
import { createSequentialSketcherCertificationFixture } from './sequential-sketcher-fixtures.mjs';

console.log('=== [SIMULATED] VERIFYING SEQUENTIAL SKETCHER EDITING OPERATIONS ===');

const rawPackage = createSequentialSketcherCertificationFixture();
const initialDataset = normalizeWorkspaceDataset(rawPackage, 'sequential-sketcher-certification-fixture.json');
assert.ok(initialDataset.entities.some((entity) => entity.entityType === 'PIPE'));
assert.ok(initialDataset.entities.some((entity) => entity.entityType === 'ELBO'));
assert.ok(initialDataset.entities.some((entity) => entity.category === 'support'));

let currentDataset = initialDataset;
const mockWorkspaceState = {
  getSnapshot: () => ({ dataset: currentDataset }),
  loadDataset: (dataset) => {
    currentDataset = dataset;
    return { dataset, status: 'ready' };
  },
};

const gateway = new SequentialCommandGateway(mockWorkspaceState, null);

// T01: Add Straight Pipe
const initialCount = currentDataset.entities.length;
const addTarget = currentDataset.entities.find((entity) => entity.entityType === 'PIPE');
const addStart = addTarget.properties.geometry.end;
const initialEntityIds = new Set(currentDataset.entities.map((entity) => entity.entityId));
const addRes = gateway.execute({
  op: 'ADD_STRAIGHT',
  targetEntityId: addTarget.entityId,
  lengthMm: 1500,
  direction: 'X',
});
assert.equal(addRes.status, 'applied');
assert.equal(currentDataset.entities.length, initialCount + 1);
const addedPipe = currentDataset.entities.find((entity) => !initialEntityIds.has(entity.entityId));
assert.equal(addedPipe.entityType, 'PIPE');
assert.deepEqual(addedPipe.properties.geometry.start, addStart);
assert.deepEqual(addedPipe.properties.geometry.end, {
  x: addStart.x + 1500,
  y: addStart.y,
  z: addStart.z,
});
console.log('SEQUENTIAL-EDIT-T01 PASS ADD_STRAIGHT extended pipe segment.');

// T02: Split Pipe
const countBeforeSplit = currentDataset.entities.length;
const pipeTarget = currentDataset.entities.find((entity) => entity.entityId === addTarget.entityId);
const splitStart = pipeTarget.properties.geometry.start;
const splitEnd = pipeTarget.properties.geometry.end;
const splitCenter = {
  x: (splitStart.x + splitEnd.x) / 2,
  y: (splitStart.y + splitEnd.y) / 2,
  z: (splitStart.z + splitEnd.z) / 2,
};
const splitRes = gateway.execute({ op: 'SPLIT_PIPE', targetEntityId: pipeTarget.entityId });
assert.equal(splitRes.status, 'applied');
assert.equal(currentDataset.entities.length, countBeforeSplit + 2);
assert.equal(currentDataset.entities.some((entity) => entity.entityId === pipeTarget.entityId), false);
const splitNode = currentDataset.entities.find((entity) =>
  entity.entityType === 'TEE' && entity.properties?.attributes?.EDIT_COMMAND_ID,
);
assert.ok(splitNode);
assert.deepEqual(splitNode.properties.geometry.center, splitCenter);
console.log('SEQUENTIAL-EDIT-T02 PASS SPLIT_PIPE inserted junction node.');

// T03: Stretch Node
const centerBeforeStretch = splitNode.properties.geometry.center;
const stretchOffset = { x: 100, y: 50, z: 0 };
const stretchRes = gateway.execute({
  op: 'STRETCH_NODE',
  targetEntityId: splitNode.entityId,
  offset: stretchOffset,
});
assert.equal(stretchRes.status, 'applied');
const stretchedNode = currentDataset.entities.find((entity) => entity.entityId === splitNode.entityId);
assert.deepEqual(stretchedNode.properties.geometry.center, {
  x: centerBeforeStretch.x + stretchOffset.x,
  y: centerBeforeStretch.y + stretchOffset.y,
  z: centerBeforeStretch.z + stretchOffset.z,
});
console.log('SEQUENTIAL-EDIT-T03 PASS STRETCH_NODE updated coordinates.');

// T04: Rotate Component
const elboTarget = currentDataset.entities.find((entity) => entity.entityType === 'ELBO');
const rotateRes = gateway.execute({
  op: 'ROTATE_COMPONENT',
  targetEntityId: elboTarget.entityId,
  angleDeg: 45,
});
assert.equal(rotateRes.status, 'applied');
assert.equal(
  currentDataset.entities.find((entity) => entity.entityId === elboTarget.entityId).properties.attributes.ANGL,
  '45degree',
);
console.log('SEQUENTIAL-EDIT-T04 PASS ROTATE_COMPONENT updated angle.');

// T05: Move Support
const supportTarget = currentDataset.entities.find((entity) => entity.category === 'support');
const supportCenter = supportTarget.properties.geometry.center;
const supportOffset = { x: 0, y: 0, z: 200 };
const supportRes = gateway.execute({
  op: 'MOVE_SUPPORT',
  targetEntityId: supportTarget.entityId,
  offset: supportOffset,
});
assert.equal(supportRes.status, 'applied');
assert.deepEqual(
  currentDataset.entities.find((entity) => entity.entityId === supportTarget.entityId).properties.geometry.center,
  {
    x: supportCenter.x,
    y: supportCenter.y,
    z: supportCenter.z + supportOffset.z,
  },
);
console.log('SEQUENTIAL-EDIT-T05 PASS MOVE_SUPPORT updated position.');

// T06: Retire Component
const countBeforeRetire = currentDataset.entities.length;
const retireEntityId = addedPipe.entityId;
const deleteRes = gateway.execute({ op: 'RETIRE_COMPONENT', targetEntityId: retireEntityId });
assert.equal(deleteRes.status, 'applied');
assert.equal(currentDataset.entities.length, countBeforeRetire - 1);
assert.equal(currentDataset.entities.some((entity) => entity.entityId === retireEntityId), false);
console.log('SEQUENTIAL-EDIT-T06 PASS RETIRE_COMPONENT removed entity.');

// T07: Undo & Redo
assert.equal(gateway.undo(), true);
assert.equal(currentDataset.entities.some((entity) => entity.entityId === retireEntityId), true);
console.log('SEQUENTIAL-EDIT-T07 PASS UNDO restored previous dataset state.');

assert.equal(gateway.redo(), true);
assert.equal(currentDataset.entities.some((entity) => entity.entityId === retireEntityId), false);
console.log('SEQUENTIAL-EDIT-T07 PASS REDO reapplied operation.');

console.log('\nALL SEQUENTIAL EDITING CHECKS PASSED SUCCESSFULLY');
