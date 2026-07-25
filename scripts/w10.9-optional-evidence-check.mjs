import assert from 'node:assert/strict';
import { createLoadCalculationReviewModel } from '../src/core/load-calculation-consumer/index.js';
import { buildW109Context } from './w10.9-fixtures.mjs';

console.log('\n--- W10.9 optional W10.5 evidence ---\n');
const fullContext=buildW109Context();
const full=createLoadCalculationReviewModel(fullContext);
assert.equal(full.summary.screeningIncluded,true);
assert.ok(full.screeningSummary.length>0);
assert.equal(full.sourceReferences.verticalLoadPathModelSemanticHash,fullContext.contracts.verticalLoadPathModel.semanticHash);
assert.equal(full.sourceReferences.supportLoadScreeningSemanticHash,fullContext.contracts.supportLoadScreening.semanticHash);
assert.equal(full.sourceReferences.supportLoadScreeningAuditSemanticHash,fullContext.contracts.supportLoadScreeningAudit.semanticHash);
full.screeningSummary.forEach((row)=>{
  assert.ok(['READY','BLOCKED'].includes(row.qualification));
  assert.equal(Number.isFinite(row.screenedSupportForceN),true);
});
const partial=createLoadCalculationReviewModel(buildW109Context({partialScreening:true}));
assert.equal(partial.summary.screeningIncluded,false);
assert.equal(partial.diagnostics[0].code,'OPTIONAL_SCREENING_INCOMPLETE');
console.log('✅ W10.9 optional W10.5 evidence passed.\n');
