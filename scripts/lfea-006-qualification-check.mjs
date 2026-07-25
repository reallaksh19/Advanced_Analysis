import assert from 'node:assert/strict';
import { createEngineeringReview,validateEngineeringReview } from '../src/core/element-fea/index.js';
import { mixedReviewFixture,planeStrainReviewFixture,q4ReviewFixture,reviewProfile,sparseReviewFixture,t3ReviewFixture } from './lfea-006-fixtures.mjs';

const cases=[
  ['Q4_DENSE',q4ReviewFixture(),'fea-continuum-result/v2'],
  ['T3_DENSE',t3ReviewFixture(),'fea-continuum-result/v1'],
  ['MIXED_DENSE',mixedReviewFixture(),'fea-continuum-result/v2'],
  ['Q4_SPARSE',sparseReviewFixture(),'fea-continuum-result/v3'],
];
const hashes=[];
for(const[name,fixture,schema]of cases){const review=createEngineeringReview(fixture.input,reviewProfile());assert.equal(review.status,'QUALIFIED_FOR_REVIEW',`${name}:${JSON.stringify(review.diagnostics)}`);assert.equal(review.solverSummary.resultSchema,schema);assert.equal(validateEngineeringReview(review).ok,true);assert.ok(review.qualificationSummary.rows.every((row)=>row.status!=='FAIL'));assert.equal(review.qualificationSummary.rows.find((row)=>row.qualificationId==='CROSS_ARTIFACT_ANCESTRY').status,'PASS');assert.equal(review.sourceArtifactHashes.model,fixture.model.semanticHash);assert.equal(review.sourceArtifactHashes.result,fixture.result.semanticHash);assert.equal(review.analysisSummary.activeDofCount,fixture.result.dofMap.length);hashes.push([name,review.semanticHash]);}
const strain=planeStrainReviewFixture();const strainReview=createEngineeringReview(strain.input,reviewProfile());assert.equal(strainReview.status,'QUALIFIED_FOR_REVIEW');assert.equal(strainReview.analysisSummary.formulation,'PLANE_STRAIN');assert.ok(strainReview.rawStressReview.rows.some((row)=>Math.abs(row.sigmaZ)>0));assert.equal(strainReview.modelSummary.outOfPlaneScale,1);assert.deepEqual(strainReview.modelSummary.planeStressThicknesses,[]);
console.log(JSON.stringify({hashes,planeStrainHash:strainReview.semanticHash}));
