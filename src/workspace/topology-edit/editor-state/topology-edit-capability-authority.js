import {
  canRunTopologyEditAction,
  topologyEditExactGapContext,
  TOPOLOGY_EDIT_EXACT_GAP_MM,
} from '../topology-edit-command-ui.js';
import {
  createTopologyEditProfessionalOperationPlan,
} from '../professional/topology-edit-professional-operation-session.js';
import { planProfessionalOperation } from '../professional/topology-edit-route-operations.js';
import {
  createTopologyEditCapabilityReceipt,
  TOPOLOGY_EDIT_CAPABILITY_REASONS,
} from './topology-edit-capability-contract.js';

export function deriveTopologyEditCommandCapability(input = {}) {
  const actionId = text(input.actionId);
  const selection = legacySelection(input.selection);
  const topology = input.topology ?? null;
  const context = receiptContext(input, topology);
  if (!actionId) return blocked('COMMAND', 'UNKNOWN', context, 'SELECTION_REQUIRED', 'Choose a governed command.');

  if (actionId === 'move-positive-z') {
    return selection.nodeIds.length === 1
      ? available('COMMAND', actionId, context)
      : blocked('COMMAND', actionId, context, 'EXACT_NODE_REQUIRED', 'Requires one exact canonical node.');
  }
  if (Object.hasOwn(TOPOLOGY_EDIT_EXACT_GAP_MM, actionId)) {
    if (selection.nodeIds.length !== 2) {
      return blocked('COMMAND', actionId, context, 'TWO_NODES_REQUIRED', 'Requires two exact canonical nodes.');
    }
    if (!topologyEditExactGapContext(selection, topology)) {
      return blocked(
        'COMMAND',
        actionId,
        context,
        'EXACT_GAP_CONTEXT_INVALID',
        'Requires two distinct graph-open endpoints in different components.',
      );
    }
    return available('COMMAND', actionId, context);
  }
  if (!canRunTopologyEditAction(actionId, selection, topology)) {
    const reason = actionId.includes('edge') || ['disconnect-from', 'disconnect-to', 'delete-edge'].includes(actionId)
      ? ['EXACT_EDGE_REQUIRED', 'Requires one exact canonical edge.']
      : ['TWO_NODES_REQUIRED', 'Requires the exact node selection for this command.'];
    return blocked('COMMAND', actionId, context, ...reason);
  }
  return available('COMMAND', actionId, context);
}

export function deriveTopologyEditProfessionalCapability(input = {}) {
  const values = input.values ?? {};
  const operationType = text(values.operationType).toUpperCase();
  const topology = input.topology ?? null;
  const context = receiptContext(input, topology);
  if (!operationType) {
    return needsInput('PROFESSIONAL', 'UNKNOWN', context, 'REQUIRED_ENGINEERING_INPUT_MISSING', 'Choose an engineering operation.', ['operationType']);
  }
  if (!topology?.canonicalTopologyHash) {
    return blocked('PROFESSIONAL', operationType, context, 'PLANNER_BLOCKED', 'Canonical topology is unavailable.');
  }

  if (operationType === 'CREATE_ORTHOGONAL_OFFSET' && !text(values.cornerNodeId)) {
    const selection = legacySelection(input.selection);
    const [fromNodeId, toNodeId] = selection.nodeIds;
    if (!fromNodeId || !toNodeId) {
      return needsInput(
        'PROFESSIONAL', operationType, context,
        'REQUIRED_ENGINEERING_INPUT_MISSING',
        'Select two endpoint nodes before evaluating the offset.',
        ['fromNodeId', 'toNodeId'],
      );
    }
    const result = planProfessionalOperation({
      topology,
      basisHash: topology.canonicalTopologyHash,
      operationType,
      fromNodeId,
      toNodeId,
    });
    if (result?.status === 'UNREPRESENTABLE_WITH_CURRENT_COMMANDS') {
      return unrepresentable('PROFESSIONAL', operationType, context, result.reasonCode, result.reason);
    }
  }

  try {
    const planned = createTopologyEditProfessionalOperationPlan({
      topology,
      selection: legacySelection(input.selection),
      values,
      catalogue: input.catalogue,
    });
    if (planned?.status === 'UNREPRESENTABLE_WITH_CURRENT_COMMANDS') {
      return unrepresentable('PROFESSIONAL', operationType, context, planned.reasonCode, planned.reason);
    }
    const unresolved = planned?.unresolvedEvidence ?? [];
    if (unresolved.length) {
      return needsInput(
        'PROFESSIONAL', operationType, context,
        unresolved[0]?.code || 'REQUIRED_ENGINEERING_INPUT_MISSING',
        'The operation is structurally supported but requires explicit unresolved engineering or custody evidence.',
        unresolved.map((row) => row.field || row.code),
      );
    }
    return available('PROFESSIONAL', operationType, context, { planHash: planned?.planHash ?? null });
  } catch (error) {
    const message = errorMessage(error);
    if (isMissingInputError(message)) {
      return needsInput(
        'PROFESSIONAL', operationType, context,
        'REQUIRED_ENGINEERING_INPUT_MISSING', message,
        missingInputLabels(message),
      );
    }
    return blocked('PROFESSIONAL', operationType, context, reasonForPlannerError(message), message);
  }
}

export function deriveTopologyEditComponentCapability(input = {}) {
  const componentContext = input.componentContext ?? null;
  const actionId = text(input.actionId || 'CATALOGUE_ACTION');
  const context = receiptContext(input, input.topology);
  const status = componentContext?.status;
  if (!componentContext || status === 'NO_SELECTION') {
    return blocked('COMPONENT_HUD', actionId, context, 'SELECTION_REQUIRED', 'Select one supported component.');
  }
  if (status === 'UNSUPPORTED') {
    return unrepresentable(
      'COMPONENT_HUD', actionId, context,
      'TABLE_INTENT_NOT_CERTIFIED',
      `${componentContext.componentType || 'Selected component'} has no certified HUD mutation in this slice.`,
    );
  }
  if (status === 'RESOLVED') return available('COMPONENT_HUD', actionId, context);
  if (status === 'INCOMPATIBLE') {
    return blocked(
      'COMPONENT_HUD', actionId, context,
      'EXACT_CATALOGUE_RECORD_INCOMPATIBLE',
      componentContext.diagnostics?.[0]?.message || 'Exact catalogue evidence is incompatible.',
    );
  }
  if (status === 'UNAVAILABLE') {
    return blocked('COMPONENT_HUD', actionId, context, 'CATALOGUE_UNAVAILABLE', 'No exact catalogue family is available.');
  }
  return needsInput(
    'COMPONENT_HUD', actionId, context,
    'EXACT_CATALOGUE_RECORD_REQUIRED',
    componentContext.diagnostics?.[0]?.message || 'Explicit exact catalogue selection is required.',
    ['catalogueRecordId'],
  );
}

function receiptContext(input, topology) {
  return {
    basisCanonicalHash: topology?.canonicalTopologyHash ?? input.basisCanonicalHash ?? null,
    selectionHash: input.selectionHash ?? input.selection?.selectionHash ?? null,
    selectionRevision: input.selectionRevision ?? input.selection?.revision ?? null,
  };
}
function available(surfaceId, actionId, context, details = {}) {
  return receipt(surfaceId, actionId, 'AVAILABLE', 'READY', 'Available for the current exact context.', context, [], details);
}
function needsInput(surfaceId, actionId, context, reasonCode, reason, missingEvidence = []) {
  return receipt(surfaceId, actionId, 'NEEDS_INPUT', reasonCode, reason, context, missingEvidence);
}
function blocked(surfaceId, actionId, context, reasonCode, reason) {
  return receipt(surfaceId, actionId, 'BLOCKED', reasonCode, reason, context);
}
function unrepresentable(surfaceId, actionId, context, reasonCode, reason) {
  return receipt(surfaceId, actionId, 'UNREPRESENTABLE', reasonCode, reason, context);
}
function receipt(surfaceId, actionId, status, reasonCode, reason, context, missingEvidence = [], details = {}) {
  return createTopologyEditCapabilityReceipt({
    surfaceId,
    actionId,
    status,
    reasonCode: TOPOLOGY_EDIT_CAPABILITY_REASONS[reasonCode] || reasonCode,
    reason,
    ...context,
    missingEvidence,
    details,
  });
}
function legacySelection(value) {
  if (Array.isArray(value?.nodeIds) || value?.edgeId !== undefined) {
    return { nodeIds: [...(value?.nodeIds ?? [])], edgeId: value?.edgeId ?? null };
  }
  const ids = value?.canonicalIds ?? [];
  return {
    nodeIds: ids.filter((id) => String(id).startsWith('node:')).slice(-2),
    edgeId: ids.find((id) => String(id).startsWith('edge:')) ?? null,
  };
}
function isMissingInputError(message) {
  return /\b(required|must contain|must be positive|must be finite|exact IDs?)\b/iu.test(message)
    && !/must have exactly one incident edge|must be isolated|must be different|must be orthogonal/iu.test(message);
}
function missingInputLabels(message) {
  const match = message.match(/(?:Session|Operations|Catalogue|Intent):\s*([^ ]+)\s/iu);
  return match ? [match[1]] : [];
}
function reasonForPlannerError(message) {
  if (/graph-open|exactly one incident edge/iu.test(message)) return 'ENDPOINT_NOT_GRAPH_OPEN';
  if (/catalogue|compatib/iu.test(message)) return 'EXACT_CATALOGUE_RECORD_INCOMPATIBLE';
  return 'PLANNER_BLOCKED';
}
function errorMessage(error) { return error instanceof Error ? error.message : String(error); }
function text(value) { return String(value ?? '').trim(); }
