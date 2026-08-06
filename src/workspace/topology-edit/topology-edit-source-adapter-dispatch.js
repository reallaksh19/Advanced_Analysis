import { semanticHash } from '../../core/shared-piping-model/index.js';
import {
  applyCanonicalTopologyToWorkspaceEntities as applyLegacyWriteback,
} from './topology-edit-source-adapter.js';
import {
  createNativePipeWorkspaceEntity,
} from './topology-edit-native-pipe-writeback.js';

function legacyEditEntityId(dataset, editSessionId, edgeId) {
  return `edit:${semanticHash({
    datasetId: dataset.datasetId,
    version: dataset.version || 0,
    editSessionId,
    edgeId,
  }).slice(0, 20)}`;
}
function isNewNativePipe(edge, dataset, baseTopology) {
  return edge?.identityKind === 'NATIVE_COMMAND'
    && edge?.topologyOperation === 'INSERT_PIPE_SEGMENT'
    && !dataset.entities.some((entity) => entity.entityId === edge.componentKey)
    && !(baseTopology.edges ?? []).some((row) => row.id === edge.id);
}

export function applyCanonicalTopologyToWorkspaceEntities(
  dataset,
  baseCanonicalTopology,
  editedCanonicalTopology,
  editSessionId,
) {
  const legacy = applyLegacyWriteback(
    dataset,
    baseCanonicalTopology,
    editedCanonicalTopology,
    editSessionId,
  );
  const result = new Map(legacy.map((entity) => [entity.entityId, entity]));
  for (const edge of editedCanonicalTopology.edges ?? []) {
    if (!isNewNativePipe(edge, dataset, baseCanonicalTopology)) continue;
    result.delete(legacyEditEntityId(dataset, editSessionId, edge.id));
    const nativeEntity = createNativePipeWorkspaceEntity(
      editedCanonicalTopology,
      edge.id,
    );
    if (result.has(nativeEntity.entityId)) {
      throw new Error(
        `TopologyEditSourceAdapterDispatch: duplicate native entity ${nativeEntity.entityId}.`,
      );
    }
    result.set(nativeEntity.entityId, nativeEntity);
  }
  return [...result.values()];
}
