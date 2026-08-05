import assert from 'node:assert/strict';
import {
  assemblePlanarSystem,
  compareRefinement,
  compileSegmentedPlanarElbow,
  recoverMemberActions,
  recoverUniformLoadInternalExtrema,
  resolveSectionStates,
  solveAssembledPlanarSystem,
} from '../src/core/empirical-piping-mechanics/index.js';

const sectionStates = resolveSectionStates({
  outsideDiameterM: 0.2,
  nominalWallM: 0.01,
  stiffnessWallM: 0.01,
  weightWallM: 0.01,
  corrosionAllowanceM: 0,
  codeStressWallRule: 'EXPLICIT',
  codeStressWallM: 0.01,
  authority: { nominalWall: 'TEST', stiffnessWall: 'TEST', weightWall: 'TEST', codeStressWall: 'TEST' },
});
const coarse = solveElbow(8);
const fine = solveElbow(16);

const displacement = compareRefinement({
  coarse: coarse.tip.uyM,
  fine: fine.tip.uyM,
  absoluteTolerance: 0.0001,
  relativeTolerancePercent: 1,
  denominatorFloor: 1e-6,
});
const reaction = compareRefinement({
  coarse: coarse.verticalReactionN,
  fine: fine.verticalReactionN,
  absoluteTolerance: 50,
  relativeTolerancePercent: 0.25,
  denominatorFloor: 1,
});
const endMoment = compareRefinement({
  coarse: coarse.baseMomentNm,
  fine: fine.baseMomentNm,
  absoluteTolerance: 250,
  relativeTolerancePercent: 1,
  denominatorFloor: 1,
});
const peakMoment = compareRefinement({
  coarse: coarse.peakMomentNm,
  fine: fine.peakMomentNm,
  absoluteTolerance: 250,
  relativeTolerancePercent: 1,
  denominatorFloor: 1,
});
assert.equal(displacement.passes, true, `8→16 displacement failed: ${JSON.stringify(displacement)}`);
assert.equal(reaction.passes, true, `8→16 reaction failed: ${JSON.stringify(reaction)}`);
assert.equal(endMoment.passes, true, `8→16 end moment failed: ${JSON.stringify(endMoment)}`);
assert.equal(peakMoment.passes, true, `8→16 peak moment failed: ${JSON.stringify(peakMoment)}`);
assertNear(coarse.totalVerticalLoadN, -Math.PI * 500, 1e-10, '8-segment physical arc weight');
assertNear(fine.totalVerticalLoadN, -Math.PI * 500, 1e-10, '16-segment physical arc weight');

console.log('✅ Empirical piping segmented-elbow physical-length and 8→16 convergence checks passed.');

function solveElbow(segmentCount) {
  const elbow = compileSegmentedPlanarElbow({
    id: `B${segmentCount}`,
    nearNodeId: 'N',
    farNodeId: 'F',
    nearPoint: { xM: 1, yM: 0 },
    centerPoint: { xM: 0, yM: 0 },
    includedAngleRad: Math.PI / 2,
    sweepSign: 1,
    segmentCount,
    sectionStates,
    elasticModulusPa: 200e9,
    flexibilityFactor: 3,
    uniformGlobalLoadNM: { x: 0, y: -1000 },
  });
  const assembled = assemblePlanarSystem({
    nodes: elbow.nodes,
    members: elbow.members,
    constraints: [
      { id: 'N-UX', nodeId: 'N', dof: 'UX' },
      { id: 'N-UY', nodeId: 'N', dof: 'UY' },
      { id: 'N-RZ', nodeId: 'N', dof: 'RZ' },
    ],
  });
  const result = solveAssembledPlanarSystem(assembled);
  const actions = recoverMemberActions(assembled, result);
  const peaks = actions.map(action => {
    const member = assembled.members.find(candidate => candidate.id === action.memberId);
    return recoverUniformLoadInternalExtrema(member, action).maximumAbsoluteMoment.momentNm;
  });
  return {
    tip: result.displacementByNode.F,
    verticalReactionN: result.reactionByConstraint['N-UY'],
    baseMomentNm: result.reactionByConstraint['N-RZ'],
    peakMomentNm: peaks.reduce((best, value) => Math.abs(value) > Math.abs(best) ? value : best, 0),
    totalVerticalLoadN: assembled.nodes.reduce((sum, _node, index) => sum + assembled.load[(3 * index) + 1], 0),
  };
}
function assertNear(actual, expected, relativeTolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= relativeTolerance * Math.max(1, Math.abs(expected)),
    `${label}: ${actual} != ${expected}`,
  );
}
