export const CELL = Object.freeze({
  radius: 1,
  thickness: 0.05,
  diameter: 2,
  elasticModulus: 2.1e9,
  poissonRatio: 0.3,
  pressure: 1e5,
  length: 4,
  axialElements: 16,
  circumferentialElements: 32,
  indenterRadius: 0.8,
  indenterPatchWidth: 1,
  indenterDivisions: 8,
  initialGap: 0.01,
  imposedDepth: 0.04,
  penaltySlope: 1e8,
  initialIncrement: 0.2,
});
export const SOLVER_HASH = 'sha256:9a33d293706a66bee86f2f0ecf996a66758f904c20d61ad8c83ddc0f92ae4b7e';
export const BENCHMARK_IDS = Object.freeze([
  'NC03-ED-01_PRESSURE_PRELOAD_EQUILIBRIUM',
  'NC03-ED-02_INDENTATION_PATH',
  'NC03-ED-03_ELASTIC_RECOVERY',
  'NC03-ED-04_PRESSURE_SENSITIVITY',
  'NC03-ED-05_BOUNDARY_EXTENT_SENSITIVITY',
  'NC03-ED-06_MESH_CONVERGENCE',
  'NC03-ED-07_INCREMENT_CONVERGENCE',
  'NC03-ED-08_FORCE_DENT_REPRODUCIBILITY',
]);
