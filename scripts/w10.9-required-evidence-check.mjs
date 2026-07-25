import assert from 'node:assert/strict';
import {
  createLoadCalculationReviewModel,
  validateLoadCalculationReviewModel,
} from '../src/core/load-calculation-consumer/index.js';
import { createWorkspaceConsumerContext } from '../src/core/workspace-consumers/index.js';
import { buildW109Context } from './w10.9-fixtures.mjs';

console.log('\n--- W10.9 required W10.4 evidence ---\n');
const missing=createWorkspaceConsumerContext({datasetId:'W10.9-MISSING',workspaceVersion:0});
assert.throws(()=>createLoadCalculationReviewModel(missing),/Complete W10.4/);
const context=buildW109Context({screening:false});
const model=createLoadCalculationReviewModel(context);
assert.equal(validateLoadCalculationReviewModel(model).ok,true);
assert.equal(model.schema,'load-calculation-review-model/v1');
assert.equal(model.sourceContext,context);
assert.equal(model.summary.screeningIncluded,false);
assert.deepEqual(model.loadCases.map((row)=>row.loadCaseId),['EMPTY','HYD','OPE']);
assert.equal(model.sourceReferences.sharedModelSemanticHash,context.contracts.sharedModel.semanticHash);
assert.equal(model.sourceReferences.loadCaseSetSemanticHash,context.contracts.loadCaseSet.semanticHash);
assert.equal(model.sourceReferences.loadPrimitiveSetSemanticHash,context.contracts.loadPrimitiveSet.semanticHash);
assert.equal(model.sourceReferences.modelLoadReadinessAuditSemanticHash,context.contracts.modelLoadReadinessAudit.semanticHash);
console.log('✅ W10.9 required W10.4 evidence passed.\n');
