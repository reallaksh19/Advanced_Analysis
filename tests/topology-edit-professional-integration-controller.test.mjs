import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('production Load Calc routes through the combined professional controller', async () => {
  const loadCalc = await source('src/workspace/load-calc-consumer-controller.js');
  assert.match(
    loadCalc,
    /import\('\.\/topology-edit-3d-professional-controller\.js'\)/,
  );
  assert.doesNotMatch(
    loadCalc,
    /import\('\.\/topology-edit-3d-review-response-controller\.js'\)/,
  );
});

test('combined controller retains Track A and lifecycle composition', async () => {
  const controller = await source(
    'src/workspace/topology-edit-3d-professional-controller.js',
  );
  assert.match(controller, /topology-edit-3d-interaction-controller\.js/);
  assert.match(controller, /TopologyEditProfessionalOperationRuntime/);
  assert.match(controller, /professionalOperation: this\.professionalRuntime\.viewState\(\)/);
  assert.match(controller, /restoreViewState\(viewState\.professionalOperation\)/);
  assert.match(controller, /applyInteractionPreview\(\)/);
  assert.match(controller, /acceptAutofix\(\)/);
});

test('professional apply uses candidate validation and atomic transaction authority', async () => {
  const runtime = await source(
    'src/workspace/viewport-productivity/topology-edit-professional-operation-runtime.js',
  );
  assert.match(runtime, /prepareTopologyEditOperationCandidate/);
  assert.match(runtime, /canonicalTopology: candidate\.canonicalTopology/);
  assert.match(runtime, /previewTopologyEditOperationTransaction/);
  assert.match(runtime, /executeTopologyEditOperationTransaction/);
  assert.match(runtime, /undoTopologyEditOperationTransaction/);
  assert.match(runtime, /redoTopologyEditOperationTransaction/);
  assert.match(runtime, /autosaveAfterTransition/);
});

test('professional modules do not gain workspace, commit, or persistence authority', async () => {
  const paths = [
    'src/workspace/topology-edit/professional/topology-edit-canonical-id.js',
    'src/workspace/topology-edit/professional/topology-edit-operation-candidate.js',
    'src/workspace/topology-edit/professional/topology-edit-operation-transaction.js',
    'src/workspace/topology-edit/professional/topology-edit-validation-worker-client.js',
    'src/workspace/viewport-productivity/topology-edit-professional-operation-runtime.js',
  ];
  for (const path of paths) {
    const value = await source(path);
    assert.doesNotMatch(value, /WorkspaceState|commitPrepared|localStorage|setItem\(|removeItem\(/);
    assert.doesNotMatch(value, /Date\.now|new Date\(|Math\.random|randomUUID/);
  }
});

test('worker lifecycle uses module execution and actual termination', async () => {
  const client = await source(
    'src/workspace/topology-edit/professional/topology-edit-validation-worker-client.js',
  );
  const worker = await source(
    'src/workspace/topology-edit/professional/topology-edit-validation-worker.js',
  );
  assert.match(client, /new this\.WorkerCtor\(this\.workerUrl/);
  assert.match(client, /type: 'module'/);
  assert.match(client, /active\.worker\.terminate\(\)/);
  assert.match(worker, /executeTopologyEditValidationWorkerRequest/);
  assert.match(worker, /performance\.now\(\)/);
});
