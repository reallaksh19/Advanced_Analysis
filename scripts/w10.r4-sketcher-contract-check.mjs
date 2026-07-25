import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import {
  SKETCHER_COMMAND_SCHEMA, SKETCHER_DRAFT_AUDIT_SCHEMA, SKETCHER_DRAFT_DOCUMENT_SCHEMA,
  SKETCHER_REVIEW_MODEL_SCHEMA, SKETCHER_WORKSPACE_ADOPTION_SCHEMA,
  SketcherDraftAuthority, createEmptySketcherDraft, createSketcherCommand,
  createSketcherReviewModel, createSketcherWorkspaceAdoption, createSketcherWorkspacePackage,
  validateSketcherDraftDocument,
} from '../src/core/sketcher-draft/index.js';
import {
  CONSUMER_IDS, createApplicationViewState, createApplicationViewStateV2,
  createApplicationViewStateV3, createApplicationViewStateV4, createApplicationViewStateV5,
  createApplicationViewStateV6, createApplicationViewStateV7, createApplicationViewStateV8,
  createWorkspaceConsumerRegistry, createWorkspaceConsumerRegistryV2,
  createWorkspaceConsumerRegistryV3, createWorkspaceConsumerRegistryV4,
  createWorkspaceConsumerRegistryV5, createWorkspaceConsumerRegistryV6,
  createWorkspaceConsumerRegistryV7, createWorkspaceConsumerRegistryV8,
} from '../src/core/workspace-consumers/index.js';

const authority = new SketcherDraftAuthority();
const add = authority.createCommand('ADD_PIPE_SEGMENT', {
  start: { xMm: 0, yMm: 0, zMm: 0 }, end: { xMm: 1000, yMm: 0, zMm: 0 },
});
assert.equal(authority.execute(add).accepted, true);
const document = authority.getDocument(), audit = authority.getAudit();
const review = createSketcherReviewModel({ document, audit });
const packageJson = createSketcherWorkspacePackage(document);
const adoption = createSketcherWorkspaceAdoption({
  document, packageJson,
  proof: { normalizedDatasetId: 'dataset-1', normalizedSharedModelSemanticHash: 'fnv1a64:1111111111111111', normalizedTopologySemanticHash: 'fnv1a64:2222222222222222', normalizedPipeCount: 1, coordinatesPreserved: true, geometryFinite: true },
});

assert.equal(document.schema, SKETCHER_DRAFT_DOCUMENT_SCHEMA);
assert.equal(add.schema, SKETCHER_COMMAND_SCHEMA);
assert.equal(audit.schema, SKETCHER_DRAFT_AUDIT_SCHEMA);
assert.equal(review.schema, SKETCHER_REVIEW_MODEL_SCHEMA);
assert.equal(adoption.schema, SKETCHER_WORKSPACE_ADOPTION_SCHEMA);
assert.deepEqual(Object.keys(document).sort(), ['draftId','nodes','revision','schema','segments','semanticHash','source','units','workingPlane']);
assert.deepEqual(Object.keys(add).sort(), ['commandId','commandType','payload','schema','semanticHash']);
assert.deepEqual(Object.keys(adoption).sort(), ['coordinateToleranceMm','draftId','draftRevision','draftSegmentCount','draftSemanticHash','normalizedDatasetId','normalizedPipeCount','normalizedSharedModelSemanticHash','normalizedTopologySemanticHash','qualification','schema','semanticHash','workspacePackageSemanticHash']);
for (const value of [document, document.nodes, document.nodes[0], document.segments, audit, review, adoption]) assert.equal(Object.isFrozen(value), true);

const ordered = authority.getDocument();
assert.deepEqual(ordered.nodes.map((row) => row.nodeId), ['N001','N002']);
assert.deepEqual(ordered.segments.map((row) => row.segmentId), ['S001']);
const forged = JSON.parse(JSON.stringify(document)); forged.semanticHash = 'fnv1a64:0000000000000000';
assert.equal(validateSketcherDraftDocument(forged).ok, false);
rejectDocument((row) => { row.nodes[0].xMm = Infinity; });
rejectDocument((row) => { row.nodes.push({ ...row.nodes[0] }); });
rejectDocument((row) => { row.segments[0].endNodeId = 'missing'; });
rejectDocument((row) => { row.segments[0].endNodeId = row.segments[0].startNodeId; });
rejectDocument((row) => { row.segments.push({ ...row.segments[0], segmentId: 'S002' }); });
rejectDocument((row) => { row.segments[0].componentType = 'ELBOW'; });
const executable = JSON.parse(JSON.stringify(document)); executable.nodes[0].xMm = () => 1;
assert.equal(validateSketcherDraftDocument(executable).ok, false);
const prototype = JSON.parse(JSON.stringify(document)); prototype.nodes[0] = new Date();
assert.equal(validateSketcherDraftDocument(prototype).ok, false);
assert.equal(createSketcherReviewModel({ document, audit }).semanticHash, review.semanticHash);
assert.equal(createSketcherWorkspaceAdoption({ document, packageJson, proof: { normalizedDatasetId: 'dataset-1', normalizedSharedModelSemanticHash: 'fnv1a64:1111111111111111', normalizedTopologySemanticHash: 'fnv1a64:2222222222222222', normalizedPipeCount: 1, coordinatesPreserved: true, geometryFinite: true } }).semanticHash, adoption.semanticHash);

const registryFactories = [createWorkspaceConsumerRegistry,createWorkspaceConsumerRegistryV2,createWorkspaceConsumerRegistryV3,createWorkspaceConsumerRegistryV4,createWorkspaceConsumerRegistryV5,createWorkspaceConsumerRegistryV6,createWorkspaceConsumerRegistryV7,createWorkspaceConsumerRegistryV8];
const registryHashes = ['fnv1a64:933de417d77f43d2','fnv1a64:22f426d2b0677d92','fnv1a64:496eed4568692dfa','fnv1a64:e47035052f70a27c','fnv1a64:3c6af36714a4bedf','fnv1a64:805131b97e910a7c','fnv1a64:c157f6bb40161017','fnv1a64:f49703c58cac2af8'];
assert.deepEqual(registryFactories.map((factory) => factory().semanticHash), registryHashes);
for (const version of [4,5,6]) assert.equal(registryFactories[version]().consumers.find((row) => row.consumerId === CONSUMER_IDS.SKETCHER).implementationStatus, 'RECOVERY_PENDING');
const sketcher = createWorkspaceConsumerRegistryV8().consumers.find((row) => row.consumerId === CONSUMER_IDS.SKETCHER);
assert.equal(sketcher.implementationStatus, 'IMPLEMENTED');
assert.deepEqual(sketcher.requiredContractKeys, []);
assert.equal(sketcher.engineeringClaimPolicy, 'DRAFT_GEOMETRY_AND_EXPLICIT_WORKSPACE_ADOPTION_ONLY');

const viewFactories = [createApplicationViewState,createApplicationViewStateV2,createApplicationViewStateV3,createApplicationViewStateV4,createApplicationViewStateV5,createApplicationViewStateV6,createApplicationViewStateV7,createApplicationViewStateV8];
const viewHashes = ['fnv1a64:bcd8d6c26099e9ff','fnv1a64:57389d9f6c56539a','fnv1a64:b80447adeaaff2a1','fnv1a64:af4575a5919173d2','fnv1a64:45db9398b1cb8fe9','fnv1a64:4222c17148566e56','fnv1a64:29a8fa0ed3f5ea60','fnv1a64:c148a9ed27f3a3d3'];
assert.deepEqual(registryFactories.map((factory, index) => semanticHash(viewFactories[index](readinessRows(factory())))), viewHashes);
console.log('✅ W10.R4 exact contracts, immutability, validation and v1-v7 preservation passed.');

function rejectDocument(mutator) { const value = JSON.parse(JSON.stringify(document)); mutator(value); try { value.semanticHash = semanticHash(withoutHash(value)); } catch { /* invalid JSON evidence is expected */ } assert.equal(validateSketcherDraftDocument(value).ok, false); }
function withoutHash(value) { const { semanticHash: _hash, ...rest } = value; return rest; }
function readinessRows(registry) {
  return registry.consumers.map((descriptor) => {
    const available = descriptor.implementationStatus === 'IMPLEMENTED', pending = descriptor.implementationStatus === 'RECOVERY_PENDING';
    const base = { schema:'workspace-consumer-readiness/v1',consumerId:descriptor.consumerId,implementationStatus:descriptor.implementationStatus,readinessState:available?'AVAILABLE':pending?'RECOVERY_PENDING':'NOT_IMPLEMENTED',availableContractKeys:[],missingRequiredContractKeys:[],invalidContractKeys:[],blockers:available?[]:pending?['VIEW_RECOVERY_PENDING']:['CONSUMER_NOT_IMPLEMENTED'],diagnostics:available?[]:[{code:pending?'VIEW_RECOVERY_PENDING':'CONSUMER_NOT_IMPLEMENTED',severity:'INFO',contractKey:null,message:pending?'pending':'not implemented'}],contextSemanticHash:'fnv1a64:1111111111111111' };
    return { ...base, semanticHash: semanticHash(base) };
  });
}
