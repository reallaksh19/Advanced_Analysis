import {
  topologyEditExactPickTarget,
  topologyEditGeometryReuseKey,
  topologyEditMaterialReuseKey,
  topologyEditMeshRenderStateKey,
} from './topology-edit-render-resource-signatures.js';

export function poolTopologyEditGroupResources(group, policy) {
  if (!group?.traverse) throw new TypeError('A Three.js group is required for resource pooling.');
  const geometryUses = new Map();
  const materialUses = new Map();
  const meshes = [];
  group.traverse((object) => {
    if (!object?.isMesh) return;
    increment(geometryUses, object.geometry);
    for (const material of materialRows(object.material)) increment(materialUses, material);
    if (object.isInstancedMesh || object.children.length || hasNonPickableAncestor(object)) return;
    if (Array.isArray(object.material)) {
      throw resourcePoolError('Material arrays are not eligible for pooling.', 'MATERIAL_ARRAY_UNSUPPORTED');
    }
    const geometryKey = topologyEditGeometryReuseKey(object.geometry, policy);
    const materialKey = topologyEditMaterialReuseKey(object.material, policy);
    if (!geometryKey || !materialKey) return;
    meshes.push({
      mesh: object,
      geometryKey,
      materialKey,
      renderStateKey: topologyEditMeshRenderStateKey(object),
      pickTarget: topologyEditExactPickTarget(object),
      partRole: String(object.userData?.partRole || '').trim(),
    });
  });

  const geometryPool = new Map();
  const materialPool = new Map();
  let geometryReuseCount = 0;
  let materialReuseCount = 0;
  for (const row of meshes) {
    const acceptedGeometry = geometryPool.get(row.geometryKey);
    if (acceptedGeometry && acceptedGeometry !== row.mesh.geometry) {
      const replaced = row.mesh.geometry;
      row.mesh.geometry = acceptedGeometry;
      release(replaced, geometryUses);
      geometryReuseCount += 1;
    } else if (!acceptedGeometry) {
      geometryPool.set(row.geometryKey, row.mesh.geometry);
    }

    const acceptedMaterial = materialPool.get(row.materialKey);
    if (acceptedMaterial && acceptedMaterial !== row.mesh.material) {
      const replaced = row.mesh.material;
      row.mesh.material = acceptedMaterial;
      release(replaced, materialUses);
      materialReuseCount += 1;
    } else if (!acceptedMaterial) {
      materialPool.set(row.materialKey, row.mesh.material);
    }
    row.mesh.userData.renderReuseGeometryKey = row.geometryKey;
    row.mesh.userData.renderReuseMaterialKey = row.materialKey;
  }

  return Object.freeze({
    candidates: Object.freeze(meshes),
    evidence: Object.freeze({
      candidateMeshCount: meshes.length,
      uniqueGeometryCount: geometryPool.size,
      uniqueMaterialCount: materialPool.size,
      geometryReuseCount,
      materialReuseCount,
    }),
  });
}

function materialRows(material) {
  return Array.isArray(material) ? material.filter(Boolean) : material ? [material] : [];
}

function increment(map, value) {
  if (!value) return;
  map.set(value, (map.get(value) || 0) + 1);
}

function release(resource, uses) {
  const remaining = (uses.get(resource) || 0) - 1;
  if (remaining > 0) {
    uses.set(resource, remaining);
    return;
  }
  uses.delete(resource);
  resource?.dispose?.();
}

function hasNonPickableAncestor(object) {
  let current = object;
  while (current) {
    if (current.userData?.nonPickable) return true;
    current = current.parent;
  }
  return false;
}

function resourcePoolError(message, detailCode) {
  const error = new Error(`TOPOLOGY_EDIT_RENDER_RESOURCE_POOL_INVALID: ${message}`);
  error.code = 'TOPOLOGY_EDIT_RENDER_RESOURCE_POOL_INVALID';
  error.detailCode = detailCode;
  return error;
}
