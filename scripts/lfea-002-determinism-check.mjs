import assert from 'node:assert/strict';
import { solveContinuumModel } from '../src/core/element-fea/index.js';
import { clone, edgePressure, loadCase, mixedPatch } from './lfea-002-fixtures.mjs';
const field=(x,y)=>[0.1+0.02*x+0.03*y,-0.2+0.04*x+0.05*y];
const original=mixedPatch(field);
original.loadCases=[loadCase('LC1'),loadCase('LC2')];
original.sourceReferences.push({sourceReferenceId:'SRC-2',sourceType:'AUXILIARY',sourceVersion:'1',sourceSemanticHash:original.sourceSemanticHash});
original.limitations.push('Second deterministic limitation.');
const first=solveContinuumModel(original,'LC1');
const repeated=solveContinuumModel(clone(original),'LC1');
assert.equal(first.status,'QUALIFIED'); assert.equal(first.schema,'fea-continuum-result/v2');
assert.equal(first.semanticHash,repeated.semanticHash); assert.equal(JSON.stringify(first),JSON.stringify(repeated));
assert.deepEqual(first.integrationPointResults.map((row)=>`${row.elementId}:${row.integrationPointId}`),['E1:GP1','E1:GP2','E1:GP3','E1:GP4','E2:T3_CONSTANT','E3:T3_CONSTANT']);

const reordered=clone(original);
reordered.nodes.reverse(); reordered.elements.reverse(); reordered.materials.reverse(); reordered.prescribedDisplacements.reverse(); reordered.loadCases.reverse(); reordered.sourceReferences.reverse(); reordered.limitations.reverse();
const second=solveContinuumModel(reordered,'LC1');
assert.equal(second.status,'QUALIFIED'); assert.equal(first.semanticHash,second.semanticHash); assert.equal(JSON.stringify(first),JSON.stringify(second));
assert.ok(Object.isFrozen(first)); assert.ok(Object.isFrozen(first.modelEvidence)); assert.ok(Object.isFrozen(first.integrationPointResults));

const pressureA=mixedPatch(()=>[0,0]);
pressureA.loadCases=[loadCase('LC1',[],[edgePressure('P1','E1',['N1','N2'],2)])];
const pressureB=clone(pressureA); pressureB.loadCases[0].edgeLoads[0].edgeNodeIds.reverse();
const p1=solveContinuumModel(pressureA); const p2=solveContinuumModel(pressureB);
assert.equal(p1.semanticHash,p2.semanticHash); assert.equal(JSON.stringify(p1),JSON.stringify(p2));
console.log(`LFEA-002 deterministic semantic and byte identity passed: ${first.semanticHash}`);
