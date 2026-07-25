import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createPipeSolverConsumerSource,
  createPipeSolverReviewModel,
} from '../src/core/pipe-solver-consumer/index.js';
import { canonicalPrettyStringify, deepFreeze } from '../src/core/shared-piping-model/index.js';
import { buildW1011Fixture } from './w10.11-fixtures.mjs';

const SEED = 10112026;
console.log(`\n--- W10.11 fixed-seed properties (${SEED}) ---\n`);
runProperties();
console.log('✅ W10.11 fixed-seed properties passed.\n');

function runProperties() {
  try {
    checkDiagnosticOrderInvariance();
    checkLedgerOrderInvariance();
    checkSameIdReplacementIdentity();
    checkRepeatedIdentity();
    checkExactReferences();
  } catch (error) {
    retainFailure(error);
    throw error;
  }
}

function checkDiagnosticOrderInvariance() {
  const normal = source(buildW1011Fixture({ missing: ['alpha', 'Sa'] }));
  const reversed = source(buildW1011Fixture({ missing: ['alpha', 'Sa'], reverseDiagnostics: true }));
  assert.equal(normal.semanticHash, reversed.semanticHash);
  const normalReview = review(normal);
  const reversedReview = review(reversed);
  if (normalReview.semanticHash !== reversedReview.semanticHash) retainDifference(normalReview, reversedReview);
  assert.equal(normalReview.semanticHash, reversedReview.semanticHash);
  assert.deepEqual(diagnosticKeys(normal.capability.diagnostics), sorted(diagnosticKeys(normal.capability.diagnostics)));
}

function checkLedgerOrderInvariance() {
  const fixture = buildW1011Fixture();
  const reversedFixture = {
    ...fixture,
    ledgerSnapshot: deepFreeze({
      ...fixture.ledgerSnapshot,
      entries: deepFreeze([...fixture.ledgerSnapshot.entries].reverse()),
    }),
  };
  const normal = source(fixture);
  const reversed = source(reversedFixture);
  assert.equal(normal.semanticHash, reversed.semanticHash);
  assert.deepEqual(normal.matchingLedgerEntries.map((row) => row.entryId), reversed.matchingLedgerEntries.map((row) => row.entryId));
  assert.deepEqual(normal.matchingLedgerEntries.map(orderKey), sorted(normal.matchingLedgerEntries.map(orderKey)));
}

function checkSameIdReplacementIdentity() {
  const current = source(buildW1011Fixture({ datasetId: 'SAME-ID', workspaceVersion: 87 }));
  const replacement = source(buildW1011Fixture({ datasetId: 'SAME-ID', workspaceVersion: 1 }));
  assert.equal(current.datasetId, replacement.datasetId);
  assert.equal(current.selectedEntityId, replacement.selectedEntityId);
  assert.notEqual(current.semanticHash, replacement.semanticHash);
  assert.notEqual(review(current).reviewModelId, review(replacement).reviewModelId);
}

function checkRepeatedIdentity() {
  const fixture = buildW1011Fixture({ sessionStatus: 'completed' });
  const firstSource = source(fixture);
  const secondSource = source(fixture);
  const firstReview = review(firstSource);
  const secondReview = review(secondSource);
  assert.equal(firstSource.semanticHash, secondSource.semanticHash);
  assert.equal(firstReview.reviewModelId, secondReview.reviewModelId);
  assert.equal(firstReview.semanticHash, secondReview.semanticHash);
  assert.equal(canonicalPrettyStringify(payload(firstReview)), canonicalPrettyStringify(payload(secondReview)));
}

function checkExactReferences() {
  const fixture = buildW1011Fixture({ sessionStatus: 'completed' });
  const sourceValue = source(fixture);
  const reviewValue = review(sourceValue);
  assert.equal(sourceValue.sourceContext, fixture.sourceContext);
  assert.equal(sourceValue.activeSession, fixture.sessionSnapshot.session);
  assert.equal(reviewValue.sourceSnapshot, sourceValue);
  assert.equal(reviewValue.currentResult, fixture.sessionSnapshot.session.result);
  assert.equal(reviewValue.sourceReferences.capabilityFields, fixture.capabilityInspection.fields);
  assert.equal(reviewValue.sourceReferences.matchingLedgerEntries, sourceValue.matchingLedgerEntries);
}

function retainDifference(normal, reversed) {
  writeDiagnostic('w10.11-diagnostic-order-diff.json', {
    normal: identityPayload(normal),
    reversed: identityPayload(reversed),
  });
}

function retainFailure(error) {
  writeDiagnostic('w10.11-property-failure.json', {
    seed: SEED,
    name: error?.name || 'Error',
    message: error?.message || String(error),
    stack: error?.stack || null,
  });
}

function writeDiagnostic(fileName, value) {
  const directory = path.join(process.cwd(), 'test-results');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, fileName), JSON.stringify(value, null, 2));
}

function source(fixture) { return createPipeSolverConsumerSource(fixture); }
function review(sourceValue) { return createPipeSolverReviewModel(sourceValue); }
function diagnosticKeys(rows) { return rows.map((row) => `${row.code}\0${row.message}`); }
function orderKey(row) { return `${String(row.sequence).padStart(8, '0')}\0${row.entryId}`; }
function sorted(rows) { return [...rows].sort((left, right) => left.localeCompare(right)); }
function identityPayload(value) {
  const { sourceSnapshot: _source, sourceReferences: _references, reviewModelId: _id, semanticHash: _hash, ...rest } = value;
  return rest;
}
function payload(value) {
  const { sourceSnapshot: _source, sourceReferences: _references, ...rest } = value;
  return rest;
}
