import {
  canonicalStringify,
  deepFreeze,
  semanticHash,
} from '../shared-piping-model/index.js';
import {
  CONTRACT_KEYS,
  WORKSPACE_CONSUMER_CONTEXT_SCHEMA,
} from './constants.js';
import {
  contractDatasetId,
  contractLinkError,
  validateConsumerContract,
} from './validators.js';

const DIAGNOSTIC_CODES = new Set(['INVALID_CONTRACT', 'DATASET_MISMATCH', 'STALE_CONTRACT_EVIDENCE']);

export function createWorkspaceConsumerContext(input = {}) {
  const metadata = contextMetadata(input);
  const state = collectContracts(metadata.datasetId, input.contracts || {});
  return buildContext(metadata, state.contracts, state.diagnostics);
}

export function validateWorkspaceConsumerContext(value) {
  const errors = [];
  const metadata = validateMetadata(value, errors);
  const contracts = validateSlots(value, errors);
  const diagnostics = validateDiagnostics(value?.diagnostics, contracts, errors);
  validateRetainedContracts(metadata?.datasetId ?? null, contracts, errors);
  if (metadata) {
    const expected = buildContext(metadata, contracts, diagnostics);
    compareDerivedEvidence(value, expected, errors);
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function buildContext(metadata, contracts, sourceDiagnostics) {
  const diagnostics = deepFreeze([...sourceDiagnostics].sort(diagnosticOrder));
  const references = deepFreeze(CONTRACT_KEYS.map((key) => contractReference(key, contracts, diagnostics)));
  const availabilitySummary = availability(references, diagnostics);
  const identity = contextIdentity(metadata.datasetId, references, availabilitySummary, diagnostics);
  const contextId = `workspace-consumer-context:${semanticHash(identity).split(':')[1]}`;
  const semanticHashValue = semanticHash({ ...identity, contextId });
  return deepFreeze({
    schema: WORKSPACE_CONSUMER_CONTEXT_SCHEMA,
    ...metadata,
    contractReferences: references,
    availabilitySummary,
    diagnostics,
    contextId,
    contracts,
    semanticHash: semanticHashValue,
  });
}

function validateMetadata(value, errors) {
  if (value?.schema !== WORKSPACE_CONSUMER_CONTEXT_SCHEMA) errors.push('Invalid workspace consumer context schema.');
  if (!hasOwn(value, 'datasetId')) errors.push('Workspace consumer datasetId field is required.');
  if (!hasOwn(value, 'workspaceVersion')) errors.push('Workspace consumer workspaceVersion field is required.');
  if (!hasOwn(value, 'selectedEntityId')) errors.push('Workspace consumer selectedEntityId field is required.');
  if (typeof value?.contextId !== 'string' || !value.contextId.trim()) errors.push('Workspace consumer contextId is required.');
  if (!Array.isArray(value?.contractReferences) || value.contractReferences.length !== CONTRACT_KEYS.length) errors.push('Workspace consumer contract references are incomplete.');
  if (!value?.contracts || typeof value.contracts !== 'object' || Array.isArray(value.contracts)) errors.push('Workspace consumer contracts are required.');
  try {
    return contextMetadata(value || {});
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return null;
  }
}

function validateSlots(value, errors) {
  const source = value?.contracts || {};
  const actualKeys = Object.keys(source).sort();
  const expectedKeys = [...CONTRACT_KEYS].sort();
  if (canonicalStringify(actualKeys) !== canonicalStringify(expectedKeys)) errors.push('Workspace consumer contract slots are not exact.');
  const contracts = {};
  CONTRACT_KEYS.forEach((key) => { contracts[key] = source[key] ?? null; });
  return Object.freeze(contracts);
}

function validateDiagnostics(source, contracts, errors) {
  if (!Array.isArray(source)) {
    errors.push('Workspace consumer diagnostics must be an array.');
    return [];
  }
  const diagnostics = [...source];
  if (canonicalStringify(diagnostics) !== canonicalStringify([...diagnostics].sort(diagnosticOrder))) errors.push('Workspace consumer diagnostics are not canonically ordered.');
  const keys = new Set();
  diagnostics.forEach((row) => {
    if (!DIAGNOSTIC_CODES.has(row?.code) || row?.severity !== 'ERROR' || !CONTRACT_KEYS.includes(row?.contractKey) || typeof row?.message !== 'string' || !row.message.trim()) errors.push('Workspace consumer diagnostic is invalid.');
    if (keys.has(row?.contractKey)) errors.push(`Workspace consumer diagnostic ${row?.contractKey} is duplicated.`);
    if (contracts[row?.contractKey]) errors.push(`Workspace consumer diagnostic ${row?.contractKey} conflicts with an available contract.`);
    keys.add(row?.contractKey);
  });
  return diagnostics;
}

function validateRetainedContracts(datasetId, contracts, errors) {
  const accepted = {};
  CONTRACT_KEYS.forEach((key) => {
    const contract = contracts[key];
    if (!contract) { accepted[key] = null; return; }
    const validation = validateConsumerContract(key, contract, accepted);
    if (!validation.ok) errors.push(`Workspace consumer retained contract ${key} is invalid: ${validation.errors.join(' ')}`);
    const contractDataset = contractDatasetId(key, contract);
    if (datasetId && contractDataset && contractDataset !== datasetId) errors.push(`Workspace consumer retained contract ${key} has the wrong dataset.`);
    const linkError = contractLinkError(key, contract, accepted);
    if (linkError) errors.push(`Workspace consumer retained contract ${key} is stale: ${linkError}`);
    accepted[key] = contract;
  });
}

function compareDerivedEvidence(value, expected, errors) {
  ['datasetId', 'workspaceVersion', 'selectedEntityId'].forEach((field) => {
    if (value?.[field] !== expected[field]) errors.push(`Workspace consumer ${field} is not canonical.`);
  });
  ['contractReferences', 'availabilitySummary', 'diagnostics'].forEach((field) => {
    if (canonicalStringify(value?.[field]) !== canonicalStringify(expected[field])) errors.push(`Workspace consumer ${field} mismatch.`);
  });
  if (value?.contextId !== expected.contextId) errors.push('Workspace consumer contextId mismatch.');
  if (value?.semanticHash !== expected.semanticHash) errors.push('Workspace consumer semantic hash mismatch.');
}

function collectContracts(datasetId, sourceContracts) {
  const contracts = {}, diagnostics = [];
  CONTRACT_KEYS.forEach((key) => {
    const result = acceptContract(key, sourceContracts[key] ?? null, datasetId, contracts);
    contracts[key] = result.value;
    if (result.diagnostic) diagnostics.push(result.diagnostic);
  });
  return { contracts: Object.freeze(contracts), diagnostics };
}

function acceptContract(key, value, datasetId, accepted) {
  if (value === null) return { value: null, diagnostic: null };
  const validation = validateConsumerContract(key, value, accepted);
  if (!validation.ok) return rejected(key, 'INVALID_CONTRACT', validation.errors.join(' '));
  const contractDataset = contractDatasetId(key, value);
  if (datasetId && contractDataset && contractDataset !== datasetId) return rejected(key, 'DATASET_MISMATCH', `Expected dataset ${datasetId}; received ${contractDataset}.`);
  const linkError = contractLinkError(key, value, accepted);
  return linkError ? rejected(key, 'STALE_CONTRACT_EVIDENCE', linkError) : { value, diagnostic: null };
}

function contractReference(key, contracts, diagnostics) {
  const value = contracts[key];
  const diagnostic = diagnostics.find((row) => row.contractKey === key);
  const reference = {
    contractKey: key,
    schema: value?.schema || null,
    semanticHash: value?.semanticHash || null,
    datasetId: contractDatasetId(key, value),
    availability: value ? 'AVAILABLE' : diagnostic ? 'INVALID' : 'UNAVAILABLE',
  };
  const summary = qualificationSummary(value);
  return deepFreeze(summary ? { ...reference, qualificationSummary: summary } : reference);
}

function contextMetadata(input) {
  return {
    datasetId: optionalCanonicalString(input.datasetId, 'datasetId'),
    workspaceVersion: canonicalWorkspaceVersion(input.workspaceVersion),
    selectedEntityId: optionalCanonicalString(input.selectedEntityId, 'selectedEntityId'),
  };
}
function optionalCanonicalString(value, label) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`Workspace consumer ${label} must be null or a non-empty string.`);
  if (value !== value.trim()) throw new TypeError(`Workspace consumer ${label} must be canonically trimmed.`);
  return value;
}
function canonicalWorkspaceVersion(value) {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0) throw new TypeError('Workspace consumer workspaceVersion must be a non-negative integer.');
  return value;
}
function contextIdentity(datasetId, references, summary, diagnostics) {
  return { schema: WORKSPACE_CONSUMER_CONTEXT_SCHEMA, datasetId, contractReferences: references, availabilitySummary: summary, diagnostics };
}
function qualificationSummary(value) {
  if (Array.isArray(value?.qualificationSummary)) return value.qualificationSummary;
  if (Array.isArray(value?.sections?.qualification)) return value.sections.qualification;
  return null;
}
function availability(references, diagnostics) {
  return deepFreeze({
    contractCount: references.length,
    availableContractKeys: references.filter((row) => row.availability === 'AVAILABLE').map((row) => row.contractKey),
    invalidContractKeys: references.filter((row) => row.availability === 'INVALID').map((row) => row.contractKey),
    unavailableContractKeys: references.filter((row) => row.availability === 'UNAVAILABLE').map((row) => row.contractKey),
    diagnosticCount: diagnostics.length,
  });
}
function rejected(contractKey, code, message) { return { value: null, diagnostic: deepFreeze({ code, severity: 'ERROR', contractKey, message }) }; }
function diagnosticOrder(left, right) { return `${left.contractKey}|${left.code}|${left.message}`.localeCompare(`${right.contractKey}|${right.code}|${right.message}`); }
function hasOwn(value, key) { return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key); }
