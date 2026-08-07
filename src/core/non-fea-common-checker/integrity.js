import {
  canonicalPrettyStringify,
  semanticHash,
  validateSharedPipingModel,
} from '../shared-piping-model/index.js';

export function assertCommonCheckerDependencyIntegrity(input) {
  if (!isRecord(input)) throw codedError('Common checker dependency input must be an object.', 'COMMON_CHECKER_DEPENDENCY_INPUT_INVALID');
  const sidecar = requireObject(input.enrichmentSidecar, 'enrichmentSidecar');
  const ledger = requireObject(input.resolutionLedger, 'resolutionLedger');
  const projection = requireObject(input.enrichedProjection, 'enrichedProjection');
  const usage = input.configuredDefaultUsageLedger || null;

  assertHash(sidecar, {
    schema: sidecar.schema,
    sourceSemanticHash: sidecar.sourceSemanticHash,
    records: sidecar.records,
  }, 'ENRICHMENT_SIDECAR_HASH_MISMATCH');
  assertHash(ledger, {
    schema: ledger.schema,
    sourceSemanticHash: ledger.sourceSemanticHash,
    sidecarSemanticHash: ledger.sidecarSemanticHash,
    status: ledger.status,
    rows: ledger.rows,
    blockers: ledger.blockers,
  }, 'RESOLUTION_LEDGER_HASH_MISMATCH');
  if (ledger.sidecarSemanticHash !== sidecar.semanticHash) {
    throw codedError('Resolution ledger is not bound to the supplied enrichment sidecar.', 'RESOLUTION_LEDGER_SIDECAR_MISMATCH');
  }
  if (ledger.sourceSemanticHash !== sidecar.sourceSemanticHash) {
    throw codedError('Resolution ledger and sidecar source bindings differ.', 'RESOLUTION_LEDGER_SOURCE_MISMATCH');
  }

  const modelAudit = validateSharedPipingModel(projection.enrichedModel);
  if (!modelAudit.ok) throw codedError(`Enriched projection model is invalid: ${modelAudit.errors.join(' ')}`, 'ENRICHED_PROJECTION_MODEL_INVALID');
  const projectionHash = semanticHash({
    schema: projection.schema,
    sourceSemanticHash: projection.sourceSemanticHash,
    resolutionLedgerSemanticHash: projection.resolutionLedgerSemanticHash,
    topologySemanticHash: projection.topologySemanticHash,
    enrichedModelSemanticHash: projection.enrichedModel.semanticHash,
  });
  if (projection.semanticHash !== projectionHash) {
    throw codedError('Enriched projection semantic hash is invalid.', 'ENRICHED_PROJECTION_HASH_MISMATCH');
  }
  if (projection.resolutionLedgerSemanticHash !== ledger.semanticHash) {
    throw codedError('Enriched projection is not bound to the supplied resolution ledger.', 'ENRICHED_PROJECTION_LEDGER_MISMATCH');
  }
  if (projection.sourceSemanticHash !== sidecar.sourceSemanticHash) {
    throw codedError('Enriched projection and sidecar source bindings differ.', 'ENRICHED_PROJECTION_SOURCE_MISMATCH');
  }

  if (usage) {
    assertHash(usage, {
      schema: usage.schema,
      projectDataRevision: usage.projectDataRevision,
      configuredDefaultPolicyHash: usage.configuredDefaultPolicyHash,
      rows: usage.rows,
    }, 'CONFIGURED_DEFAULT_USAGE_HASH_MISMATCH');
  }
  return Object.freeze({ valid: true });
}

export function assertCanonicalStagedJsonText(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw codedError('Staged JSON text is required.', 'COMMON_INPUT_EXPORT_TEXT_REQUIRED');
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw codedError(`Staged JSON is invalid: ${error instanceof Error ? error.message : String(error)}`, 'COMMON_INPUT_EXPORT_JSON_INVALID');
  }
  const canonical = `${canonicalPrettyStringify(value).trim()}\n`;
  if (text !== canonical) {
    throw codedError('Staged JSON is semantically parseable but not the deterministic canonical artifact.', 'COMMON_INPUT_EXPORT_NOT_CANONICAL');
  }
  return value;
}

export function assertCommonInputMethodPartition(commonInput) {
  const value = requireObject(commonInput, 'commonInput');
  const ready = uniqueStrings(value.sealedMethodIds, 'sealedMethodIds');
  const blocked = uniqueStrings(value.blockedMethodIds, 'blockedMethodIds');
  const overlap = ready.filter((methodId) => blocked.includes(methodId));
  if (overlap.length) throw codedError(`Methods cannot be both sealed and blocked: ${overlap.join(', ')}.`, 'COMMON_INPUT_METHOD_PARTITION_OVERLAP');
  const rows = Array.isArray(value.methodReadiness) ? value.methodReadiness : [];
  const rowIds = uniqueStrings(rows.map((row) => row?.methodId), 'methodReadiness.methodId');
  const union = [...new Set([...ready, ...blocked])].sort();
  if (JSON.stringify(rowIds) !== JSON.stringify(union)) {
    throw codedError('Method readiness rows do not exactly match sealed and blocked method partitions.', 'COMMON_INPUT_METHOD_PARTITION_MISMATCH');
  }
  rows.forEach((row) => {
    const expected = ready.includes(row.methodId) ? 'READY' : 'BLOCKED';
    if (row.state !== expected) throw codedError(`${row.methodId} readiness state does not match its common-input partition.`, 'COMMON_INPUT_METHOD_STATE_MISMATCH');
    if (!Array.isArray(row.requirements) || row.requirements.length === 0) {
      throw codedError(`${row.methodId} has a zero-step readiness receipt.`, 'COMMON_INPUT_ZERO_STEP_METHOD_RECEIPT');
    }
  });
  if (value.packageState === 'READY' && blocked.length) throw codedError('READY common input cannot contain blocked methods.', 'COMMON_INPUT_READY_HAS_BLOCKED_METHODS');
  if (value.packageState === 'PARTIALLY_READY' && (!ready.length || !blocked.length)) {
    throw codedError('PARTIALLY_READY common input requires both ready and blocked method partitions.', 'COMMON_INPUT_PARTIAL_PARTITION_INVALID');
  }
  return Object.freeze({ valid: true, ready, blocked });
}

function assertHash(value, payload, code) {
  if (value.semanticHash !== semanticHash(payload)) throw codedError(`${value.schema || 'Contract'} semantic hash is invalid.`, code);
}
function requireObject(value, label) {
  if (!isRecord(value)) throw codedError(`${label} must be an object.`, 'COMMON_CHECKER_DEPENDENCY_TYPE_INVALID');
  return value;
}
function uniqueStrings(values, label) {
  if (!Array.isArray(values)) throw codedError(`${label} must be an array.`, 'COMMON_INPUT_METHOD_PARTITION_INVALID');
  const rows = values.map((value) => {
    if (typeof value !== 'string' || !value) throw codedError(`${label} contains an invalid method ID.`, 'COMMON_INPUT_METHOD_PARTITION_INVALID');
    return value;
  });
  if (new Set(rows).size !== rows.length) throw codedError(`${label} contains duplicate method IDs.`, 'COMMON_INPUT_METHOD_PARTITION_DUPLICATE');
  return [...rows].sort();
}
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function codedError(message, code) { const error = new Error(message); error.code = code; return error; }
