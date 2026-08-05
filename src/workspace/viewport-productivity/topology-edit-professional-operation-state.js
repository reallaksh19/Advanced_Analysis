import {
  assertTopologyEditOperationTransactionReceipt,
} from '../topology-edit/professional/topology-edit-operation-transaction.js';
import {
  topologyEditBlockingDiagnostics,
} from '../topology-edit/professional/topology-edit-validation-blocking.js';
import {
  renderTopologyEditProfessionalOperationPanel,
} from './topology-edit-professional-operation-panel.js';

export const TOPOLOGY_EDIT_PROFESSIONAL_VIEW_STATE_SCHEMA =
  'TopologyEditProfessionalOperationViewState.v1';

export function createTopologyEditProfessionalInitialValues() {
  return {
    operationType: 'EXTEND_EDGE',
    endpoint: 'TO',
    distanceMm: 100,
    centerDistanceMm: 100,
    insertionLengthMm: '',
    inlineDirection: 'FROM_TO',
    diameterMm: 100,
    entityType: 'PIPE',
    deltaX: 0,
    deltaY: 0,
    deltaZ: 0,
    riseMm: 1,
    runMm: 100,
    direction: 'ASCENDING',
  };
}

export function createTopologyEditProfessionalViewState(runtime) {
  return {
    schema: TOPOLOGY_EDIT_PROFESSIONAL_VIEW_STATE_SCHEMA,
    values: runtime.values,
    transaction: runtime.transaction,
    redoTransaction: runtime.redoTransaction,
  };
}

export function restoreTopologyEditProfessionalViewState(runtime, value) {
  if (value?.schema !== TOPOLOGY_EDIT_PROFESSIONAL_VIEW_STATE_SCHEMA) return;
  runtime.values = value.values && typeof value.values === 'object'
    ? { ...createTopologyEditProfessionalInitialValues(), ...value.values }
    : createTopologyEditProfessionalInitialValues();
  const currentHash = runtime.controller.session?.currentTopology()?.canonicalTopologyHash;
  runtime.transaction = restoreReceipt(
    value.transaction,
    'resultingCanonicalHash',
    currentHash,
  );
  runtime.redoTransaction = restoreReceipt(
    value.redoTransaction,
    'priorCanonicalHash',
    currentHash,
  );
}

export function reconcileTopologyEditProfessionalReceipts(runtime, canonical) {
  const currentHash = canonical?.canonicalTopologyHash ?? null;
  if (runtime.transaction?.resultingCanonicalHash !== currentHash) {
    runtime.transaction = null;
  }
  if (runtime.redoTransaction?.priorCanonicalHash !== currentHash) {
    runtime.redoTransaction = null;
  }
}

export function renderTopologyEditProfessionalRuntime(runtime) {
  if (!runtime.element) return;
  const currentHash = runtime.controller.session?.currentTopology()?.canonicalTopologyHash;
  renderTopologyEditProfessionalOperationPanel(runtime.element, {
    values: runtime.values,
    catalogue: runtime.catalogue,
    componentContext: runtime.componentContext,
    plan: runtime.plan,
    candidate: runtime.candidate,
    validation: runtime.validation,
    blockingIssueCount: runtime.validation
      ? topologyEditBlockingDiagnostics(runtime.validation, ['HIGH']).length
      : 0,
    validationPending: runtime.validationPending,
    transactionPreview: runtime.transactionPreview,
    transaction: runtime.transaction,
    canUndoTransaction: runtime.transaction?.resultingCanonicalHash === currentHash,
    canRedoTransaction: runtime.redoTransaction?.priorCanonicalHash === currentHash,
    message: runtime.message,
    error: runtime.error,
  });
}

export function updateTopologyEditProfessionalEvidence(runtime) {
  const host = runtime.controller.hostElement;
  if (!host) return;
  const session = runtime.controller.session;
  const context = runtime.componentContext;
  host.dataset.topologyEditCanonicalHash = session?.currentTopology()?.canonicalTopologyHash ?? '';
  host.dataset.topologyEditJournalHash = session?.journal?.journalHash ?? '';
  host.dataset.topologyEditSessionVersion = String(session?.journal?.sessionVersion ?? '');
  host.dataset.topologyEditActiveCommandCount = String(
    session?.journal?.activeCommandIds?.length ?? 0,
  );
  host.dataset.topologyEditProfessionalCatalogueHash = runtime.catalogue?.catalogueHash ?? '';
  host.dataset.topologyEditProfessionalPlanHash = runtime.plan?.planHash ?? '';
  host.dataset.topologyEditProfessionalCandidateHash = runtime.candidate?.candidateHash ?? '';
  host.dataset.topologyEditProfessionalCandidateTopologyHash = runtime.candidate?.resultingCanonicalHash ?? '';
  host.dataset.topologyEditProfessionalValidationHash = runtime.validation?.validationHash ?? '';
  host.dataset.topologyEditProfessionalTransactionPreviewHash = runtime.transactionPreview?.previewHash ?? '';
  host.dataset.topologyEditProfessionalTransactionHash = runtime.transaction?.transactionHash ?? '';
  host.dataset.topologyEditComponentHudStatus = context?.status ?? '';
  host.dataset.topologyEditComponentHudType = context?.componentType ?? '';
  host.dataset.topologyEditComponentHudCanonicalId = context?.selectedCanonicalId ?? '';
  host.dataset.topologyEditComponentHudCandidateCount = String(
    context?.candidateRecordIds?.length ?? 0,
  );
  host.dataset.topologyEditComponentHudRecommendedRecordId =
    context?.recommendedRecordId ?? '';
  host.dataset.topologyEditComponentHudContextHash = context?.contextHash ?? '';
}

function restoreReceipt(value, hashField, currentHash) {
  if (!value || value[hashField] !== currentHash) return null;
  try {
    return assertTopologyEditOperationTransactionReceipt(value);
  } catch {
    return null;
  }
}
