import { deepFreeze, semanticHash } from './contracts.js';

const BENCHMARKS = [
  ['RIGID_BODY_OBJECTIVITY', 'OBJECTIVITY', ['displacement', 'strainEnergy', 'reactionResidual'], 3],
  ['MEMBRANE_PATCH', 'MEMBRANE', ['displacement', 'membraneStress', 'reactionResidual'], 3],
  ['PURE_BENDING', 'BENDING', ['displacement', 'curvature', 'topBottomStress'], 3],
  ['TRANSVERSE_SHEAR_THIN_LIMIT', 'LOCKING', ['displacement', 'shearEnergyRatio'], 4],
  ['WARPED_QUADRILATERAL', 'DISTORTION', ['displacement', 'reactionResidual'], 3],
  ['FOLLOWER_PRESSURE', 'GEOMETRIC_NONLINEARITY', ['displacement', 'loadResultant', 'externalWork'], 4],
  ['NORMAL_REVERSAL', 'ORIENTATION', ['normalSign', 'topBottomStress'], 2],
  ['MESH_REFINEMENT', 'CONVERGENCE', ['displacement', 'strainEnergy', 'reactionResidual'], 4],
];

export const SHELL_BENCHMARK_CATALOG = deepFreeze(BENCHMARKS.map(([id, domain, quantities, minimumMeshLevels]) => ({
  id,
  domain,
  quantities,
  minimumMeshLevels,
  referenceRequired: true,
  uncertaintyRequired: true,
  toleranceRequired: true,
})));

export const SHELL_BENCHMARK_CATALOG_HASH = semanticHash(SHELL_BENCHMARK_CATALOG);

export function benchmarkById(id) {
  return SHELL_BENCHMARK_CATALOG.find((entry) => entry.id === id) ?? null;
}
