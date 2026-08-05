import assert from 'node:assert/strict';
import {
  compileEmpiricalMember,
  decomposeColdHotActions,
  resolveSectionStates,
  solvePlanarRestContact,
} from '../src/core/empirical-piping-mechanics/index.js';

const sectionStates = resolveSectionStates({
  outsideDiameterM: 0.1,
  nominalWallM: 0.005,
  stiffnessWallM: 0.005,
  weightWallM: 0.005,
  corrosionAllowanceM: 0,
  codeStressWallRule: 'EXPLICIT',
  codeStressWallM: 0.005,
  authority: {
    nominalWall: 'TEST', stiffnessWall: 'TEST', weightWall: 'TEST', codeStressWall: 'TEST',
  },
});
const nodes = [
  { id: 'A', xM: 0, yM: 0 },
  { id: 'M', xM: 5, yM: 0 },
  { id: 'B', xM: 10, yM: 0 },
];
const members = [
  compileEmpiricalMember({
    id: 'AM', nodeI: nodes[0], nodeJ: nodes[1], sectionStates, elasticModulusPa: 200e9,
  }),
  compileEmpiricalMember({
    id: 'MB', nodeI: nodes[1], nodeJ: nodes[2], sectionStates, elasticModulusPa: 200e9,
  }),
];
const result = solvePlanarRestContact({
  nodes,
  members,
  nodalLoads: [{ id: 'UPLIFT', nodeId: 'M', yN: 1000 }],
  bilateralConstraints: [
    c('A-UX', 'A', 'UX'), c('A-UY', 'A', 'UY'), c('A-RZ', 'A', 'RZ'),
    c('B-UX', 'B', 'UX'), c('B-UY', 'B', 'UY'), c('B-RZ', 'B', 'RZ'),
  ],
  unilateralRests: [{ id: 'M-REST', nodeId: 'M', dof: 'UY', normalSign: 1, initialGapM: 0 }],
});

assert.equal(result.iterations.length, 2, 'contact must solve attached trial then released model');
assert.deepEqual(result.iterations[0].activeRestIds, ['M-REST']);
assert.ok(result.iterations[0].reactionsByRestId['M-REST'] < 0, 'attached rest must be tensile');
assert.deepEqual(result.iterations[0].releaseRestIds, ['M-REST']);
assert.deepEqual(result.activeRestIds, []);
assert.deepEqual(result.inactiveRestIds, ['M-REST']);
assert.equal(result.reactionsByRestId['M-REST'], 0, 'released reaction is zero after recalculation');
assert.ok(result.gapsByRestId['M-REST'] > 0, 'released rest must have positive separation');
assert.notEqual(
  result.iterations[0].solutionIdentity,
  result.iterations[1].solutionIdentity,
  'release must rebuild a distinct solved system',
);

const finalAssembled = result.result.assembledIdentity
  ? result.result
  : null;
assert(finalAssembled, 'final calculation result must be retained');

const decomposition = decomposeColdHotActions({
  coldWeightAction: { bendingMomentZNm: 10 },
  hotWeightAction: { bendingMomentZNm: 14 },
  hotOperatingAction: { bendingMomentZNm: 22 },
});
assert.equal(decomposition.weightLiftRedistribution.bendingMomentZNm, 4);
assert.equal(decomposition.thermalOnHotSupportSet.bendingMomentZNm, 8);
assert.equal(decomposition.operatingMinusColdSustained.bendingMomentZNm, 12);
assert.equal(
  decomposition.warning,
  'OPERATING_MINUS_COLD_SUSTAINED_IS_NOT_PURE_THERMAL_WHEN_SUPPORT_STATE_CHANGES',
);

console.log('✅ Empirical piping unilateral contact and cold/hot decomposition checks passed.');

function c(id, nodeId, dof) { return { id, nodeId, dof, prescribedValue: 0 }; }
