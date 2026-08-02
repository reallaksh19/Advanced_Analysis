/** Canonical topology normalization and hashing used by the certified kernel. */
import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';

const BASE_COLLECTIONS = Object.freeze([
  'nodes', 'edges', 'junctions', 'supports', 'boundaries', 'rigids',
]);

function jsonClone(value, label) {
  try { return JSON.parse(JSON.stringify(value)); }
  catch { throw new TypeError(`${label} must be JSON serializable.`); }
}
function sortByIdentity(rows) {
  return [...(rows ?? [])].sort((left, right) => (
    String(left?.id ?? '').localeCompare(String(right?.id ?? ''))
  ));
}
export function rebuildTopologyEditCrosswalk(topology) {
  return {
    nodeIdToPortKeys: Object.fromEntries(sortByIdentity(topology.nodes).map((node) => [node.id, [...(node.portKeys ?? [])].sort()])),
    edgeIdToComponentKey: Object.fromEntries(sortByIdentity(topology.edges).map((edge) => [edge.id, edge.componentKey ?? null])),
    junctionIdToComponentKey: Object.fromEntries(sortByIdentity(topology.junctions).map((row) => [row.id, row.componentKey ?? null])),
    supportIdToEntityId: Object.fromEntries(sortByIdentity(topology.supports).map((row) => [row.id, row.entityId ?? null])),
  };
}
export function topologyEditCanonicalHashMaterial(topology) {
  if (!topology || typeof topology !== 'object' || Array.isArray(topology)) {
    throw new TypeError('Canonical topology must be an object.');
  }
  const clone = jsonClone(topology, 'Canonical topology');
  delete clone.canonicalTopologyHash;
  for (const key of BASE_COLLECTIONS) clone[key] = sortByIdentity(clone[key]);
  if (Object.hasOwn(clone, 'bends')) clone.bends = sortByIdentity(clone.bends);
  clone.crosswalk = rebuildTopologyEditCrosswalk(clone);
  return clone;
}
export function canonicalTopologyStateHash(topology) {
  return semanticHash(topologyEditCanonicalHashMaterial(topology));
}
export function finalizeCanonicalTopology(topology) {
  const material = topologyEditCanonicalHashMaterial(topology);
  return deepFreeze({ ...material, canonicalTopologyHash: semanticHash(material) });
}
export function assertCanonicalTopologyHash(topology) {
  const expected = canonicalTopologyStateHash(topology);
  if (topology?.canonicalTopologyHash !== expected) {
    throw new Error(`Canonical topology hash mismatch: expected ${expected}, received ${topology?.canonicalTopologyHash ?? '<missing>'}.`);
  }
  return topology;
}
