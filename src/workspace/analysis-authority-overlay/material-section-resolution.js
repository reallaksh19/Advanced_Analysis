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

const ANALYZED_TYPES = new Set(['ELBO', 'FLAN', 'PIPE']);
const MATERIAL_ALIASES = new Map([
  ['ASTM A234-WPB', { materialId: 'CS_A234_WPB', materialStateId: 'MAT-CS_A234_WPB-293K' }],
  ['ASTM A105', { materialId: 'CS_A105', materialStateId: 'MAT-CS_A105-293K' }],
]);
const EVALUATION_TEMPERATURE = 293.15;
const SECTION_STATE_ID = 'SEC-NPS8-SCH100';
const NPS8_SCH100 = deepFreeze({ nps: 8, nominalBoreMm: 200, schedule: 100, outerDiameter: 0.2191, wallThickness: 0.01509 });
const MATERIAL_POINTS = deepFreeze([
  { absoluteTemperature: 293.15, elasticModulus: 2.0e11, shearModulus: 7.69e10, poissonRatio: 0.3, massDensity: 7850, thermalExpansionCoefficient: 1.17e-5 },
  { absoluteTemperature: 393.15, elasticModulus: 1.94e11, shearModulus: 7.46e10, poissonRatio: 0.3, massDensity: 7850, thermalExpansionCoefficient: 1.2e-5 },
]);

class MaterialSectionResolutionError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'MaterialSectionResolutionError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function resolveBranchMaterialSectionAuthority(dataset, branchId) {
  requireDataset(dataset);
  const targetBranchId = text(branchId, 'branchId');
  const branchEntities = dataset.entities
    .filter((entity) => entity.branchId === targetBranchId)
    .sort((left, right) => ascii(left.entityId, right.entityId));
  if (!branchEntities.some((entity) => entity.entityType === 'BRANCH')) {
    fail('MATERIAL_SECTION_RESOLUTION_BRANCH_MISSING', `Branch ${targetBranchId} is absent from the dataset.`);
  }

  const materialCache = new Map();
  const sectionCache = new Map();
  const direct = new Map();
  const autoPipes = [];
  const skipped = [];

  for (const entity of branchEntities) {
    if (entity.entityType === 'BRANCH') continue;
    if (entity.category === 'support') {
      skipped.push(skip(entity, 'MATERIAL_SECTION_RESOLUTION_SUPPORT_OUT_OF_SCOPE', 'Support authority is outside M008-C.'));
      continue;
    }
    if (entity.category === 'pipe' && entity.entityType === 'GASK') {
      skipped.push(skip(entity, 'MATERIAL_SECTION_RESOLUTION_GASKET_NOT_APPLICABLE', 'Gaskets are not independently meshed frame elements.'));
      continue;
    }
    if (entity.category !== 'pipe' || !ANALYZED_TYPES.has(entity.entityType)) {
      fail('MATERIAL_SECTION_RESOLUTION_ENTITY_UNSUPPORTED', `Entity ${entity.entityId} is not an authorized pipe/fitting type.`, { entityId: entity.entityId, entityType: entity.entityType, category: entity.category });
    }
    if (isAutoPipe(entity)) {
      autoPipes.push(entity);
      continue;
    }
    direct.set(entity.entityId, resolveDirectEntity(entity, materialCache, sectionCache));
  }

  const resolutions = new Map(direct);
  for (const entity of autoPipes.sort((left, right) => ascii(left.entityId, right.entityId))) {
    resolutions.set(entity.entityId, inheritAutoPipe(entity, branchEntities, direct));
  }

  return deepFreeze({
    materials: [...materialCache.values()].map((row) => row.table).sort((left, right) => ascii(left.materialId, right.materialId)),
    sections: [...sectionCache.values()].sort((left, right) => ascii(left.sectionState.sectionStateId, right.sectionState.sectionStateId)),
    entityResolutions: [...resolutions.values()].sort((left, right) => ascii(left.entityId, right.entityId)),
    skipped: skipped.sort((left, right) => ascii(left.entityId, right.entityId)),
  });
}

function resolveDirectEntity(entity, materialCache, sectionCache) {
  const attributes = entity.properties?.attributes || {};
  const materialSignal = text(attributes.MTXX, `entity ${entity.entityId} MTXX`);
  if (!/^ASTM\s+\S+$/u.test(materialSignal)) {
    fail('MATERIAL_SECTION_RESOLUTION_MATERIAL_NOT_SIMPLE', `Entity ${entity.entityId} MTXX is not a single ASTM grade.`, { entityId: entity.entityId, materialSignal });
  }
  const materialAuthority = MATERIAL_ALIASES.get(materialSignal);
  if (!materialAuthority) {
    fail('MATERIAL_SECTION_RESOLUTION_MATERIAL_UNSUPPORTED', `Entity ${entity.entityId} uses unsupported material ${materialSignal}.`, { entityId: entity.entityId, materialSignal });
  }
  const schedule = parseSchedule(attributes.DTXR, entity.entityId);
  const bore = resolveBore(attributes, entity.entityId);
  if (bore.value !== NPS8_SCH100.nominalBoreMm || schedule !== NPS8_SCH100.schedule) {
    fail('MATERIAL_SECTION_RESOLUTION_SIZE_UNSUPPORTED', `Entity ${entity.entityId} is not NPS 8 Schedule 100.`, { entityId: entity.entityId, boreMm: bore.value, schedule });
  }

  const material = materialResolution(materialAuthority, materialCache);
  const section = sectionResolution(sectionCache);
  return deepFreeze({
    entityId: entity.entityId,
    materialStateId: material.resolution.materialState.materialStateId,
    sectionStateId: section.sectionState.sectionStateId,
    materialResolutionSemanticHash: material.resolution.semanticHash,
    sectionResolutionSemanticHash: section.semanticHash,
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

function materialResolution(authority, cache) {
  if (cache.has(authority.materialId)) return cache.get(authority.materialId);
  const source = {
    sourceId: 'PUBLIC-CARBON-STEEL-BULK-PROPERTIES',
    sourceRevision: '2026-08-03',
    materialId: authority.materialId,
    points: MATERIAL_POINTS,
  };
  const table = sealMaterialTable({
    schema: 'fea-linear-material-table/v1',
    materialId: authority.materialId,
    sourceEvidence: {
      sourceId: source.sourceId,
      sourceRevision: source.sourceRevision,
      sourceSemanticHash: semanticHash(source),
    },
    points: MATERIAL_POINTS,
    semanticHash: '',
  });
  const resolution = resolveLinearFeaMaterialState({
    table,
    request: {
      materialStateId: authority.materialStateId,
      materialId: authority.materialId,
      evaluationTemperature: EVALUATION_TEMPERATURE,
    },
    profile: LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  });
  const accepted = deepFreeze({ table, resolution });
  cache.set(authority.materialId, accepted);
  return accepted;
}

function sectionResolution(cache) {
  if (cache.has(SECTION_STATE_ID)) return cache.get(SECTION_STATE_ID);
  const source = {
    sourceId: 'ASME-B36.10-NPS8-SCH100',
    sourceRevision: '2022',
    ...NPS8_SCH100,
  };
  const payload = {
    schema: PIPE_SECTION_REQUEST_SCHEMA,
    sectionStateId: SECTION_STATE_ID,
    formulationId: PIPE_SECTION_FORMULATION_ID,
    outerDiameter: NPS8_SCH100.outerDiameter,
    wallThickness: NPS8_SCH100.wallThickness,
    sourceEvidence: {
      sourceId: source.sourceId,
      sourceRevision: source.sourceRevision,
      sourceSemanticHash: semanticHash(source),
    },
  };
  const request = { ...payload, semanticHash: computePipeSectionRequestSemanticHash(payload) };
  const resolution = resolvePipeSection({ request, profile: PIPE_SECTION_PROFILE });
  cache.set(SECTION_STATE_ID, resolution);
  return resolution;
}

function inheritAutoPipe(entity, branchEntities, direct) {
  const bore = resolveBore(entity.properties?.attributes || {}, entity.entityId, ['LBORE']);
  const candidates = branchEntities
    .filter((candidate) => direct.has(candidate.entityId))
    .filter((candidate) => matchingBore(candidate, bore.value))
    .map((candidate) => adjacency(entity, candidate))
    .filter(Boolean)
    .sort((left, right) => left.distanceSquared - right.distanceSquared || ascii(left.entity.entityId, right.entity.entityId));
  if (candidates.length === 0) {
    fail('MATERIAL_SECTION_RESOLUTION_INHERITANCE_SOURCE_MISSING', `Auto pipe ${entity.entityId} has no adjacent resolved source with matching LBORE.`, { entityId: entity.entityId, boreMm: bore.value });
  }
  const chosen = candidates[0];
  const inherited = direct.get(chosen.entity.entityId);
  return deepFreeze({
    entityId: entity.entityId,
    materialStateId: inherited.materialStateId,
    sectionStateId: inherited.sectionStateId,
    materialResolutionSemanticHash: inherited.materialResolutionSemanticHash,
    sectionResolutionSemanticHash: inherited.sectionResolutionSemanticHash,
    evidence: {
      mode: 'INHERITED_ADJACENT_ENTITY',
      inheritedFromEntityId: chosen.entity.entityId,
      sharedPoint: chosen.sharedPoint,
      boreAttribute: bore.attribute,
      boreValue: entity.properties.attributes[bore.attribute],
    },
  });
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
  fail('MATERIAL_SECTION_RESOLUTION_BORE_NOT_PARSEABLE', `Entity ${entityId} has no parseable ${names.join('/')} value.`, { entityId });
}

function parseSchedule(value, entityId) {
  const match = typeof value === 'string' ? value.match(/\bSch\s+(\d+)\b/iu) : null;
  if (!match) fail('MATERIAL_SECTION_RESOLUTION_SCHEDULE_NOT_PARSEABLE', `Entity ${entityId} DTXR has no parseable schedule.`, { entityId, DTXR: value });
  return Number(match[1]);
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
  if (!point(start) || !point(end)) fail('MATERIAL_SECTION_RESOLUTION_GEOMETRY_MISSING', `Entity ${entity.entityId} lacks exact endpoint geometry.`, { entityId: entity.entityId });
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
    fail('MATERIAL_SECTION_RESOLUTION_DATASET_INVALID', 'A normalized workspace dataset is required.');
  }
}
function text(value, path) { if (typeof value !== 'string' || !value.trim()) fail('MATERIAL_SECTION_RESOLUTION_SIGNAL_MISSING', `${path} must be a nonempty string.`); return value.trim(); }
function point(value) { return value && [value.x, value.y, value.z].every(Number.isFinite); }
function pointKey(value) { return `${value.x}|${value.y}|${value.z}`; }
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(code, message, details) { throw new MaterialSectionResolutionError(code, message, details); }
