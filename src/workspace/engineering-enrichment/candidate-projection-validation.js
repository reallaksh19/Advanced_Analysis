import {
  canonicalStringify,
  canonicalizeJson,
  semanticHash,
} from '../../core/shared-piping-model/canonical-json.js';
import { isPlainRecord } from '../../core/shared-piping-model/immutable.js';
import {
  CANDIDATE_DISPOSITIONS,
  CANDIDATE_FALSE_AUTHORITY_FIELDS,
  CANDIDATE_PROJECTION_KEYS,
  CANDIDATE_ROW_KEYS,
  ENRICHMENT_CANDIDATE_PROJECTION_SCHEMA,
  SHADOW_NONSTRUCTURAL_FIELD_REGISTRY,
} from './candidate-projection-contract.js';

export function assertEngineeringEnrichmentCandidateProjection(value) {
  exact(value, CANDIDATE_PROJECTION_KEYS, 'candidate projection');
  if (value.schema !== ENRICHMENT_CANDIDATE_PROJECTION_SCHEMA) {
    fail(`schema must be ${ENRICHMENT_CANDIDATE_PROJECTION_SCHEMA}.`);
  }
  if (value.simulationMode !== 'ALL_EXACT_MATCHES_SHADOW_ONLY') {
    fail('simulationMode is invalid.');
  }
  CANDIDATE_FALSE_AUTHORITY_FIELDS.forEach((field) => {
    if (value[field] !== false) fail(`${field} must remain false.`, RangeError);
  });
  if (!Array.isArray(value.rows)) fail('rows must be an array.');
  const rows = value.rows.map(validateRow);
  const rowIds = rows.map((row) => row.proposalId);
  if (!same(rowIds, [...new Set(rowIds)].sort(ascii))) {
    fail('rows must be sorted and unique by proposalId.', RangeError);
  }
  const targets = rows
    .filter((row) => row.disposition === 'SHADOW_CANDIDATE_VALUE')
    .map((row) => `${row.targetKind}\u0000${row.targetId}\u0000${row.fieldId}`);
  if (new Set(targets).size !== targets.length) {
    fail('multiple projected values target the same canonical field.', RangeError);
  }
  if (canonicalStringify(value.summary) !== canonicalStringify(summarize(value.rows))) {
    fail('summary is invalid.', RangeError);
  }
  const material = { ...value };
  delete material.projectionHash;
  if (value.projectionHash !== semanticHash(material)) {
    fail('projectionHash is invalid.', RangeError);
  }
  return value;
}

function validateRow(row, index) {
  exact(row, CANDIDATE_ROW_KEYS, `rows[${index}]`);
  const proposalId = text(row.proposalId, `rows[${index}].proposalId`);
  text(row.proposalHash, `rows[${index}].proposalHash`);
  const registry = SHADOW_NONSTRUCTURAL_FIELD_REGISTRY[row.fieldId];
  if (!registry) fail(`rows[${index}] fieldId is not nonstructural.`, RangeError);
  if (row.unit !== registry.canonicalUnit) fail(`rows[${index}] unit is invalid.`);
  if (row.authorityLevel !== 'AUTHORIZED_MASTER_CANDIDATE') {
    fail(`rows[${index}].authorityLevel is invalid.`, RangeError);
  }
  if (row.proposedValue !== null
    && (!Number.isFinite(row.proposedValue) || row.proposedValue <= 0)) {
    fail(`rows[${index}].proposedValue must be null or a positive finite number.`);
  }
  if ((row.targetKind === null) !== (row.targetId === null)
    || (row.targetKind !== null && !['COMPONENT', 'SUPPORT'].includes(row.targetKind))) {
    fail(`rows[${index}] target identity is invalid.`, RangeError);
  }
  if (!CANDIDATE_DISPOSITIONS.includes(row.disposition)) {
    fail(`rows[${index}] disposition is invalid.`);
  }
  if (row.bindingCreated !== false) fail(`rows[${index}] created a binding.`, RangeError);
  const blockers = canonicalRecords(row.blockers);
  if (canonicalStringify(blockers) !== canonicalStringify(row.blockers)) {
    fail(`rows[${index}] blockers are not canonical.`, RangeError);
  }
  const projected = row.disposition === 'SHADOW_CANDIDATE_VALUE';
  if (projected) {
    if (row.targetKind !== registry.targetKind || !text(row.targetId, 'targetId')
      || blockers.length !== 0 || !Number.isFinite(row.proposedValue)
      || row.existingExplicitEvidence !== null) {
      fail(`rows[${index}] projected field evidence is invalid.`, RangeError);
    }
  } else if (blockers.length === 0) {
    fail(`rows[${index}] blocked disposition requires blockers.`, RangeError);
  }
  if (row.disposition === 'NOT_PROJECTED_UNRESOLVED'
    && (row.targetKind !== null || row.targetId !== null)) {
    fail(`rows[${index}] unresolved row must not select a target.`, RangeError);
  }
  if (row.disposition === 'BLOCKED_EXPLICIT_SOURCE_PRECEDENCE'
    && row.existingExplicitEvidence === null) {
    fail(`rows[${index}] explicit-source blocker requires evidence.`, RangeError);
  }
  return {
    proposalId,
    targetKind: row.targetKind,
    targetId: row.targetId,
    fieldId: row.fieldId,
    disposition: row.disposition,
  };
}

function summarize(rows) {
  const dispositions = {};
  rows.forEach((row) => {
    dispositions[row.disposition] = (dispositions[row.disposition] || 0) + 1;
  });
  const projectedCandidateCount = dispositions.SHADOW_CANDIDATE_VALUE || 0;
  const blockedCount = rows.length - projectedCandidateCount;
  return {
    proposalCount: rows.length,
    projectedCandidateCount,
    blockedCount,
    dispositions: canonicalizeJson(dispositions),
    status: blockedCount === 0 ? 'READY_FOR_STRUCTURAL_IMPACT' : 'BLOCKED',
  };
}
function canonicalRecords(value) {
  if (!Array.isArray(value)) fail('blockers must be an array.');
  const rows = value.map((row) => {
    if (!isPlainRecord(row)) fail('blocker must be an object.');
    text(row.code, 'blocker.code');
    return canonicalizeJson(row);
  });
  rows.sort((left, right) => ascii(semanticHash(left), semanticHash(right))
    || ascii(canonicalStringify(left), canonicalStringify(right)));
  return rows;
}
function exact(value, keys, label) {
  if (!isPlainRecord(value)
    || !same(Object.keys(value).sort(ascii), [...keys].sort(ascii))) {
    fail(`${label} keys are invalid.`);
  }
}
function text(value, label) {
  const result = String(value ?? '').trim();
  if (!result) fail(`${label} is required.`);
  return result;
}
function same(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(message, Constructor = TypeError) {
  throw new Constructor(`EngineeringEnrichmentCandidateProjectionValidation: ${message}`);
}
