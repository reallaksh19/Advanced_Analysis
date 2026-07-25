import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import {
  QA_EVIDENCE_EXPORT_SCHEMA, QA_EVIDENCE_SOURCE_SCHEMA, QA_REVIEW_MODEL_SCHEMA,
  createQaEvidenceExport, createQaEvidenceSource, createQaReviewModel,
  qaSourceHashPayload, validateQaEvidenceExport, validateQaEvidenceSource,
  validateQaReviewModel,
} from '../src/core/qa-evidence/index.js';
import {
  APPLICATION_NAVIGATION_ORDER_V9, CONTRACT_KEYS, CONSUMER_IDS,
  createApplicationViewState, createApplicationViewStateV2,
  createApplicationViewStateV3, createApplicationViewStateV4,
  createApplicationViewStateV5, createApplicationViewStateV6,
  createApplicationViewStateV7, createApplicationViewStateV8,
  createApplicationViewStateV9, createWorkspaceConsumerContext,
  createWorkspaceConsumerReadinessRegistry, createWorkspaceConsumerRegistry,
  createWorkspaceConsumerRegistryV2, createWorkspaceConsumerRegistryV3,
  createWorkspaceConsumerRegistryV4, createWorkspaceConsumerRegistryV5,
  createWorkspaceConsumerRegistryV6, createWorkspaceConsumerRegistryV7,
  createWorkspaceConsumerRegistryV8, createWorkspaceConsumerRegistryV9,
  validateApplicationViewStateV9, validateWorkspaceConsumerRegistryV9,
} from '../src/core/workspace-consumers/index.js';

const registryFactories = [
  createWorkspaceConsumerRegistry, createWorkspaceConsumerRegistryV2,
  createWorkspaceConsumerRegistryV3, createWorkspaceConsumerRegistryV4,
  createWorkspaceConsumerRegistryV5, createWorkspaceConsumerRegistryV6,
  createWorkspaceConsumerRegistryV7, createWorkspaceConsumerRegistryV8,
];
const registryHashes = [
  'fnv1a64:933de417d77f43d2','fnv1a64:22f426d2b0677d92',
  'fnv1a64:496eed4568692dfa','fnv1a64:e47035052f70a27c',
  'fnv1a64:3c6af36714a4bedf','fnv1a64:805131b97e910a7c',
  'fnv1a64:c157f6bb40161017','fnv1a64:f49703c58cac2af8',
];
assert.deepEqual(registryFactories.map((factory) => factory().semanticHash), registryHashes);
registryFactories.forEach((factory) => {
  assert.equal(factory().consumers.find((row) => row.consumerId === CONSUMER_IDS.QA).implementationStatus, 'NOT_IMPLEMENTED');
});

const registry = createWorkspaceConsumerRegistryV9();
assert.equal(validateWorkspaceConsumerRegistryV9(registry).ok, true);
assert.deepEqual(registry.consumers.map((row) => row.consumerId).sort(), [...APPLICATION_NAVIGATION_ORDER_V9].sort());
const qaDescriptor = registry.consumers.find((row) => row.consumerId === CONSUMER_IDS.QA);
assert.equal(qaDescriptor.implementationStatus, 'IMPLEMENTED');
assert.deepEqual(qaDescriptor.requiredContractKeys, []);
assert.deepEqual(qaDescriptor.optionalContractKeys, [...CONTRACT_KEYS].sort());
assert.deepEqual(qaDescriptor.allowedActions, ['EXPORT_QA_EVIDENCE','REFRESH_QA_EVIDENCE']);
assert.equal(qaDescriptor.engineeringClaimPolicy, 'READ_ONLY_RUNTIME_EVIDENCE_ASSESSMENT_ONLY');

const context = createWorkspaceConsumerContext({ datasetId:null, workspaceVersion:0, selectedEntityId:null, contracts:{} });
const readiness = createWorkspaceConsumerReadinessRegistry(registry, context, runtimeOptions());
assert.equal(readiness.find((row) => row.consumerId === CONSUMER_IDS.QA).readinessState, 'AVAILABLE');
const state = createApplicationViewStateV9(readiness, { activeViewId:CONSUMER_IDS.QA });
assert.equal(state.schema, 'application-view-state/v9');
assert.equal(state.activeViewId, CONSUMER_IDS.QA);
assert.equal(validateApplicationViewStateV9(state).ok, true);

const viewFactories = [
  createApplicationViewState, createApplicationViewStateV2,
  createApplicationViewStateV3, createApplicationViewStateV4,
  createApplicationViewStateV5, createApplicationViewStateV6,
  createApplicationViewStateV7, createApplicationViewStateV8,
];
const viewHashes = [
  'fnv1a64:bcd8d6c26099e9ff','fnv1a64:57389d9f6c56539a',
  'fnv1a64:b80447adeaaff2a1','fnv1a64:af4575a5919173d2',
  'fnv1a64:45db9398b1cb8fe9','fnv1a64:4222c17148566e56',
  'fnv1a64:29a8fa0ed3f5ea60','fnv1a64:c148a9ed27f3a3d3',
];
assert.deepEqual(registryFactories.map((factory, index) => semanticHash(viewFactories[index](closedReadiness(factory())))), viewHashes);

const source = createQaEvidenceSource({ workspaceConsumerRegistry:registry, workspaceConsumerContext:context, workspaceConsumerReadinessRows:readiness });
const review = createQaReviewModel(source);
const json = createQaEvidenceExport({ source, reviewModel:review, format:'JSON' });
const csv = createQaEvidenceExport({ source, reviewModel:review, format:'CSV' });
assert.equal(source.schema, QA_EVIDENCE_SOURCE_SCHEMA);
assert.equal(review.schema, QA_REVIEW_MODEL_SCHEMA);
assert.equal(json.schema, QA_EVIDENCE_EXPORT_SCHEMA);
assert.equal(review.qualityState, 'VALID_EMPTY');
assert.equal(source.consumerRows.length, registry.consumers.length);
assert.equal(source.contractRows.length, CONTRACT_KEYS.length);
assert.deepEqual(source.consumerRows.map((row) => row.consumerId), APPLICATION_NAVIGATION_ORDER_V9);
assert.deepEqual(source.contractRows.map((row) => row.contractKey), CONTRACT_KEYS);
assert.equal(validateQaEvidenceSource(source).ok, true);
assert.equal(validateQaReviewModel(review).ok, true);
assert.equal(validateQaEvidenceExport(json).ok, true);
assert.equal(validateQaEvidenceExport(csv).ok, true);
for (const value of [source, source.consumerRows, source.contractRows, review, json, csv]) assert.equal(deepFrozen(value), true);

const loadCalc = source.consumerRows.find((row) => row.consumerId === CONSUMER_IDS.LOAD_CALC);
assert.equal(loadCalc.readinessState, 'BLOCKED_MISSING_CONTRACTS');
assert.ok(loadCalc.missingRequiredContractKeys.length > 0);
assert.equal(source.consumerRows.find((row) => row.consumerId === CONSUMER_IDS.QA).readinessState, 'AVAILABLE');
const optionalMissing = source.contractRows.find((row) => row.contractKey === 'supportLoadScreening');
assert.equal(optionalMissing.availability, 'UNAVAILABLE');
assert.equal(optionalMissing.validatorState, 'NOT_PRESENT');

const forgedHash = clone(source);
forgedHash.semanticHash = 'fnv1a64:0000000000000000';
assert.equal(validateQaEvidenceSource(forgedHash).ok, false);
const forgedRow = clone(source);
forgedRow.consumerRows[0].extra = true;
forgedRow.semanticHash = semanticHash(qaSourceHashPayload(forgedRow));
assert.equal(validateQaEvidenceSource(forgedRow).ok, false);
const reorderedRows = clone(source);
reorderedRows.contractRows.reverse();
reorderedRows.semanticHash = semanticHash(qaSourceHashPayload(reorderedRows));
assert.equal(validateQaEvidenceSource(reorderedRows).ok, false);
assert.throws(() => createQaEvidenceSource({ workspaceConsumerRegistry:{ ...registry, semanticHash:'fnv1a64:0' }, workspaceConsumerContext:context, workspaceConsumerReadinessRows:readiness }), /registry/i);
assert.throws(() => createQaEvidenceSource({ workspaceConsumerRegistry:registry, workspaceConsumerContext:{ ...clone(context), contracts:{} }, workspaceConsumerReadinessRows:readiness }), /context/i);
const unknownReadiness = clone(readiness); unknownReadiness[0].consumerId = 'UNKNOWN';
assert.throws(() => createQaEvidenceSource({ workspaceConsumerRegistry:registry, workspaceConsumerContext:context, workspaceConsumerReadinessRows:unknownReadiness }), /readiness/i);

const mutableReadiness = clone(readiness);
const isolated = createQaEvidenceSource({ workspaceConsumerRegistry:registry, workspaceConsumerContext:context, workspaceConsumerReadinessRows:mutableReadiness });
const isolatedHash = isolated.semanticHash;
mutableReadiness[0].diagnostics.push({ code:'CALLER_MUTATION',severity:'INFO',contractKey:null,message:'caller only' });
assert.equal(isolated.semanticHash, isolatedHash);
assert.notEqual(isolated.consumerRows[0].blockingDiagnostics.length, mutableReadiness[0].diagnostics.length);

assert.equal(json.content.endsWith('\n'), true);
assert.equal(csv.content.endsWith('\n'), true);
assert.ok(csv.content.includes('CONSUMERS,'));
assert.ok(csv.content.includes('CONTRACTS,'));
assert.ok(csv.content.includes('DIAGNOSTICS,'));
assert.ok(csv.content.includes('LIMITATIONS,'));
console.log('✅ W10.12 closed contracts, v1-v8 preservation, immutability, row identity and deterministic exports passed.');

function runtimeOptions() { return { workspaceBooted:true, settingsAuthorityInitialized:true, settingsDefinitionsAvailable:true, settingsProfileValid:true }; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function deepFrozen(value) { return value === null || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(deepFrozen)); }
function closedReadiness(closedRegistry) {
  return closedRegistry.consumers.map((descriptor) => {
    const available = descriptor.implementationStatus === 'IMPLEMENTED';
    const pending = descriptor.implementationStatus === 'RECOVERY_PENDING';
    const base = { schema:'workspace-consumer-readiness/v1',consumerId:descriptor.consumerId,implementationStatus:descriptor.implementationStatus,readinessState:available?'AVAILABLE':pending?'RECOVERY_PENDING':'NOT_IMPLEMENTED',availableContractKeys:[],missingRequiredContractKeys:[],invalidContractKeys:[],blockers:available?[]:pending?['VIEW_RECOVERY_PENDING']:['CONSUMER_NOT_IMPLEMENTED'],diagnostics:available?[]:[{code:pending?'VIEW_RECOVERY_PENDING':'CONSUMER_NOT_IMPLEMENTED',severity:'INFO',contractKey:null,message:pending?'pending':'not implemented'}],contextSemanticHash:'fnv1a64:1111111111111111' };
    return { ...base, semanticHash:semanticHash(base) };
  });
}
