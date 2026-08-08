import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_ENDPOINT_AFFORDANCE_SCHEMA = 'TopologyEditEndpointAffordance.v1';

export function deriveTopologyEditEndpointAffordances(projection, options = {}) {
  const modelRole = normalizeModelRole(options.modelRole ?? projection?.modelRole ?? 'draft');
  const stale = options.stale === true;
  const hiddenIds = new Set((options.hiddenCanonicalIds ?? []).map(String));
  const rows = (projection?.elements ?? [])
    .filter((element) => element?.type === 'node' && finitePoint(element))
    .map((element) => createAffordance(element, modelRole, stale, hiddenIds))
    .filter(Boolean)
    .sort((left, right) => left.accessibleLabel.localeCompare(right.accessibleLabel)
      || left.canonicalId.localeCompare(right.canonicalId));
  return deepFreeze(rows);
}

export function assertTopologyEditEndpointAffordance(value) {
  if (!value || value.schema !== TOPOLOGY_EDIT_ENDPOINT_AFFORDANCE_SCHEMA) {
    throw new TypeError(`TopologyEditEndpointAffordance: expected ${TOPOLOGY_EDIT_ENDPOINT_AFFORDANCE_SCHEMA}.`);
  }
  const material = { ...value };
  delete material.affordanceHash;
  if (semanticHash(material) !== value.affordanceHash) {
    throw new RangeError('TopologyEditEndpointAffordance: hash mismatch.');
  }
  return value;
}

function createAffordance(element, modelRole, stale, hiddenIds) {
  const canonicalId = text(element.entityId || element.id);
  if (!canonicalId || hiddenIds.has(canonicalId)) return null;
  const workspaceEntityIds = stringList(
    element.workspaceEntityIds ?? element.pickTarget?.workspaceEntityIds ?? [],
  );
  const portRoles = normalizePortRoles(element.portRoles ?? element.pickTarget?.portRoles ?? []);
  const label = humanLabel(element, workspaceEntityIds, portRoles);
  const pickTarget = deepFreeze({
    ...(element.pickTarget ?? {}),
    modelRole,
    objectKind: 'node',
    objectId: canonicalId,
    nodeId: canonicalId,
    workspaceEntityIds,
    portRoles,
    humanLabel: label,
  });
  const material = {
    schema: TOPOLOGY_EDIT_ENDPOINT_AFFORDANCE_SCHEMA,
    canonicalId,
    modelRole,
    position: { x: Number(element.x), y: Number(element.y), z: Number(element.z) },
    workspaceEntityIds,
    portRoles,
    accessibleLabel: label,
    stale,
    editable: modelRole === 'draft' && !stale,
    pickPriority: 100,
    pickTarget,
  };
  return deepFreeze({ ...material, affordanceHash: semanticHash(material) });
}

function humanLabel(element, workspaceEntityIds, portRoles) {
  const explicit = text(element.humanLabel || element.accessibleLabel);
  if (explicit) return explicit;
  const owners = workspaceEntityIds.length ? workspaceEntityIds.join(' / ') : 'Canonical endpoint';
  const roles = portRoles.length ? portRoles.join(' / ') : 'endpoint';
  return `${owners}, ${roles}`;
}
function normalizePortRoles(value) {
  return stringList(value).map((role) => role.toUpperCase());
}
function normalizeModelRole(value) {
  const role = text(value).toLowerCase();
  if (!['source', 'draft'].includes(role)) {
    throw new RangeError(`TopologyEditEndpointAffordance: unsupported modelRole ${role}.`);
  }
  return role;
}
function stringList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(text).filter(Boolean))].sort();
}
function finitePoint(value) {
  return [value?.x, value?.y, value?.z].every((entry) => Number.isFinite(Number(entry)));
}
function text(value) { return String(value ?? '').trim(); }
