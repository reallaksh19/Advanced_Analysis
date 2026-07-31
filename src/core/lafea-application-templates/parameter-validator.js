import {
  deepFreeze,
  isPlainRecord,
} from '../shared-piping-model/index.js';
import {
  LAFEA_TEMPLATE_PARAMETER_VALUE_KINDS,
  LAFEA_TEMPLATE_SOURCE_STATUSES,
  assertExactKeys,
  createTemplateParameterSet,
  validateTemplateParameterSchema,
} from './contracts.js';

const RAW_PARAMETER_VALUE_KEYS = Object.freeze([
  'sourceRef',
  'sourceStatus',
  'unit',
  'value',
]);

const DECIMAL_PATTERN =
  /^[+-]?(?:(?:0|[1-9][0-9]*)(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/u;

export function validateTemplateParameters(parameterSchema, rawParameters) {
  const schemaValidation = validateTemplateParameterSchema(parameterSchema);
  if (!schemaValidation.ok) {
    throw new TypeError(schemaValidation.errors.join(' '));
  }
  if (!isPlainRecord(rawParameters)) {
    throw new TypeError('Template parameter input must be a plain object.');
  }

  const diagnostics = [];
  const descriptors = parameterSchema.parameters;
  const descriptorIds = new Set(descriptors.map((descriptor) => descriptor.parameterId));

  Object.keys(rawParameters).forEach((parameterId) => {
    if (!descriptorIds.has(parameterId)) {
      diagnostics.push(`UNKNOWN_PARAMETER:${parameterId}`);
    }
  });

  const values = descriptors.map((descriptor) => normalizeParameter(
    descriptor,
    rawParameters,
    diagnostics,
  ));

  const byId = new Map(values.map((value) => [value.parameterId, value]));
  descriptors.forEach((descriptor) => {
    const current = byId.get(descriptor.parameterId);
    if (!current || ['MISSING', 'EMPTY_TEXT', 'INVALID'].includes(current.state)) return;
    descriptor.dependencies.forEach((dependencyId) => {
      const dependency = byId.get(dependencyId);
      if (
        !dependency
        || ['MISSING', 'EMPTY_TEXT', 'INVALID', 'PRESENT_NULL'].includes(dependency.state)
      ) {
        diagnostics.push(
          `DEPENDENCY_NOT_READY:${descriptor.parameterId}:${dependencyId}`,
        );
      }
    });
  });

  const sortedDiagnostics = [...new Set(diagnostics)].sort(asciiCompare);
  return createTemplateParameterSet({
    parameterSchemaId: parameterSchema.parameterSchemaId,
    templateId: parameterSchema.templateId,
    values,
    status: sortedDiagnostics.length ? 'BLOCKED' : 'VALID',
    diagnostics: sortedDiagnostics,
  });
}

function normalizeParameter(descriptor, rawParameters, diagnostics) {
  const parameterId = descriptor.parameterId;
  if (!Object.hasOwn(rawParameters, parameterId)) {
    if (descriptor.required) diagnostics.push(`MISSING_REQUIRED_PARAMETER:${parameterId}`);
    return valueRecord(parameterId, 'MISSING', null, null, null, null);
  }

  const rawEnvelope = rawParameters[parameterId];
  if (!isPlainRecord(rawEnvelope)) {
    diagnostics.push(`INVALID_PARAMETER_ENVELOPE:${parameterId}`);
    return valueRecord(parameterId, 'INVALID', null, null, null, null);
  }

  try {
    assertExactKeys(
      rawEnvelope,
      RAW_PARAMETER_VALUE_KEYS,
      `Parameter envelope ${parameterId}`,
    );
  } catch {
    diagnostics.push(`INVALID_PARAMETER_ENVELOPE_KEYS:${parameterId}`);
    return valueRecord(parameterId, 'INVALID', null, null, null, null);
  }

  const unit = normalizeUnit(descriptor, rawEnvelope.unit, parameterId, diagnostics);
  const sourceRef = normalizeSourceRef(rawEnvelope.sourceRef, parameterId, diagnostics);
  const sourceStatus = normalizeSourceStatus(
    rawEnvelope.sourceStatus,
    parameterId,
    diagnostics,
  );

  if (descriptor.sourceRequired) {
    if (sourceRef === null) diagnostics.push(`SOURCE_REF_REQUIRED:${parameterId}`);
    if (sourceStatus === null || ['ASSUMED', 'UNRESOLVED'].includes(sourceStatus)) {
      diagnostics.push(`SOURCE_STATUS_NOT_AUTHORIZED:${parameterId}`);
    }
  }

  if (rawEnvelope.value === null) {
    if (!descriptor.nullable) diagnostics.push(`NULL_NOT_ALLOWED:${parameterId}`);
    return valueRecord(
      parameterId,
      'PRESENT_NULL',
      null,
      unit,
      sourceRef,
      sourceStatus,
    );
  }

  const parsed = parseByKind(descriptor, rawEnvelope.value);
  if (parsed.state === 'EMPTY_TEXT') {
    diagnostics.push(`EMPTY_TEXT:${parameterId}`);
  } else if (parsed.state === 'INVALID') {
    diagnostics.push(`INVALID_VALUE:${parameterId}`);
  } else if (descriptor.valueKind === 'FINITE_NUMBER') {
    if (descriptor.minimum !== null && parsed.value < descriptor.minimum) {
      diagnostics.push(`BELOW_MINIMUM:${parameterId}`);
    }
    if (descriptor.maximum !== null && parsed.value > descriptor.maximum) {
      diagnostics.push(`ABOVE_MAXIMUM:${parameterId}`);
    }
  }

  return valueRecord(
    parameterId,
    parsed.state,
    parsed.value,
    unit,
    sourceRef,
    sourceStatus,
  );
}

function parseByKind(descriptor, rawValue) {
  if (!LAFEA_TEMPLATE_PARAMETER_VALUE_KINDS.includes(descriptor.valueKind)) {
    return { state: 'INVALID', value: null };
  }
  if (descriptor.valueKind === 'FINITE_NUMBER') return parseFiniteNumber(rawValue);
  if (descriptor.valueKind === 'TEXT') {
    if (typeof rawValue !== 'string') return { state: 'INVALID', value: null };
    if (!rawValue.trim()) return { state: 'EMPTY_TEXT', value: null };
    return { state: 'VALUE', value: rawValue };
  }
  if (descriptor.valueKind === 'BOOLEAN') {
    return typeof rawValue === 'boolean'
      ? { state: 'VALUE', value: rawValue }
      : { state: 'INVALID', value: null };
  }
  if (descriptor.valueKind === 'ENUM') {
    return typeof rawValue === 'string' && descriptor.enumValues.includes(rawValue)
      ? { state: 'VALUE', value: rawValue }
      : { state: 'INVALID', value: null };
  }
  if (descriptor.valueKind === 'JSON_RECORD') {
    return isPlainRecord(rawValue)
      ? { state: 'VALUE', value: rawValue }
      : { state: 'INVALID', value: null };
  }
  return { state: 'INVALID', value: null };
}

function parseFiniteNumber(rawValue) {
  if (typeof rawValue === 'number') {
    if (!Number.isFinite(rawValue)) return { state: 'INVALID', value: null };
    const value = Object.is(rawValue, -0) ? 0 : rawValue;
    return value === 0
      ? { state: 'EXPLICIT_ZERO', value: 0 }
      : { state: 'VALUE', value };
  }

  if (typeof rawValue !== 'string') return { state: 'INVALID', value: null };
  if (!rawValue.trim()) return { state: 'EMPTY_TEXT', value: null };
  const token = rawValue.trim();
  if (!DECIMAL_PATTERN.test(token)) return { state: 'INVALID', value: null };
  const value = Number(token);
  if (!Number.isFinite(value)) return { state: 'INVALID', value: null };
  return value === 0
    ? { state: 'EXPLICIT_ZERO', value: 0 }
    : { state: 'VALUE', value };
}

function normalizeUnit(descriptor, rawUnit, parameterId, diagnostics) {
  if (descriptor.canonicalUnit === null) {
    if (rawUnit !== null) diagnostics.push(`UNEXPECTED_UNIT:${parameterId}`);
    return rawUnit === null ? null : safeText(rawUnit);
  }

  if (typeof rawUnit !== 'string' || !rawUnit.trim()) {
    diagnostics.push(`UNIT_REQUIRED:${parameterId}`);
    return null;
  }

  const unit = rawUnit.trim();
  if (!descriptor.allowedUnits.includes(unit)) {
    diagnostics.push(`UNIT_NOT_ALLOWED:${parameterId}:${unit}`);
    return unit;
  }
  if (unit !== descriptor.canonicalUnit) {
    diagnostics.push(`UNIT_CONVERSION_NOT_IMPLEMENTED:${parameterId}:${unit}`);
  }
  return unit;
}

function normalizeSourceRef(rawSourceRef, parameterId, diagnostics) {
  if (rawSourceRef === null) return null;
  if (!isPlainRecord(rawSourceRef)) {
    diagnostics.push(`INVALID_SOURCE_REF:${parameterId}`);
    return null;
  }
  return rawSourceRef;
}

function normalizeSourceStatus(rawStatus, parameterId, diagnostics) {
  if (rawStatus === null) return null;
  if (!LAFEA_TEMPLATE_SOURCE_STATUSES.includes(rawStatus)) {
    diagnostics.push(`INVALID_SOURCE_STATUS:${parameterId}`);
    return null;
  }
  return rawStatus;
}

function valueRecord(parameterId, state, value, unit, sourceRef, sourceStatus) {
  return deepFreeze({
    parameterId,
    state,
    value,
    unit,
    sourceRef,
    sourceStatus,
  });
}

function safeText(value) {
  return typeof value === 'string' ? value.trim() : null;
}

function asciiCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
