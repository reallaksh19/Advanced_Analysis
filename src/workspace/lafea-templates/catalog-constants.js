import { deepFreeze } from '../../core/shared-piping-model/index.js';

export const LAFEA_TEMPLATE_CATALOG_MODEL_SCHEMA = 'lafea-template-catalog-model/v1';
export const LAFEA_TEMPLATE_CATALOG_CARD_SCHEMA = 'lafea-template-catalog-card/v1';
export const LAFEA_TEMPLATE_CATALOG_QUERY_SCHEMA = 'lafea-template-catalog-query/v1';
export const LAFEA_TEMPLATE_CATALOG_RESULT_SCHEMA = 'lafea-template-catalog-result/v1';

export const LAFEA_TEMPLATE_APPLICATION_GROUPS = Object.freeze([
  'ASSESSMENT', 'NOZZLE_BRANCH', 'PIPE_SUPPORT', 'PIPING_COMPONENT',
  'STRUCTURAL_LUG_BRACKET', 'VESSEL_ATTACHMENT', 'WELD_GROUP',
]);

export const LAFEA_TEMPLATE_GEOMETRY_CLASSES = Object.freeze([
  'ASSESSMENT_PACKAGE', 'AXISYMMETRIC_SECTION', 'CIRCULAR_SECTION', 'LINE_GROUP',
  'NAMED_SCL_PATH', 'NAMED_WELD_LINE', 'PLANAR_REGION_WITH_HOLES', 'PLANAR_SECTION',
  'REFERENCE_FRAME', 'SHELL_MIDSURFACE', 'THICK_CYLINDER_SECTION',
]);

export const MODEL_KEYS = Object.freeze([
  'benchmarkManifestSetHash', 'bucketRegistryHash', 'cards', 'filterOptions',
  'parameterSchemaSetHash', 'parentRegistryHash', 'profileAvailabilityHash',
  'releaseRecordSetHash', 'schema', 'semanticHash', 'summary', 'templateRegistryHash',
]);
export const CARD_KEYS = Object.freeze([
  'applicationFamily', 'applicationGroup', 'code', 'computation', 'geometryClass',
  'inputs', 'label', 'limitations', 'outputs', 'qualification', 'schema', 'schematic',
  'semanticHash', 'templateId', 'templateRevision', 'typicalUse',
]);
export const QUERY_KEYS = Object.freeze([
  'applicationFamilies', 'applicationGroups', 'assessmentProfileIds',
  'benchmarkQualificationStatuses', 'bucketIds', 'engineStates', 'executable',
  'geometryClasses', 'readinessStatuses', 'releaseStatuses', 'stageIds', 'text',
]);
export const RESULT_KEYS = Object.freeze([
  'cards', 'catalogSemanticHash', 'matchedTemplateIds', 'query', 'schema',
  'semanticHash', 'summary',
]);
export const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;

export const FAMILY_METADATA = deepFreeze({
  CLAMP_EAR: ['STRUCTURAL_LUG_BRACKET', 'PLANAR_REGION_WITH_HOLES', 'Clamp ear with a bolt hole and local fillet or root refinement.'],
  CODE_ASSESSMENT: ['ASSESSMENT', 'ASSESSMENT_PACKAGE', 'Configured assessment consuming qualified recovery and convergence evidence.'],
  FLANGE_HUB: ['PIPING_COMPONENT', 'AXISYMMETRIC_SECTION', 'Axisymmetric flange-hub section under pressure and bolt loading.'],
  LOAD_TRANSFER: ['PIPE_SUPPORT', 'REFERENCE_FRAME', 'Transfer support, nozzle, or trunnion loads between declared reference points and coordinate bases.'],
  LUG_PINHOLE: ['STRUCTURAL_LUG_BRACKET', 'PLANAR_REGION_WITH_HOLES', 'Planar lug or support plate with a pin hole.'],
  NOZZLE_REPAD_SECTION: ['NOZZLE_BRANCH', 'PLANAR_SECTION', 'Nozzle neck, shell ligament, and reinforcement-pad section.'],
  NOZZLE_SECTION: ['NOZZLE_BRANCH', 'CIRCULAR_SECTION', 'Nominal nozzle-neck section screening.'],
  PIPE_ATTACHMENT: ['PIPE_SUPPORT', 'SHELL_MIDSURFACE', 'Pipe attachment represented on a shell midsurface.'],
  PIPE_COMPONENT: ['PIPING_COMPONENT', 'SHELL_MIDSURFACE', 'Piping component represented by governed shell geometry.'],
  PIPE_LOCAL_PATCH: ['PIPE_SUPPORT', 'SHELL_MIDSURFACE', 'Local pipe-shell load patch.'],
  PIPE_PAD_SECTION: ['PIPE_SUPPORT', 'PLANAR_SECTION', 'Pipe-wall and reinforcement-pad section.'],
  PIPE_SECTION: ['PIPING_COMPONENT', 'CIRCULAR_SECTION', 'Straight pipe section under pressure and combined resultants.'],
  PRESSURE_BASELINE: ['PIPING_COMPONENT', 'THICK_CYLINDER_SECTION', 'Elastic thick-cylinder pressure baseline.'],
  STRESS_CLASSIFICATION: ['ASSESSMENT', 'NAMED_SCL_PATH', 'Named through-thickness stress-classification path.'],
  STRUCTURAL_BRACKET: ['STRUCTURAL_LUG_BRACKET', 'PLANAR_REGION_WITH_HOLES', 'Bracket, gusset, or cleat with holes and fillets.'],
  VESSEL_ATTACHMENT: ['VESSEL_ATTACHMENT', 'SHELL_MIDSURFACE', 'Attachment on a vessel shell midsurface.'],
  VESSEL_NOZZLE: ['NOZZLE_BRANCH', 'SHELL_MIDSURFACE', 'Vessel-nozzle shell intersection.'],
  WELD_GROUP: ['WELD_GROUP', 'LINE_GROUP', 'Analytical line-weld group screening concept.'],
  WELD_STRUCTURAL_STRESS: ['ASSESSMENT', 'NAMED_WELD_LINE', 'Structural-stress recovery along a named weld line.'],
});
