#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  PHASE6I_FROZEN_CANDIDATE,
  PHASE6I_IMMUTABLE_REF,
  sealPhase6iExternalEvidenceHandoff,
} from '../src/core/linear-piping-project-qualification/index.js';
import {
  parseExternalHandoffValidationInvocation,
  validatePhase6iExternalEvidenceHandoff,
} from './lfea-piping-phase6i-external-handoff-validator.mjs';

console.log('[SIMULATED][INELIGIBLE_FOR_PROJECT_EVIDENCE][NO_ENGINEERING_COMMAND_EXECUTION]');

const SOURCE_RUN_ID = '30750000001';
const SOURCE_ARTIFACT_NAME = 'lfea-piping-wp3-source-617f7c2';
const HANDOFF_PATH = 'request/external-evidence-handoff.json';
const REQUEST_PATH = 'request/external-materialization-request.json';
const AUTHORITY_PATH = 'records/project-authority-index.json';
const RECORD_KEYS = Object.freeze([
  'applicationResult',
  'presentation',
  'realModelReconciliation',
  'commercialCorroboration',
  'performanceEvidence',
  'rollbackEvidence',
  'reviewDisposition',
]);

const parsed = parseExternalHandoffValidationInvocation([
  `--expected-head=${PHASE6I_FROZEN_CANDIDATE}`,
  `--handoff=${HANDOFF_PATH}`,
  '--input-root=/tmp/input',
  '--output=/tmp/acceptance.json',
  `--request=${REQUEST_PATH}`,
  `--source-artifact-name=${SOURCE_ARTIFACT_NAME}`,
  `--source-run-id=${SOURCE_RUN_ID}`,
]);
assert.equal(parsed.expectedHead, PHASE6I_FROZEN_CANDIDATE);
assert.equal(parsed.handoffPath, HANDOFF_PATH);
assert.throws(
  () => parseExternalHandoffValidationInvocation(['--output=/tmp/out.json']),
  hasCode('LFEA_WP3_HANDOFF_OPTIONS_MISSING'),
);

await test('WP3-HANDOFF-01', 'Complete source handoff is accepted for Phase 6H', () => {
  const fixture = buildFixture('success');
  try {
    const output = path.join(fixture.root, 'acceptance.json');
    const result = validate(fixture, output);
    assert.equal(result.status, 'HANDOFF_ACCEPTED_FOR_PHASE6H');
    assert.equal(result.candidateSha, PHASE6I_FROZEN_CANDIDATE);
    assert.equal(result.sourceRunId, SOURCE_RUN_ID);
    assert.equal(result.sourceArtifactName, SOURCE_ARTIFACT_NAME);
    assert.equal(result.sourceHandoffPath, 'external/source-handoff.json');
    assert.equal(result.sourceRequestPath, 'external/source-materialization-request.json');
    assert.equal(result.projectAuthorityIndexPath, 'external/project-authority-index.json');
    assert.equal(result.recordCount, 7);
    assert.equal(result.releaseQualified, false);
    assert.deepEqual(readJson(output), result);
  } finally {
    cleanup(fixture);
  }
});

await test('WP3-HANDOFF-02', 'Dispatch run identity mismatch fails closed', () => {
  const fixture = buildFixture('run-mismatch');
  try {
    expectCode(
      () => validate(fixture, path.join(fixture.root, 'acceptance.json'), {
        sourceRunId: '30750000002',
      }),
      'LFEA_WP3_HANDOFF_DISPATCH_IDENTITY_MISMATCH',
    );
  } finally {
    cleanup(fixture);
  }
});

await test('WP3-HANDOFF-03', 'Request tampering after handoff fails closed', () => {
  const fixture = buildFixture('request-tamper');
  try {
    fixture.request.packageId = 'CHANGED-PACKAGE-ID';
    writeJson(fixture.requestFile, fixture.request);
    expectCode(
      () => validate(fixture, path.join(fixture.root, 'acceptance.json')),
      'LFEA_WP3_HANDOFF_REQUEST_CONTENT_HASH_MISMATCH',
    );
  } finally {
    cleanup(fixture);
  }
});

await test('WP3-HANDOFF-04', 'Stale WP2 authority identity fails closed', () => {
  const fixture = buildFixture('authority-mismatch');
  try {
    fixture.authority.evidenceHash = 'fnv1a64:ffffffffffffffff';
    writeJson(fixture.authorityFile, fixture.authority);
    expectCode(
      () => validate(fixture, path.join(fixture.root, 'acceptance.json')),
      'LFEA_WP3_HANDOFF_AUTHORITY_IDENTITY_MISMATCH',
    );
  } finally {
    cleanup(fixture);
  }
});

await test('WP3-HANDOFF-05', 'Missing source record blocks handoff acceptance', () => {
  const fixture = buildFixture('record-missing');
  try {
    fs.rmSync(path.join(
      fixture.inputRoot,
      fixture.request.records.commercialCorroboration,
    ));
    expectCode(
      () => validate(fixture, path.join(fixture.root, 'acceptance.json')),
      'LFEA_WP3_HANDOFF_SOURCE_FILE_INVALID',
    );
  } finally {
    cleanup(fixture);
  }
});

await test('WP3-HANDOFF-06', 'Record without current identity is rejected', () => {
  const fixture = buildFixture('record-identity');
  try {
    const recordPath = path.join(
      fixture.inputRoot,
      fixture.request.records.performanceEvidence,
    );
    writeJson(recordPath, { schema: 'synthetic-performance/v1' });
    expectCode(
      () => validate(fixture, path.join(fixture.root, 'acceptance.json')),
      'LFEA_WP3_HANDOFF_RECORD_IDENTITY_INVALID',
    );
  } finally {
    cleanup(fixture);
  }
});

await test('WP3-HANDOFF-07', 'Existing acceptance output is never overwritten', () => {
  const fixture = buildFixture('existing-output');
  try {
    const output = path.join(fixture.root, 'acceptance.json');
    fs.writeFileSync(output, 'existing\n');
    expectCode(
      () => validate(fixture, output),
      'LFEA_WP3_HANDOFF_OUTPUT_EXISTS',
    );
    assert.equal(fs.readFileSync(output, 'utf8'), 'existing\n');
  } finally {
    cleanup(fixture);
  }
});

console.log(JSON.stringify({
  schema: 'lfea-piping-phase6i-external-handoff-validator-check-result/v1',
  status: 'PASS',
  executedEngineeringCommands: false,
  projectEvidenceEligible: false,
  releaseQualified: false,
}));

function buildFixture(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `lfea-wp3-handoff-${label}-`));
  const repositoryRoot = path.join(root, 'repository');
  const inputRoot = path.join(root, 'source');
  fs.mkdirSync(repositoryRoot, { recursive: true });
  fs.mkdirSync(inputRoot, { recursive: true });
  const authority = {
    candidate: {
      sha: PHASE6I_FROZEN_CANDIDATE,
      ref: PHASE6I_IMMUTABLE_REF,
    },
    semanticHash: 'fnv1a64:1111111111111111',
    evidenceHash: 'fnv1a64:2222222222222222',
  };
  const recordPaths = Object.freeze(Object.fromEntries(RECORD_KEYS.map((recordKey) => [
    recordKey,
    `records/${recordKey}.json`,
  ])));
  const request = {
    schema: 'lfea-piping-external-materialization-request/v2',
    packageId: 'PROJECT-QUALIFICATION-PACKAGE-001',
    exactHead: PHASE6I_FROZEN_CANDIDATE,
    projectAuthorityIndex: AUTHORITY_PATH,
    records: recordPaths,
  };
  const handoff = sealPhase6iExternalEvidenceHandoff({
    schema: 'lfea-piping-phase6i-external-evidence-handoff/v1',
    candidateSha: PHASE6I_FROZEN_CANDIDATE,
    candidateRef: PHASE6I_IMMUTABLE_REF,
    wp2Status: 'WP2_COMPLETE',
    wp3Status: 'WP3_COMPLETE',
    g8G9Independence: 'CONFIRMED',
    sourceRunId: SOURCE_RUN_ID,
    sourceArtifactName: SOURCE_ARTIFACT_NAME,
    requestPath: REQUEST_PATH,
    recordCount: 7,
    unresolvedAuthorities: [],
    projectAuthorityIndexSemanticHash: authority.semanticHash,
    projectAuthorityIndexEvidenceHash: authority.evidenceHash,
    requestContentHash: semanticHash(request),
    releaseQualified: false,
    semanticHash: '',
    evidenceHash: '',
  });
  const authorityFile = path.join(inputRoot, AUTHORITY_PATH);
  const requestFile = path.join(inputRoot, REQUEST_PATH);
  writeJson(authorityFile, authority);
  writeJson(requestFile, request);
  writeJson(path.join(inputRoot, HANDOFF_PATH), handoff);
  RECORD_KEYS.forEach((recordKey, index) => {
    writeJson(path.join(inputRoot, recordPaths[recordKey]), {
      schema: `synthetic-${recordKey}/v1`,
      semanticHash: `fnv1a64:${(index + 3).toString(16).repeat(16)}`.slice(0, 24),
      evidenceHash: `fnv1a64:${(index + 10).toString(16).repeat(16)}`.slice(0, 24),
    });
  });
  return {
    root,
    repositoryRoot,
    inputRoot,
    authority,
    authorityFile,
    request,
    requestFile,
  };
}

function validate(fixture, outputPath, overrides = {}) {
  return validatePhase6iExternalEvidenceHandoff({
    repositoryRoot: fixture.repositoryRoot,
    inputRoot: fixture.inputRoot,
    handoffPath: HANDOFF_PATH,
    requestPath: REQUEST_PATH,
    outputPath,
    expectedHead: PHASE6I_FROZEN_CANDIDATE,
    sourceRunId: overrides.sourceRunId ?? SOURCE_RUN_ID,
    sourceArtifactName: overrides.sourceArtifactName ?? SOURCE_ARTIFACT_NAME,
    authorityValidator: (record) => Object.freeze(record),
  });
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function expectCode(body, code) {
  assert.throws(body, hasCode(code));
}

function hasCode(code) {
  return (error) => error?.code === code;
}

function cleanup(fixture) {
  fs.rmSync(fixture.root, { recursive: true, force: true });
}

async function test(id, name, body) {
  await body();
  console.log(`${id} PASS ${name}`);
}
