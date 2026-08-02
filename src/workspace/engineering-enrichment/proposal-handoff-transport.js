import {
  canonicalStringify,
  canonicalizeJson,
  semanticHash,
} from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../core/shared-piping-model/immutable.js';
import { assertEngineeringEnrichmentProposalHandoff } from './shadow-qualification.js';

export const ENRICHMENT_PROPOSAL_HANDOFF_VERIFICATION_SCHEMA =
  'EngineeringEnrichmentProposalHandoffVerification.v1';
export const ENRICHMENT_PROPOSAL_HANDOFF_COMPARISON_SCHEMA =
  'EngineeringEnrichmentProposalHandoffComparison.v1';

const FALSE_AUTHORITY = Object.freeze([
  'persistenceCreated', 'reviewDecisionCreated', 'approvalGranted', 'bindingCreated',
  'current', 'sealEligible', 'calculationEligible', 'resultAcceptanceEligible',
]);
const COMPARED_FIELDS = Object.freeze([
  'proposalHash', 'fieldId', 'selector', 'proposedValue', 'unit', 'proposalStatus',
  'resolutionDisposition', 'resolvedTargetId', 'candidateDisposition', 'source',
  'limitations',
]);

export function serializeEnrichmentProposalHandoff(value) {
  return canonicalStringify(assertEngineeringEnrichmentProposalHandoff(value));
}

export function verifyEngineeringEnrichmentProposalHandoff(
  value,
  options = { inputWasCanonical: true },
) {
  exact(options, ['inputWasCanonical'], 'handoff verification options');
  const handoff = assertEngineeringEnrichmentProposalHandoff(value);
  const canonicalText = canonicalStringify(handoff);
  const material = {
    schema: ENRICHMENT_PROPOSAL_HANDOFF_VERIFICATION_SCHEMA,
    handoffHash: handoff.handoffHash,
    canonicalTextHash: semanticHash(canonicalText),
    canonicalTextLength: canonicalText.length,
    proposalCount: handoff.proposals.length,
    inputWasCanonical: boolean(options.inputWasCanonical, 'inputWasCanonical'),
    verified: true,
    verificationScope: 'IN_MEMORY_CONTRACT_AND_CANONICAL_INTEGRITY_ONLY',
    originVerified: false,
    storageVerified: false,
    ...falseAuthority(),
  };
  return deepFreeze({ ...material, verificationHash: semanticHash(material) });
}

export function assertEngineeringEnrichmentProposalHandoffVerification(value) {
  exact(value, [
    'schema', 'handoffHash', 'canonicalTextHash', 'canonicalTextLength',
    'proposalCount', 'inputWasCanonical', 'verified', 'verificationScope',
    'originVerified', 'storageVerified', ...FALSE_AUTHORITY, 'verificationHash',
  ], 'handoff verification');
  if (
    value.schema !== ENRICHMENT_PROPOSAL_HANDOFF_VERIFICATION_SCHEMA
    || value.verified !== true
    || value.verificationScope !== 'IN_MEMORY_CONTRACT_AND_CANONICAL_INTEGRITY_ONLY'
    || value.originVerified !== false
    || value.storageVerified !== false
  ) fail('handoff verification scope is invalid', RangeError);
  text(value.handoffHash, 'handoffHash'); text(value.canonicalTextHash, 'canonicalTextHash');
  nonnegativeInteger(value.canonicalTextLength, 'canonicalTextLength');
  nonnegativeInteger(value.proposalCount, 'proposalCount');
  boolean(value.inputWasCanonical, 'inputWasCanonical'); assertFalse(value);
  verifyHash(value, 'verificationHash'); return value;
}

export function parseAndVerifyEnrichmentProposalHandoff(sourceText) {
  if (typeof sourceText !== 'string' || !sourceText.trim()) fail('serialized handoff is required');
  let parsed;
  try { parsed = JSON.parse(sourceText); }
  catch (error) { fail(`serialized handoff is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, SyntaxError); }
  const handoff = assertEngineeringEnrichmentProposalHandoff(parsed);
  const canonicalText = serializeEnrichmentProposalHandoff(handoff);
  return deepFreeze({
    handoff: deepFreeze(canonicalizeJson(handoff)),
    canonicalText,
    verification: verifyEngineeringEnrichmentProposalHandoff(handoff, {
      inputWasCanonical: sourceText === canonicalText,
    }),
  });
}

export function compareEnrichmentProposalHandoffs(input) {
  exact(input, ['beforeHandoff', 'afterHandoff'], 'handoff comparison input');
  const before = assertEngineeringEnrichmentProposalHandoff(input.beforeHandoff);
  const after = assertEngineeringEnrichmentProposalHandoff(input.afterHandoff);
  const beforeMap = new Map(before.proposals.map((row) => [row.proposalId, row]));
  const afterMap = new Map(after.proposals.map((row) => [row.proposalId, row]));
  const proposalChanges = [];
  [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort(ascii).forEach((proposalId) => {
    const left = beforeMap.get(proposalId), right = afterMap.get(proposalId);
    if (!left) proposalChanges.push(change(proposalId, 'ADDED', null, right));
    else if (!right) proposalChanges.push(change(proposalId, 'REMOVED', left, null));
    else {
      const fields = COMPARED_FIELDS.filter(
        (field) => canonicalStringify(left[field]) !== canonicalStringify(right[field]),
      );
      if (fields.length) proposalChanges.push(change(proposalId, 'CHANGED', left, right, fields));
    }
  });
  const evidenceChanges = ['bundleHash', 'graphHash', 'manifestHash', 'indexHash']
    .filter((field) => before[field] !== after[field])
    .map((field) => deepFreeze({ field, before: before[field], after: after[field] }));
  const differenceCount = proposalChanges.length + evidenceChanges.length;
  const status = differenceCount
    ? 'RECORDED_SHADOW_HANDOFF_DIFFERENCES'
    : 'IDENTICAL_SHADOW_HANDOFFS';
  const material = {
    schema: ENRICHMENT_PROPOSAL_HANDOFF_COMPARISON_SCHEMA,
    beforeHandoffHash: before.handoffHash,
    afterHandoffHash: after.handoffHash,
    direction: 'BEFORE_TO_AFTER',
    proposalChanges: deepFreeze(proposalChanges),
    evidenceChanges: deepFreeze(evidenceChanges),
    summary: deepFreeze({
      proposalChangeCount: proposalChanges.length,
      evidenceChangeCount: evidenceChanges.length,
      differenceCount,
      status,
    }),
    status,
    comparisonJudgement: 'NOT_AUTHORIZED',
    adoptionDecision: 'NOT_AUTHORIZED',
    reviewRequirement: 'NOT_AUTHORIZED',
    ...falseAuthority(),
  };
  return deepFreeze({ ...material, comparisonHash: semanticHash(material) });
}

export function assertEngineeringEnrichmentProposalHandoffComparison(value) {
  exact(value, [
    'schema', 'beforeHandoffHash', 'afterHandoffHash', 'direction',
    'proposalChanges', 'evidenceChanges', 'summary', 'status',
    'comparisonJudgement', 'adoptionDecision', 'reviewRequirement',
    ...FALSE_AUTHORITY, 'comparisonHash',
  ], 'handoff comparison');
  if (
    value.schema !== ENRICHMENT_PROPOSAL_HANDOFF_COMPARISON_SCHEMA
    || value.direction !== 'BEFORE_TO_AFTER'
    || value.comparisonJudgement !== 'NOT_AUTHORIZED'
    || value.adoptionDecision !== 'NOT_AUTHORIZED'
    || value.reviewRequirement !== 'NOT_AUTHORIZED'
  ) fail('handoff comparison scope is invalid', RangeError);
  text(value.beforeHandoffHash, 'beforeHandoffHash'); text(value.afterHandoffHash, 'afterHandoffHash');
  if (!Array.isArray(value.proposalChanges) || !Array.isArray(value.evidenceChanges)) fail('comparison changes must be arrays');
  const differenceCount = value.proposalChanges.length + value.evidenceChanges.length;
  const status = differenceCount ? 'RECORDED_SHADOW_HANDOFF_DIFFERENCES' : 'IDENTICAL_SHADOW_HANDOFFS';
  const summary = { proposalChangeCount: value.proposalChanges.length, evidenceChangeCount: value.evidenceChanges.length, differenceCount, status };
  if (value.status !== status || canonicalStringify(value.summary) !== canonicalStringify(summary)) fail('handoff comparison summary mismatch', RangeError);
  assertFalse(value); verifyHash(value, 'comparisonHash'); return value;
}

function change(proposalId, kind, before, after, changedFields = []) {
  return deepFreeze({
    proposalId,
    kind,
    changedFields: deepFreeze([...changedFields].sort(ascii)),
    beforeProposalHash: before?.proposalHash ?? null,
    afterProposalHash: after?.proposalHash ?? null,
  });
}
function falseAuthority() { return Object.fromEntries(FALSE_AUTHORITY.map((key) => [key, false])); }
function assertFalse(value) { FALSE_AUTHORITY.forEach((key) => { if (value[key] !== false) fail(`${key} must remain false`, RangeError); }); }
function verifyHash(value, field) { const material = { ...value }; delete material[field]; if (value[field] !== semanticHash(material)) fail(`${field} is invalid`, RangeError); }
function exact(value, keys, label) { if (!isPlainRecord(value) || canonicalStringify(Object.keys(value).sort(ascii)) !== canonicalStringify([...keys].sort(ascii))) fail(`${label} keys mismatch`); }
function text(value, label) { const result = String(value ?? '').trim(); if (!result) fail(`${label} is required`); return result; }
function boolean(value, label) { if (typeof value !== 'boolean') fail(`${label} must be boolean`); return value; }
function nonnegativeInteger(value, label) { if (!Number.isSafeInteger(value) || value < 0) fail(`${label} must be a non-negative safe integer`, RangeError); }
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(message, Constructor = TypeError) { throw new Constructor(`EngineeringEnrichmentProposalHandoffTransport: ${message}`); }
