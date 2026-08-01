/** Append-only accepted-command journal contract for Wave 1. */
import {
  canonicalPrettyStringify,
  deepFreeze,
  semanticHash,
} from '../../core/shared-piping-model/index.js';
import {
  assertTopologyEditCommandRequest,
} from './topology-edit-command-contract.js';
import {
  assertTopologyEditAuthorityReceipt,
  proposedEditLedgerHash,
} from './topology-edit-authority-receipt.js';

export const TOPOLOGY_EDIT_CERTIFIED_JOURNAL_SCHEMA = 'TopologyEditCertifiedJournal.v1';
export const TOPOLOGY_EDIT_JOURNAL_ENTRY_SCHEMA = 'TopologyEditJournalEntry.v1';

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`TopologyEditCertifiedJournal: ${label} is required.`);
  return text;
}

function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new RangeError(`TopologyEditCertifiedJournal: ${label} must be a non-negative integer.`);
  }
  return number;
}

function journalBasis(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    sourceHash: requiredText(source.sourceHash, 'basis.sourceHash'),
    baseCanonicalHash: requiredText(source.baseCanonicalHash, 'basis.baseCanonicalHash'),
    datasetId: requiredText(source.datasetId, 'basis.datasetId'),
    datasetVersion: nonNegativeInteger(source.datasetVersion, 'basis.datasetVersion'),
  };
}

function hashes(entries, commandIds, label) {
  const byId = new Map(entries.map((entry) => [entry.commandId, entry]));
  const entryHashes = commandIds.map((commandId) => {
    const entry = byId.get(commandId);
    if (!entry) throw new Error(`TopologyEditCertifiedJournal: ${label} references missing command ${commandId}.`);
    return entry.entryHash;
  });
  return semanticHash({ schema: `TopologyEdit${label}Projection.v1`, commandIds, entryHashes });
}

function journalHashMaterial(value) {
  return {
    schema: TOPOLOGY_EDIT_CERTIFIED_JOURNAL_SCHEMA,
    basis: value.basis,
    history: value.history,
    activeCommandIds: value.activeCommandIds,
    redoCommandIds: value.redoCommandIds,
    sessionVersion: value.sessionVersion,
    historyHash: value.historyHash,
    activeLedgerHash: value.activeLedgerHash,
    redoLedgerHash: value.redoLedgerHash,
  };
}

function finalizeJournal(value) {
  const history = [...value.history];
  const activeCommandIds = [...value.activeCommandIds];
  const redoCommandIds = [...value.redoCommandIds];
  const material = {
    schema: TOPOLOGY_EDIT_CERTIFIED_JOURNAL_SCHEMA,
    basis: journalBasis(value.basis),
    history,
    activeCommandIds,
    redoCommandIds,
    sessionVersion: nonNegativeInteger(value.sessionVersion, 'sessionVersion'),
    historyHash: semanticHash({
      schema: 'TopologyEditJournalHistory.v1',
      entries: history.map((entry) => entry.entryHash),
    }),
    activeLedgerHash: hashes(history, activeCommandIds, 'ActiveLedger'),
    redoLedgerHash: hashes(history, redoCommandIds, 'RedoLedger'),
  };
  return deepFreeze({ ...material, journalHash: semanticHash(material) });
}

export function createTopologyEditCertifiedJournal({
  sourceHash,
  baseCanonicalHash,
  datasetId,
  datasetVersion = 0,
} = {}) {
  return finalizeJournal({
    basis: { sourceHash, baseCanonicalHash, datasetId, datasetVersion },
    history: [],
    activeCommandIds: [],
    redoCommandIds: [],
    sessionVersion: 0,
  });
}

export function createTopologyEditJournalEntry({
  sequence,
  request: requestInput,
  receipt: receiptInput,
  certificationHash,
  checkerPolicy,
} = {}) {
  const request = assertTopologyEditCommandRequest(requestInput);
  const receipt = assertTopologyEditAuthorityReceipt(receiptInput);
  if (receipt.disposition !== 'ACCEPTED') {
    throw new TypeError('TopologyEditCertifiedJournal: only accepted receipts can become journal entries.');
  }
  if (receipt.commandId !== request.commandId || receipt.commandType !== request.commandType) {
    throw new Error('TopologyEditCertifiedJournal: request and receipt command identities differ.');
  }
  if (receipt.requestHash !== request.requestHash) {
    throw new Error('TopologyEditCertifiedJournal: request and receipt hashes differ.');
  }
  const expectedLedgerHash = proposedEditLedgerHash({
    basis: request.basis,
    commandId: request.commandId,
    commandType: request.commandType,
    requestHash: request.requestHash,
    resolutionHash: receipt.resolutionHash,
    candidateDraftHash: receipt.result.candidateDraftHash,
    validationHash: receipt.result.validationHash,
  });
  if (receipt.result.editLedgerHash !== expectedLedgerHash) {
    throw new Error('TopologyEditCertifiedJournal: receipt edit-ledger projection is invalid.');
  }
  const material = {
    schema: TOPOLOGY_EDIT_JOURNAL_ENTRY_SCHEMA,
    sequence: nonNegativeInteger(sequence, 'entry.sequence'),
    commandId: request.commandId,
    commandType: request.commandType,
    request,
    receipt,
    certificationHash: requiredText(certificationHash, 'entry.certificationHash'),
    checkerPolicy: checkerPolicy ?? null,
  };
  return deepFreeze({ ...material, entryHash: semanticHash(material) });
}

export function assertTopologyEditJournalEntry(value) {
  if (value?.schema !== TOPOLOGY_EDIT_JOURNAL_ENTRY_SCHEMA) {
    throw new TypeError(`Topology edit journal entry must use ${TOPOLOGY_EDIT_JOURNAL_ENTRY_SCHEMA}.`);
  }
  const rebuilt = createTopologyEditJournalEntry(value);
  if (rebuilt.entryHash !== value.entryHash) {
    throw new Error('TopologyEditCertifiedJournal: entry hash mismatch.');
  }
  return rebuilt;
}

export function assertTopologyEditCertifiedJournal(value) {
  if (value?.schema !== TOPOLOGY_EDIT_CERTIFIED_JOURNAL_SCHEMA) {
    throw new TypeError(`Topology edit journal must use ${TOPOLOGY_EDIT_CERTIFIED_JOURNAL_SCHEMA}.`);
  }
  const history = (value.history ?? []).map(assertTopologyEditJournalEntry);
  history.forEach((entry, index) => {
    if (entry.sequence !== index) {
      throw new Error(`TopologyEditCertifiedJournal: entry ${entry.commandId} has sequence ${entry.sequence}; expected ${index}.`);
    }
  });
  const commandIds = history.map((entry) => entry.commandId);
  if (new Set(commandIds).size !== commandIds.length) {
    throw new Error('TopologyEditCertifiedJournal: duplicate command identity in history.');
  }
  const active = [...(value.activeCommandIds ?? [])];
  const redo = [...(value.redoCommandIds ?? [])];
  const expectedActive = commandIds.slice(0, active.length);
  const expectedRedo = commandIds.slice(active.length).reverse();
  if (semanticHash(active) !== semanticHash(expectedActive)) {
    throw new Error('TopologyEditCertifiedJournal: active commands must be the accepted history prefix.');
  }
  if (semanticHash(redo) !== semanticHash(expectedRedo)) {
    throw new Error('TopologyEditCertifiedJournal: redo commands must be the reversed inactive history suffix.');
  }
  const rebuilt = finalizeJournal({
    basis: value.basis,
    history,
    activeCommandIds: active,
    redoCommandIds: redo,
    sessionVersion: value.sessionVersion,
  });
  if (rebuilt.journalHash !== value.journalHash
    || rebuilt.historyHash !== value.historyHash
    || rebuilt.activeLedgerHash !== value.activeLedgerHash
    || rebuilt.redoLedgerHash !== value.redoLedgerHash) {
    throw new Error('TopologyEditCertifiedJournal: journal authority hash mismatch.');
  }
  return rebuilt;
}

export function appendTopologyEditJournalEntry(journalInput, entryInput) {
  const journal = assertTopologyEditCertifiedJournal(journalInput);
  const entry = assertTopologyEditJournalEntry(entryInput);
  if (journal.redoCommandIds.length) {
    throw new Error('TopologyEditCertifiedJournal: cannot append while redo commands are pending.');
  }
  if (entry.sequence !== journal.history.length) {
    throw new Error(`TopologyEditCertifiedJournal: append sequence ${entry.sequence} does not match history length ${journal.history.length}.`);
  }
  if (journal.history.some((row) => row.commandId === entry.commandId)) {
    throw new Error(`TopologyEditCertifiedJournal: duplicate command ${entry.commandId}.`);
  }
  return finalizeJournal({
    basis: journal.basis,
    history: [...journal.history, entry],
    activeCommandIds: [...journal.activeCommandIds, entry.commandId],
    redoCommandIds: [],
    sessionVersion: journal.sessionVersion + 1,
  });
}

export function undoTopologyEditJournalProjection(journalInput) {
  const journal = assertTopologyEditCertifiedJournal(journalInput);
  if (!journal.activeCommandIds.length) {
    throw new Error('TopologyEditCertifiedJournal: no active command is available to undo.');
  }
  const activeCommandIds = [...journal.activeCommandIds];
  const commandId = activeCommandIds.pop();
  return finalizeJournal({
    basis: journal.basis,
    history: journal.history,
    activeCommandIds,
    redoCommandIds: [...journal.redoCommandIds, commandId],
    sessionVersion: journal.sessionVersion + 1,
  });
}

export function redoTopologyEditJournalProjection(journalInput) {
  const journal = assertTopologyEditCertifiedJournal(journalInput);
  if (!journal.redoCommandIds.length) {
    throw new Error('TopologyEditCertifiedJournal: no command is available to redo.');
  }
  const redoCommandIds = [...journal.redoCommandIds];
  const commandId = redoCommandIds.pop();
  return finalizeJournal({
    basis: journal.basis,
    history: journal.history,
    activeCommandIds: [...journal.activeCommandIds, commandId],
    redoCommandIds,
    sessionVersion: journal.sessionVersion + 1,
  });
}

export function serializeTopologyEditCertifiedJournal(journalInput) {
  return canonicalPrettyStringify(assertTopologyEditCertifiedJournal(journalInput));
}

export function parseTopologyEditCertifiedJournal(serialized) {
  if (typeof serialized !== 'string' || !serialized.trim()) {
    throw new TypeError('TopologyEditCertifiedJournal: serialized journal text is required.');
  }
  return assertTopologyEditCertifiedJournal(JSON.parse(serialized));
}
