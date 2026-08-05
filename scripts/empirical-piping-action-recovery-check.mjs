import assert from 'node:assert/strict';
import {
  assemblePlanarSystem,
  buildCircularBendTangent,
  compileEmpiricalMember,
  projectStationForce,
  recoverMemberActions,
  recoverUniformLoadInternalExtrema,
  verifyJointActionBalance,
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
const E = 200e9;
const L = 6;
const q = -2000;
const A = { id: 'A', xM: 0, yM: 0 };
const B = { id: 'B', xM: L, yM: 0 };
const member = compileEmpiricalMember({
  id: 'AB', nodeI: A, nodeJ: B, sectionStates, elasticModulusPa: E,
  uniformGlobalLoadNM: { x: 0, y: q },
});
const assembled = assemblePlanarSystem({
  nodes: [A, B], members: [member], constraints: [
    c('A-UX', 'A', 'UX'), c('A-UY', 'A', 'UY'), c('A-RZ', 'A', 'RZ'),
    c('B-UX', 'B', 'UX'), c('B-UY', 'B', 'UY'), c('B-RZ', 'B', 'RZ'),
  ],
});
const solution = solveAssembledPlanarSystem(assembled);
const action = recoverMemberActions(assembled, solution)[0];
const extrema = recoverUniformLoadInternalExtrema(member, action);
const jointBalance = verifyJointActionBalance({ assembled, memberActions: [action], solution });
assert.equal(jointBalance.ok, true, `joint action balance: ${jointBalance.maximumResidual}`);
const expectedEndMoment = q * L ** 2 / 12;
const expectedMidMoment = -q * L ** 2 / 24;
assertNear(extrema.candidates[0].momentNm, expectedEndMoment, 1e-12, 'I internal moment');
assertNear(extrema.candidates.at(-1).momentNm, expectedMidMoment, 1e-12, 'midspan moment');
assertNear(extrema.maximumAbsoluteMoment.momentNm, expectedEndMoment, 1e-12, 'peak absolute moment');

const reversed = compileEmpiricalMember({
  id: 'BA', nodeI: B, nodeJ: A, sectionStates, elasticModulusPa: E,
  uniformGlobalLoadNM: { x: 0, y: q },
});
const reversedAssembled = assemblePlanarSystem({
  nodes: [B, A], members: [reversed], constraints: [
    c('A-UX', 'A', 'UX'), c('A-UY', 'A', 'UY'), c('A-RZ', 'A', 'RZ'),
    c('B-UX', 'B', 'UX'), c('B-UY', 'B', 'UY'), c('B-RZ', 'B', 'RZ'),
  ],
});
const reversedSolution = solveAssembledPlanarSystem(reversedAssembled);
const reversedAction = recoverMemberActions(reversedAssembled, reversedSolution)[0];
const reversedExtrema = recoverUniformLoadInternalExtrema(reversed, reversedAction);
assertNear(
  Math.abs(reversedExtrema.maximumAbsoluteMoment.momentNm),
  Math.abs(extrema.maximumAbsoluteMoment.momentNm),
  1e-12,
  'I/J reversal peak invariance',
);

const tangent = buildCircularBendTangent({
  nearPoint: { xM: 1, yM: 0 },
  centerPoint: { xM: 0, yM: 0 },
  sweepSign: 1,
  includedAngleRad: Math.PI / 2,
  stationFraction: 0.5,
});
assertNear(tangent.x, -Math.SQRT1_2, 1e-12, 'bend tangent x');
assertNear(tangent.y, Math.SQRT1_2, 1e-12, 'bend tangent y');
const projected = projectStationForce({ xN: 1000, yN: 1000 }, tangent);
assertNear(projected.axialForceN, 0, 1e-12, 'bend tangent axial projection');

console.log('✅ Empirical piping member-action, internal-extrema, orientation and bend-tangent checks passed.');

function c(id, nodeId, dof) { return { id, nodeId, dof, prescribedValue: 0 }; }
function assertNear(actual, expected, relativeTolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= relativeTolerance * Math.max(1, Math.abs(expected)),
    `${label}: ${actual} != ${expected}`,
  );
}
