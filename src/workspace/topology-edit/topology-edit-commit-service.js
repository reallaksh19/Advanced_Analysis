/** Prepared-export-only workspace commit, read-back verification, and rollback. */
import { WorkspaceState } from '../workspace-state.js';
import { EventBus } from '../event-bus.js';
import { EVENT_TOPICS } from '../event-topics.js';
import { rebuildWorkspaceDataset } from '../dataset-adapter.js';
import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { applyCanonicalTopologyToWorkspaceEntities } from './topology-edit-source-adapter-dispatch.js';
import { assertCanonicalTopologyHash } from './topology-edit-canonical-state.js';
import { assertPreparedTopologyEditExport } from './topology-edit-export.js';

export const TOPOLOGY_EDIT_COMMIT_PLAN_SCHEMA = 'TopologyEditWorkspaceCommitPlan.v1';
export const TOPOLOGY_EDIT_COMMIT_RECEIPT_SCHEMA = 'TopologyEditWorkspaceCommitReceipt.v1';
export const TOPOLOGY_EDIT_INVALIDATION_SCHEMA = 'TopologyEditInvalidationManifest.v1';
let commitLocked = false;

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`TopologyEditCommitService: ${label} is required.`);
  return text;
}
function datasetSourceHash(dataset) {
  return dataset?.sourceSnapshot?.sourceSemanticHash ?? null;
}
function snapshotAuthority(snapshot) {
  if (!snapshot?.dataset) throw new Error('TopologyEditCommitService: no active workspace dataset.');
  return {
    snapshotVersion: snapshot.version,
    datasetHash: semanticHash(snapshot.dataset),
    datasetId: snapshot.dataset.datasetId,
    datasetVersion: Number(snapshot.dataset.version || 0),
    sourceHash: datasetSourceHash(snapshot.dataset),
  };
}
function invalidationManifest(preparedExport) {
  const material = {
    schema: TOPOLOGY_EDIT_INVALIDATION_SCHEMA,
    cause: 'TOPOLOGY_EDIT_COMMIT',
    preparedOutputHash: preparedExport.preparedOutputHash,
    invalidatedProducts: [
      'PIPING_TOPOLOGY',
      'SUPPORT_RESTRAINT_MODEL',
      'LOAD_CALCULATION',
      'LFEA',
      'LAFEA',
    ],
    preservedProducts: ['SOURCE_SNAPSHOT'],
    calculationFreshness: 'STALE',
  };
  return deepFreeze({ ...material, invalidationHash: semanticHash(material) });
}
function assertPreparedBasis(preparedExport, base, snapshot) {
  const authority = snapshotAuthority(snapshot);
  const basis = preparedExport.stagedJson.basis;
  const checks = {
    datasetId: authority.datasetId,
    datasetVersion: authority.datasetVersion,
    sourceHash: authority.sourceHash,
    baseCanonicalHash: base.canonicalTopologyHash,
  };
  for (const [key, current] of Object.entries(checks)) {
    if (basis[key] !== current) throw new Error(`TopologyEditCommitService: stale ${key}.`);
  }
  if (preparedExport.draftCanonicalTopologyHash
    !== preparedExport.stagedJson.canonicalTopology.canonicalTopologyHash) {
    throw new Error('TopologyEditCommitService: prepared draft canonical hash mismatch.');
  }
  return authority;
}

export function prepareTopologyEditWorkspaceCommit({
  preparedExport: preparedInput,
  baseCanonicalTopology,
  workspaceSnapshot,
  editSessionId,
} = {}) {
  const preparedExport = assertPreparedTopologyEditExport(preparedInput);
  assertCanonicalTopologyHash(baseCanonicalTopology);
  const authority = assertPreparedBasis(preparedExport, baseCanonicalTopology, workspaceSnapshot);
  const sessionId = requiredText(editSessionId, 'editSessionId');
  const editedTopology = preparedExport.stagedJson.canonicalTopology;
  assertCanonicalTopologyHash(editedTopology);
  const entities = applyCanonicalTopologyToWorkspaceEntities(
    workspaceSnapshot.dataset,
    baseCanonicalTopology,
    editedTopology,
    sessionId,
  );
  const invalidation = invalidationManifest(preparedExport);
  const editAudit = {
    schema: 'TopologyEditCommitAudit.v2',
    editSessionId: sessionId,
    sourceManifestHash: preparedExport.sourceManifestHash,
    preparedExportHash: preparedExport.preparedExportHash,
    preparedOutputHash: preparedExport.preparedOutputHash,
    draftCanonicalTopologyHash: preparedExport.draftCanonicalTopologyHash,
    journalHash: preparedExport.journalHash,
    activeLedgerHash: preparedExport.activeLedgerHash,
    invalidationHash: invalidation.invalidationHash,
  };
  const stagedDataset = rebuildWorkspaceDataset(
    workspaceSnapshot.dataset,
    entities,
    editAudit,
  );
  const stagedDatasetHash = semanticHash(stagedDataset);
  const material = {
    schema: TOPOLOGY_EDIT_COMMIT_PLAN_SCHEMA,
    editSessionId: sessionId,
    sourceSnapshotVersion: authority.snapshotVersion,
    sourceDatasetHash: authority.datasetHash,
    sourceDatasetId: authority.datasetId,
    sourceDatasetVersion: authority.datasetVersion,
    sourceHash: authority.sourceHash,
    baseCanonicalHash: baseCanonicalTopology.canonicalTopologyHash,
    draftCanonicalTopologyHash: preparedExport.draftCanonicalTopologyHash,
    preparedExportHash: preparedExport.preparedExportHash,
    preparedOutputHash: preparedExport.preparedOutputHash,
    stagedDatasetHash,
    invalidation,
  };
  return deepFreeze({
    ...material,
    commitPlanHash: semanticHash(material),
    preparedExport,
    stagedDataset,
  });
}

export function assertTopologyEditWorkspaceCommitPlan(value) {
  if (value?.schema !== TOPOLOGY_EDIT_COMMIT_PLAN_SCHEMA) {
    throw new TypeError(`Commit plan must use ${TOPOLOGY_EDIT_COMMIT_PLAN_SCHEMA}.`);
  }
  assertPreparedTopologyEditExport(value.preparedExport);
  if (semanticHash(value.stagedDataset) !== value.stagedDatasetHash) {
    throw new Error('TopologyEditCommitService: staged dataset hash mismatch.');
  }
  const material = { ...value };
  delete material.commitPlanHash;
  delete material.preparedExport;
  delete material.stagedDataset;
  if (semanticHash(material) !== value.commitPlanHash) {
    throw new Error('TopologyEditCommitService: commit plan hash mismatch.');
  }
  return value;
}

function assertCurrentAuthority(plan, snapshot) {
  const authority = snapshotAuthority(snapshot);
  const checks = {
    snapshotVersion: plan.sourceSnapshotVersion,
    datasetHash: plan.sourceDatasetHash,
    datasetId: plan.sourceDatasetId,
    datasetVersion: plan.sourceDatasetVersion,
    sourceHash: plan.sourceHash,
  };
  for (const [key, expected] of Object.entries(checks)) {
    if (authority[key] !== expected) throw new Error(`TopologyEditCommitService: workspace changed before commit (${key}).`);
  }
  return authority;
}
function adapterAuthority(adapter) {
  for (const method of ['readSnapshot', 'swapDataset', 'publishSnapshotChanged']) {
    if (typeof adapter?.[method] !== 'function') {
      throw new TypeError(`TopologyEditCommitService: adapter.${method} is required.`);
    }
  }
  return adapter;
}
function receipt(plan, disposition, snapshot, rollback = null) {
  const material = {
    schema: TOPOLOGY_EDIT_COMMIT_RECEIPT_SCHEMA,
    disposition,
    commitPlanHash: plan.commitPlanHash,
    preparedOutputHash: plan.preparedOutputHash,
    committedDatasetHash: semanticHash(snapshot.dataset),
    workspaceSnapshotVersion: snapshot.version,
    datasetVersion: Number(snapshot.dataset.version || 0),
    invalidationHash: plan.invalidation.invalidationHash,
    rollback,
  };
  return deepFreeze({ ...material, receiptHash: semanticHash(material), snapshot });
}
function rollbackIfNeeded(adapter, previousSnapshot, previousHash) {
  const current = adapter.readSnapshot();
  if (current?.dataset && semanticHash(current.dataset) === previousHash) {
    return { performed: false, snapshot: current };
  }
  const restored = adapter.swapDataset(previousSnapshot.dataset);
  if (!restored?.dataset || semanticHash(restored.dataset) !== previousHash) {
    throw new Error('TopologyEditCommitService: rollback read-back verification failed.');
  }
  return { performed: true, snapshot: restored };
}

export function commitTopologyEditWorkspace({ plan: planInput, adapter } = {}) {
  const plan = assertTopologyEditWorkspaceCommitPlan(planInput);
  const authority = adapterAuthority(adapter);
  if (commitLocked) throw new Error('TopologyEditCommitService: another topology edit commit is active.');
  commitLocked = true;
  let finalReceipt;
  try {
    const previousSnapshot = authority.readSnapshot();
    assertCurrentAuthority(plan, previousSnapshot);
    const previousHash = semanticHash(previousSnapshot.dataset);
    try {
      const committedSnapshot = authority.swapDataset(plan.stagedDataset);
      if (!committedSnapshot?.dataset
        || semanticHash(committedSnapshot.dataset) !== plan.stagedDatasetHash) {
        throw new Error('TopologyEditCommitService: committed dataset read-back hash mismatch.');
      }
      finalReceipt = receipt(plan, 'COMMITTED', committedSnapshot);
    } catch (error) {
      const rollback = rollbackIfNeeded(authority, previousSnapshot, previousHash);
      const rollbackEvidence = {
        performed: rollback.performed,
        previousDatasetHash: previousHash,
        restoredDatasetHash: semanticHash(rollback.snapshot.dataset),
        reason: error instanceof Error ? error.message : String(error),
      };
      finalReceipt = receipt(plan, 'ROLLED_BACK', rollback.snapshot, rollbackEvidence);
    }
  } finally {
    commitLocked = false;
  }
  authority.publishSnapshotChanged(finalReceipt.snapshot, finalReceipt);
  return finalReceipt;
}

export function createProductionTopologyEditWorkspaceAdapter() {
  return Object.freeze({
    readSnapshot: () => WorkspaceState.getSnapshot(),
    swapDataset: (dataset) => WorkspaceState.loadDataset(dataset),
    publishSnapshotChanged: (snapshot) => {
      EventBus.publish(EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED, { snapshot });
    },
  });
}

export function commitPreparedTopologyEditExport({
  preparedExport,
  baseCanonicalTopology,
  editSessionId,
  adapter = createProductionTopologyEditWorkspaceAdapter(),
} = {}) {
  const plan = prepareTopologyEditWorkspaceCommit({
    preparedExport,
    baseCanonicalTopology,
    workspaceSnapshot: adapterAuthority(adapter).readSnapshot(),
    editSessionId,
  });
  return commitTopologyEditWorkspace({ plan, adapter });
}
