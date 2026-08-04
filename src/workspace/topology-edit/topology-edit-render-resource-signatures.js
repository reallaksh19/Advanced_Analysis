import { topologyEditPickTargetKey } from './topology-edit-gpu-pick-helpers.js';

export const TOPOLOGY_EDIT_RENDER_RESOURCE_ERROR = 'TOPOLOGY_EDIT_RENDER_RESOURCE_INVALID';

export function topologyEditGeometryReuseKey(geometry, policy) {
  if (geometry?.userData?.renderReuseDisabled === true) return null;
  if (!geometry?.isBufferGeometry || !policy?.eligibleGeometryTypes?.includes(geometry.type)) {
    return null;
  }
  const parameters = normalizeGeometryParameters(geometry.type, geometry.parameters);
  return `${geometry.type}:${JSON.stringify(parameters)}`;
}

export function topologyEditMaterialReuseKey(material, policy) {
  if (!material?.isMaterial || !policy?.eligibleMaterialTypes?.includes(material.type)) return null;
  const color = material.color?.getHex?.();
  if (!Number.isInteger(color)) {
    throw resourceError('Eligible materials require a finite color.', 'MATERIAL_COLOR_INVALID');
  }
  const clippingPlanes = (material.clippingPlanes || []).map((plane) => {
    const row = [plane.normal.x, plane.normal.y, plane.normal.z, plane.constant];
    if (!row.every(Number.isFinite)) {
      throw resourceError('Material clipping planes must be finite.', 'CLIPPING_PLANE_INVALID');
    }
    return row.map(normalizedNumber);
  });
  return JSON.stringify({
    type: material.type,
    color,
    opacity: finiteNumber(material.opacity, 'MATERIAL_OPACITY_INVALID'),
    transparent: material.transparent === true,
    depthWrite: material.depthWrite !== false,
    depthTest: material.depthTest !== false,
    side: finiteInteger(material.side, 'MATERIAL_SIDE_INVALID'),
    roughness: optionalFinite(material.roughness, 'MATERIAL_ROUGHNESS_INVALID'),
    metalness: optionalFinite(material.metalness, 'MATERIAL_METALNESS_INVALID'),
    wireframe: material.wireframe === true,
    clipIntersection: material.clipIntersection === true,
    clippingPlanes,
  });
}

export function topologyEditMeshRenderStateKey(mesh) {
  if (!mesh?.isMesh || mesh.isInstancedMesh) return null;
  return JSON.stringify({
    renderOrder: finiteNumber(mesh.renderOrder, 'MESH_RENDER_ORDER_INVALID'),
    castShadow: mesh.castShadow === true,
    receiveShadow: mesh.receiveShadow === true,
    frustumCulled: mesh.frustumCulled !== false,
  });
}

export function topologyEditExactPickTarget(mesh) {
  const target = mesh?.userData?.pickTarget;
  if (!target?.objectId || !target?.objectKind) {
    throw resourceError('An exact pick target is required.', 'PICK_TARGET_MISSING');
  }
  topologyEditPickTargetKey(target);
  return target;
}

export function topologyEditPickIdentityKey(target) {
  if (!target?.objectId || !target?.objectKind) {
    throw resourceError('An exact pick target is required.', 'PICK_TARGET_MISSING');
  }
  return topologyEditPickTargetKey(target);
}

export function topologyEditOperationalPickIdentityKey(target) {
  if (!target?.objectId || !target?.objectKind) {
    throw resourceError('An exact pick target is required.', 'PICK_TARGET_MISSING');
  }
  return JSON.stringify({
    modelRole: String(target.modelRole || ''),
    objectKind: String(target.objectKind || ''),
    objectId: String(target.objectId || ''),
    nodeId: String(target.nodeId || ''),
    partRole: String(target.partRole || ''),
    supportId: String(target.supportId || ''),
    restraintId: String(target.restraintId || ''),
    restraintFamily: String(target.restraintFamily || ''),
  });
}

function normalizeGeometryParameters(type, parameters) {
  const fields = GEOMETRY_FIELDS[type];
  if (!fields || !parameters || typeof parameters !== 'object') {
    throw resourceError(`Geometry parameters are unavailable for ${type}.`, 'GEOMETRY_PARAMETERS_INVALID');
  }
  const result = {};
  for (const field of fields) {
    const value = parameters[field];
    if (typeof value === 'boolean') result[field] = value;
    else result[field] = finiteNumber(value, `GEOMETRY_PARAMETER_${field.toUpperCase()}_INVALID`);
  }
  return result;
}

function finiteNumber(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw resourceError('A finite number is required.', code);
  return normalizedNumber(number);
}

function finiteInteger(value, code) {
  const number = Number(value);
  if (!Number.isInteger(number)) throw resourceError('A finite integer is required.', code);
  return number;
}

function optionalFinite(value, code) {
  return value === undefined ? null : finiteNumber(value, code);
}

function normalizedNumber(value) {
  return Object.is(value, -0) ? 0 : value;
}

function resourceError(message, detailCode) {
  const error = new Error(`${TOPOLOGY_EDIT_RENDER_RESOURCE_ERROR}: ${message}`);
  error.code = TOPOLOGY_EDIT_RENDER_RESOURCE_ERROR;
  error.detailCode = detailCode;
  return error;
}

const GEOMETRY_FIELDS = Object.freeze({
  BoxGeometry: Object.freeze(['width', 'height', 'depth', 'widthSegments', 'heightSegments', 'depthSegments']),
  CylinderGeometry: Object.freeze([
    'radiusTop', 'radiusBottom', 'height', 'radialSegments', 'heightSegments',
    'openEnded', 'thetaStart', 'thetaLength',
  ]),
  IcosahedronGeometry: Object.freeze(['radius', 'detail']),
  OctahedronGeometry: Object.freeze(['radius', 'detail']),
  SphereGeometry: Object.freeze([
    'radius', 'widthSegments', 'heightSegments', 'phiStart', 'phiLength',
    'thetaStart', 'thetaLength',
  ]),
  TorusGeometry: Object.freeze(['radius', 'tube', 'radialSegments', 'tubularSegments', 'arc']),
});
