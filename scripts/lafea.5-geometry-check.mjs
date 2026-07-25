import assert from 'node:assert/strict';
import {
  calculateLocalTrunnionFootprint,
  createCanonicalTrunnionFootprintModel,
} from '../src/core/local-trunnion-footprint/index.js';
import { refreshAncestry, workflowSource } from './lafea.5-fixtures.mjs';

const baseSource = workflowSource();
const ids = baseSource.footprint.orderedNodeIds;
const base = createCanonicalTrunnionFootprintModel(baseSource);
for (const loop of [rotate(ids, 3), [...ids].reverse(), rotate([...ids].reverse(), 5)]) {
  const source = workflowSource({ loop });
  const model = createCanonicalTrunnionFootprintModel(source);
  assert.equal(model.canonicalFootprint.footprintGeometryHash, base.canonicalFootprint.footprintGeometryHash);
  assert.equal(model.semanticHash, base.semanticHash);
}
const permuted = workflowSource();
permuted.shellTemplate.nodes.reverse(); permuted.shellTemplate.elements.reverse(); permuted.shellTemplate.constraints.reverse(); refreshAncestry(permuted);
assert.equal(createCanonicalTrunnionFootprintModel(permuted).semanticHash, base.semanticHash);

expectCode((source) => { source.shellTemplate.nodes.find((node)=>node.nodeId==='F00').position[0] += 1; }, 'PIPE_NODE_OFF_CYLINDER');
expectCode((source) => { const node=source.shellTemplate.nodes.find((row)=>row.nodeId==='F00'); const e=0.01,c=Math.sqrt(1-e*e); node.director=[0,c,e]; node.rotationBasis1=[0,-e,c]; node.rotationBasis2=[1,0,0]; }, 'PIPE_DIRECTOR_MISALIGNED');
expectCode((source) => { source.shellTemplate.nodes.find((node)=>node.nodeId==='F01').position[2] = 0; }, 'FOOTPRINT_NODE_OFF_TRUNNION');
expectCode((source) => { const loop=[...source.footprint.orderedNodeIds]; [loop[2],loop[3]]=[loop[3],loop[2]]; source.footprint.orderedNodeIds=loop; }, 'FOOTPRINT_EDGE_MISSING');
expectCode((source) => { source.pipeGeometry.axisDirection = [0,0,2]; }, 'AXIS_NOT_UNIT');
expectCode((source) => { source.trunnionGeometry.axisDirection = [0,0,1]; }, 'DEGENERATE_AXES');

const accepted = calculateLocalTrunnionFootprint(workflowSource());
assert.equal(accepted.footprintGeometryEvidence.pipeGeometry.qualificationEvidence.nodeEvidence.length, accepted.generatedShellModel.nodes.length);
assert.ok(accepted.footprintGeometryEvidence.pipeGeometry.qualificationEvidence.nodeEvidence.every((row) => row.pipeRadial.accepted && row.directorAlignment.accepted));

const repeated = workflowSource(); repeated.footprint.orderedNodeIds = [...repeated.footprint.orderedNodeIds.slice(0,-1), repeated.footprint.orderedNodeIds[0]];
assert.equal(calculateLocalTrunnionFootprint(repeated).qualification.state, 'REJECTED_SOURCE_EVIDENCE');
const zero = workflowSource();
const f00=zero.shellTemplate.nodes.find((node)=>node.nodeId==='F00'); const f01=zero.shellTemplate.nodes.find((node)=>node.nodeId==='F01');
f01.position=[...f00.position]; f01.director=[...f00.director]; f01.rotationBasis1=[...f00.rotationBasis1]; f01.rotationBasis2=[...f00.rotationBasis2];
assert.equal(calculateLocalTrunnionFootprint(zero).diagnostics[0].code, 'SHELL_TEMPLATE_INVALID');
console.log('LAFEA.5 pipe/trunnion geometry, topology and canonical loop invariance passed.');

function rotate(values, offset){return [...values.slice(offset),...values.slice(0,offset)];}
function expectCode(mutator, code) {
  const source = workflowSource(); mutator(source); refreshAncestry(source);
  const result = calculateLocalTrunnionFootprint(source);
  assert.equal(result.diagnostics[0].code, code, JSON.stringify(result.diagnostics));
}