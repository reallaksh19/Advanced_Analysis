import assert from 'node:assert/strict';
import { adaptMeshPackage } from '../src/core/element-fea/index.js';
import {
  adapterProfile, clone, constraint, fixed, free, multipleMaterialPackage, pointForce, pressure,
  reorderedPackage, resealPackage,
} from './lfea-005-fixtures.mjs';

const source=multipleMaterialPackage();
source.sourceReferences.push({sourceReferenceId:'SRC-2',sourceType:'QUALIFIED_AUXILIARY',sourceVersion:'1',sourceSemanticHash:'mesh-source:lfea005-v1'});
source.analysisDefinition.loadCase.pointForces.push(pointForce('F2','P_N6',0,.25));
source.analysisDefinition.loadCase.boundaryPressures.push(pressure('P_TOP','B_TOP',.5));
source.analysisDefinition.constraints.push(constraint('C_POINT','POINT','P_N3',free(),fixed()));
source.nodes.find((row)=>row.nodeId==='N1').x=-0;
const canonical=resealPackage(source);const reordered=reorderedPackage(canonical);
const first=adaptMeshPackage(canonical,adapterProfile());const repeated=adaptMeshPackage(clone(canonical),adapterProfile());const permuted=adaptMeshPackage(reordered,adapterProfile());
for(const result of [first,repeated,permuted])assert.equal(result.status,'ACCEPTED',JSON.stringify(result.diagnostics));
assert.equal(first.sourcePackageSemanticHash,repeated.sourcePackageSemanticHash);assert.equal(first.sourcePackageSemanticHash,permuted.sourcePackageSemanticHash);
assert.equal(first.qualifiedModel.semanticHash,repeated.qualifiedModel.semanticHash);assert.equal(first.qualifiedModel.semanticHash,permuted.qualifiedModel.semanticHash);
assert.equal(first.topologyEvidence.topologyIdentity,permuted.topologyEvidence.topologyIdentity);assert.equal(first.semanticHash,repeated.semanticHash);assert.equal(first.semanticHash,permuted.semanticHash);
assert.equal(JSON.stringify(first),JSON.stringify(repeated));assert.equal(JSON.stringify(first),JSON.stringify(permuted));
assert.deepEqual(first.qualifiedModel.loadCases[0].edgeLoads.map((row)=>row.loadId),permuted.qualifiedModel.loadCases[0].edgeLoads.map((row)=>row.loadId));
assert.deepEqual(first.qualifiedModel.restraints.map((row)=>row.constraintId),permuted.qualifiedModel.restraints.map((row)=>row.constraintId));
assert.deepEqual(first.mappingLedger.map((row)=>row.mappingIdentity),[...first.mappingLedger.map((row)=>row.mappingIdentity)].sort());
assert.equal(first.qualifiedModel.nodes.find((row)=>row.nodeId==='N1').x,0);assert.ok(!Object.is(first.qualifiedModel.nodes.find((row)=>row.nodeId==='N1').x,-0));
const text=JSON.stringify(first).toLowerCase();for(const forbidden of ['wallclock','timestamp','runneridentity','processidentity','heap','memoryuse'])assert.equal(text.includes(forbidden),false,forbidden);
assert.ok(Object.isFrozen(first));assert.ok(Object.isFrozen(first.topologyEvidence.edges));assert.ok(Object.isFrozen(first.assignmentEvidence.loadAssignments));
console.log(JSON.stringify({packageHash:first.sourcePackageSemanticHash,modelHash:first.qualifiedModel.semanticHash,topologyHash:first.topologyEvidence.topologyIdentity,adapterHash:first.semanticHash}));
