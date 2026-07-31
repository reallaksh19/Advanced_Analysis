/**
 * Functionality: Validates sidecar master/override records, resolves their
 * authority deterministically, and creates a separate enriched shared-model
 * projection without mutating imported source entities.
 */

import {
  createSharedPipingModel, deepFreeze, semanticHash, validateSharedPipingModel,
} from '../shared-piping-model/index.js';
import {
  AUTHORITY_LEVELS, FIRST_CUT_SCHEMAS, MASTER_SELECTOR_KINDS,
} from './constants.js';
import {
  assertEnum, assertExactKeys, assertString, validateHashedContract, withSemanticHash,
} from './validation.js';

const MASTER_INPUT_KEYS = Object.freeze(['sourceId', 'revision', 'records']);
const MASTER_CONTRACT_KEYS = Object.freeze(['schema', 'sourceId', 'revision', 'records']);
const RECORD_KEYS = Object.freeze([
  'recordId', 'selectorKind', 'selectorKey', 'fieldId', 'value', 'unit', 'sourceId', 'revision',
]);
const ALLOWED_FIELDS = Object.freeze([
  'outerDiameterMm', 'wallThicknessMm', 'materialDensityKgM3', 'unitPipeWeightKgPerM',
  'fluidDensityOpeKgM3', 'fluidDensityHydKgM3', 'fluidWeightOpeKgPerM',
  'fluidWeightHydKgPerM', 'insulationThicknessMm', 'insulationDensityKgM3',
  'insulationWeightKgPerM', 'componentWeightKg', 'elasticModulusMpa',
  'secondMomentAreaMm4', 'flexuralRigidityNm2', 'verticalState', 'supportType',
  'supportAvailabilitySensitivity',
]);

export function buildFirstCutMasterData(input) {
  assertExactKeys(input, MASTER_INPUT_KEYS, 'First-cut master data');
  if (!Array.isArray(input.records)) throw new TypeError('Master-data records must be an array.');
  const records = input.records.map(validateRecord).sort(recordOrder);
  assertNoConflicts(records);
  return withSemanticHash({
    schema: FIRST_CUT_SCHEMAS.MASTER_DATA,
    sourceId: assertString(input.sourceId, 'Master-data source ID'),
    revision: assertString(input.revision, 'Master-data revision'),
    records,
  });
}

export function validateFirstCutMasterData(value) {
  return validateHashedContract(value, FIRST_CUT_SCHEMAS.MASTER_DATA, MASTER_CONTRACT_KEYS);
}

export function parseFirstCutMasterDataCsv(text, sourceId, revision) {
  const rows = parseCsv(String(text));
  const expected = ['record_id', 'selector_kind', 'selector_key', 'field_id', 'value', 'unit', 'source_id', 'revision'];
  if (!rows.length || rows[0].join('|') !== expected.join('|')) {
    throw new TypeError(`Master CSV header must be: ${expected.join(',')}`);
  }
  return buildFirstCutMasterData({
    sourceId: assertString(sourceId, 'Imported master source ID'),
    revision: assertString(revision, 'Imported master revision'),
    records: rows.slice(1).filter((row) => row.some(Boolean)).map((row) => ({
      recordId: row[0], selectorKind: row[1], selectorKey: row[2], fieldId: row[3],
      value: numericOrString(row[4]), unit: row[5], sourceId: row[6], revision: row[7],
    })),
  });
}

export function createEnrichedSharedModelProjection(input) {
  assertExactKeys(input, ['sourceModel', 'bindings'], 'Enriched projection input');
  const validation = validateSharedPipingModel(input.sourceModel);
  if (!validation.ok) throw new TypeError(`Invalid source model: ${validation.errors.join(' ')}`);
  if (!Array.isArray(input.bindings)) throw new TypeError('Enrichment bindings must be an array.');
  const bindings = input.bindings.map(validateBinding).sort(bindingOrder);
  assertNoBindingConflicts(bindings);
  const components = input.sourceModel.components.map((component) => enrichComponent(component, bindings));
  const supports = input.sourceModel.supports
    .filter((support) => !supportUnavailableForSensitivity(support, bindings))
    .map((support) => enrichSupport(support, bindings));
  const model = createSharedPipingModel({
    project: input.sourceModel.project,
    units: input.sourceModel.units,
    sourceSnapshotRef: input.sourceModel.sourceSnapshotRef,
    components,
    supports,
    sourceReferences: input.sourceModel.sourceReferences,
    diagnostics: input.sourceModel.diagnostics,
  });
  const bindingsSemanticHash = semanticHash(bindings);
  const base = {
    sourceSemanticHash: input.sourceModel.semanticHash,
    bindingsSemanticHash,
    enrichedModel: model,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash({
    sourceSemanticHash: base.sourceSemanticHash,
    bindingsSemanticHash,
    enrichedModelSemanticHash: model.semanticHash,
  }) });
}

export function resolveEvidenceBindings(input) {
  assertExactKeys(input, ['explicitSource', 'acceptedOverrides', 'authorizedMaster', 'approvedApproximations'], 'Evidence binding input');
  const tiers = [
    ['EXPLICIT_SOURCE', input.explicitSource],
    ['ACCEPTED_OVERRIDE', input.acceptedOverrides],
    ['AUTHORIZED_MASTER', input.authorizedMaster],
    ['USER_APPROVED_APPROXIMATION', input.approvedApproximations],
  ];
  const selected = new Map();
  tiers.forEach(([authorityLevel, rows]) => {
    if (!Array.isArray(rows)) throw new TypeError(`${authorityLevel} bindings must be an array.`);
    const validated = rows.map((row) => validateBinding({ ...row, authorityLevel }))
      .sort(bindingOrder);
    assertNoBindingConflicts(validated);
    validated.forEach((row) => {
      const key = bindingKey(row);
      if (!selected.has(key)) selected.set(key, row);
    });
  });
  return deepFreeze([...selected.values()].sort(bindingOrder));
}

function validateRecord(value) {
  assertExactKeys(value, RECORD_KEYS, 'Master-data record');
  if (!ALLOWED_FIELDS.includes(value.fieldId)) throw new TypeError(`Unsupported first-cut field: ${value.fieldId}.`);
  if (!['string', 'number'].includes(typeof value.value) || value.value === '') throw new TypeError('Master-data value is invalid.');
  if (typeof value.value === 'number' && !Number.isFinite(value.value)) throw new TypeError('Master-data number must be finite.');
  if (value.fieldId === 'supportAvailabilitySensitivity'
    && (value.selectorKind !== 'ENTITY'
      || value.value !== 'USER-DECLARED SUPPORT-UNAVAILABLE SENSITIVITY')) {
    throw new TypeError('Support-unavailable sensitivity requires an exact ENTITY selector and the reviewed declaration.');
  }
  return deepFreeze({
    recordId: assertString(value.recordId, 'Master record ID'),
    selectorKind: assertEnum(value.selectorKind, MASTER_SELECTOR_KINDS, 'Master selector kind'),
    selectorKey: assertString(value.selectorKey, 'Master selector key'),
    fieldId: value.fieldId,
    value: value.value,
    unit: assertString(value.unit, 'Master record unit'),
    sourceId: assertString(value.sourceId, 'Master record source'),
    revision: assertString(value.revision, 'Master record revision'),
  });
}

function validateBinding(value) {
  assertExactKeys(value, [...RECORD_KEYS, 'authorityLevel'], 'Enrichment binding');
  const record = validateRecord(Object.fromEntries(RECORD_KEYS.map((key) => [key, value[key]])));
  return deepFreeze({ ...record, authorityLevel: assertEnum(value.authorityLevel, AUTHORITY_LEVELS, 'Binding authority') });
}

function enrichComponent(component, bindings) {
  const selected = bindings.filter((row) => !['verticalState', 'supportType'].includes(row.fieldId)
    && selectorMatchesComponent(row, component));
  if (!selected.length) return component;
  const engineeringProperties = { ...component.engineeringProperties };
  selected.forEach((row) => {
    if (engineeringProperties[row.fieldId] === undefined || engineeringProperties[row.fieldId] === null) {
      engineeringProperties[row.fieldId] = evidence(row);
    }
  });
  return { ...component, engineeringProperties };
}

function enrichSupport(support, bindings) {
  const selected = bindings.filter((row) => ['verticalState', 'supportType'].includes(row.fieldId)
    && selectorMatchesSupport(row, support));
  if (!selected.length) return support;
  const supportEvidence = { ...(support.supportEvidence || {}) };
  selected.forEach((row) => {
    if (row.fieldId === 'verticalState' && !supportEvidence.verticalCapabilities?.length) {
      supportEvidence.verticalCapabilities = [evidence(row)];
    }
    if (row.fieldId === 'supportType' && !supportEvidence.supportTypes?.length) {
      supportEvidence.supportTypes = [evidence(row)];
    }
  });
  return { ...support, supportEvidence };
}

function selectorMatchesComponent(row, component) {
  if (row.selectorKind === 'ENTITY') return [component.componentKey, component.sourceEntityId].includes(row.selectorKey);
  if (row.selectorKind === 'PIPING_CLASS_BORE') return row.selectorKey === `${pipingClass(component)}|${bore(component)}`;
  if (row.selectorKind === 'COMPONENT_TYPE_BORE') return row.selectorKey === `${component.type}|${bore(component)}`;
  return false;
}

function selectorMatchesSupport(row, support) {
  if (row.selectorKind === 'ENTITY') return [support.supportKey, support.sourceEntityId].includes(row.selectorKey);
  if (row.selectorKind !== 'SUPPORT_KIND') return false;
  const type = support.supportEvidence?.supportTypes?.[0]?.value || support.type;
  return row.selectorKey === String(type || '').toUpperCase();
}

function supportUnavailableForSensitivity(support, bindings) {
  return bindings.some((row) => row.fieldId === 'supportAvailabilitySensitivity'
    && row.selectorKind === 'ENTITY'
    && selectorMatchesSupport(row, support)
    && row.value === 'USER-DECLARED SUPPORT-UNAVAILABLE SENSITIVITY');
}

function assertNoConflicts(records) {
  const grouped = new Map();
  records.forEach((row) => {
    const key = `${row.selectorKind}|${row.selectorKey}|${row.fieldId}`;
    const prior = grouped.get(key);
    if (prior && semanticHash({ value: prior.value, unit: prior.unit }) !== semanticHash({ value: row.value, unit: row.unit })) {
      throw new TypeError(`Conflicting master-data records for ${key}.`);
    }
    grouped.set(key, row);
  });
}

function assertNoBindingConflicts(bindings) {
  const grouped = new Map();
  bindings.forEach((row) => {
    const key = `${row.authorityLevel}|${bindingKey(row)}`;
    const prior = grouped.get(key);
    if (prior && semanticHash({ value: prior.value, unit: prior.unit }) !== semanticHash({ value: row.value, unit: row.unit })) {
      throw new TypeError(`Ambiguous same-authority bindings for ${key}.`);
    }
    grouped.set(key, row);
  });
}

function evidence(row) {
  return {
    value: row.value, unit: row.unit,
    sourcePath: `firstCutSidecar.${row.recordId}`,
    sourceRoot: row.sourceId,
    sourceKind: row.authorityLevel,
  };
}
function pipingClass(component) { return component.identity?.pipingClass || component.identity?.lineClass || ''; }
function bore(component) { return component.geometry?.boreMm ?? component.engineeringProperties?.nominalBoreMm?.value ?? ''; }
function bindingKey(row) { return `${row.selectorKind}|${row.selectorKey}|${row.fieldId}`; }
function bindingOrder(left, right) { return `${bindingKey(left)}|${left.recordId}`.localeCompare(`${bindingKey(right)}|${right.recordId}`); }
function recordOrder(left, right) { return `${left.selectorKind}|${left.selectorKey}|${left.fieldId}|${left.recordId}`.localeCompare(`${right.selectorKind}|${right.selectorKey}|${right.fieldId}|${right.recordId}`); }
function numericOrString(value) { const number = Number(value); return value.trim() !== '' && Number.isFinite(number) ? number : value; }

function parseCsv(text) {
  const rows = [], row = [];
  let field = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index], next = text[index + 1];
    if (character === '"' && quoted && next === '"') { field += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === ',' && !quoted) { row.push(field); field = ''; continue; }
    if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(field); rows.push([...row]); row.length = 0; field = ''; continue;
    }
    field += character;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (quoted) throw new TypeError('Master CSV contains an unterminated quoted field.');
  return rows;
}
