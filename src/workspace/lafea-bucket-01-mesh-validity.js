import {
  JACOBIAN_SAMPLE_DIVISIONS,
  pointDistance,
  t6Jacobian,
} from './lafea-bucket-01-mesh-math.js';

export function inspectBucket01MeshValidity(mesh, nodeById, duplicateNodeDistance) {
  const errors = [];
  let minimumDenseJacobian = Number.POSITIVE_INFINITY;
  let nonPositiveDenseJacobianCount = 0;
  for (const element of mesh.elements) {
    if (element.elementType !== 'T6' || element.nodeIds.length !== 6) continue;
    const nodes = element.nodeIds.map((nodeId) => nodeById.get(nodeId));
    for (let i = 0; i <= JACOBIAN_SAMPLE_DIVISIONS; i += 1) {
      for (let j = 0; j <= JACOBIAN_SAMPLE_DIVISIONS - i; j += 1) {
        const determinant = t6Jacobian(
          nodes,
          i / JACOBIAN_SAMPLE_DIVISIONS,
          j / JACOBIAN_SAMPLE_DIVISIONS,
        );
        minimumDenseJacobian = Math.min(minimumDenseJacobian, determinant);
        if (!(determinant > 0)) nonPositiveDenseJacobianCount += 1;
      }
    }
  }
  if (nonPositiveDenseJacobianCount) errors.push('NON_POSITIVE_DENSE_JACOBIAN');
  const duplicateNodePairs = findDuplicateNodePairs(mesh.nodes, duplicateNodeDistance);
  if (duplicateNodePairs.length) errors.push('UNINTENDED_DUPLICATE_NODE_COORDINATES');
  return Object.freeze({
    jacobianSampleDivisions: JACOBIAN_SAMPLE_DIVISIONS,
    minimumDenseJacobian,
    nonPositiveDenseJacobianCount,
    duplicateNodeDistance,
    duplicateNodePairCount: duplicateNodePairs.length,
    duplicateNodePairs: Object.freeze(duplicateNodePairs),
    errors: Object.freeze([...new Set(errors)].sort()),
  });
}

function findDuplicateNodePairs(nodes, tolerance) {
  const buckets = new Map();
  const duplicates = [];
  const cell = Math.max(tolerance, Number.EPSILON);
  for (const node of nodes) {
    const ix = Math.floor(node.x / cell); const iy = Math.floor(node.y / cell);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const other of buckets.get(`${ix + dx}:${iy + dy}`) ?? []) {
          if (pointDistance(node, other) <= tolerance) {
            duplicates.push(Object.freeze([other.nodeId, node.nodeId].sort()));
          }
        }
      }
    }
    const key = `${ix}:${iy}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(node);
  }
  return duplicates.sort((left, right) => left.join(':').localeCompare(right.join(':')));
}
