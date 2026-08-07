/**
 * Functionality: Historical First Cut schema wrapper around the neutral W10.4
 * mass-ledger kernel. W10.4 remains the mass authority and historical package
 * structure/hash semantics remain unchanged.
 */

import { compileNonFeaMassLedgerBody } from '../non-fea-engineering-foundation/mass-ledger-kernel.js';
import { deepFreeze } from '../shared-piping-model/index.js';
import { FIRST_CUT_SCHEMAS } from './constants.js';
import { assertExactKeys, assertHash, validateHashedContract, withSemanticHash } from './validation.js';

const INPUT_KEYS = Object.freeze([
  'sourceSemanticHash', 'enrichmentResultSemanticHash', 'modelLoadFoundation',
]);
const CONTRACT_KEYS = Object.freeze([
  'schema', 'datasetId', 'sourceSemanticHash', 'enrichmentResultSemanticHash',
  'loadPrimitiveSemanticHash', 'loadCaseSetSemanticHash', 'rows', 'cases',
]);

export function compileFirstCutMassLedger(input) {
  assertExactKeys(input, INPUT_KEYS, 'Mass-ledger input');
  const body = compileNonFeaMassLedgerBody(input.modelLoadFoundation);
  return withSemanticHash({
    schema: FIRST_CUT_SCHEMAS.MASS_LEDGER,
    datasetId: body.datasetId,
    sourceSemanticHash: assertHash(input.sourceSemanticHash, 'Mass-ledger source hash'),
    enrichmentResultSemanticHash: assertHash(input.enrichmentResultSemanticHash, 'Enrichment result hash'),
    loadPrimitiveSemanticHash: body.loadPrimitiveSemanticHash,
    loadCaseSetSemanticHash: body.loadCaseSetSemanticHash,
    rows: body.rows,
    cases: body.cases,
  });
}

export function validateFirstCutMassLedger(value) {
  const result = validateHashedContract(value, FIRST_CUT_SCHEMAS.MASS_LEDGER, CONTRACT_KEYS);
  if (!result.ok) return result;
  const ids = (value.rows || []).map((row) => row.ledgerRowId);
  const errors = [];
  if (new Set(ids).size !== ids.length) errors.push('Mass-ledger row IDs must be unique.');
  if ((value.rows || []).some((row) => !Number.isFinite(row.massKg) || row.massKg < 0)) {
    errors.push('Mass-ledger rows require non-negative finite mass.');
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}
