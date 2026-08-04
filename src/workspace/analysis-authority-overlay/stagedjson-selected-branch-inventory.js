import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import {
  STAGEDJSON_PROCESS_INHERITANCE_POLICY,
  STAGEDJSON_RESOLUTION_STATUS,
  ascii,
  fail,
  normalizeDatasetRef,
  text,
} from './stagedjson-resolution-common.js';

export const STAGEDJSON_SELECTED_BRANCH_INVENTORY_SCHEMA = 'stagedjson-selected-branch-inventory/v1';

const PROCESS_SOURCE_FIELDS = deepFreeze([
  'designPressureMpa',
  'designTemperatureC',
  'operatingTemperatureC',
  'minimumTemperatureC',
  'hydroPressure',
  'fluidDensityOpeKgM3',
  'fluidDensityHydKgM3',
  'insulationThicknessMm',
  'insulationDensityKgM3',
  'materialDensityKgM3',
  'corrosionAllowanceMm',
  'fluidPhase',
  'fluidService',
]);
const REFERENCE_TEMPERATURE_FIELDS = ['referenceTemperatureC', 'installationTemperatureC', 'ambientTemperatureC'];
const OPERATING_PRESSURE_FIELDS = ['operatingPressureMpa', 'operatingPressure', 'pressureOperatingMpa'];

export function buildStagedJsonSelectedBranchInventory({
  dataset,
  branchId,
  materialSectionAuthority,
  materialSectionResolverSource,
}) {
  const selectedBranchId = text(branchId, 'branchId');
  const branchEntities = dataset.entities
    .filter((entity) => entity.branchId === selectedBranchId)
    .sort((left, right) => ascii(left.entityId, right.entityId));
  if (!branchEntities.some((entity) => entity.entityType === 'BRANCH')) {
    fail('STAGEDJSON_BRANCH_INVENTORY_BRANCH_MISSING', `${selectedBranchId} is absent from the dataset.`);
  }
  const entityIds = branchEntities.map((entity) => entity.entityId);
  const supportEntityIds = branchEntities
    .filter((entity) => entity.category === 'support')
    .map((entity) => entity.entityId);
  const analysisEntityIds = authorityEntityIds(materialSectionAuthority);
  const byId = new Map(branchEntities.map((entity) => [entity.entityId, entity]));
  for (const entityId of analysisEntityIds) {
    if (!byId.has(entityId)) fail('STAGEDJSON_BRANCH_INVENTORY_AUTHORITY_OUTSIDE_BRANCH', `${entityId} is outside ${selectedBranchId}.`);
  }
  const analysisEntities = analysisEntityIds.map((entityId) => byId.get(entityId));
  const processFields = PROCESS_SOURCE_FIELDS.map((field) => inventoryField(field, analysisEntities));
  const operatingC = uniqueFiniteValues(analysisEntities, ['operatingTemperatureC']);
  const designC = uniqueFiniteValues(analysisEntities, ['designTemperatureC']);
  const referenceC = uniqueFiniteValues(analysisEntities, REFERENCE_TEMPERATURE_FIELDS);
  const operatingK = operatingC.map(celsiusToKelvin);
  const designK = designC.map(celsiusToKelvin);
  const referenceK = referenceC.map(celsiusToKelvin);
  const tableRanges = materialTableRanges(materialSectionAuthority);
  const sourceConflicts = collectSourceConflicts(analysisEntities);
  const qualificationBlockers = blockers({
    analysisEntities,
    referenceC,
    operatingK,
    designK,
    tableRanges,
    resolverSource: String(materialSectionResolverSource ?? ''),
  });
  const draft = {
    schema: STAGEDJSON_SELECTED_BRANCH_INVENTORY_SCHEMA,
    datasetRef: normalizeDatasetRef({
      datasetId: dataset.datasetId,
      sourceId: dataset.sourceName,
      sourceSha256: dataset.sourceSha256,
      sourceSnapshotSemanticHash: dataset.sourceSnapshot.sourceSemanticHash,
    }, dataset),
    branchId: selectedBranchId,
    processInheritancePolicy: STAGEDJSON_PROCESS_INHERITANCE_POLICY,
    entityIds,
    supportEntityIds,
    analysisEntityIds,
    processFields,
    temperatureInventory: {
      REFERENCE: temperatureInventory('referenceTemperature', referenceC, referenceK),
      OPERATING: temperatureInventory('operatingTemperatureC', operatingC, operatingK),
      DESIGN: temperatureInventory('designTemperatureC', designC, designK),
    },
    materialSectionInventory: {
      resolvedEntityCount: analysisEntityIds.length,
      materialIds: uniqueSorted((materialSectionAuthority.materials || []).map((row) => row.materialId)),
      sectionStateIds: uniqueSorted((materialSectionAuthority.sections || []).map((row) => row.sectionState?.sectionStateId).filter(Boolean)),
      materialTableRanges: tableRanges,
      operatingTemperaturesCovered: temperaturesCovered(operatingK, tableRanges),
      designTemperaturesCovered: temperaturesCovered(designK, tableRanges),
      resolverCapabilities: resolverCapabilities(String(materialSectionResolverSource ?? '')),
    },
    sourceConflicts,
    qualificationBlockers,
    semanticHash: '',
  };
  draft.semanticHash = computeStagedJsonSelectedBranchInventorySemanticHash(draft);
  return deepFreeze(draft);
}

export function computeStagedJsonSelectedBranchInventorySemanticHash(value) {
  return semanticHash({
    schema: value.schema,
    datasetRef: value.datasetRef,
    branchId: value.branchId,
    processInheritancePolicy: value.processInheritancePolicy,
    entityIds: value.entityIds,
    supportEntityIds: value.supportEntityIds,
    analysisEntityIds: value.analysisEntityIds,
    processFields: value.processFields,
    temperatureInventory: value.temperatureInventory,
    materialSectionInventory: value.materialSectionInventory,
    sourceConflicts: value.sourceConflicts,
    qualificationBlockers: value.qualificationBlockers,
  });
}

function inventoryField(field, entities) {
  const declaredEntityIds = [];
  const missingEntityIds = [];
  const values = [];
  for (const entity of entities) {
    const value = entity.properties?.enrichedAttributes?.[field];
    if (value === null || value === undefined || value === '') missingEntityIds.push(entity.entityId);
    else { declaredEntityIds.push(entity.entityId); values.push(value); }
  }
  return {
    field,
    declaredEntityIds: declaredEntityIds.sort(ascii),
    missingEntityIds: missingEntityIds.sort(ascii),
    uniqueValues: uniqueJsonValues(values),
  };
}

function temperatureInventory(sourceField, valuesC, valuesK) {
  return {
    sourceField,
    status: valuesC.length === 0 ? STAGEDJSON_RESOLUTION_STATUS.MISSING : STAGEDJSON_RESOLUTION_STATUS.DECLARED,
    uniqueCelsius: valuesC,
    uniqueKelvin: valuesK,
  };
}

function authorityEntityIds(authority) {
  if (!authority || !Array.isArray(authority.entityResolutions)) {
    fail('STAGEDJSON_BRANCH_INVENTORY_MATERIAL_SECTION_AUTHORITY_INVALID', 'M008-C material/section authority is required.');
  }
  return authority.entityResolutions.map((row) => text(row.entityId, 'materialSectionAuthority.entityResolutions.entityId')).sort(ascii);
}

function materialTableRanges(authority) {
  return (authority.materials || []).map((table) => {
    const temperatures = (table.points || []).map((point) => point.absoluteTemperature).filter(Number.isFinite).sort((left, right) => left - right);
    if (temperatures.length === 0) fail('STAGEDJSON_BRANCH_INVENTORY_MATERIAL_TABLE_EMPTY', `Material ${table.materialId} has no temperature points.`);
    return { materialId: table.materialId, minimumTemperatureK: temperatures[0], maximumTemperatureK: temperatures.at(-1) };
  }).sort((left, right) => ascii(left.materialId, right.materialId));
}

function resolverCapabilities(source) {
  return {
    hasEmbeddedMaterialAliasMap: /const\s+MATERIAL_ALIASES\s*=\s*new\s+Map/u.test(source),
    hasEmbeddedNps8Schedule100Section: /NPS8_SCH100/u.test(source),
    hasSingleEvaluationTemperature: /const\s+EVALUATION_TEMPERATURE\s*=\s*293\.15/u.test(source),
  };
}

function blockers({ analysisEntities, referenceC, operatingK, designK, tableRanges, resolverSource }) {
  const rows = [];
  if (referenceC.length === 0) rows.push(blocker(
    'STAGEDJSON_REFERENCE_TEMPERATURE_MISSING',
    'BRANCH',
    'No installation/reference temperature is declared by the selected branch entities.',
  ));
  if (!hasAnyDeclaredField(analysisEntities, OPERATING_PRESSURE_FIELDS)) rows.push(blocker(
    'STAGEDJSON_OPERATING_ANALYSIS_PRESSURE_POLICY_MISSING',
    'BRANCH',
    'The fixture declares designPressureMpa but no separately governed operating analysis pressure.',
  ));
  if (hasAnyDeclaredField(analysisEntities, ['hydroPressure'])) rows.push(blocker(
    'STAGEDJSON_HYDRO_PRESSURE_UNIT_UNDECLARED',
    'BRANCH',
    'hydroPressure has no unit encoded in its field name or sealed authority contract.',
  ));
  if (operatingK.length > 0 && !temperaturesCovered(operatingK, tableRanges)) rows.push(blocker(
    'STAGEDJSON_OPERATING_MATERIAL_TABLE_RANGE_INSUFFICIENT',
    'MATERIAL',
    `Operating material states require ${operatingK.join(', ')} K but the current tables end at ${tableRanges.map((row) => `${row.materialId}:${row.maximumTemperatureK}`).join(', ')} K.`,
  ));
  if (designK.length > 0 && !temperaturesCovered(designK, tableRanges)) rows.push(blocker(
    'STAGEDJSON_DESIGN_MATERIAL_TABLE_RANGE_INSUFFICIENT',
    'MATERIAL',
    `Design material states require ${designK.join(', ')} K but the current tables do not bracket those temperatures.`,
  ));
  const capabilities = resolverCapabilities(resolverSource);
  if (capabilities.hasEmbeddedMaterialAliasMap || capabilities.hasEmbeddedNps8Schedule100Section) rows.push(blocker(
    'STAGEDJSON_MATERIAL_SECTION_CATALOG_GENERALIZATION_REQUIRED',
    'MATERIAL_SECTION',
    'The current M008-C resolver embeds its alias and NPS 8 Schedule 100 authority in source code.',
  ));
  rows.push(blocker(
    'STAGEDJSON_SUPPORT_AUTHORITY_UNRESOLVED',
    'SUPPORT',
    'The selected support records have not yet been grouped into governed attachment and restraint authorities.',
  ));
  return rows.sort((left, right) => ascii(`${left.code}|${left.scope}`, `${right.code}|${right.scope}`));
}

function collectSourceConflicts(entities) {
  const rows = [];
  for (const entity of entities) {
    const raw = entity.properties?.attributes || {};
    const enriched = entity.properties?.enrichedAttributes || {};
    const rawSchedule = parseSchedule(raw.DTXR);
    const enrichedSchedule = finiteOrNull(enriched.schedule);
    if (rawSchedule !== null && enrichedSchedule !== null && rawSchedule !== enrichedSchedule) {
      rows.push({ entityId: entity.entityId, domain: 'SECTION', rawField: 'DTXR', rawValue: raw.DTXR, enrichedField: 'schedule', enrichedValue: enriched.schedule });
    }
    const rawMaterial = normalizedText(raw.MTXX);
    const enrichedMaterial = normalizedText(enriched.material);
    if (rawMaterial && enrichedMaterial && rawMaterial !== enrichedMaterial) {
      rows.push({ entityId: entity.entityId, domain: 'MATERIAL', rawField: 'MTXX', rawValue: raw.MTXX, enrichedField: 'material', enrichedValue: enriched.material });
    }
  }
  return rows.sort((left, right) => ascii(`${left.entityId}|${left.domain}`, `${right.entityId}|${right.domain}`));
}

function uniqueFiniteValues(entities, fields) {
  const values = [];
  for (const entity of entities) {
    const attrs = entity.properties?.enrichedAttributes || {};
    for (const field of fields) {
      if (Number.isFinite(attrs[field])) values.push(attrs[field]);
    }
  }
  return uniqueSorted(values, (left, right) => left - right);
}
function temperaturesCovered(temperatures, ranges) { return temperatures.length > 0 && ranges.length > 0 && temperatures.every((temperature) => ranges.every((range) => temperature >= range.minimumTemperatureK && temperature <= range.maximumTemperatureK)); }
function hasAnyDeclaredField(entities, fields) { return entities.some((entity) => fields.some((field) => { const value = entity.properties?.enrichedAttributes?.[field]; return value !== null && value !== undefined && value !== ''; })); }
function celsiusToKelvin(value) { return Number((value + 273.15).toFixed(12)); }
function parseSchedule(value) { const match = typeof value === 'string' ? value.match(/\bSch\s+(\d+)\b/iu) : null; return match ? Number(match[1]) : null; }
function finiteOrNull(value) { const numeric = typeof value === 'number' ? value : Number(value); return Number.isFinite(numeric) ? numeric : null; }
function normalizedText(value) { return typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/gu, ' ') : ''; }
function uniqueJsonValues(values) { const byHash = new Map(values.map((value) => [semanticHash(value), value])); return [...byHash.entries()].sort(([left], [right]) => ascii(left, right)).map(([, value]) => value); }
function uniqueSorted(values, compare = ascii) { return [...new Set(values)].sort(compare); }
function blocker(code, scope, details) { return { code, scope, details }; }
