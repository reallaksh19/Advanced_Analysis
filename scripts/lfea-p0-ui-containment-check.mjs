import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = process.env.LFEA_P0_CHECK_ROOT
  ? path.resolve(process.env.LFEA_P0_CHECK_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const source = (relativePath) => implementationText(
  fs.readFileSync(path.join(REPOSITORY_ROOT, relativePath), 'utf8'),
);

const layout = source('src/workspace/workspace-layout.js');
const bootstrap = source('src/workspace/bootstrap.js');
const client = source('src/workspace/lfea-worker-client.js');
const worker = source('src/workspace/lfea-worker.js');
const store = [
  source('src/workspace/lfea-workbench-store.js'),
  source('src/workspace/lfea-workbench-run-store.js'),
].join('\n');
const view = source('src/workspace/lfea-workbench-view.js');

assert.equal(occurrences(layout, 'data-role="lafea-consumer-root"'), 1,
  'workspace layout must contain exactly one LAFEA consumer root');
assert.equal(occurrences(layout, 'data-role="lfea-consumer-root"'), 1,
  'workspace layout must contain exactly one LFEA consumer root');
assert.match(layout, /application-view application-view--lafea[^>]*data-application-view="LAFEA"/u);
assert.match(layout, /application-view application-view--lfea[^>]*data-application-view="LFEA"/u);

assert.match(bootstrap,
  /const lafeaRoot = requireUniqueRoot\(rootElement, '\[data-role="lafea-consumer-root"\]'\)/u);
assert.match(bootstrap,
  /const lfeaRoot = requireUniqueRoot\(rootElement, '\[data-role="lfea-consumer-root"\]'\)/u);
assert.match(bootstrap, /new LafeaWorkbenchController\(lafeaRoot,/u);
assert.match(bootstrap, /new LfeaWorkbenchController\(lfeaRoot,/u);
assert.match(bootstrap, /if \(lafeaRoot === lfeaRoot\)/u);

for (const field of ['runId', 'inputSemanticHash', 'inputModelVersion']) {
  assert.match(client, new RegExp(`\\.\\.\\.current\\.identity|${field}`, 'u'),
    `worker client request must contain ${field}`);
  assert.match(worker, new RegExp(field, 'u'),
    `worker events must contain ${field}`);
}
assert.match(worker, /type: 'PROGRESS'[\s\S]*?\.\.\.identity/u);
assert.match(worker, /type: 'COMPLETE'[\s\S]*?\.\.\.identity/u);
assert.match(worker, /type: 'FAILURE'[\s\S]*?\.\.\.identity/u);
assert.match(client, /type: 'CANCELLED'[\s\S]*?\.\.\.current\.identity/u);

assert.match(store, /message\?\.runId !== activeRun\.runId/u);
assert.match(store, /message\?\.inputSemanticHash !== activeRun\.inputSemanticHash/u);
assert.match(store, /message\?\.inputModelVersion !== activeRun\.inputModelVersion/u);
assert.match(store, /state\.packageValue\?\.semanticHash !== activeRun\.inputSemanticHash/u);
assert.match(store, /LFEA_STALE_RESULT_REJECTED/u);
assert.match(store, /LFEA_RUN_CANCELLED_MODEL_CHANGED/u);
assert.match(store, /beforeCommittedMutation\(activeRun\)/u);

assert.match(view, /deformation:\s*\{[\s\S]*?enabled:[\s\S]*?scale: state\.display\.deformationScale/u);
assert.match(view, /state\.display\.resultMode/u);

if (process.env.LFEA_P0_SOURCE_ONLY !== '1') await runStoreChecks();

console.log(JSON.stringify({
  check: 'lfea-p0-ui-containment',
  status: 'PASS',
  repositoryRoot: REPOSITORY_ROOT,
  uniqueRoots: true,
  distinctBootstrapSelectors: true,
  workerRunIdentity: true,
  staleCompletionGuard: true,
  editDuringRunCancellation: true,
  explicitDeformationScale: true,
}));

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

function implementationText(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/(^|[^:])\/\/.*$/gmu, '$1');
}

async function runStoreChecks() {
  const { rectangularQ4Package } = await import('./lfea-005-fixtures.mjs');
  const {
    assertLfeaWorkbenchStateInvariants,
    createLfeaWorkbenchStore,
  } = await import('../src/workspace/lfea-workbench-store.js');
  const packageValue = rectangularQ4Package({});

  const editStore = createLfeaWorkbenchStore({ initialDocument: packageValue });
  const originalHash = editStore.getState().packageValue.semanticHash;
  editStore.beginRun();
  const nodeIndex = editStore.getState().packageValue.nodes.findIndex((row) => row.nodeId === 'N2');
  const node = editStore.getState().packageValue.nodes[nodeIndex];
  editStore.updateRecord('nodes', nodeIndex, { ...node, x: node.x + 0.01 });
  assert.equal(editStore.getState().status, 'READY');
  assert.equal(editStore.getState().activeRun, null);
  assert.equal(editStore.getState().execution, null);
  assert.notEqual(editStore.getState().packageValue.semanticHash, originalHash);
  assert.equal(editStore.getState().diagnostics[0].code, 'LFEA_RUN_CANCELLED_MODEL_CHANGED');

  const previewStore = createLfeaWorkbenchStore({ initialDocument: packageValue });
  const previewRun = previewStore.beginRun().activeRun;
  previewStore.previewNodeMove('N2', 2.01, 0);
  assert.equal(previewStore.getState().activeRun.runId, previewRun.runId);
  assert.equal(previewStore.getState().packageValue.semanticHash, originalHash);
  assert.equal(previewStore.getState().modelVersion, 1);

  const displayStore = createLfeaWorkbenchStore({ initialDocument: packageValue });
  displayStore.setResultMode('DEFORMED');
  assert.equal(displayStore.getState().display.resultMode, 'MODEL');
  assert.equal(displayStore.getState().diagnostics[0].code, 'LFEA_DEFORMED_UNAVAILABLE');
  assert.equal(displayStore.run().status, 'QUALIFIED');
  const beforeScale = displayStore.getState();
  displayStore.setDeformationScale(25);
  const afterScale = displayStore.getState();
  assert.equal(afterScale.packageValue.semanticHash, beforeScale.packageValue.semanticHash);
  assert.equal(afterScale.modelVersion, beforeScale.modelVersion);
  assert.equal(afterScale.past.length, beforeScale.past.length);
  assert.equal(afterScale.execution.runId, beforeScale.execution.runId);
  assert.equal(afterScale.display.deformationScale, 25);
  displayStore.setResultMode('DEFORMED');
  assert.equal(displayStore.getState().display.resultMode, 'DEFORMED');
  assert.equal(assertLfeaWorkbenchStateInvariants(displayStore.getState()), true);

  const staleStore = createLfeaWorkbenchStore({ initialDocument: packageValue });
  const active = staleStore.beginRun().activeRun;
  staleStore.completeRun({
    type: 'COMPLETE',
    runId: `${active.runId}-old`,
    inputSemanticHash: active.inputSemanticHash,
    inputModelVersion: active.inputModelVersion,
    execution: { status: 'QUALIFIED' },
  });
  assert.equal(staleStore.getState().execution, null);
  assert.equal(staleStore.getState().diagnostics[0].code, 'LFEA_RUN_ID_MISMATCH');
}
