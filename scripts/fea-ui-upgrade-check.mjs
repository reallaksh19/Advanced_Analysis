/**
 * Integration gate for the completed FEA UI upgrade.
 *
 * Input basis is retained project fixtures processed by the real kernels.
 * They are deterministic analytical/demo inputs and are reported [SIMULATED].
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculateLocalContinuum, createCanonicalLocalContinuumModel } from '../src/core/local-continuum/index.js';
import { createLafeaMockDocument } from '../src/workspace/advanced-mock-data.js';
import { presentLafeaResult, resolveLafeaUnits } from '../src/workspace/lafea-result-presenters/index.js';
import { selectShellSurfaceField } from '../src/workspace/lfea-field-adapter.js';
import { buildConvergenceStudy } from '../src/workspace/lfea-convergence-model.js';
import { QUALITY_METRICS, selectQualityField } from '../src/workspace/lfea-quality-adapter.js';
import { createLfeaWorkerClient } from '../src/workspace/lfea-worker-client.js';
import { executeLafeaStage } from '../src/workspace/lafea-workbench-model.js';
import {
  createLfeaWorkbenchAdapterProfile,
  createLfeaWorkbenchReviewProfile,
  executeLfeaWorkbench,
} from '../src/workspace/lfea-workbench-pipeline.js';
import { createLfeaWorkbenchStore } from '../src/workspace/lfea-workbench-store.js';
import { convergenceStudy } from './lfea-003-fixtures.mjs';
import { rectangularQ4Package, t3PlatePackage } from './lfea-005-fixtures.mjs';
import { triangleSource } from './lafea.3-fixtures.mjs';

class FakeWorker {
  constructor() {
    this.listeners = new Map();
    this.request = null;
    this.terminated = false;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  postMessage(value) {
    this.request = value;
  }

  emit(type, event) {
    this.listeners.get(type)?.(event);
  }

  terminate() {
    this.terminated = true;
  }
}

const stageIds = ['LAFEA.1', 'LAFEA.2', 'LAFEA.3', 'LAFEA.4', 'LAFEA.5', 'LAFEA.6'];
const presenterRows = {};
for (const stageId of stageIds) {
  const documentValue = createLafeaMockDocument(stageId);
  const execution = executeLafeaStage(stageId, documentValue);
  assert.equal(execution.status, 'QUALIFIED', `${stageId} must qualify.`);
  const units = resolveLafeaUnits(stageId, documentValue);
  const presentation = presentLafeaResult(stageId, execution.result, units);
  const rows = presentation.sections.flatMap((section) => section.rows);
  assert.ok(rows.length > 0, `${stageId} presenter must expose retained evidence.`);
  assert.ok(rows.every((row) => row.sourcePath && row.unit));
  presenterRows[stageId] = rows.length;
  if (stageId === 'LAFEA.4') {
    const field = selectShellSurfaceField(execution.result, units.stress);
    assert.equal(field.authority, 'AUTHORITATIVE_RAW_ELEMENT_OR_INTEGRATION_POINT_STRESS');
  }
}

const convergence = buildConvergenceStudy(convergenceStudy());
assert.equal(convergence.interpretation.status, 'QUALIFIED_INTERPRETATION_EVIDENCE');
assert.ok(convergence.interpretation.quantityResults.every(
  (row) => row.sourceAuthority === 'RAW_QUALIFIED_RESULT',
));
const projectedStudy = convergenceStudy();
projectedStudy.quantities[0].sourceAuthority = 'NON_AUTHORITATIVE_REVIEW_PROJECTION';
assert.throws(() => buildConvergenceStudy(projectedStudy), /prohibited/iu);

const q4Package = rectangularQ4Package({});
const progress = [];
const q4Execution = executeLfeaWorkbench(q4Package, {
  includeProjectedStress: true,
  onProgress: (event) => progress.push(event.stage),
});
assert.equal(q4Execution.status, 'QUALIFIED');
assert.deepEqual(progress, ['VALIDATE', 'PREFLIGHT', 'ADAPT', 'SOLVE', 'PROJECT', 'REVIEW', 'EXPORT', 'COMPLETE']);
const quality = selectQualityField(q4Execution.result, QUALITY_METRICS.JACOBIAN_RATIO);
const retainedQuality = q4Execution.result.elementQualityEvidence
  .find((row) => row.elementId === Object.keys(quality.byElement)[0])
  .evidence.jacobianDeterminantRatio;
assert.ok(Object.is(Object.values(quality.byElement)[0], retainedQuality));

const store = createLfeaWorkbenchStore({ initialDocument: q4Package });
const originalHash = store.getState().packageValue.semanticHash;
store.previewNodeMove('N2', 2.25, 0);
assert.equal(store.getState().packageValue.semanticHash, originalHash);
store.commitNodeMove();
assert.notEqual(store.getState().packageValue.semanticHash, originalHash);

const blockedProfile = {
  ...createLfeaWorkbenchAdapterProfile(),
  maximumNodes: 0,
};
const blocked = executeLfeaWorkbench(q4Package, {
  adapterProfile: blockedProfile,
  includeProjectedStress: false,
});
assert.equal(blocked.failedStage, 'PREFLIGHT');
assert.equal(blocked.adapterResult, null);

const solveOnly = executeLfeaWorkbench(q4Package, {
  includeProjectedStress: false,
  reviewProfile: {
    ...createLfeaWorkbenchReviewProfile(false, false),
    maximumExportBytes: 1,
  },
});
assert.equal(solveOnly.status, 'QUALIFIED');
assert.equal(solveOnly.review, null);
assert.equal(solveOnly.preflight.status, 'EXPORT_LIKELY_TO_EXCEED_BYTE_CAPACITY');

const crossKernel = crossKernelT3Evidence();
assert.ok(Math.abs(crossKernel.localSigmaX - crossKernel.elementSigmaX) < 1e-12);
assert.ok(Math.abs(crossKernel.localUx - crossKernel.elementUx) < 1e-12);

await verifyWorkerLifecycle();
verifySourceContracts();

console.log(JSON.stringify({
  check: 'fea-ui-upgrade',
  evidenceBasis: '[SIMULATED]/ANALYTICAL fixtures through real retained kernels',
  status: 'PASS',
  waves: ['UI-0', 'UI-1', 'UI-2', 'UI-3', 'UI-4', 'UI-5', 'UI-6', 'UI-7', 'UI-8'],
  presenterRows,
  crossKernel,
  workerLifecycle: 'IDENTIFIED_PROGRESS_AND_TERMINATING_CANCEL',
  incrementalWorkbenchShells: true,
  capacityGate: 'PREFLIGHT_FAIL_CLOSED_AND_SOLVE_ONLY_EXIT',
}));

function crossKernelT3Evidence() {
  const source = triangleSource();
  source.nodes[1].x = 2;
  source.nodes[2].y = 1;
  source.materials[0].elasticModulus = 100;
  source.materials[0].poissonRatio = 0.25;
  source.elements[0].thickness = 1;
  source.loadCases = [source.loadCases[0]];
  source.loadCases[0].nodalForces[0].fx = 1;
  source.resultRequests.loadCaseIds = ['L1'];
  const local = calculateLocalContinuum(createCanonicalLocalContinuumModel(source));
  assert.equal(local.qualification.state, 'ACCEPTED');
  const element = executeLfeaWorkbench(t3PlatePackage({}), {
    includeProjectedStress: false,
    untilStage: 'SOLVE',
  });
  return {
    localSigmaX: local.loadCaseResults[0].elementResults[0].stress.sigmaX,
    elementSigmaX: element.result.elementStresses[0].values[0],
    localUx: local.loadCaseResults[0].nodalDisplacements
      .find((row) => row.nodeId === 'B').ux,
    elementUx: element.result.nodalDisplacements
      .find((row) => row.nodeId === 'N2' && row.component === 'UX').value,
  };
}

async function verifyWorkerLifecycle() {
  let worker;
  const client = createLfeaWorkerClient(() => {
    worker = new FakeWorker();
    return worker;
  });
  const firstIdentity = {
    runId: 'fea-ui-upgrade-run-1',
    inputSemanticHash: 'fea-ui-upgrade-hash-1',
    inputModelVersion: 1,
  };
  const progressEvents = [];
  const completion = client.run({}, firstIdentity, {
    onProgress: (value) => progressEvents.push(value),
  });
  const requestId = worker.request.requestId;
  worker.emit('message', {
    data: {
      type: 'PROGRESS',
      requestId,
      ...firstIdentity,
      progress: { stage: 'SOLVE' },
    },
  });
  worker.emit('message', {
    data: {
      type: 'COMPLETE',
      requestId,
      ...firstIdentity,
      execution: { status: 'QUALIFIED' },
    },
  });
  const completionMessage = await completion;
  assert.equal(completionMessage.execution.status, 'QUALIFIED');
  assert.equal(completionMessage.runId, firstIdentity.runId);
  assert.deepEqual(progressEvents[0].progress, { stage: 'SOLVE' });
  assert.equal(progressEvents[0].inputSemanticHash, firstIdentity.inputSemanticHash);

  const secondIdentity = {
    runId: 'fea-ui-upgrade-run-2',
    inputSemanticHash: 'fea-ui-upgrade-hash-2',
    inputModelVersion: 2,
  };
  const cancelled = client.run({}, secondIdentity, { onProgress: () => {} });
  const cancellation = client.cancel();
  assert.equal(cancellation.code, 'LFEA_RUN_CANCELLED');
  assert.equal(cancellation.runId, secondIdentity.runId);
  await assert.rejects(cancelled, { name: 'AbortError' });
}

function verifySourceContracts() {
  const tableSource = fs.readFileSync(new URL('../src/workspace/lfea-workbench-tables.js', import.meta.url), 'utf8');
  const lfeaView = fs.readFileSync(new URL('../src/workspace/lfea-workbench-view.js', import.meta.url), 'utf8');
  const lafeaView = fs.readFileSync(new URL('../src/workspace/lafea-workbench-view.js', import.meta.url), 'utf8');
  assert.match(tableSource, /PAGE_SIZE = 100/u);
  assert.match(tableSource, /Showing \$\{total \? start \+ 1 : 0\}/u);
  assert.doesNotMatch(tableSource, /slice\(0,\s*200\)/u);
  assert.doesNotMatch(lfeaView, /rootElement\.replaceChildren\(section\)/u);
  assert.doesNotMatch(lafeaView, /rootElement\.replaceChildren\(section\)/u);
}
