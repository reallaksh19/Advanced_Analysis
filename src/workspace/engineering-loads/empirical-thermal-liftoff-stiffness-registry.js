import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord, stringValue } from '../../core/shared-piping-model/immutable.js';
import {
  THERMAL_LIFTOFF_BLOCKER_CODES,
  requireThermalLiftoffSourceIdentity,
} from './empirical-thermal-liftoff-authority.js';

export const THERMAL_LIFTOFF_APPLICABILITY_BINDING_SCHEMA =
  'empirical-thermal-liftoff-applicability-binding/v1';
export const THERMAL_LIFTOFF_STIFFNESS_ENTRY_SCHEMA =
  'empirical-thermal-liftoff-stiffness-entry/v1';
export const THERMAL_LIFTOFF_STIFFNESS_REGISTRY_SCHEMA =
  'empirical-thermal-liftoff-stiffness-registry/v1';

export const THERMAL_LIFTOFF_STIFFNESS_REPRESENTATIONS = Object.freeze([
  'LOCAL_EFFECTIVE_VERTICAL_STIFFNESS',
  'REDUCED_VERTICAL_STIFFNESS_MATRIX_EVIDENCE',
  'REDUCED_VERTICAL_FLEXIBILITY_MATRIX_EVIDENCE',
  'TEMPLATE_VERTICAL_STIFFNESS_COEFFICIENTS',
]);

const QUALIFIED_SOURCE_KINDS = Object.freeze([
  'BENCHMARKED_TEMPLATE',
  'SOURCE_SOLVER',
  'MEASURED_TEST',
  'APPROVED_ENGINEERING_DATA',
]);
const FORBIDDEN_GLOBAL_SITE_IDS = new Set(['*', 'DEFAULT', 'GLOBAL', 'ALL', 'TYPICAL']);

export function createThermalLiftoffApplicabilityBinding(input) {
  exactKeys(input, [
    'classId', 'templateId', 'templateRevision', 'geometrySemanticHash',
    'supportCapabilitySemanticHash', 'linePropertySemanticHash',
    'coordinateFrameSemanticHash',
  ], 'thermal lift-off applicability binding input');
  const classId = requiredString(input.classId, 'classId');
  if (!['TL-A', 'TL-B'].includes(classId)) {
    throw codedError(
      'TL-02 Stage-1 applicability binding must be TL-A or TL-B; TL-C requires detailed analysis.',
      'THERMAL_LIFTOFF_APPLICABILITY_CLASS_UNSUPPORTED',
    );
  }
  const draft = {
    schema: THERMAL_LIFTOFF_APPLICABILITY_BINDING_SCHEMA,
    classId,
    templateId: requiredString(input.templateId, 'templateId'),
    templateRevision: requiredString(input.templateRevision, 'templateRevision'),
    geometrySemanticHash: requiredHash(input.geometrySemanticHash, 'geometrySemanticHash'),
    supportCapabilitySemanticHash: requiredHash(
      input.supportCapabilitySemanticHash,
      'supportCapabilitySemanticHash',
    ),
    linePropertySemanticHash: requiredHash(
      input.linePropertySemanticHash,
      'linePropertySemanticHash',
    ),
    coordinateFrameSemanticHash: requiredHash(
      input.coordinateFrameSemanticHash,
      'coordinateFrameSemanticHash',
    ),
  };
  return deepFreeze({ ...draft, semanticHash: semanticHash(draft) });
}

export function requireThermalLiftoffApplicabilityBinding(value) {
  exactKeys(value, [
    'schema', 'classId', 'templateId', 'templateRevision', 'geometrySemanticHash',
    'supportCapabilitySemanticHash', 'linePropertySemanticHash',
    'coordinateFrameSemanticHash', 'semanticHash',
  ], 'thermal lift-off applicability binding');
  if (value.schema !== THERMAL_LIFTOFF_APPLICABILITY_BINDING_SCHEMA) {
    throw codedError('Unexpected TL-02 applicability schema.', 'THERMAL_LIFTOFF_APPLICABILITY_SCHEMA_INVALID');
  }
  const normalized = createThermalLiftoffApplicabilityBinding({
    classId: value.classId,
    templateId: value.templateId,
    templateRevision: value.templateRevision,
    geometrySemanticHash: value.geometrySemanticHash,
    supportCapabilitySemanticHash: value.supportCapabilitySemanticHash,
    linePropertySemanticHash: value.linePropertySemanticHash,
    coordinateFrameSemanticHash: value.coordinateFrameSemanticHash,
  });
  if (normalized.semanticHash !== value.semanticHash) {
    throw codedError('TL-02 applicability binding semantic hash mismatch.', 'THERMAL_LIFTOFF_APPLICABILITY_HASH_MISMATCH');
  }
  return normalized;
}

export function createThermalLiftoffStiffnessEntry(input) {
  exactKeys(input, [
    'entryId', 'supportSiteId', 'representation', 'data', 'units', 'ordering',
    'sourceKind', 'source', 'benchmarkReference', 'applicability', 'qualification',
  ], 'thermal lift-off stiffness entry input');
  if (input.qualification !== 'QUALIFIED') {
    throw codedError(
      'TL-02 registry accepts only explicitly QUALIFIED stiffness/influence entries.',
      THERMAL_LIFTOFF_BLOCKER_CODES.STIFFNESS_GUESSED,
    );
  }
  const sourceKind = requiredString(input.sourceKind, 'sourceKind');
  if (!QUALIFIED_SOURCE_KINDS.includes(sourceKind)) {
    throw codedError(
      `Stiffness source kind ${sourceKind} is not a qualified authority class.`,
      THERMAL_LIFTOFF_BLOCKER_CODES.STIFFNESS_GUESSED,
    );
  }
  const supportSiteId = requireSpecificSupportSiteId(input.supportSiteId);
  const representation = oneOf(
    input.representation,
    THERMAL_LIFTOFF_STIFFNESS_REPRESENTATIONS,
    'representation',
  );
  const ordering = requireOrdering(input.ordering);
  const units = requiredString(input.units, 'units');
  const data = requireRepresentationData(representation, input.data, units, ordering, supportSiteId);
  const benchmarkReference = requireBenchmarkReference(input.benchmarkReference);
  const applicability = requireThermalLiftoffApplicabilityBinding(input.applicability);
  const draft = {
    schema: THERMAL_LIFTOFF_STIFFNESS_ENTRY_SCHEMA,
    entryId: requiredString(input.entryId, 'entryId'),
    supportSiteId,
    representation,
    data,
    units,
    ordering,
    sourceKind,
    source: requireThermalLiftoffSourceIdentity(input.source, 'stiffness source'),
    benchmarkReference,
    applicability,
    qualification: 'QUALIFIED',
  };
  return deepFreeze({ ...draft, semanticHash: semanticHash(draft) });
}

export function requireThermalLiftoffStiffnessEntry(value) {
  exactKeys(value, [
    'schema', 'entryId', 'supportSiteId', 'representation', 'data', 'units',
    'ordering', 'sourceKind', 'source', 'benchmarkReference', 'applicability',
    'qualification', 'semanticHash',
  ], 'thermal lift-off stiffness entry');
  if (value.schema !== THERMAL_LIFTOFF_STIFFNESS_ENTRY_SCHEMA) {
    throw codedError('Unexpected TL-02 stiffness-entry schema.', 'THERMAL_LIFTOFF_STIFFNESS_SCHEMA_INVALID');
  }
  const normalized = createThermalLiftoffStiffnessEntry({
    entryId: value.entryId,
    supportSiteId: value.supportSiteId,
    representation: value.representation,
    data: value.data,
    units: value.units,
    ordering: value.ordering,
    sourceKind: value.sourceKind,
    source: value.source,
    benchmarkReference: value.benchmarkReference,
    applicability: value.applicability,
    qualification: value.qualification,
  });
  if (normalized.semanticHash !== value.semanticHash) {
    throw codedError('TL-02 stiffness entry semantic hash mismatch.', 'THERMAL_LIFTOFF_STIFFNESS_HASH_MISMATCH');
  }
  return normalized;
}

export function createThermalLiftoffStiffnessRegistry(input) {
  exactKeys(input, ['registryId', 'entries'], 'thermal lift-off stiffness registry input');
  if (!Array.isArray(input.entries)) throw new TypeError('entries must be an array.');
  const entries = input.entries.map(requireThermalLiftoffStiffnessEntry)
    .sort((left, right) => left.entryId.localeCompare(right.entryId));
  const ids = entries.map((row) => row.entryId);
  if (new Set(ids).size !== ids.length) {
    throw codedError('TL-02 stiffness entry IDs must be unique.', 'THERMAL_LIFTOFF_STIFFNESS_ENTRY_DUPLICATE');
  }
  const draft = {
    schema: THERMAL_LIFTOFF_STIFFNESS_REGISTRY_SCHEMA,
    registryId: requiredString(input.registryId, 'registryId'),
    entries,
  };
  return deepFreeze({ ...draft, semanticHash: semanticHash(draft) });
}

export function requireThermalLiftoffStiffnessRegistry(value) {
  exactKeys(value, ['schema', 'registryId', 'entries', 'semanticHash'], 'thermal lift-off stiffness registry');
  if (value.schema !== THERMAL_LIFTOFF_STIFFNESS_REGISTRY_SCHEMA) {
    throw codedError('Unexpected TL-02 stiffness-registry schema.', 'THERMAL_LIFTOFF_STIFFNESS_REGISTRY_SCHEMA_INVALID');
  }
  const normalized = createThermalLiftoffStiffnessRegistry({
    registryId: value.registryId,
    entries: value.entries,
  });
  if (normalized.semanticHash !== value.semanticHash) {
    throw codedError('TL-02 stiffness registry semantic hash mismatch.', 'THERMAL_LIFTOFF_STIFFNESS_REGISTRY_HASH_MISMATCH');
  }
  return normalized;
}

export function resolveThermalLiftoffLocalStiffness(value) {
  exactKeys(value, ['registry', 'supportSiteId', 'applicability'], 'TL-02 local stiffness resolution');
  const registry = requireThermalLiftoffStiffnessRegistry(value.registry);
  const supportSiteId = requireSpecificSupportSiteId(value.supportSiteId);
  const applicability = requireThermalLiftoffApplicabilityBinding(value.applicability);
  const localEntries = registry.entries.filter((row) => (
    row.supportSiteId === supportSiteId
    && row.representation === 'LOCAL_EFFECTIVE_VERTICAL_STIFFNESS'
  ));
  const applicableEntries = localEntries.filter((row) => (
    row.applicability.semanticHash === applicability.semanticHash
  ));

  if (applicableEntries.length === 0) {
    const code = localEntries.length
      ? THERMAL_LIFTOFF_BLOCKER_CODES.STIFFNESS_APPLICABILITY_MISMATCH
      : THERMAL_LIFTOFF_BLOCKER_CODES.STIFFNESS_AUTHORITY_MISSING;
    return deepFreeze({
      status: 'UNRESOLVED',
      entry: null,
      blockers: [blocker(
        code,
        supportSiteId,
        localEntries.length
          ? 'Qualified local stiffness exists but is not bound to the current applicability evidence.'
          : 'No qualified local effective vertical stiffness exists for this support site.',
      )],
    });
  }
  if (applicableEntries.length !== 1) {
    return deepFreeze({
      status: 'UNRESOLVED',
      entry: null,
      blockers: [blocker(
        THERMAL_LIFTOFF_BLOCKER_CODES.STIFFNESS_AUTHORITY_CONFLICT,
        supportSiteId,
        `Multiple qualified local stiffness authorities apply: ${applicableEntries.map((row) => row.entryId).join(', ')}.`,
      )],
    });
  }
  return deepFreeze({ status: 'QUALIFIED', entry: applicableEntries[0], blockers: [] });
}

function requireRepresentationData(representation, value, units, ordering, supportSiteId) {
  if (representation === 'LOCAL_EFFECTIVE_VERTICAL_STIFFNESS') {
    if (units !== 'N_PER_M') throw new TypeError('Local effective stiffness units must be N_PER_M.');
    if (ordering.length !== 1 || ordering[0] !== supportSiteId) {
      throw new TypeError('Local effective stiffness ordering must contain exactly its supportSiteId.');
    }
    exactKeys(value, ['kind', 'effectiveVerticalStiffnessNPerM'], 'local stiffness data');
    if (value.kind !== 'SCALAR') throw new TypeError('Local stiffness data.kind must be SCALAR.');
    return deepFreeze({
      kind: 'SCALAR',
      effectiveVerticalStiffnessNPerM: positive(
        value.effectiveVerticalStiffnessNPerM,
        'effectiveVerticalStiffnessNPerM',
      ),
    });
  }
  if (representation === 'REDUCED_VERTICAL_STIFFNESS_MATRIX_EVIDENCE') {
    if (units !== 'N_PER_M') throw new TypeError('Vertical stiffness matrix units must be N_PER_M.');
    return requireMatrixData(value, ordering, 'stiffness matrix data');
  }
  if (representation === 'REDUCED_VERTICAL_FLEXIBILITY_MATRIX_EVIDENCE') {
    if (units !== 'M_PER_N') throw new TypeError('Vertical flexibility matrix units must be M_PER_N.');
    return requireMatrixData(value, ordering, 'flexibility matrix data');
  }
  if (units !== 'N_PER_M') throw new TypeError('Template vertical stiffness coefficients must use N_PER_M.');
  exactKeys(value, ['kind', 'values'], 'template stiffness coefficient data');
  if (value.kind !== 'VECTOR' || !Array.isArray(value.values) || value.values.length !== ordering.length) {
    throw new TypeError('Template stiffness coefficients must be an ordered VECTOR matching ordering.');
  }
  return deepFreeze({
    kind: 'VECTOR',
    values: value.values.map((item, index) => positive(item, `values[${index}]`)),
  });
}

function requireMatrixData(value, ordering, label) {
  exactKeys(value, ['kind', 'values'], label);
  if (value.kind !== 'MATRIX' || !Array.isArray(value.values)
    || value.values.length !== ordering.length || ordering.length === 0) {
    throw new TypeError(`${label} must be a square MATRIX matching ordering.`);
  }
  const values = value.values.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== ordering.length) {
      throw new TypeError(`${label} row ${rowIndex} must match ordering.`);
    }
    return row.map((item, columnIndex) => finite(item, `${label}[${rowIndex}][${columnIndex}]`));
  });
  return deepFreeze({ kind: 'MATRIX', values });
}

function requireBenchmarkReference(value) {
  exactKeys(value, ['benchmarkId', 'benchmarkRevision', 'benchmarkSemanticHash'], 'stiffness benchmark reference');
  return deepFreeze({
    benchmarkId: requiredString(value.benchmarkId, 'benchmarkId'),
    benchmarkRevision: requiredString(value.benchmarkRevision, 'benchmarkRevision'),
    benchmarkSemanticHash: requiredHash(value.benchmarkSemanticHash, 'benchmarkSemanticHash'),
  });
}

function requireOrdering(value) {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError('ordering must be a non-empty array.');
  const ordering = value.map((item, index) => requireSpecificSupportSiteId(item, `ordering[${index}]`));
  if (new Set(ordering).size !== ordering.length) throw new TypeError('ordering support-site IDs must be unique.');
  return deepFreeze(ordering);
}

function requireSpecificSupportSiteId(value, label = 'supportSiteId') {
  const result = requiredString(value, label);
  if (FORBIDDEN_GLOBAL_SITE_IDS.has(result.toUpperCase())) {
    throw codedError(
      'Global/default/typical stiffness site identity is prohibited.',
      THERMAL_LIFTOFF_BLOCKER_CODES.STIFFNESS_GUESSED,
    );
  }
  return result;
}

function blocker(code, scope, message) {
  return deepFreeze({ code, severity: 'ERROR', scope, message });
}

function exactKeys(value, keys, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}

function requiredString(value, label) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${label} must be a non-empty string.`);
  return normalized;
}

function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw new TypeError(`${label} must be one of: ${allowed.join(', ')}.`);
  return value;
}

function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
  return value;
}

function positive(value, label) {
  const result = finite(value, label);
  if (result <= 0) throw new TypeError(`${label} must be positive.`);
  return result;
}

function requiredHash(value, label) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    throw new TypeError(`${label} must be an FNV-1a semantic hash.`);
  }
  return value;
}

function codedError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}
