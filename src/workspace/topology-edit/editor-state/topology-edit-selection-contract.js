/** Immutable canonical-selection contract for every 3D Edit interaction surface. */
import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import {
  normalizeTopologyEditCanonicalId,
  normalizeTopologyEditCanonicalIds,
} from '../professional/topology-edit-canonical-id.js';

export const TOPOLOGY_EDIT_CANONICAL_SELECTION_SCHEMA =
  'TopologyEditCanonicalSelection.v1';

export const TOPOLOGY_EDIT_SELECTION_SOURCES = deepFreeze([
  'viewport',
  'tree',
  'search',
  'hud',
  'inspector',
  'command',
]);

const SOURCE_SET = new Set(TOPOLOGY_EDIT_SELECTION_SOURCES);

export function createTopologyEditCanonicalSelection(input = {}) {
  const canonicalIds = normalizeTopologyEditCanonicalIds(
    input.canonicalIds ?? [],
    'canonicalIds',
  );
  const primaryId = optionalSelectedId(
    input.primaryId,
    canonicalIds,
    'primaryId',
  );
  const anchorId = optionalSelectedId(
    input.anchorId,
    canonicalIds,
    'anchorId',
  );
  const revision = nonNegativeInteger(input.revision ?? 0, 'revision');
  const source = selectionSource(input.source ?? 'command');
  const material = {
    schema: TOPOLOGY_EDIT_CANONICAL_SELECTION_SCHEMA,
    canonicalIds,
    primaryId,
    anchorId,
    source,
    revision,
  };
  return deepFreeze({ ...material, selectionHash: semanticHash(material) });
}

export function assertTopologyEditCanonicalSelection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('selection must be an object.');
  }
  const rebuilt = createTopologyEditCanonicalSelection(value);
  if (
    value.schema !== TOPOLOGY_EDIT_CANONICAL_SELECTION_SCHEMA
    || value.selectionHash !== rebuilt.selectionHash
  ) {
    fail('selection differs from its immutable normalized authority.', RangeError);
  }
  return rebuilt;
}

export function topologyEditSelectionSemanticHash(value) {
  const selection = assertTopologyEditCanonicalSelection(value);
  return semanticHash({
    canonicalIds: selection.canonicalIds,
    primaryId: selection.primaryId,
    anchorId: selection.anchorId,
  });
}

export function sameTopologyEditSelectionSemantics(left, right) {
  return topologyEditSelectionSemanticHash(left)
    === topologyEditSelectionSemanticHash(right);
}

export function createTopologyEditSelectionFromLegacy(
  legacy = {},
  source = 'command',
  revision = 0,
) {
  const nodeIds = Array.isArray(legacy.nodeIds) ? legacy.nodeIds : [];
  const edgeId = legacy.edgeId || null;
  const canonicalIds = edgeId ? [edgeId] : nodeIds;
  const primaryId = edgeId || nodeIds.at(-1) || null;
  const anchorId = edgeId ? edgeId : nodeIds[0] || null;
  return createTopologyEditCanonicalSelection({
    canonicalIds,
    primaryId,
    anchorId,
    source,
    revision,
  });
}

export function topologyEditLegacySelection(value) {
  const selection = assertTopologyEditCanonicalSelection(value);
  const edgeIds = selection.canonicalIds.filter((id) => id.startsWith('edge:'));
  const nodeIds = selection.canonicalIds.filter((id) => id.startsWith('node:'));
  if (edgeIds.length === 1 && selection.canonicalIds.length === 1) {
    return deepFreeze({ nodeIds: [], edgeId: edgeIds[0] });
  }
  if (nodeIds.length === selection.canonicalIds.length && nodeIds.length <= 2) {
    const ordered = orderedNodeRoles(nodeIds, selection.anchorId, selection.primaryId);
    return deepFreeze({ nodeIds: ordered, edgeId: null });
  }
  return deepFreeze({ nodeIds: [], edgeId: null });
}

export function normalizeTopologyEditSelectionSource(value) {
  return selectionSource(value);
}

function orderedNodeRoles(nodeIds, anchorId, primaryId) {
  if (nodeIds.length < 2) return [...nodeIds];
  if (anchorId && nodeIds.includes(anchorId)) {
    return [anchorId, ...nodeIds.filter((id) => id !== anchorId)];
  }
  if (primaryId && nodeIds.includes(primaryId)) {
    return [...nodeIds.filter((id) => id !== primaryId), primaryId];
  }
  return [...nodeIds];
}

function optionalSelectedId(value, canonicalIds, label) {
  if (value === null || value === undefined || value === '') return null;
  const id = normalizeTopologyEditCanonicalId(value, label);
  if (!canonicalIds.includes(id)) {
    fail(`${label} must be included in canonicalIds.`, RangeError);
  }
  return id;
}

function selectionSource(value) {
  const source = String(value ?? '').trim().toLowerCase();
  if (!SOURCE_SET.has(source)) {
    fail(`source must be one of ${TOPOLOGY_EDIT_SELECTION_SOURCES.join(', ')}.`);
  }
  return source;
}

function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    fail(`${label} must be a non-negative integer.`, RangeError);
  }
  return number;
}

function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditCanonicalSelection: ${message}`);
}
