export {
  ASSEMBLY_KEYS,
  DENSE_DIRECT_BACKEND_ID,
  DIAGNOSTICS_KEYS,
  DIAGONAL_ENERGY_SCALING_ID,
  DOF_MAP_RECORD_KEYS,
  DOF_MAP_SCHEMA,
  EXECUTION_RECORD_KEYS,
  EXECUTION_SCHEMA,
  EXECUTION_STATUSES,
  FACTORIZATION_KEYS,
  GATE_KEYS,
  LinearSolverError,
  MOMENT_REFERENCE_RULE,
  QUALIFICATION_STATUSES,
  SOLVER_PROFILE_ID,
  SOLVER_PROFILE_KEYS,
  SOLVER_PROFILE_SCHEMA,
  SUPPORTED_BACKENDS,
  SUPPORTED_SCALINGS,
  computeSolverProfileSemanticHash,
  requireSolverProfile,
  resolveSolverPolicies,
  sealSolverProfile,
} from './solver-contract.js';

export {
  NODE_ORDERING_RULE,
  buildDofMap,
  computeDofMapSemanticHash,
  dofIndexOf,
  dofMapSemanticProjection,
  requireDofMap,
} from './dof-map.js';

export {
  ELEMENT_CONTRIBUTION_KEYS,
  elementContributionFromFrameElement,
  elementContributionsFromPipingComponent,
  requireElementContribution,
} from './element-contributions.js';

export { assembleGlobalSystem } from './assembly.js';

export { factorizeFreePartition } from './factorization.js';

export { connectedComponents, detectFloatingComponents } from './mechanism-diagnostics.js';

export {
  conditioningReport,
  energyBalanceCheck,
  forceEquilibriumCheck,
  momentEquilibriumCheck,
  residualCheck,
  worstStatus,
} from './qualification.js';

export { createFactorizationCache, getOrFactorize } from './reuse-cache.js';

export {
  applyDiagonalScalingToMatrix,
  applyDiagonalScalingToVector,
  computeDiagonalEnergyScaling,
} from './scaling.js';

export {
  compileSolverExecution,
  computeExecutionEvidenceHash,
  computeExecutionSemanticHash,
  executionSemanticProjection,
  requireSolverExecution,
} from './solve.js';
