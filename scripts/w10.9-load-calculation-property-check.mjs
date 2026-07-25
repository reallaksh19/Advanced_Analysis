import assert from 'node:assert/strict';
import { createLoadCalculationReviewModel } from '../src/core/load-calculation-consumer/index.js';
import {
  projectComponentOutcomes,
  projectLoadCases,
  projectPrimitives,
  projectScreeningSummary,
} from '../src/core/load-calculation-consumer/projection.js';
import { canonicalStringify } from '../src/core/shared-piping-model/index.js';
import { buildAllPrimitiveContext, buildW109Context } from './w10.9-fixtures.mjs';

console.log('\n--- W10.9 fixed-seed deterministic properties ---\n');
const random = seededRandom(1092026);
for (let index = 0; index < 40; index += 1) checkPermutation(random);
checkIdentityStability();
checkSourceReferences();
console.log('✅ W10.9 fixed-seed deterministic properties passed.\n');

function checkPermutation(random) {
  const all = buildAllPrimitiveContext();
  const primitiveSet = all.contracts.loadPrimitiveSet;
  const readiness = all.contracts.modelLoadReadinessAudit;
  const loadCases = all.contracts.loadCaseSet;
  const expectedCases = projectLoadCases(loadCases, readiness);
  const expectedOutcomes = projectComponentOutcomes(primitiveSet);
  const expectedPrimitives = projectPrimitives(primitiveSet);
  const permutedCases = { ...loadCases, loadCases: shuffle(loadCases.loadCases, random) };
  const permutedReadiness = {
    ...readiness,
    cases: shuffle(readiness.cases.map((row) => ({
      ...row,
      blockers: shuffle(row.blockers, random),
      diagnostics: shuffle(row.diagnostics, random),
    })), random),
  };
  const permutedPrimitives = {
    ...primitiveSet,
    componentOutcomes: shuffle(primitiveSet.componentOutcomes.map((row) => ({
      ...row,
      blockers: shuffle(row.blockers, random),
      diagnostics: shuffle(row.diagnostics, random),
    })), random),
    primitives: shuffle(primitiveSet.primitives.map((row) => ({
      ...row,
      diagnostics: shuffle(row.diagnostics, random),
    })), random),
  };
  assert.equal(canonicalStringify(projectLoadCases(permutedCases, permutedReadiness)), canonicalStringify(expectedCases));
  assert.equal(canonicalStringify(projectComponentOutcomes(permutedPrimitives)), canonicalStringify(expectedOutcomes));
  assert.equal(canonicalStringify(projectPrimitives(permutedPrimitives)), canonicalStringify(expectedPrimitives));
  checkScreeningPermutation(random);
}

function checkScreeningPermutation(random) {
  const context = buildW109Context();
  const path = context.contracts.verticalLoadPathModel;
  const screening = context.contracts.supportLoadScreening;
  const audit = context.contracts.supportLoadScreeningAudit;
  const expected = projectScreeningSummary(path, screening, audit);
  const permutedAudit = {
    ...audit,
    records: shuffle(audit.records.map((row) => ({
      ...row,
      blockers: shuffle(row.blockers, random),
      diagnostics: shuffle(row.diagnostics, random),
    })), random),
  };
  assert.equal(canonicalStringify(projectScreeningSummary(path, screening, permutedAudit)), canonicalStringify(expected));
}

function checkIdentityStability() {
  const context = buildW109Context();
  const baseline = createLoadCalculationReviewModel(context);
  for (let index = 0; index < 20; index += 1) {
    const current = createLoadCalculationReviewModel(context);
    assert.equal(current.reviewModelId, baseline.reviewModelId);
    assert.equal(current.semanticHash, baseline.semanticHash);
  }
  const selectionA = createLoadCalculationReviewModel(buildW109Context({ selectedEntityId: 'COMP-1' }));
  const selectionB = createLoadCalculationReviewModel(buildW109Context({ selectedEntityId: 'COMP-2' }));
  assert.equal(selectionA.reviewModelId, selectionB.reviewModelId);
  assert.equal(selectionA.semanticHash, selectionB.semanticHash);
}

function checkSourceReferences() {
  const context = buildW109Context();
  const model = createLoadCalculationReviewModel(context);
  assert.equal(model.sourceReferences.sharedModelSemanticHash, context.contracts.sharedModel.semanticHash);
  assert.equal(model.sourceReferences.loadCaseSetSemanticHash, context.contracts.loadCaseSet.semanticHash);
  assert.equal(model.sourceReferences.loadPrimitiveSetSemanticHash, context.contracts.loadPrimitiveSet.semanticHash);
  assert.equal(model.sourceReferences.modelLoadReadinessAuditSemanticHash, context.contracts.modelLoadReadinessAudit.semanticHash);
  assert.equal(model.sourceReferences.verticalLoadPathModelSemanticHash, context.contracts.verticalLoadPathModel.semanticHash);
  assert.equal(model.sourceReferences.supportLoadScreeningSemanticHash, context.contracts.supportLoadScreening.semanticHash);
  assert.equal(model.sourceReferences.supportLoadScreeningAuditSemanticHash, context.contracts.supportLoadScreeningAudit.semanticHash);
}

function shuffle(values, random) {
  const result = [...(values || [])];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
