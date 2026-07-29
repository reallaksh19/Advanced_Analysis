import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  rectangularQ4Package,
  sparseRoundTripPackage,
  t3PlatePackage,
} from './lfea-005-fixtures.mjs';
import {
  createLfeaWorkbenchStore,
  executeLfeaWorkbench,
  resealLfeaMeshPackage,
} from '../src/workspace/lfea-workbench.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = [rectangularQ4Package({}), t3PlatePackage({}), sparseRoundTripPackage()];

for (const packageValue of fixtures) {
  const first = executeLfeaWorkbench(packageValue, {});
  const second = executeLfeaWorkbench(packageValue, {});
  assert.equal(first.status, 'QUALIFIED', `${packageValue.packageIdentity} [SIMULATED] fixture must qualify.`);
  assert.equal(first.result.status, 'QUALIFIED');
  assert.equal(first.review.status, 'QUALIFIED_FOR_REVIEW');
  assert.equal(first.evidenceExport.status, 'QUALIFIED_EXPORT');
  assert.equal(first.authorityPolicy.rawStress, 'AUTHORITATIVE_RAW_ELEMENT_OR_INTEGRATION_POINT_STRESS');
  assert.equal(first.authorityPolicy.projectedStress, 'NON_AUTHORITATIVE_REVIEW_PROJECTION');
  assert.equal(first.authorityPolicy.projectedStressForConvergence, 'PROHIBITED');
  assert.equal(first.result.semanticHash, second.result.semanticHash);
  assert.equal(first.review.semanticHash, second.review.semanticHash);
  assert.equal(first.evidenceExport.semanticHash, second.evidenceExport.semanticHash);
}

const packageValue = rectangularQ4Package({});
const store = createLfeaWorkbenchStore({ initialDocument: packageValue });
const originalHash = store.getState().packageValue.semanticHash;
store.moveNode('N2', 2.25, 0);
const editedHash = store.getState().packageValue.semanticHash;
assert.notEqual(editedHash, originalHash);
assert.equal(store.getState().execution, null);
store.undo();
assert.equal(store.getState().packageValue.semanticHash, originalHash);
store.redo();
assert.equal(store.getState().packageValue.semanticHash, editedHash);
assert.equal(store.run().status, 'QUALIFIED');
assert.equal(store.exportDocument().schema, 'lfea-workbench-document/v1');
assert.equal(store.exportEvidence().status, 'QUALIFIED_EXPORT');

// P0.2: a run started against one package must never become the current
// result if the package changed while the run was in flight (the async
// worker path can complete after an intervening edit).
const raceStore = createLfeaWorkbenchStore({ initialDocument: packageValue });
raceStore.beginRun();
const runInputHash = raceStore.getState().activeRunInputHash;
assert.equal(runInputHash, packageValue.semanticHash);
raceStore.moveNode('N2', 3, 0); // edit committed while "the worker" is still running
const staleExecution = executeLfeaWorkbench(resealLfeaMeshPackage(packageValue), {});
raceStore.completeRun(staleExecution);
assert.equal(raceStore.getState().execution, null, 'a stale execution must never become the current result');
assert.equal(raceStore.getState().diagnostics[0]?.code, 'LFEA_RUN_INPUT_STALE');
assert.notEqual(raceStore.getState().status, 'RUNNING');

// A run that completes without an intervening edit is accepted normally.
const noRaceStore = createLfeaWorkbenchStore({ initialDocument: packageValue });
noRaceStore.beginRun();
const currentExecution = executeLfeaWorkbench(noRaceStore.getState().packageValue, {});
noRaceStore.completeRun(currentExecution);
assert.equal(noRaceStore.getState().execution.status, 'QUALIFIED');
assert.equal(noRaceStore.getState().activeRunInputHash, null);

const forged = structuredClone(packageValue);
forged.nodes[0].x += 0.01;
const importStore = createLfeaWorkbenchStore(undefined);
importStore.importDocument(forged);
assert.equal(importStore.getState().status, 'FAILED');
assert.equal(importStore.getState().packageValue, null);

const singularDraft = structuredClone(packageValue);
singularDraft.analysisDefinition.constraints = [];
const singular = executeLfeaWorkbench(resealLfeaMeshPackage(singularDraft), {});
assert.equal(singular.status, 'FAILED');
assert.equal(singular.failedStage, 'SOLVER');
assert.equal(singular.result.status, 'REJECTED_SINGULAR');
assert.equal(singular.review, null);
assert.equal(singular.evidenceExport, null);

const workbenchFiles = fs.readdirSync(path.join(ROOT, 'src', 'workspace'))
  .filter((name) => name.startsWith('lfea-workbench') && name.endsWith('.js'));
const sourceText = workbenchFiles.map((name) => fs.readFileSync(path.join(ROOT, 'src', 'workspace', name), 'utf8')).join('\n');
assert.doesNotMatch(sourceText, /EventBus|analysis-context|workspace-consumer-context/u);

console.log(JSON.stringify({
  check: 'lfea-workbench',
  evidenceBasis: '[SIMULATED]/ANALYTICAL',
  status: 'PASS',
  qualifiedFixtures: fixtures.map((row) => row.packageIdentity),
  rawStressAuthority: 'AUTHORITATIVE_RAW_ELEMENT_OR_INTEGRATION_POINT_STRESS',
  projectedStressAuthority: 'NON_AUTHORITATIVE_REVIEW_PROJECTION',
  failClosed: true,
  workspaceCoupling: false,
}));
