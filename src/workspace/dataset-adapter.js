import { createSourcePackageSnapshot } from '../core/shared-piping-model/source-package-snapshot.js';
import { buildSharedPipingModelFromWorkspaceDataset } from '../core/shared-piping-model/adapters/workspace-dataset-to-shared.js';
import { buildDatasetHierarchy } from './dataset-hierarchy.js';
import { isPipeType, isSupportType, resolveEntityType, selectionTypeFor } from './dataset-types.js';
import { extractGeometryEvidence } from './geometry-evidence.js';
import { indexWorkspaceSourcePackage } from './staged-model-index.js';
import {
  clonePlain,
  deterministicDatasetId,
  freezeDeep,
  isRecord,
  stringValue,
} from './dataset-utils.js';

export const WORKSPACE_DATASET_SCHEMA = 'analysis-workspace-dataset/v1';
const MANAGED_STAGE_SCHEMA = 'inputxml-managed-stage/v1';

export function normalizeWorkspaceDataset(rawPackage, sourceName = '', sourceEvidence = null) {
  const packageJson = normalizePackageRoot(rawPackage);
  const sourceSchema = stringValue(packageJson.schema) || inferSourceSchema(packageJson);
  const datasetId = deterministicDatasetId(packageJson, sourceName);
  const sourceSnapshot = createSourcePackageSnapshot({
    datasetId,
    sourceSchema,
    sourcePackage: packageJson,
    sourceBytes: sourceEvidence?.sourceBytes ?? null,
  });
  const indexed = indexWorkspaceSourcePackage(sourceSnapshot.sourcePackage, sourceSchema, { sourceSnapshot });
  const entities = normalizeEntities(indexed.entries, indexed.model);
  assertUniqueEntityIds(entities);
  const baseDataset = freezeDeep({
    schema: WORKSPACE_DATASET_SCHEMA,
    datasetId,
    sourceSchema,
    sourceName: stringValue(sourceName),
    sourceSnapshot,
    sourceSha256: stringValue(sourceEvidence?.sourceSha256).toLowerCase() || null,
    sourceModel: indexed.model,
    entities,
    hierarchy: buildDatasetHierarchy(entities),
    summary: summarizeEntities(entities, indexed.model),
    source: clonePlain(packageJson.source || {}),
    axisTransform: clonePlain(packageJson.axisTransform || {}),
  });
  return freezeDeep({
    ...baseDataset,
    sharedModel: buildSharedPipingModelFromWorkspaceDataset(baseDataset),
  });
}

/** Rebuilds immutable hierarchy, summary, and shared-model derivatives after an edit. */
export function rebuildWorkspaceDataset(dataset, entities, editAudit) {
  if (!dataset || dataset.schema !== WORKSPACE_DATASET_SCHEMA || !Array.isArray(entities)) {
    throw new TypeError(`Dataset rebuild requires ${WORKSPACE_DATASET_SCHEMA} and an entity array.`);
  }
  assertUniqueEntityIds(entities);
  const baseDataset = freezeDeep({
    ...clonePlain(dataset),
    entities,
    hierarchy: buildDatasetHierarchy(entities),
    summary: summarizeEntities(entities, dataset.sourceModel),
    version: Number(dataset.version || 0) + 1,
    editAudit: clonePlain(editAudit),
    calculationFreshness: 'STALE',
  });
  return freezeDeep({ ...baseDataset, sharedModel: buildSharedPipingModelFromWorkspaceDataset(baseDataset) });
}

function normalizePackageRoot(rawPackage) {
  if (Array.isArray(rawPackage)) return { schema: MANAGED_STAGE_SCHEMA, objects: rawPackage };
  if (!isRecord(rawPackage)) throw new TypeError('Workspace import must be a JSON object or array.');
  return rawPackage;
}

function inferSourceSchema(packageJson) {
  if (Array.isArray(packageJson.selected)) return 'json-viewer-selection/v1';
  if (Array.isArray(packageJson.objects)) return MANAGED_STAGE_SCHEMA;
  return 'unknown';
}

function normalizeEntities(entries, sourceModel) {
  const counts = sourceModel.indexes.bySourceEntityId;
  return entries.map((entry) => normalizeEntity(entry, counts));
}

function normalizeEntity({ item, node }, sourceIdIndex) {
  const entityType = resolveEntityType(item);
  const entityId = internalEntityId(node, sourceIdIndex);
  const sourcePath = node.sourcePath;
  const properties = buildEntityProperties(item, {
    entityId,
    sourceEntityId: node.sourceEntityId,
    name: node.name,
    entityType,
    sourcePath,
  });
  const dimensions = extractEntityDimensions(item);
  return freezeDeep({
    entityId,
    sourceEntityId: node.sourceEntityId,
    name: node.name,
    entityType,
    selectionType: selectionTypeFor(entityType),
    sourcePath,
    sourceNodeKey: node.sourceNodeKey,
    parentSourceNodeKey: node.parentSourceNodeKey,
    jsonPointer: node.jsonPointer,
    lineId: node.lineId,
    branchId: node.branchId,
    branchOwner: stringValue(item.attributes?.OWNER) || node.branchId,
    lineKey: node.lineKey || node.lineId,
    lineNumber: node.lineNumber || '',
    service: node.service || '',
    pipingClass: node.pipingClass || '',
    nominalDiameterMm: node.nominalDiameterMm || dimensions.boreMm || null,
    outsideDiameterMm: dimensions.outsideDiameterMm,
    boreMm: dimensions.boreMm,
    wallThicknessMm: dimensions.wallThicknessMm,
    insulationCode: node.insulationCode || '',
    branchSuffix: node.branchSuffix || '',
    componentReference: stringValue(item.attributes?.REF || item.attributes?.NAME),
    systemId: node.systemId,
    zoneId: node.zoneId,
    sourceNodeId: node.sourceNodeKey,
    parentSourceNodeId: node.parentSourceNodeKey,
    sourceChildIndex: node.childIndex,
    sourceDepth: node.depth,
    sourceRootGroup: node.rootGroup,
    category: isSupportType(entityType) ? 'support' : isPipeType(entityType) ? 'pipe' : 'component',
    properties,
  });
}

function internalEntityId(node, sourceIdIndex) {
  const sourceId = stringValue(node.sourceEntityId);
  const occurrences = sourceId ? sourceIdIndex[sourceId]?.length || 0 : 0;
  return sourceId && occurrences === 1 ? sourceId : `entity:${node.sourceNodeKey}`;
}

function buildEntityProperties(item, identity) {
  return freezeDeep({
    identity,
    geometry: extractGeometryEvidence(item),
    sourceAttributes: clonePlain(item.sourceAttributes || {}),
    attributes: clonePlain(item.attributes || {}),
    enrichedAttributes: clonePlain(item.enrichedAttributes || {}),
    nativeParams: clonePlain(item.nativeParams || {}),
    diagnostics: clonePlain(Array.isArray(item.diagnostics) ? item.diagnostics : []),
  });
}

function extractEntityDimensions(item) {
  const attributes = item?.attributes || {};
  const enriched = item?.enrichedAttributes || {};
  const native = item?.nativeParams || {};
  return {
    outsideDiameterMm: firstPositiveMillimetres(
      item?.outsideDiameterMm,
      native.outsideDiameterMm,
      native.outerDiameter,
      attributes.OUTSIDE_DIAMETER_MM,
      attributes.OUTSIDE_DIAMETER,
      attributes.OD_MM,
      attributes.OD,
      enriched.outsideDiameterMm,
      enriched.OUTSIDE_DIAMETER_MM,
      enriched.OUTSIDE_DIAMETER,
    ),
    boreMm: firstPositiveMillimetres(
      item?.boreMm,
      native.boreMm,
      native.bore,
      attributes.BORE_MM,
      attributes.BORE,
      attributes.NOMINAL_BORE_MM,
      attributes.ABORE,
      attributes.LBORE,
      enriched.boreMm,
      enriched.BORE,
    ),
    wallThicknessMm: firstPositiveMillimetres(
      item?.wallThicknessMm,
      native.wallThicknessMm,
      native.wallThickness,
      attributes.WALL_THICKNESS_MM,
      attributes.WALL_THICKNESS,
      attributes.WT_MM,
      enriched.wallThicknessMm,
      enriched.WALL_THICKNESS_MM,
    ),
  };
}

function firstPositiveMillimetres(...values) {
  for (const value of values) {
    const parsed = parseMillimetres(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function parseMillimetres(value) {
  if (Number.isFinite(value) && value > 0) return Number(value);
  const match = String(value ?? '').trim().match(/^([+]?(?:\d+(?:\.\d*)?|\.\d+))(?:\s*mm)?$/iu);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function summarizeEntities(entities, sourceModel) {
  return freezeDeep({
    nodeCount: entities.length,
    sourceNodeCount: sourceModel.summary.nodeCount,
    sourceRootCount: sourceModel.summary.rootCount,
    pipes: entities.filter((entity) => entity.category === 'pipe').length,
    supports: entities.filter((entity) => entity.category === 'support').length,
    components: entities.filter((entity) => entity.category === 'component').length,
  });
}

function assertUniqueEntityIds(entities) {
  const ids = new Set();
  entities.forEach((entity) => {
    if (ids.has(entity.entityId)) throw new Error(`Duplicate workspace entity ID: ${entity.entityId}.`);
    ids.add(entity.entityId);
  });
}
