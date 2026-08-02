/** Source-bound deterministic draft persistence and replay verification. */
import {
  canonicalPrettyStringify,
  deepFreeze,
  semanticHash,
} from '../../core/shared-piping-model/index.js';
import {
  assertTopologyEditCertifiedJournal,
} from './topology-edit-certified-journal.js';
import {
  replayTopologyEditCertifiedJournal,
} from './topology-edit-replay-service.js';
import { assertCanonicalTopologyHash } from './topology-edit-canonical-state.js';
import { TOPOLOGY_EDIT_GOVERNED_COMMANDS } from './topology-edit-command-contract.js';

export const STORAGE_KEY_EDIT_DRAFT = 'advanced_topology_edit_draft_v2';
export const TOPOLOGY_EDIT_DRAFT_PACKAGE_SCHEMA = 'TopologyEditDraftPackage.v2';
export const TOPOLOGY_EDIT_DRAFT_RESTORE_SCHEMA = 'TopologyEditDraftRestore.v1';
export const TOPOLOGY_EDIT_COMMAND_VOCABULARY_HASH = semanticHash({
  schema: 'TopologyEditCommandVocabulary.v2',
  commands: TOPOLOGY_EDIT_GOVERNED_COMMANDS,
});
export const TOPOLOGY_EDIT_REGENERATION_POLICY_HASH = semanticHash({
  schema: 'TopologyEditRegenerationPolicy.v2',
  reducer: 'PURE_RESOLVED_COMMAND_REPLAY',
  validation: 'FULL_CANDIDATE_AND_CHECKER_POLICY',
  identity: 'DETERMINISTIC_COMMAND_ROLE_IDS',
});

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`TopologyEditPersistence: ${label} is required.`);
  return text;
}
function jsonClone(value, label) {
  try { return JSON.parse(JSON.stringify(value)); }
  catch { throw new TypeError(`TopologyEditPersistence: ${label} must be JSON serializable.`); }
}
function optionalHash(value, label) {
  if (value === null || value === undefined || value === '') return null;
  return requiredText(value, label);
}
function authorityMaterial(input, journal) {
  return {
    schema: 'TopologyEditDraftAuthority.v2',
    sourceManifestHash: requiredText(input.sourceManifestHash, 'sourceManifestHash'),
    basis: journal.basis,
    journalHash: journal.journalHash,
    activeLedgerHash: journal.activeLedgerHash,
    redoLedgerHash: journal.redoLedgerHash,
    activeCanonicalTopologyHash: requiredText(
      input.activeCanonicalTopologyHash,
      'activeCanonicalTopologyHash',
    ),
    commandVocabularyHash: input.commandVocabularyHash
      ?? TOPOLOGY_EDIT_COMMAND_VOCABULARY_HASH,
    regenerationPolicyHash: input.regenerationPolicyHash
      ?? TOPOLOGY_EDIT_REGENERATION_POLICY_HASH,
    checkerPolicyHash: optionalHash(input.checkerPolicyHash, 'checkerPolicyHash'),
  };
}

export function createTopologyEditDraftPackage(input = {}) {
  const journal = assertTopologyEditCertifiedJournal(input.journal);
  const authority = authorityMaterial(input, journal);
  const material = {
    schema: TOPOLOGY_EDIT_DRAFT_PACKAGE_SCHEMA,
    authority,
    journal,
    viewState: jsonClone(input.viewState ?? {}, 'viewState'),
  };
  return deepFreeze({
    ...material,
    draftAuthorityHash: semanticHash(authority),
    packageHash: semanticHash(material),
  });
}

export function assertTopologyEditDraftPackage(value) {
  if (value?.schema !== TOPOLOGY_EDIT_DRAFT_PACKAGE_SCHEMA) {
    throw new TypeError(`Topology edit draft must use ${TOPOLOGY_EDIT_DRAFT_PACKAGE_SCHEMA}.`);
  }
  const rebuilt = createTopologyEditDraftPackage({
    sourceManifestHash: value.authority?.sourceManifestHash,
    journal: value.journal,
    activeCanonicalTopologyHash: value.authority?.activeCanonicalTopologyHash,
    commandVocabularyHash: value.authority?.commandVocabularyHash,
    regenerationPolicyHash: value.authority?.regenerationPolicyHash,
    checkerPolicyHash: value.authority?.checkerPolicyHash,
    viewState: value.viewState,
  });
  if (rebuilt.draftAuthorityHash !== value.draftAuthorityHash
    || rebuilt.packageHash !== value.packageHash) {
    throw new Error('TopologyEditPersistence: draft package authority hash mismatch.');
  }
  return Object.isFrozen(value) ? value : rebuilt;
}

export function serializeTopologyEditDraftPackage(value) {
  return canonicalPrettyStringify(assertTopologyEditDraftPackage(value));
}
export function parseTopologyEditDraftPackage(serialized) {
  if (typeof serialized !== 'string' || !serialized.trim()) {
    throw new TypeError('TopologyEditPersistence: serialized draft text is required.');
  }
  return assertTopologyEditDraftPackage(JSON.parse(serialized));
}

function assertExpectedAuthority(draft, expected = {}) {
  const checks = {
    sourceManifestHash: expected.sourceManifestHash,
    commandVocabularyHash: expected.commandVocabularyHash
      ?? TOPOLOGY_EDIT_COMMAND_VOCABULARY_HASH,
    regenerationPolicyHash: expected.regenerationPolicyHash
      ?? TOPOLOGY_EDIT_REGENERATION_POLICY_HASH,
    checkerPolicyHash: expected.checkerPolicyHash,
  };
  for (const [key, expectedValue] of Object.entries(checks)) {
    if (expectedValue !== undefined && draft.authority[key] !== expectedValue) {
      throw new Error(`TopologyEditPersistence: stale ${key}.`);
    }
  }
}
function assertBaseAuthority(draft, base) {
  const basis = draft.authority.basis;
  const checks = {
    sourceHash: base.sourceHash,
    baseCanonicalHash: base.canonicalTopologyHash,
    datasetId: base.datasetId,
    datasetVersion: base.datasetVersion,
  };
  for (const [key, current] of Object.entries(checks)) {
    if (basis[key] !== current) throw new Error(`TopologyEditPersistence: stale base ${key}.`);
  }
}

export function restoreTopologyEditDraftPackage({
  package: packageInput,
  serializedPackage,
  baseCanonicalTopology,
  expected = {},
} = {}) {
  const draft = packageInput
    ? assertTopologyEditDraftPackage(packageInput)
    : parseTopologyEditDraftPackage(serializedPackage);
  assertCanonicalTopologyHash(baseCanonicalTopology);
  assertExpectedAuthority(draft, expected);
  assertBaseAuthority(draft, baseCanonicalTopology);
  const replay = replayTopologyEditCertifiedJournal({
    journal: draft.journal,
    baseCanonicalTopology,
  });
  if (replay.activeCanonicalTopologyHash
    !== draft.authority.activeCanonicalTopologyHash) {
    throw new Error('TopologyEditPersistence: replayed draft hash differs from persisted authority.');
  }
  const material = {
    schema: TOPOLOGY_EDIT_DRAFT_RESTORE_SCHEMA,
    packageHash: draft.packageHash,
    draftAuthorityHash: draft.draftAuthorityHash,
    journalHash: draft.journal.journalHash,
    replayHash: replay.replayHash,
    activeCanonicalTopologyHash: replay.activeCanonicalTopologyHash,
  };
  return deepFreeze({
    ...material,
    restoreHash: semanticHash(material),
    package: draft,
    journal: draft.journal,
    replay,
    viewState: draft.viewState,
  });
}

function storageAuthority(storage) {
  if (!storage || typeof storage.getItem !== 'function'
    || typeof storage.setItem !== 'function'
    || typeof storage.removeItem !== 'function') {
    throw new TypeError('TopologyEditPersistence: explicit Storage-compatible authority is required.');
  }
  return storage;
}

export class TopologyEditPersistence {
  static saveDraft(packageInput, storage = globalThis.localStorage) {
    const draft = assertTopologyEditDraftPackage(packageInput);
    const serialized = serializeTopologyEditDraftPackage(draft);
    storageAuthority(storage).setItem(STORAGE_KEY_EDIT_DRAFT, serialized);
    return deepFreeze({
      schema: 'TopologyEditDraftStorageReceipt.v1',
      action: 'SAVE',
      storageKey: STORAGE_KEY_EDIT_DRAFT,
      packageHash: draft.packageHash,
      byteLength: new TextEncoder().encode(serialized).byteLength,
    });
  }

  static loadDraft({ storage = globalThis.localStorage, ...restoreInput } = {}) {
    const serializedPackage = storageAuthority(storage).getItem(STORAGE_KEY_EDIT_DRAFT);
    if (serializedPackage === null) return null;
    return restoreTopologyEditDraftPackage({ ...restoreInput, serializedPackage });
  }

  static clearDraft(storage = globalThis.localStorage) {
    storageAuthority(storage).removeItem(STORAGE_KEY_EDIT_DRAFT);
    return deepFreeze({
      schema: 'TopologyEditDraftStorageReceipt.v1',
      action: 'CLEAR',
      storageKey: STORAGE_KEY_EDIT_DRAFT,
      packageHash: null,
      byteLength: 0,
    });
  }
}
