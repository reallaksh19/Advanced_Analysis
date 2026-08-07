import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../shared-piping-model/index.js';

export const NON_FEA_APPROVED_ASSUMPTION_CUSTODY_SCHEMA =
  'non-fea-approved-assumption-custody/v1';
export const NON_FEA_QUALIFICATION_CUSTODY_SCHEMA =
  'non-fea-qualification-custody/v1';

export const NON_FEA_LEGACY_ASSUMPTION_AUTHORITIES = Object.freeze([
  'EXPLICIT_SOURCE',
  'ACCEPTED_OVERRIDE',
  'AUTHORIZED_MASTER',
  'USER_APPROVED_APPROXIMATION',
]);

const LEGACY_ASSUMPTION_ROW_KEYS = Object.freeze([
  'assumptionId',
  'entityId',
  'fieldId',
  'value',
  'unit',
  'source',
  'reason',
  'approver',
  'authorityLevel',
  'limitations',
]);

/**
 * Neutral normalization kernel retained for historical First Cut assumption
 * packages. This validates evidence custody only; it does not resolve or own
 * engineering field values.
 */
export function normalizeNonFeaApprovedAssumptionRows(rows) {
  if (!Array.isArray(rows)) throw new TypeError('Assumptions must be an array.');
  const normalized = rows.map(normalizeLegacyAssumptionRow)
    .sort((left, right) => ascii(left.assumptionId, right.assumptionId));
  if (new Set(normalized.map((row) => row.assumptionId)).size !== normalized.length) {
    throw new TypeError('Assumption IDs must be unique.');
  }
  return deepFreeze(normalized);
}

export function computeNonFeaAssumptionEvidenceHash(rows) {
  const normalized = normalizeNonFeaApprovedAssumptionRows(rows);
  return semanticHash(normalized.map((row) => ({
    assumptionId: row.assumptionId,
    source: row.source,
    reason: row.reason,
    approver: row.approver,
  })));
}

/**
 * Builds read-only custody for assumptions already selected by the common
 * field-resolution ledger. Values remain authoritative only in that ledger.
 * Ordinary accepted overrides are intentionally not promoted to assumptions.
 */
export function createNonFeaApprovedAssumptionCustody(input = {}) {
  const sourceModelSemanticHash = requiredHash(
    input.sourceModelSemanticHash,
    'sourceModelSemanticHash',
  );
  const resolutionLedger = requireResolutionLedger(input.resolutionLedger);
  const blockers = [];

  if (resolutionLedger.sourceSemanticHash !== sourceModelSemanticHash) {
    blockers.push(issue(
      'NON_FEA_ASSUMPTION_CUSTODY_SOURCE_MISMATCH',
      'Assumption custody is bound to a different source model.',
    ));
  }
  if (resolutionLedger.status !== 'READY') {
    blockers.push(issue(
      'NON_FEA_ASSUMPTION_CUSTODY_RESOLUTION_BLOCKED',
      'The field-resolution ledger must be READY before assumption custody can be current.',
    ));
  }

  const assumptions = [];
  const unclassifiedAcceptedOverrideRecordIds = [];
  for (const row of resolutionLedger.rows || []) {
    const selected = row?.selected;
    if (!selected || selected.authority !== 'ACCEPTED_OVERRIDE') continue;
    const origin = assumptionOrigin(selected);
    if (!origin) {
      unclassifiedAcceptedOverrideRecordIds.push(
        textOrNull(selected.recordId) || textOrNull(row.resolutionKey) || 'UNKNOWN_OVERRIDE',
      );
      continue;
    }
    const acceptanceBasis = textOrNull(selected.evidence?.acceptanceBasis)
      || textOrNull(selected.evidence?.source)
      || textOrNull(selected.sourceId);
    if (selected.migration?.reviewRequired === true
        && !textOrNull(selected.evidence?.acceptanceBasis)) {
      blockers.push(issue(
        'NON_FEA_ASSUMPTION_REVIEW_REQUIRED',
        `Migrated approximation ${selected.recordId || row.resolutionKey} lacks an explicit acceptance basis.`,
      ));
    }
    assumptions.push(deepFreeze({
      assumptionId: textOrNull(selected.recordId) || `ASSUMPTION:${row.resolutionKey}`,
      resolutionKey: requiredText(row.resolutionKey, 'resolutionKey'),
      targetKind: requiredText(row.targetKind, 'targetKind'),
      targetId: requiredText(row.targetId, 'targetId'),
      fieldId: requiredText(row.fieldId, 'fieldId'),
      origin,
      selectedAuthority: selected.authority,
      selectedRecordId: textOrNull(selected.recordId),
      selectedCandidateSemanticHash: semanticHash(selected),
      approvalBasis: acceptanceBasis,
      limitations: assumptionLimitations(selected, origin),
    }));
  }

  assumptions.sort((left, right) => ascii(
    `${left.assumptionId}|${left.resolutionKey}`,
    `${right.assumptionId}|${right.resolutionKey}`,
  ));
  const duplicateIds = duplicateValues(assumptions.map((row) => row.assumptionId));
  duplicateIds.forEach((assumptionId) => blockers.push(issue(
    'NON_FEA_ASSUMPTION_ID_DUPLICATE',
    `Duplicate approved-assumption identity: ${assumptionId}.`,
  )));

  const base = {
    schema: NON_FEA_APPROVED_ASSUMPTION_CUSTODY_SCHEMA,
    state: blockers.length ? 'BLOCKED' : 'READY',
    sourceModelSemanticHash,
    resolutionLedgerSemanticHash: resolutionLedger.semanticHash,
    assumptions,
    unclassifiedAcceptedOverrideRecordIds: [...new Set(unclassifiedAcceptedOverrideRecordIds)]
      .sort(ascii),
    blockers: blockers.sort(issueOrder),
    policy: {
      ownsFieldValues: false,
      resolverAuthority: false,
      authorizationAuthority: false,
      executionAuthority: false,
      ordinaryAcceptedOverridesAreAssumptions: false,
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateNonFeaApprovedAssumptionCustody(value) {
  const errors = [];
  if (!isPlainRecord(value)) {
    return deepFreeze({ ok: false, errors: ['Approved-assumption custody must be a plain object.'] });
  }
  if (value.schema !== NON_FEA_APPROVED_ASSUMPTION_CUSTODY_SCHEMA) {
    errors.push(`Expected ${NON_FEA_APPROVED_ASSUMPTION_CUSTODY_SCHEMA}.`);
  }
  if (!['READY', 'BLOCKED'].includes(value.state)) errors.push('Assumption custody state is invalid.');
  if (!validHash(value.sourceModelSemanticHash)) errors.push('Assumption custody source hash is invalid.');
  if (!validHash(value.resolutionLedgerSemanticHash)) errors.push('Assumption custody resolution-ledger hash is invalid.');
  if (!Array.isArray(value.assumptions)) errors.push('Assumption custody assumptions must be an array.');
  else {
    const ids = value.assumptions.map((row) => row?.assumptionId);
    if (new Set(ids).size !== ids.length) errors.push('Assumption custody IDs must be unique.');
    value.assumptions.forEach((row) => {
      if (!isPlainRecord(row) || !validHash(row.selectedCandidateSemanticHash)) {
        errors.push('Assumption custody rows require selected candidate hashes.');
      }
    });
  }
  if (!Array.isArray(value.unclassifiedAcceptedOverrideRecordIds)) {
    errors.push('Unclassified accepted-override IDs must be an array.');
  }
  if (!Array.isArray(value.blockers)) errors.push('Assumption custody blockers must be an array.');
  if (value.semanticHash !== semanticHash(withoutHash(value))) {
    errors.push('Approved-assumption custody semantic hash is invalid.');
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

/**
 * Captures project/application qualification authority without absorbing an
 * implementation runtime profile. Runtime qualification remains a separate
 * implementation-binding concern.
 */
export function createNonFeaQualificationCustody(input = {}) {
  if (!isPlainRecord(input.projectDataProfile)) {
    throw new TypeError('Qualification custody requires a Project Data profile.');
  }
  const projectDataProfile = input.projectDataProfile;
  const qualificationRequired = input.qualificationRequired === true;
  const authorityMode = input.authorityMode || 'PROJECT_DATA';
  if (!['PROJECT_DATA', 'SEALED_COMMON_INPUT'].includes(authorityMode)) {
    throw new TypeError('Qualification custody authorityMode is invalid.');
  }
  const qualificationProfile = input.qualificationProfile == null
    ? null
    : normalizeQualificationProfile(input.qualificationProfile);
  const sealedQualificationProfileSemanticHash = input.sealedQualificationProfileSemanticHash == null
    ? null
    : requiredHash(input.sealedQualificationProfileSemanticHash, 'sealedQualificationProfileSemanticHash');
  const blockers = [];
  const entry = projectDataProfile?.qualificationPolicy?.qualificationProfiles;

  if (qualificationRequired && !qualificationProfile) {
    blockers.push(issue(
      'NON_FEA_QUALIFICATION_PROFILE_REQUIRED',
      'A selected project/application qualification profile is required.',
    ));
  }

  if (qualificationProfile) {
    if (authorityMode === 'PROJECT_DATA') {
      if (!isPlainRecord(entry) || entry.approved !== true || !textOrNull(entry.evidence?.source)) {
        blockers.push(issue(
          'NON_FEA_QUALIFICATION_AUTHORITY_NOT_APPROVED',
          'Project Data qualification-profile authority must be approved and source-evidenced.',
        ));
      }
      const profileSet = entry?.value;
      if (!isPlainRecord(profileSet)
          || profileSet.schema !== 'non-fea-qualification-profile-set/v1'
          || !Array.isArray(profileSet.profiles)) {
        blockers.push(issue(
          'NON_FEA_QUALIFICATION_PROFILE_SET_INVALID',
          'Project Data must contain non-fea-qualification-profile-set/v1.',
        ));
      } else {
        const matching = profileSet.profiles
          .filter((row) => row?.profileId === qualificationProfile.profileId
            && row?.version === qualificationProfile.version);
        if (matching.length !== 1) {
          blockers.push(issue(
            'NON_FEA_QUALIFICATION_PROFILE_IDENTITY_MISMATCH',
            `Qualification profile ${qualificationProfile.profileId}@${qualificationProfile.version} is not uniquely present in Project Data.`,
          ));
        } else {
          const projectProfile = normalizeQualificationProfile(matching[0]);
          if (projectProfile.semanticHash !== qualificationProfile.semanticHash) {
            blockers.push(issue(
              'NON_FEA_QUALIFICATION_PROFILE_STALE',
              'Selected qualification profile differs from current Project Data authority.',
            ));
          }
        }
      }
    } else if (sealedQualificationProfileSemanticHash !== qualificationProfile.semanticHash) {
      blockers.push(issue(
        'NON_FEA_QUALIFICATION_SEAL_MISMATCH',
        'Selected qualification profile differs from the profile frozen into the common-input seal.',
      ));
    }
    if (qualificationProfile.qualification !== 'QUALIFIED') {
      blockers.push(issue(
        'NON_FEA_QUALIFICATION_PROFILE_UNQUALIFIED',
        'Selected project/application qualification profile is not QUALIFIED.',
      ));
    }
    if (qualificationProfile.locked !== true) {
      blockers.push(issue(
        'NON_FEA_QUALIFICATION_PROFILE_UNLOCKED',
        'Selected project/application qualification profile must be locked.',
      ));
    }
  } else if (authorityMode === 'SEALED_COMMON_INPUT' && sealedQualificationProfileSemanticHash !== null) {
    blockers.push(issue(
      'NON_FEA_QUALIFICATION_SEALED_PROFILE_MISSING',
      'The common-input seal binds a qualification profile that is not present in the handoff.',
    ));
  }

  const base = {
    schema: NON_FEA_QUALIFICATION_CUSTODY_SCHEMA,
    state: blockers.length ? 'BLOCKED' : 'READY',
    qualificationRequired,
    authorityMode,
    projectDataProfileSemanticHash: semanticHash(projectDataProfile),
    qualificationProfileSemanticHash: qualificationProfile?.semanticHash || null,
    sealedQualificationProfileSemanticHash,
    profileIdentity: qualificationProfile
      ? `${qualificationProfile.profileId}@${qualificationProfile.version}`
      : null,
    qualifiedMethodIds: qualificationProfile?.methods || [],
    qualification: qualificationProfile?.qualification || null,
    locked: qualificationProfile?.locked ?? null,
    authorityEvidenceSemanticHash: authorityMode === 'PROJECT_DATA' && isPlainRecord(entry?.evidence)
      ? semanticHash(entry.evidence)
      : null,
    blockers: blockers.sort(issueOrder),
    policy: {
      projectApplicationAuthorityOnly: true,
      runtimeProfileAuthority: false,
      authorizationAuthority: false,
      executionAuthority: false,
      sealedCommonInputMayBindAuthority: true,
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateNonFeaQualificationCustody(value) {
  const errors = [];
  if (!isPlainRecord(value)) {
    return deepFreeze({ ok: false, errors: ['Qualification custody must be a plain object.'] });
  }
  if (value.schema !== NON_FEA_QUALIFICATION_CUSTODY_SCHEMA) {
    errors.push(`Expected ${NON_FEA_QUALIFICATION_CUSTODY_SCHEMA}.`);
  }
  if (!['READY', 'BLOCKED'].includes(value.state)) errors.push('Qualification custody state is invalid.');
  if (!['PROJECT_DATA', 'SEALED_COMMON_INPUT'].includes(value.authorityMode)) {
    errors.push('Qualification custody authority mode is invalid.');
  }
  if (!validHash(value.projectDataProfileSemanticHash)) errors.push('Qualification custody Project Data hash is invalid.');
  if (value.qualificationProfileSemanticHash !== null
      && !validHash(value.qualificationProfileSemanticHash)) {
    errors.push('Qualification profile hash is invalid.');
  }
  if (value.sealedQualificationProfileSemanticHash !== null
      && !validHash(value.sealedQualificationProfileSemanticHash)) {
    errors.push('Sealed qualification profile hash is invalid.');
  }
  if (!Array.isArray(value.qualifiedMethodIds)) errors.push('Qualified method IDs must be an array.');
  if (!Array.isArray(value.blockers)) errors.push('Qualification custody blockers must be an array.');
  if (value.semanticHash !== semanticHash(withoutHash(value))) {
    errors.push('Qualification custody semantic hash is invalid.');
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function normalizeLegacyAssumptionRow(value) {
  assertExactKeys(value, LEGACY_ASSUMPTION_ROW_KEYS, 'Assumption');
  if (!Array.isArray(value.limitations) || value.limitations.some((item) => typeof item !== 'string')) {
    throw new TypeError('Assumption limitations must be a string array.');
  }
  const assumptionValue = typeof value.value === 'number'
    ? finiteNumber(value.value, 'Assumption value')
    : requiredText(value.value, 'Assumption value');
  if (!NON_FEA_LEGACY_ASSUMPTION_AUTHORITIES.includes(value.authorityLevel)) {
    throw new TypeError('Assumption authority is invalid.');
  }
  return deepFreeze({
    assumptionId: requiredText(value.assumptionId, 'Assumption ID'),
    entityId: requiredText(value.entityId, 'Assumption entity ID'),
    fieldId: requiredText(value.fieldId, 'Assumption field ID'),
    value: assumptionValue,
    unit: requiredText(value.unit, 'Assumption unit'),
    source: requiredText(value.source, 'Assumption source'),
    reason: requiredText(value.reason, 'Assumption reason'),
    approver: requiredText(value.approver, 'Assumption approver'),
    authorityLevel: value.authorityLevel,
    limitations: [...new Set(value.limitations)].sort(ascii),
  });
}

function normalizeQualificationProfile(value) {
  if (!isPlainRecord(value)) throw new TypeError('Qualification profile must be an object.');
  const profileId = requiredText(value.profileId, 'Qualification profile ID');
  if (!Number.isInteger(value.version) || value.version < 1) {
    throw new TypeError('Qualification profile version must be a positive integer.');
  }
  if (!Array.isArray(value.methods) || value.methods.length === 0
      || value.methods.some((item) => !textOrNull(item))) {
    throw new TypeError('Qualification profile methods must be a non-empty string array.');
  }
  const methods = [...new Set(value.methods)].sort(ascii);
  if (methods.length !== value.methods.length) {
    throw new TypeError('Qualification profile methods must be unique.');
  }
  if (!['QUALIFIED', 'UNQUALIFIED'].includes(value.qualification)) {
    throw new TypeError('Qualification profile qualification is invalid.');
  }
  if (typeof value.locked !== 'boolean') throw new TypeError('Qualification profile locked must be boolean.');
  const base = {
    profileId,
    version: value.version,
    methods,
    qualification: value.qualification,
    locked: value.locked,
    basis: value.basis === undefined ? null : structuredClone(value.basis),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function assumptionOrigin(selected) {
  if (selected.migration?.legacyAuthority === 'USER_APPROVED_APPROXIMATION') {
    return 'LEGACY_FIRST_CUT_APPROXIMATION';
  }
  if (selected.fieldId === 'SUPPORT_AVAILABILITY_SENSITIVITY') {
    return 'SUPPORT_AVAILABILITY_SENSITIVITY';
  }
  if (selected.evidence?.assumption === true || textOrNull(selected.evidence?.assumptionClassification)) {
    return 'EXPLICIT_ASSUMPTION_EVIDENCE';
  }
  return null;
}

function assumptionLimitations(selected, origin) {
  const limitations = Array.isArray(selected.evidence?.limitations)
    ? selected.evidence.limitations.filter((item) => typeof item === 'string')
    : [];
  if (origin === 'SUPPORT_AVAILABILITY_SENSITIVITY') {
    limitations.push('DOES_NOT_IMPLY_THERMAL_LIFT_OFF');
  }
  return [...new Set(limitations)].sort(ascii);
}

function requireResolutionLedger(value) {
  if (!isPlainRecord(value) || value.schema !== 'non-fea-field-resolution-ledger/v1') {
    throw new TypeError('Expected non-fea-field-resolution-ledger/v1.');
  }
  if (!validHash(value.semanticHash)) throw new TypeError('Resolution ledger semantic hash is required.');
  if (semanticHash(withoutHash(value)) !== value.semanticHash) {
    throw new TypeError('Resolution ledger semantic hash is stale.');
  }
  if (!Array.isArray(value.rows)) throw new TypeError('Resolution ledger rows must be an array.');
  return value;
}

function assertExactKeys(value, keys, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be a plain object.`);
  const expected = [...keys].sort(ascii);
  const actual = Object.keys(value).sort(ascii);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} requires exact keys: ${expected.join(', ')}.`);
  }
}

function finiteNumber(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} is invalid.`);
  return value;
}
function requiredHash(value, label) {
  const normalized = requiredText(value, label);
  if (!validHash(normalized)) throw new TypeError(`${label} must be a namespaced semantic hash.`);
  return normalized;
}
function requiredText(value, label) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${label} is required.`);
  return normalized;
}
function textOrNull(value) { const normalized = stringValue(value); return normalized || null; }
function validHash(value) { return typeof value === 'string' && value.includes(':'); }
function withoutHash(value) { const copy = structuredClone(value); delete copy.semanticHash; return copy; }
function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  values.forEach((value) => { if (seen.has(value)) duplicates.add(value); else seen.add(value); });
  return [...duplicates].sort(ascii);
}
function issue(code, message) { return deepFreeze({ code, message }); }
function issueOrder(left, right) { return ascii(`${left.code}|${left.message}`, `${right.code}|${right.message}`); }
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
