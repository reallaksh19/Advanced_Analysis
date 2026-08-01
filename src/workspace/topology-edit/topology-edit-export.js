/**
 * Topology Edit Draft — Phase 6 Audit Package Export
 *
 * Generates downloadable sealed JSON audit packages containing command journals,
 * baseline manifests, and committed entity snapshots.
 */

import { TOPOLOGY_EDIT_BASELINE_MANIFEST } from './topology-edit-baseline-manifest.js';

export function buildSealedAuditPackage(journalPackage, currentEntities = []) {
  return Object.freeze({
    schema: 'advanced-topology-edit-audit-package/v1',
    exportedAt: Date.now(),
    manifest: TOPOLOGY_EDIT_BASELINE_MANIFEST,
    journal: journalPackage,
    entitiesSnapshot: JSON.parse(JSON.stringify(currentEntities)),
    summary: Object.freeze({
      totalCommands: journalPackage?.entriesCount || 0,
      totalEntities: currentEntities.length,
      sealedHash: `hash-${Date.now()}-${currentEntities.length}`,
    }),
  });
}
