import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  assessPipeSolverActions,
  createPipeSolverConsumerSource,
  createPipeSolverReviewModel,
  PIPE_SCREENING_METHOD_ID,
  PIPE_SCREENING_RESULT_METHOD_BY_GEOMETRY,
  PIPE_SOLVER_ACTIONS,
  validatePipeSolverConsumerSource,
  validatePipeSolverReviewModel,
} from '../src/core/pipe-solver-consumer/index.js';
import {
  createApplicationViewStateV4,
  createWorkspaceConsumerContext,
  createWorkspaceConsumerReadinessRegistry,
  createWorkspaceConsumerRegistry,
  createWorkspaceConsumerRegistryV2,
  createWorkspaceConsumerRegistryV3,
  createWorkspaceConsumerRegistryV4,
  refreshApplicationViewStateV4,
  transitionApplicationViewStateV4,
  validateApplicationViewStateV4,
  validateWorkspaceConsumerRegistryV1,
  validateWorkspaceConsumerRegistryV2,
  validateWorkspaceConsumerRegistryV3,
  validateWorkspaceConsumerRegistryV4,
} from '../src/core/workspace-consumers/index.js';
import { deepFreeze, semanticHash } from '../src/core/shared-piping-model/index.js';
import { buildW1011Fixture, forgedResult } from './w10.11-fixtures.mjs';

const CHECKS = Object.freeze({
  source: checkSourceContract,
  containment: checkSessionAndLedgerContainment,
  result: checkResultContainment,
  review: checkReviewModel,
  actions: checkActions,
  evolution: checkVersionEvolution,
});
const selected = process.argv[2] || 'all';
console.log(`\n--- W10.11 Pipe Solver contracts · ${selected} ---\n`);
if (selected === 'all') Object.entries(CHECKS).forEach(([name, check]) => run(name, check));
else if (CHECKS[selected]) run(selected, CHECKS[selected]);
else throw new TypeError(`Unknown W10.11 contract check: ${selected}.`);
console.log(`✅ W10.11 Pipe Solver contracts · ${selected} passed.\n`);

function run(name, check) {
  console.log(`Running W10.11 contract concern: ${name}`);
  try {
    check();
  } catch (error) {
    retainFailure(name, error);
    throw error;
  }
}

function checkSourceContract() {
  const fixture = buildW1011Fixture();
  const source = createPipeSolverConsumerSource(fixture);
  assert.deepEqual(validatePipeSolverConsumerSource(source), { ok: true, errors: [] });
  assert.equal(source.sourceContext, fixture.sourceContext);
  assert.equal(source.selectedEntity.sourceAttributes, fixture.selectedEntity.properties.sourceAttributes);
  assert.equal(source.selectedEntity.nativeParams, fixture.selectedEntity.properties.nativeParams);
  assert.equal(source.capability.fields, fixture.capabilityInspection.fields);
  assert.equal(source.activeSession, fixture.sessionSnapshot.session);
  source.matchingLedgerEntries.forEach((entry) => assert.ok(fixture.ledgerSnapshot.entries.includes(entry)));
  assert.deepEqual(source.matchingLedgerEntries.map((row) => row.entryId), [
    'analysis-ledger-entry-12', 'analysis-ledger-entry-18-a', 'analysis-ledger-entry-18-b',
  ]);
  assert.equal(source.activeMatchingLedgerEntryId, 'analysis-ledger-entry-18-b');
  assertDeepFrozen(source);
  const noSelectionFixture = buildW1011Fixture({ selectedEntityId: null, noSession: true, entries: [] });
  const noSelection = createPipeSolverConsumerSource(noSelectionFixture);
  assert.equal(noSelection.sourceContext.selectedEntityId, null);
  assert.equal(noSelection.selectedEntityId, null);
  assert.deepEqual(validatePipeSolverConsumerSource(noSelection), { ok: true, errors: [] });
  assert.equal(noSelection.selectedEntity, null);
  assert.equal(noSelection.capability.readyToReview, false);
  assert.equal(noSelection.diagnostics.some((row) => row.code === 'PIPE_SOLVER_NO_SELECTION'), true);
}

function checkSessionAndLedgerContainment() {
  const fixture = buildW1011Fixture({
    sessionDatasetId: 'STALE-DATASET',
    activeEntryId: 'analysis-ledger-entry-14',
  });
  const source = createPipeSolverConsumerSource(fixture);
  assert.equal(source.activeSession, null);
  assert.equal(source.activeMatchingLedgerEntryId, null);
  assert.equal(source.diagnostics.some((row) => row.code === 'PIPE_SOLVER_SESSION_DATASET_MISMATCH'), true);
  assert.equal(source.diagnostics.some((row) => row.code === 'PIPE_SOLVER_LEDGER_ANALYSIS_FILTERED'), true);
  assert.equal(source.diagnostics.some((row) => row.code === 'PIPE_SOLVER_LEDGER_DATASET_FILTERED'), true);
  assert.equal(source.diagnostics.some((row) => row.code === 'PIPE_SOLVER_LEDGER_DUPLICATE_SEQUENCE'), true);
  assert.equal(source.diagnostics.some((row) => row.code === 'PIPE_SOLVER_ACTIVE_LEDGER_FILTERED'), true);
}

function checkResultContainment() {
  const forged = reviewFor({ sessionStatus: 'completed', result: forgedResult() });
  assert.equal(forged.currentResult, null);
  assert.equal(hasResultError(forged, 'semantic hash mismatch'), true);
  const valid = reviewFor({ sessionStatus: 'completed' });
  assert.equal(valid.capabilitySummary.methodId, PIPE_SCREENING_METHOD_ID);
  assert.equal(valid.currentResult.methodId, PIPE_SCREENING_RESULT_METHOD_BY_GEOMETRY.L_SHAPE);
  assert.equal(valid.currentResult.meta.geometryType, 'L_SHAPE');
  assert.equal(valid.sourceReferences.currentResult, valid.sourceSnapshot.activeSession.result);
  const mismatch = reviewFor({
    sessionStatus: 'completed',
    methodId: PIPE_SCREENING_RESULT_METHOD_BY_GEOMETRY.Z_SHAPE,
    geometryType: 'L_SHAPE',
  });
  assert.equal(mismatch.currentResult, null);
  assert.equal(hasResultError(mismatch, 'does not match meta.geometryType'), true);
  const unknown = reviewFor({ sessionStatus: 'completed', methodId: 'SIMPLIFIED_2D_UNKNOWN' });
  assert.equal(unknown.currentResult, null);
  assert.equal(hasResultError(unknown, 'Unexpected Pipe Solver result method'), true);
}

function checkReviewModel() {
  const fixture = buildW1011Fixture({ missing: ['alpha', 'Sa'] });
  const source = createPipeSolverConsumerSource(fixture);
  const review = createPipeSolverReviewModel(source);
  assert.equal(validatePipeSolverReviewModel(review).ok, true);
  assert.equal(review.sourceSnapshot, source);
  assert.equal(review.sourceReferences.activeSession, source.activeSession);
  assert.equal(review.sourceReferences.matchingLedgerEntries, source.matchingLedgerEntries);
  assert.deepEqual(review.capabilitySummary.missingInputKeys, ['alpha', 'Sa']);
  assert.equal(review.inputRows.find((row) => row.key === 'alpha').value, null);
  assert.match(review.limitations.join(' '), /Not final piping-code stress analysis/);
  assertDeepFrozen(review);
  const forged = { ...review, selection: { ...review.selection, entityId: 'FORGED' } };
  assert.equal(validatePipeSolverReviewModel(forged).ok, false);
  const repeated = createPipeSolverReviewModel(source);
  assert.equal(repeated.reviewModelId, review.reviewModelId);
  assert.equal(repeated.semanticHash, review.semanticHash);
}

function checkActions() {
  const draft = createPipeSolverReviewModel(createPipeSolverConsumerSource(buildW1011Fixture({ missing: ['alpha'] })));
  const draftActions = assessPipeSolverActions(draft, { fieldKey: 'alpha', format: 'json', entryId: 'analysis-ledger-entry-12' });
  assert.equal(draftActions[PIPE_SOLVER_ACTIONS.OPEN_SESSION], false);
  assert.equal(draftActions[PIPE_SOLVER_ACTIONS.UPDATE_OVERRIDE], true);
  assert.equal(draftActions[PIPE_SOLVER_ACTIONS.RESET_SESSION], true);
  assert.equal(draftActions[PIPE_SOLVER_ACTIONS.RUN_SCREENING], false);
  assert.equal(draftActions[PIPE_SOLVER_ACTIONS.CLOSE_SESSION], true);
  assert.equal(draftActions[PIPE_SOLVER_ACTIONS.SELECT_LEDGER_ENTRY], true);
  assert.equal(draftActions[PIPE_SOLVER_ACTIONS.EXPORT_LEDGER], true);
  const ready = createPipeSolverReviewModel(createPipeSolverConsumerSource(buildW1011Fixture()));
  assert.equal(assessPipeSolverActions(ready)[PIPE_SOLVER_ACTIONS.RUN_SCREENING], true);
  const noSession = createPipeSolverReviewModel(createPipeSolverConsumerSource(buildW1011Fixture({ noSession: true })));
  assert.equal(assessPipeSolverActions(noSession)[PIPE_SOLVER_ACTIONS.OPEN_SESSION], true);
}

function checkVersionEvolution() {
  const registries = [
    [createWorkspaceConsumerRegistry(), validateWorkspaceConsumerRegistryV1],
    [createWorkspaceConsumerRegistryV2(), validateWorkspaceConsumerRegistryV2],
    [createWorkspaceConsumerRegistryV3(), validateWorkspaceConsumerRegistryV3],
    [createWorkspaceConsumerRegistryV4(), validateWorkspaceConsumerRegistryV4],
  ];
  registries.forEach(([registry, validate]) => assert.equal(validate(registry).ok, true));
  registries.slice(0, 3).forEach(([registry]) => assert.equal(descriptor(registry, 'PIPE_SOLVER').implementationStatus, 'NOT_IMPLEMENTED'));
  const v4 = registries[3][0];
  const pipe = descriptor(v4, 'PIPE_SOLVER');
  assert.equal(pipe.implementationStatus, 'IMPLEMENTED');
  assert.deepEqual(pipe.requiredContractKeys, ['sharedModel', 'topologyAudit', 'topologyGraph']);
  assert.equal(pipe.engineeringClaimPolicy, 'EXISTING_BENCHMARKED_SIMPLIFIED_2D_SCREENING_ONLY');
  const forged = rehash({ ...structuredClone(v4), schema: 'workspace-consumer-registry/v3' });
  assert.equal(validateWorkspaceConsumerRegistryV3(forged).ok, false);
  const context = buildW1011Fixture().sourceContext;
  const readiness = createWorkspaceConsumerReadinessRegistry(v4, context, { workspaceBooted: true });
  const initial = createApplicationViewStateV4(readiness);
  assert.equal(validateApplicationViewStateV4(initial).ok, true);
  const activated = transitionApplicationViewStateV4(initial, 'PIPE_SOLVER', readiness);
  assert.equal(activated.state.activeViewId, 'PIPE_SOLVER');
  const noSelectionReadiness = createWorkspaceConsumerReadinessRegistry(v4, buildW1011Fixture({ selectedEntityId: null }).sourceContext, { workspaceBooted: true });
  const noSelectionRefresh = refreshApplicationViewStateV4(activated.state, noSelectionReadiness);
  assert.equal(noSelectionRefresh.activeViewId, 'PIPE_SOLVER');
  const blockedReadiness = createWorkspaceConsumerReadinessRegistry(v4, createWorkspaceConsumerContext(), { workspaceBooted: true });
  const fallback = refreshApplicationViewStateV4(activated.state, blockedReadiness);
  assert.equal(fallback.activeViewId, 'WORKSPACE');
  assert.equal(fallback.version, activated.state.version + 1);
}

function reviewFor(options) {
  return createPipeSolverReviewModel(createPipeSolverConsumerSource(buildW1011Fixture(options)));
}
function hasResultError(review, message) {
  return review.diagnostics.some((row) => row.code === 'PIPE_SOLVER_CURRENT_RESULT_INVALID'
    && row.data.errors.some((error) => error.includes(message)));
}
function retainFailure(concern, error) {
  const directory = path.join(process.cwd(), 'test-results');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'w10.11-contract-failure.json'), JSON.stringify({
    concern,
    name: error?.name || 'Error',
    message: error?.message || String(error),
    stack: error?.stack || null,
  }, null, 2));
}

function descriptor(registry, id) { return registry.consumers.find((row) => row.consumerId === id); }
function rehash(value) {
  const { semanticHash: _hash, ...base } = value;
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}
function assertDeepFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  Object.values(value).forEach((child) => assertDeepFrozen(child, seen));
}
