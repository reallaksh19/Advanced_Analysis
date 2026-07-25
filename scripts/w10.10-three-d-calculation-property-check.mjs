import assert from 'node:assert/strict';
import { createThreeDCalculationReviewModel } from '../src/core/three-d-calculation-consumer/index.js';
import { canonicalPrettyStringify } from '../src/core/shared-piping-model/index.js';
import { buildReorderedW1010Context, buildW1010Context, staleOptionalBeamContext } from './w10.10-fixtures.mjs';

const SEED = 10102026;
console.log(`\n--- W10.10 fixed-seed properties (${SEED}) ---\n`);
checkOrderInvariance();
checkMetadataInvariance();
checkCanonicalOrdering();
checkStableReferences();
console.log('✅ W10.10 fixed-seed properties passed.\n');

function checkOrderInvariance() {
  const normal = createThreeDCalculationReviewModel(buildW1010Context());
  const reversed = createThreeDCalculationReviewModel(buildReorderedW1010Context());
  assert.equal(reversed.reviewModelId, normal.reviewModelId);
  assert.equal(reversed.semanticHash, normal.semanticHash);
  assert.equal(canonicalPrettyStringify(payload(reversed)), canonicalPrettyStringify(payload(normal)));
  assert.deepEqual(normal.components.map((row) => row.componentKey), sorted(normal.components.map((row) => row.componentKey)));
  assert.deepEqual(normal.ports.map((row) => row.portKey), sorted(normal.ports.map((row) => row.portKey)));
  assert.deepEqual(normal.connections.map((row) => row.connectionId), sorted(normal.connections.map((row) => row.connectionId)));
  assert.deepEqual(normal.supportAttachments.map(attachmentKey), sorted(normal.supportAttachments.map(attachmentKey)));
  assert.deepEqual(normal.loadPrimitives.map((row) => row.primitiveId), sorted(normal.loadPrimitives.map((row) => row.primitiveId)));
  assert.deepEqual(normal.verticalBeamCases.map(caseKey), sorted(normal.verticalBeamCases.map(caseKey)));
}

function checkMetadataInvariance() {
  const first = createThreeDCalculationReviewModel(buildW1010Context({ workspaceVersion: 1, selectedEntityId: 'COMP-1' }));
  const second = createThreeDCalculationReviewModel(buildW1010Context({ workspaceVersion: 99, selectedEntityId: 'COMP-2' }));
  assert.equal(first.contextSemanticHash, second.contextSemanticHash);
  assert.equal(first.reviewModelId, second.reviewModelId);
  assert.equal(first.semanticHash, second.semanticHash);
}

function checkCanonicalOrdering() {
  const model = createThreeDCalculationReviewModel(staleOptionalBeamContext());
  const diagnosticKeys = model.diagnostics.map((row) => `${row.scope}|${row.code}|${row.message}`);
  assert.deepEqual(diagnosticKeys, sorted(diagnosticKeys));
  model.components.forEach((row) => assert.deepEqual(row.portKeys, sorted(row.portKeys)));
  model.topologyComponents.forEach((row) => {
    assert.deepEqual(row.componentKeys, sorted(row.componentKeys));
    assert.deepEqual(row.portKeys, sorted(row.portKeys));
    assert.deepEqual(row.connectionIds, sorted(row.connectionIds));
  });
}

function checkStableReferences() {
  const context = buildW1010Context();
  const first = createThreeDCalculationReviewModel(context);
  const second = createThreeDCalculationReviewModel(context);
  assert.equal(first.sourceContext, context);
  assert.equal(second.sourceContext, context);
  assert.deepEqual(first.sourceReferences, second.sourceReferences);
  Object.values(first.sourceReferences).filter(Boolean).forEach((hash) => assert.match(hash, /^fnv1a64:/));
}

function payload(value) { const { sourceContext: _source, ...rest } = value; return rest; }
function attachmentKey(row) { return `${row.supportKey}\0${row.attachmentId || ''}`; }
function caseKey(row) { return `${row.pathId}\0${row.loadCaseId}`; }
function sorted(rows) { return [...rows].sort(); }
