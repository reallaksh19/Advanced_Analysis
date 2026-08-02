/** Public non-UI surface for the bounded LAFEA.3 continuum pilot path. */
export {
  LAFEA_CONTROLLED_CONTINUUM_CONTROLLER_RESULT_SCHEMA,
  LAFEA_CONTROLLED_CONTINUUM_CONTROLLER_REVISION,
  executeControlledLafeaContinuumPilot,
} from './lafea-controlled-continuum-execution-public.js';
export {
  LAFEA_CONTROLLED_CONTINUUM_STAGE_ID,
  LAFEA_CONTROLLED_CONTINUUM_STAGE_ROUTE_SCHEMA,
} from './lafea-controlled-continuum-stage-route.js';
export {
  LAFEA_LUG_PINHOLE_MESH_LADDER_INTAKE_SCHEMA,
  LAFEA_LUG_PINHOLE_MESH_LADDER_LEVEL_SCHEMA,
  LAFEA_LUG_PINHOLE_MESH_LADDER_PRODUCER_REVISION,
  LAFEA_LUG_PINHOLE_MESH_LADDER_SCHEMA,
  createLafeaLugPinholeMeshLadder,
  lafeaLugPinholeAnalysisGeometryHash,
  validateLafeaLugPinholeMeshLadder,
} from './lafea-lug-pinhole-mesh-ladder.js';
export {
  LAFEA_LUG_PINHOLE_EXECUTION_INTAKE_SCHEMA,
  LAFEA_LUG_PINHOLE_EXECUTION_SCHEMA,
  LAFEA_LUG_PINHOLE_FEATURE_PROJECTION_SCHEMA,
  LAFEA_LUG_PINHOLE_PHYSICAL_PROBLEM_PRODUCER_REVISION,
  LAFEA_LUG_PINHOLE_PHYSICAL_PROBLEM_SCHEMA,
  LAFEA_LUG_PINHOLE_PROJECTION_INTAKE_SCHEMA,
  LAFEA_LUG_PINHOLE_PROJECTION_SCHEMA,
  createLafeaLugPinholePhysicalProblemProjection,
  executeLafeaLugPinholePhysicalProblemBatch,
  validateLafeaLugPinholePhysicalProblemProjection,
} from './lafea-lug-pinhole-physical-problem-batch.js';
