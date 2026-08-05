import assert from 'node:assert/strict';
import {
  assemblePlanarSystem,
  buildDistributedWeight,
  compileEmpiricalMember,
  evaluatePlanarEquilibrium,
  recoverMemberActions,
  resolveSectionStates,
  solveAssembledPlanarSystem,
} from '../src/core/empirical-piping-mechanics/index.js';

const sectionStates = resolveSectionStates({
  outsideDiameterM: 0.4064,
  nominalWallM: 0.009525,
  stiffnessWallM: 0.009525,
  weightWallM: 0.009525,
  corrosionAllowanceM: 0.0016002,
  codeStressWallRule: 'NOMINAL_MINUS_CORROSION',
  authority: {
    nominalWall: 'SOURCE:APP-S',
    stiffnessWall: 'PROJECT:MECHANICAL-NOMINAL',
    weightWall: 'PROJECT:PHYSICAL-NOMINAL',
    codeStressWall: 'CODE-DATASET:NOMINAL-MINUS-CORROSION',
  },
});
assertNear(sectionStates.weight.areaM2, 0.011875956541347614, 1e-12, 'section area');
assertNear(sectionStates.codeStress.areaM2, 0.009920635211237776, 1e-12, 'stress area');

const weight = buildDistributedWeight({
  sectionStates,
  densityKgM3: 7833.4,
  contentsMassPerLengthKgM: 117.841,
  insulationMassPerLengthKgM: 37.456,
  otherDistributedMassPerLengthKgM: 0,
  gravityGlobalMps2: { x: 0, y: -9.80665 },
});
assertNear(weight.pipeMassPerLengthKgM, 93.0291179709924, 1e-12, 'pipe mass');
assertNear(weight.globalLoadPerLengthNM.y, -2435.2473248002325, 1e-12, 'line load');

const E = 200e9;
const L = 4;
const q = -1000;
const nodeA = { id: 'A', xM: 0, yM: 0 };
const nodeB = { id: 'B', xM: L, yM: 0 };
const member = compileEmpiricalMember({
  id: 'AB', nodeI: nodeA, nodeJ: nodeB, sectionStates, elasticModulusPa: E,
  uniformGlobalLoadNM: { x: 0, y: q },
});

const cantilever = solveCase({
  nodes: [nodeA, nodeB], members: [member], constraints: [
    c('A-UX', 'A', 'UX'), c('A-UY', 'A', 'UY'), c('A-RZ', 'A', 'RZ'),
  ],
});
const EI = E * sectionStates.stiffness.secondMomentM4;
assertNear(cantilever.result.reactionByConstraint['A-UY'], -q * L, 1e-10, 'cantilever reaction');
assertNear(cantilever.result.reactionByConstraint['A-RZ'], (-q * L ** 2) / 2, 1e-10, 'cantilever moment');
assertNear(cantilever.result.displacementByNode.B.uyM, (q * L ** 4) / (8 * EI), 1e-9, 'cantilever tip displacement');
assertEquilibrium(cantilever.assembled, cantilever.result, 'cantilever');

const fixedFixed = solveCase({
  nodes: [nodeA, nodeB], members: [member], constraints: [
    c('A-UX', 'A', 'UX'), c('A-UY', 'A', 'UY'), c('A-RZ', 'A', 'RZ'),
    c('B-UX', 'B', 'UX'), c('B-UY', 'B', 'UY'), c('B-RZ', 'B', 'RZ'),
  ],
});
const ffActions = recoverMemberActions(fixedFixed.assembled, fixedFixed.result)[0];
assertNear(ffActions.localEndAction.momentI_Nm, (-q * L ** 2) / 12, 1e-12, 'fixed-fixed I nodal action');
assertNear(ffActions.localEndAction.momentJ_Nm, (q * L ** 2) / 12, 1e-12, 'fixed-fixed J nodal action');
assertEquilibrium(fixedFixed.assembled, fixedFixed.result, 'fixed-fixed');

const thermalMember = compileEmpiricalMember({
  id: 'T', nodeI: nodeA, nodeJ: nodeB, sectionStates, elasticModulusPa: E,
  thermal: { alphaPerK: 12e-6, deltaTK: 100 },
});
const freeThermal = solveCase({
  nodes: [nodeA, nodeB], members: [thermalMember], constraints: [
    c('A-UX', 'A', 'UX'), c('A-UY', 'A', 'UY'), c('A-RZ', 'A', 'RZ'),
    c('B-UY', 'B', 'UY'), c('B-RZ', 'B', 'RZ'),
  ],
});
assertNear(freeThermal.result.displacementByNode.B.uxM, 12e-6 * 100 * L, 1e-10, 'free thermal expansion');
assertNear(freeThermal.result.reactionByConstraint['A-UX'], 0, 1e-6, 'free thermal reaction');

const fixedThermal = solveCase({
  nodes: [nodeA, nodeB], members: [thermalMember], constraints: [
    c('A-UX', 'A', 'UX'), c('A-UY', 'A', 'UY'), c('A-RZ', 'A', 'RZ'),
    c('B-UX', 'B', 'UX'), c('B-UY', 'B', 'UY'), c('B-RZ', 'B', 'RZ'),
  ],
});
const expectedThermalForce = E * sectionStates.stiffness.areaM2 * 12e-6 * 100;
assertNear(Math.abs(fixedThermal.result.reactionByConstraint['A-UX']), expectedThermalForce, 1e-10, 'fixed thermal force');
assertEquilibrium(fixedThermal.assembled, fixedThermal.result, 'fixed thermal');

const inclinedB = { id: 'BI', xM: 3, yM: 4 };
const inclined = compileEmpiricalMember({
  id: 'AI', nodeI: nodeA, nodeJ: inclinedB, sectionStates, elasticModulusPa: E,
  uniformGlobalLoadNM: { x: 0, y: -1000 },
});
const inclinedCase = solveCase({
  nodes: [nodeA, inclinedB], members: [inclined], constraints: [
    c('A-UX', 'A', 'UX'), c('A-UY', 'A', 'UY'), c('A-RZ', 'A', 'RZ'),
  ],
});
assertNear(inclinedCase.result.reactionByConstraint['A-UY'], 5000, 1e-10, 'inclined gravity total force');
assertNear(inclinedCase.result.reactionByConstraint['A-RZ'], 7500, 1e-10, 'inclined gravity moment');
assertEquilibrium(inclinedCase.assembled, inclinedCase.result, 'inclined');

console.log('✅ Empirical piping section, weight, beam, gravity and thermal closed-form checks passed.');

function c(id, nodeId, dof) { return { id, nodeId, dof, prescribedValue: 0 }; }
function solveCase(model) {
  const assembled = assemblePlanarSystem(model);
  return { assembled, result: solveAssembledPlanarSystem(assembled) };
}
function assertEquilibrium(assembled, result, label) {
  const eq = evaluatePlanarEquilibrium(assembled, result);
  assertNear(eq.forceResidualN.x, 0, 1e-6, `${label} Fx`);
  assertNear(eq.forceResidualN.y, 0, 1e-6, `${label} Fy`);
  assertNear(eq.momentResidualNm, 0, 1e-6, `${label} M`);
}
function assertNear(actual, expected, relativeTolerance, label) {
  const tolerance = relativeTolerance * Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
}
