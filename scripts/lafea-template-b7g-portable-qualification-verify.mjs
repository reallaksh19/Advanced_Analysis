#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE_PATH = resolveInsideRoot(
  process.argv[2]
    ?? process.env.B7G_BUNDLE_PATH
    ?? 'reports/qualification/lafea-b7g-portable-qualification-bundle.json',
);
const REQUIRED_MERGES = Object.freeze({
  b7d: '4ea645b91c8b74fae3d2e8af31278d52505cac84',
  b7e: '07af67696bede4a809f3a61d1670609a5888b4fe',
  nbT6g: '13792e342fe5b9fb494a8103e6d8936245bd05ff',
});
const REQUIRED_FALSE_AUTHORITY = Object.freeze([
  'generalT7dAuthorized',
  'additionalContinuumTemplatesAuthorized',
  'shellAuthorized',
  'assessmentReady',
  'codeReady',
  'reportAuthority',
  'releaseQualified',
]);
const checks = [];

record('BUNDLE_PRESENT', fs.existsSync(BUNDLE_PATH),
  `Expected ${relative(BUNDLE_PATH)}.`);
const bundle = readJson(BUNDLE_PATH);
if (!bundle) finish();

record('BUNDLE_SCHEMA',
  bundle.schema === 'lafea-b7g-portable-qualification-bundle/v1',
  `Unexpected schema ${String(bundle.schema)}.`);
record('BUNDLE_STATUS', bundle.status === 'PASS',
  `Bundle status is ${String(bundle.status)}.`);
record('EXACT_HEAD_FORMAT', /^[0-9a-f]{40}$/u.test(bundle.exactHead ?? ''),
  `Invalid exact head ${String(bundle.exactHead)}.`);
record('EXPECTED_HEAD_MATCH', bundle.expectedHead === bundle.exactHead,
  `Expected head ${String(bundle.expectedHead)} differs from exact head.`);
record('CURRENT_CHECKOUT_MATCH', git(['rev-parse', 'HEAD']) === bundle.exactHead,
  'Verifier checkout must match the bundle exact head.');
record('BUNDLE_HASH', verifyBundleHash(bundle),
  'Bundle hash must match canonical bundle content.');
record('AUTHORITY_RETAINED', authorityRetained(bundle.authority),
  'All bounded authority fields must remain false.');
record('PORTABLE_NONCLAIM',
  bundle.gateDisposition?.hostedCiPassClaimedByB7g === false
    && bundle.gateDisposition?.automaticIssueClosureAuthorized === false
    && bundle.gateDisposition?.governingAcceptanceRequired === true,
  'Portable evidence must not claim hosted CI or automatic issue closure.');

for (const [id, sha] of Object.entries(REQUIRED_MERGES)) {
  record(`${id.toUpperCase()}_MERGE_IN_ANCESTRY`,
    isAncestor(sha, bundle.exactHead),
    `Required merge ${sha} must be in exact-head ancestry.`);
}

const logEvidence = verifyFileEvidence('LOG', bundle.evidence?.log, null);
const b7eEvidence = verifyFileEvidence(
  'B7E_REPORT',
  bundle.evidence?.b7eReport,
  'lafea-b7e-b7-gate-closure-report/v1',
);
const b7fEvidence = verifyFileEvidence(
  'B7F_REPORT',
  bundle.evidence?.b7fReport,
  'lafea-b7f-current-main-qualification-report/v1',
);

record('LOG_NONEMPTY', (logEvidence?.bytes.byteLength ?? 0) > 0,
  'Aggregate qualification log must be nonempty.');
record('B7E_PASS', b7eEvidence?.json?.status === 'PASS',
  `B7E status is ${String(b7eEvidence?.json?.status)}.`);
record('B7E_EXACT_HEAD', b7eEvidence?.json?.exactHead === bundle.exactHead,
  `B7E head is ${String(b7eEvidence?.json?.exactHead)}.`);
record('B7E_EXPECTED_HEAD',
  b7eEvidence?.json?.expectedHead === bundle.exactHead,
  `B7E expected head is ${String(b7eEvidence?.json?.expectedHead)}.`);
record('B7E_AUTHORITY_RETAINED',
  authorityRetained(b7eEvidence?.json?.authority),
  'B7E authority flags must remain false.');
record('B7F_PASS', b7fEvidence?.json?.status === 'PASS',
  `B7F status is ${String(b7fEvidence?.json?.status)}.`);
record('B7F_EXACT_HEAD', b7fEvidence?.json?.exactHead === bundle.exactHead,
  `B7F head is ${String(b7fEvidence?.json?.exactHead)}.`);
record('B7F_EXPECTED_HEAD',
  b7fEvidence?.json?.expectedHead === bundle.exactHead,
  `B7F expected head is ${String(b7fEvidence?.json?.expectedHead)}.`);
record('B7F_AUTHORITY_RETAINED',
  authorityRetained(b7fEvidence?.json?.authority),
  'B7F authority flags must remain false.');
record('B7F_GATE_STATE_RETAINED',
  bundle.gateDisposition?.retainedB7fContext
      === b7fEvidence?.json?.context
    && bundle.gateDisposition?.retainedB7fCurrentMainQualified
      === (b7fEvidence?.json?.currentMainQualified === true)
    && bundle.gateDisposition?.retainedB7fGateClosureEligible
      === (b7fEvidence?.json?.b7GateClosureEligible === true),
  'Bundle must reproduce the exact retained B7F gate disposition.');

const tracked = git(['status', '--porcelain=v1', '--untracked-files=no']);
record('TRACKED_TREE_CLEAN', tracked === '',
  tracked || 'Tracked tree is clean during verification.');
finish();

function verifyFileEvidence(id, evidence, expectedSchema) {
  record(`${id}_DECLARED`, Boolean(evidence && typeof evidence === 'object'),
    `${id} evidence entry is required.`);
  if (!evidence || typeof evidence !== 'object') return null;
  record(`${id}_PRESENT_FLAG`, evidence.present === true,
    `${id} present flag must be true.`);
  let filePath;
  try {
    filePath = resolveInsideRoot(evidence.path);
    record(`${id}_PATH_BOUNDED`, true, `${id} path is repository-bounded.`);
  } catch (error) {
    record(`${id}_PATH_BOUNDED`, false,
      error instanceof Error ? error.message : String(error));
    return null;
  }
  record(`${id}_FILE_PRESENT`, fs.existsSync(filePath),
    `Expected ${relative(filePath)}.`);
  if (!fs.existsSync(filePath)) return null;
  const bytes = fs.readFileSync(filePath);
  record(`${id}_SHA256`, evidence.sha256 === sha256(bytes),
    `${id} SHA-256 does not match.`);
  record(`${id}_BYTE_LENGTH`, evidence.byteLength === bytes.byteLength,
    `${id} byte length does not match.`);
  if (!expectedSchema) return { filePath, bytes, json: null };
  const json = parseJson(bytes, id);
  record(`${id}_SCHEMA`, json?.schema === expectedSchema,
    `Expected ${expectedSchema}; received ${String(json?.schema)}.`);
  record(`${id}_DECLARED_SCHEMA`, evidence.schema === expectedSchema,
    `${id} declared schema does not match.`);
  record(`${id}_DECLARED_STATUS`, evidence.status === json?.status,
    `${id} declared status does not match file content.`);
  record(`${id}_DECLARED_HEAD`, evidence.exactHead === json?.exactHead,
    `${id} declared exact head does not match file content.`);
  return { filePath, bytes, json };
}

function verifyBundleHash(value) {
  if (typeof value.bundleHash !== 'string') return false;
  const { bundleHash, ...payload } = value;
  return bundleHash === sha256(canonical(payload));
}

function authorityRetained(value) {
  return value && typeof value === 'object'
    && REQUIRED_FALSE_AUTHORITY.every((key) => value[key] === false)
    && Object.values(value).every((entry) =>
      typeof entry !== 'boolean' || entry === false);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    record('BUNDLE_PARSE', false,
      error instanceof Error ? error.message : String(error));
    return null;
  }
}

function parseJson(bytes, id) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    record(`${id}_PARSE`, false,
      error instanceof Error ? error.message : String(error));
    return null;
  }
}

function resolveInsideRoot(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Evidence path must be a nonempty string.');
  }
  const resolved = path.resolve(ROOT, value);
  if (resolved !== ROOT && !resolved.startsWith(`${ROOT}${path.sep}`)) {
    throw new Error(`Evidence path escapes repository root: ${value}`);
  }
  return resolved;
}

function isAncestor(base, head) {
  return spawnSync('git', ['merge-base', '--is-ancestor', base, head], {
    cwd: ROOT,
    stdio: 'ignore',
  }).status === 0;
}

function relative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function record(id, passed, details) {
  checks.push(Object.freeze({
    id,
    status: passed ? 'PASS' : 'BLOCKED',
    details,
  }));
}

function finish() {
  const failures = checks.filter((entry) => entry.status !== 'PASS');
  const report = Object.freeze({
    schema: 'lafea-b7g-portable-qualification-verification/v1',
    status: failures.length === 0 ? 'PASS' : 'BLOCKED',
    bundlePath: relative(BUNDLE_PATH),
    exactHead: git(['rev-parse', 'HEAD']),
    checks: Object.freeze(checks.map((entry) => Object.freeze({ ...entry }))),
    failures: Object.freeze(failures.map((entry) => Object.freeze({ ...entry }))),
    authority: Object.freeze({
      qualificationVerificationOnly: true,
      hostedCiPassClaimed: false,
      automaticIssueClosureAuthorized: false,
      generalT7dAuthorized: false,
      reportAuthority: false,
      releaseQualified: false,
    }),
  });
  console.log(JSON.stringify(report));
  process.exit(failures.length === 0 ? 0 : 1);
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function git(args) {
  const result = spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed.`);
  }
  return result.stdout.trim();
}
