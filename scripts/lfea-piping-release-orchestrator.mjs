import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(MODULE_PATH), '..');
const POLICY_MANIFEST_PATH = path.join(
  ROOT,
  'release-evidence/lfea-piping-release-evidence.json',
);
const RELEASE_SCHEMA = 'lfea-piping-release-evidence/v1';
const RELEASE_PROGRAM = 'PRIORITY_2_LINEAR_PIPING_FEA_APPLICATION_CHAIN';
const HEAD_PATTERN = /^[0-9a-f]{40}$/u;
const RELEASE_STATUSES = Object.freeze([
  'VERIFIED',
  'PARTIALLY_VERIFIED',
  'CONTRADICTED',
  'UNRESOLVED_GATE',
  'NOT_IMPLEMENTED',
  'NOT_APPLICABLE',
]);
const REQUIRED_GATES = Object.freeze([
  'G0_EXACT_HEAD',
  'G1_UPSTREAM_NUMERICAL_CHAIN',
  'G2_T0_APPLICATION_SEQUENCING',
  'G3_SOURCE_ORCHESTRATION',
  'G4_INTERFACES',
  'G5_INTERFACE_RECOVERY',
  'G6_CODE_AND_ALLOWABLES',
  'G7_PRESENTATION_EXPORT',
  'G8_REAL_MODEL_RECONCILIATION',
  'G9_COMMERCIAL_CORROBORATION',
  'G10_RELEASE_ROLLBACK',
]);
const REQUIRED_ARTIFACTS = Object.freeze([
  'exactHeadManifest',
  'upstreamGateLog',
  't0GateLog',
  'sourceOrchestrationEvidence',
  'interfaceEvidence',
  'interfaceRecoveryEvidence',
  'codeAndAllowableEvidence',
  'presentationExportEvidence',
  'realModelReconciliation',
  'commercialCorroboration',
  'performanceEvidence',
  'rollbackEvidence',
  'signedDisposition',
  'externalQualificationPackage',
]);
const RELEASE_OPTION_KEYS = Object.freeze([
  'evidence-root',
  'expected-head',
  'manifest',
]);

export function parseReleaseInvocation(args, cwd) {
  const releaseMode = args.includes('--release');
  const options = new Map();
  for (const argument of args) {
    if (argument === '--release') continue;
    if (!argument.startsWith('--') || !argument.includes('=')) {
      fail('LFEA_RELEASE_OPTION_INVALID', { argument });
    }
    const separator = argument.indexOf('=');
    const key = argument.slice(2, separator);
    const value = argument.slice(separator + 1);
    if (!RELEASE_OPTION_KEYS.includes(key) || options.has(key) || value.trim() === '') {
      fail('LFEA_RELEASE_OPTION_INVALID', { argument });
    }
    options.set(key, value);
  }

  if (!releaseMode && options.size > 0) {
    fail('LFEA_RELEASE_OPTIONS_REQUIRE_RELEASE_MODE', {
      options: [...options.keys()].sort(compareAscii),
    });
  }
  if (!releaseMode) {
    return Object.freeze({
      releaseMode: false,
      manifestPath: POLICY_MANIFEST_PATH,
      evidenceRoot: ROOT,
      expectedHead: null,
    });
  }

  const missing = RELEASE_OPTION_KEYS.filter((key) => !options.has(key));
  if (missing.length > 0) {
    fail('LFEA_RELEASE_RUNTIME_OPTIONS_MISSING', { missing });
  }
  const expectedHead = options.get('expected-head');
  if (!HEAD_PATTERN.test(expectedHead)) {
    fail('LFEA_RELEASE_EXPECTED_HEAD_INVALID', { expectedHead });
  }
  const evidenceRoot = resolveEvidenceRoot(cwd, options.get('evidence-root'));
  const manifestPath = resolveRuntimeManifestPath(
    evidenceRoot,
    options.get('manifest'),
  );
  return Object.freeze({
    releaseMode: true,
    manifestPath,
    evidenceRoot,
    expectedHead,
  });
}

export function loadReleaseEvidence(invocation) {
  return Object.freeze({
    root: invocation.evidenceRoot,
    evidence: readJson(
      invocation.manifestPath,
      invocation.releaseMode
        ? 'LFEA_RELEASE_RUNTIME_MANIFEST_JSON_INVALID'
        : 'LFEA_RELEASE_EVIDENCE_JSON_INVALID',
    ),
  });
}

export async function evaluateReleaseReadiness({
  root,
  evidence,
  releaseMode,
  expectedHead,
  validators,
  policyRunner,
}) {
  validateReleaseManifestShape(evidence);
  if (!releaseMode) {
    if (evidence.programDisposition !== 'BLOCKED') {
      fail('LFEA_PRE_RELEASE_DISPOSITION_MUST_BE_BLOCKED', {
        programDisposition: evidence.programDisposition,
      });
    }
    if (typeof policyRunner !== 'function') fail('LFEA_RELEASE_POLICY_RUNNER_INVALID');
    await policyRunner();
    return summary({
      mode: 'POLICY',
      evidence,
      internal: null,
      external: null,
    });
  }

  validateReleaseCandidate(evidence, expectedHead);
  requireValidators(validators);
  const internal = validators.internal({
    root,
    ledger: evidence,
    releaseMode: true,
  });
  const external = validators.external({
    root,
    ledger: evidence,
    releaseMode: true,
  });
  requireEligibleIntake(internal, 'INTERNAL', evidence.exactHead);
  requireEligibleIntake(external, 'EXTERNAL', evidence.exactHead);
  return summary({ mode: 'RELEASE', evidence, internal, external });
}

function validateReleaseManifestShape(evidence) {
  requireExactKeys(evidence, [
    'schema',
    'program',
    'programDisposition',
    'exactHead',
    'gates',
    'artifacts',
  ], 'LFEA_RELEASE_EVIDENCE_KEYS_INVALID');
  if (evidence.schema !== RELEASE_SCHEMA) fail('LFEA_RELEASE_EVIDENCE_SCHEMA_INVALID');
  if (evidence.program !== RELEASE_PROGRAM) fail('LFEA_RELEASE_PROGRAM_INVALID');
  requireExactKeys(evidence.gates, REQUIRED_GATES, 'LFEA_RELEASE_GATE_KEYS_INVALID');
  requireExactKeys(
    evidence.artifacts,
    REQUIRED_ARTIFACTS,
    'LFEA_RELEASE_ARTIFACT_KEYS_INVALID',
  );
  for (const [gate, status] of Object.entries(evidence.gates)) {
    if (!RELEASE_STATUSES.includes(status)) {
      fail('LFEA_RELEASE_GATE_STATUS_INVALID', { gate, status });
    }
  }
}

function validateReleaseCandidate(evidence, expectedHead) {
  if (!HEAD_PATTERN.test(evidence.exactHead ?? '')) {
    fail('LFEA_RELEASE_EXACT_HEAD_REQUIRED', { exactHead: evidence.exactHead });
  }
  if (evidence.exactHead !== expectedHead) {
    fail('LFEA_RELEASE_CHECKOUT_HEAD_MISMATCH', {
      expectedHead,
      manifestHead: evidence.exactHead,
    });
  }
  const unverified = Object.entries(evidence.gates)
    .filter(([, status]) => status !== 'VERIFIED')
    .map(([gate, status]) => ({ gate, status }));
  if (unverified.length > 0) {
    fail('LFEA_RELEASE_GATES_NOT_VERIFIED', { unverified });
  }
  const missingArtifacts = Object.entries(evidence.artifacts)
    .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
    .map(([artifact]) => artifact);
  if (missingArtifacts.length > 0) {
    fail('LFEA_RELEASE_ARTIFACTS_MISSING', { missingArtifacts });
  }
  if (evidence.programDisposition !== 'QUALIFIED') {
    fail('LFEA_RELEASE_DISPOSITION_NOT_QUALIFIED', {
      programDisposition: evidence.programDisposition,
    });
  }
}

function requireValidators(value) {
  if (!value || typeof value.internal !== 'function' || typeof value.external !== 'function') {
    fail('LFEA_RELEASE_VALIDATORS_INVALID');
  }
}

function requireEligibleIntake(value, kind, exactHead) {
  if (!value
    || value.status !== 'ELIGIBLE_FOR_RELEASE_REVIEW'
    || value.releaseEligible !== true
    || value.exactHead !== exactHead) {
    fail(`LFEA_RELEASE_${kind}_INTAKE_INVALID`, {
      status: value?.status,
      releaseEligible: value?.releaseEligible,
      intakeHead: value?.exactHead,
      exactHead,
    });
  }
}

function summary({ mode, evidence, internal, external }) {
  return Object.freeze({
    check: 'lfea-piping-release-readiness',
    mode,
    programDisposition: evidence.programDisposition,
    exactHead: evidence.exactHead,
    verifiedGateCount: Object.values(evidence.gates)
      .filter((status) => status === 'VERIFIED').length,
    totalGateCount: REQUIRED_GATES.length,
    releaseEligible: mode === 'RELEASE',
    qualificationHarness: mode === 'RELEASE'
      ? 'PERSISTED_RELEASE_EVIDENCE'
      : 'SIMULATED_FIXTURES_ONLY',
    internalManifestSemanticHash: internal?.manifestSemanticHash ?? null,
    externalPackageSemanticHash: external?.packageSemanticHash ?? null,
  });
}

function resolveEvidenceRoot(cwd, value) {
  const absolutePath = path.resolve(cwd, value);
  if (!fs.existsSync(absolutePath)) {
    fail('LFEA_RELEASE_EVIDENCE_ROOT_MISSING', { value });
  }
  const status = fs.lstatSync(absolutePath);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    fail('LFEA_RELEASE_EVIDENCE_ROOT_INVALID', { value });
  }
  return fs.realpathSync(absolutePath);
}

function resolveRuntimeManifestPath(root, relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  if (path.posix.isAbsolute(normalized)
    || /^[A-Za-z]:\//u.test(normalized)
    || normalized.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
    || !normalized.toLowerCase().endsWith('.json')) {
    fail('LFEA_RELEASE_RUNTIME_MANIFEST_PATH_INVALID', { relativePath });
  }
  const absolutePath = path.resolve(root, ...normalized.split('/'));
  const relativeToRoot = path.relative(root, absolutePath);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    fail('LFEA_RELEASE_RUNTIME_MANIFEST_PATH_INVALID', { relativePath });
  }
  if (!fs.existsSync(absolutePath)) {
    fail('LFEA_RELEASE_RUNTIME_MANIFEST_MISSING', { relativePath });
  }
  const status = fs.lstatSync(absolutePath);
  if (status.isSymbolicLink() || !status.isFile()) {
    fail('LFEA_RELEASE_RUNTIME_MANIFEST_PATH_INVALID', { relativePath });
  }
  const realPath = fs.realpathSync(absolutePath);
  const realRelative = path.relative(root, realPath);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    fail('LFEA_RELEASE_RUNTIME_MANIFEST_PATH_INVALID', { relativePath });
  }
  return realPath;
}

function readJson(filePath, code) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(code, { filePath, message: error.message });
  }
}

function requireExactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, { reason: 'NOT_A_RECORD' });
  }
  const actual = Object.keys(value).sort(compareAscii);
  const expected = [...keys].sort(compareAscii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(code, { actual, expected });
  }
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code, evidence = {}) {
  const error = new Error(code);
  error.code = code;
  error.evidence = evidence;
  throw error;
}
