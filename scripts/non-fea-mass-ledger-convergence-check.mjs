import assert from 'node:assert/strict';
import { compileFirstCutMassLedger } from '../src/core/first-cut-load-estimation/index.js';
import {
  compileNonFeaMassLedger,
  compileNonFeaMassLedgerBody,
  validateNonFeaMassLedger,
} from '../src/core/non-fea-engineering-foundation/index.js';
import { buildStraightFixture } from './w10.5-screening-fixtures.mjs';

const fixture = buildStraightFixture({
  lengthsM: [1.25, 0.75],
  opeFluidKgM: 2,
  hydFluidKgM: 3,
});
const sourceJson = JSON.stringify(fixture.sharedModel);
const foundationJson = JSON.stringify(fixture.modelLoads);
const enrichmentHash = 'fnv1a64:8d2f5c13a7b904e1';

const bodyA = compileNonFeaMassLedgerBody(fixture.modelLoads);
const bodyB = compileNonFeaMassLedgerBody(fixture.modelLoads);
assert.deepEqual(bodyA, bodyB, 'neutral mass-ledger kernel must be deterministic');

const historical = compileFirstCutMassLedger({
  sourceSemanticHash: fixture.sharedModel.semanticHash,
  enrichmentResultSemanticHash: enrichmentHash,
  modelLoadFoundation: fixture.modelLoads,
});
const common = compileNonFeaMassLedger({
  sourceSemanticHash: fixture.sharedModel.semanticHash,
  enrichmentProjectionSemanticHash: enrichmentHash,
  modelLoadFoundation: fixture.modelLoads,
});
const commonAgain = compileNonFeaMassLedger({
  sourceSemanticHash: fixture.sharedModel.semanticHash,
  enrichmentProjectionSemanticHash: enrichmentHash,
  modelLoadFoundation: fixture.modelLoads,
});

assert.equal(validateNonFeaMassLedger(common).ok, true);
assert.equal(common.semanticHash, commonAgain.semanticHash, 'neutral mass ledger hash must be deterministic');
assert.deepEqual(common.rows, historical.rows, 'historical and common ledgers must have exact row parity');
assert.deepEqual(common.cases, historical.cases, 'historical and common ledgers must have exact case/COG parity');
assert.equal(common.loadPrimitiveSemanticHash, historical.loadPrimitiveSemanticHash);
assert.equal(common.loadCaseSetSemanticHash, historical.loadCaseSetSemanticHash);
assert.ok(common.rows.length > 0);
assert.ok(common.cases.every((row) => Number.isFinite(row.massKg) && Number.isFinite(row.weightN)));
assert.equal(JSON.stringify(fixture.sharedModel), sourceJson, 'mass-ledger convergence mutated the source model');
assert.equal(JSON.stringify(fixture.modelLoads), foundationJson, 'mass-ledger convergence mutated W10.4 foundation');

console.log(JSON.stringify({
  check: 'non-fea-mass-ledger-convergence',
  status: 'PASS',
  neutralKernel: true,
  historicalCompatibilityWrapper: true,
  rowParity: true,
  caseCogParity: true,
  deterministic: true,
  sourceImmutable: true,
  modelLoadFoundationImmutable: true,
  rows: common.rows.length,
  cases: common.cases.length,
}, null, 2));
