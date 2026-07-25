import assert from 'node:assert/strict';
import { createConvergenceStudy } from '../src/core/element-fea/convergence-study.js';
import { interpretConvergenceStudy } from '../src/core/element-fea/interpretation-result.js';
import { createStressProjection } from '../src/core/element-fea/stress-projection.js';
import { clone, convergenceStudy, projectionFixture } from './lfea-003-fixtures.mjs';

const original=convergenceStudy({singularFeatures:[{featureId:'SF2',featureType:'POINT_LOAD',sourceSemanticHash:'physical-problem:v1'},{featureId:'SF1',featureType:'RE_ENTRANT_CORNER',sourceSemanticHash:'physical-problem:v1'}]});
const firstStudy=createConvergenceStudy(original);const first=interpretConvergenceStudy(original);const repeated=interpretConvergenceStudy(clone(original));
assert.equal(first.semanticHash,repeated.semanticHash);assert.equal(JSON.stringify(first),JSON.stringify(repeated));
const reordered=clone(original);reordered.levels.reverse();reordered.quantities.reverse();reordered.probes.reverse();reordered.singularFeatures.reverse();reordered.canonicalProblem.requestedQuantityIds.reverse();
reordered.levels.forEach((level)=>{level.studyRegion.elementIds.reverse();level.geometryMappings.reverse();level.materialMappings.reverse();level.loadMappings.reverse();level.restraintMappings.reverse();level.probeMappings.reverse();level.quantityMappings.reverse();});
const secondStudy=createConvergenceStudy(reordered);const second=interpretConvergenceStudy(reordered);
assert.equal(firstStudy.semanticHash,secondStudy.semanticHash);assert.equal(JSON.stringify(firstStudy),JSON.stringify(secondStudy));
assert.equal(first.semanticHash,second.semanticHash);assert.equal(JSON.stringify(first),JSON.stringify(second));
assert.ok(Object.isFrozen(first));assert.ok(Object.isFrozen(first.studyEvidence));assert.ok(Object.isFrozen(first.quantityResults));

const discontinuity=[{discontinuityId:'D1',sides:[{sideId:'RIGHT',elementIds:['E2']},{sideId:'LEFT',elementIds:['E1']}]}];
const projectionInput=projectionFixture({declaredDiscontinuities:discontinuity});const projectionA=createStressProjection(projectionInput);const projectionB=createStressProjection(clone(projectionInput));
assert.equal(projectionA.semanticHash,projectionB.semanticHash);assert.equal(JSON.stringify(projectionA),JSON.stringify(projectionB));
const reorderedProjection=clone(projectionInput);reorderedProjection.components.reverse();reorderedProjection.declaredDiscontinuities.reverse();reorderedProjection.declaredDiscontinuities[0].sides.reverse();
const projectionC=createStressProjection(reorderedProjection);assert.equal(projectionA.semanticHash,projectionC.semanticHash);assert.equal(JSON.stringify(projectionA),JSON.stringify(projectionC));
assert.ok(Object.isFrozen(projectionA));assert.ok(Object.isFrozen(projectionA.nodalValues));
console.log(`LFEA-003 deterministic semantic and byte identity passed: ${first.semanticHash} / ${projectionA.semanticHash}`);
