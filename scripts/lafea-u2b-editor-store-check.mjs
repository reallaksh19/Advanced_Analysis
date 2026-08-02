#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { triangleSource as continuumFixture } from './lafea.3-fixtures.mjs';
import {
  createLafeaSetScalarCommand,
  createLafeaWorkbenchStore,
  lafeaDocumentDigest,
} from '../src/workspace/lafea-workbench.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE = path.join(ROOT, 'src', 'workspace');
const read = (name) => fs.readFileSync(path.join(WORKSPACE, name), 'utf8');

const store = createLafeaWorkbenchStore({
  initialStage: 'LAFEA.3',
  initialDocument: continuumFixture(),
  sessionId: 'U2B-CHECK',
});

assert.equal(typeof store.applyEditCommand, 'function');
assert.equal(typeof store.setScalar, 'function');
assert.equal(typeof store.replaceDocument, 'function');
assert.equal(typeof store.moveNode, 'function');
for (const prohibited of ['replaceCollection', 'updateRecord', 'addRecord', 'deleteRecord']) {
  assert.equal(store[prohibited], undefined, `${prohibited} must not remain as an array-index edit authority.`);
}

const initial = store.getState().stages['LAFEA.3'].document;
const initialDigest = lafeaDocumentDigest(initial);
const initialE = initial.materials[0].elasticModulus;
const edited = store.setScalar('LAFEA.3.material.elasticModulus', 'MAT', '210000');
assert.equal(edited.status, 'READY');
assert.equal(edited.stages['LAFEA.3'].document.materials[0].elasticModulus, 210000);
assert.equal(edited.stages['LAFEA.3'].document.materials[0].sourceReference, 'MATERIAL#MAT');
assert.equal(edited.stages['LAFEA.3'].past.length, 1);
assert.equal(edited.stages['LAFEA.3'].execution, null);
assert.equal(edited.stages['LAFEA.3'].lastEditResult.status, 'APPLIED');

store.undo();
assert.equal(store.getState().stages['LAFEA.3'].document.materials[0].elasticModulus, initialE);
store.redo();
assert.equal(store.getState().stages['LAFEA.3'].document.materials[0].elasticModulus, 210000);

const beforeBlank = store.getState().stages['LAFEA.3'].document;
const blankState = store.setScalar('LAFEA.3.material.elasticModulus', 'MAT', '   ');
assert.equal(blankState.status, 'FAILED');
assert.equal(blankState.stages['LAFEA.3'].document, beforeBlank);
assert.ok(blankState.diagnostics.some((row) => row.code === 'LAFEA_VALUE_STATE_NOT_ALLOWED'));

const weldStore = createLafeaWorkbenchStore({
  initialStage: 'LAFEA.6',
  initialDocument: {
    schema: 'lafea-weld-profile-placeholder/v1',
    identity: 'WELD-NOT-IMPLEMENTED',
  },
});
const weldBefore = weldStore.getState().stages['LAFEA.6'].document;
const weldEditState = weldStore.replaceDocument({ ...weldBefore, identity: 'EDITED-WELD' });
assert.equal(weldEditState.status, 'FAILED');
assert.equal(weldEditState.stages['LAFEA.6'].document, weldBefore);
assert.ok(weldEditState.diagnostics.some((row) => row.code === 'LAFEA_STAGE_EDIT_NOT_AUTHORIZED'));

const beforeReplace = store.getState().stages['LAFEA.3'].document;
const withDisplay = structuredClone(beforeReplace);
withDisplay.meshConfig = { density: 'FINE' };
store.replaceDocument(withDisplay);
assert.equal(store.getState().stages['LAFEA.3'].document.meshConfig.density, 'FINE');
const withoutDisplay = structuredClone(store.getState().stages['LAFEA.3'].document);
delete withoutDisplay.meshConfig;
store.replaceDocument(withoutDisplay);
assert.equal(Object.hasOwn(store.getState().stages['LAFEA.3'].document, 'meshConfig'), false);

const beforeMove = store.getState().stages['LAFEA.3'].document;
const nodeB = beforeMove.nodes.find((row) => row.nodeId === 'B');
const moved = store.moveNode('nodes', 'B', nodeB.x + 7, nodeB.y + 3);
assert.equal(moved.status, 'READY');
assert.equal(store.getState().stages['LAFEA.3'].document.nodes.find((row) => row.nodeId === 'B').x, nodeB.x + 7);
assert.equal(store.getState().stages['LAFEA.3'].document.nodes.find((row) => row.nodeId === 'B').y, nodeB.y + 3);
assert.equal(store.getState().stages['LAFEA.3'].past.length >= 1, true);

const wrongPath = store.moveNode('elements', 'B', 1, 2);
assert.equal(wrongPath.status, 'FAILED');
assert.ok(wrongPath.diagnostics.some((row) => row.code === 'LAFEA_NODE_PATH_NOT_AUTHORIZED'));

const staleDocument = store.getState().stages['LAFEA.3'].document;
const staleCommand = createLafeaSetScalarCommand({
  commandId: 'U2B-STALE',
  stageId: 'LAFEA.3',
  descriptorId: 'LAFEA.3.node.x',
  expectedDocumentDigest: lafeaDocumentDigest(staleDocument),
  entityId: 'B',
  rawText: '150',
  origin: { surface: 'PROGRAMMATIC', sessionId: 'U2B-CHECK', sequence: 900 },
});
store.setScalar('LAFEA.3.node.x', 'B', '151');
const staleState = store.applyEditCommand(staleCommand);
assert.equal(staleState.status, 'FAILED');
assert.ok(staleState.diagnostics.some((row) => row.code === 'LAFEA_STALE_DOCUMENT_DIGEST'));

assert.notEqual(lafeaDocumentDigest(store.getState().stages['LAFEA.3'].document), initialDigest);

const editorSource = [
  read('lafea-document-table.js'),
  read('lafea-document-table-renderers.js'),
  read('lafea-document-table-support.js'),
].join('\n');
const storeSource = read('lafea-workbench-store.js');
const controllerSource = read('lafea-workbench-controller.js');
const viewSource = read('lafea-workbench-view.js');

assert.match(editorSource, /lafeaStageInputDescriptors/u);
assert.match(editorSource, /Governed stage-specific inputs/u);
assert.match(editorSource, /whole-document replacement/u);
assert.match(editorSource, /Raw JSON replacement is not authorized/u);
assert.doesNotMatch(editorSource, /collectScalars|findCollections|stableColumns|recordIdentity/u);
assert.doesNotMatch(editorSource, /Number\([^)]*\)\s*\|\|\s*0/u);
assert.doesNotMatch(editorSource, /splice\s*\(|rowIndex|\.at\(-1\)/u);

assert.match(storeSource, /applyLafeaStageEditCommand/u);
assert.match(storeSource, /createLafeaSetScalarCommand/u);
assert.match(storeSource, /LAFEA_NODE_PATH_NOT_AUTHORIZED/u);
assert.doesNotMatch(storeSource, /function updateRecord|function deleteRecord|function replaceCollection/u);
assert.doesNotMatch(storeSource, /findIndex\([^\n]*identity|rowIndex === index/u);

assert.match(controllerSource, /onSetScalar/u);
assert.doesNotMatch(controllerSource, /onUpdateRecord|onDeleteRecord|updateRecordText|addRecordText/u);
assert.match(viewSource, /onSetScalar: this\.handlers\.onSetScalar/u);
assert.match(viewSource, /state\.activeStageId/u);

console.log(JSON.stringify({
  check: 'lafea-u2b-editor-store-command-migration',
  status: 'PASS',
  typedDescriptorEditor: true,
  immutableCommandStore: true,
  rawJsonWholeReplacement: true,
  arrayIndexEditAuthority: false,
  unimplementedStageEditing: false,
  lifecycleExpansion: false,
}));
