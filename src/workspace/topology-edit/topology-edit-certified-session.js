/**
 * Production-owned mutable boundary for the certified editing kernel.
 * All topology authority remains in immutable journal/replay values.
 */
import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { assertCanonicalTopologyHash } from './topology-edit-canonical-state.js';
import { createTopologyEditCommandRequest } from './topology-edit-command-contract.js';
import { serializeTopologyEditCertifiedJournal } from './topology-edit-certified-journal.js';
import { TopologyEditAutofixController } from './topology-edit-autofix-controller.js';
import {
  acceptTopologyEditCommand,
  cancelTopologyEditCommandPreparation,
  createTopologyEditJournalSession,
  redoTopologyEditCommandByReplay,
  reloadTopologyEditJournal,
  undoTopologyEditCommandByReplay,
} from './topology-edit-journal-service.js';

export const TOPOLOGY_EDIT_CERTIFIED_SESSION_SCHEMA = 'TopologyEditCertifiedSession.v1';

function baseAuthority(topology) {
  return {
    datasetId: topology.datasetId,
    datasetVersion: topology.datasetVersion,
    sourceHash: topology.sourceHash,
    baseCanonicalHash: topology.canonicalTopologyHash,
  };
}
function authorityMatches(left, right) {
  return left.datasetId === right.datasetId
    && left.datasetVersion === right.datasetVersion
    && left.sourceHash === right.sourceHash
    && left.baseCanonicalHash === right.baseCanonicalHash;
}
function commandIdentity(journal, commandType, payload) {
  const digest = semanticHash({
    baseCanonicalHash: journal.basis.baseCanonicalHash,
    activeLedgerHash: journal.activeLedgerHash,
    sequence: journal.history.length,
    commandType,
    payload,
  }).split(':').at(-1);
  return `command:${journal.history.length}:${digest}`;
}
function sessionSnapshot(session) {
  const material = {
    schema: TOPOLOGY_EDIT_CERTIFIED_SESSION_SCHEMA,
    baseAuthority: session.baseAuthority,
    journalHash: session.journal.journalHash,
    sessionVersion: session.journal.sessionVersion,
    activeLedgerHash: session.journal.activeLedgerHash,
    redoLedgerHash: session.journal.redoLedgerHash,
    activeCanonicalTopologyHash: session.replay.activeCanonicalTopologyHash,
    activeCommandIds: session.journal.activeCommandIds,
    redoCommandIds: session.journal.redoCommandIds,
    staleReason: session.staleReason,
  };
  return deepFreeze({ ...material, sessionHash: semanticHash(material) });
}

export class TopologyEditCertifiedSession {
  constructor(baseCanonicalTopology, options = {}) {
    assertCanonicalTopologyHash(baseCanonicalTopology);
    this.checkerPolicy = options.checkerPolicy ?? null;
    this.staleReason = null;
    this.reset(baseCanonicalTopology);
  }

  reset(baseCanonicalTopology) {
    assertCanonicalTopologyHash(baseCanonicalTopology);
    const created = createTopologyEditJournalSession(baseCanonicalTopology);
    this.baseCanonicalTopology = baseCanonicalTopology;
    this.baseAuthority = deepFreeze(baseAuthority(baseCanonicalTopology));
    this.journal = created.journal;
    this.replay = created.replay;
    this.staleReason = null;
    return this.snapshot();
  }

  snapshot() { return sessionSnapshot(this); }
  currentTopology() { return this.replay.activeCanonicalTopology; }
  canUndo() { return this.journal.activeCommandIds.length > 0 && !this.staleReason; }
  canRedo() { return this.journal.redoCommandIds.length > 0 && !this.staleReason; }

  reconcileBase(nextBaseCanonicalTopology) {
    assertCanonicalTopologyHash(nextBaseCanonicalTopology);
    const nextAuthority = baseAuthority(nextBaseCanonicalTopology);
    if (authorityMatches(this.baseAuthority, nextAuthority)) return 'UNCHANGED';
    if (this.journal.history.length === 0) { this.reset(nextBaseCanonicalTopology); return 'RESET'; }
    this.staleReason = 'Workspace source or base topology changed during the active edit session.';
    return 'STALE';
  }

  execute(commandType, payload, options = {}) {
    this.assertUsable();
    const request = createTopologyEditCommandRequest({
      commandId: commandIdentity(this.journal, commandType, payload),
      commandType,
      payload,
      expectedTargetRevisions: options.expectedTargetRevisions,
      basis: this.commandBasis(),
    });
    const transition = acceptTopologyEditCommand({
      journal: this.journal,
      baseCanonicalTopology: this.baseCanonicalTopology,
      request,
      checkerPolicy: this.checkerPolicy ?? undefined,
    });
    if (transition.disposition === 'ACCEPTED') this.applyTransition(transition);
    return transition;
  }

  autofixSuggestions(issues, policy = {}) {
    this.assertUsable();
    return TopologyEditAutofixController.suggestions(this.currentTopology(), issues, policy);
  }
  previewAutofix(suggestion) {
    this.assertUsable();
    return TopologyEditAutofixController.preview(this, suggestion);
  }
  acceptAutofix(preview) {
    this.assertUsable();
    return TopologyEditAutofixController.accept(this, preview);
  }

  cancelPreparation() {
    this.assertUsable();
    return cancelTopologyEditCommandPreparation({
      journal: this.journal,
      baseCanonicalTopology: this.baseCanonicalTopology,
      expectedSessionVersion: this.journal.sessionVersion,
    });
  }
  undo() {
    this.assertUsable();
    const transition = undoTopologyEditCommandByReplay({
      journal: this.journal,
      baseCanonicalTopology: this.baseCanonicalTopology,
      expectedSessionVersion: this.journal.sessionVersion,
    });
    this.applyTransition(transition);
    return transition;
  }
  redo() {
    this.assertUsable();
    const transition = redoTopologyEditCommandByReplay({
      journal: this.journal,
      baseCanonicalTopology: this.baseCanonicalTopology,
      expectedSessionVersion: this.journal.sessionVersion,
    });
    this.applyTransition(transition);
    return transition;
  }

  serializeJournal() { return serializeTopologyEditCertifiedJournal(this.journal); }
  reloadJournal(serializedJournal) {
    this.assertUsable();
    const loaded = reloadTopologyEditJournal({
      serializedJournal,
      baseCanonicalTopology: this.baseCanonicalTopology,
    });
    this.journal = loaded.journal;
    this.replay = loaded.replay;
    return loaded;
  }
  commandBasis() {
    return {
      sourceHash: this.baseAuthority.sourceHash,
      baseCanonicalHash: this.baseAuthority.baseCanonicalHash,
      priorDraftHash: this.replay.activeCanonicalTopologyHash,
      sessionVersion: this.journal.sessionVersion,
    };
  }
  applyTransition(transition) { this.journal = transition.journal; this.replay = transition.replay; }
  assertUsable() { if (this.staleReason) throw new Error(`TopologyEditCertifiedSession: ${this.staleReason}`); }
}
