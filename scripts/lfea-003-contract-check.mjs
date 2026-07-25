import assert from 'node:assert/strict';
import {
  CONVERGENCE_RESULT_SCHEMA,
  CONVERGENCE_STUDY_SCHEMA,
  REVIEW_PROJECTION_STATUS,
  STRESS_PROJECTION_SCHEMA,
} from '../src/core/element-fea/interpretation-constants.js';
import { createConvergenceStudy } from '../src/core/element-fea/convergence-study.js';
import { interpretConvergenceStudy, validateConvergenceResult } from '../src/core/element-fea/interpretation-result.js';
import { createStressProjection, validateStressProjection } from '../src/core/element-fea/stress-projection.js';
import { convergenceStudy, projectionFixture } from './lfea-003-fixtures.mjs';

const input = convergenceStudy();
const study = createConvergenceStudy(input);
assert.equal(study.schema, CONVERGENCE_STUDY_SCHEMA);
assert.deepEqual(study.levels.map((row) => row.levelId), ['LEVEL_1','LEVEL_2','LEVEL_3','LEVEL_4']);
assert.deepEqual(study.levels.map((row) => row.meshMetrics.characteristicSize), [1,.5,.25,.12500000000000003]);
assert.deepEqual(study.refinementRatios.map((row) => row.ratio), [2,2,1.9999999999999996]);
assert.ok(Object.isFrozen(study));
assert.ok(Object.isFrozen(study.levels));
assert.equal(typeof study.semanticHash, 'string');

const result = interpretConvergenceStudy(input);
assert.equal(result.schema, CONVERGENCE_RESULT_SCHEMA);
assert.equal(result.status, 'QUALIFIED_INTERPRETATION_EVIDENCE');
assert.equal(result.sourceStudySemanticHash, study.semanticHash);
assert.equal(result.authorityPolicy.projectedStressForConvergence, 'PROHIBITED');
assert.equal(result.authorityPolicy.singularityProof, 'PROHIBITED');
assert.equal(validateConvergenceResult(result).ok, true);
assert.ok(Object.isFrozen(result));
assert.ok(Object.isFrozen(result.quantityResults));

const projection = createStressProjection(projectionFixture());
assert.equal(projection.schema, STRESS_PROJECTION_SCHEMA);
assert.equal(projection.status, REVIEW_PROJECTION_STATUS);
assert.equal(projection.authority, REVIEW_PROJECTION_STATUS);
assert.equal(projection.consumerRestrictions.convergence, 'PROHIBITED');
assert.equal(projection.consumerRestrictions.rawStressReplacement, 'PROHIBITED');
assert.equal(validateStressProjection(projection).ok, true);
assert.ok(Object.isFrozen(projection));
assert.ok(Object.isFrozen(projection.elementCornerValues));
console.log('LFEA-003 study, interpretation, projection, authority, hash and immutability contracts passed.');
