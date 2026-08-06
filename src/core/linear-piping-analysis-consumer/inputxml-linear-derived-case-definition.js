import { isPlainRecord } from '../shared-piping-model/immutable.js';
import { inputXmlDerivedCaseFailure as fail } from './inputxml-linear-derived-case-error.js';
import { uniqueAscii } from './inputxml-linear-recovery-custody.js';

export const INPUTXML_LINEAR_DERIVED_CASE_PURPOSES = Object.freeze([
  'SUSTAINED', 'OPERATING', 'OCCASIONAL', 'EXPANSION_RANGE', 'CUSTOM',
]);

const PURPOSES = new Set(INPUTXML_LINEAR_DERIVED_CASE_PURPOSES);
const KINDS = new Set(['LINEAR', 'RANGE', 'ENVELOPE']);

export function canonicalInputXmlDerivedAlgebra(definition, available) {
  if (!isPlainRecord(definition)) fail(
    'InputXML derived-case definition must be a record.',
    'INPUTXML_DERIVED_DEFINITION_INVALID',
  );
  const kind = requireText(definition.kind, 'definition.kind').toUpperCase();
  if (!KINDS.has(kind)) fail(
    `InputXML derived-case kind ${kind} is unsupported.`,
    'INPUTXML_DERIVED_ALGEBRA_INVALID',
  );
  if (kind === 'ENVELOPE') return canonicalEnvelope(definition, available);
  const terms = canonicalTerms(definition.terms, available);
  if (kind === 'RANGE' && (terms.length !== 2
    || !terms.some((row) => row.factor > 0)
    || !terms.some((row) => row.factor < 0))) fail(
    'InputXML range requires one positive and one negative recovered-case term.',
    'INPUTXML_DERIVED_RANGE_INVALID',
  );
  return {
    kind,
    terms,
    equilibriumDisposition: kind === 'RANGE'
      ? 'SIGNED_DIFFERENCE_IS_EQUILIBRIUM_STATE_MAGNITUDE_IS_REPORTING_ONLY'
      : 'LINEAR_EQUILIBRIUM_STATE',
  };
}

export function referencedRecoveredCaseIds(algebra) {
  const ids = algebra.kind === 'ENVELOPE'
    ? algebra.candidates.flatMap((candidate) => (
      candidate.terms.map((term) => term.recoveredCaseId)
    ))
    : algebra.terms.map((term) => term.recoveredCaseId);
  return uniqueAscii(ids);
}

export function requireInputXmlDerivedPurpose(value) {
  const purpose = requireText(value, 'definition.purpose').toUpperCase();
  if (!PURPOSES.has(purpose)) fail(
    `InputXML derived-case purpose ${purpose} is unsupported.`,
    'INPUTXML_DERIVED_PURPOSE_INVALID',
  );
  return purpose;
}

export function requireInputXmlDerivedText(value, field) {
  return requireText(value, field);
}

function canonicalEnvelope(definition, available) {
  if (!Array.isArray(definition.candidates) || definition.candidates.length < 2) fail(
    'InputXML envelope requires at least two candidates.',
    'INPUTXML_DERIVED_ENVELOPE_INVALID',
  );
  const candidates = definition.candidates.map((candidate, index) => {
    if (!isPlainRecord(candidate)) fail(
      `Envelope candidate ${index} must be a record.`,
      'INPUTXML_DERIVED_ENVELOPE_INVALID',
    );
    return {
      candidateId: requireText(candidate.candidateId, `candidates[${index}].candidateId`),
      terms: canonicalTerms(candidate.terms, available),
    };
  }).sort((left, right) => compareAscii(left.candidateId, right.candidateId));
  if (new Set(candidates.map((row) => row.candidateId)).size !== candidates.length) fail(
    'InputXML envelope candidate identity is duplicated.',
    'INPUTXML_DERIVED_DUPLICATE',
  );
  return {
    kind: 'ENVELOPE',
    selection: 'COMPONENTWISE_MIN_MAX_WITH_GOVERNING_CANDIDATE',
    equilibriumDisposition: 'REPORTING_ONLY_NOT_A_SINGLE_EQUILIBRIUM_STATE',
    candidates,
  };
}

function canonicalTerms(terms, available) {
  if (!Array.isArray(terms) || terms.length === 0) fail(
    'InputXML derived-case terms are required.',
    'INPUTXML_DERIVED_ALGEBRA_INVALID',
  );
  const accepted = terms.map((term, index) => {
    if (!isPlainRecord(term)) fail(
      `Derived-case term ${index} must be a record.`,
      'INPUTXML_DERIVED_ALGEBRA_INVALID',
    );
    const recoveredCaseId = requireText(
      term.recoveredCaseId, `terms[${index}].recoveredCaseId`,
    );
    const factor = requireFinite(term.factor, `terms[${index}].factor`);
    if (factor === 0) fail(
      'InputXML derived-case factors must be non-zero.',
      'INPUTXML_DERIVED_FACTOR_INVALID',
    );
    if (!available.has(recoveredCaseId)) fail(
      `Recovered case ${recoveredCaseId} is unavailable.`,
      'INPUTXML_DERIVED_SOURCE_CASE_MISSING',
    );
    return { recoveredCaseId, factor: Object.is(factor, -0) ? 0 : factor };
  }).sort((left, right) => compareAscii(left.recoveredCaseId, right.recoveredCaseId));
  if (new Set(accepted.map((row) => row.recoveredCaseId)).size !== accepted.length) fail(
    'InputXML derived-case terms cannot repeat a recovered case.',
    'INPUTXML_DERIVED_DUPLICATE',
  );
  return accepted;
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.length === 0) fail(
    `${field} must be a non-empty string.`, 'INPUTXML_DERIVED_DEFINITION_INVALID',
  );
  return value;
}

function requireFinite(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(
    `${field} must be finite.`, 'INPUTXML_DERIVED_NONFINITE',
  );
  return value;
}

function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
