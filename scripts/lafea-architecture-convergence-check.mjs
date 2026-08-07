#!/usr/bin/env node
import assert from 'node:assert/strict';
import { triangleSource } from './lafea.3-fixtures.mjs';
import {
  LAFEA_STAGE_ANALYSIS_ADAPTER_SCHEMA,
  LAFEA_WORKBENCH_ORCHESTRATION_SCHEMA,
  LAFEA_WORKBENCH_ORCHESTRATION_ORDER,
  createLafeaWorkbenchStore,
  requireLafeaStageAnalysisAdapter,
} from '../src/workspace/lafea-lifecycle-workbench-store.js';

const expected = Object.freeze({
  'LAFEA.1': [], 'LAFEA.2': [], 'LAFEA.3': ['T3', 'T6', 'Q8'],
  'LAFEA.4': ['CST_DKT_TRI3_THIN_SHELL_V1'],
  'LAFEA.5': ['CST_DKT_TRI3_THIN_SHELL_V1'], 'LAFEA.6': [],
});
for (const [stageId, families] of Object.entries(expected)) {
  const adapter = requireLafeaStageAnalysisAdapter(stageId);
  assert.equal(adapter.schema, LAFEA_STAGE_ANALYSIS_ADAPTER_SCHEMA);
  assert.equal(adapter.stageId, stageId);
  assert.deepEqual(adapter.discretization.allowedElementFamilies, families);
  assert.equal(adapter.discretization.generationAuthorized, false);
  assert.equal(adapter.discretization.refinementAuthorized, false);
  assert.equal(adapter.preparation.qualified, stageId !== 'LAFEA.6');
  assert.equal(adapter.preparation.producerQualified, false);
  assert.equal(adapter.release.qualified, false);
  assert.ok(Object.isFrozen(adapter));
}
assert.equal(requireLafeaStageAnalysisAdapter('LAFEA.3').discretization.sourceNodePath, 'nodes');
assert.equal(requireLafeaStageAnalysisAdapter('LAFEA.5').discretization.sourceNodePath, 'shellTemplate.nodes');

const stageId = 'LAFEA.3';
const store = createLafeaWorkbenchStore({ initialStage: stageId, initialDocument: triangleSource() });
let stage = store.getState().stages[stageId];
assert.equal(stage.orchestration.schema, LAFEA_WORKBENCH_ORCHESTRATION_SCHEMA);
assert.deepEqual(stage.orchestration.order, LAFEA_WORKBENCH_ORCHESTRATION_ORDER);
assert.equal(stage.orchestration.sections.SOURCE.state, 'BLOCKED');
assert.ok(stage.orchestration.sections.SOURCE.reasons.includes('LIFECYCLE_NOT_INITIALIZED'));
assert.equal(stage.orchestration.sections.MODEL.state, 'NOT_STARTED');
assert.equal(stage.orchestration.sections.PREPARATION.state, 'NOT_STARTED');
assert.equal(stage.orchestration.sections.DISCRETIZATION.state, 'NOT_STARTED');
assert.equal(stage.orchestration.sections.AUTHORIZATION.state, 'BLOCKED');
assert.equal(stage.orchestration.sections.EXECUTION.state, 'NOT_STARTED');
assert.equal(stage.orchestration.sections.RESULTS.state, 'NOT_STARTED');
assert.equal(stage.orchestration.sections.RELEASE.state, 'BLOCKED');
assert.deepEqual(stage.orchestration.sections.RELEASE.reasons, ['RELEASE_NOT_QUALIFIED']);

let publications = 0;
let secondaryPublications = 0;
store.subscribe(() => { publications += 1; throw new Error('subscriber failure must remain isolated'); });
store.subscribe(() => { secondaryPublications += 1; });
const nodeB = stage.document.nodes.find((row) => row.nodeId === 'B');
store.setScalar('LAFEA.3.node.x', 'B', String(nodeB.x + 25), 'WP-AC1');
assert.equal(publications, 1);
assert.equal(secondaryPublications, 1);
stage = store.getState().stages[stageId];
assert.equal(stage.orchestration.sections.SOURCE.state, 'COMPLETE');
assert.equal(stage.lifecycleBinding.status, 'CURRENT');
assert.equal(stage.lifecycle.artifacts.CANONICAL_MODEL.status, 'ABSENT');

store.run();
assert.equal(publications, 2);
assert.equal(secondaryPublications, 2);
stage = store.getState().stages[stageId];
assert.equal(stage.execution.status, 'QUALIFIED');
assert.equal(stage.orchestration.sections.MODEL.state, 'COMPLETE');
assert.equal(stage.orchestration.sections.PREPARATION.state, 'BLOCKED');
assert.ok(stage.orchestration.sections.PREPARATION.reasons.includes('LAFEA_PREPARATION_PRODUCER_NOT_QUALIFIED'));
assert.equal(stage.orchestration.sections.DISCRETIZATION.state, 'NOT_STARTED');
assert.equal(stage.orchestration.sections.AUTHORIZATION.state, 'BLOCKED');
assert.ok(stage.orchestration.sections.AUTHORIZATION.reasons.includes('LAFEA_PREPARATION_PRODUCER_NOT_QUALIFIED'));
assert.equal(stage.orchestration.sections.EXECUTION.state, 'COMPLETE');
assert.equal(stage.orchestration.sections.RESULTS.state, 'COMPLETE');
assert.equal(stage.orchestration.sections.RELEASE.state, 'BLOCKED');
assert.equal(stage.lifecycleReadiness.releaseState, 'RELEASE_NOT_QUALIFIED');
assert.deepEqual(store.buildOrchestrationProjection(stageId), stage.orchestration);

store.undo();
assert.equal(publications, 3);
assert.equal(secondaryPublications, 3);
stage = store.getState().stages[stageId];
assert.equal(stage.lifecycleBinding.status, 'CURRENT');
assert.equal(stage.lifecycleReadiness.resultReady, false);
assert.equal(stage.orchestration.sections.SOURCE.state, 'COMPLETE');
assert.equal(stage.orchestration.sections.MODEL.state, 'BLOCKED');
assert.equal(stage.orchestration.sections.AUTHORIZATION.state, 'BLOCKED');
assert.equal(stage.orchestration.sections.RELEASE.state, 'BLOCKED');
store.destroy();

console.log(JSON.stringify({
  check: 'lafea-architecture-convergence', status: 'PASS',
  stageAdapters: Object.keys(expected), orchestrationSchema: LAFEA_WORKBENCH_ORCHESTRATION_SCHEMA,
  onePublicStoreBoundary: true, sourceLifecycleMeshProjectedTogether: true,
  preparationBridgeQualified: true, preparationDiagnosticProducerQualified: false,
  meshGenerationAuthorized: false, releaseQualified: false,
}));
