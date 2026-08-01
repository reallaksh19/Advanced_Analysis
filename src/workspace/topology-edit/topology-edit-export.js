/**
 * Topology Edit Draft — Phase 6 Audit Package Export
 *
 * Generates downloadable sealed JSON audit packages containing command journals,
 * baseline manifests, and committed entity snapshots.
 */

import { TOPOLOGY_EDIT_BASELINE_MANIFEST } from './topology-edit-baseline-manifest.js';
import { semanticHash } from '../../core/shared-piping-model/index.js';

export function buildSealedAuditPackage(journalPackage, currentEntities = []) {
  const entitiesSnapshot = JSON.parse(JSON.stringify(currentEntities));
  // A real content hash, not a timestamp+count string — two exports of the
  // same journal/entities must produce the same sealedHash (byte-stability
  // is the whole point of a "sealed" package), and any tamper must change it.
  const sealedHash = semanticHash({ journal: journalPackage, entities: entitiesSnapshot });
  return Object.freeze({
    schema: 'advanced-topology-edit-audit-package/v1',
    exportedAt: Date.now(),
    manifest: TOPOLOGY_EDIT_BASELINE_MANIFEST,
    journal: journalPackage,
    entitiesSnapshot,
    summary: Object.freeze({
      totalCommands: journalPackage?.entriesCount || 0,
      totalEntities: currentEntities.length,
      sealedHash,
    }),
  });
}
