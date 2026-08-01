/**
 * Wave 1 accepted-command authority.
 *
 * Every state transition validates the exact session version, derives current
 * topology through replay, and returns a new immutable journal. Rejected and
 * cancelled operations return the original journal unchanged.
 */
import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { assertTopologyEditCommandRequest } from './topology-edit-command-contract.js';
import {
  appendTopologyEditJournalEntry,
  assertTopologyEditCertifiedJournal,
  createTopologyEditCertifiedJournal,
  createTopologyEditJournalEntry,
  parseTopologyEditCertifiedJournal,
  redoTopologyEditJournalProjection,
  serializeTopologyEditCertifiedJournal,
  undoTopologyEditJournalProjection,
} from './topology-edit-certified-journal.js';
import {
  assertTopologyEditCertificationResult,
  certifyTopologyEditCommand,
} from './topology-edit-certification-service.js';
import {
  assertTopologyEditReplayResult,
  replayTopologyEditCertifiedJournal,
} from './topology-edit-replay-service.js';
import { assertCanonicalTopologyHash } from './topology-edit-canonical-state.js';

export const TOPOLOGY_EDIT_JOURNAL_TRANSITION_SCHEMA = 'TopologyEditJournalTransition.v1';

function assertExpectedSessionVersion(journal, expectedSessionVersion) {
  const expected = Number(expectedSessionVersion);
  if (!Number.isInteger(expected) || expected < 0) {
    throw new RangeError('TopologyEditJournalService: expectedSessionVersion must be a non-negative integer.');
  }
  if (journal.sessionVersion !== expected) {
    throw new Error(`TopologyEditJournalService: stale session version ${expected}; current is ${journal.sessionVersion}.`);
  }
}

function transition({ action, disposition, priorJournal, journal, replay, certification = null, reason = null }) {
  const material = {
    schema: TOPOLOGY_EDIT_JOURNAL_TRANSITION_SCHEMA,
    action,
    disposition,
    priorJournalHash: priorJournal.journalHash,
    journalHash: journal.journalHash,
    sessionVersion: journal.sessionVersion,
    activeCanonicalTopologyHash: replay.activeCanonicalTopologyHash,
    replayHash: replay.replayHash,
    certificationHash: certification?.certificationHash ?? null,
    reason,
  };
  return deepFreeze({
    ...material,
    transitionHash: semanticHash(material),
    journal,
    replay,
    certification,
  });
}

function assertRequestBasis(request, journal, currentTopology) {
  if (request.basis.sourceHash !== journal.basis.sourceHash) {
    throw new Error('TopologyEditJournalService: request sourceHash differs from journal authority.');
  }
  if (request.basis.baseCanonicalHash !== journal.basis.baseCanonicalHash) {
    throw new Error('TopologyEditJournalService: request baseCanonicalHash differs from journal authority.');
  }
  if (request.basis.priorDraftHash !== currentTopology.canonicalTopologyHash) {
    throw new Error('TopologyEditJournalService: request priorDraftHash differs from replayed current topology.');
  }
  if (request.basis.sessionVersion !== journal.sessionVersion) {
    throw new Error(`TopologyEditJournalService: stale request session version ${request.basis.sessionVersion}; current is ${journal.sessionVersion}.`);
  }
}

export function createTopologyEditJournalSession(baseCanonicalTopology) {
  assertCanonicalTopologyHash(baseCanonicalTopology);
  const journal = createTopologyEditCertifiedJournal({
    sourceHash: baseCanonicalTopology.sourceHash,
    baseCanonicalHash: baseCanonicalTopology.canonicalTopologyHash,
    datasetId: baseCanonicalTopology.datasetId,
    datasetVersion: baseCanonicalTopology.datasetVersion,
  });
  const replay = replayTopologyEditCertifiedJournal({ journal, baseCanonicalTopology });
  return transition({
    action: 'CREATE',
    disposition: 'ACCEPTED',
    priorJournal: journal,
    journal,
    replay,
  });
}

export function acceptTopologyEditCommand({
  journal: journalInput,
  baseCanonicalTopology,
  request: requestInput,
  checkerPolicy,
} = {}) {
  const journal = assertTopologyEditCertifiedJournal(journalInput);
  const request = assertTopologyEditCommandRequest(requestInput);
  const currentReplay = replayTopologyEditCertifiedJournal({ journal, baseCanonicalTopology });
  if (journal.redoCommandIds.length) {
    return transition({
      action: 'ACCEPT_COMMAND',
      disposition: 'REJECTED',
      priorJournal: journal,
      journal,
      replay: currentReplay,
      reason: 'REDO_PENDING',
    });
  }
  try {
    assertRequestBasis(request, journal, currentReplay.activeCanonicalTopology);
  } catch (error) {
    return transition({
      action: 'ACCEPT_COMMAND',
      disposition: 'REJECTED',
      priorJournal: journal,
      journal,
      replay: currentReplay,
      reason: error.message,
    });
  }

  const certification = assertTopologyEditCertificationResult(certifyTopologyEditCommand({
    request,
    canonicalTopology: currentReplay.activeCanonicalTopology,
    baseCanonicalTopology,
    authority: request.basis,
    checkerPolicy,
  }));
  if (certification.disposition !== 'ACCEPTED') {
    return transition({
      action: 'ACCEPT_COMMAND',
      disposition: 'REJECTED',
      priorJournal: journal,
      journal,
      replay: currentReplay,
      certification,
      reason: certification.receipt.reasons.map((row) => row.code).join(','),
    });
  }

  const entry = createTopologyEditJournalEntry({
    sequence: journal.history.length,
    request,
    receipt: certification.receipt,
    certificationHash: certification.certificationHash,
    checkerPolicy: certification.candidate.checkerPolicy,
  });
  const nextJournal = appendTopologyEditJournalEntry(journal, entry);
  const replay = assertTopologyEditReplayResult(replayTopologyEditCertifiedJournal({
    journal: nextJournal,
    baseCanonicalTopology,
  }));
  if (replay.activeCanonicalTopologyHash !== certification.candidate.canonicalTopologyHash) {
    throw new Error('TopologyEditJournalService: accepted journal replay differs from certified candidate.');
  }
  return transition({
    action: 'ACCEPT_COMMAND',
    disposition: 'ACCEPTED',
    priorJournal: journal,
    journal: nextJournal,
    replay,
    certification,
  });
}

export function cancelTopologyEditCommandPreparation({ journal: journalInput, baseCanonicalTopology, expectedSessionVersion } = {}) {
  const journal = assertTopologyEditCertifiedJournal(journalInput);
  assertExpectedSessionVersion(journal, expectedSessionVersion);
  const replay = replayTopologyEditCertifiedJournal({ journal, baseCanonicalTopology });
  return transition({
    action: 'CANCEL_PREPARATION',
    disposition: 'CANCELLED',
    priorJournal: journal,
    journal,
    replay,
    reason: 'NO_JOURNAL_CHANGE',
  });
}

export function undoTopologyEditCommandByReplay({ journal: journalInput, baseCanonicalTopology, expectedSessionVersion } = {}) {
  const journal = assertTopologyEditCertifiedJournal(journalInput);
  assertExpectedSessionVersion(journal, expectedSessionVersion);
  replayTopologyEditCertifiedJournal({ journal, baseCanonicalTopology });
  const nextJournal = undoTopologyEditJournalProjection(journal);
  const replay = replayTopologyEditCertifiedJournal({ journal: nextJournal, baseCanonicalTopology });
  return transition({
    action: 'UNDO',
    disposition: 'ACCEPTED',
    priorJournal: journal,
    journal: nextJournal,
    replay,
  });
}

export function redoTopologyEditCommandByReplay({ journal: journalInput, baseCanonicalTopology, expectedSessionVersion } = {}) {
  const journal = assertTopologyEditCertifiedJournal(journalInput);
  assertExpectedSessionVersion(journal, expectedSessionVersion);
  replayTopologyEditCertifiedJournal({ journal, baseCanonicalTopology });
  const nextJournal = redoTopologyEditJournalProjection(journal);
  const replay = replayTopologyEditCertifiedJournal({ journal: nextJournal, baseCanonicalTopology });
  return transition({
    action: 'REDO',
    disposition: 'ACCEPTED',
    priorJournal: journal,
    journal: nextJournal,
    replay,
  });
}

export function reloadTopologyEditJournal({ serializedJournal, baseCanonicalTopology } = {}) {
  const journal = parseTopologyEditCertifiedJournal(serializedJournal);
  const replay = replayTopologyEditCertifiedJournal({ journal, baseCanonicalTopology });
  const serialized = serializeTopologyEditCertifiedJournal(journal);
  return deepFreeze({
    schema: 'TopologyEditJournalReload.v1',
    journal,
    replay,
    serializedJournal: serialized,
    reloadHash: semanticHash({ journalHash: journal.journalHash, replayHash: replay.replayHash, serialized }),
  });
}

export function assertTopologyEditJournalTransition(value) {
  if (value?.schema !== TOPOLOGY_EDIT_JOURNAL_TRANSITION_SCHEMA) {
    throw new TypeError(`Topology edit journal transition must use ${TOPOLOGY_EDIT_JOURNAL_TRANSITION_SCHEMA}.`);
  }
  const material = { ...value };
  delete material.transitionHash;
  delete material.journal;
  delete material.replay;
  delete material.certification;
  if (value.transitionHash !== semanticHash(material)) {
    throw new Error('TopologyEditJournalService: transition hash mismatch.');
  }
  return value;
}
