/** Deterministic replay and integrity verification for the certified journal. */
import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { assertCanonicalTopologyHash } from './topology-edit-canonical-state.js';
import {
  assertTopologyEditCertifiedJournal,
} from './topology-edit-certified-journal.js';
import {
  assertTopologyEditCertificationResult,
  certifyTopologyEditCommand,
} from './topology-edit-certification-service.js';

export const TOPOLOGY_EDIT_REPLAY_RESULT_SCHEMA = 'TopologyEditReplayResult.v1';

function assertJournalBasis(journal, baseTopology) {
  assertCanonicalTopologyHash(baseTopology);
  if (journal.basis.sourceHash !== baseTopology.sourceHash) {
    throw new Error('TopologyEditReplayService: journal sourceHash differs from base topology.');
  }
  if (journal.basis.baseCanonicalHash !== baseTopology.canonicalTopologyHash) {
    throw new Error('TopologyEditReplayService: journal baseCanonicalHash differs from base topology.');
  }
  if (journal.basis.datasetId !== baseTopology.datasetId
    || journal.basis.datasetVersion !== baseTopology.datasetVersion) {
    throw new Error('TopologyEditReplayService: journal dataset basis differs from base topology.');
  }
}

function compareEntryCertification(entry, certification) {
  if (certification.disposition !== 'ACCEPTED') {
    throw new Error(`TopologyEditReplayService: command ${entry.commandId} no longer certifies.`);
  }
  if (certification.certificationHash !== entry.certificationHash) {
    throw new Error(`TopologyEditReplayService: command ${entry.commandId} certification hash drifted.`);
  }
  if (certification.receipt.receiptHash !== entry.receipt.receiptHash) {
    throw new Error(`TopologyEditReplayService: command ${entry.commandId} receipt hash drifted.`);
  }
  if (certification.candidate.candidateDraftHash !== entry.receipt.result.candidateDraftHash
    || certification.candidate.canonicalTopologyHash !== entry.receipt.result.canonicalTopologyHash) {
    throw new Error(`TopologyEditReplayService: command ${entry.commandId} candidate hash drifted.`);
  }
}

export function replayTopologyEditCertifiedJournal({ journal: journalInput, baseCanonicalTopology } = {}) {
  const journal = assertTopologyEditCertifiedJournal(journalInput);
  assertJournalBasis(journal, baseCanonicalTopology);

  const snapshots = [baseCanonicalTopology];
  const entryEvidence = [];
  let current = baseCanonicalTopology;
  for (const entry of journal.history) {
    if (entry.request.basis.sourceHash !== journal.basis.sourceHash
      || entry.request.basis.baseCanonicalHash !== journal.basis.baseCanonicalHash) {
      throw new Error(`TopologyEditReplayService: command ${entry.commandId} basis differs from journal authority.`);
    }
    if (entry.request.basis.priorDraftHash !== current.canonicalTopologyHash) {
      throw new Error(`TopologyEditReplayService: command ${entry.commandId} prior draft hash breaks the history chain.`);
    }
    const certification = assertTopologyEditCertificationResult(certifyTopologyEditCommand({
      request: entry.request,
      canonicalTopology: current,
      baseCanonicalTopology,
      authority: entry.request.basis,
      checkerPolicy: entry.checkerPolicy ?? undefined,
    }));
    compareEntryCertification(entry, certification);
    current = certification.candidate.canonicalTopology;
    snapshots.push(current);
    entryEvidence.push({
      commandId: entry.commandId,
      entryHash: entry.entryHash,
      receiptHash: entry.receipt.receiptHash,
      certificationHash: entry.certificationHash,
      canonicalTopologyHash: current.canonicalTopologyHash,
    });
  }

  const activeCount = journal.activeCommandIds.length;
  const activeCanonicalTopology = snapshots[activeCount];
  const historyTipCanonicalTopology = snapshots.at(-1);
  const material = {
    schema: TOPOLOGY_EDIT_REPLAY_RESULT_SCHEMA,
    journalHash: journal.journalHash,
    historyHash: journal.historyHash,
    activeLedgerHash: journal.activeLedgerHash,
    redoLedgerHash: journal.redoLedgerHash,
    sessionVersion: journal.sessionVersion,
    activeCommandIds: journal.activeCommandIds,
    redoCommandIds: journal.redoCommandIds,
    activeCanonicalTopologyHash: activeCanonicalTopology.canonicalTopologyHash,
    historyTipCanonicalTopologyHash: historyTipCanonicalTopology.canonicalTopologyHash,
    entryEvidence,
  };
  return deepFreeze({
    ...material,
    replayHash: semanticHash(material),
    activeCanonicalTopology,
    historyTipCanonicalTopology,
  });
}

export function assertTopologyEditReplayResult(value) {
  if (value?.schema !== TOPOLOGY_EDIT_REPLAY_RESULT_SCHEMA) {
    throw new TypeError(`Topology edit replay result must use ${TOPOLOGY_EDIT_REPLAY_RESULT_SCHEMA}.`);
  }
  const material = { ...value };
  delete material.replayHash;
  delete material.activeCanonicalTopology;
  delete material.historyTipCanonicalTopology;
  if (value.replayHash !== semanticHash(material)) {
    throw new Error('TopologyEditReplayService: replay authority hash mismatch.');
  }
  if (value.activeCanonicalTopologyHash !== value.activeCanonicalTopology?.canonicalTopologyHash
    || value.historyTipCanonicalTopologyHash !== value.historyTipCanonicalTopology?.canonicalTopologyHash) {
    throw new Error('TopologyEditReplayService: replay topology hash mismatch.');
  }
  return value;
}
