/** Deterministic prepared StagedJSON and sealed audit export authority. */
import {
  canonicalPrettyStringify,
  deepFreeze,
  semanticHash,
} from '../../core/shared-piping-model/index.js';
import { TOPOLOGY_EDIT_BASELINE_MANIFEST } from './topology-edit-baseline-manifest.js';
import {
  assertTopologyEditDraftPackage,
  restoreTopologyEditDraftPackage,
} from './topology-edit-persistence.js';

export const TOPOLOGY_EDIT_STAGED_JSON_SCHEMA = 'TopologyEditStagedJSON.v1';
export const TOPOLOGY_EDIT_PREPARED_EXPORT_SCHEMA = 'TopologyEditPreparedExport.v1';
export const TOPOLOGY_EDIT_AUDIT_PACKAGE_SCHEMA = 'TopologyEditAuditPackage.v2';

function jsonClone(value, label) {
  try { return JSON.parse(JSON.stringify(value)); }
  catch { throw new TypeError(`TopologyEditExport: ${label} must be JSON serializable.`); }
}
function normalizePolicy(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const policy = {
    includeCrosswalk: source.includeCrosswalk !== false,
    includeSourcePaths: source.includeSourcePaths !== false,
    fullModelRequired: true,
  };
  return deepFreeze({ ...policy, exportPolicyHash: semanticHash(policy) });
}
function projectCanonical(topology, policy) {
  const clone = jsonClone(topology, 'canonical topology');
  if (!policy.includeCrosswalk) delete clone.crosswalk;
  if (!policy.includeSourcePaths) {
    for (const collection of ['edges', 'junctions', 'supports', 'boundaries', 'rigids']) {
      for (const record of clone[collection] ?? []) delete record.sourcePath;
    }
  }
  return clone;
}

export function prepareTopologyEditExport({
  draftPackage: packageInput,
  baseCanonicalTopology,
  expected = {},
  exportPolicy,
} = {}) {
  const draftPackage = assertTopologyEditDraftPackage(packageInput);
  const restored = restoreTopologyEditDraftPackage({
    package: draftPackage,
    baseCanonicalTopology,
    expected,
  });
  const policy = normalizePolicy(exportPolicy);
  const topology = restored.replay.activeCanonicalTopology;
  const stagedMaterial = {
    schema: TOPOLOGY_EDIT_STAGED_JSON_SCHEMA,
    sourceManifestHash: draftPackage.authority.sourceManifestHash,
    basis: draftPackage.authority.basis,
    journalProjection: {
      journalHash: draftPackage.journal.journalHash,
      historyHash: draftPackage.journal.historyHash,
      activeLedgerHash: draftPackage.journal.activeLedgerHash,
      redoLedgerHash: draftPackage.journal.redoLedgerHash,
      activeCommandIds: draftPackage.journal.activeCommandIds,
      redoCommandIds: draftPackage.journal.redoCommandIds,
    },
    draftAuthorityHash: draftPackage.draftAuthorityHash,
    draftCanonicalTopologyHash: topology.canonicalTopologyHash,
    exportPolicy: policy,
    canonicalTopology: projectCanonical(topology, policy),
  };
  const stagedJson = deepFreeze({
    ...stagedMaterial,
    preparedOutputHash: semanticHash(stagedMaterial),
  });
  const material = {
    schema: TOPOLOGY_EDIT_PREPARED_EXPORT_SCHEMA,
    packageHash: draftPackage.packageHash,
    draftAuthorityHash: draftPackage.draftAuthorityHash,
    sourceManifestHash: draftPackage.authority.sourceManifestHash,
    journalHash: draftPackage.journal.journalHash,
    activeLedgerHash: draftPackage.journal.activeLedgerHash,
    draftCanonicalTopologyHash: topology.canonicalTopologyHash,
    exportPolicyHash: policy.exportPolicyHash,
    preparedOutputHash: stagedJson.preparedOutputHash,
    stagedJson,
  };
  return deepFreeze({ ...material, preparedExportHash: semanticHash(material) });
}

export function assertPreparedTopologyEditExport(value) {
  if (value?.schema !== TOPOLOGY_EDIT_PREPARED_EXPORT_SCHEMA
    || value?.stagedJson?.schema !== TOPOLOGY_EDIT_STAGED_JSON_SCHEMA) {
    throw new TypeError(`Prepared export must use ${TOPOLOGY_EDIT_PREPARED_EXPORT_SCHEMA}.`);
  }
  const stagedMaterial = { ...value.stagedJson };
  delete stagedMaterial.preparedOutputHash;
  if (semanticHash(stagedMaterial) !== value.stagedJson.preparedOutputHash
    || value.preparedOutputHash !== value.stagedJson.preparedOutputHash) {
    throw new Error('TopologyEditExport: prepared StagedJSON hash mismatch.');
  }
  const material = { ...value };
  delete material.preparedExportHash;
  if (semanticHash(material) !== value.preparedExportHash) {
    throw new Error('TopologyEditExport: prepared export hash mismatch.');
  }
  return value;
}

export function serializePreparedTopologyEditExport(value) {
  return canonicalPrettyStringify(assertPreparedTopologyEditExport(value));
}
export function parsePreparedTopologyEditExport(serialized) {
  if (typeof serialized !== 'string' || !serialized.trim()) {
    throw new TypeError('TopologyEditExport: serialized prepared export is required.');
  }
  return assertPreparedTopologyEditExport(JSON.parse(serialized));
}

export function buildSealedAuditPackage(preparedExportInput) {
  const preparedExport = assertPreparedTopologyEditExport(preparedExportInput);
  const material = {
    schema: TOPOLOGY_EDIT_AUDIT_PACKAGE_SCHEMA,
    manifest: TOPOLOGY_EDIT_BASELINE_MANIFEST,
    preparedExport,
    summary: {
      totalCommands: preparedExport.stagedJson.journalProjection.activeCommandIds.length,
      totalNodes: preparedExport.stagedJson.canonicalTopology.nodes?.length ?? 0,
      totalEdges: preparedExport.stagedJson.canonicalTopology.edges?.length ?? 0,
      preparedOutputHash: preparedExport.preparedOutputHash,
    },
  };
  return deepFreeze({ ...material, sealedHash: semanticHash(material) });
}
export function serializeSealedAuditPackage(value) {
  if (value?.schema !== TOPOLOGY_EDIT_AUDIT_PACKAGE_SCHEMA) {
    throw new TypeError(`Audit package must use ${TOPOLOGY_EDIT_AUDIT_PACKAGE_SCHEMA}.`);
  }
  const material = { ...value };
  delete material.sealedHash;
  if (semanticHash(material) !== value.sealedHash) {
    throw new Error('TopologyEditExport: sealed audit hash mismatch.');
  }
  return canonicalPrettyStringify(value);
}
