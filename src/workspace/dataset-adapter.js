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

export function normalizeWorkspaceDataset(rawPackage, sourceName = '') {
  const packageJson = normalizePackageRoot(rawPackage);
  const sourceSchema = stringValue(packageJson.schema) || inferSourceSchema(packageJson);
  const datasetId = deterministicDatasetId(packageJson, sourceName);
  const sourceSnapshot = createSourcePackageSnapshot({
    datasetId,
    sourceSchema,
    sourcePackage: packageJson,
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
    systemId: node.systemId,
    zoneId: node.zoneId,
    sourceNodeId: node.sourceNodeKey,
    parentSourceNodeId: node.parentSourceNodeKey,
    sourceChildIndex: node.childIndex,
    sourceDepth: node.depth,
    sourceRootGroup: node.rootGroup,
    category: isSupportType(entityType) ? 'support' : isPipeType(entityType) ? 'pipe' : 'component',
    properties: buildEntityProperties(item, { entityId, sourceEntityId: node.sourceEntityId, name: node.name, entityType, sourcePath }),
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
