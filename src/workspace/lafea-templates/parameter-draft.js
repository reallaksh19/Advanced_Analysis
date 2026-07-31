import {
  deepFreeze,
  semanticHash,
} from '../../core/shared-piping-model/index.js';
import {
  LAFEA_TEMPLATE_SOURCE_STATUSES,
  validateTemplateParameterSchema,
} from '../../core/lafea-application-templates/contracts.js';
import { validateTemplateParameters } from '../../core/lafea-application-templates/parameter-validator.js';

export const LAFEA_TEMPLATE_PARAMETER_DRAFT_SCHEMA =
  'lafea-template-parameter-draft/v1';
export const LAFEA_TEMPLATE_PARAMETER_DRAFT_VALIDATION_SCHEMA =
  'lafea-template-parameter-draft-validation/v1';

const DRAFT_KEYS = Object.freeze([
  'fields',
  'parameterSchemaId',
  'schema',
  'semanticHash',
  'templateId',
]);
const DRAFT_FIELD_KEYS = Object.freeze([
  'parameterId',
  'present',
  'sourceRefInput',
  'sourceStatus',
  'unit',
  'valueInput',
  'valueKind',
]);
const DRAFT_UPDATE_KEYS = Object.freeze([
  'present',
  'sourceRefInput',
  'sourceStatus',
  'unit',
  'valueInput',
]);

export function createLafeaTemplateParameterDraft(parameterSchema) {
  requireParameterSchema(parameterSchema);
  return finalizeDraft(parameterSchema, parameterSchema.parameters.map((descriptor) => ({
    parameterId: descriptor.parameterId,
    valueKind: descriptor.valueKind,
    present: false,
    valueInput: '',
    unit: descriptor.canonicalUnit,
    sourceRefInput: '',
    sourceStatus: null,
  })));
}

export function updateLafeaTemplateParameterDraft(
  parameterSchema,
  draft,
  parameterId,
  patch,
) {
  requireParameterSchema(parameterSchema);
  requireMatchingDraft(parameterSchema, draft);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new TypeError('Template parameter draft patch must be a record.');
  }
  rejectUnknownKeys(patch, DRAFT_UPDATE_KEYS, 'Template parameter draft patch');
  const descriptor = parameterSchema.parameters.find(
    (item) => item.parameterId === parameterId,
  );
  if (!descriptor) throw new TypeError(`Unknown template parameter: ${parameterId}.`);

  const fields = draft.fields.map((field) => {
    if (field.parameterId !== parameterId) return field;
    const next = {
      ...field,
      ...patch,
      present: patch.present ?? true,
    };
    validateDraftField(next, descriptor);
    return next;
  });
  return finalizeDraft(parameterSchema, fields);
}

export function clearLafeaTemplateParameterDraft(parameterSchema) {
  return createLafeaTemplateParameterDraft(parameterSchema);
}

export function createLafeaRawParametersFromDraft(parameterSchema, draft) {
  requireParameterSchema(parameterSchema);
  requireMatchingDraft(parameterSchema, draft);
  const rawParameters = {};
  for (const descriptor of parameterSchema.parameters) {
    const field = draft.fields.find((item) => item.parameterId === descriptor.parameterId);
    if (!field.present) continue;
    rawParameters[descriptor.parameterId] = {
      value: parseValue(descriptor, field.valueInput),
      unit: field.unit,
      sourceRef: parseSourceRef(field.sourceRefInput),
      sourceStatus: field.sourceStatus,
    };
  }
  return rawParameters;
}

export function validateLafeaTemplateParameterDraft(parameterSchema, draft) {
  const rawParameters = createLafeaRawParametersFromDraft(parameterSchema, draft);
  const parameterSet = validateTemplateParameters(parameterSchema, rawParameters);
  const base = {
    schema: LAFEA_TEMPLATE_PARAMETER_DRAFT_VALIDATION_SCHEMA,
    templateId: parameterSchema.templateId,
    parameterSchemaId: parameterSchema.parameterSchemaId,
    draftSemanticHash: draft.semanticHash,
    parameterSet,
    status: parameterSet.status,
    diagnostics: parameterSet.diagnostics,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function finalizeDraft(parameterSchema, fields) {
  const normalizedFields = fields.map((field) => {
    const descriptor = parameterSchema.parameters.find(
      (item) => item.parameterId === field.parameterId,
    );
    validateDraftField(field, descriptor);
    return { ...field };
  }).sort((left, right) => asciiCompare(left.parameterId, right.parameterId));
  const base = {
    schema: LAFEA_TEMPLATE_PARAMETER_DRAFT_SCHEMA,
    templateId: parameterSchema.templateId,
    parameterSchemaId: parameterSchema.parameterSchemaId,
    fields: normalizedFields,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function requireParameterSchema(parameterSchema) {
  const result = validateTemplateParameterSchema(parameterSchema);
  if (!result.ok) {
    throw new TypeError(`Template parameter schema is invalid: ${result.errors.join(' ')}`);
  }
}

function requireMatchingDraft(parameterSchema, draft) {
  requireExactKeys(draft, DRAFT_KEYS, 'Template parameter draft');
  if (draft.schema !== LAFEA_TEMPLATE_PARAMETER_DRAFT_SCHEMA) {
    throw new TypeError('Template parameter draft schema is invalid.');
  }
  if (
    draft.templateId !== parameterSchema.templateId
    || draft.parameterSchemaId !== parameterSchema.parameterSchemaId
  ) {
    throw new TypeError('Template parameter draft does not match the parameter schema.');
  }
  if (!Array.isArray(draft.fields)) {
    throw new TypeError('Template parameter draft fields are required.');
  }
  const expected = parameterSchema.parameters.map((item) => item.parameterId).sort(asciiCompare);
  const actual = draft.fields.map((item) => item.parameterId).sort(asciiCompare);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new TypeError('Template parameter draft field identities are invalid.');
  }
  for (const descriptor of parameterSchema.parameters) {
    const field = draft.fields.find((item) => item.parameterId === descriptor.parameterId);
    validateDraftField(field, descriptor);
  }
  const { semanticHash: declared, ...base } = draft;
  if (declared !== semanticHash(base)) {
    throw new TypeError('Template parameter draft semantic hash is invalid.');
  }
  if (!Object.isFrozen(draft) || !Object.isFrozen(draft.fields)) {
    throw new TypeError('Template parameter draft must be frozen.');
  }
}

function validateDraftField(field, descriptor) {
  if (!descriptor) throw new TypeError('Template parameter descriptor is required.');
  requireExactKeys(field, DRAFT_FIELD_KEYS, `Template parameter draft ${descriptor.parameterId}`);
  if (field.parameterId !== descriptor.parameterId) {
    throw new TypeError('Template parameter draft identity is invalid.');
  }
  if (field.valueKind !== descriptor.valueKind) {
    throw new TypeError(`Template parameter draft kind is invalid: ${descriptor.parameterId}.`);
  }
  if (typeof field.present !== 'boolean') {
    throw new TypeError(`Template parameter draft present flag is invalid: ${descriptor.parameterId}.`);
  }
  if (typeof field.valueInput !== 'string') {
    throw new TypeError(`Template parameter draft value input is invalid: ${descriptor.parameterId}.`);
  }
  if (typeof field.sourceRefInput !== 'string') {
    throw new TypeError(`Template parameter draft source input is invalid: ${descriptor.parameterId}.`);
  }
  if (
    field.sourceStatus !== null
    && !LAFEA_TEMPLATE_SOURCE_STATUSES.includes(field.sourceStatus)
  ) {
    throw new TypeError(`Template parameter draft source status is invalid: ${descriptor.parameterId}.`);
  }
  if (field.unit !== null && typeof field.unit !== 'string') {
    throw new TypeError(`Template parameter draft unit is invalid: ${descriptor.parameterId}.`);
  }
}

function parseValue(descriptor, valueInput) {
  if (descriptor.valueKind === 'BOOLEAN') {
    if (valueInput === 'true') return true;
    if (valueInput === 'false') return false;
    return valueInput;
  }
  if (descriptor.valueKind === 'JSON_RECORD') {
    try {
      return JSON.parse(valueInput);
    } catch {
      return valueInput;
    }
  }
  return valueInput;
}

function parseSourceRef(sourceRefInput) {
  if (!sourceRefInput.trim()) return null;
  try {
    return JSON.parse(sourceRefInput);
  } catch {
    return sourceRefInput;
  }
}

function requireExactKeys(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a record.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} keys are invalid.`);
  }
}

function rejectUnknownKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw new TypeError(`${label} contains unknown keys: ${unknown.sort().join(', ')}.`);
  }
}

function asciiCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
