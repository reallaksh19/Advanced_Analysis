export const DEFAULT_ENGINEERING_SETTINGS = {
  projectUnitSystem: 'imperial',
  defaultLengthUnit: 'ft',
  defaultForceUnit: 'lbf',
  defaultStressUnit: 'psi',
  pipeDataSource: 'internal-screening-db',
  materialDataSource: 'internal-screening-db',
  rackFrictionFactor: 0.3,
  rackSpacingMargin: 75,
  shortDropLimit_ft: 3.0,
  allowPlaceholderLoads: false,
  reportTimestampPolicy: 'exclude-from-deterministic-hash',
  benchmarkCertificationRequired: true
};

export const SETTINGS_GROUPS = [
  'Project basis',
  'Unit system',
  'Pipe database source',
  'Material database source',
  'Rack defaults',
  'Guided cantilever defaults',
  'MIST/nozzle data source',
  'Report options',
  'Benchmark certification status'
];
