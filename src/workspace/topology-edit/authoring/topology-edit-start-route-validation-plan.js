import { deepFreeze } from '../../../core/shared-piping-model/index.js';
import { createTopologyEditChangedScope } from '../professional/topology-edit-change-scope.js';
import { createTopologyEditOperationPlan } from '../professional/topology-edit-operation-plan.js';
import { materializeTopologyEditOperationPayload } from './topology-edit-operation-graph.js';
import { assertStartRouteCandidate } from './topology-edit-start-route-candidate.js';
import { assertStartRoutePlan } from './topology-edit-start-route-plan.js';

function exactBinding(candidate, key, prefix) {
  const id = String(candidate.operationBindings?.[key] ?? '').trim();
  if (!id || !id.startsWith(prefix)) {
    throw new RangeError(`StartRouteValidationPlan: ${key} must bind an exact ${prefix} ID.`);
  }
  return id;
}

export function createStartRouteValidationOperationPlan({
  plan: planInput,
  candidate: candidateInput,
} = {}) {
  const plan = assertStartRoutePlan(planInput);
  const candidate = assertStartRouteCandidate(candidateInput);
  if (candidate.planHash !== plan.planHash) {
    throw new RangeError('StartRouteValidationPlan: candidate differs from plan.');
  }
  const nodeIds = [
    exactBinding(candidate, 'step-1.created-node', 'node:'),
    exactBinding(candidate, 'step-2.created-node', 'node:'),
  ];
  const edgeIds = [exactBinding(candidate, 'step-3.created-edge', 'edge:')];
  const targetIds = [...nodeIds, ...edgeIds].sort();
  const changedScope = createTopologyEditChangedScope({
    basisHash: candidate.priorCanonicalHash,
    nodeIds,
    edgeIds,
    junctionIds: [],
    supportIds: [],
    boundaryIds: [],
    sourceRecordIds: [plan.intent.catalogueBinding.recordId],
    validationNeighbourhoodIds: targetIds,
  });
  const commandIntents = plan.graph.steps.map((step) => ({
    commandType: step.commandType,
    payload: materializeTopologyEditOperationPayload(
      step.payload,
      candidate.operationBindings,
    ),
  }));
  return createTopologyEditOperationPlan({
    operationType: 'START_ROUTE',
    basisHash: candidate.priorCanonicalHash,
    targetIds,
    changedScope,
    commandIntents,
    parameters: deepFreeze({
      startRoutePlanHash: plan.planHash,
      startRouteCandidateHash: candidate.candidateHash,
      catalogueCompatibility: {
        status: 'COMPATIBLE',
        selectedRecordId: plan.intent.catalogueBinding.recordId,
        catalogueHash: plan.intent.catalogueBinding.catalogueHash,
        bindingHash: plan.intent.catalogueBinding.bindingHash,
      },
    }),
    unresolvedEvidence: [],
  });
}
