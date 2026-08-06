import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';

export const NATIVE_EMPTY_TOPOLOGY_GRAPH_SCHEMA = 'NativeEmptyTopologyGraph.v1';

export function createNativeEmptyTopologyGraph() {
  const material = {
    schema: NATIVE_EMPTY_TOPOLOGY_GRAPH_SCHEMA,
    tolerance: null,
    componentCount: 0,
    portCount: 0,
    connectionCount: 0,
    components: [],
    ports: [],
    connections: [],
    diagnostics: [],
  };
  return deepFreeze({ ...material, semanticHash: semanticHash(material) });
}

export function createNativeAuthoringAuthority(request, identities, topologyGraph) {
  const material = {
    schema: 'NativeModelAuthoringAuthority.v1',
    nativeModelId: identities.nativeModelId,
    bootstrapRequestHash: request.requestHash,
    catalogueBasis: request.catalogueBasis,
    coordinateSystem: request.coordinateSystem,
    identityPolicy: request.identityPolicy,
    authoringPolicyHash: request.authoringPolicyHash,
    canonicalDatasetVersion: 0,
    topologyGraphAuthorityHash: topologyGraph.semanticHash,
  };
  return deepFreeze({ ...material, authorityHash: semanticHash(material) });
}
