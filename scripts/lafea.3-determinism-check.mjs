import assert from 'node:assert/strict';
import { canonicalStringify } from '../src/core/shared-piping-model/index.js';
import { calculateLocalContinuum, createCanonicalLocalContinuumModel } from '../src/core/local-continuum/index.js';
import { patchSource, permuteSource } from './lafea.3-fixtures.mjs';
const source=patchSource(),model=createCanonicalLocalContinuumModel(source),permuted=createCanonicalLocalContinuumModel(permuteSource(source));assert.equal(model.semanticHash,permuted.semanticHash);const first=calculateLocalContinuum(model),second=calculateLocalContinuum(createCanonicalLocalContinuumModel(patchSource())),permutedResult=calculateLocalContinuum(permuted);assert.equal(canonicalStringify(first),canonicalStringify(second));assert.equal(canonicalStringify(first),canonicalStringify(permutedResult));assert.equal(hasNegativeZero(first),false);assert.deepEqual(first.meshEvidence.dofOrdering,['A:UX','A:UY','B:UX','B:UY','C:UX','C:UY','D:UX','D:UY']);
const reversed=patchSource();reversed.loadCases[0].edgeTractions[0].edgeNodeIds.reverse();const reversedResult=calculateLocalContinuum(createCanonicalLocalContinuumModel(reversed));assert.equal(canonicalStringify(first),canonicalStringify(reversedResult));
console.log('LAFEA.3 permutation, edge-order and repeated-run byte identity passed.');
function hasNegativeZero(value){if(typeof value==='number')return Object.is(value,-0);if(Array.isArray(value))return value.some(hasNegativeZero);if(value&&typeof value==='object')return Object.values(value).some(hasNegativeZero);return false;}
