import {
  LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  resolveLinearFeaMaterialState,
  sealMaterialTable,
} from '../../core/linear-fea-material/index.js';
import {
  PIPE_SECTION_FORMULATION_ID,
  PIPE_SECTION_PROFILE,
  PIPE_SECTION_REQUEST_SCHEMA,
  computePipeSectionRequestSemanticHash,
  resolvePipeSection,
} from '../../core/linear-fea-section/index.js';
import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import {
  STAGEDJSON_BASELINE_TEMPERATURE_K,
  findStagedJsonMaterialCatalogEntry,
  findStagedJsonSectionCatalogEntry,
  stagedJsonMaterialSectionCatalog,
} from './stagedjson-material-section-catalog.js';

export const STAGEDJSON_MATERIAL_SECTION_AUTHORITY_SCHEMA = 'stagedjson-material-section-authority/v1';

const ANALYZED_TYPES = new Set(['ELBO', 'FLAN', 'PIPE']);
const MATERIAL_ROLES = ['BASELINE', 'OPERATING', 'DESIGN'];

class StagedJsonMaterialSectionResolutionError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'StagedJsonMaterialSectionResolutionError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function resolveStagedJsonMaterialSectionAuthority(dataset, branchId) {
  requireDataset(dataset);
  const targetBranchId = text(branchId, 'branchId');
  const catalog = stagedJsonMaterialSectionCatalog();
  const branchEntities = dataset.entities
    .filter((entity) => entity.branchId === targetBranchId)
    .sort((left, right) => ascii(left.entityId, right.entityId));
  if (!branchEntities.some((entity) => entity.entityType === 'BRANCH')) {
    fail('STAGEDJSON_MATERIAL_SECTION_BRANCH_MISSING', `Branch ${targetBranchId} is absent from the dataset.`);
  }

  const materialTables = new Map();
  const materialResolutions = new Map();
  const sectionCache = new Map();
  const direct = new Map();
  const autoPipes = [];
  const skipped = [];

  for (const entity of branchEntities) {
    if (entity.entityType === 'BRANCH') continue;
    if (entity.category === 'support') {
      skipped.push(skip(entity, 'STAGEDJSON_MATERIAL_SECTION_SUPPORT_OUT_OF_SCOPE', 'Support authority is resolved separately.'));
      continue;
    }
    if (entity.category === 'pipe' && entity.entityType === 'GASK') {
      skipped.push(skip(entity, 'STAGEDJSON_MATERIAL_SECTION_GASKET_NOT_APPLICABLE', 'Gaskets are not independently meshed frame elements.'));
      continue;
    }
    if (entity.category !== 'pipe' || !ANALYZED_TYPES.has(entity.entityType)) {
      fail('STAGEDJSON_MATERIAL_SECTION_ENTITY_UNSUPPORTED', `Entity ${entity.entityId} is not an authorized pipe/fitting type.`, {
        entityId: entity.entityId,
        entityType: entity.entityType,
        category: entity.category,
      });
    }
    if (isAutoPipe(entity)) {
      autoPipes.push(entity);
      continue;
    }
    direct.set(entity.entityId, resolveDirectEntity(entity, { materialTables, materialResolutions, sectionCache }));
  }

  const resolutions = new Map(direct);
  for (const entity of autoPipes.sort((left, right) => ascii(left.entityId, right.entityId))) {
    resolutions.set(entity.entityId, inheritAutoPipe(entity, branchEntities, direct, { materialTables, materialResolutions }));
  }

  const draft = {
    schema: STAGEDJSON_MATERIAL_SECTION_AUTHORITY_SCHEMA,
    authorityId: `STAGEDJSON:MATERIAL_SECTION:${targetBranchId}:R1`,
    branchId: targetBranchId,
    catalogRef: {
      schema: catalog.schema,
      catalogId: catalog.catalogId,
      semanticHash: catalog.semanticHash,
    },
    materials: [...materialTables.values()].sort((left, right) => ascii(left.materialId, right.materialId)),
    sections: [...sectionCache.values()].sort((left, right) => ascii(left.sectionState.sectionStateId, right.sectionState.sectionStateId)),
    entityResolutions: [...resolutions.values()].sort((left, right) => ascii(left.entityId, right.entityId)),
    skipped: skipped.sort((left, right) => ascii(left.entityId, right.entityId)),
  };
  return deepFreeze({ ...draft, semanticHash: semanticHash(draft) });
}

function resolveDirectEntity(entity, caches) {
  const attributes = entity.properties?.attributes || {};
  const materialSignal = text(attributes.MTXX, `entity ${entity.entityId} MTXX`);
  if (!/^ASTM\s+\S+$/u.test(materialSignal)) {
    fail('STAGEDJSON_MATERIAL_SIGNAL_NOT_SIMPLE', `Entity ${entity.entityId} MTXX is not a single ASTM grade.`, { entityId: entity.entityId, materialSignal });
  }
  const materialEntry = findStagedJsonMaterialCatalogEntry(materialSignal);
  if (!materialEntry) {
    fail('STAGEDJSON_MATERIAL_CATALOG_MISS', `Entity ${entity.entityId} uses material ${materialSignal} absent from the StagedJSON catalog.`, { entityId: entity.entityId, materialSignal });
  }
  const schedule = parseSchedule(attributes.DTXR, entity.entityId);
  const bore = resolveBore(attributes, entity.entityId);
  const sectionEntry = findStagedJsonSectionCatalogEntry({ nominalBoreMm: bore.value, schedule });
  if (!sectionEntry) {
    fail('STAGEDJSON_SECTION_CATALOG_MISS', `Entity ${entity.entityId} has no catalog section for bore ${bore.value} mm schedule ${schedule}.`, {
      entityId: entity.entityId,
      boreMm: bore.value,
      schedule,
    });
  }

  const section = sectionResolution(sectionEntry, caches.sectionCache);
  return buildEntityResolution({
    entity,
    materialEntry,
    section,
    materialTables: caches.materialTables,
    materialResolutions: caches.materialResolutions,
    evidence: {
      mode: 'DIRECT_RAW_ENTITY_SIGNAL',
      materialAttribute: 'MTXX',
      materialValue: materialSignal,
      sectionAttribute: 'DTXR',
      sectionValue: attributes.DTXR,
      boreAttribute: bore.attribute,
      boreValue: attributes[bore.attribute],
    },
  });
}

function inheritAutoPipe(entity, branchEntities, direct, caches) {
  const bore = resolveBore(entity.properties?.attributes || {}, entity.entityId, ['LBORE']);
  const candidates = branchEntities
    .filter((candidate) => direct.has(candidate.entityId))
    .filter((candidate) => matchingBore(candidate, bore.value))
    .map((candidate) => adjacency(entity, candidate))
    .filter(Boolean)
    .sort((left, right) => left.distanceSquared - right.distanceSquared || ascii(left.entity.entityId, right.entity.entityId));
  if (candidates.length === 0) {
    fail('STAGEDJSON_MATERIAL_SECTION_INHERITANCE_SOURCE_MISSING', `Auto pipe ${entity.entityId} has no adjacent catalog-resolved source with matching LBORE.`, {
      entityId: entity.entityId,
      boreMm: bore.value,
    });
  }
  const chosen = candidates[0];
  const inherited = direct.get(chosen.entity.entityId);
  const materialEntry = stagedJsonMaterialSectionCatalog().materials.find((entry) => entry.materialId === inherited.materialId);
  if (!materialEntry) fail('STAGEDJSON_MATERIAL_CATALOG_INTERNAL_MISS', `Catalog material ${inherited.materialId} is unavailable.`);
  return buildEntityResolution({
    entity,
    materialEntry,
    section: inherited.sectionResolution,
    materialTables: caches.materialTables,
    materialResolutions: caches.materialResolutions,
    evidence: {
      mode: 'INHERITED_ADJACENT_ENTITY',
      inheritedFromEntityId: chosen.entity.entityId,
      sharedPoint: chosen.sharedPoint,
      boreAttribute: bore.attribute,
      boreValue: entity.properties.attributes[bore.attribute],
    },
  });
}

function buildEntityResolution({ entity, materialEntry, section, materialTables, materialResolutions, evidence }) {
  const temperatures = roleTemperatures(entity);
  const materialStates = Object.fromEntries(MATERIAL_ROLES.map((role) => {
    const temperature = temperatures[role];
    if (temperature === null) return [role, null];
    const resolution = materialResolution(materialEntry, temperature, role, materialTables, materialResolutions);
    return [role, deepFreeze({
      materialStateId: resolution.materialState.materialStateId,
      evaluationTemperatureK: resolution.materialState.evaluationTemperature,
      method: resolution.resolution.method,
      resolutionSemanticHash: resolution.semanticHash,
      resolutionEvidenceHash: resolution.evidenceHash,
    })];
  }));
  const baseline = materialStates.BASELINE;
  if (!baseline) fail('STAGEDJSON_BASELINE_MATERIAL_STATE_MISSING', `${entity.entityId} has no baseline material state.`);
  return deepFreeze({
    entityId: entity.entityId,
    materialId: materialEntry.materialId,
    materialStateId: baseline.materialStateId,
    materialResolutionSemanticHash: baseline.resolutionSemanticHash,
    sectionStateId: section.sectionState.sectionStateId,
    sectionResolutionSemanticHash: section.semanticHash,
    materialStates,
    sectionResolution: section,
    evidence,
  });
}

function roleTemperatures(entity) {
  const enriched = entity.properties?.enrichedAttributes || {};
  return {
    BASELINE: STAGEDJSON_BASELINE_TEMPERATURE_K,
    OPERATING: celsiusOrNull(enriched.operatingTemperatureC),
    DESIGN: celsiusOrNull(enriched.designTemperatureC),
  };
}

function materialResolution(entry, evaluationTemperature, role, tableCache, resolutionCache) {
  let table = tableCache.get(entry.materialId);
  if (!table) {
    table = sealMaterialTable({
      schema: 'fea-linear-material-table/v1',
      materialId: entry.materialId,
      sourceEvidence: entry.source,
      points: entry.points,
      semanticHash: '',
    });
    tableCache.set(entry.materialId, table);
  }
  const cacheKey = `${entry.materialId}|${role}|${evaluationTemperature}`;
  if (resolutionCache.has(cacheKey)) return resolutionCache.get(cacheKey);
  const baseline = role === 'BASELINE';
  const materialStateId = baseline
    ? `MAT-${entry.materialId}-293K`
    : `MAT-${entry.materialId}-${role}-${temperatureToken(evaluationTemperature)}`;
  const resolution = resolveLinearFeaMaterialState({
    table,
    request: {
      materialStateId,
      materialId: entry.materialId,
      evaluationTemperature,
    },
    profile: LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  });
  resolutionCache.set(cacheKey, resolution);
  return resolution;
}

function sectionResolution(entry, cache) {
  if (cache.has(entry.sectionStateId)) return cache.get(entry.sectionStateId);
  const source = {
    sourceId: entry.source.sourceId,
    sourceRevision: entry.source.sourceRevision,
    sectionKey: entry.sectionKey,
    nominalBoreMm: entry.nominalBoreMm,
    schedule: entry.schedule,
    outerDiameter: entry.outerDiameter,
    wallThickness: entry.wallThickness,
  };
  const payload = {
    schema: PIPE_SECTION_REQUEST_SCHEMA,
    sectionStateId: entry.sectionStateId,
    formulationId: PIPE_SECTION_FORMULATION_ID,
    outerDiameter: entry.outerDiameter,
    wallThickness: entry.wallThickness,
    sourceEvidence: {
      sourceId: source.sourceId,
      sourceRevision: source.sourceRevision,
      sourceSemanticHash: semanticHash(source),
    },
  };
  const resolution = resolvePipeSection({
    request: { ...payload, semanticHash: computePipeSectionRequestSemanticHash(payload) },
    profile: PIPE_SECTION_PROFILE,
  });
  cache.set(entry.sectionStateId, resolution);
  return resolution;
}

function adjacency(autoEntity, candidate) {
  const autoPoints = geometryPoints(autoEntity);
  const candidatePoints = geometryPoints(candidate);
  const sharedPoint = autoPoints.find((point) => candidatePoints.includes(point));
  if (!sharedPoint) return null;
  const autoCenter = center(autoEntity);
  const candidateCenter = center(candidate);
  return { entity: candidate, sharedPoint, distanceSquared: squaredDistance(autoCenter, candidateCenter) };
}

function matchingBore(entity, expected) {
  try { return resolveBore(entity.properties?.attributes || {}, entity.entityId, ['LBORE']).value === expected; } catch { return false; }
}

function resolveBore(attributes, entityId, names = ['ABORE', 'LBORE']) {
  for (const attribute of names) {
    const match = typeof attributes[attribute] === 'string' ? attributes[attribute].match(/^\s*(\d+(?:\.\d+)?)\s*mm\s*$/iu) : null;
    if (match) return { attribute, value: Number(match[1]) };
  }
  fail('STAGEDJSON_BORE_NOT_PARSEABLE', `Entity ${entityId} has no parseable ${names.join('/')} value.`, { entityId });
}

function parseSchedule(value, entityId) {
  const match = typeof value === 'string' ? value.match(/\bSch\s+(\d+)\b/iu) : null;
  if (!match) fail('STAGEDJSON_SCHEDULE_NOT_PARSEABLE', `Entity ${entityId} DTXR has no parseable schedule.`, { entityId, DTXR: value });
  return Number(match[1]);
}

function celsiusOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  if (!Number.isFinite(value)) fail('STAGEDJSON_PROCESS_TEMPERATURE_INVALID', 'StagedJSON process temperature must be finite.');
  return Number((value + 273.15).toFixed(12));
}

function temperatureToken(value) {
  return `${String(value).replace('.', 'p')}K`;
}

function isAutoPipe(entity) {
  return entity.entityType === 'PIPE' && entity.properties?.attributes?.AUTO_GENERATED_PIPE === 'true';
}

function geometryPoints(entity) {
  const start = entity.properties?.geometry?.start;
  const end = entity.properties?.geometry?.end;
  if (!point(start) || !point(end)) return [];
  const left = pointKey(start);
  const right = pointKey(end);
  return left === right ? [left] : [left, right];
}

function center(entity) {
  const start = entity.properties?.geometry?.start;
  const end = entity.properties?.geometry?.end;
  if (!point(start) || !point(end)) fail('STAGEDJSON_MATERIAL_SECTION_GEOMETRY_MISSING', `Entity ${entity.entityId} lacks exact endpoint geometry.`, { entityId: entity.entityId });
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, z: (start.z + end.z) / 2 };
}

function squaredDistance(left, right) {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  const dz = left.z - right.z;
  return dx * dx + dy * dy + dz * dz;
}

function skip(entity, code, reason) { return deepFreeze({ entityId: entity.entityId, code, reason }); }
function requireDataset(dataset) {
  if (!dataset || dataset.schema !== 'analysis-workspace-dataset/v1' || typeof dataset.datasetId !== 'string' || !Array.isArray(dataset.entities)) {
    fail('STAGEDJSON_MATERIAL_SECTION_DATASET_INVALID', 'A normalized workspace dataset is required.');
  }
}
function text(value, path) { if (typeof value !== 'string' || !value.trim()) fail('STAGEDJSON_MATERIAL_SECTION_SIGNAL_MISSING', `${path} must be a nonempty string.`); return value.trim(); }
function point(value) { return value && [value.x, value.y, value.z].every(Number.isFinite); }
function pointKey(value) { return `${value.x}|${value.y}|${value.z}`; }
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(code, message, details) { throw new StagedJsonMaterialSectionResolutionError(code, message, details); }
