import assert from 'node:assert/strict';
import {
  assessThreeDCalculationActions,
  createThreeDCalculationReviewModel,
  validateThreeDCalculationReviewModel,
} from '../src/core/three-d-calculation-consumer/index.js';
import {
  createApplicationViewStateV3,
  createWorkspaceConsumerContext,
  createWorkspaceConsumerReadinessRegistry,
  createWorkspaceConsumerRegistry,
  createWorkspaceConsumerRegistryV2,
  createWorkspaceConsumerRegistryV3,
  refreshApplicationViewStateV3,
  transitionApplicationViewStateV3,
  validateApplicationViewState,
  validateApplicationViewStateV2,
  validateApplicationViewStateV3,
  validateWorkspaceConsumerRegistryV1,
  validateWorkspaceConsumerRegistryV2,
  validateWorkspaceConsumerRegistryV3,
} from '../src/core/workspace-consumers/index.js';
import { canonicalPrettyStringify, deepFreeze, semanticHash } from '../src/core/shared-piping-model/index.js';
import {
  buildW1010Context,
  staleOptionalBeamContext,
  staleOptionalLoadContext,
  staleRequiredContext,
} from './w10.10-fixtures.mjs';

const CHECKS = Object.freeze({
  required: () => { checkMissingRequired(); checkRequiredProjection(); },
  optional: () => { checkOptionalProjection(); checkStaleOptionalEvidence(); },
  'optional-inclusion': checkOptionalProjection,
  'optional-load-inclusion': checkOptionalLoadProjection,
  'optional-beam-inclusion': checkOptionalBeamProjection,
  'optional-rejection': checkStaleOptionalEvidence,
  evolution: () => { checkRegistryEvolution(); checkViewStateEvolution(); },
  actions: checkActionEligibility,
  immutability: checkImmutabilityAndValidator,
});
const selected = process.argv[2] || 'all';
console.log(`\n--- W10.10 3D calculation review contracts · ${selected} ---\n`);
if (selected === 'all') {
  ['required','optional','evolution','actions','immutability'].forEach((name) => runCheck(name, CHECKS[name]));
} else if (CHECKS[selected]) runCheck(selected, CHECKS[selected]);
else throw new TypeError(`Unknown W10.10 contract check: ${selected}.`);
console.log(`✅ W10.10 3D calculation review contracts · ${selected} passed.\n`);

function runCheck(name, check) {
  console.log(`Running W10.10 contract concern: ${name}`);
  check();
}

function checkMissingRequired() {
  assert.throws(() => createThreeDCalculationReviewModel(createWorkspaceConsumerContext()), /W10.1-W10.3/);
  assert.throws(() => createThreeDCalculationReviewModel(staleRequiredContext()), /W10.1-W10.3/);
  const wrongDataset = buildW1010Context({ contextDatasetId: 'WRONG-DATASET' });
  assert.throws(() => createThreeDCalculationReviewModel(wrongDataset), /W10.1-W10.3/);
}

function checkRequiredProjection() {
  const context = buildW1010Context({ requiredOnly: true });
  const model = createThreeDCalculationReviewModel(context);
  assert.equal(validateThreeDCalculationReviewModel(model).ok, true);
  assert.equal(model.sourceContext, context);
  assert.equal(model.datasetId, context.datasetId);
  assert.equal(model.sourceReferences.sharedModelSemanticHash, context.contracts.sharedModel.semanticHash);
  assert.equal(model.sourceReferences.topologyGraphSemanticHash, context.contracts.topologyGraph.semanticHash);
  assert.equal(model.sourceReferences.supportAttachmentModelSemanticHash, context.contracts.supportAttachmentModel.semanticHash);
  assert.equal(model.sourceReferences.restraintCapabilityModelSemanticHash, context.contracts.restraintCapabilityModel.semanticHash);
  assert.equal(model.sourceReferences.loadPrimitiveSetSemanticHash, null);
  assert.equal(model.sourceReferences.verticalBeamSolutionSemanticHash, null);
  assert.equal(model.components.length, context.contracts.sharedModel.components.length);
  assert.equal(model.ports.length, context.contracts.topologyGraph.ports.length);
  assert.equal(model.connections.length, context.contracts.topologyGraph.connections.length);
  assert.equal(model.supportAttachments.length >= context.contracts.supportAttachmentModel.attachments.length, true);
  assert.equal(model.restraintCapabilities.length, context.contracts.restraintCapabilityModel.restraints.length);
  assert.equal(model.loadPrimitives.length, 0);
  assert.equal(model.verticalBeamCases.length, 0);
  const component = context.contracts.sharedModel.components.find((row) => row.componentKey === model.components[0].componentKey);
  assert.equal(model.components[0].startPoint, component.geometry.start);
  assert.equal(model.components[0].sourcePath, component.sourceReferences.sourcePath);
  assert.equal(model.components[0].sourceReferences, component.sourceReferences);
  const port = context.contracts.topologyGraph.ports.find((row) => row.portKey === model.ports[0].portKey);
  assert.equal(model.ports[0].position, port.position);
  const restraint = context.contracts.restraintCapabilityModel.restraints.find((row) => row.supportKey === model.restraintCapabilities[0].supportKey);
  assert.equal(model.restraintCapabilities[0].vertical, restraint.vertical);
}

function checkOptionalProjection() {
  checkOptionalLoadProjection();
  checkOptionalBeamProjection();
}

function checkOptionalLoadProjection() {
  const context = buildW1010Context();
  const model = createThreeDCalculationReviewModel(context);
  assert.equal(model.sourceReferences.loadPrimitiveSetSemanticHash, context.contracts.loadPrimitiveSet.semanticHash);
  assert.equal(model.loadPrimitives.length, context.contracts.loadPrimitiveSet.primitives.length);
  const primitive = context.contracts.loadPrimitiveSet.primitives.find((row) => row.primitiveId === model.loadPrimitives[0].primitiveId);
  assert.equal(model.loadPrimitives[0].globalVector, primitive.globalVector);
  assert.equal(model.loadPrimitives[0].formulaTrace, primitive.formulaTrace);
  assert.equal(model.loadPrimitives[0].sourceEvidence, primitive.sourceEvidence);
}

function checkOptionalBeamProjection() {
  const context = buildW1010Context();
  const model = createThreeDCalculationReviewModel(context);
  assert.equal(model.sourceReferences.verticalBeamSolutionSemanticHash, context.contracts.verticalBeamSolution.semanticHash);
  assert.equal(model.flexuralProperties.length, context.contracts.flexuralPropertyProjection.records.length);
  assert.equal(model.verticalBeamCases.length, context.contracts.verticalBeamSolution.pathCases.length);
  const solution = context.contracts.verticalBeamSolution.pathCases.find((row) => row.pathId === model.verticalBeamCases[0].pathId && row.loadCaseId === model.verticalBeamCases[0].loadCaseId);
  assert.equal(model.verticalBeamCases[0].signedSupportForceN, solution.supportForceTotalN);
  assert.equal(model.verticalBeamCases[0].supportForceRows, solution.supportForceResults);
  assert.equal(model.verticalBeamCases[0].nodeDisplacementRows[0].verticalDisplacementM, solution.nodeResults[0].verticalDisplacementM);
  assert.match(model.limitations.join(' '), /Not a second 3D viewport/);
  assert.match(model.limitations.join(' '), /scalar and topology-local/);
}

function checkStaleOptionalEvidence() {
  const staleLoad = createThreeDCalculationReviewModel(staleOptionalLoadContext());
  assert.equal(staleLoad.loadPrimitives.length, 0);
  assert.equal(staleLoad.sourceReferences.loadPrimitiveSetSemanticHash, null);
  assert.equal(staleLoad.diagnostics.some((row) => row.code === 'OPTIONAL_MODEL_LOAD_INVALID'), true);
  const partialBeam = createThreeDCalculationReviewModel(buildW1010Context({ partialBeam: true }));
  assert.equal(partialBeam.verticalBeamCases.length, 0);
  assert.equal(partialBeam.diagnostics.some((row) => row.code === 'OPTIONAL_VERTICAL_BEAM_INCOMPLETE'), true);
  const staleBeam = createThreeDCalculationReviewModel(staleOptionalBeamContext());
  assert.equal(staleBeam.verticalBeamCases.length, 0);
  assert.equal(staleBeam.diagnostics.some((row) => row.code.startsWith('OPTIONAL_VERTICAL_BEAM_')), true);
}

function checkRegistryEvolution() {
  const v1 = createWorkspaceConsumerRegistry();
  const v2 = createWorkspaceConsumerRegistryV2();
  const v3 = createWorkspaceConsumerRegistryV3();
  assert.equal(validateWorkspaceConsumerRegistryV1(v1).ok, true);
  assert.equal(validateWorkspaceConsumerRegistryV2(v2).ok, true);
  assert.equal(validateWorkspaceConsumerRegistryV3(v3).ok, true);
  assert.equal(descriptor(v1, 'THREE_D_CALC').implementationStatus, 'NOT_IMPLEMENTED');
  assert.equal(descriptor(v2, 'THREE_D_CALC').implementationStatus, 'NOT_IMPLEMENTED');
  const row = descriptor(v3, 'THREE_D_CALC');
  assert.equal(row.implementationStatus, 'IMPLEMENTED');
  assert.equal(row.engineeringClaimPolicy, 'MODEL_TOPOLOGY_RESTRAINT_AND_OPTIONAL_VERTICAL_BEAM_EVIDENCE_ONLY');
  assert.deepEqual(row.allowedActions, [...row.allowedActions].sort());
  const forged = rehash({ ...structuredClone(v3), schema: v2.schema });
  assert.equal(validateWorkspaceConsumerRegistryV2(forged).ok, false);
}

function checkViewStateEvolution() {
  const context = buildW1010Context();
  const registry = createWorkspaceConsumerRegistryV3();
  const readiness = createWorkspaceConsumerReadinessRegistry(registry, context, { workspaceBooted: true });
  const initial = createApplicationViewStateV3(readiness);
  assert.equal(validateApplicationViewStateV3(initial).ok, true);
  const transition = transitionApplicationViewStateV3(initial, 'THREE_D_CALC', readiness);
  assert.equal(transition.activated, true);
  assert.equal(transition.state.activeViewId, 'THREE_D_CALC');
  const blockedContext = createWorkspaceConsumerContext();
  const blockedReadiness = createWorkspaceConsumerReadinessRegistry(registry, blockedContext, { workspaceBooted: true });
  const failed = transitionApplicationViewStateV3(initial, 'THREE_D_CALC', blockedReadiness);
  assert.equal(failed.state, initial);
  const fallback = refreshApplicationViewStateV3(transition.state, blockedReadiness);
  assert.equal(fallback.activeViewId, 'WORKSPACE');
  assert.equal(fallback.version, transition.state.version + 1);
  const forgedV1 = deepFreeze({ ...transition.state, schema: 'application-view-state/v1' });
  const forgedV2 = deepFreeze({ ...transition.state, schema: 'application-view-state/v2' });
  assert.equal(validateApplicationViewState(forgedV1).ok, false);
  assert.equal(validateApplicationViewStateV2(forgedV2).ok, false);
}

function checkActionEligibility() {
  const requiredModel = createThreeDCalculationReviewModel(buildW1010Context({ requiredOnly: true }));
  const required = assessThreeDCalculationActions(requiredModel);
  assert.equal(required.EXPORT_SHARED_MODEL, true);
  assert.equal(required.REBUILD_TOPOLOGY_EXACT, true);
  assert.equal(required.EXPORT_TOPOLOGY, true);
  assert.equal(required.REBUILD_SUPPORT_EVIDENCE, true);
  assert.equal(required.EXPORT_SUPPORT_RESTRAINT, true);
  assert.equal(required.REBUILD_VERTICAL_BEAM_MODEL, false);
  assert.equal(required.SOLVE_VERTICAL_BEAM, false);
  assert.equal(required.EXPORT_VERTICAL_BEAM, false);
  const full = assessThreeDCalculationActions(createThreeDCalculationReviewModel(buildW1010Context()));
  Object.values(full).forEach((value) => assert.equal(value, true));
}

function checkImmutabilityAndValidator() {
  const context = buildW1010Context();
  const before = canonicalPrettyStringify(context);
  const model = createThreeDCalculationReviewModel(context);
  assertDeepFrozen(model);
  assert.equal(canonicalPrettyStringify(context), before);
  const forged = { ...model, components: [{ ...model.components[0], componentType: 'FORGED' }, ...model.components.slice(1)] };
  assert.equal(validateThreeDCalculationReviewModel(forged).ok, false);
  const repeated = createThreeDCalculationReviewModel(context);
  assert.equal(repeated.reviewModelId, model.reviewModelId);
  assert.equal(repeated.semanticHash, model.semanticHash);
  assert.equal(canonicalPrettyStringify(repeated), canonicalPrettyStringify(model));
}

function descriptor(registry, id) { return registry.consumers.find((row) => row.consumerId === id); }
function rehash(value) {
  const { semanticHash: _hash, ...base } = value;
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}
function assertDeepFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value); assert.equal(Object.isFrozen(value), true);
  Object.values(value).forEach((child) => assertDeepFrozen(child, seen));
}
