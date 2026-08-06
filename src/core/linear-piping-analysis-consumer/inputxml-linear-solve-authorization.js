import {
  INPUTXML_LINEAR_SOLVE_AUTHORIZATION_SCHEMA,
  compareAscii,
  fail,
  requirePreFeaRecord,
  sealPreFeaRecord,
  uniqueAscii,
} from './inputxml-linear-prefea-contract.js';
import { requireInputXmlLinearPreFeaPreparation } from './inputxml-linear-prefea-preparation.js';

const APPROVAL_KEYS = Object.freeze([
  'authorizationSource',
  'authorizationRevision',
  'approverIdentity',
  'reason',
  'limitationsAccepted',
  'authorizedPhysicalCaseIds',
  'warningFindingIds',
  'invalidationPolicy',
  'expiration',
]);
const INVALIDATION_POLICY = 'INVALIDATE_ON_PARENT_IDENTITY_CHANGE';

export function authorizeInputXmlLinearSolve(preparation, authorization) {
  const accepted = requireInputXmlLinearPreFeaPreparation(preparation);
  if (accepted.status === 'BLOCK') {
    fail('PREFEA_BLOCK_OVERRIDE_PROHIBITED', 'A BLOCK preparation cannot be authorized.', {
      preparationSemanticHash: accepted.semanticHash,
      blockingFindingIds: accepted.findings.filter((row) => row.disposition === 'BLOCK')
        .map((row) => row.findingId),
    });
  }
  const warningFindingIds = uniqueAscii(accepted.findings
    .filter((row) => row.disposition === 'CONDITIONAL').map((row) => row.findingId));
  const conditionalLimitations = uniqueAscii([
    ...accepted.limitations,
    ...accepted.findings.filter((row) => row.disposition === 'CONDITIONAL').map((row) => row.code),
  ]);
  const approval = authorization === undefined && accepted.status === 'PASS'
    ? automaticPassApproval(accepted)
    : requireApproval(authorization);
  const authorizedCaseIds = uniqueAscii(approval.authorizedPhysicalCaseIds);

  requireSubset(authorizedCaseIds, accepted.requestedCaseIds, 'PREFEA_AUTHORIZATION_CASE_NOT_REQUESTED');
  requireNonempty(authorizedCaseIds, 'PREFEA_AUTHORIZATION_CASE_SET_EMPTY');
  requireEqualSets(
    uniqueAscii(approval.warningFindingIds),
    warningFindingIds,
    'PREFEA_AUTHORIZATION_WARNING_SET_MISMATCH',
    'The authorization warning finding set does not match the preparation.',
  );
  if (accepted.status === 'WARN') {
    requireEqualSets(
      uniqueAscii(approval.limitationsAccepted),
      conditionalLimitations,
      'PREFEA_AUTHORIZATION_LIMITATION_SET_MISMATCH',
      'WARN authorization must accept the complete retained limitation set.',
    );
    if (approval.approverIdentity === 'SYSTEM_POLICY') {
      fail('PREFEA_WARN_REQUIRES_EXPLICIT_APPROVER', 'WARN cannot be authorized automatically.');
    }
  } else if (approval.limitationsAccepted.length > 0) {
    requireSubset(uniqueAscii(approval.limitationsAccepted), conditionalLimitations,
      'PREFEA_AUTHORIZATION_UNKNOWN_LIMITATION');
  }
  if (approval.invalidationPolicy !== INVALIDATION_POLICY) {
    fail('PREFEA_AUTHORIZATION_INVALIDATION_POLICY_UNSUPPORTED',
      `Authorization invalidation policy must be ${INVALIDATION_POLICY}.`, {
        supplied: approval.invalidationPolicy,
      });
  }

  return sealPreFeaRecord({
    schema: INPUTXML_LINEAR_SOLVE_AUTHORIZATION_SCHEMA,
    authorizationId: `IXAUTH-${accepted.semanticHash.slice(0, 20)}-${authorizedCaseIds.join('-')}`,
    preparationStatus: accepted.status,
    preparationSemanticHash: accepted.semanticHash,
    preparationEvidenceHash: accepted.evidenceHash,
    diagnosticsSemanticHash: accepted.diagnosticsSemanticHash,
    diagnosticsEvidenceHash: accepted.diagnosticsEvidenceHash,
    sourceBundleSemanticHash: accepted.sourceBundleSemanticHash,
    sourceBundleEvidenceHash: accepted.sourceBundleEvidenceHash,
    modelSemanticHash: accepted.modelSemanticHash,
    stiffnessStateHash: accepted.stiffnessStateHash,
    loadStateHash: accepted.loadStateHash,
    requestedProfileId: accepted.requestedProfileId,
    authorizedPhysicalCaseIds: authorizedCaseIds,
    warningFindingIds,
    authorizationSource: approval.authorizationSource,
    authorizationRevision: approval.authorizationRevision,
    approverIdentity: approval.approverIdentity,
    reason: approval.reason,
    limitationsAccepted: uniqueAscii(approval.limitationsAccepted),
    invalidationPolicy: approval.invalidationPolicy,
    expiration: approval.expiration,
    executionBoundary: {
      authorizationIssued: true,
      solverRuntime: 'NOT_CREATED',
      sourceMutationPermitted: false,
      supportMutationPermitted: false,
      loadMutationPermitted: false,
      profileMutationPermitted: false,
    },
    semanticHash: '',
    evidenceHash: '',
  }, INPUTXML_LINEAR_SOLVE_AUTHORIZATION_SCHEMA, authorizationIdentity, authorizationEvidence);
}

export function requireInputXmlLinearSolveAuthorization(record, preparation, requestedCaseIds) {
  const accepted = requirePreFeaRecord(
    record,
    INPUTXML_LINEAR_SOLVE_AUTHORIZATION_SCHEMA,
    authorizationIdentity,
    authorizationEvidence,
  );
  const parent = requireInputXmlLinearPreFeaPreparation(preparation);
  if (parent.status === 'BLOCK') {
    fail('PREFEA_BLOCK_OVERRIDE_PROHIBITED', 'A BLOCK preparation cannot be used by a solve authorization.');
  }
  const comparisons = [
    ['preparationSemanticHash', parent.semanticHash],
    ['preparationEvidenceHash', parent.evidenceHash],
    ['diagnosticsSemanticHash', parent.diagnosticsSemanticHash],
    ['diagnosticsEvidenceHash', parent.diagnosticsEvidenceHash],
    ['sourceBundleSemanticHash', parent.sourceBundleSemanticHash],
    ['sourceBundleEvidenceHash', parent.sourceBundleEvidenceHash],
    ['modelSemanticHash', parent.modelSemanticHash],
    ['stiffnessStateHash', parent.stiffnessStateHash],
    ['loadStateHash', parent.loadStateHash],
    ['requestedProfileId', parent.requestedProfileId],
  ];
  const mismatches = comparisons.filter(([field, expected]) => accepted[field] !== expected)
    .map(([field, expected]) => ({ field, expected, actual: accepted[field] }));
  if (mismatches.length > 0) {
    fail('PREFEA_AUTHORIZATION_STALE', 'The solve authorization is stale or belongs to another model.', {
      mismatches,
    });
  }
  const currentWarnings = uniqueAscii(parent.findings
    .filter((row) => row.disposition === 'CONDITIONAL').map((row) => row.findingId));
  requireEqualSets(
    accepted.warningFindingIds,
    currentWarnings,
    'PREFEA_AUTHORIZATION_WARNING_SET_STALE',
    'The authorized warning finding set is stale.',
  );
  const requested = uniqueAscii(requestedCaseIds ?? accepted.authorizedPhysicalCaseIds);
  requireSubset(requested, accepted.authorizedPhysicalCaseIds, 'PREFEA_AUTHORIZATION_CASE_NOT_AUTHORIZED');
  requireSubset(requested, parent.requestedCaseIds, 'PREFEA_AUTHORIZATION_CASE_NOT_REQUESTED');
  if (accepted.expiration !== null && Date.parse(accepted.expiration) <= Date.now()) {
    fail('PREFEA_AUTHORIZATION_EXPIRED', 'The solve authorization has expired.', {
      expiration: accepted.expiration,
    });
  }
  return accepted;
}

function requireApproval(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('PREFEA_AUTHORIZATION_RECORD_REQUIRED', 'A complete authorization record is required.');
  }
  const actualKeys = Object.keys(value).sort(compareAscii);
  const expectedKeys = [...APPROVAL_KEYS].sort(compareAscii);
  if (actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    fail('PREFEA_AUTHORIZATION_KEYS_INVALID', 'Authorization record keys are invalid.', {
      actualKeys,
      expectedKeys,
    });
  }
  const approval = {
    authorizationSource: text(value.authorizationSource, 'authorizationSource'),
    authorizationRevision: text(value.authorizationRevision, 'authorizationRevision'),
    approverIdentity: text(value.approverIdentity, 'approverIdentity'),
    reason: text(value.reason, 'reason'),
    limitationsAccepted: stringArray(value.limitationsAccepted, 'limitationsAccepted'),
    authorizedPhysicalCaseIds: stringArray(value.authorizedPhysicalCaseIds, 'authorizedPhysicalCaseIds'),
    warningFindingIds: stringArray(value.warningFindingIds, 'warningFindingIds'),
    invalidationPolicy: text(value.invalidationPolicy, 'invalidationPolicy'),
    expiration: value.expiration === null ? null : validDate(value.expiration),
  };
  return Object.freeze(approval);
}

function automaticPassApproval(preparation) {
  return Object.freeze({
    authorizationSource: 'PREFEA_AUTOMATIC_PASS_POLICY_V1',
    authorizationRevision: '1',
    approverIdentity: 'SYSTEM_POLICY',
    reason: 'Automatic authorization for an exact PASS preparation with no conditional findings.',
    limitationsAccepted: Object.freeze([]),
    authorizedPhysicalCaseIds: preparation.requestedCaseIds,
    warningFindingIds: Object.freeze([]),
    invalidationPolicy: INVALIDATION_POLICY,
    expiration: null,
  });
}

function authorizationIdentity(record) {
  return {
    schema: record.schema,
    authorizationId: record.authorizationId,
    preparationStatus: record.preparationStatus,
    preparationSemanticHash: record.preparationSemanticHash,
    diagnosticsSemanticHash: record.diagnosticsSemanticHash,
    sourceBundleSemanticHash: record.sourceBundleSemanticHash,
    modelSemanticHash: record.modelSemanticHash,
    stiffnessStateHash: record.stiffnessStateHash,
    loadStateHash: record.loadStateHash,
    requestedProfileId: record.requestedProfileId,
    authorizedPhysicalCaseIds: record.authorizedPhysicalCaseIds,
    warningFindingIds: record.warningFindingIds,
    authorizationSource: record.authorizationSource,
    authorizationRevision: record.authorizationRevision,
    approverIdentity: record.approverIdentity,
    reason: record.reason,
    limitationsAccepted: record.limitationsAccepted,
    invalidationPolicy: record.invalidationPolicy,
    expiration: record.expiration,
    executionBoundary: record.executionBoundary,
  };
}

function authorizationEvidence(record) {
  return {
    preparationEvidenceHash: record.preparationEvidenceHash,
    diagnosticsEvidenceHash: record.diagnosticsEvidenceHash,
    sourceBundleEvidenceHash: record.sourceBundleEvidenceHash,
    authorizationSource: record.authorizationSource,
    authorizationRevision: record.authorizationRevision,
    approverIdentity: record.approverIdentity,
    reason: record.reason,
  };
}

function requireSubset(values, allowed, code) {
  const invalid = values.filter((value) => !allowed.includes(value));
  if (invalid.length > 0) fail(code, 'Authorization set contains disallowed values.', { invalid, allowed });
}

function requireEqualSets(actual, expected, code, message) {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    fail(code, message, { actual, expected });
  }
}

function requireNonempty(values, code) {
  if (values.length === 0) fail(code, 'At least one physical case must be authorized.');
}

function text(value, field) {
  const result = String(value ?? '').trim();
  if (!result) fail('PREFEA_AUTHORIZATION_FIELD_REQUIRED', `${field} is required.`, { field });
  return result;
}

function stringArray(value, field) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    fail('PREFEA_AUTHORIZATION_ARRAY_INVALID', `${field} must be an array of non-empty strings.`, { field });
  }
  return Object.freeze(uniqueAscii(value));
}

function validDate(value) {
  const textValue = text(value, 'expiration');
  if (!Number.isFinite(Date.parse(textValue))) {
    fail('PREFEA_AUTHORIZATION_EXPIRATION_INVALID', 'Authorization expiration must be an ISO date-time.', {
      expiration: textValue,
    });
  }
  return textValue;
}
