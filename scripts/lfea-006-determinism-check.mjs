import assert from 'node:assert/strict';
import { createEngineeringReview,createEvidenceExport,createReviewInput } from '../src/core/element-fea/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { clone,convergenceReviewFixture,planeStrainReviewFixture,reviewProfile } from './lfea-006-fixtures.mjs';

const fixture=withTwoReferences(convergenceReviewFixture({projection:true}));
const profile=reviewProfile({includeProjectedStress:true,includeConvergenceEvidence:true,includeSourceArtifacts:true});
const first=createEngineeringReview(fixture,profile);const firstExport=createEvidenceExport(first,fixture,profile);
const repeated=createEngineeringReview(clone(fixture),profile);const repeatedExport=createEvidenceExport(repeated,clone(fixture),profile);
assert.equal(JSON.stringify(first),JSON.stringify(repeated));assert.equal(JSON.stringify(firstExport),JSON.stringify(repeatedExport));
const reorderedSource=clone(fixture);reorderInput(reorderedSource);const reordered=createReviewInput(reorderedSource);const second=createEngineeringReview(reordered,profile);const secondExport=createEvidenceExport(second,reordered,profile);
assert.equal(second.status,'QUALIFIED_FOR_REVIEW',JSON.stringify(second.diagnostics));assert.equal(first.semanticHash,second.semanticHash);assert.equal(JSON.stringify(first),JSON.stringify(second));assert.equal(firstExport.semanticHash,secondExport.semanticHash);assert.equal(JSON.stringify(firstExport),JSON.stringify(secondExport));
assert.deepEqual(firstExport.files.map((row)=>row.path),secondExport.files.map((row)=>row.path));for(let i=0;i<firstExport.files.length;i+=1)assert.equal(firstExport.files[i].content,secondExport.files[i].content,firstExport.files[i].path);
const strain=planeStrainReviewFixture();const strainSource=clone(strain.input);const result=clone(strainSource.result);result.diagnostics=[...result.diagnostics].reverse();strainSource.result=result;const strainInput=createReviewInput(strainSource);const strainReview=createEngineeringReview(strainInput,reviewProfile());assert.equal(strainReview.status,'QUALIFIED_FOR_REVIEW');assert.deepEqual(strainReview.diagnostics,[...strainReview.diagnostics].sort((a,b)=>severity(a)-severity(b)||cmp(a.code,b.code)||cmp(a.sourceArtifactIdentity,b.sourceArtifactIdentity)||cmp(a.message,b.message)));
console.log(JSON.stringify({reviewHash:first.semanticHash,exportHash:firstExport.semanticHash,manifestHash:firstExport.files.find((row)=>row.path==='manifest.json').contentHash,fileCount:firstExport.totalFileCount}));

function withTwoReferences(fixture){const row=clone(fixture.input);delete row.semanticHash;row.sourceReferences.unshift({sourceReferenceId:'A-SOURCE',sourceType:'FIXTURE',sourceVersion:'1',sourceSemanticHash:row.model.sourceSemanticHash});return createReviewInput({...row,semanticHash:semanticHash(row)});}
function reorderInput(input){
  input.sourceReferences.reverse();
  reorderAdapter(input.adapterResult);reorderModel(input.model);reorderResult(input.result);
  reorderStudy(input.convergenceStudy);reorderConvergenceResult(input.convergenceResult);reorderProjection(input.stressProjection);
}
function reorderAdapter(row){reverse(row.mappingLedger);reverse(row.diagnostics);if(row.qualifiedModel)reorderModel(row.qualifiedModel);if(row.topologyEvidence)reverse(row.topologyEvidence.edges);if(row.entityEvidence)for(const key of ['regions','boundaries','points'])reverse(row.entityEvidence[key]);if(row.assignmentEvidence)for(const key of ['materialAssignments','thicknessAssignments','loadAssignments','constraintAssignments'])reverse(row.assignmentEvidence[key]);}
function reorderModel(row){for(const key of ['nodes','elements','materials','restraints','prescribedDisplacements','loadCases','sourceReferences'])reverse(row[key]);for(const loadCase of row.loadCases||[]){reverse(loadCase.nodalForces);reverse(loadCase.edgeLoads);}}
function reorderResult(row){if(row.modelEvidence)reorderModel(row.modelEvidence);for(const key of ['dofMap','directNodalLoadEvidence','edgeLoadEvidence','nodalDisplacements','reactions','constrainedDofImbalance','elementInternalForces','elementStrainEnergy','elementStrains','elementStresses','principalStresses','vonMisesStress','integrationPointResults','elementIntegrationEvidence','elementQualityEvidence','diagnostics'])reverse(row[key]);}
function reorderStudy(row){if(!row)return;for(const key of ['probes','quantities','levels','refinementRatios','singularFeatures'])reverse(row[key]);for(const level of row.levels||[]){reorderModel(level.model);reorderResult(level.result);reverse(level.studyRegion?.elementIds);for(const key of ['geometryMappings','materialMappings','loadMappings','restraintMappings']){reverse(level[key]);for(const mapping of level[key]||[])reverse(mapping.targetIds);}reverse(level.probeMappings);reverse(level.quantityMappings);}}
function reorderConvergenceResult(row){if(!row)return;if(row.studyEvidence)reorderStudy(row.studyEvidence);for(const key of ['levelEvidence','quantityResults','globalQuantityTrends','fixedProbeStressTrends','regionalMaximumStressTrends','diagnostics']){reverse(row[key]);for(const quantity of row[key]||[]){reverse(quantity.history);reverse(quantity.relativeChanges);if(quantity.observedOrder)reverse(quantity.observedOrder.valuesUsed);}}}
function reorderProjection(row){if(!row)return;for(const key of ['components','declaredDiscontinuities','elementCornerValues','nodalValues'])reverse(row[key]);for(const corner of row.elementCornerValues||[]){reverse(corner.components);for(const component of corner.components||[])reverse(component.sourceIntegrationPointIds);}for(const node of row.nodalValues||[]){for(const key of ['contributingElementIds','contributingCornerIds','sourceIntegrationPointIds','weights'])reverse(node[key]);}}
function reverse(value){if(Array.isArray(value))value.reverse();}
function severity(row){return{ERROR:0,WARNING:1,INFORMATION:2}[row.severity]??9;}function cmp(a,b){return a<b?-1:a>b?1:0;}
