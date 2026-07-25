import assert from 'node:assert/strict';
import {
  ENGINEERING_REVIEW_SCHEMA,EVIDENCE_EXPORT_SCHEMA,REVIEW_INPUT_SCHEMA,REVIEW_PROFILE_SCHEMA,
  createEngineeringReview,createEvidenceExport,createReviewInput,createReviewProfile,
  validateEngineeringReview,validateEvidenceExport,validateReviewInput,validateReviewProfile,
} from '../src/core/element-fea/index.js';
import { q4ReviewFixture,reviewProfile } from './lfea-006-fixtures.mjs';

// The closed review-input contract requires a declared canonical semantic hash.
const fixture=q4ReviewFixture();const profile=reviewProfile({includeSourceArtifacts:true});
const normalizedProfile=createReviewProfile(profile);assert.equal(normalizedProfile.schema,REVIEW_PROFILE_SCHEMA);assert.ok(Object.isFrozen(normalizedProfile));assert.equal(validateReviewProfile(profile).ok,true);
const normalizedInput=createReviewInput(fixture.input);assert.equal(normalizedInput.schema,REVIEW_INPUT_SCHEMA);assert.ok(Object.isFrozen(normalizedInput));assert.equal(validateReviewInput(fixture.input).ok,true);
const review=createEngineeringReview(fixture.input,profile);assert.equal(review.schema,ENGINEERING_REVIEW_SCHEMA);assert.equal(review.status,'QUALIFIED_FOR_REVIEW');assert.equal(review.analysisSummary.reviewHash,review.semanticHash);assert.ok(Object.isFrozen(review));assert.ok(Object.isFrozen(review.geometryReview.nodes));assert.equal(validateEngineeringReview(review).ok,true);
for(const key of ['analysisSummary','qualificationSummary','modelSummary','solverSummary','geometryReview','loadReview','constraintReview','displacementReview','reactionReview','rawStressReview','projectedStressReview','convergenceReview','diagnostics','limitations'])assert.ok(Object.hasOwn(review,key),key);
assert.equal(review.rawStressReview.authority,'AUTHORITATIVE_RAW_ELEMENT_OR_INTEGRATION_POINT_STRESS');assert.equal(review.projectedStressReview.status,'NOT_SUPPLIED');assert.equal(review.convergenceReview.status,'NOT_SUPPLIED');
const exported=createEvidenceExport(review,fixture.input,profile);assert.equal(exported.schema,EVIDENCE_EXPORT_SCHEMA);assert.equal(exported.status,'QUALIFIED_EXPORT');assert.ok(Object.isFrozen(exported));assert.equal(validateEvidenceExport(exported).ok,true);assert.ok(exported.files.every((row)=>row.encoding==='UTF-8'&&row.contentHash.startsWith('fnv1a64:')));
assert.throws(()=>createReviewProfile({...profile,extra:true}),/unsupported fields/);assert.throws(()=>createReviewProfile({...profile,deformationScale:-1}),/nonnegative/);assert.throws(()=>createReviewProfile({...profile,stressDisplayPrecision:13}),/0 through 12/);assert.throws(()=>createReviewInput({...fixture.input,extra:true}),/unsupported fields/);
const {semanticHash:_omitted,...missingHash}=fixture.input;assert.throws(()=>createReviewInput(missingHash),/semanticHash is required/);assert.equal(validateReviewInput(missingHash).ok,false);
assert.throws(()=>createReviewInput({...fixture.input,semanticHash:null}),/semanticHash is required/);
assert.throws(()=>createReviewInput({...fixture.input,semanticHash:'not-a-semantic-hash'}),/canonical fnv1a64 semantic hash/);
assert.throws(()=>createReviewInput({...fixture.input,semanticHash:'fnv1a64:0000000000000000'}),/semantic hash mismatch/);
console.log(JSON.stringify({reviewHash:review.semanticHash,exportHash:exported.semanticHash,fileCount:exported.totalFileCount,hashFailureCases:4}));
