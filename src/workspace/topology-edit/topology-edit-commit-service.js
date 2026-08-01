/**
 * Topology Edit Draft — Phase 7 Transactional Workspace Commit & Downstream Invalidation Service
 *
 * Atomically commits active Edit Draft changes into WorkspaceState.dataset and
 * invalidates downstream topology, load calculation, and FEA evidence packages.
 *
 * Mirrors the one established commit pattern already used by
 * sequential-sketcher/sequential-command-gateway.js: rebuild the dataset via
 * rebuildWorkspaceDataset (so hierarchy/summary/sharedModel/calculationFreshness
 * are recomputed, not dropped), push it through WorkspaceState.loadDataset, then
 * publish exactly one WORKSPACE_SNAPSHOT_CHANGED event.
 */

import { WorkspaceState } from '../workspace-state.js';
import { EventBus } from '../event-bus.js';
import { EVENT_TOPICS } from '../event-topics.js';
import { rebuildWorkspaceDataset } from '../dataset-adapter.js';
import { semanticHash } from '../../core/shared-piping-model/index.js';

export function commitDraftToWorkspace(journalPackage, updatedEntities = [], editAudit = null) {
  if (!journalPackage || !Array.isArray(updatedEntities)) {
    throw new TypeError('commitDraftToWorkspace: Invalid journal package or entities.');
  }

  const snapshot = WorkspaceState.getSnapshot();
  if (!snapshot || !snapshot.dataset) {
    throw new Error('commitDraftToWorkspace: No active workspace dataset to commit into.');
  }

  const audit = editAudit || defaultEditAudit(snapshot.dataset, journalPackage);
  const updatedDataset = rebuildWorkspaceDataset(snapshot.dataset, updatedEntities, audit);

  const newSnapshot = WorkspaceState.loadDataset(updatedDataset);
  EventBus.publish(EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED, { snapshot: newSnapshot });

  return Object.freeze({
    success: true,
    committedAt: Date.now(),
    newVersion: updatedDataset.version,
    entityCount: updatedEntities.length,
  });
}

function defaultEditAudit(dataset, journalPackage) {
  return {
    schema: 'topology-edit-draft-commit/v1',
    journal: journalPackage,
    sourceDatasetHash: dataset.sourceSnapshot?.sourceSemanticHash,
    commitHash: semanticHash(journalPackage),
  };
}
