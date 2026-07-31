#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  hashUtf8,
  semanticHash,
} from '../src/core/shared-piping-model/canonical-json.js';
import {
  contentHashForInternalArtifact,
  sealInternalExactHeadManifest,
} from './lfea-piping-internal-release-evidence-check.mjs';

const MODULE_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(MODULE_PATH), '..');
const HEAD_PATTERN = /^[0-9a-f]{40}$/u;
const COLLECTION_SCHEMA = 'lfea-piping-internal-evidence-collection/v1';
const FAILURE_SCHEMA = 'lfea-piping-internal-evidence-collection-failure/v1';
const PHASE_EVIDENCE_SCHEMA = 'lfea-piping-internal-command-evidence/v1';
const MANIFEST_RELATIVE_PATH = 'internal/exact-head-manifest.json';
const BASELINE_RELATIVE_PATH = 'internal/audit-baseline.runtime.json';
const ARTIFACT_DEFINITIONS = Object.freeze({
  upstreamGateLog: Object.freeze({
    path: 'internal/upstream-gate.log',
    mediaType: 'text/plain',
  }),
  t0GateLog: Object.freeze({
    path: 'internal/t0-gate.log',
    mediaType: 'text/plain',
  }),
  sourceOrchestrationEvidence: Object.freeze({
    path: 'internal/source-orchestration.json',
    mediaType: 'application/json',
  }),
  interfaceEvidence: Object.freeze({
    path: 'internal/interface-evidence.json',
    mediaType: 'application/json',
  }),
  interfaceRecoveryEvidence: Object.freeze({
    path: 'internal/interface-recovery.json',
    mediaType: 'application/json',
  }),
  codeAndAllowableEvidence: Object.freeze({
    path: 'internal/code-and-allowable.json',
    mediaType: 'application/json',
  }),
  presentationExportEvidence: Object.freeze({
    path: 'internal/presentation-export.json',
    mediaType: 'application/json',
  }),
});

if (path.resolve(process.argv[1] ?? '') === MODULE_PATH) {
  const options = parseCollectorInvocation(process.argv.slice(2));
  const result = collectInternalEvidence({
    repositoryRoot: REPOSITORY_ROOT,
    outputRoot: options.outputRoot,
    expectedHead: options.expectedHead,
  });
  console.log(JSON.stringify(result));
}

export function parseCollectorInvocation(args) {
  const options = new Map();
  for (const argument of args) {
    if (!argument.startsWith('--') || !argument.includes('=')) {
      fail('LFEA_INTERNAL_COLLECTION_OPTION_INVALID', { argument });
    }
    const separator = argument.indexOf('=');
    const key = argument.slice(2, separator);
    const value = argument.slice(separator + 1);
    if (!['exact-head', 'output'].includes(key) || options.has(key) || value.trim() === '') {
      fail('LFEA_INTERNAL_COLLECTION_OPTION_INVALID', { argument });
    }
    options.set(key, value);
  }
  const missing = ['exact-head', 'output'].filter((key) => !options.has(key));
  if (missing.length > 0) fail('LFEA_INTERNAL_COLLECTION_OPTIONS_MISSING', { missing });
  const expectedHead = options.get('exact-head');
  if (!HEAD_PATTERN.test(expectedHead)) {
    fail('LFEA_INTERNAL_COLLECTION_HEAD_INVALID', { expectedHead });
  }
  return Object.freeze({
    expectedHead,
    outputRoot: path.resolve(options.get('output')),
  });
}

export function buildInternalEvidenceCommandPlan({ outputRoot }) {
  const baselinePath = path.join(outputRoot, ...BASELINE_RELATIVE_PATH.split('/'));
  return Object.freeze([
    command(
      'EXACT_HEAD_BASELINE',
      'upstreamGateLog',
      process.execPath,
      [
        'scripts/lfea-piping-a0-baseline-check.mjs',
        '--release',
        `--emit=${baselinePath}`,
      ],
      {
        executable: 'node',
        args: [
          'scripts/lfea-piping-a0-baseline-check.mjs',
          '--release',
          `--emit=$EVIDENCE_ROOT/${BASELINE_RELATIVE_PATH}`,
        ],
      },
    ),
    command(
      'UPSTREAM_NUMERICAL_CHAIN',
      'upstreamGateLog',
      npmExecutable(),
      ['run', 'check:lfea-core'],
      { executable: 'npm' },
    ),
    command(
      'T0_APPLICATION_SEQUENCING',
      't0GateLog',
      process.execPath,
      ['scripts/linear-piping-analysis-consumer-check.mjs'],
      { executable: 'node' },
    ),
    command(
      'SOURCE_ORCHESTRATION',
      'sourceOrchestrationEvidence',
      process.execPath,
      ['scripts/linear-piping-source-orchestration-check.mjs'],
      { executable: 'node' },
    ),
    command(
      'INTERFACES',
      'interfaceEvidence',
      npmExecutable(),
      ['run', 'check:lfea-interfaces'],
      { executable: 'npm' },
    ),
    command(
      'INTERFACE_RECOVERY',
      'interfaceRecoveryEvidence',
      process.execPath,
      ['scripts/linear-piping-interface-check.mjs'],
      { executable: 'node' },
    ),
    command(
      'CODE_AND_ALLOWABLES',
      'codeAndAllowableEvidence',
      npmExecutable(),
      ['run', 'check:lfea-code-application'],
      { executable: 'npm' },
    ),
    command(
      'PRESENTATION_EXPORT',
      'presentationExportEvidence',
      npmExecutable(),
      ['run', 'check:lfea-presentation-export'],
      { executable: 'npm' },
    ),
    command(
      'FULL_REPOSITORY_GATE',
      'upstreamGateLog',
      npmExecutable(),
      ['run', 'gate'],
      { executable: 'npm' },
    ),
    Object.freeze({
      commandId: 'CLEAN_TREE',
      artifactRole: 'upstreamGateLog',
      kind: 'CLEAN_TREE',
      executable: null,
      args: Object.freeze([]),
      commandText: 'git diff --check && test -z "$(git status --porcelain)"',
    }),
  ]);
}

export function collectInternalEvidence({
  repositoryRoot,
  outputRoot,
  expectedHead,
  runner = executeCommand,
  headResolver = resolveRepositoryHead,
  now = () => new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z'),
  runtime = process,
}) {
  requireHead(expectedHead);
  const repository = fs.realpathSync(repositoryRoot);
  const output = prepareOutputRoot(repository, outputRoot);
  const actualHead = headResolver(repository);
  if (actualHead !== expectedHead) {
    fail('LFEA_INTERNAL_COLLECTION_CHECKOUT_HEAD_MISMATCH', {
      expectedHead,
      actualHead,
    });
  }

  const plan = buildInternalEvidenceCommandPlan({ outputRoot: output });
  const results = [];
  for (const entry of plan) {
    const rawResult = runner(entry, repository);
    const result = normalizeCommandResult(entry, rawResult);
    results.push(result);
    if (result.exitCode !== 0 || result.status !== 'PASS') {
      const failure = writeFailureRecord(output, expectedHead, results, now());
      fail('LFEA_INTERNAL_COLLECTION_COMMAND_FAILED', {
        commandId: entry.commandId,
        exitCode: result.exitCode,
        failurePath: failure.path,
      });
    }
  }

  const baseline = requireCollectedBaseline(output, expectedHead);
  const artifacts = writeCollectedArtifacts(output, expectedHead, results, baseline);
  const manifest = sealInternalExactHeadManifest({
    schema: 'lfea-piping-exact-head-manifest/v1',
    repository: 'reallaksh19/Advanced_Analysis',
    exactHead: expectedHead,
    createdAtUtc: now(),
    runtime: {
      runtimeName: 'NODE-JS',
      runtimeVersion: runtime.version,
      operatingSystem: `${runtime.platform}-${runtime.arch}`,
      architecture: runtime.arch,
      dependencyLockHash: hashUtf8(
        fs.readFileSync(path.join(repository, 'package-lock.json'), 'utf8'),
      ),
    },
    cleanTree: cleanTreeEvidence(results),
    commands: results.map((result) => ({
      commandId: result.commandId,
      commandText: result.commandText,
      exitCode: result.exitCode,
      status: result.status,
      artifactRole: result.artifactRole,
      artifactContentHash: artifacts.references[result.artifactRole].contentHash,
    })),
    artifactReferences: artifacts.references,
    semanticHash: '',
    evidenceHash: '',
  });
  writeJson(output, MANIFEST_RELATIVE_PATH, manifest);
  const collection = Object.freeze({
    schema: COLLECTION_SCHEMA,
    status: 'PASS',
    exactHead: expectedHead,
    commandCount: results.length,
    artifactCount: Object.keys(artifacts.references).length,
    manifestPath: MANIFEST_RELATIVE_PATH,
    auditBaselinePath: BASELINE_RELATIVE_PATH,
    auditBaselineContentHash: baseline.contentHash,
    manifestSemanticHash: manifest.semanticHash,
    manifestEvidenceHash: manifest.evidenceHash,
  });
  writeJson(output, 'internal/collection-summary.json', collection);
  return collection;
}

function requireCollectedBaseline(outputRoot, exactHead) {
  const absolutePath = outputPath(outputRoot, BASELINE_RELATIVE_PATH);
  if (!fs.existsSync(absolutePath)) {
    fail('LFEA_INTERNAL_COLLECTION_BASELINE_MISSING', {
      path: BASELINE_RELATIVE_PATH,
    });
  }
  const status = fs.lstatSync(absolutePath);
  if (status.isSymbolicLink() || !status.isFile()) {
    fail('LFEA_INTERNAL_COLLECTION_BASELINE_INVALID', {
      path: BASELINE_RELATIVE_PATH,
    });
  }
  let record;
  try {
    record = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    fail('LFEA_INTERNAL_COLLECTION_BASELINE_INVALID', {
      path: BASELINE_RELATIVE_PATH,
      message: error.message,
    });
  }
  if (record.schema !== 'lfea-piping-audit-baseline-runtime/v1'
    || record.repository !== 'reallaksh19/Advanced_Analysis'
    || record.exactHeadCommit !== exactHead
    || record.checkout?.clean !== true
    || record.evidenceStatus !== 'EXACT_HEAD_BASELINE_CAPTURED') {
    fail('LFEA_INTERNAL_COLLECTION_BASELINE_INVALID', {
      schema: record.schema,
      repository: record.repository,
      exactHeadCommit: record.exactHeadCommit,
      checkoutClean: record.checkout?.clean,
      evidenceStatus: record.evidenceStatus,
    });
  }
  return Object.freeze({ record, contentHash: semanticHash(record) });
}

function writeCollectedArtifacts(outputRoot, exactHead, results, baseline) {
  const references = {};
  for (const [role, definition] of Object.entries(ARTIFACT_DEFINITIONS)) {
    const roleResults = results.filter((result) => result.artifactRole === role);
    let content = definition.mediaType === 'text/plain'
      ? renderTextEvidence(roleResults, exactHead)
      : renderJsonEvidence(role, roleResults[0], exactHead);
    if (role === 'upstreamGateLog') {
      content = `${content}auditBaselinePath=${BASELINE_RELATIVE_PATH}\nauditBaselineContentHash=${baseline.contentHash}\n`;
    }
    writeArtifact(outputRoot, definition, content);
    references[role] = Object.freeze({
      path: definition.path,
      mediaType: definition.mediaType,
      contentHash: contentHashForInternalArtifact(definition.mediaType, content),
    });
  }
  return Object.freeze({ references: Object.freeze(references) });
}

function renderTextEvidence(results, exactHead) {
  const sections = results.map((result) => [
    `${result.commandId} PASS`,
    `command=${result.commandText}`,
    `exitCode=${result.exitCode}`,
    '--- stdout ---',
    result.stdout,
    '--- stderr ---',
    result.stderr,
  ].join('\n'));
  return `${sections.join('\n\n')}\nexactHead=${exactHead}\n`;
}

function renderJsonEvidence(role, result, exactHead) {
  if (!result) fail('LFEA_INTERNAL_COLLECTION_ROLE_RESULT_MISSING', { role });
  const projection = {
    schema: PHASE_EVIDENCE_SCHEMA,
    role,
    exactHead,
    status: 'PASS',
    command: {
      commandId: result.commandId,
      commandText: result.commandText,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      outputHash: result.outputHash,
      outputByteLength: Buffer.byteLength(`${result.stdout}${result.stderr}`, 'utf8'),
    },
  };
  return Object.freeze({ ...projection, semanticHash: semanticHash(projection) });
}

function cleanTreeEvidence(results) {
  const result = results.find((entry) => entry.commandId === 'CLEAN_TREE');
  if (!result || result.status !== 'PASS') fail('LFEA_INTERNAL_COLLECTION_CLEAN_TREE_MISSING');
  return Object.freeze({
    diffCheckPassed: true,
    statusClean: true,
    statusHash: result.outputHash,
  });
}

function normalizeCommandResult(entry, value) {
  const exitCode = Number.isInteger(value?.exitCode) ? value.exitCode : 1;
  const stdout = String(value?.stdout ?? '');
  const stderr = String(value?.stderr ?? '');
  return Object.freeze({
    commandId: entry.commandId,
    artifactRole: entry.artifactRole,
    commandText: entry.commandText,
    exitCode,
    status: exitCode === 0 ? 'PASS' : 'FAIL',
    stdout,
    stderr,
    outputHash: hashUtf8(`${stdout}${stderr}`),
  });
}

function executeCommand(entry, repositoryRoot) {
  if (entry.kind === 'CLEAN_TREE') return executeCleanTree(repositoryRoot);
  const result = spawnSync(entry.executable, [...entry.args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
    maxBuffer: 64 * 1024 * 1024,
    timeout: 60 * 60 * 1000,
  });
  return {
    exitCode: Number.isInteger(result.status) ? result.status : 1,
    stdout: result.stdout ?? '',
    stderr: `${result.stderr ?? ''}${result.error ? `\n${result.error.message}` : ''}`,
  };
}

function executeCleanTree(repositoryRoot) {
  const diff = spawnSync('git', ['diff', '--check'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  const status = spawnSync('git', ['status', '--porcelain'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  const clean = diff.status === 0 && status.status === 0 && status.stdout.trim() === '';
  return {
    exitCode: clean ? 0 : 1,
    stdout: `${diff.stdout ?? ''}${status.stdout ?? ''}`,
    stderr: `${diff.stderr ?? ''}${status.stderr ?? ''}`,
  };
}

function resolveRepositoryHead(repositoryRoot) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    fail('LFEA_INTERNAL_COLLECTION_HEAD_RESOLUTION_FAILED', {
      stderr: result.stderr,
    });
  }
  return result.stdout.trim();
}

function prepareOutputRoot(repositoryRoot, outputRoot) {
  const requested = path.resolve(outputRoot);
  const relative = path.relative(repositoryRoot, requested);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    fail('LFEA_INTERNAL_COLLECTION_OUTPUT_INSIDE_REPOSITORY', { outputRoot: requested });
  }
  if (fs.existsSync(requested)) {
    const status = fs.lstatSync(requested);
    if (status.isSymbolicLink() || !status.isDirectory()) {
      fail('LFEA_INTERNAL_COLLECTION_OUTPUT_INVALID', { outputRoot: requested });
    }
    if (fs.readdirSync(requested).length > 0) {
      fail('LFEA_INTERNAL_COLLECTION_OUTPUT_NOT_EMPTY', { outputRoot: requested });
    }
  } else {
    fs.mkdirSync(requested, { recursive: true });
  }
  const realOutput = fs.realpathSync(requested);
  const realRelative = path.relative(repositoryRoot, realOutput);
  if (realRelative === '' || (!realRelative.startsWith('..') && !path.isAbsolute(realRelative))) {
    fail('LFEA_INTERNAL_COLLECTION_OUTPUT_INSIDE_REPOSITORY', { outputRoot: realOutput });
  }
  return realOutput;
}

function writeArtifact(outputRoot, definition, content) {
  if (definition.mediaType === 'application/json') {
    writeJson(outputRoot, definition.path, content);
    return;
  }
  const absolutePath = outputPath(outputRoot, definition.path);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf8');
}

function writeJson(outputRoot, relativePath, value) {
  const absolutePath = outputPath(outputRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function outputPath(outputRoot, relativePath) {
  const absolutePath = path.resolve(outputRoot, ...relativePath.split('/'));
  const relative = path.relative(outputRoot, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    fail('LFEA_INTERNAL_COLLECTION_OUTPUT_PATH_INVALID', { relativePath });
  }
  return absolutePath;
}

function writeFailureRecord(outputRoot, exactHead, results, collectedAtUtc) {
  const failed = results.at(-1);
  const record = Object.freeze({
    schema: FAILURE_SCHEMA,
    status: 'FAIL',
    exactHead,
    collectedAtUtc,
    failedCommandId: failed.commandId,
    results,
  });
  const relativePath = 'internal/collection-failure.json';
  writeJson(outputRoot, relativePath, record);
  return Object.freeze({ path: relativePath, record });
}

function command(commandId, artifactRole, executable, args, display = {}) {
  const displayExecutable = display.executable ?? normalizedExecutable(executable);
  const displayArgs = display.args ?? args;
  return Object.freeze({
    commandId,
    artifactRole,
    kind: 'PROCESS',
    executable,
    args: Object.freeze([...args]),
    commandText: formatCommand(displayExecutable, displayArgs),
  });
}

function normalizedExecutable(executable) {
  if (executable === process.execPath) return 'node';
  if (/npm(?:\.cmd)?$/u.test(executable)) return 'npm';
  return executable;
}

function formatCommand(executable, args) {
  return [executable, ...args].map((value) => (
    /\s/u.test(value) ? JSON.stringify(value) : value
  )).join(' ');
}

function npmExecutable() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function requireHead(value) {
  if (typeof value !== 'string' || !HEAD_PATTERN.test(value)) {
    fail('LFEA_INTERNAL_COLLECTION_HEAD_INVALID', { value });
  }
}

function fail(code, evidence = {}) {
  const error = new Error(code);
  error.code = code;
  error.evidence = evidence;
  throw error;
}
