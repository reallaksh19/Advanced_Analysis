#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PHASE6I_FROZEN_CANDIDATE,
  PHASE6I_IMMUTABLE_REF,
  PROJECT_AUTHORITY_GROUP_IDS,
  PROJECT_AUTHORITY_INDEX_TEMPLATE_SCHEMA,
  assertProjectAuthorityIndex,
  buildProjectAuthorityIndex,
  requireApprovedProjectAuthorityIndex,
} from './lfea-piping-phase6i-project-authority-index.mjs';

const TEMPLATE_PATH =
  'governance/lfea-piping-phase6i-project-authority-index.template.json';

function test(id, name, body) {
  body();
  console.log(`${id} PASS ${name}`);
}

function expectCode(body, code) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, code, `expected ${code}, received ${error?.code}`);
    return true;
  });
}

const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));

test('WP2-AUTH-01', 'Template retains exact candidate and authority inventory', () => {
  assert.equal(template.schema, PROJECT_AUTHORITY_INDEX_TEMPLATE_SCHEMA);
  assert.equal(template.candidate.sha, PHASE6I_FROZEN_CANDIDATE);
  assert.equal(template.candidate.ref, PHASE6I_IMMUTABLE_REF);
  assert.deepEqual(
    template.authorityGroups.map((group) => group.groupId),
    PROJECT_AUTHORITY_GROUP_IDS,
  );
  assert.equal(new Set(PROJECT_AUTHORITY_GROUP_IDS).size, 11);
});

test('WP2-AUTH-02', 'Unsigned unresolved template remains input required', () => {
  const record = buildProjectAuthorityIndex(inputFromTemplate());
  assert.equal(record.wp2Status, 'WP2_INPUT_REQUIRED');
  assert.equal(record.summary.unresolvedAuthorities.length, 11);
  assert.equal(record.summary.approvalPending.length, 12);
  assert.equal(record.releaseQualified, false);
  assertProjectAuthorityIndex(record);
  expectCode(
    () => requireApprovedProjectAuthorityIndex(record),
    'LFEA_WP2_INDEX_NOT_APPROVED',
  );
});

test('WP2-AUTH-03', 'Resolved groups without approvals remain approval required', () => {
  const input = inputFromTemplate();
  input.authorityGroups = resolvedGroups('NOT_APPROVED');
  const record = buildProjectAuthorityIndex(input);
  assert.equal(record.wp2Status, 'WP2_APPROVAL_REQUIRED');
  assert.deepEqual(record.summary.unresolvedAuthorities, []);
  assert.equal(record.summary.approvalPending.length, 12);
});

test('WP2-AUTH-04', 'Complete approved authority index is accepted without release promotion', () => {
  const record = buildProjectAuthorityIndex(approvedInput());
  assert.equal(record.wp2Status, 'WP2_COMPLETE');
  assert.deepEqual(record.summary.unresolvedAuthorities, []);
  assert.deepEqual(record.summary.approvalPending, []);
  assert.equal(record.releaseQualified, false);
  assert.equal(requireApprovedProjectAuthorityIndex(record), record);
});

test('WP2-AUTH-05', 'Candidate mismatch is rejected', () => {
  const input = approvedInput();
  input.candidate.sha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  expectCode(
    () => buildProjectAuthorityIndex(input),
    'LFEA_WP2_CANDIDATE_MISMATCH',
  );
});

test('WP2-AUTH-06', 'Missing authority group is rejected', () => {
  const input = approvedInput();
  input.authorityGroups.pop();
  expectCode(
    () => buildProjectAuthorityIndex(input),
    'LFEA_WP2_AUTHORITY_GROUP_COUNT_INVALID',
  );
});

test('WP2-AUTH-07', 'PR 371 shadow evidence cannot become WP-2 authority', () => {
  const input = approvedInput();
  input.authorityGroups[0].source.retainedReference =
    'src/workspace/engineering-enrichment/proposal.json';
  expectCode(
    () => buildProjectAuthorityIndex(input),
    'LFEA_WP2_SHADOW_SOURCE_PROHIBITED',
  );
  input.authorityGroups[0].source.retainedReference =
    'records/wp2/units.json';
  input.authorityGroups[0].source.sourceType = 'SHADOW_PROPOSAL';
  expectCode(
    () => buildProjectAuthorityIndex(input),
    'LFEA_WP2_ENUM_INVALID',
  );
  const approvalInput = approvedInput();
  approvalInput.engineeringApproval.evidenceReference =
    'records/PR-371/approval.json';
  expectCode(
    () => buildProjectAuthorityIndex(approvalInput),
    'LFEA_WP2_SHADOW_SOURCE_PROHIBITED',
  );
  const productionInput = approvedInput();
  productionInput.authorityGroups[0].source.title =
    'Production output inferred units';
  expectCode(
    () => buildProjectAuthorityIndex(productionInput),
    'LFEA_WP2_SHADOW_SOURCE_PROHIBITED',
  );
});

test('WP2-AUTH-08', 'Resolved non-applicability requires approval', () => {
  const input = approvedInput();
  input.authorityGroups[10].applicability = 'NOT_APPLICABLE';
  input.authorityGroups[10].approvalStatus = 'NOT_APPROVED';
  expectCode(
    () => buildProjectAuthorityIndex(input),
    'LFEA_WP2_NONAPPLICABILITY_NOT_APPROVED',
  );
});

test('WP2-AUTH-09', 'Tampered hashes or status cannot validate', () => {
  const record = structuredClone(buildProjectAuthorityIndex(approvedInput()));
  record.semanticHash = 'fnv1a64:0000000000000000';
  expectCode(
    () => assertProjectAuthorityIndex(record),
    'LFEA_WP2_INDEX_CANONICAL_MISMATCH',
  );
});

test('WP2-AUTH-10', 'Timestamps change evidence identity but not semantic identity', () => {
  const leftInput = approvedInput();
  const rightInput = approvedInput();
  rightInput.preparedAtUtc = '2026-08-02T13:25:00Z';
  rightInput.engineeringApproval.approvedAtUtc = '2026-08-02T13:20:00Z';
  const left = buildProjectAuthorityIndex(leftInput);
  const right = buildProjectAuthorityIndex(rightInput);
  assert.equal(left.semanticHash, right.semanticHash);
  assert.notEqual(left.evidenceHash, right.evidenceHash);
});

console.log(JSON.stringify({
  schema: 'lfea-piping-phase6i-project-authority-index-check-result/v1',
  status: 'PASS',
  authorityGroupCount: PROJECT_AUTHORITY_GROUP_IDS.length,
  approvedAuthorityCreated: false,
  engineeringValuesInferred: false,
  executedEngineeringCommands: false,
  releaseEvidenceEligible: false,
}));

function inputFromTemplate() {
  const { schema: _schema, ...input } = structuredClone(template);
  return input;
}

function approvedInput() {
  const input = inputFromTemplate();
  input.revision = 'REV-1';
  input.preparedBy = {
    name: 'Responsible Engineer',
    role: 'Piping Stress Engineer',
    organization: 'Project Engineering',
  };
  input.authorityGroups = resolvedGroups('APPROVED');
  input.engineeringApproval = {
    status: 'APPROVED',
    approverName: 'Responsible Piping Authority',
    approverRole: 'Lead Piping Stress Engineer',
    organization: 'Project Engineering',
    approvedAtUtc: '2026-08-02T12:20:00Z',
    evidenceReference: 'records/wp2/engineering-approval.json',
    evidenceHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  };
  return input;
}

function resolvedGroups(approvalStatus) {
  return PROJECT_AUTHORITY_GROUP_IDS.map((groupId, index) => ({
    groupId,
    applicability: 'APPLICABLE',
    resolution: 'RESOLVED',
    scopeDescription: `Approved authority scope for ${groupId}.`,
    source: {
      sourceType: sourceType(groupId),
      documentId: `WP2-SOURCE-${String(index + 1).padStart(2, '0')}`,
      title: `Controlled authority source for ${groupId}`,
      revision: 'REV-1',
      owner: 'Project Engineering',
      retainedReference:
        `records/wp2/source-${String(index + 1).padStart(2, '0')}.json`,
      sourceHash: `fnv1a64:${String(index + 1).padStart(16, '0')}`,
    },
    approvalStatus,
  }));
}

function sourceType(groupId) {
  if (groupId === 'REPRESENTATIVE_REAL_PROJECT_MODEL') return 'CONTROLLED_MODEL';
  if (groupId === 'NOZZLE_ALLOWABLE_PROFILES') return 'VENDOR_DOCUMENT';
  if (groupId === 'B31_3_AUTHORITY') return 'CODE_DATASET';
  if (groupId === 'MATERIAL_ASSIGNMENTS'
    || groupId === 'PIPE_AND_SECTION_PROPERTIES'
    || groupId === 'RESTRAINTS_SPRINGS_AND_PRESCRIBED_MOVEMENTS') {
    return 'APPROVED_ENGINEERING_REGISTER';
  }
  return 'PROJECT_DOCUMENT';
}
