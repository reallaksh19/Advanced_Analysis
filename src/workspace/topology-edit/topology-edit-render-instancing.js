import * as THREE from 'three';
import { deepFreeze } from '../../core/shared-piping-model/index.js';
import {
  topologyEditOperationalPickIdentityKey,
  topologyEditPickIdentityKey,
} from './topology-edit-render-resource-signatures.js';

export function instantiateTopologyEditGroup(group, candidates, policy) {
  if (!group?.traverse) throw new TypeError('A Three.js group is required for instancing.');
  if (!Array.isArray(candidates)) throw new TypeError('Instancing candidates must be an array.');
  group.updateMatrixWorld(true);
  const beforeManifest = pickIdentityManifest(group);
  const beforeMeshCount = meshCount(group);
  const plans = createInstancePlans(group, candidates, policy);
  const applied = [];

  try {
    for (const plan of plans) {
      applied.push(plan);
      group.add(plan.instanced);
      plan.originals.forEach(({ mesh, parent }) => parent.remove(mesh));
    }
    group.updateMatrixWorld(true);
    const afterManifest = pickIdentityManifest(group);
    if (!sameManifest(beforeManifest, afterManifest)) {
      throw instancingError(
        'Exact pick identity changed during instancing.',
        'PICK_IDENTITY_MANIFEST_MISMATCH',
      );
    }
    pruneEmptyGroups(group);
    group.updateMatrixWorld(true);
    const afterMeshCount = meshCount(group);
    return Object.freeze({
      beforeMeshCount,
      afterMeshCount,
      newInstancedMeshCount: plans.length,
      newInstanceCount: plans.reduce((sum, plan) => sum + plan.instanced.count, 0),
      drawObjectReduction: beforeMeshCount - afterMeshCount,
      exactPickIdentityCount: afterManifest.length,
    });
  } catch (error) {
    rollbackInstancePlans(group, applied);
    const restoredManifest = pickIdentityManifest(group);
    if (!sameManifest(beforeManifest, restoredManifest)) {
      throw instancingError(
        'Instancing rollback did not restore the exact pick manifest.',
        'ROLLBACK_MANIFEST_MISMATCH',
      );
    }
    throw error;
  }
}

export function topologyEditGroupPickIdentityManifest(group) {
  return deepFreeze(pickIdentityManifest(group));
}

function createInstancePlans(group, candidates, policy) {
  const groups = groupCandidates(candidates);
  const inverseRoot = group.matrixWorld.clone().invert();
  const plans = [];
  let sequence = 0;
  for (const rows of groups.values()) {
    for (const batch of uniqueIdentityBatches(rows)) {
      if (batch.length < policy.minimumInstanceCount) continue;
      const first = batch[0].mesh;
      if (batch.some((row) => (
        row.mesh.geometry !== first.geometry || row.mesh.material !== first.material
      ))) {
        throw instancingError(
          'A reuse group contains conflicting retained resources.',
          'RESOURCE_REFERENCE_CONFLICT',
        );
      }
      const originals = batch.map((row) => {
        const parent = row.mesh.parent;
        const index = parent?.children?.indexOf(row.mesh) ?? -1;
        if (!parent || index < 0) {
          throw instancingError(
            'Every instancing candidate must retain its original parent.',
            'ORIGINAL_PARENT_MISSING',
          );
        }
        return { mesh: row.mesh, parent, index };
      });
      const matrices = batch.map((row) => localMatrix(row.mesh, inverseRoot));
      const pickTable = deepFreeze(batch.map((row) => row.pickTarget));
      const partRoleTable = deepFreeze(batch.map((row) => row.partRole));
      const instanced = new THREE.InstancedMesh(first.geometry, first.material, batch.length);
      instanced.name = `topology-edit-reuse-instance:${String(sequence).padStart(6, '0')}`;
      sequence += 1;
      instanced.renderOrder = first.renderOrder;
      instanced.castShadow = first.castShadow;
      instanced.receiveShadow = first.receiveShadow;
      instanced.frustumCulled = first.frustumCulled;
      instanced.userData = {
        pickTable,
        partRoleTable,
        renderReuseGeometryKey: batch[0].geometryKey,
        renderReuseMaterialKey: batch[0].materialKey,
        renderReuseInstanceCount: batch.length,
      };
      matrices.forEach((matrix, index) => instanced.setMatrixAt(index, matrix));
      instanced.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      instanced.instanceMatrix.needsUpdate = true;
      instanced.computeBoundingBox();
      instanced.computeBoundingSphere();
      plans.push({ instanced, originals });
    }
  }
  return plans;
}

function rollbackInstancePlans(group, plans) {
  for (const plan of [...plans].reverse()) {
    plan.instanced.parent?.remove(plan.instanced);
    const byParent = new Map();
    for (const original of plan.originals) {
      if (!byParent.has(original.parent)) byParent.set(original.parent, []);
      byParent.get(original.parent).push(original);
    }
    for (const [parent, originals] of byParent) {
      originals.sort((left, right) => left.index - right.index);
      for (const { mesh, index } of originals) {
        if (mesh.parent && mesh.parent !== parent) mesh.parent.remove(mesh);
        if (mesh.parent !== parent) parent.add(mesh);
        const current = parent.children.indexOf(mesh);
        if (current >= 0 && current !== index) {
          parent.children.splice(current, 1);
          parent.children.splice(Math.min(index, parent.children.length), 0, mesh);
        }
      }
    }
  }
  group.updateMatrixWorld(true);
}

function groupCandidates(candidates) {
  const result = new Map();
  for (const row of candidates) {
    if (!row?.mesh?.parent) continue;
    const key = `${row.geometryKey}\u0000${row.materialKey}\u0000${row.renderStateKey}`;
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(row);
  }
  return result;
}

function uniqueIdentityBatches(rows) {
  const batches = [];
  for (const row of rows) {
    const identity = topologyEditOperationalPickIdentityKey(row.pickTarget);
    let batch = batches.find((candidate) => !candidate.identities.has(identity));
    if (!batch) {
      batch = { identities: new Set(), rows: [] };
      batches.push(batch);
    }
    batch.identities.add(identity);
    batch.rows.push(row);
  }
  return batches.map((batch) => batch.rows);
}

function localMatrix(mesh, inverseRoot) {
  mesh.updateMatrixWorld(true);
  const matrix = inverseRoot.clone().multiply(mesh.matrixWorld);
  if (!matrix.elements.every(Number.isFinite)) {
    throw instancingError('Instance transforms must be finite.', 'INSTANCE_MATRIX_INVALID');
  }
  return matrix;
}

function pickIdentityManifest(group) {
  const keys = [];
  group.traverse((object) => {
    if (!object?.isMesh || hasNonPickableAncestor(object)) return;
    if (object.isInstancedMesh && Array.isArray(object.userData?.pickTable)) {
      object.userData.pickTable.forEach((target) => keys.push(topologyEditPickIdentityKey(target)));
      return;
    }
    const target = object.userData?.pickTarget;
    if (target?.objectId && target?.objectKind) keys.push(topologyEditPickIdentityKey(target));
  });
  return keys.sort(compareCodeUnits);
}

function meshCount(group) {
  let count = 0;
  group.traverse((object) => { if (object?.isMesh) count += 1; });
  return count;
}

function pruneEmptyGroups(root) {
  const visit = (group) => {
    [...group.children].forEach((child) => {
      if (child.isGroup) visit(child);
      if (child.isGroup && child.children.length === 0) group.remove(child);
    });
  };
  visit(root);
}

function hasNonPickableAncestor(object) {
  let current = object;
  while (current) {
    if (current.userData?.nonPickable) return true;
    current = current.parent;
  }
  return false;
}

function sameManifest(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function instancingError(message, detailCode) {
  const error = new Error(`TOPOLOGY_EDIT_RENDER_INSTANCING_INVALID: ${message}`);
  error.code = 'TOPOLOGY_EDIT_RENDER_INSTANCING_INVALID';
  error.detailCode = detailCode;
  return error;
}
