import assert from 'node:assert/strict';
import { QUALIFICATION_STATES, calculateLocalAttachmentScreening } from '../src/core/local-attachment-screening/index.js';
import { reconstructResultHashes } from '../src/core/local-stress/index.js';
import { rawRequestFixture, screeningRequestFixture } from './lafea.2-fixtures.mjs';
assert.doesNotThrow(()=>screeningRequestFixture());
reject((raw)=>{raw.sourceEvidence.foundationResult.qualification.state='REJECTED_MODEL';});
reject((raw)=>{raw.sourceEvidence.foundationResult.sourceAncestry.canonicalModelSemanticHash='fnv1a64:wrong';});
reject((raw)=>{raw.sourceEvidence.foundationResult.formulaTrace.push('FORGED');raw.sourceEvidence.foundationResult.semanticHashes=reconstructResultHashes(raw.sourceEvidence.foundationResult);});
reject((raw)=>{raw.sourceEvidence.foundationResult.qualification.engineeringLevel='FORGED';raw.sourceEvidence.foundationResult.semanticHashes=reconstructResultHashes(raw.sourceEvidence.foundationResult);});
reject((raw)=>{raw.sourceEvidence.foundationResult.pressureStressResults[0].coefficientA=Number.POSITIVE_INFINITY;});
reject((raw)=>{raw.sourceEvidence.foundationResult.limitations=raw.sourceEvidence.foundationResult.limitations.filter((v)=>v!=='NO_FEA');raw.sourceEvidence.foundationResult.semanticHashes=reconstructResultHashes(raw.sourceEvidence.foundationResult);});
let captured;try{screeningRequestFixture((raw)=>{raw.sourceEvidence.unexpected=true;});}catch(error){captured=error;}assert.equal(captured?.state,QUALIFICATION_STATES.REJECTED_SOURCE_EVIDENCE);
const raw=rawRequestFixture(),request=screeningRequestFixture();raw.sourceEvidence.foundationModel.pipeGeometry.outsideDiameter.value=1;assert.equal(request.sourceEvidence.foundationModel.pipeGeometry.outsideDiameter.value,1000);
const result=calculateLocalAttachmentScreening(request);const before=JSON.stringify(result.sourceEvidence);try{result.sourceEvidence.foundationModel.modelIdentity='MUTATED';}catch{}assert.equal(JSON.stringify(result.sourceEvidence),before);
console.log('LAFEA.2 accepted-source reconstruction, rejection classification, forgery rejection and caller isolation passed.');
function reject(mutator){assert.throws(()=>screeningRequestFixture(mutator));}
