import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceFixture as attachmentFixture } from './lafea.1-fixtures.mjs';
import { rawRequestFixture as screeningFixture } from './lafea.2-fixtures.mjs';
import { triangleSource as continuumFixture } from './lafea.3-fixtures.mjs';
import { triangleSource as shellFixture } from './lafea.4-fixtures.mjs';
import { workflowSource as trunnionFixture } from './lafea.5-fixtures.mjs';
import {
  LAFEA_STAGE_IDS,
  createLafeaWorkbenchStore,
  executeLafeaStage,
} from '../src/workspace/lafea-workbench.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = Object.freeze({
  'LAFEA.1': attachmentFixture,
  'LAFEA.2': screeningFixture,
  'LAFEA.3': continuumFixture,
  'LAFEA.4': shellFixture,
  'LAFEA.5': trunnionFixture,
});

assert.deepEqual(LAFEA_STAGE_IDS, ['LAFEA.1', 'LAFEA.2', 'LAFEA.3', 'LAFEA.4', 'LAFEA.5']);

for (const stageId of LAFEA_STAGE_IDS) {
  const first = executeLafeaStage(stageId, FIXTURES[stageId]());
  const second = executeLafeaStage(stageId, FIXTURES[stageId]());
  assert.equal(first.status, 'QUALIFIED', `${stageId} [SIMULATED] analytical fixture must qualify.`);
  assert.equal(JSON.stringify(first.result), JSON.stringify(second.result), `${stageId} result must be deterministic.`);
  assert.equal(first.stageId, stageId);
  assert.equal(executeLafeaStage(stageId, first.canonicalInput).status, 'QUALIFIED', `${stageId} canonical import must reconstruct.`);
}

const store = createLafeaWorkbenchStore({
  initialStage: 'LAFEA.3',
  initialDocument: continuumFixture(),
});
const originalX = store.getState().stages['LAFEA.3'].document.nodes.find((row) => row.nodeId === 'B').x;
const nodeIndex = store.getState().stages['LAFEA.3'].document.nodes.findIndex((row) => row.nodeId === 'B');
const editedNode = { ...store.getState().stages['LAFEA.3'].document.nodes[nodeIndex], x: originalX + 10 };
store.updateRecord('nodes', nodeIndex, editedNode);
assert.equal(store.getState().stages['LAFEA.3'].document.nodes[nodeIndex].x, originalX + 10);
assert.equal(store.getState().stages['LAFEA.3'].execution, null);
store.undo();
assert.equal(store.getState().stages['LAFEA.3'].document.nodes[nodeIndex].x, originalX);
store.redo();
assert.equal(store.getState().stages['LAFEA.3'].document.nodes[nodeIndex].x, originalX + 10);
assert.equal(store.exportDocument().schema, 'lafea-workbench-document/v1');

const invalid = attachmentFixture();
invalid.pipeGeometry.outsideDiameter.value = -1;
const rejected = executeLafeaStage('LAFEA.1', invalid);
assert.equal(rejected.status, 'FAILED');
assert.equal(rejected.result, null);
assert.ok(rejected.diagnostics.some((row) => row.severity === 'ERROR'));

const workbenchFiles = fs.readdirSync(path.join(ROOT, 'src', 'workspace'))
  .filter((name) => name.startsWith('lafea-workbench') && name.endsWith('.js'));
const sourceText = workbenchFiles.map((name) => fs.readFileSync(path.join(ROOT, 'src', 'workspace', name), 'utf8')).join('\n');
assert.doesNotMatch(sourceText, /EventBus|analysis-context|workspace-consumer-context/u);

console.log(JSON.stringify({
  check: 'lafea-workbench',
  evidenceBasis: '[SIMULATED]/ANALYTICAL',
  status: 'PASS',
  qualifiedStages: [...LAFEA_STAGE_IDS],
  failClosed: true,
  workspaceCoupling: false,
}));
