import { deepFreeze } from '../../core/shared-piping-model/index.js';
import { instantiateTopologyEditGroup } from './topology-edit-render-instancing.js';
import {
  createTopologyEditRenderReusePolicy,
  DEFAULT_TOPOLOGY_EDIT_RENDER_REUSE_POLICY,
} from './topology-edit-render-reuse-policy.js';
import { poolTopologyEditGroupResources } from './topology-edit-render-resource-pool.js';

const LAYERS = Object.freeze([
  ['source', 'sourceGroup'],
  ['draft', 'draftGroup'],
  ['supports', 'supportGroup'],
]);

export function optimizeTopologyEditRenderGroups(
  groups,
  policyInput = DEFAULT_TOPOLOGY_EDIT_RENDER_REUSE_POLICY,
) {
  const policy = createTopologyEditRenderReusePolicy(policyInput);
  const layers = [];
  for (const [role, groupKey] of LAYERS) {
    const group = groups?.[groupKey];
    if (!group?.traverse) {
      throw new TypeError(`Topology edit render group ${groupKey} is required.`);
    }
    const before = retainedResourceCounts(group);
    const pooled = poolTopologyEditGroupResources(group, policy);
    const instancing = instantiateTopologyEditGroup(group, pooled.candidates, policy);
    const after = retainedResourceCounts(group);
    layers.push({
      role,
      before,
      after,
      pooling: pooled.evidence,
      instancing,
    });
  }
  const totals = layers.reduce((result, layer) => ({
    meshCountBefore: result.meshCountBefore + layer.before.meshCount,
    meshCountAfter: result.meshCountAfter + layer.after.meshCount,
    instanceCountBefore: result.instanceCountBefore + layer.before.instanceCount,
    instanceCountAfter: result.instanceCountAfter + layer.after.instanceCount,
    geometryCountBefore: result.geometryCountBefore + layer.before.geometryCount,
    geometryCountAfter: result.geometryCountAfter + layer.after.geometryCount,
    materialCountBefore: result.materialCountBefore + layer.before.materialCount,
    materialCountAfter: result.materialCountAfter + layer.after.materialCount,
    exactPickIdentityCount: result.exactPickIdentityCount
      + layer.instancing.exactPickIdentityCount,
  }), emptyTotals());
  return deepFreeze({
    schema: 'TopologyEditRenderOptimizationEvidence.v1',
    policyHash: policy.policyHash,
    layers,
    totals,
  });
}

function retainedResourceCounts(group) {
  const geometries = new Set();
  const materials = new Set();
  let meshCount = 0;
  let instancedMeshCount = 0;
  let instanceCount = 0;
  group.traverse((object) => {
    if (!object?.isMesh) return;
    meshCount += 1;
    if (object.isInstancedMesh) {
      instancedMeshCount += 1;
      instanceCount += Number(object.count) || 0;
    }
    if (object.geometry) geometries.add(object.geometry);
    const rows = Array.isArray(object.material) ? object.material : [object.material];
    rows.filter(Boolean).forEach((material) => materials.add(material));
  });
  return {
    meshCount,
    instancedMeshCount,
    instanceCount,
    geometryCount: geometries.size,
    materialCount: materials.size,
  };
}

function emptyTotals() {
  return {
    meshCountBefore: 0,
    meshCountAfter: 0,
    instanceCountBefore: 0,
    instanceCountAfter: 0,
    geometryCountBefore: 0,
    geometryCountAfter: 0,
    materialCountBefore: 0,
    materialCountAfter: 0,
    exactPickIdentityCount: 0,
  };
}
