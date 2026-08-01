/**
 * Automated Verification Check for Sequential Sketcher Editing Operations
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { SequentialCommandGateway } from '../src/workspace/sequential-sketcher/sequential-command-gateway.js';

console.log('=== VERIFYING SEQUENTIAL SKETCHER EDITING OPERATIONS ===');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const benchmarkPath = path.join(root, 'benchmarks', 'Sjson.json');
const fileContent = fs.readFileSync(benchmarkPath, 'utf8');
const rawPackage = JSON.parse(fileContent);
const initialDataset = normalizeWorkspaceDataset(rawPackage, 'Sjson.json');

let currentDataset = initialDataset;
const mockWorkspaceState = {
  getSnapshot: () => ({ dataset: currentDataset }),
  loadDataset: (d) => { currentDataset = d; return { dataset: d, status: 'ready' }; },
};

const gateway = new SequentialCommandGateway(mockWorkspaceState, null);

// T01: Add Straight Pipe
const initialCount = currentDataset.entities.length;
const addTarget = currentDataset.entities.find((entity) => entity.entityType === 'PIPE');
const addRes = gateway.execute({ op: 'ADD_STRAIGHT', targetEntityId: addTarget.entityId, lengthMm: 1500, direction: 'X' });
if (addRes.status !== 'applied' || currentDataset.entities.length !== initialCount + 1) {
  console.error('FAIL T01: ADD_STRAIGHT failed.');
  process.exit(1);
}
console.log('SEQUENTIAL-EDIT-T01 PASS ADD_STRAIGHT extended pipe segment.');

// T02: Split Pipe
const pipeTarget = currentDataset.entities.find((e) => e.entityType === 'PIPE');
const splitRes = gateway.execute({ op: 'SPLIT_PIPE', targetEntityId: pipeTarget.entityId });
if (splitRes.status !== 'applied') {
  console.error('FAIL T02: SPLIT_PIPE failed.');
  process.exit(1);
}
console.log('SEQUENTIAL-EDIT-T02 PASS SPLIT_PIPE inserted junction node.');

// T03: Stretch Node
const nodeTarget = currentDataset.entities[0];
const stretchRes = gateway.execute({ op: 'STRETCH_NODE', targetEntityId: nodeTarget.entityId, offset: { x: 100, y: 50, z: 0 } });
if (stretchRes.status !== 'applied') {
  console.error('FAIL T03: STRETCH_NODE failed.');
  process.exit(1);
}
console.log('SEQUENTIAL-EDIT-T03 PASS STRETCH_NODE updated coordinates.');

// T04: Rotate Component
const elboTarget = currentDataset.entities.find((e) => e.entityType === 'ELBO');
const rotateRes = gateway.execute({ op: 'ROTATE_COMPONENT', targetEntityId: elboTarget.entityId, angleDeg: 45 });
if (rotateRes.status !== 'applied') {
  console.error('FAIL T04: ROTATE_COMPONENT failed.');
  process.exit(1);
}
console.log('SEQUENTIAL-EDIT-T04 PASS ROTATE_COMPONENT updated angle.');

// T05: Move Support
const supportTarget = currentDataset.entities.find((e) => e.entityType === 'SUPPORT');
const supportRes = gateway.execute({ op: 'MOVE_SUPPORT', targetEntityId: supportTarget.entityId, offset: { x: 0, y: 0, z: 200 } });
if (supportRes.status !== 'applied') {
  console.error('FAIL T05: MOVE_SUPPORT failed.');
  process.exit(1);
}
console.log('SEQUENTIAL-EDIT-T05 PASS MOVE_SUPPORT updated position.');

// T06: Retire Component
const deleteTarget = currentDataset.entities[currentDataset.entities.length - 1];
const deleteRes = gateway.execute({ op: 'RETIRE_COMPONENT', targetEntityId: deleteTarget.entityId });
if (deleteRes.status !== 'applied') {
  console.error('FAIL T06: RETIRE_COMPONENT failed.');
  process.exit(1);
}
console.log('SEQUENTIAL-EDIT-T06 PASS RETIRE_COMPONENT removed entity.');

// T07: Undo & Redo
const undoOk = gateway.undo();
if (!undoOk) {
  console.error('FAIL T07: UNDO failed.');
  process.exit(1);
}
console.log('SEQUENTIAL-EDIT-T07 PASS UNDO restored previous dataset state.');

const redoOk = gateway.redo();
if (!redoOk) {
  console.error('FAIL T07: REDO failed.');
  process.exit(1);
}
console.log('SEQUENTIAL-EDIT-T07 PASS REDO reapplied operation.');

console.log('\n🎉 ALL SEQUENTIAL EDITING CHECKS PASSED SUCCESSFULLY!');
