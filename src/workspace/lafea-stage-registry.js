import {
  LAFEA_STAGE_DEFINITIONS,
  LAFEA_STAGE_IDS,
  lafeaCollectionPaths,
  lafeaStageExecutionSupported,
} from './lafea-workbench-model.js';

export const LAFEA_STAGE_REGISTRY_SCHEMA = 'lafea-stage-registry/v1';

export const LAFEA_STAGE_CATEGORIES = Object.freeze([
  'FOUNDATION_LOAD_TRANSFER',
  'PIPE_SECTION_SCREENING',
  'CONTINUUM_2D',
  'THIN_SHELL',
  'TRUNNION_FOOTPRINT',
  'WELD_PROFILE_PLACEHOLDER',
]);

export const LAFEA_ENGINE_STATES = Object.freeze([
  'QUALIFIED_ROUTE_REGISTERED',
  'ENGINE_NOT_IMPLEMENTED',
]);

const TAXONOMY = Object.freeze({
  'LAFEA.1': Object.freeze({
    category: 'FOUNDATION_LOAD_TRANSFER',
    enginePackage: 'local-stress',
    inputContractRole: 'LOCAL_ATTACHMENT_FOUNDATION_SOURCE',
    resultContractRole: 'LOCAL_ATTACHMENT_FOUNDATION_RESULT',
    presenterRole: 'ATTACHMENT_FOUNDATION_EVIDENCE',
    previewPolicy: 'SOURCE_POINTS_DISPLAY_ONLY',
  }),
  'LAFEA.2': Object.freeze({
    category: 'PIPE_SECTION_SCREENING',
    enginePackage: 'local-attachment-screening',
    inputContractRole: 'LOCAL_ATTACHMENT_SCREENING_REQUEST',
    resultContractRole: 'LOCAL_ATTACHMENT_SCREENING_RESULT',
    presenterRole: 'PIPE_SECTION_SCREENING_EVIDENCE',
    previewPolicy: 'NO_GEOMETRY_AUTHORITY',
  }),
  'LAFEA.3': Object.freeze({
    category: 'CONTINUUM_2D',
    enginePackage: 'local-continuum',
    inputContractRole: 'LOCAL_CONTINUUM_MODEL',
    resultContractRole: 'LOCAL_CONTINUUM_RESULT',
    presenterRole: 'CONTINUUM_RESULT_EVIDENCE',
    previewPolicy: 'SOURCE_MESH_EDITABLE',
  }),
  'LAFEA.4': Object.freeze({
    category: 'THIN_SHELL',
    enginePackage: 'local-shell',
    inputContractRole: 'LOCAL_SHELL_MODEL',
    resultContractRole: 'LOCAL_SHELL_RESULT',
    presenterRole: 'SHELL_RESULT_EVIDENCE',
    previewPolicy: 'SOURCE_MESH_EDITABLE',
  }),
  'LAFEA.5': Object.freeze({
    category: 'TRUNNION_FOOTPRINT',
    enginePackage: 'local-trunnion-footprint',
    inputContractRole: 'TRUNNION_FOOTPRINT_SOURCE',
    resultContractRole: 'TRUNNION_FOOTPRINT_RESULT',
    presenterRole: 'TRUNNION_FOOTPRINT_EVIDENCE',
    previewPolicy: 'SOURCE_SHELL_TEMPLATE_DISPLAY',
  }),
  'LAFEA.6': Object.freeze({
    category: 'WELD_PROFILE_PLACEHOLDER',
    enginePackage: null,
    inputContractRole: 'UNQUALIFIED_PLACEHOLDER_SOURCE',
    resultContractRole: null,
    presenterRole: 'UNSUPPORTED_STAGE_DIAGNOSTIC',
    previewPolicy: 'EXPLICIT_SOURCE_GEOMETRY_DISPLAY_ONLY',
  }),
});

export const LAFEA_STAGE_REGISTRY = Object.freeze(
  LAFEA_STAGE_DEFINITIONS.map((definition) => {
    const taxonomy = TAXONOMY[definition.stageId];
    if (!taxonomy) throw new TypeError(`Missing LAFEA taxonomy for ${definition.stageId}.`);
    const executionSupported = lafeaStageExecutionSupported(definition.stageId);
    return Object.freeze({
      schema: LAFEA_STAGE_REGISTRY_SCHEMA,
      stageId: definition.stageId,
      label: definition.label,
      limitation: definition.description,
      category: taxonomy.category,
      engineState: executionSupported
        ? 'QUALIFIED_ROUTE_REGISTERED'
        : 'ENGINE_NOT_IMPLEMENTED',
      enginePackage: taxonomy.enginePackage,
      inputContractRole: taxonomy.inputContractRole,
      resultContractRole: taxonomy.resultContractRole,
      presenterRole: taxonomy.presenterRole,
      previewPolicy: taxonomy.previewPolicy,
      collectionPaths: Object.freeze([...lafeaCollectionPaths(definition.stageId)]),
    });
  }),
);

export function requireLafeaStageRegistryEntry(stageId) {
  if (!LAFEA_STAGE_IDS.includes(stageId)) {
    throw new TypeError(`Unsupported LAFEA stage identity: ${stageId}`);
  }
  const entry = LAFEA_STAGE_REGISTRY.find((row) => row.stageId === stageId);
  if (!entry) throw new TypeError(`LAFEA registry entry is missing for ${stageId}.`);
  return entry;
}

export function lafeaRegisteredExecutionSupported(stageId) {
  return requireLafeaStageRegistryEntry(stageId).engineState === 'QUALIFIED_ROUTE_REGISTERED';
}
