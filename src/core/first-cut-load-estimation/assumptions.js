/**
 * Functionality: Seals explicit accepted assumptions into an immutable sidecar.
 * Inputs include source/profile hashes and auditable evidence; source entities
 * are never mutated.
 */

import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { AUTHORITY_LEVELS, FIRST_CUT_SCHEMAS } from './constants.js';
import {
  assertEnum, assertExactKeys, assertFinite, assertHash, assertString,
  validateHashedContract, withSemanticHash,
} from './validation.js';

const INPUT_KEYS = Object.freeze(['sourceSemanticHash', 'profileSemanticHash', 'assumptions']);
const CONTRACT_KEYS = Object.freeze([
  'schema', 'sourceSemanticHash', 'profileSemanticHash', 'assumptions', 'evidenceHash',
]);
const ROW_KEYS = Object.freeze([
  'assumptionId', 'entityId', 'fieldId', 'value', 'unit', 'source', 'reason',
  'approver', 'authorityLevel', 'limitations',
]);

export function sealFirstCutAssumptionSet(input) {
  assertExactKeys(input, INPUT_KEYS, 'Assumption-set input');
  if (!Array.isArray(input.assumptions)) throw new TypeError('Assumptions must be an array.');
  const assumptions = input.assumptions.map(validateRow).sort((left, right) => left.assumptionId.localeCompare(right.assumptionId));
  if (new Set(assumptions.map((row) => row.assumptionId)).size !== assumptions.length) {
    throw new TypeError('Assumption IDs must be unique.');
  }
  const evidenceHash = semanticHash(assumptions.map((row) => ({
    assumptionId: row.assumptionId, source: row.source, reason: row.reason, approver: row.approver,
  })));
  return withSemanticHash({
    schema: FIRST_CUT_SCHEMAS.ASSUMPTIONS,
    sourceSemanticHash: assertHash(input.sourceSemanticHash, 'Assumption source hash'),
    profileSemanticHash: assertHash(input.profileSemanticHash, 'Assumption profile hash'),
    assumptions,
    evidenceHash,
  });
}

export function validateFirstCutAssumptionSet(value) {
  const result = validateHashedContract(value, FIRST_CUT_SCHEMAS.ASSUMPTIONS, CONTRACT_KEYS);
  if (!result.ok) return result;
  try {
    value.assumptions.forEach(validateRow);
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({ ok: false, errors: [error.message] });
  }
}

function validateRow(value) {
  assertExactKeys(value, ROW_KEYS, 'Assumption');
  if (!Array.isArray(value.limitations) || value.limitations.some((item) => typeof item !== 'string')) {
    throw new TypeError('Assumption limitations must be a string array.');
  }
  const assumptionValue = typeof value.value === 'number'
    ? assertFinite(value.value, 'Assumption value', () => true)
    : assertString(value.value, 'Assumption value');
  return deepFreeze({
    assumptionId: assertString(value.assumptionId, 'Assumption ID'),
    entityId: assertString(value.entityId, 'Assumption entity ID'),
    fieldId: assertString(value.fieldId, 'Assumption field ID'),
    value: assumptionValue,
    unit: assertString(value.unit, 'Assumption unit'),
    source: assertString(value.source, 'Assumption source'),
    reason: assertString(value.reason, 'Assumption reason'),
    approver: assertString(value.approver, 'Assumption approver'),
    authorityLevel: assertEnum(value.authorityLevel, AUTHORITY_LEVELS, 'Assumption authority'),
    limitations: [...new Set(value.limitations)].sort(),
  });
}
