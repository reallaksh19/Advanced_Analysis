import { freezeDeep, stringValue } from './dataset-utils.js';

export function buildDatasetHierarchy(entities) {
  const root = createMutableNode('root', 'Dataset');

  entities.forEach((entity) => {
    const pathParts = hierarchyParts(entity);
    let current = root;

    pathParts.forEach((part, index) => {
      const pathId = `${current.id}/${normalizePart(part)}-${index}`;
      let child = current.children.get(pathId);
      if (!child) {
        child = createMutableNode(pathId, part);
        current.children.set(pathId, child);
      }
      child.entityIds.push(entity.entityId);
      current = child;
    });

    current.directEntityIds.push(entity.entityId);
    if (!pathParts.length) root.directEntityIds.push(entity.entityId);
  });

  root.entityIds = entities.map((entity) => entity.entityId);
  return freezeDeep([...root.children.values()].map(serializeNode).concat(
    root.directEntityIds.length ? [unassignedNode(root.directEntityIds)] : [],
  ));
}

function hierarchyParts(entity) {
  const sourcePath = stringValue(entity.sourcePath);
  if (!sourcePath) return [];
  const parts = sourcePath.split(/[\\/]+/).map(stringValue).filter(Boolean);
  if (parts.length > 1) return parts.slice(0, -1);
  return parts;
}

function createMutableNode(id, label) {
  return {
    id,
    label,
    entityIds: [],
    directEntityIds: [],
    children: new Map(),
  };
}

function serializeNode(node) {
  return {
    id: node.id,
    label: node.label,
    entityIds: [...node.entityIds],
    directEntityIds: [...node.directEntityIds],
    entityCount: node.entityIds.length,
    children: [...node.children.values()]
      .map(serializeNode)
      .sort((left, right) => left.label.localeCompare(right.label)),
  };
}

function unassignedNode(entityIds) {
  return {
    id: 'branch:unassigned',
    label: 'Unassigned',
    entityIds: [...entityIds],
    directEntityIds: [...entityIds],
    entityCount: entityIds.length,
    children: [],
  };
}

function normalizePart(value) {
  return stringValue(value).toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'group';
}
