import { createDiagnostic, DIAGNOSTIC_SEVERITY, sortDiagnostics } from '../core/shared-piping-model/diagnostics.js';
import { deepFreeze, isPlainRecord, stringValue } from '../core/shared-piping-model/immutable.js';
import { validateStagedModelIndexContract } from './shared-model-index-validation.js';

export const STAGED_MODEL_INDEX_SCHEMA = 'staged-model-index/v2';
const SELECTED_PACKAGE_SCHEMA = 'rvm-selected-geometry-workspace-package/v1';
const MANAGED_STAGE_SCHEMA = 'inputxml-managed-stage/v1';
const IDENTITY_ALIASES = Object.freeze({
  lineId: ['LINE_ID', 'LINE_NO', 'LINE_NUMBER', 'LINENO', 'LINE', 'LINEKEY'],
  branchId: ['BRANCH_ID', 'BRANCH'],
  systemId: ['SYSTEM_ID', 'SYSTEM'],
  zoneId: ['ZONE_ID', 'ZONE'],
});

export function indexWorkspaceSourcePackage(packageJson, sourceSchema, options = {}) {
  const roots = sourceRoots(packageJson, sourceSchema);
  const state = createTraversalState();
  roots.forEach((root) => visitSourceRecord({ ...root, parent: null, depth: 0 }, state));
  addDuplicateIdentityDiagnostics(state);
  const diagnostics = sortDiagnostics(state.diagnostics);
  const model = buildIndexModel(state, sourceSchema, options.sourceSnapshot, diagnostics);
  return { entries: state.entries, model };
}

export function validateStagedModelIndex(model) {
  return validateStagedModelIndexContract(model, STAGED_MODEL_INDEX_SCHEMA);
}

function createTraversalState() {
  return {
    nodes: [], entries: [], roots: [], diagnostics: [],
    validation: validationAudit(), seen: new WeakMap(), active: new WeakSet(),
  };
}

function visitSourceRecord(descriptor, state) {
  if (!isPlainRecord(descriptor.item)) return recordUnsupported(descriptor, state);
  const node = createNode(descriptor, state);
  state.nodes.push(node);
  state.entries.push({ item: descriptor.item, node });
  if (!descriptor.parent) state.roots.push(node.sourceNodeKey);
  const repeatedKey = state.seen.get(descriptor.item);
  if (state.active.has(descriptor.item)) return recordCycle(node, repeatedKey, state);
  if (repeatedKey) return recordRepeatedReference(node, repeatedKey, state);
  state.seen.set(descriptor.item, node.sourceNodeKey);
  state.active.add(descriptor.item);
  visitChildren(descriptor.item, node, state);
  state.active.delete(descriptor.item);
  return node;
}

function visitChildren(item, node, state) {
  if (item.children === undefined || item.children === null) return;
  if (!Array.isArray(item.children)) return recordInvalidChildren(node, 'children is not an array', state);
  item.children.forEach((child, childIndex) => {
    const jsonPointer = `${node.jsonPointer}/children/${childIndex}`;
    if (!isPlainRecord(child)) return recordInvalidChild(node, jsonPointer, childIndex, state);
    const childNode = visitSourceRecord({
      item: child, parent: node, childIndex, depth: node.depth + 1,
      jsonPointer, rootGroup: node.rootGroup,
    }, state);
    if (childNode) node.childSourceNodeKeys.push(childNode.sourceNodeKey);
  });
}

function createNode(descriptor, state) {
  const sourceEntityId = readSourceEntityId(descriptor.item);
  const sourceNodeKey = `source-node:${descriptor.jsonPointer}`;
  const identity = inheritedIdentity(descriptor.item, descriptor.parent);
  const node = {
    sourceNodeKey, sourceEntityId, jsonPointer: descriptor.jsonPointer,
    parentSourceNodeKey: descriptor.parent?.sourceNodeKey || '', childSourceNodeKeys: [],
    childIndex: descriptor.childIndex, depth: descriptor.depth, rootGroup: descriptor.rootGroup,
    type: sourceType(descriptor.item), name: sourceName(descriptor.item, sourceEntityId, sourceNodeKey),
    sourcePath: sourcePathFor(descriptor.item, descriptor.parent?.sourcePath, sourceEntityId),
    ...identity, diagnostics: [],
  };
  addCompatibilityAliases(node);
  if (!sourceEntityId) recordMissingIdentity(node, state);
  return node;
}

function addCompatibilityAliases(node) {
  node.nodeId = node.sourceNodeKey;
  node.entityId = node.sourceEntityId || `MISSING@${node.sourceNodeKey}`;
  node.parentNodeId = node.parentSourceNodeKey;
  node.childNodeIds = node.childSourceNodeKeys;
}

function inheritedIdentity(item, parent) {
  return Object.fromEntries(Object.entries(IDENTITY_ALIASES).map(([field, aliases]) => [
    field,
    firstSourceValue(item, aliases) || parent?.[field] || '',
  ]));
}

function addDuplicateIdentityDiagnostics(state) {
  const groups = groupBy(state.nodes.filter((node) => node.sourceEntityId), 'sourceEntityId');
  Object.entries(groups).filter(([, rows]) => rows.length > 1).forEach(([sourceEntityId, rows]) => {
    const nodeKeys = rows.map((row) => row.sourceNodeKey);
    state.validation.duplicateSourceIds.push({ sourceEntityId, sourceNodeKeys: nodeKeys });
    rows.forEach((node) => addNodeDiagnostic(node, state, 'DUPLICATE_SOURCE_ID',
      `Source entity ID ${sourceEntityId} occurs ${rows.length} times.`, { sourceEntityId, sourceNodeKeys: nodeKeys }));
  });
}

function buildIndexModel(state, sourceSchema, sourceSnapshot, diagnostics) {
  const indexes = buildIndexes(state.nodes);
  return deepFreeze({
    schema: STAGED_MODEL_INDEX_SCHEMA, sourceSchema,
    sourceSnapshotRef: snapshotReference(sourceSnapshot),
    sourcePackage: sourceSnapshot?.sourcePackage || null,
    rootSourceNodeKeys: state.roots, rootNodeIds: state.roots,
    nodes: state.nodes, indexes, validation: state.validation, diagnostics,
    summary: {
      nodeCount: state.nodes.length, rootCount: state.roots.length,
      supportCount: state.nodes.filter((node) => isSupportType(node.type)).length,
      diagnosticCount: diagnostics.length,
    },
  });
}

function buildIndexes(nodes) {
  return deepFreeze({
    bySourceNodeKey: indexPositions(nodes, 'sourceNodeKey'),
    bySourceEntityId: indexGroups(nodes, 'sourceEntityId'),
    byLineId: indexGroups(nodes, 'lineId'),
    byBranchId: indexGroups(nodes, 'branchId'),
    byType: indexGroups(nodes, 'type'),
    bySourcePath: indexGroups(nodes, 'sourcePath'),
  });
}

function sourceRoots(packageJson, sourceSchema) {
  if (sourceSchema === SELECTED_PACKAGE_SCHEMA) return selectedGeometryRoots(packageJson);
  if (sourceSchema === MANAGED_STAGE_SCHEMA) return objectRoots(packageJson.objects, '/objects', 'staged');
  if (Array.isArray(packageJson.selected)) return selectedItemRoots(packageJson.selected);
  throw new Error(`Unsupported workspace package schema: ${sourceSchema}.`);
}

function selectedGeometryRoots(packageJson) {
  if (!isPlainRecord(packageJson.geometry)) throw new TypeError('Workspace package geometry must be an object.');
  return [
    ...objectRoots(packageJson.geometry.objects, '/geometry/objects', 'objects'),
    ...objectRoots(packageJson.geometry.supports, '/geometry/supports', 'supports'),
  ];
}

function objectRoots(value, pointer, rootGroup) {
  if (!Array.isArray(value)) throw new TypeError(`Workspace field "${pointer}" must be an array.`);
  return value.map((item, childIndex) => ({ item, childIndex, jsonPointer: `${pointer}/${childIndex}`, rootGroup }));
}

function selectedItemRoots(selected) {
  return selected.map((entry, childIndex) => ({
    item: entry?.item, childIndex, jsonPointer: `/selected/${childIndex}/item`, rootGroup: 'selected',
  }));
}

function readSourceEntityId(item) {
  return stringValue(item.sourceId || item.id || item.nodeId || item.sourceAttributes?.ID || item.attributes?.ID) || null;
}

function sourceName(item, sourceEntityId, sourceNodeKey) {
  return stringValue(item.name || item.nodeName || item.sourceAttributes?.NAME || item.attributes?.NAME)
    || sourceEntityId || sourceNodeKey;
}

function sourceType(item) {
  return stringValue(item.type || item.kind || item.sourceAttributes?.TYPE || item.attributes?.TYPE || item.nativeParams?.role)
    .toUpperCase() || 'OBJECT';
}

function sourcePathFor(item, parentPath, sourceEntityId) {
  const explicit = stringValue(item.sourcePath || item.path || item.sourceAttributes?.PATH);
  if (explicit) return explicit;
  const parent = stringValue(parentPath).replace(/\/$/, '');
  return `${parent}/${sourceEntityId || 'missing-source-id'}`;
}

function firstSourceValue(item, aliases) {
  const wanted = new Set(aliases.map(normalizeKey));
  for (const root of [item, item.sourceAttributes, item.attributes, item.enrichedAttributes]) {
    const found = findValue(root, wanted, 0);
    if (found) return stringValue(found);
  }
  return '';
}

function findValue(value, wanted, depth) {
  if (!isPlainRecord(value) || depth > 4) return null;
  for (const [key, child] of Object.entries(value)) if (wanted.has(normalizeKey(key))) return child;
  for (const child of Object.values(value)) {
    const found = findValue(child, wanted, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

function recordMissingIdentity(node, state) {
  state.validation.missingSourceIds.push(node.sourceNodeKey);
  addNodeDiagnostic(node, state, 'MISSING_SOURCE_ID', 'Source record has no explicit source entity ID.');
}

function recordRepeatedReference(node, firstNodeKey, state) {
  const row = { sourceNodeKey: node.sourceNodeKey, firstSourceNodeKey: firstNodeKey };
  state.validation.repeatedChildReferences.push(row);
  addNodeDiagnostic(node, state, 'REPEATED_CHILD_REFERENCE', 'Source object reference occurs more than once.', row);
  return node;
}

function recordCycle(node, ancestorNodeKey, state) {
  const row = { sourceNodeKey: node.sourceNodeKey, ancestorSourceNodeKey: ancestorNodeKey || '' };
  state.validation.cycles.push(row);
  addNodeDiagnostic(node, state, 'SOURCE_TREE_CYCLE', 'Source object graph contains a cycle.', row, DIAGNOSTIC_SEVERITY.ERROR);
  return node;
}

function recordInvalidChildren(node, reason, state) {
  const row = { sourceNodeKey: node.sourceNodeKey, jsonPointer: `${node.jsonPointer}/children`, reason };
  state.validation.invalidChildren.push(row);
  addNodeDiagnostic(node, state, 'INVALID_CHILDREN', reason, row, DIAGNOSTIC_SEVERITY.ERROR);
}

function recordInvalidChild(node, jsonPointer, childIndex, state) {
  const row = { sourceNodeKey: node.sourceNodeKey, jsonPointer, childIndex };
  state.validation.invalidChildren.push(row);
  addNodeDiagnostic(node, state, 'INVALID_CHILD_RECORD', 'Child entry is not an object.', row, DIAGNOSTIC_SEVERITY.ERROR);
}

function recordUnsupported(descriptor, state) {
  const row = { jsonPointer: descriptor.jsonPointer, parentSourceNodeKey: descriptor.parent?.sourceNodeKey || '' };
  state.validation.unsupportedRecords.push(row);
  state.diagnostics.push(createDiagnostic('UNSUPPORTED_SOURCE_RECORD', 'Source entry is not an object.', {
    ...row, severity: DIAGNOSTIC_SEVERITY.ERROR, scope: descriptor.jsonPointer,
  }));
  return null;
}

function addNodeDiagnostic(node, state, code, message, details = {}, severity = DIAGNOSTIC_SEVERITY.WARNING) {
  const diagnostic = createDiagnostic(code, message, {
    ...details, severity, sourceNodeKey: node.sourceNodeKey, path: node.jsonPointer,
  });
  node.diagnostics.push(diagnostic.id);
  state.diagnostics.push(diagnostic);
}

function validationAudit() {
  return {
    duplicateSourceIds: [], missingSourceIds: [], repeatedChildReferences: [],
    cycles: [], invalidChildren: [], unsupportedRecords: [],
  };
}

function snapshotReference(snapshot) {
  if (!snapshot) return null;
  return {
    schema: snapshot.schema, datasetId: snapshot.datasetId, sourceSchema: snapshot.sourceSchema,
    sourceSemanticHash: snapshot.sourceSemanticHash, sourceByteHash: snapshot.sourceByteHash,
  };
}

function indexPositions(nodes, field) {
  return Object.fromEntries(nodes.map((node, index) => [node[field], index]).sort(([a], [b]) => a.localeCompare(b)));
}

function indexGroups(nodes, field) {
  const groups = groupBy(nodes, field);
  return Object.fromEntries(Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rows]) => [key, rows.map((row) => row.sourceNodeKey)]));
}

function groupBy(rows, field) {
  return rows.reduce((groups, row) => {
    const key = stringValue(row[field]);
    (groups[key] ||= []).push(row);
    return groups;
  }, {});
}

function normalizeKey(value) {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
}

function isSupportType(type) {
  return /^(ATTA|SUPPORT|REST|GUIDE|LINESTOP|LINE_STOP|LIMIT|LIM|ANCHOR|SPRING)$/i.test(type);
}
