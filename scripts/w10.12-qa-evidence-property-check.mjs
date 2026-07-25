import assert from 'node:assert/strict';
import { canonicalStringify, semanticHash } from '../src/core/shared-piping-model/index.js';
import { buildPipingPortTopologyGraph } from '../src/core/piping-topology/index.js';
import {
  createQaEvidenceExport, createQaEvidenceSource, createQaReviewModel,
  validateQaEvidenceSource,
} from '../src/core/qa-evidence/index.js';
import {
  CONSUMER_IDS, createWorkspaceConsumerContext,
  createWorkspaceConsumerReadinessRegistry, createWorkspaceConsumerRegistryV9,
} from '../src/core/workspace-consumers/index.js';
import { exactChain, sharedModelFixture } from './w10.2-topology-fixtures.mjs';

const registry = createWorkspaceConsumerRegistryV9();
const emptyContext = createWorkspaceConsumerContext({ datasetId:null, workspaceVersion:0, selectedEntityId:null, contracts:{} });
const emptyReadiness = readinessFor(emptyContext);
const baseline = createQaEvidenceSource({ workspaceConsumerRegistry:registry, workspaceConsumerContext:emptyContext, workspaceConsumerReadinessRows:emptyReadiness });

const reorderedRegistry = Object.freeze({ semanticHash:registry.semanticHash, consumers:registry.consumers, schema:registry.schema });
const reordered = createQaEvidenceSource({ workspaceConsumerRegistry:reorderedRegistry, workspaceConsumerContext:emptyContext, workspaceConsumerReadinessRows:[...emptyReadiness].reverse() });
assert.equal(reordered.semanticHash, baseline.semanticHash);
assert.equal(canonicalStringify(reordered), canonicalStringify(baseline));

const shared = sharedModelFixture(exactChain(2), { datasetId:'QA-SELECTION' });
const contextA = createWorkspaceConsumerContext({ datasetId:'QA-SELECTION', workspaceVersion:2, selectedEntityId:null, contracts:{ sharedModel:shared } });
const contextB = createWorkspaceConsumerContext({ datasetId:'QA-SELECTION', workspaceVersion:3, selectedEntityId:'CHAIN-1', contracts:{ sharedModel:shared } });
assert.equal(contextA.semanticHash, contextB.semanticHash);
const sourceA = createQaEvidenceSource({ workspaceConsumerRegistry:registry, workspaceConsumerContext:contextA, workspaceConsumerReadinessRows:readinessFor(contextA) });
const sourceB = createQaEvidenceSource({ workspaceConsumerRegistry:registry, workspaceConsumerContext:contextB, workspaceConsumerReadinessRows:readinessFor(contextB) });
const reviewA = createQaReviewModel(sourceA), reviewB = createQaReviewModel(sourceB);
assert.equal(sourceA.semanticHash, sourceB.semanticHash);
assert.equal(reviewA.semanticHash, reviewB.semanticHash);
assert.equal(sourceA.contextReference.workspaceVersion, 2);
assert.equal(sourceB.contextReference.workspaceVersion, 3);
assert.deepEqual(sourceA.consumerRows.map((row) => row.consumerId), sourceB.consumerRows.map((row) => row.consumerId));
assert.deepEqual(sourceA.contractRows.map((row) => row.contractKey), sourceB.contractRows.map((row) => row.contractKey));
assert.equal(reviewA.qualityState, 'VALID_PARTIAL');
assert.equal(sourceA.contractRows.find((row) => row.contractKey === 'sharedModel').availability, 'AVAILABLE');

const invalidContractContext = createWorkspaceConsumerContext({ datasetId:'QA-INVALID', workspaceVersion:1, selectedEntityId:null, contracts:{ sharedModel:{ schema:'shared-piping-model/v1' } } });
const invalidSource = createQaEvidenceSource({ workspaceConsumerRegistry:registry, workspaceConsumerContext:invalidContractContext, workspaceConsumerReadinessRows:readinessFor(invalidContractContext) });
const invalidSharedRow = invalidSource.contractRows.find((row) => row.contractKey === 'sharedModel');
assert.equal(invalidSharedRow.availability, 'INVALID');
assert.equal(invalidSharedRow.validatorState, 'INVALID');
assert.equal(invalidSharedRow.datasetState, 'NOT_APPLICABLE');

const mismatchedModel = sharedModelFixture(exactChain(1), { datasetId:'QA-A' });
const mismatchContext = createWorkspaceConsumerContext({ datasetId:'QA-B', workspaceVersion:1, selectedEntityId:null, contracts:{ sharedModel:mismatchedModel } });
const mismatchSource = createQaEvidenceSource({ workspaceConsumerRegistry:registry, workspaceConsumerContext:mismatchContext, workspaceConsumerReadinessRows:readinessFor(mismatchContext) });
const mismatchRow = mismatchSource.contractRows.find((row) => row.contractKey === 'sharedModel');
assert.equal(mismatchRow.availability, 'INVALID');
assert.equal(mismatchRow.datasetState, 'REJECTED');

const firstModel = sharedModelFixture(exactChain(1), { datasetId:'QA-STALE' });
const secondModel = sharedModelFixture(exactChain(2), { datasetId:'QA-STALE' });
const staleGraph = buildPipingPortTopologyGraph(firstModel);
const staleContext = createWorkspaceConsumerContext({ datasetId:'QA-STALE', workspaceVersion:1, selectedEntityId:null, contracts:{ sharedModel:secondModel, topologyGraph:staleGraph } });
const staleSource = createQaEvidenceSource({ workspaceConsumerRegistry:registry, workspaceConsumerContext:staleContext, workspaceConsumerReadinessRows:readinessFor(staleContext) });
const staleRow = staleSource.contractRows.find((row) => row.contractKey === 'topologyGraph');
assert.equal(staleRow.availability, 'INVALID');
assert.equal(staleRow.linkState, 'STALE');

const qualifiedModel = JSON.parse(JSON.stringify(shared));
qualifiedModel.qualificationSummary = [{ code:'SOURCE_QUALIFICATION_RETAINED', state:'QUALIFIED' }];
qualifiedModel.semanticHash = semanticHash(withoutHash(qualifiedModel));
const qualifiedContext = createWorkspaceConsumerContext({ datasetId:'QA-SELECTION', workspaceVersion:4, selectedEntityId:null, contracts:{ sharedModel:qualifiedModel } });
const qualifiedSource = createQaEvidenceSource({ workspaceConsumerRegistry:registry, workspaceConsumerContext:qualifiedContext, workspaceConsumerReadinessRows:readinessFor(qualifiedContext) });
assert.deepEqual(qualifiedSource.contractRows.find((row) => row.contractKey === 'sharedModel').qualificationSummary, qualifiedModel.qualificationSummary);

const forgedRetained = JSON.parse(JSON.stringify(contextA));
forgedRetained.contracts.sharedModel = mismatchedModel;
assert.throws(() => createQaEvidenceSource({ workspaceConsumerRegistry:registry, workspaceConsumerContext:forgedRetained, workspaceConsumerReadinessRows:readinessFor(contextA) }), /context/i);
const incompleteSlots = JSON.parse(JSON.stringify(contextA));
delete incompleteSlots.contracts.topologyGraph;
assert.throws(() => createQaEvidenceSource({ workspaceConsumerRegistry:registry, workspaceConsumerContext:incompleteSlots, workspaceConsumerReadinessRows:readinessFor(contextA) }), /context/i);
const unknownSlot = JSON.parse(JSON.stringify(contextA));
unknownSlot.contracts.unknownSlot = null;
assert.throws(() => createQaEvidenceSource({ workspaceConsumerRegistry:registry, workspaceConsumerContext:unknownSlot, workspaceConsumerReadinessRows:readinessFor(contextA) }), /context/i);
const contradictoryReadiness = JSON.parse(JSON.stringify(readinessFor(contextA)));
const qa = contradictoryReadiness.find((row) => row.consumerId === CONSUMER_IDS.QA);
qa.readinessState = 'BLOCKED_MISSING_CONTRACTS';
qa.semanticHash = semanticHash(withoutHash(qa));
assert.throws(() => createQaEvidenceSource({ workspaceConsumerRegistry:registry, workspaceConsumerContext:contextA, workspaceConsumerReadinessRows:contradictoryReadiness }), /official evidence/i);

const jsonA = createQaEvidenceExport({ source:sourceA, reviewModel:reviewA, format:'JSON' });
const jsonAgain = createQaEvidenceExport({ source:sourceA, reviewModel:reviewA, format:'JSON' });
const csvA = createQaEvidenceExport({ source:sourceA, reviewModel:reviewA, format:'CSV' });
const csvAgain = createQaEvidenceExport({ source:sourceA, reviewModel:reviewA, format:'CSV' });
assert.equal(canonicalStringify(jsonA), canonicalStringify(jsonAgain));
assert.equal(canonicalStringify(csvA), canonicalStringify(csvAgain));
assert.equal(jsonA.content, jsonAgain.content);
assert.equal(csvA.content, csvAgain.content);
assert.equal(validateQaEvidenceSource(sourceA).ok, true);
assert.equal(hasNegativeZero(sourceA), false);
console.log('✅ W10.12 selection independence, official validation, invalid/mismatched/stale evidence and export determinism passed.');

function readinessFor(context) { return createWorkspaceConsumerReadinessRegistry(registry, context, { workspaceBooted:true, settingsAuthorityInitialized:true, settingsDefinitionsAvailable:true, settingsProfileValid:true }); }
function withoutHash(value) { const { semanticHash:_hash, ...rest } = value; return rest; }
function hasNegativeZero(value) { if (typeof value === 'number') return Object.is(value, -0); if (Array.isArray(value)) return value.some(hasNegativeZero); if (value && typeof value === 'object') return Object.values(value).some(hasNegativeZero); return false; }
