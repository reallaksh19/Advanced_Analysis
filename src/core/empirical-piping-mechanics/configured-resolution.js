import { deepFreeze, requireNonEmptyString } from './contracts.js';
import { semanticHash } from './identity.js';

export const EMPIRICAL_RESOLUTION_SCHEMA = 'empirical-configured-resolution-receipt/v1';

export const RESOLUTION_KINDS = Object.freeze({
  SOURCE_EXPLICIT: 'SOURCE_EXPLICIT',
  SOURCE_INHERITED: 'SOURCE_INHERITED',
  CONFIGURED_DERIVATION: 'CONFIGURED_DERIVATION',
  PROJECT_CONFIGURED_DEFAULT: 'PROJECT_CONFIGURED_DEFAULT',
});

export const RESOLUTION_STATUSES = Object.freeze({
  RESOLVED: 'RESOLVED',
  BLOCKED_MISSING_REQUIRED_INPUT: 'BLOCKED_MISSING_REQUIRED_INPUT',
  BLOCKED_INVALID_HIGHER_AUTHORITY: 'BLOCKED_INVALID_HIGHER_AUTHORITY',
  BLOCKED_DEFAULT_OUTSIDE_SCOPE: 'BLOCKED_DEFAULT_OUTSIDE_SCOPE',
  BLOCKED_CONFLICTING_CONFIGURED_DEFAULTS: 'BLOCKED_CONFLICTING_CONFIGURED_DEFAULTS',
  BLOCKED_UNSCOPED_SCHEDULE_DEFAULT: 'BLOCKED_UNSCOPED_SCHEDULE_DEFAULT',
});

const PRECEDENCE = Object.freeze([
  RESOLUTION_KINDS.SOURCE_EXPLICIT,
  RESOLUTION_KINDS.SOURCE_INHERITED,
  RESOLUTION_KINDS.CONFIGURED_DERIVATION,
]);

const SCHEDULE_SCOPE_FIELDS = Object.freeze(['lineId', 'branchPath', 'nominalBoreMm']);

/**
 * Creates a deterministic resolution session. Missing values never receive an
 * implicit zero, unity, schedule, material, gap, stiffness, or friction value.
 */
export function createConfiguredResolutionSession(input = {}) {
  const projectDataRevision = requireNonNegativeInteger(
    input.projectDataRevision ?? 0,
    'projectDataRevision',
  );
  const projectDataSemanticHash = input.projectDataSemanticHash == null
    ? null
    : requireNonEmptyString(input.projectDataSemanticHash, 'projectDataSemanticHash');
  const defaults = normalizeDefaults(input.defaults ?? []);
  const usages = [];
  const resolutions = [];
  const blockers = [];

  function resolve(request) {
    const field = requireNonEmptyString(request?.field, 'request.field');
    const entity = normalizeEntity(request?.entity ?? {});
    const validate = typeof request?.validate === 'function' ? request.validate : defaultValidator;
    const candidates = normalizeCandidates(request?.candidates ?? []);

    for (const kind of PRECEDENCE) {
      const candidatesAtKind = candidates.filter((candidate) => candidate.kind === kind);
      if (candidatesAtKind.length === 0) continue;
      if (candidatesAtKind.length > 1) {
        return recordBlocker(blockedResolution({
          field,
          entity,
          status: RESOLUTION_STATUSES.BLOCKED_INVALID_HIGHER_AUTHORITY,
          message: `Multiple ${kind} candidates were supplied for ${field}.`,
          diagnostics: candidatesAtKind.map((candidate) => candidate.sourcePath || candidate.authority || 'UNIDENTIFIED_SOURCE'),
        }));
      }
      const candidate = candidatesAtKind[0];
      if (!hasDeclaredValue(candidate.value)) continue;
      const validation = evaluateValidation(validate, candidate.value, candidate);
      if (!validation.valid) {
        return recordBlocker(blockedResolution({
          field,
          entity,
          status: RESOLUTION_STATUSES.BLOCKED_INVALID_HIGHER_AUTHORITY,
          message: validation.message || `Invalid ${kind} value for ${field}.`,
          diagnostics: [candidate.sourcePath || candidate.authority || 'UNIDENTIFIED_SOURCE'],
        }));
      }
      return recordResolution(resolvedValue({
        field,
        entity,
        kind,
        value: candidate.value,
        unit: candidate.unit ?? request.unit ?? null,
        authority: candidate.authority ?? null,
        sourcePath: candidate.sourcePath ?? null,
        reason: candidate.reason ?? null,
        affectedCalculations: request.affectedCalculations ?? [],
      }));
    }

    const matching = findMatchingDefaults(defaults, field, entity.scope);
    if (matching.status !== RESOLUTION_STATUSES.RESOLVED) {
      return recordBlocker(blockedResolution({
        field,
        entity,
        status: matching.status,
        message: matching.message,
        diagnostics: matching.diagnostics,
      }));
    }
    if (!matching.defaultRecord) {
      return recordBlocker(blockedResolution({
        field,
        entity,
        status: RESOLUTION_STATUSES.BLOCKED_MISSING_REQUIRED_INPUT,
        message: `No source value or enabled configured default resolved ${field}.`,
        diagnostics: [],
      }));
    }

    const configuredDefault = matching.defaultRecord;
    const validation = evaluateValidation(validate, configuredDefault.value, configuredDefault);
    if (!validation.valid) {
      return recordBlocker(blockedResolution({
        field,
        entity,
        status: RESOLUTION_STATUSES.BLOCKED_INVALID_HIGHER_AUTHORITY,
        message: validation.message || `Configured default ${configuredDefault.id} is invalid for ${field}.`,
        diagnostics: [configuredDefault.id],
      }));
    }

    const usage = deepFreeze({
      usageId: `DEFAULT-USAGE-${String(usages.length + 1).padStart(6, '0')}`,
      defaultId: configuredDefault.id,
      field,
      value: clonePlain(configuredDefault.value),
      unit: configuredDefault.unit ?? request.unit ?? null,
      entityId: entity.entityId,
      posId: entity.posId,
      fromNode: entity.fromNode,
      toNode: entity.toNode,
      scope: clonePlain(entity.scope),
      sourceMissingReason: request.sourceMissingReason ?? 'SOURCE_VALUE_UNRESOLVED',
      projectDataRevision,
      projectDataSemanticHash,
      affectedCalculations: Object.freeze([...(request.affectedCalculations ?? [])]),
      reason: configuredDefault.reason,
      qualification: configuredDefault.qualification,
    });
    usages.push(usage);

    return recordResolution(resolvedValue({
      field,
      entity,
      kind: RESOLUTION_KINDS.PROJECT_CONFIGURED_DEFAULT,
      value: configuredDefault.value,
      unit: configuredDefault.unit ?? request.unit ?? null,
      authority: configuredDefault.id,
      sourcePath: `ProjectData.calculationDefaults:${configuredDefault.id}`,
      reason: configuredDefault.reason,
      affectedCalculations: request.affectedCalculations ?? [],
      defaultUsageId: usage.usageId,
    }));
  }

  function receipt() {
    const uniqueDefaultIdsUsed = [...new Set(usages.map((usage) => usage.defaultId))].sort();
    const summary = deepFreeze({
      configuredDefaultCount: defaults.length,
      configuredDefaultUsedCount: uniqueDefaultIdsUsed.length,
      configuredDefaultApplicationCount: usages.length,
      resolvedCount: resolutions.length,
      blockedCount: blockers.length,
      resolutionKindCounts: countBy(resolutions, (row) => row.kind),
      blockerStatusCounts: countBy(blockers, (row) => row.status),
    });
    const value = {
      schema: EMPIRICAL_RESOLUTION_SCHEMA,
      projectDataRevision,
      projectDataSemanticHash,
      configuredDefaults: defaults,
      configuredDefaultUsages: Object.freeze([...usages]),
      resolutions: Object.freeze([...resolutions]),
      blockers: Object.freeze([...blockers]),
      summary,
    };
    return deepFreeze({ ...value, semanticIdentity: semanticHash(value) });
  }

  function recordResolution(value) {
    resolutions.push(value);
    return value;
  }

  function recordBlocker(value) {
    blockers.push(value);
    return value;
  }

  return Object.freeze({ resolve, receipt });
}

export function normalizeConfiguredDefaults(value) {
  return normalizeDefaults(value);
}

function resolvedValue(input) {
  return deepFreeze({
    status: RESOLUTION_STATUSES.RESOLVED,
    field: input.field,
    entityId: input.entity.entityId,
    posId: input.entity.posId,
    fromNode: input.entity.fromNode,
    toNode: input.entity.toNode,
    kind: input.kind,
    value: clonePlain(input.value),
    unit: input.unit,
    authority: input.authority,
    sourcePath: input.sourcePath,
    reason: input.reason,
    affectedCalculations: Object.freeze([...input.affectedCalculations]),
    defaultUsageId: input.defaultUsageId ?? null,
  });
}

function blockedResolution(input) {
  return deepFreeze({
    status: input.status,
    field: input.field,
    entityId: input.entity.entityId,
    posId: input.entity.posId,
    fromNode: input.entity.fromNode,
    toNode: input.entity.toNode,
    kind: null,
    value: null,
    unit: null,
    authority: null,
    sourcePath: null,
    reason: input.message,
    affectedCalculations: Object.freeze([]),
    defaultUsageId: null,
    diagnostics: Object.freeze([...(input.diagnostics ?? [])]),
  });
}

function normalizeDefaults(value) {
  if (!Array.isArray(value)) {
    throw new TypeError('Configured defaults must be an array.');
  }
  const ids = new Set();
  const rows = value.map((record, index) => {
    if (!record || typeof record !== 'object') {
      throw new TypeError(`Configured default at index ${index} must be an object.`);
    }
    const id = requireNonEmptyString(record.id, `defaults[${index}].id`);
    if (ids.has(id)) throw new RangeError(`Duplicate configured default id: ${id}.`);
    ids.add(id);
    const field = requireNonEmptyString(record.field, `defaults[${index}].field`);
    if (!Object.hasOwn(record, 'value')) {
      throw new TypeError(`Configured default ${id} must explicitly declare value, including zero where applicable.`);
    }
    const scope = normalizeScope(record.scope ?? {});
    if (field === 'section.schedule') assertScopedScheduleDefault(id, scope);
    return deepFreeze({
      id,
      enabled: record.enabled === true,
      field,
      value: clonePlain(record.value),
      unit: record.unit ?? null,
      scope,
      reason: requireNonEmptyString(record.reason, `defaults[${index}].reason`),
      qualification: requireNonEmptyString(record.qualification, `defaults[${index}].qualification`),
    });
  });
  return Object.freeze(rows.sort((a, b) => a.id.localeCompare(b.id)));
}

function normalizeCandidates(value) {
  if (!Array.isArray(value)) throw new TypeError('Resolution candidates must be an array.');
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') {
      throw new TypeError(`Resolution candidate at index ${index} must be an object.`);
    }
    if (!PRECEDENCE.includes(candidate.kind)) {
      throw new RangeError(`Unsupported source resolution kind: ${candidate.kind}.`);
    }
    return candidate;
  });
}

function normalizeEntity(value) {
  return deepFreeze({
    entityId: value.entityId == null ? null : String(value.entityId),
    posId: value.posId == null ? null : String(value.posId),
    fromNode: value.fromNode == null ? null : String(value.fromNode),
    toNode: value.toNode == null ? null : String(value.toNode),
    scope: normalizeScope(value.scope ?? {}),
  });
}

function normalizeScope(scope) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
    throw new TypeError('Configured default scope must be an object.');
  }
  return deepFreeze(Object.fromEntries(
    Object.entries(scope)
      .filter(([, item]) => item !== undefined && item !== null && item !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, clonePlain(item)]),
  ));
}

function assertScopedScheduleDefault(id, scope) {
  const missing = SCHEDULE_SCOPE_FIELDS.filter((field) => !Object.hasOwn(scope, field));
  if (missing.length > 0) {
    throw new RangeError(
      `Configured schedule default ${id} must include exact scope fields: ${SCHEDULE_SCOPE_FIELDS.join(', ')}. Missing: ${missing.join(', ')}.`,
    );
  }
}

function findMatchingDefaults(defaults, field, entityScope) {
  const fieldDefaults = defaults.filter((record) => record.enabled && record.field === field);
  if (fieldDefaults.length === 0) {
    return { status: RESOLUTION_STATUSES.RESOLVED, defaultRecord: null };
  }
  const matching = fieldDefaults
    .filter((record) => scopeMatches(record.scope, entityScope))
    .sort((a, b) => Object.keys(b.scope).length - Object.keys(a.scope).length || a.id.localeCompare(b.id));
  if (matching.length === 0) {
    return {
      status: RESOLUTION_STATUSES.BLOCKED_DEFAULT_OUTSIDE_SCOPE,
      defaultRecord: null,
      message: `Configured defaults exist for ${field}, but none match the entity scope.`,
      diagnostics: fieldDefaults.map((record) => record.id),
    };
  }
  const specificity = Object.keys(matching[0].scope).length;
  const equallySpecific = matching.filter((record) => Object.keys(record.scope).length === specificity);
  if (equallySpecific.length > 1) {
    return {
      status: RESOLUTION_STATUSES.BLOCKED_CONFLICTING_CONFIGURED_DEFAULTS,
      defaultRecord: null,
      message: `Multiple equally specific configured defaults match ${field}.`,
      diagnostics: equallySpecific.map((record) => record.id),
    };
  }
  return { status: RESOLUTION_STATUSES.RESOLVED, defaultRecord: matching[0] };
}

function scopeMatches(rule, actual) {
  return Object.entries(rule).every(([key, expected]) => {
    if (key === 'temperatureMinC') {
      return Number.isFinite(Number(actual.temperatureC)) && Number(actual.temperatureC) >= Number(expected);
    }
    if (key === 'temperatureMaxC') {
      return Number.isFinite(Number(actual.temperatureC)) && Number(actual.temperatureC) <= Number(expected);
    }
    if (key === 'entityIds') return valuesEqual(expected, actual.entityId);
    if (key === 'posIds') return valuesEqual(expected, actual.posId);
    return valuesEqual(expected, actual[key]);
  });
}

function valuesEqual(expected, actual) {
  if (Array.isArray(expected)) return expected.some((item) => valuesEqual(item, actual));
  if (typeof expected === 'number' || typeof actual === 'number') {
    return Number.isFinite(Number(expected)) && Number(expected) === Number(actual);
  }
  return String(expected) === String(actual);
}

function evaluateValidation(validate, value, context) {
  try {
    const result = validate(value, context);
    if (result === true || result === undefined) return { valid: true, message: null };
    if (result === false) return { valid: false, message: null };
    if (typeof result === 'string') return { valid: false, message: result };
    return { valid: Boolean(result), message: null };
  } catch (error) {
    return { valid: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function defaultValidator() {
  return true;
}

function hasDeclaredValue(value) {
  return value !== undefined && value !== null;
}

function requireNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${fieldName} must be a non-negative integer.`);
  }
  return value;
}

function countBy(values, keyFn) {
  const counts = {};
  for (const value of values) {
    const key = keyFn(value);
    if (!key) continue;
    counts[key] = (counts[key] || 0) + 1;
  }
  return deepFreeze(counts);
}

function clonePlain(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}
