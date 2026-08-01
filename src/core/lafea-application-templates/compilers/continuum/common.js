import { deepFreeze, semanticHash } from '../../../shared-piping-model/index.js';
import {
  asciiCompare,
  assertCurrentTemplateHandoff,
  assertExactKeys,
  createTemplateBoundaryDefinition,
  createTemplateHandoff,
  createTemplateMeshRequest,
} from '../../contracts.js';
import { LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH } from '../../bucket-registry.js';
import { LAFEA_TEMPLATE_COMPILATION_SCHEMA } from '../analytical/common.js';

export {
  createGeometryArtifact,
  createLoadArtifact,
  deepClone,
  parameterMap,
  parameterSourceRefs,
  parameterSourceStatus,
  prepareParameterSet,
  requiredRecord,
  sourceRefRecord,
  sourceRefRecords,
  unitRecords,
} from '../analytical/common.js';

const COMPILATION_KEYS = Object.freeze([
  'boundaryDefinition',
  'compilerBindingHash',
  'diagnostics',
  'geometry',
  'handoff',
  'loadDefinition',
  'meshRequest',
  'parameterSchemaId',
  'parameterSet',
  'status',
  'templateId',
  'templateSemanticHash',
]);

export function assertContinuumCompilerParents(template, binding, parameterSchema) {
  if (template.parentRegistryHash !== LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH) {
    throw staleError('STALE_TEMPLATE_REGISTRY_PARENT');
  }
  if (binding.parentRegistryHash !== LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH) {
    throw staleError('STALE_COMPILER_REGISTRY_PARENT');
  }
  if (binding.templateId !== template.templateId) {
    throw new TypeError('Continuum compiler binding template identity mismatch.');
  }
  if (parameterSchema.templateId !== template.templateId) {
    throw new TypeError('Continuum parameter schema template identity mismatch.');
  }
  if (binding.parameterSchemaId !== parameterSchema.parameterSchemaId) {
    throw new TypeError('Continuum compiler binding parameter schema mismatch.');
  }
  if (binding.entryStageId !== template.entryStageId || binding.entryStageId !== 'LAFEA.3') {
    throw new TypeError('Continuum compiler binding stage mismatch.');
  }
  if (binding.requiredEnginePackage !== template.requiredEnginePackage) {
    throw new TypeError('Continuum compiler binding engine package mismatch.');
  }
  if (binding.requiredInputContractRole !== template.requiredInputContractRole) {
    throw new TypeError('Continuum compiler binding input contract mismatch.');
  }
}

export function createContinuumBoundaryArtifact({
  template,
  binding,
  parameterSet,
  geometry,
  boundaryConditions,
  diagnostics = [],
}) {
  return createTemplateBoundaryDefinition({
    templateId: template.templateId,
    templateSemanticHash: template.semanticHash,
    parameterSetHash: parameterSet.semanticHash,
    parentGeometryHash: geometry.semanticHash,
    compilerId: binding.boundaryCompilerId,
    boundaryConditions,
    status: 'READY',
    diagnostics,
  });
}

export function createContinuumMeshRequestArtifact({
  template,
  binding,
  geometry,
  meshProvenance,
  featureSizing,
  diagnostics = [],
}) {
  return createTemplateMeshRequest({
    templateId: template.templateId,
    templateSemanticHash: template.semanticHash,
    parentGeometryHash: geometry.semanticHash,
    bucketId: template.bucketId,
    entryStageId: template.entryStageId,
    formulationProfileId: meshProvenance.formulationProfileId,
    meshProfileId: meshProvenance.meshProfileId,
    qualityProfileId: meshProvenance.qualityProfileId,
    featureSizing,
    status: 'READY',
    diagnostics: [
      `MESH_REQUEST_COMPILER:${binding.meshRequestCompilerId}`,
      ...diagnostics,
    ],
  });
}

export function createContinuumHandoffArtifact({
  template,
  parameterSet,
  geometry,
  loads,
  boundaries,
  meshRequest,
  stageSource,
  diagnostics = [],
}) {
  const handoff = createTemplateHandoff({
    templateId: template.templateId,
    templateSemanticHash: template.semanticHash,
    parentRegistryHash: template.parentRegistryHash,
    entryStageId: template.entryStageId,
    requiredEnginePackage: template.requiredEnginePackage,
    requiredInputContractRole: template.requiredInputContractRole,
    parameterSetHash: parameterSet.semanticHash,
    geometryHash: geometry.semanticHash,
    loadDefinitionHash: loads.semanticHash,
    boundaryDefinitionHash: boundaries.semanticHash,
    meshRequestHash: meshRequest.semanticHash,
    stageSource,
    status: 'READY',
    diagnostics,
  });
  return assertCurrentTemplateHandoff(handoff, {
    parentRegistryHash: LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
    templateSemanticHash: template.semanticHash,
  });
}

export function createContinuumCompilationResult({
  template,
  binding,
  parameterSchema,
  parameterSet,
  geometry,
  loads,
  boundaries,
  meshRequest,
  handoff,
  diagnostics = [],
}) {
  const base = {
    schema: LAFEA_TEMPLATE_COMPILATION_SCHEMA,
    templateId: template.templateId,
    templateSemanticHash: template.semanticHash,
    parameterSchemaId: parameterSchema.parameterSchemaId,
    compilerBindingHash: binding.semanticHash,
    parameterSet,
    geometry,
    loadDefinition: loads,
    boundaryDefinition: boundaries,
    meshRequest,
    handoff,
    status: 'READY',
    diagnostics: [...new Set(diagnostics)].sort(asciiCompare),
  };
  assertExactKeys(base, [...COMPILATION_KEYS, 'schema'], 'Continuum template compilation payload');
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function exactRecord(value, keys, label) {
  assertExactKeys(value, keys, label);
  return value;
}

export function sortedUniqueStrings(values, label) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || !value)) {
    throw new TypeError(`${label} must contain non-empty strings.`);
  }
  return [...new Set(values)].sort(asciiCompare);
}

export function sortedRecords(values, identityKey, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array.`);
  return [...values].sort((left, right) => asciiCompare(left?.[identityKey], right?.[identityKey]));
}

function staleError(code) {
  const error = new TypeError(code);
  error.code = code;
  return error;
}
