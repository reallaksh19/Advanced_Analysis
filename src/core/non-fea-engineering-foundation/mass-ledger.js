import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/index.js';
import { compileNonFeaMassLedgerBody } from './mass-ledger-kernel.js';

export const NON_FEA_MASS_LEDGER_SCHEMA = 'non-fea-mass-ledger/v1';

/** Immutable common mass/weight/first-moment/COG ledger from W10.4 authority. */
export function compileNonFeaMassLedger({
  sourceSemanticHash,
  enrichmentProjectionSemanticHash,
  modelLoadFoundation,
} = {}) {
  const body = compileNonFeaMassLedgerBody(modelLoadFoundation);
  const base = {
    schema: NON_FEA_MASS_LEDGER_SCHEMA,
    datasetId: body.datasetId,
    sourceSemanticHash: requiredHash(sourceSemanticHash, 'sourceSemanticHash'),
    enrichmentProjectionSemanticHash: requiredHash(
      enrichmentProjectionSemanticHash,
      'enrichmentProjectionSemanticHash',
    ),
    loadPrimitiveSemanticHash: body.loadPrimitiveSemanticHash,
    loadCaseSetSemanticHash: body.loadCaseSetSemanticHash,
    rows: body.rows,
    cases: body.cases,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateNonFeaMassLedger(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return deepFreeze({ ok: false, errors: ['Mass ledger must be an object.'] });
  }
  if (value.schema !== NON_FEA_MASS_LEDGER_SCHEMA) errors.push(`Expected ${NON_FEA_MASS_LEDGER_SCHEMA}.`);
  for (const field of [
    'sourceSemanticHash',
    'enrichmentProjectionSemanticHash',
    'loadPrimitiveSemanticHash',
    'loadCaseSetSemanticHash',
  ]) {
    try { requiredHash(value[field], field); } catch (error) { errors.push(error.message); }
  }
  if (!Array.isArray(value.rows)) errors.push('Mass ledger rows must be an array.');
  if (!Array.isArray(value.cases)) errors.push('Mass ledger cases must be an array.');
  if (Array.isArray(value.rows)) {
    const ids = value.rows.map((row) => row?.ledgerRowId);
    if (ids.some((id) => typeof id !== 'string' || !id)) errors.push('Mass ledger row IDs are required.');
    if (new Set(ids).size !== ids.length) errors.push('Mass ledger row IDs must be unique.');
    if (value.rows.some((row) => !Number.isFinite(row?.massKg) || row.massKg < 0)) {
      errors.push('Mass ledger rows require non-negative finite mass.');
    }
  }
  if (typeof value.semanticHash !== 'string' || value.semanticHash !== semanticHash(stripHash(value))) {
    errors.push('Mass ledger semantic hash is invalid.');
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function requiredHash(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || !normalized.includes(':')) throw new TypeError(`${field} must be a namespaced hash.`);
  return normalized;
}
function stripHash(value) {
  const copy = structuredClone(value);
  delete copy.semanticHash;
  return copy;
}
