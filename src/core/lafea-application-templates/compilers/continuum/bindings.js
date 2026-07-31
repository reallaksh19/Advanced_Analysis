import { deepFreeze, semanticHash } from '../../../shared-piping-model/index.js';
import { asciiCompare, assertExactKeys } from '../../contracts.js';
import { LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH } from '../../bucket-registry.js';
import { requireLafeaApplicationTemplate } from '../../template-registry.js';
import {
  LAFEA_T4_CONTINUUM_TEMPLATE_IDS,
  requireT4ContinuumParameterSchema,
} from '../../parameter-schemas/continuum.js';

export const LAFEA_T4_CONTINUUM_COMPILER_BINDING_SCHEMA =
  'lafea-template-continuum-compiler-binding/v1';

const BINDING_KEYS = Object.freeze([
  'allowedFormulations',
  'boundaryCompilerId',
  'compilerVersion',
  'entryStageId',
  'geometryCompilerId',
  'limitations',
  'loadCompilerId',
  'meshRequestCompilerId',
  'parameterSchemaId',
  'parentRegistryHash',
  'requiredEnginePackage',
  'requiredInputContractRole',
  'status',
  'templateId',
]);

const TEMPLATE_FORMULATIONS = deepFreeze({
  'C2D-BRACKET-GUSSET': ['PLANE_STRESS'],
  'C2D-CLAMP-EAR': ['PLANE_STRESS'],
  'C2D-LUG-PINHOLE': ['PLANE_STRESS'],
  'C2D-NOZZLE-REPAD-SECTION': ['PLANE_STRAIN', 'PLANE_STRESS'],
  'C2D-PIPE-PAD-SECTION': ['PLANE_STRAIN', 'PLANE_STRESS'],
});

export const LAFEA_T4_CONTINUUM_COMPILER_BINDINGS = Object.freeze(
  LAFEA_T4_CONTINUUM_TEMPLATE_IDS.map((templateId) => binding({
    templateId,
    allowedFormulations: TEMPLATE_FORMULATIONS[templateId],
    geometryCompilerId: `${templateId.toLowerCase()}-continuum-geometry-intake/v1`,
    loadCompilerId: `${templateId.toLowerCase()}-continuum-load-intake/v1`,
    boundaryCompilerId: `${templateId.toLowerCase()}-continuum-boundary-intake/v1`,
    meshRequestCompilerId: `${templateId.toLowerCase()}-continuum-mesh-request-intake/v1`,
    limitations: [
      'Caller-supplied LAFEA.3 source validation only; the template compiler does not generate a mesh.',
      'The compiler does not execute the local-continuum engine.',
      'T3 fallback elements and axisymmetric formulations are not accepted by this binding.',
    ],
  })).sort((left, right) => asciiCompare(left.templateId, right.templateId)),
);

export function requireT4ContinuumCompilerBinding(templateId) {
  const result = LAFEA_T4_CONTINUUM_COMPILER_BINDINGS
    .find((entry) => entry.templateId === templateId);
  if (!result) {
    throw new TypeError(`Unsupported T4 continuum compiler binding: ${templateId}.`);
  }
  return result;
}

export function validateT4ContinuumCompilerBinding(value) {
  const errors = [];
  try {
    assertExactKeys(
      value,
      [...BINDING_KEYS, 'schema', 'semanticHash'],
      'Continuum compiler binding',
    );
    if (value.schema !== LAFEA_T4_CONTINUUM_COMPILER_BINDING_SCHEMA) {
      throw new TypeError('Continuum compiler binding schema is invalid.');
    }
    const { schema: ignoredSchema, semanticHash: ignoredHash, ...input } = value;
    void ignoredSchema;
    void ignoredHash;
    const expected = binding(input);
    if (value.semanticHash !== expected.semanticHash) {
      throw new TypeError('Continuum compiler binding hash is invalid.');
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function binding({
  templateId,
  allowedFormulations,
  geometryCompilerId,
  loadCompilerId,
  boundaryCompilerId,
  meshRequestCompilerId,
  limitations,
  compilerVersion = '1',
  status = 'DRAFT',
  parameterSchemaId = null,
  entryStageId = null,
  requiredEnginePackage = null,
  requiredInputContractRole = null,
  parentRegistryHash = LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
}) {
  const input = {
    templateId,
    parameterSchemaId,
    geometryCompilerId,
    loadCompilerId,
    boundaryCompilerId,
    meshRequestCompilerId,
    compilerVersion,
    entryStageId,
    requiredEnginePackage,
    requiredInputContractRole,
    parentRegistryHash,
    allowedFormulations,
    status,
    limitations,
  };
  assertExactKeys(input, BINDING_KEYS, 'Continuum compiler binding input');

  const template = requireLafeaApplicationTemplate(templateId);
  const schema = requireT4ContinuumParameterSchema(templateId);
  const base = {
    schema: LAFEA_T4_CONTINUUM_COMPILER_BINDING_SCHEMA,
    templateId,
    parameterSchemaId: parameterSchemaId ?? schema.parameterSchemaId,
    geometryCompilerId: text(geometryCompilerId, 'geometryCompilerId'),
    loadCompilerId: text(loadCompilerId, 'loadCompilerId'),
    boundaryCompilerId: text(boundaryCompilerId, 'boundaryCompilerId'),
    meshRequestCompilerId: text(meshRequestCompilerId, 'meshRequestCompilerId'),
    compilerVersion: text(compilerVersion, 'compilerVersion'),
    entryStageId: entryStageId ?? template.entryStageId,
    requiredEnginePackage: requiredEnginePackage ?? template.requiredEnginePackage,
    requiredInputContractRole:
      requiredInputContractRole ?? template.requiredInputContractRole,
    parentRegistryHash,
    allowedFormulations: sortedUnique(allowedFormulations, 'allowedFormulations'),
    status,
    limitations: sortedUnique(limitations, 'limitations'),
  };

  if (base.parameterSchemaId !== template.parameterSchemaId) {
    throw new TypeError('Continuum compiler binding parameter schema does not match template authority.');
  }
  if (base.entryStageId !== 'LAFEA.3' || base.entryStageId !== template.entryStageId) {
    throw new TypeError('Continuum compiler binding must use the registered LAFEA.3 entry stage.');
  }
  if (base.requiredEnginePackage !== template.requiredEnginePackage) {
    throw new TypeError('Continuum compiler binding cannot override the registered engine package.');
  }
  if (base.requiredInputContractRole !== template.requiredInputContractRole) {
    throw new TypeError('Continuum compiler binding cannot override the registered input contract role.');
  }
  if (base.parentRegistryHash !== LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH) {
    throw new TypeError('Continuum compiler binding registry parent is stale.');
  }
  if (base.status !== 'DRAFT') {
    throw new TypeError('T4 continuum compiler bindings must remain DRAFT.');
  }
  if (
    base.allowedFormulations.length === 0
    || base.allowedFormulations.some((value) => !['PLANE_STRAIN', 'PLANE_STRESS'].includes(value))
  ) {
    throw new TypeError('T4 continuum bindings may declare only registered planar formulations.');
  }
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function sortedUnique(values, field) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || !value)) {
    throw new TypeError(`${field} must contain non-empty strings.`);
  }
  return [...new Set(values)].sort(asciiCompare);
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
  return value.trim();
}
