import { deepFreeze, semanticHash } from './contracts.js';

const rows = [
  ['NC01-SH-01', 'RIGID_BODY_OBJECTIVITY', 4, 'NON_OBJECTIVE_DIRECTOR_UPDATE'],
  ['NC01-SH-02', 'MEMBRANE_PATCH', 4, 'DRILLING_OR_MEMBRANE_LOCKING_CONTAMINATION'],
  ['NC01-SH-03', 'PURE_BENDING', 4, 'TOP_BOTTOM_SECTION_REVERSAL'],
  ['NC01-SH-04', 'TRANSVERSE_SHEAR_THIN_LIMIT', 4, 'SHEAR_LOCKING'],
  ['NC01-SH-05', 'WARPED_QUADRILATERAL', 4, 'INVALID_WARPED_MAPPING'],
  ['NC01-SH-06', 'FOLLOWER_PRESSURE', 4, 'FROZEN_PRESSURE_DIRECTION'],
  ['NC01-SH-07', 'NORMAL_REVERSAL', 4, 'INCORRECT_LOCAL_NORMAL'],
  ['NC01-SH-08', 'FOUR_LEVEL_MESH_CONVERGENCE', 4, 'UNCONTROLLED_HOURGLASS_MODE'],
];

export const SHELL_BENCHMARK_CATALOG = deepFreeze(rows.map(([id, domain, minimumMeshLevels, requiredMutation]) => ({
  id,
  domain,
  minimumMeshLevels,
  requiredMutation,
  requiredSource: 'EXTERNAL_SOLVER_EXECUTION',
  requiredRecovery: 'FIXED_PHYSICAL_COORDINATE_SECTION_INTEGRATION_POINT',
  referenceRequired: true,
  referenceUncertaintyRequired: true,
  independentOracleRequired: true,
})));

export const SHELL_BENCHMARK_CATALOG_HASH = semanticHash(SHELL_BENCHMARK_CATALOG);

export function shellBenchmarkById(id) {
  return SHELL_BENCHMARK_CATALOG.find((entry) => entry.id === id) ?? null;
}
