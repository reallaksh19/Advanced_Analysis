#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  PHASE6I_FROZEN_CANDIDATE,
  PHASE6I_IMMUTABLE_REF,
  requirePhase6iGovernanceClosureDecision,
  requirePhase6iIndependentClosureAcceptance,
} from '../src/core/linear-piping-project-qualification/index.js';

const MODULE_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(MODULE_PATH), '..');
const PLAN_SCHEMA = 'lfea-piping-phase6i-governance-recording-plan/v1';
const LEDGER_RELATIVE = 'reports/lfea-piping-phase-findings-ledger.json';
const RELEASE_RELATIVE = 'release-evidence/lfea-piping-release-evidence.json';
const RUN_ID_PATTERN = /^\d+$/u;
const INELIGIBLE_ROOTS = Object.freeze([
  'e2e', 'script', 'scripts', 'test', 'tests', 'fixture', 'fixtures', 'mock', 'mocks',
]);

if (path.resolve(process.argv[1] ?? '') === MODULE_PATH) {
  const options = parseInvocation(process.argv.slice(2));
  const result = prepareGovernanceRecordingPlan(options);
  console.log(JSON.stringify(result));
}

export function parseInvocation(args) {
  const required = new Set([
    'acceptance', 'acceptance-artifact-name', 'acceptance-root',
    'acceptance-run-id', 'decision', 'decision-artifact-name',
    'decision-root', 'decision-run-id', 'expected-head', 'output',
  ]);
  const values = new Map();
  for (const argument of args) {
    if (!argument.startsWith('--') || !argument.includes('=')) {
      fail('LFEA_WP9_OPTION_INVALID', { argument });
    }
    const separator = argument.indexOf('=');
    const key = argument.slice(2, separator);
    const value = argument.slice(separator + 1);
    if (!required.has(key) || values.has(key) || value.trim() === '') {
      fail('LFEA_WP9_OPTION_INVALID', { argument });
    }
    values.set(key, value);
  }
  const missing = [...required].filter((key) => !values.has(key));
  if (missing.length > 0) fail('LFEA_WP9_OPTIONS_MISSING', { missing });
  const expectedHead = values.get('expected-head');
  if (expectedHead !== PHASE6I_FROZEN_CANDIDATE) {
    fail('LFEA_WP9_EXPECTED_HEAD_INVALID', { expectedHead });
  }
  for (const key of ['acceptance-run-id', 'decision-run-id']) {
    if (!RUN_ID_PATTERN.test(values.get(key))) {
      fail('LFEA_WP9_RUN_ID_INVALID', { key, value: values.get(key) });
    }
  }
  return Object.freeze({
    repositoryRoot: REPOSITORY_ROOT,
    acceptanceRoot: path.resolve(values.get('acceptance-root')),
    acceptancePath: values.get('acceptance'),
    acceptanceRunId: values.get('acceptance-run-id'),
    acceptanceArtifactName: values.get('acceptance-artifact-name'),
    decisionRoot: path.resolve(values.get('decision-root')),
    decisionPath: values.get('decision'),
    decisionRunId: values.get('decision-run-id'),
    decisionArtifactName: values.get('decision-artifact-name'),
    outputPath: path.resolve(values.get('output')),
    expectedHead,
  });
}

export function prepareGovernanceRecordingPlan({
  repositoryRoot = REPOSITORY_ROOT,
  acceptanceRoot,
  acceptancePath,
  acceptanceRunId,
  acceptanceArtifactName,
  decisionRoot,
  decisionPath,
  decisionRunId,
  decisionArtifactName,
  outputPath,
  expectedHead,
  acceptanceValidator = requirePhase6iIndependentClosureAcceptance,
  decisionValidator = requirePhase6iGovernanceClosureDecision,
}) {
  if (expectedHead !== PHASE6I_FROZEN_CANDIDATE) {
    fail('LFEA_WP9_EXPECTED_HEAD_INVALID', { expectedHead });
  }
  requireRunIdentity(acceptanceRunId, acceptanceArtifactName, 'ACCEPTANCE');
  requireRunIdentity(decisionRunId, decisionArtifactName, 'DECISION');
  if (acceptanceRunId === decisionRunId) {
    fail('LFEA_WP9_GOVERNANCE_CUSTODY_NOT_INDEPENDENT');
  }

  const repository = requireDirectory(repositoryRoot, 'LFEA_WP9_REPOSITORY_INVALID');
  const acceptanceSource = requireDirectory(
    acceptanceRoot,
    'LFEA_WP9_ACCEPTANCE_ROOT_INVALID',
  );
  const decisionSource = requireDirectory(
    decisionRoot,
    'LFEA_WP9_DECISION_ROOT_INVALID',
  );
  requireSeparatedRoots(repository, acceptanceSource, decisionSource);
  const output = requireNewOutput(
    repository,
    acceptanceSource,
    decisionSource,
    outputPath,
  );

  const acceptanceRelative = requireSafeJsonPath(
    acceptancePath,
    'LFEA_WP9_ACCEPTANCE_PATH_INVALID',
  );
  const decisionRelative = requireSafeJsonPath(
    decisionPath,
    'LFEA_WP9_DECISION_PATH_INVALID',
  );
  const acceptance = acceptanceValidator(readJson(
    resolveSourceFile(acceptanceSource, acceptanceRelative),
    'LFEA_WP9_ACCEPTANCE_JSON_INVALID',
  ));
  const governanceDecision = decisionValidator(readJson(
    resolveSourceFile(decisionSource, decisionRelative),
    'LFEA_WP9_DECISION_JSON_INVALID',
  ));
  const findingsLedger = readJson(
    resolveRepositoryFile(repository, LEDGER_RELATIVE),
    'LFEA_WP9_FINDINGS_LEDGER_JSON_INVALID',
  );
  const releaseTemplate = readJson(
    resolveRepositoryFile(repository, RELEASE_RELATIVE),
    'LFEA_WP9_RELEASE_TEMPLATE_JSON_INVALID',
  );

  requireCustodyConsistency({
    expectedHead,
    acceptance,
    acceptanceRelative,
    acceptanceRunId,
    acceptanceArtifactName,
    governanceDecision,
    decisionRunId,
  });
  const baseline = requireRecordingBaseline(findingsLedger, releaseTemplate);

  const base = Object.freeze({
    schema: PLAN_SCHEMA,
    status: 'ELIGIBLE_FOR_AUTHORIZED_GOVERNANCE_RECORDING',
    candidateSha: expectedHead,
    immutableRef: PHASE6I_IMMUTABLE_REF,
    acceptanceRunId,
    acceptanceArtifactName,
    acceptancePath: acceptanceRelative,
    acceptanceContentHash: semanticHash(acceptance),
    acceptanceSemanticHash: acceptance.semanticHash,
    acceptanceEvidenceHash: acceptance.evidenceHash,
    governanceRunId: decisionRunId,
    governanceArtifactName: decisionArtifactName,
    governanceDecisionPath: decisionRelative,
    governanceDecisionContentHash: semanticHash(governanceDecision),
    governanceDecisionSemanticHash: governanceDecision.semanticHash,
    governanceDecisionEvidenceHash: governanceDecision.evidenceHash,
    governanceAuthorityId: governanceDecision.authority.authorityId,
    findingsLedger: {
      path: LEDGER_RELATIVE,
      baselineContentHash: semanticHash(findingsLedger),
      phaseId: baseline.phase.phaseId,
      phaseStatusFrom: baseline.phase.status,
      phaseStatusTo: 'VERIFIED',
      phaseCompletedAtUtcTo: governanceDecision.decisionTimestampUtc,
      findingId: baseline.finding.findingId,
      findingStatusFrom: baseline.finding.currentStatus,
      findingStatusTo: 'VERIFIED',
      remainingConditionTo: null,
    },
    issueRecording: {
      issueNumber: governanceDecision.recordingTarget.issueNumber,
      requestedState: 'CLOSED',
      stateReason: 'completed',
    },
    releasePolicyTemplate: {
      path: RELEASE_RELATIVE,
      baselineContentHash: semanticHash(releaseTemplate),
      action: 'NO_CHANGE_BLOCKED_POLICY_TEMPLATE',
    },
    recordingInstructions: {
      requiresSeparateAuthorizedCommit: true,
      requiresSeparateAuthorizedIssueAction: true,
      acceptanceMustBeRetained: true,
      governanceDecisionMustBeRetained: true,
    },
    repositoryMutationPerformed: false,
    issueMutationPerformed: false,
    releaseQualified: false,
  });
  const semantic = semanticHash(base);
  const result = Object.freeze({
    ...base,
    semanticHash: semantic,
    evidenceHash: semanticHash({ ...base, semanticHash: semantic }),
  });
  writeJson(output, result);
  return result;
}

function requireCustodyConsistency({
  expectedHead,
  acceptance,
  acceptanceRelative,
  acceptanceRunId,
  acceptanceArtifactName,
  governanceDecision,
  decisionRunId,
}) {
  if (acceptance.candidateSha !== expectedHead
    || governanceDecision.candidateSha !== expectedHead) {
    fail('LFEA_WP9_CANDIDATE_MISMATCH');
  }
  const reference = governanceDecision.acceptanceReference;
  if (reference.runId !== acceptanceRunId
    || reference.artifactName !== acceptanceArtifactName
    || reference.path !== acceptanceRelative
    || reference.contentHash !== semanticHash(acceptance)
    || reference.semanticHash !== acceptance.semanticHash
    || reference.evidenceHash !== acceptance.evidenceHash) {
    fail('LFEA_WP9_ACCEPTANCE_IDENTITY_MISMATCH');
  }
  if (governanceDecision.authority.authorityId === acceptance.reviewerId) {
    fail('LFEA_WP9_GOVERNANCE_AUTHORITY_NOT_INDEPENDENT');
  }
  const priorRuns = new Set([
    acceptanceRunId,
    acceptance.certificationRunId,
    acceptance.reviewRunId,
  ]);
  if (priorRuns.has(decisionRunId)) {
    fail('LFEA_WP9_GOVERNANCE_CUSTODY_NOT_INDEPENDENT', { decisionRunId });
  }
}

function requireRecordingBaseline(findingsLedger, releaseTemplate) {
  if (findingsLedger.schema !== 'lfea-piping-phase-findings-ledger/v1'
    || findingsLedger.repository !== 'reallaksh19/Advanced_Analysis'
    || findingsLedger.program !== 'PRIORITY_2_LINEAR_PIPING_FEA'
    || !Array.isArray(findingsLedger.phases)
    || !Array.isArray(findingsLedger.findings)) {
    fail('LFEA_WP9_FINDINGS_LEDGER_BASELINE_INVALID');
  }
  const phases = findingsLedger.phases.filter(
    (entry) => entry?.phaseId === 'PHASE_6_PROJECT_QUALIFICATION',
  );
  const findings = findingsLedger.findings.filter(
    (entry) => entry?.findingId === 'AUD-A7-001',
  );
  if (phases.length !== 1 || findings.length !== 1) {
    fail('LFEA_WP9_FINDINGS_LEDGER_TARGET_INVALID');
  }
  const [phase] = phases;
  const [finding] = findings;
  if (phase.status !== 'UNRESOLVED_GATE'
    || phase.completedAtUtc !== null
    || finding.currentStatus !== 'UNRESOLVED_GATE'
    || finding.ownerPhase !== phase.phaseId
    || typeof finding.remainingCondition !== 'string'
    || finding.remainingCondition.trim() === '') {
    fail('LFEA_WP9_FINDINGS_LEDGER_STATE_INVALID');
  }

  if (releaseTemplate.schema !== 'lfea-piping-release-evidence/v1'
    || releaseTemplate.program !== 'PRIORITY_2_LINEAR_PIPING_FEA_APPLICATION_CHAIN'
    || releaseTemplate.programDisposition !== 'BLOCKED'
    || releaseTemplate.exactHead !== null
    || !releaseTemplate.gates
    || Object.values(releaseTemplate.gates).some((status) => status === 'VERIFIED')
    || !releaseTemplate.artifacts
    || Object.values(releaseTemplate.artifacts).some((value) => value !== null)) {
    fail('LFEA_WP9_RELEASE_TEMPLATE_BASELINE_INVALID');
  }
  return Object.freeze({ phase, finding });
}

function requireRunIdentity(runId, artifactName, kind) {
  if (!RUN_ID_PATTERN.test(runId ?? '')
    || typeof artifactName !== 'string'
    || artifactName.trim() === ''
    || /[\\/]/u.test(artifactName)) {
    fail(`LFEA_WP9_${kind}_IDENTITY_INVALID`, { runId, artifactName });
  }
}

function requireSeparatedRoots(repository, acceptance, decision) {
  if (acceptance === decision
    || isWithin(repository, acceptance)
    || isWithin(acceptance, repository)
    || isWithin(repository, decision)
    || isWithin(decision, repository)) {
    fail('LFEA_WP9_ROOT_OVERLAP');
  }
}

function requireSafeJsonPath(value, code) {
  if (typeof value !== 'string' || value.trim() === '') fail(code, { value });
  const normalized = value.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (path.posix.isAbsolute(normalized)
    || /^[A-Za-z]:\//u.test(normalized)
    || segments.some((segment) => segment === '' || segment === '.' || segment === '..')
    || INELIGIBLE_ROOTS.includes(segments[0].toLowerCase())
    || !normalized.toLowerCase().endsWith('.json')) {
    fail(code, { value });
  }
  return normalized;
}

function requireDirectory(value, code) {
  const absolute = path.resolve(value);
  if (!fs.existsSync(absolute)) fail(code, { value });
  const status = fs.lstatSync(absolute);
  if (status.isSymbolicLink() || !status.isDirectory()) fail(code, { value });
  return fs.realpathSync(absolute);
}

function resolveSourceFile(root, relativePath) {
  const absolute = path.resolve(root, ...relativePath.split('/'));
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(absolute)) {
    fail('LFEA_WP9_SOURCE_FILE_INVALID', { relativePath });
  }
  const status = fs.lstatSync(absolute);
  if (status.isSymbolicLink() || !status.isFile()) {
    fail('LFEA_WP9_SOURCE_FILE_INVALID', { relativePath });
  }
  const real = fs.realpathSync(absolute);
  const realRelative = path.relative(root, real);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    fail('LFEA_WP9_SOURCE_FILE_INVALID', { relativePath });
  }
  return real;
}

function resolveRepositoryFile(repository, relativePath) {
  const absolute = path.resolve(repository, ...relativePath.split('/'));
  const relative = path.relative(repository, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(absolute)) {
    fail('LFEA_WP9_REPOSITORY_BASELINE_MISSING', { relativePath });
  }
  const status = fs.lstatSync(absolute);
  if (status.isSymbolicLink() || !status.isFile()) {
    fail('LFEA_WP9_REPOSITORY_BASELINE_INVALID', { relativePath });
  }
  return fs.realpathSync(absolute);
}

function requireNewOutput(repository, acceptance, decision, outputPath) {
  const output = path.resolve(outputPath);
  if (fs.existsSync(output)) fail('LFEA_WP9_OUTPUT_EXISTS', { output });
  const parent = requireDirectory(path.dirname(output), 'LFEA_WP9_OUTPUT_PARENT_INVALID');
  const resolved = path.join(parent, path.basename(output));
  for (const root of [repository, acceptance, decision]) {
    if (isWithin(root, resolved) || isWithin(resolved, root)) {
      fail('LFEA_WP9_OUTPUT_OVERLAP', { output: resolved, root });
    }
  }
  return resolved;
}

function readJson(filePath, code) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(code, { filePath, message: error.message });
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function fail(code, evidence = {}) {
  const error = new Error(code);
  error.code = code;
  error.evidence = evidence;
  throw error;
}
