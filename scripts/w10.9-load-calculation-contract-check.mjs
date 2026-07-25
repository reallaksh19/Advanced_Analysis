import assert from 'node:assert/strict';
import {
  createLoadCalculationReviewModel,
  validateLoadCalculationReviewModel,
} from '../src/core/load-calculation-consumer/index.js';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import {
  APPLICATION_VIEW_STATE_SCHEMA,
  APPLICATION_VIEW_STATE_V2_SCHEMA,
  CONSUMER_IDS,
  IMPLEMENTATION_STATUS,
  READINESS_STATES,
  WORKSPACE_CONSUMER_REGISTRY_SCHEMA,
  WORKSPACE_CONSUMER_REGISTRY_V2_SCHEMA,
  createApplicationViewState,
  createApplicationViewStateV2,
  createWorkspaceConsumerContext,
  createWorkspaceConsumerReadinessRegistry,
  createWorkspaceConsumerRegistry,
  createWorkspaceConsumerRegistryV2,
  refreshApplicationViewStateV2,
  transitionApplicationViewStateV2,
  validateApplicationViewState,
  validateApplicationViewStateV2,
  validateWorkspaceConsumerRegistry,
  validateWorkspaceConsumerRegistryV1,
  validateWorkspaceConsumerRegistryV2,
  workspaceConsumerDescriptor,
} from '../src/core/workspace-consumers/index.js';
import { createLoadCalcActionAvailability } from '../src/workspace/load-calc-consumer-controller.js';
import {
  buildAllPrimitiveContext,
  buildW109Context,
  stalePrimitiveContext,
} from './w10.9-fixtures.mjs';

const checks = Object.freeze({
  evidence: () => { checkMissingEvidence(); checkW104Only(); checkOptionalW105(); checkActionAvailability(); },
  primitives: () => { checkPrimitiveProjection(); checkBlockedEvidence(); checkStaleAndWrongEvidence(); },
  versions: checkContractEvolution,
  views: checkReadinessAndViews,
  immutability: checkImmutability,
});
const selected = process.argv[2];
console.log(`\n--- W10.9 load calculation contracts${selected ? ` · ${selected}` : ''} ---\n`);
if (selected) run(selected); else Object.keys(checks).forEach(run);
console.log('✅ W10.9 load calculation consumer contracts passed.\n');

function run(name) {
  if (!checks[name]) throw new TypeError(`Unknown W10.9 contract check: ${name}.`);
  checks[name]();
}

function checkMissingEvidence() {
  const empty = createWorkspaceConsumerContext({ workspaceVersion: 0 });
  assert.throws(() => createLoadCalculationReviewModel(empty), /Complete W10.4/);
}

function checkW104Only() {
  const context = buildW109Context({ screening: false });
  const model = createLoadCalculationReviewModel(context);
  assert.equal(validateLoadCalculationReviewModel(model).ok, true);
  assert.equal(model.schema, 'load-calculation-review-model/v1');
  assert.equal(model.datasetId, context.datasetId);
  assert.equal(model.contextSemanticHash, context.semanticHash);
  assert.equal(model.sourceContext, context);
  assert.equal(model.screeningSummary.length, 0);
  assert.equal(model.summary.screeningIncluded, false);
  assertExactReferences(model, context, false);
  assert.deepEqual(model.loadCases.map((row) => row.loadCaseId), ['EMPTY','HYD','OPE']);
  model.loadCases.forEach((row) => assert.ok(['READY','BLOCKED'].includes(row.qualification)));
}

function checkOptionalW105() {
  const fullContext = buildW109Context();
  const full = createLoadCalculationReviewModel(fullContext);
  assert.equal(full.summary.screeningIncluded, true);
  assert.ok(full.screeningSummary.length > 0);
  assertExactReferences(full, fullContext, true);
  full.screeningSummary.forEach((row) => {
    assert.ok(['READY','BLOCKED'].includes(row.qualification));
    assert.equal(Number.isFinite(row.screenedSupportForceN), true);
  });
  const partial = createLoadCalculationReviewModel(buildW109Context({ partialScreening: true }));
  assert.equal(partial.summary.screeningIncluded, false);
  assert.equal(partial.diagnostics[0].code, 'OPTIONAL_SCREENING_INCOMPLETE');
  const stale = createLoadCalculationReviewModel(staleScreeningContext(fullContext));
  assert.equal(stale.summary.screeningIncluded, false);
  assert.ok(stale.diagnostics.some((row) => row.code === 'OPTIONAL_SCREENING_INCOMPLETE'));
}

function checkActionAvailability() {
  const minimalContext = buildAllPrimitiveContext();
  const minimalModel = createLoadCalculationReviewModel(minimalContext);
  const minimal = createLoadCalcActionAvailability(minimalContext, minimalModel);
  assert.deepEqual(minimal, {
    rebuildModelLoads: true,
    exportModelLoads: true,
    rebuildPaths: false,
    runScreening: false,
    exportScreening: false,
  });
  const pathReadyContext = buildW109Context({ screening: false });
  const pathReady = createLoadCalcActionAvailability(
    pathReadyContext,
    createLoadCalculationReviewModel(pathReadyContext),
  );
  assert.equal(pathReady.rebuildPaths, true);
  assert.equal(pathReady.runScreening, false);
  assert.equal(pathReady.exportScreening, false);
  const fullContext = buildW109Context();
  const full = createLoadCalcActionAvailability(fullContext, createLoadCalculationReviewModel(fullContext));
  assert.equal(full.rebuildPaths, true);
  assert.equal(full.runScreening, true);
  assert.equal(full.exportScreening, true);
}

function checkPrimitiveProjection() {
  const context = buildAllPrimitiveContext();
  const model = createLoadCalculationReviewModel(context);
  assert.deepEqual([...new Set(model.primitives.map((row) => row.primitiveType))].sort(), [
    'DISTRIBUTED_GRAVITY_LOAD','EXPLICIT_POINT_MOMENT','POINT_GRAVITY_LOAD',
  ]);
  const distributed = model.primitives.find((row) => row.primitiveType === 'DISTRIBUTED_GRAVITY_LOAD');
  const point = model.primitives.find((row) => row.primitiveType === 'POINT_GRAVITY_LOAD');
  const moment = model.primitives.find((row) => row.primitiveType === 'EXPLICIT_POINT_MOMENT');
  const sourceById = new Map(context.contracts.loadPrimitiveSet.primitives.map((row) => [row.primitiveId, row]));
  assert.equal(distributed.globalVector, null);
  assert.equal(point.globalVector, null);
  assert.equal(moment.globalVector, null);
  assert.ok(distributed.formulaTrace.length);
  assert.ok(point.formulaTrace.length);
  assert.equal(moment.formulaTrace, undefined);
  assert.deepEqual(distributed.startPoint, sourceById.get(distributed.primitiveId).startPoint);
  assert.deepEqual(point.applicationPoint, sourceById.get(point.primitiveId).applicationPoint);
  assert.deepEqual(moment.axisEvidence, sourceById.get(moment.primitiveId).axisEvidence);
  assert.equal(distributed.sourceEvidence, sourceById.get(distributed.primitiveId).sourceEvidence);
  assert.equal(point.sourceEvidence, sourceById.get(point.primitiveId).sourceEvidence);
  assert.equal(moment.sourceEvidence, sourceById.get(moment.primitiveId).sourceEvidence);
}

function checkBlockedEvidence() {
  const model = createLoadCalculationReviewModel(buildAllPrimitiveContext({ blockedCase: 'OPE' }));
  const loadCase = model.loadCases.find((row) => row.loadCaseId === 'OPE');
  assert.equal(loadCase.qualification, 'BLOCKED');
  assert.ok(loadCase.blockedComponentCount > 0);
  const blocked = model.componentOutcomes.find((row) => row.loadCaseId === 'OPE' && !row.ready);
  assert.equal(blocked.mode, null);
  assert.ok(blocked.blockers.length);
}

function checkStaleAndWrongEvidence() {
  assert.throws(() => createLoadCalculationReviewModel(stalePrimitiveContext()), /Complete W10.4/);
  const first = buildW109Context({ screening: false });
  const other = buildW109Context({ datasetId: 'W10.9-OTHER', screening: false });
  const mixed = createWorkspaceConsumerContext({
    datasetId: first.datasetId,
    workspaceVersion: 2,
    contracts: {
      sharedModel: first.contracts.sharedModel,
      loadCaseSet: other.contracts.loadCaseSet,
      loadPrimitiveSet: other.contracts.loadPrimitiveSet,
      modelLoadReadinessAudit: other.contracts.modelLoadReadinessAudit,
    },
  });
  assert.throws(() => createLoadCalculationReviewModel(mixed), /Complete W10.4/);
}

function checkContractEvolution() {
  const v1 = createWorkspaceConsumerRegistry();
  const v2 = createWorkspaceConsumerRegistryV2();
  assert.equal(v1.schema, WORKSPACE_CONSUMER_REGISTRY_SCHEMA);
  assert.equal(v2.schema, WORKSPACE_CONSUMER_REGISTRY_V2_SCHEMA);
  assert.equal(validateWorkspaceConsumerRegistryV1(v1).ok, true);
  assert.equal(validateWorkspaceConsumerRegistryV2(v2).ok, true);
  assert.equal(workspaceConsumerDescriptor(v1, CONSUMER_IDS.LOAD_CALC).implementationStatus, IMPLEMENTATION_STATUS.NOT_IMPLEMENTED);
  assert.equal(workspaceConsumerDescriptor(v2, CONSUMER_IDS.LOAD_CALC).implementationStatus, IMPLEMENTATION_STATUS.IMPLEMENTED);
  const forgedV1 = rehashRegistry({ ...structuredClone(v2), schema: WORKSPACE_CONSUMER_REGISTRY_SCHEMA });
  const forgedV2 = rehashRegistry({ ...structuredClone(v1), schema: WORKSPACE_CONSUMER_REGISTRY_V2_SCHEMA });
  assert.equal(validateWorkspaceConsumerRegistry(forgedV1).ok, false);
  assert.equal(validateWorkspaceConsumerRegistry(forgedV2).ok, false);
}

function checkReadinessAndViews() {
  const registry = createWorkspaceConsumerRegistryV2();
  const context = buildW109Context({ screening: false });
  const rows = createWorkspaceConsumerReadinessRegistry(registry, context, { workspaceBooted: true });
  const loadCalc = rows.find((row) => row.consumerId === CONSUMER_IDS.LOAD_CALC);
  assert.equal(loadCalc.readinessState, READINESS_STATES.AVAILABLE);
  const initial = createApplicationViewStateV2(rows);
  assert.equal(initial.schema, APPLICATION_VIEW_STATE_V2_SCHEMA);
  assert.equal(validateApplicationViewStateV2(initial).ok, true);
  const activated = transitionApplicationViewStateV2(initial, CONSUMER_IDS.LOAD_CALC, rows);
  assert.equal(activated.activated, true);
  assert.equal(activated.state.activeViewId, CONSUMER_IDS.LOAD_CALC);
  const empty = createWorkspaceConsumerContext({ workspaceVersion: 0 });
  const emptyRows = createWorkspaceConsumerReadinessRegistry(registry, empty, { workspaceBooted: true });
  const blocked = transitionApplicationViewStateV2(initial, CONSUMER_IDS.LOAD_CALC, emptyRows);
  assert.equal(blocked.state, initial);
  const fallback = refreshApplicationViewStateV2(activated.state, emptyRows);
  assert.equal(fallback.activeViewId, CONSUMER_IDS.WORKSPACE);
  assert.equal(fallback.version, activated.state.version + 1);
  const v1Rows = createWorkspaceConsumerReadinessRegistry(createWorkspaceConsumerRegistry(), context, { workspaceBooted: true });
  const v1State = createApplicationViewState(v1Rows);
  assert.equal(v1State.schema, APPLICATION_VIEW_STATE_SCHEMA);
  assert.equal(validateApplicationViewState(v1State).ok, true);
  const forged = { ...structuredClone(initial), schema: APPLICATION_VIEW_STATE_SCHEMA };
  assert.equal(validateApplicationViewState(forged).ok, false);
}

function checkImmutability() {
  const context = buildAllPrimitiveContext();
  const sourceHash = context.contracts.loadPrimitiveSet.semanticHash;
  const model = createLoadCalculationReviewModel(context);
  assertDeepFrozen(model);
  assert.equal(context.contracts.loadPrimitiveSet.semanticHash, sourceHash);
  assert.equal(model.sourceContext.contracts.loadPrimitiveSet, context.contracts.loadPrimitiveSet);
  const repeated = createLoadCalculationReviewModel(context);
  assert.equal(repeated.reviewModelId, model.reviewModelId);
  assert.equal(repeated.semanticHash, model.semanticHash);
  const selectionChanged = buildW109Context({ screening: false, selectedEntityId: 'COMP-2' });
  const base = buildW109Context({ screening: false, selectedEntityId: 'COMP-1' });
  assert.equal(createLoadCalculationReviewModel(selectionChanged).reviewModelId, createLoadCalculationReviewModel(base).reviewModelId);
}

function assertExactReferences(model, context, screeningIncluded) {
  assert.equal(model.sourceReferences.sharedModelSemanticHash, context.contracts.sharedModel.semanticHash);
  assert.equal(model.sourceReferences.loadCaseSetSemanticHash, context.contracts.loadCaseSet.semanticHash);
  assert.equal(model.sourceReferences.loadPrimitiveSetSemanticHash, context.contracts.loadPrimitiveSet.semanticHash);
  assert.equal(model.sourceReferences.modelLoadReadinessAuditSemanticHash, context.contracts.modelLoadReadinessAudit.semanticHash);
  assert.equal(Boolean(model.sourceReferences.supportLoadScreeningSemanticHash), screeningIncluded);
}

function staleScreeningContext(context) {
  const screening = structuredClone(context.contracts.supportLoadScreening);
  screening.pathModelSemanticHash = 'fnv1a64:stale';
  const { semanticHash: _hash, ...base } = screening;
  const stale = Object.freeze({ ...base, semanticHash: semanticHash(base) });
  return createWorkspaceConsumerContext({
    datasetId: context.datasetId,
    workspaceVersion: 3,
    contracts: {
      sharedModel: context.contracts.sharedModel,
      topologyGraph: context.contracts.topologyGraph,
      topologyAudit: context.contracts.topologyAudit,
      supportAttachmentModel: context.contracts.supportAttachmentModel,
      supportAttachmentAudit: context.contracts.supportAttachmentAudit,
      restraintCapabilityModel: context.contracts.restraintCapabilityModel,
      restraintCapabilityAudit: context.contracts.restraintCapabilityAudit,
      loadCaseSet: context.contracts.loadCaseSet,
      loadPrimitiveSet: context.contracts.loadPrimitiveSet,
      modelLoadReadinessAudit: context.contracts.modelLoadReadinessAudit,
      verticalLoadPathModel: context.contracts.verticalLoadPathModel,
      supportLoadScreening: stale,
      supportLoadScreeningAudit: context.contracts.supportLoadScreeningAudit,
    },
  });
}
function rehashRegistry(value) {
  const { semanticHash: _hash, ...base } = value;
  return { ...base, semanticHash: semanticHash(base) };
}
function assertDeepFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  Object.values(value).forEach((child) => assertDeepFrozen(child, seen));
}
