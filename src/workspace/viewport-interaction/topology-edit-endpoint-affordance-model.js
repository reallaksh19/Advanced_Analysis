import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_ENDPOINT_AFFORDANCE_SCHEMA = 'TopologyEditEndpointAffordance.v1';

export function deriveTopologyEditEndpointAffordances(projection, options = {}) {
  const modelRole = normalizeModelRole(options.modelRole ?? projection?.modelRole ?? 'draft');
  const stale = options.stale === true;
  const hiddenIds = new Set((options.hiddenCanonicalIds ?? []).map(String));
  const elements = projectionElements(projection);
  const presentationBindings = primitiveEndpointBindings(projectionPrimitives(projection));
  const rows = elements
    .filter((element) => element?.type === 'node' && finitePoint(element))
    .map((element) => createAffordance(
      element,
      modelRole,
      stale,
      hiddenIds,
      presentationBindings,
    ))
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

function projectionElements(projection) {
  if (Array.isArray(projection?.elements) && projection.elements.length) {
    return projection.elements;
  }
  if (Array.isArray(projection?.compactElements)) return projection.compactElements;
  if (Array.isArray(projection?.typedEvidenceProjection?.elements)) {
    return projection.typedEvidenceProjection.elements;
  }
  return [];
}

function projectionPrimitives(projection) {
  if (Array.isArray(projection?.primitives) && projection.primitives.length) {
    return projection.primitives;
  }
  if (Array.isArray(projection?.typedEvidenceProjection?.primitives)) {
    return projection.typedEvidenceProjection.primitives;
  }
  return [];
}

function createAffordance(element, modelRole, stale, hiddenIds, presentationBindings) {
  const canonicalId = text(element.entityId || element.id);
  if (!canonicalId || hiddenIds.has(canonicalId)) return null;
  const projected = exactPresentationBindings(element, presentationBindings);
  const workspaceEntityIds = stringList([
    ...(element.workspaceEntityIds ?? element.pickTarget?.workspaceEntityIds ?? []),
    ...projected.flatMap((row) => row.workspaceEntityIds),
  ]);
  const portRoles = normalizePortRoles([
    ...(element.portRoles ?? element.pickTarget?.portRoles ?? []),
    ...projected.flatMap((row) => row.portRoles),
  ]);
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

function primitiveEndpointBindings(primitives) {
  const rows = [];
  for (const primitive of primitives ?? []) {
    const owners = stringList(primitive?.workspaceEntityIds ?? []);
    if (!owners.length) continue;
    const parameters = primitive?.parameters ?? {};
    addBinding(rows, parameters.start, owners, ['FROM']);
    addBinding(rows, parameters.end ?? parameters.sourceEnd, owners, ['TO']);
    addBinding(rows, parameters.position, owners, ['PORT']);
    for (const point of parameters.runEnds ?? []) addBinding(rows, point, owners, ['RUN']);
    addBinding(rows, parameters.branchEnd, owners, ['BRANCH']);
  }
  return rows;
}

function addBinding(rows, point, workspaceEntityIds, portRoles) {
  if (!finitePoint(point)) return;
  rows.push({
    point: { x: Number(point.x), y: Number(point.y), z: Number(point.z) },
    workspaceEntityIds,
    portRoles,
  });
}

function exactPresentationBindings(element, rows) {
  return rows.filter((row) => samePoint(element, row.point));
}

function samePoint(left, right) {
  return Number(left.x) === Number(right.x)
    && Number(left.y) === Number(right.y)
    && Number(left.z) === Number(right.z);
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
