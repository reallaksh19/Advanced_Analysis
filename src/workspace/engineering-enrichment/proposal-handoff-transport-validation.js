import { canonicalStringify, semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { isPlainRecord } from '../../core/shared-piping-model/immutable.js';
import {
  assertEngineeringEnrichmentProposalHandoff,
} from './shadow-qualification-validation.js';
import {
  ENRICHMENT_PROPOSAL_HANDOFF_COMPARISON_SCHEMA,
  ENRICHMENT_PROPOSAL_HANDOFF_VERIFICATION_SCHEMA,
  assertEngineeringEnrichmentProposalHandoffComparison as assertBaseComparison,
  assertEngineeringEnrichmentProposalHandoffVerification as assertBaseVerification,
  compareEnrichmentProposalHandoffs as compareBaseHandoffs,
  parseAndVerifyEnrichmentProposalHandoff as parseBaseHandoff,
  serializeEnrichmentProposalHandoff as serializeBaseHandoff,
  verifyEngineeringEnrichmentProposalHandoff as verifyBaseHandoff,
} from './proposal-handoff-transport.js';

export {
  ENRICHMENT_PROPOSAL_HANDOFF_COMPARISON_SCHEMA,
  ENRICHMENT_PROPOSAL_HANDOFF_VERIFICATION_SCHEMA,
};

const PROPOSAL_CHANGE_KEYS = Object.freeze([
  'proposalId', 'kind', 'changedFields', 'beforeProposalHash',
  'afterProposalHash',
]);
const EVIDENCE_CHANGE_KEYS = Object.freeze(['field', 'before', 'after']);
const COMPARED_FIELDS = Object.freeze([
  'candidateDisposition', 'fieldId', 'limitations', 'proposalHash',
  'proposalStatus', 'proposedValue', 'resolutionDisposition',
  'resolvedTargetId', 'selector', 'source', 'unit',
]);
const EVIDENCE_FIELDS = Object.freeze([
  'bundleHash', 'graphHash', 'manifestHash', 'indexHash',
]);

export function serializeEnrichmentProposalHandoff(value) {
  return serializeBaseHandoff(assertEngineeringEnrichmentProposalHandoff(value));
}

export function verifyEngineeringEnrichmentProposalHandoff(
  value,
  options = { inputWasCanonical: true },
) {
  const handoff = assertEngineeringEnrichmentProposalHandoff(value);
  return assertEngineeringEnrichmentProposalHandoffVerification(
    verifyBaseHandoff(handoff, options),
  );
}

export function assertEngineeringEnrichmentProposalHandoffVerification(value) {
  assertBaseVerification(value);
  if (!/^[a-z0-9]+:[a-f0-9]+$/u.test(value.canonicalTextHash)) {
    fail('canonicalTextHash format is invalid.');
  }
  return value;
}

export function parseAndVerifyEnrichmentProposalHandoff(text) {
  const result = parseBaseHandoff(text);
  assertEngineeringEnrichmentProposalHandoff(result.handoff);
  assertEngineeringEnrichmentProposalHandoffVerification(result.verification);
  if (result.canonicalText !== serializeEnrichmentProposalHandoff(result.handoff)) {
    fail('parsed canonical text differs from verified handoff.');
  }
  return result;
}

export function compareEnrichmentProposalHandoffs(input) {
  exact(input, ['beforeHandoff', 'afterHandoff'], 'handoff comparison input');
  const beforeHandoff = assertEngineeringEnrichmentProposalHandoff(
    input.beforeHandoff,
  );
  const afterHandoff = assertEngineeringEnrichmentProposalHandoff(
    input.afterHandoff,
  );
  return assertEngineeringEnrichmentProposalHandoffComparison(
    compareBaseHandoffs({ beforeHandoff, afterHandoff }),
  );
}

export function assertEngineeringEnrichmentProposalHandoffComparison(value) {
  assertBaseComparison(value);
  const proposalIds = [];
  value.proposalChanges.forEach((row, index) => {
    exact(row, PROPOSAL_CHANGE_KEYS, `proposalChanges[${index}]`);
    const proposalId = text(row.proposalId, `proposalChanges[${index}].proposalId`);
    proposalIds.push(proposalId);
    if (!['ADDED', 'REMOVED', 'CHANGED'].includes(row.kind)) {
      fail(`proposalChanges[${index}].kind is invalid.`);
    }
    sortedUniqueText(
      row.changedFields,
      `proposalChanges[${index}].changedFields`,
      row.kind === 'CHANGED',
    ).forEach((field) => {
      if (!COMPARED_FIELDS.includes(field)) {
        fail(`proposalChanges[${index}] contains unknown changed field ${field}.`);
      }
    });
    nullableText(row.beforeProposalHash, `proposalChanges[${index}].beforeProposalHash`);
    nullableText(row.afterProposalHash, `proposalChanges[${index}].afterProposalHash`);
    if (
      (row.kind === 'ADDED'
        && (row.beforeProposalHash !== null || row.afterProposalHash === null
          || row.changedFields.length !== 0))
      || (row.kind === 'REMOVED'
        && (row.beforeProposalHash === null || row.afterProposalHash !== null
          || row.changedFields.length !== 0))
      || (row.kind === 'CHANGED'
        && (row.beforeProposalHash === null || row.afterProposalHash === null
          || row.changedFields.length === 0))
    ) {
      fail(`proposalChanges[${index}] kind and identities disagree.`);
    }
  });
  if (!sameList(proposalIds, [...new Set(proposalIds)].sort(ascii))) {
    fail('proposalChanges must be sorted and unique by proposalId.');
  }

  const evidenceFields = [];
  value.evidenceChanges.forEach((row, index) => {
    exact(row, EVIDENCE_CHANGE_KEYS, `evidenceChanges[${index}]`);
    const field = text(row.field, `evidenceChanges[${index}].field`);
    evidenceFields.push(field);
    if (!EVIDENCE_FIELDS.includes(field)) {
      fail(`evidenceChanges[${index}] contains unknown field ${field}.`);
    }
    text(row.before, `evidenceChanges[${index}].before`);
    text(row.after, `evidenceChanges[${index}].after`);
    if (row.before === row.after) {
      fail(`evidenceChanges[${index}] does not contain a difference.`);
    }
  });
  if (new Set(evidenceFields).size !== evidenceFields.length) {
    fail('evidenceChanges must not contain duplicate fields.');
  }
  const expectedOrder = EVIDENCE_FIELDS.filter((field) => evidenceFields.includes(field));
  if (!sameList(evidenceFields, expectedOrder)) {
    fail('evidenceChanges order differs from the declared evidence field order.');
  }

  const material = { ...value };
  delete material.comparisonHash;
  if (value.comparisonHash !== semanticHash(material)) {
    fail('comparisonHash is invalid.');
  }
  return value;
}

function exact(value, keys, label) {
  if (!isPlainRecord(value)
    || !sameList(Object.keys(value).sort(ascii), [...keys].sort(ascii))) {
    fail(`${label} keys are invalid.`);
  }
}
function sortedUniqueText(value, label, required) {
  if (!Array.isArray(value) || (required && value.length === 0)) {
    fail(`${label} must be ${required ? 'a non-empty ' : 'an '}array.`);
  }
  const rows = value.map((row, index) => text(row, `${label}[${index}]`));
  if (!sameList(rows, [...new Set(rows)].sort(ascii))) {
    fail(`${label} must be sorted and unique.`);
  }
  return rows;
}
function text(value, label) {
  const result = String(value ?? '').trim();
  if (!result) fail(`${label} is required.`);
  return result;
}
function nullableText(value, label) { if (value !== null) text(value, label); }
function sameList(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(message, Constructor = TypeError) {
  throw new Constructor(`EngineeringEnrichmentProposalHandoffTransportValidation: ${message}`);
}
