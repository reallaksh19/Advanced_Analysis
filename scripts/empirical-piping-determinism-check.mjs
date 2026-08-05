import assert from 'node:assert/strict';
import {
  assemblePlanarSystem,
  compileEmpiricalMember,
  resolveSectionStates,
  solveAssembledPlanarSystem,
  stableStringify,
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
const nodes = [
  { id: 'N3', xM: 4, yM: 0 },
  { id: 'N1', xM: 0, yM: 0 },
  { id: 'N2', xM: 2, yM: 0 },
];
const members = [
  compileEmpiricalMember({
    id: 'E2', nodeI: nodes[2], nodeJ: nodes[0], sectionStates, elasticModulusPa: 200e9,
    uniformGlobalLoadNM: { x: 0, y: -1000 },
  }),
  compileEmpiricalMember({
    id: 'E1', nodeI: nodes[1], nodeJ: nodes[2], sectionStates, elasticModulusPa: 200e9,
    uniformGlobalLoadNM: { x: 0, y: -1000 },
  }),
];
const constraints = [
  c('N3-UY', 'N3', 'UY'),
  c('N1-RZ', 'N1', 'RZ'),
  c('N1-UY', 'N1', 'UY'),
  c('N1-UX', 'N1', 'UX'),
];
const inputA = { nodes, members, constraints };
const snapshot = stableStringify(inputA);
const assembledA = assemblePlanarSystem(inputA);
const resultA = solveAssembledPlanarSystem(assembledA);
assert.equal(stableStringify(inputA), snapshot, 'source inputs must not be mutated');

const assembledB = assemblePlanarSystem({
  nodes: [...nodes].reverse(),
  members: [...members].reverse(),
  constraints: [...constraints].reverse(),
});
const resultB = solveAssembledPlanarSystem(assembledB);
assert.equal(assembledA.semanticIdentity, assembledB.semanticIdentity, 'assembly identity must ignore input ordering');
assert.equal(resultA.semanticIdentity, resultB.semanticIdentity, 'result identity must be repeatable');
assert.equal(stableStringify(resultA), stableStringify(resultB), 'semantic result must be byte-identical');

console.log('✅ Empirical piping deterministic ordering, immutable input and byte-identity checks passed.');

function c(id, nodeId, dof) { return { id, nodeId, dof, prescribedValue: 0 }; }
