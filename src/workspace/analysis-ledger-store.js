import { freezeDeep } from './dataset-utils.js';

export const ANALYSIS_LEDGER_SCHEMA = 'analysis-ledger/v1';
export const ANALYSIS_LEDGER_ENTRY_SCHEMA = 'analysis-ledger-entry/v1';
export const MAX_ANALYSIS_LEDGER_ENTRIES = 100;

export class AnalysisLedgerStore {
  #snapshot = emptySnapshot(0);
  #sequence = 0;
  #archiveKeys = new Set();

  resetForDataset(datasetId) {
    const normalized = nonEmptyString(datasetId, 'datasetId');
    this.#sequence = 0;
    this.#archiveKeys = new Set();
    this.#snapshot = freezeDeep({
      schema: ANALYSIS_LEDGER_SCHEMA,
      datasetId: normalized,
      entries: [],
      activeEntryId: '',
      comparison: null,
      version: this.#snapshot.version + 1,
    });
    return this.#snapshot;
  }

  archive(session) {
    if (!isTerminalSession(session)) return null;
    const datasetId = nonEmptyString(session.datasetId, 'session.datasetId');
    if (!this.#snapshot.datasetId) this.resetForDataset(datasetId);
    if (this.#snapshot.datasetId !== datasetId) {
      throw new Error(`Analysis ledger dataset mismatch: ${datasetId}.`);
    }

    const archiveKey = `${session.sessionId}:${session.requestId}`;
    if (this.#archiveKeys.has(archiveKey)) {
      return this.#snapshot.entries.find((entry) => entry.archiveKey === archiveKey) || null;
    }

    const entry = freezeDeep({
      schema: ANALYSIS_LEDGER_ENTRY_SCHEMA,
      entryId: `analysis-ledger-entry-${++this.#sequence}`,
      sequence: this.#sequence,
      archiveKey,
      datasetId,
      session,
    });
    this.#archiveKeys.add(archiveKey);
    const entries = [...this.#snapshot.entries, entry].slice(-MAX_ANALYSIS_LEDGER_ENTRIES);
    this.#snapshot = freezeDeep({
      ...this.#snapshot,
      entries,
      activeEntryId: entry.entryId,
      comparison: retainedComparison(this.#snapshot.comparison, entries),
      version: this.#snapshot.version + 1,
    });
    return entry;
  }

  selectActive(entryId) {
    const entry = this.requireEntry(entryId);
    if (this.#snapshot.activeEntryId === entry.entryId) return entry;
    this.#snapshot = freezeDeep({
      ...this.#snapshot,
      activeEntryId: entry.entryId,
      version: this.#snapshot.version + 1,
    });
    return entry;
  }

  setComparisonSide(side, entryId) {
    if (side !== 'left' && side !== 'right') {
      throw new TypeError("Analysis comparison side must be 'left' or 'right'.");
    }
    const entry = this.requireEntry(entryId);
    const current = this.#snapshot.comparison || { leftEntryId: '', rightEntryId: '' };
    const next = { ...current, [`${side}EntryId`]: entry.entryId };
    validateComparison(next, this.#snapshot.entries);
    this.#snapshot = freezeDeep({
      ...this.#snapshot,
      comparison: next,
      version: this.#snapshot.version + 1,
    });
    return this.#snapshot.comparison;
  }

  clearComparison() {
    if (!this.#snapshot.comparison) return this.#snapshot;
    this.#snapshot = freezeDeep({
      ...this.#snapshot,
      comparison: null,
      version: this.#snapshot.version + 1,
    });
    return this.#snapshot;
  }

  clear() {
    this.#sequence = 0;
    this.#archiveKeys = new Set();
    this.#snapshot = emptySnapshot(this.#snapshot.version + 1);
    return this.#snapshot;
  }

  getSnapshot() {
    return this.#snapshot;
  }

  getEntry(entryId) {
    const normalized = String(entryId || '');
    return this.#snapshot.entries.find((entry) => entry.entryId === normalized) || null;
  }

  getActiveEntry() {
    return this.getEntry(this.#snapshot.activeEntryId);
  }

  requireEntry(entryId) {
    const entry = this.getEntry(entryId);
    if (!entry) throw new Error(`Analysis ledger entry is not available: ${entryId}.`);
    return entry;
  }
}

function emptySnapshot(version) {
  return freezeDeep({
    schema: ANALYSIS_LEDGER_SCHEMA,
    datasetId: '',
    entries: [],
    activeEntryId: '',
    comparison: null,
    version,
  });
}

function isTerminalSession(session) {
  return Boolean(
    session
      && session.schema === 'analysis-session/v1'
      && (session.status === 'completed' || session.status === 'failed')
      && typeof session.requestId === 'string'
      && session.requestId,
  );
}

function retainedComparison(comparison, entries) {
  if (!comparison) return null;
  const retainedIds = new Set(entries.map((entry) => entry.entryId));
  if (comparison.leftEntryId && !retainedIds.has(comparison.leftEntryId)) return null;
  if (comparison.rightEntryId && !retainedIds.has(comparison.rightEntryId)) return null;
  return comparison;
}

function validateComparison(comparison, entries) {
  const { leftEntryId, rightEntryId } = comparison;
  if (!leftEntryId || !rightEntryId) return;
  if (leftEntryId === rightEntryId) {
    throw new Error('Analysis comparison requires two distinct ledger entries.');
  }
  const left = entries.find((entry) => entry.entryId === leftEntryId);
  const right = entries.find((entry) => entry.entryId === rightEntryId);
  if (!left || !right) throw new Error('Analysis comparison entry is not available.');
  if (left.session.analysisType !== right.session.analysisType) {
    throw new Error('Analysis comparison requires entries from the same capability.');
  }
}

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`Analysis ledger ${field} must be a non-empty string.`);
  }
  return value.trim();
}

export const AnalysisLedger = new AnalysisLedgerStore();
