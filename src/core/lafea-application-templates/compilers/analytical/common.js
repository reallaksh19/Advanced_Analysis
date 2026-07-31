import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
} from '../../../shared-piping-model/index.js';
import {
  assertCurrentTemplateHandoff,
  assertExactKeys,
  createTemplateBoundaryDefinition,
  createTemplateGeometryResult,
  createTemplateHandoff,
  createTemplateLoadDefinition,
  asciiCompare,
} from '../../contracts.js';
import { LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH } from '../../bucket-registry.js';
import { validateTemplateParameters } from '../../parameter-validator.js';

export const LAFEA_TEMPLATE_COMPILATION_SCHEMA =
  'lafea-template-compilation/v1';

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

export function prepareParameterSet({
  parameterSchema,
  rawParameters,
  normalizeRawParameters,
}) {
  if (typeof normalizeRawParameters !== 'function') {
    throw new TypeError('normalizeRawParameters must be a function.');
  }
  const normalizedRaw = normalizeRawParameters(deepClone(rawParameters));
  const parameterSet = validateTemplateParameters(parameterSchema, normalizedRaw);
  if (parameterSet.status !== 'VALID') {
    throw new TypeError(
      `TEMPLATE_PARAMETERS_BLOCKED:${parameterSet.diagnostics.join('|')}`,
    );
  }
  return parameterSet;
}

export function parameterMap(parameterSet) {
  return new Map(parameterSet.values.map((value) => [value.parameterId, value]));
}

export function requiredParameter(byId, parameterId) {
  const record = byId.get(parameterId);
  if (!record || !['VALUE', 'EXPLICIT_ZERO'].includes(record.state)) {
    throw new TypeError(`Required compiled parameter is not available: ${parameterId}.`);
  }
  return record;
}

export function requiredRecord(byId, parameterId) {
  const record = requiredParameter(byId, parameterId);
  if (!isPlainRecord(record.value)) {
    throw new TypeError(`${parameterId} must be a JSON record.`);
  }
  return record.value;
}

export function requiredText(byId, parameterId) {
  const record = requiredParameter(byId, parameterId);
  if (typeof record.value !== 'string' || !record.value.trim()) {
    throw new TypeError(`${parameterId} must be non-empty text.`);
  }
  return record.value.trim();
}

export function parameterSourceStatus(byId, parameterIds) {
  const statuses = parameterIds.map((parameterId) => {
    const record = requiredParameter(byId, parameterId);
    return record.sourceStatus;
  });
  if (statuses.some((status) => status === null)) {
    throw new TypeError('Compiled parameters must retain source status.');
  }
  return statuses.sort((left, right) => statusRank(left) - statusRank(right))[0];
}

export function parameterSourceRefs(byId, parameterIds) {
  return parameterIds.map((parameterId) => requiredParameter(byId, parameterId).sourceRef)
    .filter((sourceRef) => sourceRef !== null)
    .map((sourceRef) => deepClone(sourceRef));
}

export function sourceRefRecord(sourceRef) {
  if (sourceRef === null || sourceRef === undefined) return null;
  if (isPlainRecord(sourceRef)) return deepClone(sourceRef);
  if (typeof sourceRef === 'string' && sourceRef) return { reference: sourceRef };
  throw new TypeError('Source reference must be a record or non-empty string.');
}

export function sourceRefRecords(values) {
  return values.map(sourceRefRecord).filter((value) => value !== null);
}

export function pipeCoordinateArtifacts(pipeCoordinateSystem) {
  assertExactKeys(
    pipeCoordinateSystem,
    ['axialDirection', 'circumferentialHint', 'identity', 'origin', 'radialHint'],
    'pipeCoordinateSystem',
  );
  const origin = evidenceVector(pipeCoordinateSystem.origin, 'pipeCoordinateSystem.origin');
  const axial = evidenceVector(
    pipeCoordinateSystem.axialDirection,
    'pipeCoordinateSystem.axialDirection',
  );
  const circumferential = evidenceVector(
    pipeCoordinateSystem.circumferentialHint,
    'pipeCoordinateSystem.circumferentialHint',
  );
  const radial = evidenceVector(
    pipeCoordinateSystem.radialHint,
    'pipeCoordinateSystem.radialHint',
  );
  return {
    identity: pipeCoordinateSystem.identity,
    origin: origin.value,
    axes: [axial.value, circumferential.value, radial.value],
    sourceRefs: sourceRefRecords([
      origin.sourceRef,
      axial.sourceRef,
      circumferential.sourceRef,
      radial.sourceRef,
    ]),
  };
}

export function unitRecords(units) {
  if (!isPlainRecord(units)) throw new TypeError('Canonical units must be a record.');
  const source = isPlainRecord(units.canonical) ? units.canonical : units;
  return Object.keys(source).sort(asciiCompare).map((dimension) => ({
    dimension,
    unit: source[dimension],
  }));
}

export function createGeometryArtifact({
  template,
  binding,
  parameterSet,
  coordinateSystem,
  features,
  localFrames,
  ancestry,
  units,
  status,
  diagnostics = [],
}) {
  return createTemplateGeometryResult({
    templateId: template.templateId,
    templateSemanticHash: template.semanticHash,
    parameterSetHash: parameterSet.semanticHash,
    parentRegistryHash: template.parentRegistryHash,
    compilerId: binding.geometryCompilerId,
    compilerVersion: binding.compilerVersion,
    coordinateSystem: {
      identity: coordinateSystem.identity,
      origin: coordinateSystem.origin,
      axes: coordinateSystem.axes,
      handedness: 'RIGHT_HANDED',
      sourceRef: coordinateSystem.sourceRef,
      status,
    },
    units,
    features,
    localFrames,
    ancestry,
    status: 'READY',
    diagnostics,
  });
}

export function createLoadArtifact({
  template,
  binding,
  parameterSet,
  geometry,
  loadCases,
  diagnostics = [],
}) {
  return createTemplateLoadDefinition({
    templateId: template.templateId,
    templateSemanticHash: template.semanticHash,
    parameterSetHash: parameterSet.semanticHash,
    parentGeometryHash: geometry.semanticHash,
    compilerId: binding.loadCompilerId,
    loadCases,
    status: 'READY',
    diagnostics,
  });
}

export function createNoBoundaryArtifact({
  template,
  binding,
  parameterSet,
  geometry,
  diagnostic,
}) {
  return createTemplateBoundaryDefinition({
    templateId: template.templateId,
    templateSemanticHash: template.semanticHash,
    parameterSetHash: parameterSet.semanticHash,
    parentGeometryHash: geometry.semanticHash,
    compilerId: binding.boundaryCompilerId,
    boundaryConditions: [],
    status: 'READY',
    diagnostics: [diagnostic],
  });
}

export function createHandoffArtifact({
  template,
  parameterSet,
  geometry,
  loads,
  boundaries,
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
    meshRequestHash: null,
    stageSource,
    status: 'READY',
    diagnostics,
  });
  return assertCurrentTemplateHandoff(handoff, {
    parentRegistryHash: LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
    templateSemanticHash: template.semanticHash,
  });
}

export function createCompilationResult({
  template,
  binding,
  parameterSchema,
  parameterSet,
  geometry,
  loads,
  boundaries,
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
    meshRequest: null,
    handoff,
    status: 'READY',
    diagnostics: [...new Set(diagnostics)].sort(asciiCompare),
  };
  assertExactKeys(base, [...COMPILATION_KEYS, 'schema'], 'Template compilation payload');
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function assertCompilerParents(template, binding, parameterSchema) {
  if (template.parentRegistryHash !== LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH) {
    throw staleError('STALE_TEMPLATE_REGISTRY_PARENT');
  }
  if (binding.parentRegistryHash !== LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH) {
    throw staleError('STALE_COMPILER_REGISTRY_PARENT');
  }
  if (binding.templateId !== template.templateId) {
    throw new TypeError('Compiler binding template identity mismatch.');
  }
  if (parameterSchema.templateId !== template.templateId) {
    throw new TypeError('Parameter schema template identity mismatch.');
  }
  if (binding.parameterSchemaId !== parameterSchema.parameterSchemaId) {
    throw new TypeError('Compiler binding parameter schema mismatch.');
  }
  if (binding.entryStageId !== template.entryStageId) {
    throw new TypeError('Compiler binding stage mismatch.');
  }
  if (binding.requiredEnginePackage !== template.requiredEnginePackage) {
    throw new TypeError('Compiler binding engine package mismatch.');
  }
  if (binding.requiredInputContractRole !== template.requiredInputContractRole) {
    throw new TypeError('Compiler binding input contract mismatch.');
  }
}

export function exactWrapper(record, keys, label) {
  assertExactKeys(record, keys, label);
  return record;
}

export function sortedBy(values, key) {
  if (!Array.isArray(values)) throw new TypeError(`${key} collection must be an array.`);
  return [...values].sort((left, right) => asciiCompare(left[key], right[key]));
}

export function sortedStrings(values, label) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || !value)) {
    throw new TypeError(`${label} must contain non-empty strings.`);
  }
  return [...new Set(values)].sort(asciiCompare);
}

export function deepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function evidenceVector(record, label) {
  assertExactKeys(record, ['sourceRef', 'value'], label);
  if (!Array.isArray(record.value) || record.value.length !== 3) {
    throw new TypeError(`${label}.value must contain three components.`);
  }
  const value = record.value.map((component) => {
    if (typeof component !== 'number' || !Number.isFinite(component)) {
      throw new TypeError(`${label}.value must contain finite numbers.`);
    }
    return Object.is(component, -0) ? 0 : component;
  });
  if (typeof record.sourceRef !== 'string' || !record.sourceRef) {
    throw new TypeError(`${label}.sourceRef must be a non-empty string.`);
  }
  return { value, sourceRef: record.sourceRef };
}

function statusRank(status) {
  const order = {
    DECLARED: 0,
    IMPORTED: 1,
    VERIFIED: 2,
    ASSUMED: -1,
    UNRESOLVED: -2,
  };
  if (!Object.hasOwn(order, status)) throw new TypeError(`Unsupported source status: ${status}.`);
  return order[status];
}

function staleError(code) {
  const error = new TypeError(code);
  error.code = code;
  return error;
}
