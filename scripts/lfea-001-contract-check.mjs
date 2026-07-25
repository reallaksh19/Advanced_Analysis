import assert from 'node:assert/strict';
import {
  createContinuumModel,
  createLfeaProfile,
  solveContinuumModel,
  validateContinuumResult,
} from '../src/core/element-fea/index.js';
import { handCheckModel } from './lfea-001-fixtures.mjs';

const input = handCheckModel();
const profile = createLfeaProfile(input.solverProfile);
assert.equal(profile.schema, 'lfea-profile/v1');
assert.deepEqual(profile.dofOrder, ['UX', 'UY']);
assert.deepEqual(profile.strainVectorOrder, ['EX', 'EY', 'GXY']);
assert.deepEqual(profile.stressVectorOrder, ['SX', 'SY', 'TXY']);
assert.equal(profile.shearConvention, 'ENGINEERING_GAMMA_XY');
assert.equal(profile.constraintMethod, 'PARTITION_ELIMINATION');
assert.equal(profile.reactionConvention, 'SUPPORT_FORCE_ON_STRUCTURE');
assert.equal(profile.pressureConvention, 'POSITIVE_COMPRESSIVE_OPPOSITE_OUTWARD_NORMAL');
assert.equal(profile.residualDefinitions, 'ORIGINAL_ASSEMBLED_SYSTEM');
assert.equal(profile.energyDefinition, 'HALF_U_TRANSPOSE_K_U');
assert.equal(profile.backendIdentity, 'dense-ldlt-reference/v1');

const model = createContinuumModel(input);
assert.equal(model.schema, 'fea-continuum-model/v1');
assert.equal(model.solverProfileIdentity, model.solverProfile.profileIdentity);
assert.equal(typeof model.semanticHash, 'string');
assert.ok(model.nodes.every((row) => row.sourceSemanticHash === model.sourceSemanticHash));
assert.ok(model.materials.every((row) => row.sourceSemanticHash === model.sourceSemanticHash));
assert.ok(model.elements.every((row) => row.sourceSemanticHash === model.sourceSemanticHash));
assert.ok(model.prescribedDisplacements.every((row) => row.sourceSemanticHash === model.sourceSemanticHash));
assert.ok(model.loadCases.every((row) => row.sourceSemanticHash === model.sourceSemanticHash));
assert.ok(model.sourceReferences.every((row) => row.sourceSemanticHash === model.sourceSemanticHash));

const result = solveContinuumModel(input);
assert.equal(result.schema, 'fea-continuum-result/v1');
assert.equal(result.qualifiedResults, 'complete');
for (const field of [
  'modelIdentity', 'modelVersion', 'sourceSemanticHash', 'solverProfile', 'backendTrace', 'runtimeTrace',
  'dofMap', 'constraintPartition', 'directNodalLoads', 'equivalentEdgeLoads', 'effectiveFreeLoad',
  'nodalDisplacements', 'reactions', 'elementStrains', 'elementStresses', 'principalStresses',
  'vonMisesStress', 'elementInternalForces', 'freeDofResidual', 'globalResidual', 'strainEnergy',
  'diagnostics', 'limitations', 'semanticHash',
]) assert.ok(Object.hasOwn(result, field), `Missing result evidence: ${field}`);
assert.equal(result.dofMap.map((row) => row.equationIdentity).join(','), 'N1:UX,N1:UY,N2:UX,N2:UY,N3:UX,N3:UY');
assert.equal(result.elementStresses[0].recoveryLocation, 'T3_CONSTANT_ELEMENT_DOMAIN');
assert.equal(validateContinuumResult(result).ok, true);
assert.ok(Object.isFrozen(profile));
assert.ok(Object.isFrozen(model));
assert.ok(Object.isFrozen(result));
console.log('LFEA-001 profile, model, result and immutable-evidence contracts passed.');
