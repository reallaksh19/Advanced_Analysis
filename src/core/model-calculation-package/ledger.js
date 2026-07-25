import { deepFreeze, semanticHash, stringValue } from '../shared-piping-model/index.js';
import {
  MAX_LEDGER_ENTRIES, MODEL_CALCULATION_LEDGER_ENTRY_SCHEMA,
  MODEL_CALCULATION_LEDGER_SCHEMA,
} from './constants.js';
import { validateModelCalculationPackage } from './package.js';

export function createModelCalculationLedger(datasetId) {
  const id = stringValue(datasetId);
  if (!id) throw new TypeError('Model calculation ledger datasetId is required.');
  return finalize({
    schema: MODEL_CALCULATION_LEDGER_SCHEMA,
    datasetId: id,
    entries: [],
    activeEntryId: null,
    nextSequence: 1,
    archivedPackageSemanticHashes: [],
  });
}

export function archiveModelCalculationPackage(ledger, packageValue) {
  assertLedger(ledger);
  assertPackage(packageValue);
  if (ledger.datasetId !== packageValue.datasetId) throw new TypeError('Package dataset does not match the model calculation ledger.');
  const duplicate = ledger.entries.find((row) => row.packageSemanticHash === packageValue.semanticHash);
  if (duplicate) return selectModelCalculationLedgerEntry(ledger, duplicate.entryId);
  if (ledger.archivedPackageSemanticHashes.includes(packageValue.semanticHash)) return ledger;
  const entry = createEntry(ledger, packageValue);
  const entries = [...ledger.entries, entry].slice(-MAX_LEDGER_ENTRIES);
  return finalize({
    ...withoutHash(ledger), entries, activeEntryId: entry.entryId,
    nextSequence: ledger.nextSequence + 1,
    archivedPackageSemanticHashes: [...ledger.archivedPackageSemanticHashes, packageValue.semanticHash],
  });
}

export function selectModelCalculationLedgerEntry(ledger, entryId) {
  assertLedger(ledger);
  if (!ledger.entries.some((row) => row.entryId === entryId)) throw new TypeError('Unknown model calculation ledger entry.');
  return finalize({ ...withoutHash(ledger), activeEntryId: entryId });
}

export function clearModelCalculationLedger(ledger) {
  assertLedger(ledger);
  return createModelCalculationLedger(ledger.datasetId);
}

export function activeModelCalculationEntry(ledger) {
  assertLedger(ledger);
  return ledger.entries.find((row) => row.entryId === ledger.activeEntryId) || null;
}

export function validateModelCalculationLedgerEntry(value, datasetId = value?.datasetId) {
  const errors = [];
  validateEntry(value, datasetId, errors);
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function validateModelCalculationLedger(value) {
  const errors = [];
  if (value?.schema !== MODEL_CALCULATION_LEDGER_SCHEMA) errors.push('Invalid model calculation ledger schema.');
  if (!stringValue(value?.datasetId)) errors.push('Model calculation ledger datasetId is required.');
  if (!Array.isArray(value?.entries) || value.entries.length > MAX_LEDGER_ENTRIES) errors.push('Model calculation ledger entries are invalid.');
  const ids = (value?.entries || []).map((row) => row.entryId);
  if (new Set(ids).size !== ids.length) errors.push('Model calculation ledger entry IDs must be unique.');
  (value?.entries || []).forEach((row) => validateEntry(row, value.datasetId, errors));
  if (value?.activeEntryId && !ids.includes(value.activeEntryId)) errors.push('Model calculation ledger active entry is invalid.');
  validateSequenceState(value, errors);
  validateArchiveHashes(value, errors);
  if (value?.semanticHash !== semanticHash(ledgerHashPayload(value))) errors.push('Model calculation ledger semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function createEntry(ledger, packageValue) {
  const sequence = ledger.nextSequence;
  const base = {
    schema: MODEL_CALCULATION_LEDGER_ENTRY_SCHEMA,
    entryId: `model-calculation-entry:${safe(ledger.datasetId)}:${sequence}`,
    sequence,
    archiveKey: `${ledger.datasetId}|${packageValue.semanticHash}`,
    packageId: packageValue.packageId,
    packageSemanticHash: packageValue.semanticHash,
    datasetId: ledger.datasetId,
    package: packageValue,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(entryHashPayload(base)) });
}
function validateEntry(row, datasetId, errors) {
  if (row?.schema !== MODEL_CALCULATION_LEDGER_ENTRY_SCHEMA) errors.push('Invalid model calculation ledger entry schema.');
  if (row?.datasetId !== datasetId) errors.push(`Ledger entry ${row?.entryId || ''} dataset mismatch.`);
  if (row?.package?.semanticHash !== row?.packageSemanticHash) errors.push(`Ledger entry ${row?.entryId || ''} package hash mismatch.`);
  if (row?.package?.packageId !== row?.packageId) errors.push(`Ledger entry ${row?.entryId || ''} package ID mismatch.`);
  const validation = validateModelCalculationPackage(row?.package);
  if (!validation.ok) errors.push(`Ledger entry ${row?.entryId || ''} package is invalid.`);
  if (!Number.isInteger(row?.sequence) || row.sequence < 1) errors.push(`Ledger entry ${row?.entryId || ''} sequence is invalid.`);
  if (row?.entryId !== `model-calculation-entry:${safe(datasetId)}:${row?.sequence}`) errors.push(`Ledger entry ${row?.entryId || ''} ID is invalid.`);
  if (row?.archiveKey !== `${datasetId}|${row?.packageSemanticHash}`) errors.push(`Ledger entry ${row?.entryId || ''} archive key mismatch.`);
  if (row?.semanticHash !== semanticHash(entryHashPayload(row))) errors.push(`Ledger entry ${row?.entryId || ''} semantic hash mismatch.`);
}
function validateSequenceState(value, errors) {
  if (!Number.isInteger(value?.nextSequence) || value.nextSequence < 1) {
    errors.push('Model calculation ledger sequence is invalid.'); return;
  }
  const sequences = (value?.entries || []).map((row) => row.sequence);
  if (new Set(sequences).size !== sequences.length) errors.push('Model calculation ledger entry sequences must be unique.');
  if (sequences.some((value, index) => index > 0 && value <= sequences[index - 1])) errors.push('Model calculation ledger entries must be sequence ordered.');
  if (sequences.length && value.nextSequence <= Math.max(...sequences)) errors.push('Model calculation ledger next sequence must exceed retained entries.');
}
function assertLedger(ledger) { const validation = validateModelCalculationLedger(ledger); if (!validation.ok) throw new TypeError(`Invalid model calculation ledger: ${validation.errors.join(' ')}`); }
function assertPackage(value) { const validation = validateModelCalculationPackage(value); if (!validation.ok) throw new TypeError(`Invalid model calculation package: ${validation.errors.join(' ')}`); }
function validateArchiveHashes(value, errors) {
  const hashes = value?.archivedPackageSemanticHashes;
  if (!Array.isArray(hashes) || new Set(hashes).size !== hashes.length) errors.push('Model calculation ledger archive hashes are invalid.');
  const hashSet = new Set(hashes || []);
  (value?.entries || []).forEach((row) => { if (!hashSet.has(row.packageSemanticHash)) errors.push(`Ledger entry ${row.entryId} is missing from archive hashes.`); });
}
function entryHashPayload(value) {
  const { package: _package, semanticHash: _semanticHash, ...rest } = value || {}; return rest;
}
function ledgerHashPayload(value) {
  const { semanticHash: _semanticHash, entries = [], ...rest } = value || {};
  return { ...rest, entries: entries.map((row) => ({ entryId: row.entryId, semanticHash: row.semanticHash })) };
}
function finalize(base) { return deepFreeze({ ...base, semanticHash: semanticHash(ledgerHashPayload(base)) }); }
function withoutHash(value) { const { semanticHash: _semanticHash, ...rest } = value || {}; return rest; }
function safe(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dataset'; }
