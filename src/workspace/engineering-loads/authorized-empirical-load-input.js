import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import {
  requireCommonEnrichedConsumerHandoff,
  requireCommonEnrichedConsumerProjectionPayload,
} from '../../core/common-enriched-properties/index.js';

export const AUTHORIZED_EMPIRICAL_LOAD_INPUT_REQUEST_SCHEMA = 'authorized-empirical-load-input-request/v1';
export const AUTHORIZED_EMPIRICAL_LOAD_INPUT_SCHEMA = 'authorized-empirical-load-input/v1';
export const AUTHORIZED_EMPIRICAL_LOAD_PROJECTION_SCHEMA = 'advanced-analysis-empirical-load-input/v1';

const REQUEST_KEYS = ['schema', 'intakeId', 'handoff', 'projectionPayload'];
const OUTPUT_KEYS = [
  'schema', 'intakeId', 'projectId', 'baselineId', 'baselineRevision',
  'baselineSemanticHash', 'readinessEvaluationSemanticHash', 'readinessSemanticHash',
  'handoffSemanticHash', 'projectionPayloadSemanticHash', 'adapterVersion',
  'configurationHash', 'createdAt', 'lineBindings', 'componentBindings',
  'loadCalculationOverlay', 'overlaySemanticHash', 'summary', 'semanticHash',
];
const LINE_KEYS = [
  'hydroFluidDensityKgM3', 'insulationCode', 'insulationDensityKgM3',
  'insulationThicknessMm', 'materialCode', 'materialDensityKgM3',
  'operatingFluidDensityKgM3', 'outsideDiameterMm', 'wallThicknessMm',
];
const COMPONENT_KEYS = ['catalogKey', 'weightKg'];
const OVERLAY_KEYS = [
  'pipeSectionProperties', 'materialDensitiesKgPerM3',
  'operatingFluidDensitiesKgPerM3', 'hydroFluidDensitiesKgPerM3',
  'insulationDensitiesKgPerM3', 'componentWeightsKg',
];
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function authorizedEmpiricalLoadInputSemanticProjection(value) {
  return Object.fromEntries(OUTPUT_KEYS.filter((key) => key !== 'semanticHash').map((key) => [key, value[key]]));
}

export function computeAuthorizedEmpiricalLoadInputSemanticHash(value) {
  return semanticHash(authorizedEmpiricalLoadInputSemanticProjection(value));
}

export function compileAuthorizedEmpiricalLoadInput(input) {
  exact(input, REQUEST_KEYS, 'authorizedEmpiricalLoadInputRequest');
  if (input.schema !== AUTHORIZED_EMPIRICAL_LOAD_INPUT_REQUEST_SCHEMA) {
    fail('Unsupported empirical-load intake request.', 'EMPIRICAL_INPUT_SCHEMA_INVALID');
  }
  const handoff = requireCommonEnrichedConsumerHandoff(input.handoff);
  const payload = requireCommonEnrichedConsumerProjectionPayload(input.projectionPayload);
  bindAuthority(handoff, payload);

  const sections = new Map();
  const materials = new Map();
  const operating = new Map();
  const hydro = new Map();
  const insulation = new Map();
  const weights = new Map();
  const lineBindings = [];
  const componentBindings = [];

  for (const record of payload.records) {
    if (record.targetKind === 'LINE') {
      exact(record.values, LINE_KEYS, `${record.targetId}.values`);
      const lineKey = safe(record.lineKey, `${record.targetId}.lineKey`);
      if (sections.has(lineKey)) fail('Duplicate exact line key.', 'EMPIRICAL_INPUT_DUPLICATE_LINE_KEY', { lineKey });
      const od = positive(record.values.outsideDiameterMm, `${record.targetId}.outsideDiameterMm`);
      const wall = positive(record.values.wallThicknessMm, `${record.targetId}.wallThicknessMm`);
      if (wall * 2 >= od) fail('Pipe section leaves no inside diameter.', 'EMPIRICAL_INPUT_PIPE_SECTION_INVALID', { targetId: record.targetId });
      const materialCode = safe(record.values.materialCode, `${record.targetId}.materialCode`);
      const insulationThicknessMm = nonnegative(record.values.insulationThicknessMm, `${record.targetId}.insulationThicknessMm`);
      const insulationCode = record.values.insulationCode === null ? null : safe(record.values.insulationCode, `${record.targetId}.insulationCode`);
      const insulationDensity = record.values.insulationDensityKgM3 === null ? null : nonnegative(record.values.insulationDensityKgM3, `${record.targetId}.insulationDensityKgM3`);
      if (insulationThicknessMm === 0) {
        if (insulationCode !== null || (insulationDensity !== null && insulationDensity !== 0)) {
          fail('Invalid uninsulated line evidence.', 'EMPIRICAL_INPUT_INSULATION_INVALID', { targetId: record.targetId });
        }
      } else if (insulationCode === null || insulationDensity === null || insulationDensity <= 0) {
        fail('Insulated line requires code and positive density.', 'EMPIRICAL_INPUT_INSULATION_INVALID', { targetId: record.targetId });
      }
      sections.set(lineKey, { outsideDiameterMm: od, wallThicknessMm: wall, materialCode, insulationCode, insulationThicknessMm });
      consistent(materials, materialCode, positive(record.values.materialDensityKgM3, `${record.targetId}.materialDensityKgM3`), 'EMPIRICAL_INPUT_MATERIAL_DENSITY_CONFLICT');
      operating.set(lineKey, positive(record.values.operatingFluidDensityKgM3, `${record.targetId}.operatingFluidDensityKgM3`));
      hydro.set(lineKey, positive(record.values.hydroFluidDensityKgM3, `${record.targetId}.hydroFluidDensityKgM3`));
      if (insulationCode !== null) consistent(insulation, insulationCode, insulationDensity, 'EMPIRICAL_INPUT_INSULATION_DENSITY_CONFLICT');
      lineBindings.push(binding(record, { lineKey }));
      continue;
    }
    if (record.targetKind === 'COMPONENT') {
      exact(record.values, COMPONENT_KEYS, `${record.targetId}.values`);
      const catalogKey = safe(record.values.catalogKey, `${record.targetId}.catalogKey`);
      consistent(weights, catalogKey, positive(record.values.weightKg, `${record.targetId}.weightKg`), 'EMPIRICAL_INPUT_COMPONENT_WEIGHT_CONFLICT');
      componentBindings.push(binding(record, { lineKey: record.lineKey, catalogKey }));
      continue;
    }
    fail('Unsupported empirical projection target kind.', 'EMPIRICAL_INPUT_TARGET_KIND_INVALID', { targetId: record.targetId, targetKind: record.targetKind });
  }

  lineBindings.sort(byTarget);
  componentBindings.sort(byTarget);
  const loadCalculationOverlay = {
    pipeSectionProperties: sorted(sections),
    materialDensitiesKgPerM3: sorted(materials),
    operatingFluidDensitiesKgPerM3: sorted(operating),
    hydroFluidDensitiesKgPerM3: sorted(hydro),
    insulationDensitiesKgPerM3: sorted(insulation),
    componentWeightsKg: sorted(weights),
  };
  const draft = {
    schema: AUTHORIZED_EMPIRICAL_LOAD_INPUT_SCHEMA,
    intakeId: identity(input.intakeId, 'intakeId'),
    projectId: handoff.baseline.projectId,
    baselineId: handoff.baseline.baselineId,
    baselineRevision: handoff.baseline.revision,
    baselineSemanticHash: handoff.baseline.semanticHash,
    readinessEvaluationSemanticHash: payload.readinessEvaluationSemanticHash,
    readinessSemanticHash: payload.readinessSemanticHash,
    handoffSemanticHash: handoff.semanticHash,
    projectionPayloadSemanticHash: payload.semanticHash,
    adapterVersion: payload.adapterVersion,
    configurationHash: payload.configurationHash,
    createdAt: payload.createdAt,
    lineBindings,
    componentBindings,
    loadCalculationOverlay,
    overlaySemanticHash: semanticHash(loadCalculationOverlay),
    summary: {
      lineCount: lineBindings.length,
      componentCount: componentBindings.length,
      materialCodeCount: materials.size,
      insulationCodeCount: insulation.size,
      componentCatalogCount: weights.size,
    },
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return requireAuthorizedEmpiricalLoadInput({ ...draft, semanticHash: computeAuthorizedEmpiricalLoadInputSemanticHash(draft) });
}

export function requireAuthorizedEmpiricalLoadInput(value) {
  exact(value, OUTPUT_KEYS, 'authorizedEmpiricalLoadInput');
  if (value.schema !== AUTHORIZED_EMPIRICAL_LOAD_INPUT_SCHEMA) fail('Unsupported empirical-load input.', 'EMPIRICAL_INPUT_SCHEMA_INVALID');
  const overlay = validateOverlay(value.loadCalculationOverlay);
  const result = {
    ...value,
    intakeId: identity(value.intakeId, 'intakeId'),
    projectId: identity(value.projectId, 'projectId'),
    baselineId: identity(value.baselineId, 'baselineId'),
    baselineRevision: integer(value.baselineRevision, 'baselineRevision'),
    baselineSemanticHash: hash(value.baselineSemanticHash, 'baselineSemanticHash'),
    readinessEvaluationSemanticHash: hash(value.readinessEvaluationSemanticHash, 'readinessEvaluationSemanticHash'),
    readinessSemanticHash: hash(value.readinessSemanticHash, 'readinessSemanticHash'),
    handoffSemanticHash: hash(value.handoffSemanticHash, 'handoffSemanticHash'),
    projectionPayloadSemanticHash: hash(value.projectionPayloadSemanticHash, 'projectionPayloadSemanticHash'),
    adapterVersion: identity(value.adapterVersion, 'adapterVersion'),
    configurationHash: hash(value.configurationHash, 'configurationHash'),
    createdAt: timestamp(value.createdAt, 'createdAt'),
    lineBindings: validateBindings(value.lineBindings, true),
    componentBindings: validateBindings(value.componentBindings, false),
    loadCalculationOverlay: overlay,
    overlaySemanticHash: hash(value.overlaySemanticHash, 'overlaySemanticHash'),
    summary: validateSummary(value.summary),
    semanticHash: hash(value.semanticHash, 'semanticHash'),
  };
  if (result.overlaySemanticHash !== semanticHash(overlay)) fail('Overlay hash is stale.', 'EMPIRICAL_INPUT_HASH_MISMATCH');
  checkRelations(result);
  if (result.semanticHash !== computeAuthorizedEmpiricalLoadInputSemanticHash(result)) fail('Input hash is stale.', 'EMPIRICAL_INPUT_HASH_MISMATCH');
  return deepFreeze(result);
}

function bindAuthority(handoff, payload) {
  if (handoff.status !== 'AUTHORIZED') fail('Authorized handoff required.', 'EMPIRICAL_INPUT_HANDOFF_NOT_AUTHORIZED');
  if (handoff.consumer !== 'EMPIRICAL_LOADS' || payload.consumer !== 'EMPIRICAL_LOADS') fail('Wrong consumer.', 'EMPIRICAL_INPUT_CONSUMER_MISMATCH');
  if (handoff.readiness.status !== 'READY') fail('READY evidence required.', 'EMPIRICAL_INPUT_NOT_READY');
  if (handoff.payload.payloadSchema !== AUTHORIZED_EMPIRICAL_LOAD_PROJECTION_SCHEMA || payload.payloadSchema !== AUTHORIZED_EMPIRICAL_LOAD_PROJECTION_SCHEMA) fail('Unsupported payload schema.', 'EMPIRICAL_INPUT_PAYLOAD_SCHEMA_INVALID');
  if (handoff.payload.payloadId !== payload.payloadId || handoff.payload.payloadSemanticHash !== payload.semanticHash || handoff.payload.adapterVersion !== payload.adapterVersion || handoff.payload.configurationHash !== payload.configurationHash || handoff.payload.createdAt !== payload.createdAt) fail('Payload descriptor mismatch.', 'EMPIRICAL_INPUT_PAYLOAD_BINDING_MISMATCH');
  if (handoff.baseline.semanticHash !== payload.baselineSemanticHash || handoff.readinessEvaluation.semanticHash !== payload.readinessEvaluationSemanticHash || handoff.readiness.semanticHash !== payload.readinessSemanticHash) fail('Evidence binding mismatch.', 'EMPIRICAL_INPUT_EVIDENCE_BINDING_MISMATCH');
}

function validateOverlay(value) {
  exact(value, OVERLAY_KEYS, 'loadCalculationOverlay');
  return {
    pipeSectionProperties: objectMap(value.pipeSectionProperties, 'pipeSectionProperties', (section, label) => {
      exact(section, ['outsideDiameterMm', 'wallThicknessMm', 'materialCode', 'insulationCode', 'insulationThicknessMm'], label);
      const od = positive(section.outsideDiameterMm, `${label}.outsideDiameterMm`);
      const wall = positive(section.wallThicknessMm, `${label}.wallThicknessMm`);
      if (wall * 2 >= od) fail('Invalid pipe section.', 'EMPIRICAL_INPUT_PIPE_SECTION_INVALID');
      return { outsideDiameterMm: od, wallThicknessMm: wall, materialCode: safe(section.materialCode, `${label}.materialCode`), insulationCode: section.insulationCode === null ? null : safe(section.insulationCode, `${label}.insulationCode`), insulationThicknessMm: nonnegative(section.insulationThicknessMm, `${label}.insulationThicknessMm`) };
    }),
    materialDensitiesKgPerM3: objectMap(value.materialDensitiesKgPerM3, 'materialDensitiesKgPerM3', positive),
    operatingFluidDensitiesKgPerM3: objectMap(value.operatingFluidDensitiesKgPerM3, 'operatingFluidDensitiesKgPerM3', positive),
    hydroFluidDensitiesKgPerM3: objectMap(value.hydroFluidDensitiesKgPerM3, 'hydroFluidDensitiesKgPerM3', positive),
    insulationDensitiesKgPerM3: objectMap(value.insulationDensitiesKgPerM3, 'insulationDensitiesKgPerM3', positive),
    componentWeightsKg: objectMap(value.componentWeightsKg, 'componentWeightsKg', positive),
  };
}

function validateBindings(value, line) {
  if (!Array.isArray(value)) fail('Bindings must be an array.', 'EMPIRICAL_INPUT_TYPE_INVALID');
  const keys = line ? ['targetId', 'sourceRecordId', 'lineKey', 'projectionRecordSemanticHash'] : ['targetId', 'sourceRecordId', 'lineKey', 'catalogKey', 'projectionRecordSemanticHash'];
  const rows = value.map((row) => {
    exact(row, keys, 'binding');
    return { ...row, targetId: identity(row.targetId, 'targetId'), sourceRecordId: identity(row.sourceRecordId, 'sourceRecordId'), lineKey: row.lineKey === null ? null : safe(row.lineKey, 'lineKey'), ...(line ? {} : { catalogKey: safe(row.catalogKey, 'catalogKey') }), projectionRecordSemanticHash: hash(row.projectionRecordSemanticHash, 'projectionRecordSemanticHash') };
  });
  for (let index = 1; index < rows.length; index += 1) if (rows[index - 1].targetId >= rows[index].targetId) fail('Bindings must be uniquely sorted.', 'EMPIRICAL_INPUT_BINDING_ORDER_INVALID');
  return rows;
}

function validateSummary(value) {
  const keys = ['lineCount', 'componentCount', 'materialCodeCount', 'insulationCodeCount', 'componentCatalogCount'];
  exact(value, keys, 'summary');
  return Object.fromEntries(keys.map((key) => [key, nonnegativeInteger(value[key], key)]));
}

function checkRelations(value) {
  const lineKeys = value.lineBindings.map((row) => row.lineKey).sort(ascii);
  if (new Set(lineKeys).size !== lineKeys.length) fail('Duplicate line binding.', 'EMPIRICAL_INPUT_DUPLICATE_LINE_KEY');
  for (const keys of [Object.keys(value.loadCalculationOverlay.pipeSectionProperties), Object.keys(value.loadCalculationOverlay.operatingFluidDensitiesKgPerM3), Object.keys(value.loadCalculationOverlay.hydroFluidDensitiesKgPerM3)]) if (JSON.stringify(keys) !== JSON.stringify(lineKeys)) fail('Line overlay mismatch.', 'EMPIRICAL_INPUT_OVERLAY_BINDING_MISMATCH');
  const materials = new Set(); const insulations = new Set();
  for (const section of Object.values(value.loadCalculationOverlay.pipeSectionProperties)) {
    materials.add(section.materialCode);
    if (section.insulationThicknessMm === 0 && section.insulationCode !== null) fail('Invalid uninsulated section.', 'EMPIRICAL_INPUT_INSULATION_INVALID');
    if (section.insulationThicknessMm > 0) {
      if (section.insulationCode === null) fail('Missing insulation code.', 'EMPIRICAL_INPUT_INSULATION_INVALID');
      insulations.add(section.insulationCode);
    }
  }
  if (JSON.stringify([...materials].sort(ascii)) !== JSON.stringify(Object.keys(value.loadCalculationOverlay.materialDensitiesKgPerM3)) || JSON.stringify([...insulations].sort(ascii)) !== JSON.stringify(Object.keys(value.loadCalculationOverlay.insulationDensitiesKgPerM3))) fail('Density overlay mismatch.', 'EMPIRICAL_INPUT_OVERLAY_BINDING_MISMATCH');
  const catalogs = [...new Set(value.componentBindings.map((row) => row.catalogKey))].sort(ascii);
  if (JSON.stringify(catalogs) !== JSON.stringify(Object.keys(value.loadCalculationOverlay.componentWeightsKg))) fail('Weight overlay mismatch.', 'EMPIRICAL_INPUT_OVERLAY_BINDING_MISMATCH');
  const summary = value.summary;
  if (summary.lineCount !== value.lineBindings.length || summary.componentCount !== value.componentBindings.length || summary.materialCodeCount !== materials.size || summary.insulationCodeCount !== insulations.size || summary.componentCatalogCount !== catalogs.length) fail('Summary mismatch.', 'EMPIRICAL_INPUT_SUMMARY_INVALID');
}

function binding(record, extra) { return { targetId: record.targetId, sourceRecordId: record.sourceRecordId, ...extra, projectionRecordSemanticHash: record.semanticHash }; }
function consistent(map, keyValue, value, code) { const key = safe(keyValue, 'bindingKey'); if (!map.has(key)) map.set(key, value); else if (semanticHash(map.get(key)) !== semanticHash(value)) fail('Conflicting exact values.', code, { key }); }
function sorted(map) { return Object.fromEntries([...map.entries()].sort(([a], [b]) => ascii(a, b))); }
function objectMap(value, label, validator) { if (!value || Array.isArray(value) || typeof value !== 'object') fail(`${label} must be an object.`, 'EMPIRICAL_INPUT_TYPE_INVALID'); const keys = Object.keys(value); if (JSON.stringify(keys) !== JSON.stringify([...keys].sort(ascii))) fail(`${label} must be sorted.`, 'EMPIRICAL_INPUT_ORDER_INVALID'); return Object.fromEntries(keys.map((key) => [safe(key, `${label}.key`), validator(value[key], `${label}.${key}`)])); }
function exact(value, keys, label) { if (!value || Array.isArray(value) || typeof value !== 'object') fail(`${label} must be an object.`, 'EMPIRICAL_INPUT_TYPE_INVALID'); const actual = Object.keys(value).sort(ascii); const expected = [...keys].sort(ascii); if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} has unexpected keys.`, 'EMPIRICAL_INPUT_KEYS_INVALID', { actual, expected }); }
function identity(value, label) { if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be non-empty.`, 'EMPIRICAL_INPUT_IDENTITY_INVALID'); return value; }
function safe(value, label) { const key = identity(value, label); if (UNSAFE_KEYS.has(key)) fail(`${label} is unsafe.`, 'EMPIRICAL_INPUT_UNSAFE_KEY'); return key; }
function positive(value, label) { if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) fail(`${label} must be positive.`, 'EMPIRICAL_INPUT_NUMBER_INVALID'); return value; }
function nonnegative(value, label) { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail(`${label} must be non-negative.`, 'EMPIRICAL_INPUT_NUMBER_INVALID'); return value; }
function integer(value, label) { if (!Number.isInteger(value) || value <= 0) fail(`${label} must be a positive integer.`, 'EMPIRICAL_INPUT_NUMBER_INVALID'); return value; }
function nonnegativeInteger(value, label) { if (!Number.isInteger(value) || value < 0) fail(`${label} must be non-negative.`, 'EMPIRICAL_INPUT_NUMBER_INVALID'); return value; }
function hash(value, label) { const result = identity(value, label); if (!/^fnv1a64:[0-9a-f]{16}$/u.test(result)) fail(`${label} must be a semantic hash.`, 'EMPIRICAL_INPUT_HASH_INVALID'); return result; }
function timestamp(value, label) { const result = identity(value, label); if (!Number.isFinite(Date.parse(result))) fail(`${label} must be an ISO timestamp.`, 'EMPIRICAL_INPUT_TIMESTAMP_INVALID'); return result; }
function ascii(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function byTarget(a, b) { return ascii(a.targetId, b.targetId); }
function fail(message, code, details = null) { const error = new Error(message); error.code = code; error.details = details === null ? null : deepFreeze(details); throw error; }
