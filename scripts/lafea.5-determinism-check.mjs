import assert from 'node:assert/strict';
import {
  calculateLocalTrunnionFootprint,
  reconstructTrunnionFootprintResultHashes,
} from '../src/core/local-trunnion-footprint/index.js';
import { clone, refreshAncestry, workflowSource } from './lafea.5-fixtures.mjs';

const source=workflowSource();
const first=calculateLocalTrunnionFootprint(source);
const second=calculateLocalTrunnionFootprint(clone(source));
assert.equal(JSON.stringify(first),JSON.stringify(second));
assert.deepEqual(reconstructTrunnionFootprintResultHashes(first),first.semanticHashes);
assert.equal(hasNegativeZero(first),false);

const ids=workflowSource().footprint.orderedNodeIds;
const permuted=workflowSource({loop:[...ids.slice(4),...ids.slice(0,4)]});
permuted.shellTemplate.nodes.reverse();permuted.shellTemplate.elements.reverse();permuted.shellTemplate.elements.forEach((element)=>element.nodeIds.reverse());permuted.shellTemplate.constraints.reverse();refreshAncestry(permuted);
const reordered=calculateLocalTrunnionFootprint(permuted);
assert.equal(reordered.canonicalWorkflowModelHash,first.canonicalWorkflowModelHash);
assert.equal(reordered.footprintGeometryEvidence.footprintGeometryHash,first.footprintGeometryEvidence.footprintGeometryHash);
assert.equal(reordered.loadDistributionEvidence[0].loadDistributionResultHash,first.loadDistributionEvidence[0].loadDistributionResultHash);
assert.equal(reordered.rawShellResult.semanticHashes.resultPayloadSemanticHash,first.rawShellResult.semanticHashes.resultPayloadSemanticHash);
console.log('LAFEA.5 repeated-byte identity, semantic reconstruction and permutation invariance passed.');

function hasNegativeZero(value){if(typeof value==='number')return Object.is(value,-0);if(!value||typeof value!=='object')return false;if(Array.isArray(value))return value.some(hasNegativeZero);return Object.values(value).some(hasNegativeZero);}