import {
  canonicalStringify,
  canonicalizeJson,
  semanticHash,
} from '../shared-piping-model/canonical-json.js';
import {
  deepFreeze,
  isPlainRecord,
} from '../shared-piping-model/immutable.js';

export const PROJECT_AUTHORITY_INDEX_SCHEMA =
  'lfea-piping-phase6i-project-authority-index/v1';
export const PROJECT_AUTHORITY_INDEX_TEMPLATE_SCHEMA =
  'lfea-piping-phase6i-project-authority-index-template/v1';
export const PROJECT_AUTHORITY_INDEX_STATUS = Object.freeze([
  'WP2_INPUT_REQUIRED',
  'WP2_APPROVAL_REQUIRED',
  'WP2_COMPLETE',
]);
export const PROJECT_AUTHORITY_GROUP_IDS = Object.freeze([
  'CANONICAL_UNITS_AND_NORMALIZATION',
  'MATERIAL_ASSIGNMENTS',
  'PIPE_AND_SECTION_PROPERTIES',
  'LOCAL_AXES_AND_REFERENCE_VECTORS',
  'RESTRAINTS_SPRINGS_AND_PRESCRIBED_MOVEMENTS',
  'PHYSICAL_LOAD_CASES_AND_COMBINATIONS',
  'SUPPORT_ANCHOR_INTERFACE_AND_NOZZLE_DEFINITIONS',
  'NOZZLE_ALLOWABLE_PROFILES',
  'B31_3_AUTHORITY',
  'REPRESENTATIVE_REAL_PROJECT_MODEL',
  'NONLINEAR_EXCLUSIONS_AND_ESCALATION',
]);

export const PHASE6I_FROZEN_CANDIDATE =
  '617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54';
export const PHASE6I_IMMUTABLE_REF =
  'release/lfea-piping-phase6i-617f7c2';

const REPOSITORY = 'reallaksh19/Advanced_Analysis';
const HASH_PATTERN = /^(?:fnv1a64:[0-9a-f]{16}|sha256:[0-9a-f]{64})$/u;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const INPUT_KEYS = Object.freeze([
  'repository',
  'candidate',
  'indexId',
  'revision',
  'preparedAtUtc',
  'preparedBy',
  'authorityGroups',
  'engineeringApproval',
]);
const OUTPUT_KEYS = Object.freeze([
  'schema',
  ...INPUT_KEYS,
  'summary',
  'wp2Status',
  'releaseQualified',
  'semanticHash',
  'evidenceHash',
]);
const CANDIDATE_KEYS = Object.freeze(['sha', 'ref']);
const PREPARED_BY_KEYS = Object.freeze(['name', 'role', 'organization']);
const GROUP_KEYS = Object.freeze([
  'groupId',
  'applicability',
  'resolution',
  'scopeDescription',
  'source',
  'approvalStatus',
]);
const SOURCE_KEYS = Object.freeze([
  'sourceType',
  'documentId',
  'title',
  'revision',
  'owner',
  'retainedReference',
  'sourceHash',
]);
const ENGINEERING_APPROVAL_KEYS = Object.freeze([
  'status',
  'approverName',
  'approverRole',
  'organization',
  'approvedAtUtc',
  'evidenceReference',
  'evidenceHash',
]);
const SUMMARY_KEYS = Object.freeze([
  'authorityGroupCount',
  'resolvedGroupCount',
  'approvedGroupCount',
  'unresolvedAuthorities',
  'approvalPending',
]);
const SOURCE_TYPES = Object.freeze([
  'PROJECT_DOCUMENT',
  'APPROVED_ENGINEERING_REGISTER',
  'CONTROLLED_MODEL',
  'VENDOR_DOCUMENT',
  'CODE_DATASET',
  'APPROVAL_RECORD',
]);
const FORBIDDEN_AUTHORITY_REFERENCE =
  /(?:PR[\s_#:-]*371|engineering-enrichment|SHADOW_CANDIDATE_VALUE|PROPOSAL_ONLY|AUTHORIZED_MASTER_CANDIDATE|production[\s_-]*output|commercial[\s_-]*output|filename[\s_-]*inference|default[\s_-]*value)/iu;

export class ProjectAuthorityIndexError extends Error {
  constructor(code, evidence = {}) {
    super(code);
    this.name = 'ProjectAuthorityIndexError';
    this.code = code;
    this.evidence = deepFreeze(canonicalizeJson(evidence));
  }
}

export function buildProjectAuthorityIndex(input) {
  requireExactKeys(input, INPUT_KEYS, 'LFEA_WP2_INDEX_INPUT_INVALID');
  const repository = requireText(input.repository, 'repository');
  if (repository !== REPOSITORY) {
    fail('LFEA_WP2_REPOSITORY_MISMATCH', { repository });
  }
  const candidate = normalizeCandidate(input.candidate);
  const indexId = requireText(input.indexId, 'indexId');
  const revision = requireText(input.revision, 'revision');
  const preparedAtUtc = requireUtc(input.preparedAtUtc, 'preparedAtUtc');
  const preparedBy = normalizePreparedBy(input.preparedBy);
  const authorityGroups = normalizeAuthorityGroups(input.authorityGroups);
  const engineeringApproval = normalizeEngineeringApproval(
    input.engineeringApproval,
  );
  const summary = summarize(authorityGroups, engineeringApproval);
  const wp2Status = statusFromSummary(summary);
  const material = {
    schema: PROJECT_AUTHORITY_INDEX_SCHEMA,
    repository,
    candidate,
    indexId,
    revision,
    preparedAtUtc,
    preparedBy,
    authorityGroups,
    engineeringApproval,
    summary,
    wp2Status,
    releaseQualified: false,
  };
  const semantic = semanticHash(semanticMaterial(material));
  const evidenceMaterial = { ...material, semanticHash: semantic };
  return deepFreeze(canonicalizeJson({
    ...evidenceMaterial,
    evidenceHash: semanticHash(evidenceMaterial),
  }));
}

export function assertProjectAuthorityIndex(value) {
  requireExactKeys(value, OUTPUT_KEYS, 'LFEA_WP2_INDEX_INVALID');
  if (value.schema !== PROJECT_AUTHORITY_INDEX_SCHEMA) {
    fail('LFEA_WP2_INDEX_SCHEMA_INVALID', { schema: value.schema });
  }
  const rebuilt = buildProjectAuthorityIndex({
    repository: value.repository,
    candidate: value.candidate,
    indexId: value.indexId,
    revision: value.revision,
    preparedAtUtc: value.preparedAtUtc,
    preparedBy: value.preparedBy,
    authorityGroups: value.authorityGroups,
    engineeringApproval: value.engineeringApproval,
  });
  if (canonicalStringify(rebuilt) !== canonicalStringify(value)) {
    fail('LFEA_WP2_INDEX_CANONICAL_MISMATCH');
  }
  return value;
}

export function requireApprovedProjectAuthorityIndex(value) {
  const record = assertProjectAuthorityIndex(value);
  if (record.wp2Status !== 'WP2_COMPLETE'
    || record.summary.unresolvedAuthorities.length !== 0
    || record.summary.approvalPending.length !== 0) {
    fail('LFEA_WP2_INDEX_NOT_APPROVED', {
      wp2Status: record.wp2Status,
      unresolvedAuthorities: record.summary.unresolvedAuthorities,
      approvalPending: record.summary.approvalPending,
    });
  }
  return record;
}

function normalizeCandidate(value) {
  requireExactKeys(value, CANDIDATE_KEYS, 'LFEA_WP2_CANDIDATE_INVALID');
  const sha = requireText(value.sha, 'candidate.sha');
  const ref = requireText(value.ref, 'candidate.ref');
  if (sha !== PHASE6I_FROZEN_CANDIDATE || ref !== PHASE6I_IMMUTABLE_REF) {
    fail('LFEA_WP2_CANDIDATE_MISMATCH', { sha, ref });
  }
  return deepFreeze({ sha, ref });
}

function normalizePreparedBy(value) {
  requireExactKeys(value, PREPARED_BY_KEYS, 'LFEA_WP2_PREPARER_INVALID');
  return deepFreeze({
    name: requireText(value.name, 'preparedBy.name'),
    role: requireText(value.role, 'preparedBy.role'),
    organization: requireText(value.organization, 'preparedBy.organization'),
  });
}

function normalizeAuthorityGroups(value) {
  if (!Array.isArray(value)) fail('LFEA_WP2_AUTHORITY_GROUPS_INVALID');
  if (value.length !== PROJECT_AUTHORITY_GROUP_IDS.length) {
    fail('LFEA_WP2_AUTHORITY_GROUP_COUNT_INVALID', {
      expected: PROJECT_AUTHORITY_GROUP_IDS.length,
      actual: value.length,
    });
  }
  const rows = value.map(normalizeAuthorityGroup);
  const byId = new Map();
  for (const row of rows) {
    if (byId.has(row.groupId)) {
      fail('LFEA_WP2_AUTHORITY_GROUP_DUPLICATE', { groupId: row.groupId });
    }
    byId.set(row.groupId, row);
  }
  const missing = PROJECT_AUTHORITY_GROUP_IDS.filter((groupId) => !byId.has(groupId));
  const unexpected = [...byId.keys()].filter(
    (groupId) => !PROJECT_AUTHORITY_GROUP_IDS.includes(groupId),
  );
  if (missing.length || unexpected.length) {
    fail('LFEA_WP2_AUTHORITY_GROUP_INVENTORY_INVALID', { missing, unexpected });
  }
  return deepFreeze(PROJECT_AUTHORITY_GROUP_IDS.map((groupId) => byId.get(groupId)));
}

function normalizeAuthorityGroup(value) {
  requireExactKeys(value, GROUP_KEYS, 'LFEA_WP2_AUTHORITY_GROUP_INVALID');
  const groupId = requireText(value.groupId, 'authorityGroup.groupId');
  const applicability = requireEnum(
    value.applicability,
    ['APPLICABLE', 'NOT_APPLICABLE', 'UNRESOLVED'],
    'authorityGroup.applicability',
  );
  const resolution = requireEnum(
    value.resolution,
    ['RESOLVED', 'UNRESOLVED_GATE'],
    'authorityGroup.resolution',
  );
  const scopeDescription = requireText(
    value.scopeDescription,
    'authorityGroup.scopeDescription',
  );
  const source = value.source === null ? null : normalizeSource(value.source);
  const approvalStatus = requireEnum(
    value.approvalStatus,
    ['APPROVED', 'NOT_APPROVED'],
    'authorityGroup.approvalStatus',
  );

  if (applicability === 'UNRESOLVED' && resolution !== 'UNRESOLVED_GATE') {
    fail('LFEA_WP2_APPLICABILITY_UNRESOLVED', { groupId });
  }
  if (resolution === 'RESOLVED' && source === null) {
    fail('LFEA_WP2_RESOLVED_SOURCE_MISSING', { groupId });
  }
  if (approvalStatus === 'APPROVED'
    && (resolution !== 'RESOLVED' || source === null)) {
    fail('LFEA_WP2_PREMATURE_GROUP_APPROVAL', { groupId });
  }
  if (applicability === 'NOT_APPLICABLE'
    && resolution === 'RESOLVED'
    && approvalStatus !== 'APPROVED') {
    fail('LFEA_WP2_NONAPPLICABILITY_NOT_APPROVED', { groupId });
  }

  return deepFreeze({
    groupId,
    applicability,
    resolution,
    scopeDescription,
    source,
    approvalStatus,
  });
}

function normalizeSource(value) {
  requireExactKeys(value, SOURCE_KEYS, 'LFEA_WP2_SOURCE_INVALID');
  const sourceType = requireEnum(value.sourceType, SOURCE_TYPES, 'source.sourceType');
  const documentId = requireText(value.documentId, 'source.documentId');
  const title = requireText(value.title, 'source.title');
  const revision = requireText(value.revision, 'source.revision');
  const owner = requireText(value.owner, 'source.owner');
  const retainedReference = requireText(
    value.retainedReference,
    'source.retainedReference',
  );
  const sourceHash = requireHash(value.sourceHash, 'source.sourceHash');
  const sourceIdentity = [
    documentId,
    title,
    revision,
    owner,
    retainedReference,
  ].join('\n');
  requireAuthorityReference(sourceIdentity, {
    documentId,
    retainedReference,
  });
  return deepFreeze({
    sourceType,
    documentId,
    title,
    revision,
    owner,
    retainedReference,
    sourceHash,
  });
}

function normalizeEngineeringApproval(value) {
  requireExactKeys(
    value,
    ENGINEERING_APPROVAL_KEYS,
    'LFEA_WP2_ENGINEERING_APPROVAL_INVALID',
  );
  const status = requireEnum(
    value.status,
    ['APPROVED', 'NOT_APPROVED'],
    'engineeringApproval.status',
  );
  if (status === 'NOT_APPROVED') {
    for (const key of ENGINEERING_APPROVAL_KEYS.slice(1)) {
      if (value[key] !== null) {
        fail('LFEA_WP2_UNAPPROVED_EVIDENCE_MUST_BE_NULL', { field: key });
      }
    }
    return deepFreeze({
      status,
      approverName: null,
      approverRole: null,
      organization: null,
      approvedAtUtc: null,
      evidenceReference: null,
      evidenceHash: null,
    });
  }
  const evidenceReference = requireText(
    value.evidenceReference,
    'engineeringApproval.evidenceReference',
  );
  requireAuthorityReference(evidenceReference, { evidenceReference });
  return deepFreeze({
    status,
    approverName: requireText(value.approverName, 'engineeringApproval.approverName'),
    approverRole: requireText(value.approverRole, 'engineeringApproval.approverRole'),
    organization: requireText(value.organization, 'engineeringApproval.organization'),
    approvedAtUtc: requireUtc(value.approvedAtUtc, 'engineeringApproval.approvedAtUtc'),
    evidenceReference,
    evidenceHash: requireHash(
      value.evidenceHash,
      'engineeringApproval.evidenceHash',
    ),
  });
}

function summarize(groups, engineeringApproval) {
  const unresolvedAuthorities = groups
    .filter((group) => group.resolution !== 'RESOLVED')
    .map((group) => group.groupId);
  const approvalPending = groups
    .filter((group) => group.approvalStatus !== 'APPROVED')
    .map((group) => group.groupId);
  if (engineeringApproval.status !== 'APPROVED') {
    approvalPending.push('ENGINEERING_APPROVAL');
  }
  const summary = {
    authorityGroupCount: groups.length,
    resolvedGroupCount: groups.length - unresolvedAuthorities.length,
    approvedGroupCount: groups.filter(
      (group) => group.approvalStatus === 'APPROVED',
    ).length,
    unresolvedAuthorities,
    approvalPending,
  };
  requireExactKeys(summary, SUMMARY_KEYS, 'LFEA_WP2_SUMMARY_INVALID');
  return deepFreeze(summary);
}

function statusFromSummary(summary) {
  if (summary.unresolvedAuthorities.length > 0) return 'WP2_INPUT_REQUIRED';
  if (summary.approvalPending.length > 0) return 'WP2_APPROVAL_REQUIRED';
  return 'WP2_COMPLETE';
}

function semanticMaterial(value) {
  return {
    schema: value.schema,
    repository: value.repository,
    candidate: value.candidate,
    indexId: value.indexId,
    revision: value.revision,
    preparedBy: value.preparedBy,
    authorityGroups: value.authorityGroups,
    engineeringApproval: {
      status: value.engineeringApproval.status,
      approverName: value.engineeringApproval.approverName,
      approverRole: value.engineeringApproval.approverRole,
      organization: value.engineeringApproval.organization,
      evidenceReference: value.engineeringApproval.evidenceReference,
      evidenceHash: value.engineeringApproval.evidenceHash,
    },
    summary: value.summary,
    wp2Status: value.wp2Status,
    releaseQualified: false,
  };
}

function requireAuthorityReference(value, evidence) {
  if (FORBIDDEN_AUTHORITY_REFERENCE.test(value)) {
    fail('LFEA_WP2_SHADOW_SOURCE_PROHIBITED', evidence);
  }
}

function requireExactKeys(value, expected, code) {
  if (!isPlainRecord(value)) fail(code);
  const actual = Object.keys(value).sort(compareAscii);
  const required = [...expected].sort(compareAscii);
  if (actual.length !== required.length
    || actual.some((key, index) => key !== required[index])) {
    fail(code, { actual, expected: required });
  }
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail('LFEA_WP2_TEXT_INVALID', { field, value });
  }
  return value.trim();
}

function requireHash(value, field) {
  const hash = requireText(value, field).toLowerCase();
  if (!HASH_PATTERN.test(hash)) {
    fail('LFEA_WP2_HASH_INVALID', { field, value });
  }
  return hash;
}

function requireUtc(value, field) {
  const timestamp = requireText(value, field);
  if (!ISO_UTC_PATTERN.test(timestamp)
    || Number.isNaN(Date.parse(timestamp))
    || new Date(timestamp).toISOString().replace('.000Z', 'Z') !== timestamp) {
    fail('LFEA_WP2_TIMESTAMP_INVALID', { field, value });
  }
  return timestamp;
}

function requireEnum(value, allowed, field) {
  if (!allowed.includes(value)) {
    fail('LFEA_WP2_ENUM_INVALID', { field, value, allowed });
  }
  return value;
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code, evidence = {}) {
  throw new ProjectAuthorityIndexError(code, evidence);
}
