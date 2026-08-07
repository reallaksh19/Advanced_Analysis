#!/usr/bin/env node
import assert from 'node:assert/strict';
import { triangleSource } from './lafea.3-fixtures.mjs';
import { createLafeaArtifactRecord } from '../src/workspace/lafea-workbench.js';
import {
  createLafeaPreparationApproval,
  createLafeaPreparationEvidence,
  createLafeaPreparationFinding,
  createLafeaPreparationRequest,
  createLafeaWorkbenchStore,
  lafeaPreparationProfile,
  validateLafeaPreparationEvidence,
} from '../src/workspace/lafea-lifecycle-workbench-store.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import { issueLafeaSourceAuthority } from '../src/workspace/lafea-source-authority.js';

const CAPABILITIES = [
  'SOURCE', 'SCHEMA', 'UNIT', 'GEOMETRY', 'TOPOLOGY', 'MATERIAL', 'SECTION',
  'RESTRAINT', 'LOAD', 'PHYSICAL_CASE', 'CONSTRAINT',
];
const stageRequirements = {
  'LAFEA.1': false, 'LAFEA.2': false, 'LAFEA.3': true,
  'LAFEA.4': true, 'LAFEA.5': true, 'LAFEA.6': false,
};
for (const [stageId, geometryRequired] of Object.entries(stageRequirements)) {
  const profile = lafeaPreparationProfile(stageId);
  assert.equal(profile.analysisGeometryRequired, geometryRequired);
  assert.equal(profile.producerQualified, false);
  assert.equal(profile.qualifiedProducerRef, null);
  assert.match(profile.semanticHash, /^sha256:[0-9a-f]{64}$/u);
}

const requestA = createLafeaPreparationRequest({
  stageId: 'LAFEA.3', sourceHash: hash('source'), canonicalModelHash: hash('model'),
  analysisGeometryHash: hash('geometry'), preparationProfileId: 'PROFILE',
  preparationProfileHash: hash('profile'), requestedCaseIds: ['CASE-B', 'CASE-A'],
  stageAdapterId: 'ADAPTER',
});
const requestB = createLafeaPreparationRequest({
  stageId: 'LAFEA.3', sourceHash: hash('source'), canonicalModelHash: hash('model'),
  analysisGeometryHash: hash('geometry'), preparationProfileId: 'PROFILE',
  preparationProfileHash: hash('profile'), requestedCaseIds: ['CASE-A', 'CASE-B'],
  stageAdapterId: 'ADAPTER',
});
assert.deepEqual(requestA, requestB);

const advisory = finding('WARN-1', 'ADVISORY', false);
const conditional = finding('LAFEA_CONDITIONAL_APPROXIMATION', 'CONDITIONAL', true);
const blocker = finding('BLOCK-1', 'BLOCK', false);
const passEvidence = evidence(requestA, []);
const warnEvidence = evidence(requestA, [advisory, conditional]);
const blockEvidence = evidence(requestA, [blocker]);
assert.equal(passEvidence.status, 'PASS');
assert.equal(warnEvidence.status, 'WARN');
assert.equal(blockEvidence.status, 'BLOCK');
const tampered = structuredClone(passEvidence);
tampered.producerRef = 'TAMPERED';
assert.throws(() => validateLafeaPreparationEvidence(tampered),
  (error) => error?.code === 'LAFEA_PREPARATION_RECORD_TAMPERED');

const document = triangleSource();
const sourceHash = issueLafeaSourceAuthority('LAFEA.3', document, 'AC2').sourceHash;
const modelHash = hash('live-model');
const geometryHash = hash('live-geometry');
const store = createLafeaWorkbenchStore({ initialStage: 'LAFEA.3', initialDocument: document });
store.initializeLifecycle(sourceHash, 'AC2');
store.registerLifecycleArtifact(createLafeaArtifactRecord({
  stageId: 'LAFEA.3', kind: 'CANONICAL_MODEL', status: 'CURRENT', artifactHash: modelHash,
  parentHashes: { sourceHash }, qualification: 'PASS', producerRef: 'AC2/MODEL', diagnostics: [],
}), 'AC2-MODEL');
store.registerLifecycleArtifact(createLafeaArtifactRecord({
  stageId: 'LAFEA.3', kind: 'ANALYSIS_GEOMETRY', status: 'CURRENT', artifactHash: geometryHash,
  parentHashes: { sourceHash, canonicalModelHash: modelHash }, qualification: 'PASS',
  producerRef: 'AC2/GEOMETRY', diagnostics: [],
}), 'AC2-GEOMETRY');
const request = store.buildPreparationRequest(['CASE-2', 'CASE-1']);
assert.deepEqual(request.requestedCaseIds, ['CASE-1', 'CASE-2']);
assert.equal(request.sourceHash, sourceHash);
assert.equal(request.canonicalModelHash, modelHash);
assert.equal(request.analysisGeometryHash, geometryHash);

let publications = 0;
store.subscribe(() => { publications += 1; });
const liveEvidence = evidence(request, []);
let result = store.registerPreparationEvidence(liveEvidence);
assert.equal(result.changed, true);
assert.equal(publications, 1);
assert.equal(result.projection.state, 'CURRENT_BLOCK');
assert.ok(result.projection.reasons.includes('LAFEA_PREPARATION_PRODUCER_NOT_QUALIFIED'));
assert.equal(store.getState().stages['LAFEA.3'].orchestration.sections.AUTHORIZATION.state, 'BLOCKED');
result = store.registerPreparationEvidence(liveEvidence);
assert.equal(result.changed, false);
assert.equal(publications, 1);
assert.throws(() => store.registerPreparationEvidence(evidence(request, [advisory])),
  (error) => error?.code === 'LAFEA_PREPARATION_CONFLICTING_REPLAY');
assert.equal(publications, 1);

const warningStore = preparedStore(document, sourceHash, modelHash, geometryHash);
const warningRequest = warningStore.buildPreparationRequest(['CASE-1']);
const warningEvidence = evidence(warningRequest, [conditional]);
warningStore.registerPreparationEvidence(warningEvidence);
const approval = createLafeaPreparationApproval({
  stageId: 'LAFEA.3', preparationEvidenceHash: warningEvidence.semanticHash,
  warningFindingIds: [conditional.findingId], approverRef: 'ENGINEER:AC2',
  reason: 'Acknowledged bounded approximation.', acceptedLimitationIds: ['LIMIT-1'],
  invalidationPolicy: 'INVALIDATE_ON_PARENT_PROFILE_OR_FINDING_CHANGE',
});
warningStore.registerPreparationApproval(approval);
assert.equal(warningStore.selectRetainedPreparationApproval().semanticHash, approval.semanticHash);
assert.throws(() => warningStore.registerPreparationApproval(createLafeaPreparationApproval({
  stageId: 'LAFEA.3', preparationEvidenceHash: warningEvidence.semanticHash,
  warningFindingIds: ['UNKNOWN'], approverRef: 'ENGINEER:AC2', reason: 'bad',
  acceptedLimitationIds: [], invalidationPolicy: 'INVALIDATE_ON_PARENT_PROFILE_OR_FINDING_CHANGE',
})), (error) => error?.code === 'LAFEA_PREPARATION_APPROVAL_UNKNOWN_WARNING_ID');
warningStore.destroy();

const nodeB = store.getState().stages['LAFEA.3'].document.nodes.find((row) => row.nodeId === 'B');
store.setScalar('LAFEA.3.node.x', 'B', String(nodeB.x + 10), 'AC2');
assert.equal(store.getState().stages['LAFEA.3'].preparationProjection.state, 'STALE');
store.undo();
assert.equal(store.getState().stages['LAFEA.3'].preparationProjection.state, 'STALE');
store.destroy();

console.log(JSON.stringify({ check: 'lafea-ac2-preparation', status: 'PASS',
  currentProducerQualified: false, solverExecutionAdded: false, releaseQualified: false }));

function finding(code, disposition, authorizationRequired) {
  return createLafeaPreparationFinding({
    code, category: 'AUTHORIZATION', severity: disposition === 'BLOCK' ? 'ERROR' : 'WARNING',
    disposition, canonicalEntityIds: [], sourcePaths: [], physicalCaseIds: ['CASE-1'],
    capabilityEffects: [], evidence: { code }, message: code, technicalBasis: 'AC2 contract test.',
    remediation: 'Provide qualified preparation evidence.', approximationEligible: authorizationRequired,
    authorizationRequired,
  });
}
function evidence(request, findings) {
  return createLafeaPreparationEvidence({
    request, producerRef: 'AC2/UNQUALIFIED-DIAGNOSTIC-PRODUCER', producerRevision: '1',
    capabilityIds: CAPABILITIES, findings,
  });
}
function preparedStore(document, sourceHash, modelHash, geometryHash) {
  const target = createLafeaWorkbenchStore({ initialStage: 'LAFEA.3', initialDocument: document });
  target.initializeLifecycle(sourceHash, 'AC2/WARN');
  target.registerLifecycleArtifact(createLafeaArtifactRecord({
    stageId: 'LAFEA.3', kind: 'CANONICAL_MODEL', status: 'CURRENT', artifactHash: modelHash,
    parentHashes: { sourceHash }, qualification: 'PASS', producerRef: 'AC2/MODEL', diagnostics: [],
  }), 'AC2-WARN-MODEL');
  target.registerLifecycleArtifact(createLafeaArtifactRecord({
    stageId: 'LAFEA.3', kind: 'ANALYSIS_GEOMETRY', status: 'CURRENT', artifactHash: geometryHash,
    parentHashes: { sourceHash, canonicalModelHash: modelHash }, qualification: 'PASS', producerRef: 'AC2/GEOMETRY', diagnostics: [],
  }), 'AC2-WARN-GEOMETRY');
  return target;
}
function hash(value) { return canonicalLafeaSha256({ schema: 'ac2-hash/v1', value }); }
