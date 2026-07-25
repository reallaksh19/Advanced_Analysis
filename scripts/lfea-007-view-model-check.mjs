import assert from 'node:assert/strict';
import {
  compareLfeaIdentity, createInitialLfeaConsumerProfile, createQualifiedLfeaConsumerSession,
  createLfeaConsumerViewModel, inspectLfeaSourceObject, lfeaSelectionIdentity,
  resolveLfeaSelection, updateLfeaConsumerSession,
} from '../src/core/lfea-consumer/index.js';
import { convergenceConsumerFixture, q4ConsumerFixture, t3ConsumerFixture } from './lfea-007-fixtures.mjs';

const profile = createInitialLfeaConsumerProfile();
for (const fixture of [q4ConsumerFixture({ projection:true }), t3ConsumerFixture()]) {
  const bundle = inspectLfeaSourceObject(fixture.review, { profile, sourceName:'review.json', sourceByteLength:1 });
  const session = createQualifiedLfeaConsumerSession(bundle);
  const first = createLfeaConsumerViewModel(bundle, session, profile);
  const second = createLfeaConsumerViewModel(bundle, session, profile);
  assert.equal(first.semanticHash, second.semanticHash);
  assert.deepEqual(first, second);
  assert.equal(first.display.resultMode, 'RAW');
  assert.equal(first.rawStress.authority, 'AUTHORITATIVE_RAW_ELEMENT_OR_INTEGRATION_POINT_STRESS');
  assert.equal(first.display.layerVisibility.PROJECTED_STRESS, false);
  assert.equal(first.geometry.nodes[0].deformedX, fixture.review.geometryReview.nodes[0].deformedX);
  assert.equal(first.geometry.nodes[0].deformedY, fixture.review.geometryReview.nodes[0].deformedY);
  assert.equal(first.display.tables.nodes.rows.length, Math.min(profile.tablePageSize, fixture.review.geometryReview.nodes.length));
  const node = first.geometry.nodes[0];
  assert.equal(resolveLfeaSelection(first, { type:'NODE', identity:node.nodeId }), node);
  assert.equal(resolveLfeaSelection(first, { type:'NODE', identity:'ABSENT' }), null);
  const paged = updateLfeaConsumerSession(session, { tablePages:{ ...session.tablePages, nodes:2 } });
  const next = createLfeaConsumerViewModel(bundle, paged, profile);
  assert.equal(next.display.tables.nodes.currentPage, next.display.tables.nodes.totalPages);
}

const projected = q4ConsumerFixture({ projection:true });
const projectedBundle = inspectLfeaSourceObject(projected.review, { profile, sourceName:'projection.json', sourceByteLength:1 });
let projectedSession = createQualifiedLfeaConsumerSession(projectedBundle);
projectedSession = updateLfeaConsumerSession(projectedSession, { resultMode:'PROJECTED', layerVisibility:{ ...projectedSession.layerVisibility, PROJECTED_STRESS:true } });
const projectedModel = createLfeaConsumerViewModel(projectedBundle, projectedSession, profile);
assert.equal(projectedModel.projectedStress.authority, 'NON_AUTHORITATIVE_REVIEW_PROJECTION');
assert.equal(projectedModel.rawStress.governing.semanticHash, projected.review.rawStressReview.governing.semanticHash);
assertExactSelection(projectedModel, 'RAW_STRESS_LOCATION', projectedModel.rawStress.rows[0]);
assertExactSelection(projectedModel, 'REACTION', projectedModel.reactions.rows[0]);
assertExactSelection(projectedModel, 'PROJECTED_STRESS_LOCATION', projectedModel.projectedStress.elementCornerValues[0]);
assertExactSelection(projectedModel, 'PROJECTED_STRESS_LOCATION', projectedModel.projectedStress.nodalValues[0]);

const convergence = convergenceConsumerFixture({ projection:true });
const convergenceBundle = inspectLfeaSourceObject(convergence.review, { profile, sourceName:'convergence.json', sourceByteLength:1 });
const convergenceModel = createLfeaConsumerViewModel(convergenceBundle, createQualifiedLfeaConsumerSession(convergenceBundle), profile);
assertExactSelection(convergenceModel, 'CONVERGENCE_QUANTITY', convergenceModel.convergence.levels[0]);
assertExactSelection(convergenceModel, 'CONVERGENCE_QUANTITY', convergenceModel.convergence.quantities[0]);
assert.equal(compareLfeaIdentity('Z10','a2'), -1);
assert.equal(compareLfeaIdentity('a2','Z10'), 1);
assert.equal(compareLfeaIdentity('same','same'), 0);
console.log('LFEA-007 view-model qualification passed.');

function assertExactSelection(model, type, row) {
  const identity = lfeaSelectionIdentity(type, row);
  assert.equal(resolveLfeaSelection(model, { type, identity }), row);
}
