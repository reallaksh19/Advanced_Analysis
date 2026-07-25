import assert from 'node:assert/strict';
import {
  calculateLocalTrunnionFootprint,
  transferAndDistribute,
} from '../src/core/local-trunnion-footprint/index.js';
import { workflowSource } from './lafea.5-fixtures.mjs';

for (const identity of ['FX','FY','FZ','MX','MY','MZ','COMBINED']) {
  const source = workflowSource({ attachmentLoadCaseId: identity, referencePoint: identity === 'COMBINED' ? [0,0,0] : [5,-3,2] });
  const result = calculateLocalTrunnionFootprint(source);
  assert.equal(result.qualification.state, 'ACCEPTED', `${identity}: ${JSON.stringify(result.diagnostics)}`);
  const evidence = result.loadDistributionEvidence[0];
  assert.ok(evidence.forceQualification.accepted);
  assert.ok(evidence.momentQualification.accepted);
  assert.deepEqual(evidence.nodalForces.map((row)=>Object.keys(row).sort()), evidence.nodalForces.map(()=>['fx','fy','fz','nodeId','normalizedWeight'].sort()));
  assert.ok(evidence.nodalForces.every((row)=>!Object.hasOwn(row,'m1')&&!Object.hasOwn(row,'m2')));
}

const combined = calculateLocalTrunnionFootprint(workflowSource()).loadDistributionEvidence[0];
const expectedMoment = [700,-500,900];
const force = [120,-80,60], lever = [5,-3,2];
const cross = [lever[1]*force[2]-lever[2]*force[1],lever[2]*force[0]-lever[0]*force[2],lever[0]*force[1]-lever[1]*force[0]];
assert.deepEqual(combined.transferredMoment, expectedMoment.map((value,index)=>value+cross[index]));
assert.ok(combined.referenceTransferQualification.accepted);
assert.ok(Math.abs(combined.tributaryWeights.reduce((sum,row)=>sum+row.normalizedWeight,0)-1)<1e-14);
for (const row of combined.tributaryWeights) assert.equal(row.tributaryLength,0.5*(row.previousEdgeLength+row.nextEdgeLength));
assert.ok(!JSON.stringify(combined).match(/regularization|pseudoinverse|weak spring|diagonal shift/i));

const reversed = calculateLocalTrunnionFootprint(workflowSource({ scale: -1 })).loadDistributionEvidence[0];
const doubled = calculateLocalTrunnionFootprint(workflowSource({ scale: 2 })).loadDistributionEvidence[0];
for (let index=0; index<combined.nodalForces.length; index+=1) {
  for (const key of ['fx','fy','fz']) {
    assert.ok(Math.abs(reversed.nodalForces[index][key]+combined.nodalForces[index][key])<1e-10);
    assert.ok(Math.abs(doubled.nodalForces[index][key]-2*combined.nodalForces[index][key])<1e-10);
  }
}

const direct = directFixture();
const base = transferAndDistribute(direct.mapping,direct.sourceCase,direct.footprint,direct.nodeMap,direct.profile);
const shift = [30,-20,15];
const translatedMap = new Map([...direct.nodeMap].map(([id,node])=>[id,{...node,position:add(node.position,shift)}]));
const translatedFootprint = {...direct.footprint,referencePoint:add(direct.footprint.referencePoint,shift)};
const translatedCase = {...direct.sourceCase,sourcePointGlobal:add(direct.sourceCase.sourcePointGlobal,shift)};
const translated = transferAndDistribute(direct.mapping,translatedCase,translatedFootprint,translatedMap,direct.profile);
assertForcesEqual(translated.nodalForces,base.nodalForces,(value)=>value);

const rotate = ([x,y,z])=>[-y,x,z];
const rotatedMap = new Map([...direct.nodeMap].map(([id,node])=>[id,{...node,position:rotate(node.position)}]));
const rotatedFootprint = {...direct.footprint,referencePoint:rotate(direct.footprint.referencePoint)};
const rotatedCase = {...direct.sourceCase,sourcePointGlobal:rotate(direct.sourceCase.sourcePointGlobal),canonicalForceGlobal:rotate(direct.sourceCase.canonicalForceGlobal),canonicalMomentAtSourceGlobal:rotate(direct.sourceCase.canonicalMomentAtSourceGlobal)};
const rotated = transferAndDistribute(direct.mapping,rotatedCase,rotatedFootprint,rotatedMap,direct.profile);
assertForcesEqual(rotated.nodalForces,base.nodalForces,rotate);

const deficient = directFixture();
const deficientIds=deficient.footprint.orderedNodeIds.slice(0,4);
deficient.nodeMap = new Map(deficientIds.map((id,index)=>[id,{position:[index,0,0]}]));
deficient.footprint = {...deficient.footprint,orderedNodeIds:deficientIds,referencePoint:[0,0,0],perimeter:6,tributaryWeights:deficientIds.map((nodeId)=>({nodeId,previousEdgeLength:1,nextEdgeLength:1,tributaryLength:1,normalizedWeight:0.25}))};
assert.throws(()=>transferAndDistribute(deficient.mapping,deficient.sourceCase,deficient.footprint,deficient.nodeMap,deficient.profile),/rank deficient|ill-conditioned/);
console.log('LAFEA.5 six-component transfer, weighted force-only fit, scaling and rigid covariance passed.');

function directFixture(){
  const source=workflowSource(); const result=calculateLocalTrunnionFootprint(source);
  return {mapping:source.loadCaseMappings[0],sourceCase:source.attachmentEvidence.result.transformedLoadCases.find((row)=>row.identity==='COMBINED'),footprint:result.footprintGeometryEvidence.canonicalFootprint,nodeMap:new Map(source.shellTemplate.nodes.map((node)=>[node.nodeId,node])),profile:source.qualificationProfile};
}
function add(a,b){return a.map((value,index)=>value+b[index]);}
function assertForcesEqual(actual,expected,transform){
  for(let i=0;i<actual.length;i+=1){const transformed=transform([expected[i].fx,expected[i].fy,expected[i].fz]);assert.equal(actual[i].nodeId,expected[i].nodeId);for(let j=0;j<3;j+=1)assert.ok(Math.abs([actual[i].fx,actual[i].fy,actual[i].fz][j]-transformed[j])<1e-9);}
}