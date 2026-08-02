/** Production coordinator for deterministic draft save, reload, export, and commit. */
import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { serializeTopologyEditCertifiedJournal } from './topology-edit-certified-journal.js';
import {
  STORAGE_KEY_EDIT_DRAFT,
  TopologyEditPersistence,
  createTopologyEditDraftPackage,
} from './topology-edit-persistence.js';
import {
  buildSealedAuditPackage,
  prepareTopologyEditExport,
  serializeSealedAuditPackage,
} from './topology-edit-export.js';
import { commitPreparedTopologyEditExport } from './topology-edit-commit-service.js';
import { TOPOLOGY_EDIT_SOURCE_MANIFEST_SHA256 } from './topology-edit-baseline-manifest.js';

export const TOPOLOGY_EDIT_LIFECYCLE_RESULT_SCHEMA = 'TopologyEditLifecycleResult.v1';

function requiredFunction(value, label) {
  if (typeof value !== 'function') {
    throw new TypeError(`TopologyEditLifecycleController: ${label} is required.`);
  }
  return value;
}

function checkerPolicyHash(session) {
  return session.checkerPolicy === null || session.checkerPolicy === undefined
    ? null
    : semanticHash(session.checkerPolicy);
}

function result(action, disposition, details = {}) {
  const material = {
    schema: TOPOLOGY_EDIT_LIFECYCLE_RESULT_SCHEMA,
    action,
    disposition,
    ...details,
  };
  return deepFreeze({ ...material, resultHash: semanticHash(material) });
}

function browserDownload(text, fileName) {
  if (!globalThis.document || !globalThis.Blob || !globalThis.URL?.createObjectURL) {
    throw new Error('TopologyEditLifecycleController: browser download authority is unavailable.');
  }
  const url = globalThis.URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  try {
    const anchor = globalThis.document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.hidden = true;
    globalThis.document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    globalThis.URL.revokeObjectURL(url);
  }
}

export class TopologyEditLifecycleController {
  constructor({
    getSession,
    getViewState = () => ({}),
    storage = globalThis.localStorage,
    downloadText = browserDownload,
    commitPrepared = commitPreparedTopologyEditExport,
  } = {}) {
    this.getSession = requiredFunction(getSession, 'getSession');
    this.getViewState = requiredFunction(getViewState, 'getViewState');
    this.storage = storage;
    this.downloadText = requiredFunction(downloadText, 'downloadText');
    this.commitPrepared = requiredFunction(commitPrepared, 'commitPrepared');
  }

  session() {
    const session = this.getSession();
    if (!session) throw new Error('TopologyEditLifecycleController: no active certified session.');
    session.assertUsable();
    return session;
  }

  expected(session = this.session()) {
    return {
      sourceManifestHash: TOPOLOGY_EDIT_SOURCE_MANIFEST_SHA256,
      checkerPolicyHash: checkerPolicyHash(session),
    };
  }

  createDraftPackage(session = this.session()) {
    return createTopologyEditDraftPackage({
      sourceManifestHash: TOPOLOGY_EDIT_SOURCE_MANIFEST_SHA256,
      journal: session.journal,
      activeCanonicalTopologyHash: session.currentTopology().canonicalTopologyHash,
      checkerPolicyHash: checkerPolicyHash(session),
      viewState: this.getViewState(),
    });
  }

  hasPersistedDraft() {
    if (!this.storage || typeof this.storage.getItem !== 'function') return false;
    return this.storage.getItem(STORAGE_KEY_EDIT_DRAFT) !== null;
  }

  saveDraft() {
    const draftPackage = this.createDraftPackage();
    const receipt = TopologyEditPersistence.saveDraft(draftPackage, this.storage);
    return result('SAVE', 'SAVED', {
      packageHash: draftPackage.packageHash,
      storageReceipt: receipt,
      draftPackage,
    });
  }

  reloadDraft() {
    const session = this.session();
    const restored = TopologyEditPersistence.loadDraft({
      storage: this.storage,
      baseCanonicalTopology: session.baseCanonicalTopology,
      expected: this.expected(session),
    });
    if (!restored) return result('RELOAD', 'EMPTY');
    session.reloadJournal(serializeTopologyEditCertifiedJournal(restored.journal));
    return result('RELOAD', 'RESTORED', {
      packageHash: restored.packageHash,
      activeCanonicalTopologyHash: restored.activeCanonicalTopologyHash,
      restored,
    });
  }

  prepareExport(draftPackage = this.createDraftPackage()) {
    const session = this.session();
    return prepareTopologyEditExport({
      draftPackage,
      baseCanonicalTopology: session.baseCanonicalTopology,
      expected: this.expected(session),
    });
  }

  exportDraft() {
    const draftPackage = this.createDraftPackage();
    const preparedExport = this.prepareExport(draftPackage);
    const auditPackage = buildSealedAuditPackage(preparedExport);
    const serialized = serializeSealedAuditPackage(auditPackage);
    const fileName = `${draftPackage.journal.basis.datasetId}-topology-edit-audit.json`;
    this.downloadText(serialized, fileName);
    return result('EXPORT', 'EXPORTED', {
      packageHash: draftPackage.packageHash,
      preparedOutputHash: preparedExport.preparedOutputHash,
      sealedHash: auditPackage.sealedHash,
      fileName,
      byteLength: new TextEncoder().encode(serialized).byteLength,
    });
  }

  commitDraft() {
    const session = this.session();
    const saved = this.saveDraft();
    const preparedExport = this.prepareExport(saved.draftPackage);
    const editSessionId = `topology-edit:${semanticHash({
      baseCanonicalHash: session.baseAuthority.baseCanonicalHash,
      journalHash: session.journal.journalHash,
    }).split(':').at(-1)}`;
    const receipt = this.commitPrepared({
      preparedExport,
      baseCanonicalTopology: session.baseCanonicalTopology,
      editSessionId,
    });
    const clearReceipt = receipt.disposition === 'COMMITTED'
      ? TopologyEditPersistence.clearDraft(this.storage)
      : null;
    return result('COMMIT', receipt.disposition, {
      packageHash: saved.packageHash,
      preparedOutputHash: preparedExport.preparedOutputHash,
      commitReceipt: receipt,
      clearReceipt,
    });
  }
}
