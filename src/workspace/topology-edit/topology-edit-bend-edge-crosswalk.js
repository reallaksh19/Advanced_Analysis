import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_BEND_EDGE_CROSSWALK_SCHEMA = 'TopologyEditBendEdgeCrosswalk.v1';

function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditBendEdgeCrosswalk: ${message}`);
}
function definitionMaterial(value = {}) {
  const bendId = String(value.bendId ?? '').trim();
  const nodeId = String(value.nodeId ?? '').trim();
  const radiusAuthority = String(value.radiusAuthority ?? '').trim();
  const radiusMm = Number(value.radiusMm);
  const angleDeg = Number(value.angleDeg);
  if (!bendId || !nodeId || !radiusAuthority) fail('bendId, nodeId and radiusAuthority are required.');
  if (!Number.isFinite(radiusMm) || radiusMm <= 0) fail('radiusMm must be positive.', RangeError);
  if (!Number.isFinite(angleDeg) || angleDeg <= 0 || angleDeg > 180) fail('angleDeg must be in (0, 180].', RangeError);
  return { bendId, nodeId, radiusMm, angleDeg, radiusAuthority };
}
export function normalizeTopologyEditBendDefinition(value) {
  const material = definitionMaterial(value);
  return deepFreeze({ ...material, definitionHash: semanticHash(material) });
}
export function topologyEditEdgeBendDefinitions(edge = {}) {
  const source = Array.isArray(edge.bendDefinitions) && edge.bendDefinitions.length
    ? edge.bendDefinitions
    : edge.bendDefinition ? [edge.bendDefinition] : [];
  const definitions = source.map(normalizeTopologyEditBendDefinition);
  const unique = [...new Map(definitions.map((row) => [row.bendId, row])).values()]
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId) || left.bendId.localeCompare(right.bendId));
  return deepFreeze(unique);
}
export function appendTopologyEditEdgeBendDefinition(edge = {}, definitionInput) {
  const definition = normalizeTopologyEditBendDefinition(definitionInput);
  const prior = topologyEditEdgeBendDefinitions(edge);
  const sameId = prior.find((row) => row.bendId === definition.bendId);
  if (sameId && sameId.definitionHash !== definition.definitionHash) {
    fail(`bend ${definition.bendId} conflicts with existing edge crosswalk.`, RangeError);
  }
  const definitions = [...new Map([...prior, definition].map((row) => [row.bendId, row])).values()]
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId) || left.bendId.localeCompare(right.bendId));
  return deepFreeze({
    ...edge,
    bendDefinition: definitions[0] ?? null,
    bendDefinitions: definitions,
    bendDefinitionCount: definitions.length,
    bendDefinitionCrosswalkHash: semanticHash({
      schema: TOPOLOGY_EDIT_BEND_EDGE_CROSSWALK_SCHEMA,
      definitions,
    }),
  });
}
export function topologyEditEdgeReferencesBend(edge, bendId) {
  const target = String(bendId ?? '').trim();
  return Boolean(target) && topologyEditEdgeBendDefinitions(edge).some((row) => row.bendId === target);
}
export function topologyEditEdgeHasBendAtNode(edge, nodeId) {
  const target = String(nodeId ?? '').trim();
  return Boolean(target) && topologyEditEdgeBendDefinitions(edge).some((row) => row.nodeId === target);
}
