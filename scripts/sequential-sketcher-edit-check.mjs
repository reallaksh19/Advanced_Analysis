/**
 * Automated Verification Check for Sequential Sketcher Editing Operations.
 * Uses an explicit repository-local synthetic dataset; no developer-machine
 * benchmark path is part of this executable check.
 */
import assert from 'node:assert/strict';
import { SequentialCommandGateway } from '../src/workspace/sequential-sketcher/sequential-command-gateway.js';

console.log('=== VERIFYING SEQUENTIAL SKETCHER EDITING OPERATIONS ===');

let currentDataset = syntheticDataset();
const mockWorkspaceState = {
  getSnapshot: () => ({ dataset: currentDataset }),
  loadDataset: (dataset) => {
    currentDataset = dataset;
    return { dataset, status: 'ready' };
  },
};
const gateway = new SequentialCommandGateway(mockWorkspaceState, null);

const initialCount = currentDataset.entities.length;
const addRes = gateway.execute({ op: 'ADD_STRAIGHT', lengthMm: 1500, direction: 'X' });
assert.equal(addRes.status, 'applied', 'T01 ADD_STRAIGHT must apply.');
assert.equal(currentDataset.entities.length, initialCount + 1);
console.log('SEQUENTIAL-EDIT-T01 PASS ADD_STRAIGHT extended pipe segment.');

const pipeTarget = currentDataset.entities.find((entity) => entity.entityType === 'PIPE');
const splitRes = gateway.execute({ op: 'SPLIT_PIPE', targetEntityId: pipeTarget.entityId });
assert.equal(splitRes.status, 'applied', 'T02 SPLIT_PIPE must apply.');
assert.ok(currentDataset.entities.some((entity) => entity.name === 'JUNCTION SPLIT NODE'));
console.log('SEQUENTIAL-EDIT-T02 PASS SPLIT_PIPE inserted junction node.');

const stretchTarget = currentDataset.entities[0];
const stretchBefore = structuredClone(stretchTarget.properties.geometry.center);
const stretchRes = gateway.execute({
  op: 'STRETCH_NODE',
  targetEntityId: stretchTarget.entityId,
  offset: { x: 100, y: 50, z: 0 },
});
assert.equal(stretchRes.status, 'applied', 'T03 STRETCH_NODE must apply.');
const stretched = currentDataset.entities.find((entity) => entity.entityId === stretchTarget.entityId);
assert.deepEqual(stretched.properties.geometry.center, {
  x: stretchBefore.x + 100,
  y: stretchBefore.y + 50,
  z: stretchBefore.z,
});
console.log('SEQUENTIAL-EDIT-T03 PASS STRETCH_NODE updated coordinates.');

const elbowTarget = currentDataset.entities.find((entity) => entity.entityType === 'ELBO');
const rotateRes = gateway.execute({
  op: 'ROTATE_COMPONENT',
  targetEntityId: elbowTarget.entityId,
  angleDeg: 45,
});
assert.equal(rotateRes.status, 'applied', 'T04 ROTATE_COMPONENT must apply.');
assert.equal(
  currentDataset.entities.find((entity) => entity.entityId === elbowTarget.entityId)
    .properties.attributes.ROTATION,
  '45deg',
);
console.log('SEQUENTIAL-EDIT-T04 PASS ROTATE_COMPONENT updated angle.');

const supportTarget = currentDataset.entities.find((entity) => entity.entityType === 'SUPPORT');
const supportBefore = supportTarget.properties.geometry.center.x;
const supportRes = gateway.execute({
  op: 'MOVE_SUPPORT',
  targetEntityId: supportTarget.entityId,
  offsetMm: 200,
});
assert.equal(supportRes.status, 'applied', 'T05 MOVE_SUPPORT must apply.');
assert.equal(
  currentDataset.entities.find((entity) => entity.entityId === supportTarget.entityId)
    .properties.geometry.center.x,
  supportBefore + 200,
);
console.log('SEQUENTIAL-EDIT-T05 PASS MOVE_SUPPORT updated position.');

const deleteTarget = currentDataset.entities.at(-1);
const deleteRes = gateway.execute({
  op: 'RETIRE_COMPONENT',
  targetEntityId: deleteTarget.entityId,
});
assert.equal(deleteRes.status, 'applied', 'T06 RETIRE_COMPONENT must apply.');
assert.equal(
  currentDataset.entities.some((entity) => entity.entityId === deleteTarget.entityId),
  false,
);
console.log('SEQUENTIAL-EDIT-T06 PASS RETIRE_COMPONENT removed entity.');

assert.equal(gateway.undo(), true, 'T07 UNDO must restore the retired entity.');
assert.equal(
  currentDataset.entities.some((entity) => entity.entityId === deleteTarget.entityId),
  true,
);
console.log('SEQUENTIAL-EDIT-T07 PASS UNDO restored previous dataset state.');

assert.equal(gateway.redo(), true, 'T07 REDO must reapply retirement.');
assert.equal(
  currentDataset.entities.some((entity) => entity.entityId === deleteTarget.entityId),
  false,
);
console.log('SEQUENTIAL-EDIT-T07 PASS REDO reapplied operation.');

console.log('ALL SEQUENTIAL EDITING CHECKS PASSED SUCCESSFULLY');

function syntheticDataset() {
  return {
    schema: 'analysis-workspace-dataset/v1',
    datasetId: 'SEQUENTIAL-EDIT-SYNTHETIC-V1',
    version: 1,
    entities: [
      entity('PIPE-EDIT-1', 'PIPE', 'pipe', point(0, 0, 0), point(1000, 0, 0)),
      entity('ELBO-EDIT-1', 'ELBO', 'component', point(1000, 0, 0), point(1000, 500, 0)),
      entity('SUPPORT-EDIT-1', 'SUPPORT', 'support', point(500, 0, 0), point(500, 0, 0)),
    ],
  };
}

function entity(entityId, entityType, category, start, end) {
  return {
    entityId,
    name: entityId,
    entityType,
    category,
    properties: {
      identity: { entityId, name: entityId, entityType },
      geometry: {
        start,
        end,
        center: point(
          (start.x + end.x) / 2,
          (start.y + end.y) / 2,
          (start.z + end.z) / 2,
        ),
      },
      attributes: { TYPE: entityType },
    },
  };
}

function point(x, y, z) {
  return { x, y, z };
}
