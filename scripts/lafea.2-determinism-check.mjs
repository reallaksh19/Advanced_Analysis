import assert from 'node:assert/strict';
import { calculateLocalAttachmentScreening, createLocalAttachmentScreeningRequest } from '../src/core/local-attachment-screening/index.js';
import { rawRequestFixture, screeningRequestFixture } from './lafea.2-fixtures.mjs';
const request=screeningRequestFixture(),bytes=JSON.stringify(calculateLocalAttachmentScreening(request));for(let i=0;i<20;i+=1)assert.equal(JSON.stringify(calculateLocalAttachmentScreening(request)),bytes);
const raw=rawRequestFixture(),permuted=rawRequestFixture((value)=>{value.screeningCases.reverse();value.screeningCases.forEach((row)=>row.mechanicalTerms.reverse());value.evaluationLocations.reverse();value.resultRequests.envelopeQuantities.reverse();});
const left=createLocalAttachmentScreeningRequest(raw),right=createLocalAttachmentScreeningRequest(permuted);assert.equal(left.semanticHash,right.semanticHash);assert.equal(JSON.stringify(calculateLocalAttachmentScreening(left)),JSON.stringify(calculateLocalAttachmentScreening(right)));
const input=rawRequestFixture(),sealed=createLocalAttachmentScreeningRequest(input),before=JSON.stringify(sealed);input.screeningCases[0].mechanicalTerms[0].factor=999;input.evaluationLocations[0].angle=9;assert.equal(JSON.stringify(sealed),before);
const zero=screeningRequestFixture((value)=>{value.screeningCases=[{screeningCaseId:'ZERO',mechanicalTerms:[],pressureDefinitionId:'P-OPEN',pressureFactor:0,sourceReference:'ZERO'}];});assert.equal(hasNegativeZero(calculateLocalAttachmentScreening(zero)),false);
console.log('LAFEA.2 repeated bytes, permutation invariance, isolation and negative-zero normalization passed.');
function hasNegativeZero(value){if(typeof value==='number')return Object.is(value,-0);if(Array.isArray(value))return value.some(hasNegativeZero);if(value&&typeof value==='object')return Object.values(value).some(hasNegativeZero);return false;}
