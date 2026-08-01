/**
 * Topology Edit Draft — Phase 7 Transactional Workspace Commit & Downstream Invalidation Service
 *
 * Atomically commits active Edit Draft changes into WorkspaceState.dataset and
 * invalidates downstream topology, load calculation, and FEA evidence packages.
 */

import { WorkspaceState } from '../workspace-state.js';
import { EventBus } from '../event-bus.js';
import { EVENT_TOPICS } from '../event-topics.js';

export function commitDraftToWorkspace(journalPackage, updatedEntities = []) {
  if (!journalPackage || !Array.isArray(updatedEntities)) {
    throw new TypeError('commitDraftToWorkspace: Invalid journal package or entities.');
  }

  const snapshot = WorkspaceState.getSnapshot();
  if (!snapshot || !snapshot.dataset) {
    throw new Error('commitDraftToWorkspace: No active workspace dataset to commit into.');
  }

  // Atomically update dataset entities
  const updatedDataset = {
    ...snapshot.dataset,
    version: (snapshot.dataset.version || 1) + 1,
    lastCommittedAt: Date.now(),
    entities: updatedEntities,
  };

  // Push updated dataset into WorkspaceState
  const newSnapshot = WorkspaceState.loadDataset(updatedDataset);

  // Publish invalidation and load events
  EventBus.publish(EVENT_TOPICS.DATASET_LOADED, { dataset: updatedDataset });
  EventBus.publish(EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED, { snapshot: newSnapshot });

  return Object.freeze({
    success: true,
    committedAt: Date.now(),
    newVersion: updatedDataset.version,
    entityCount: updatedEntities.length,
  });
}
