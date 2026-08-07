import { deepFreeze } from '../../../core/shared-piping-model/index.js';
import { createTopologyEditChangedScope } from '../professional/topology-edit-change-scope.js';
import { createTopologyEditOperationPlan } from '../professional/topology-edit-operation-plan.js';
import { materializeTopologyEditOperationPayload } from './topology-edit-operation-graph.js';
import { assertConnectEndpointsCandidate } from './topology-edit-connect-endpoints-candidate.js';
import { assertConnectEndpointsOperation } from './topology-edit-connect-endpoints-operation.js';

function boundIds(candidate, suffix, prefix) {
  return Object.entries(candidate.operationBindings ?? {})
    .filter(([key, value]) => key.endsWith(suffix) && String(value).startsWith(prefix))
    .map(([, value]) => value)
    .sort();
}

export function createConnectEndpointsValidationOperationPlan({
  operation: operationInput,
  candidate: candidateInput,
} = {}) {
  const operation = assertConnectEndpointsOperation(operationInput);
  const candidate = assertConnectEndpointsCandidate(candidateInput);
  if (candidate.operationHash !== operation.operationHash) {
    throw new RangeError('ConnectEndpointsValidationPlan: candidate differs from operation.');
  }
  const nodeIds = [...new Set([
    operation.parentPlan.startEndpoint.nodeId,
    operation.parentPlan.endEndpoint.nodeId,
    ...boundIds(candidate, '.created-node', 'node:'),
  ])].sort();
  const edgeIds = [...new Set([
    operation.parentPlan.startEndpoint.incidentEdgeId,
    operation.parentPlan.endEndpoint.incidentEdgeId,
    ...boundIds(candidate, '.created-edge', 'edge:'),
  ])].sort();
  const targetIds = [...nodeIds, ...edgeIds].sort();
  const sourceRecordIds = [...new Set([
    operation.parentPlan.intent.catalogueBinding.recordId,
    ...operation.elbowBindings.map((row) => row.recordId),
  ])].sort();
  const changedScope = createTopologyEditChangedScope({
    basisHash: candidate.priorCanonicalHash,
    nodeIds,
    edgeIds,
    junctionIds: [],
    supportIds: [],
    boundaryIds: [],
    sourceRecordIds,
    validationNeighbourhoodIds: targetIds,
  });
  const commandIntents = operation.graph.steps.map((step) => ({
    commandType: step.commandType,
    payload: materializeTopologyEditOperationPayload(step.payload, candidate.operationBindings),
  }));
  return createTopologyEditOperationPlan({
    operationType: 'RECONNECT_ENDPOINTS',
    basisHash: candidate.priorCanonicalHash,
    targetIds,
    changedScope,
    commandIntents,
    parameters: deepFreeze({
      connectEndpointsOperationHash: operation.operationHash,
      connectEndpointsCandidateHash: candidate.candidateHash,
      selectedAlternativeId: operation.alternativeId,
      selectedAlternativeHash: operation.alternativeHash,
      catalogueCompatibility: {
        status: operation.parentPlan.compatibilityStatus,
        pipeRecordId: operation.parentPlan.intent.catalogueBinding.recordId,
        catalogueHash: operation.catalogueHash,
        elbowRecordIds: operation.elbowBindings.map((row) => row.recordId),
        elbowBindingHashes: operation.elbowBindingHashes,
      },
    }),
    unresolvedEvidence: [],
  });
}
