export const CANONICAL_GEOMETRY_SCHEMA_VERSION = 'canonical-geometry-v1';

export const ENTITY_TYPES = Object.freeze({
  PROJECT: 'project',
  UNIT: 'units',
  NODE: 'nodes',
  SEGMENT: 'segments',
  COMPONENT: 'components',
  SUPPORT: 'supports',
  LOAD: 'loads',
  MATERIAL: 'materials',
  DIAGNOSTIC: 'diagnostics',
  SOURCE_METADATA: 'sourceMetadata',
});

export const SUPPORTED_UNITS = Object.freeze({
  LENGTH: ['mm', 'm', 'in', 'ft'],
  FORCE: ['N', 'kN', 'lbf', 'kip'],
  TEMPERATURE: ['C', 'F'],
  PRESSURE: ['Pa', 'kPa', 'MPa', 'psi', 'bar'],
});

export const DIAGNOSTIC_SEVERITIES = Object.freeze({
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  FATAL: 'FATAL',
});
