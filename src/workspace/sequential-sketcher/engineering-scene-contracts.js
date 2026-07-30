/**
 * Engineering Scene & Geometry Contracts for Sequential Sketcher
 */
export const ENGINEERING_SCENE_SCHEMA = 'EngineeringScene.v1';
export const ENGINEERING_SCENE_ENTITY_SCHEMA = 'EngineeringSceneEntity.v1';
export const ENGINEERING_SCENE_PROJECTION = Object.freeze(['ISO', 'XY', 'XZ', 'YZ']);

export function freezeJsonValue(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeJsonValue);
  return Object.freeze(value);
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function createPointGeometry(position) {
  return freezeJsonValue({ kind: 'point', position });
}

export function createSegmentGeometry(start, end) {
  return freezeJsonValue({ kind: 'segment', start, end });
}

export function createPolylineGeometry(points) {
  return freezeJsonValue({ kind: 'polyline', points });
}

export function createEngineeringCoordinateSystem(cs = {}) {
  return freezeJsonValue({
    upAxis: cs.upAxis || 'Z',
    lengthUnit: cs.lengthUnit || 'mm',
    angleUnit: cs.angleUnit || 'deg',
  });
}

export function createEngineeringSceneEntity(input = {}) {
  const id = String(input.id || '').trim();
  const kind = String(input.kind || 'segment').trim();
  return freezeJsonValue({
    schema: ENGINEERING_SCENE_ENTITY_SCHEMA,
    id: id || `entity-${Math.random().toString(36).slice(2, 9)}`,
    kind,
    domainType: String(input.domainType || kind).trim(),
    geometry: input.geometry || null,
    domainRef: input.domainRef || {},
    propertySetIds: Array.isArray(input.propertySetIds) ? [...input.propertySetIds] : [],
    editCapabilities: Array.isArray(input.editCapabilities) ? [...input.editCapabilities] : [],
    layer: String(input.layer || 'authoritative').trim(),
    renderOrder: Number.isFinite(input.renderOrder) ? input.renderOrder : 0,
    visible: input.visible !== false,
    selectable: input.selectable !== false,
    contributesToFit: input.contributesToFit !== false,
    metadata: input.metadata || {},
  });
}

export function createEngineeringScene(input = {}) {
  const entities = (input.entities || []).map((e) => createEngineeringSceneEntity(e));
  return freezeJsonValue({
    schema: ENGINEERING_SCENE_SCHEMA,
    sceneId: String(input.sceneId || 'sequential-scene').trim(),
    revision: input.revision || 'rev-001',
    coordinateSystem: createEngineeringCoordinateSystem(input.coordinateSystem),
    entities,
    projections: Array.isArray(input.projections) ? [...input.projections] : ['ISO', 'XY', 'XZ', 'YZ'],
    capabilities: input.capabilities || {},
    metadata: input.metadata || {},
  });
}
