import { spawn } from 'node:child_process';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { createRawOutputManifest } from './raw-output-manifest.js';
import { parseExternalSolverStructuralResult } from './result-parser.js';
import { reconstructNc00ExecutionBindings } from './result-reconstruction.js';
import {
  assertArray,
  assertBoolean,
  assertExactKeys,
  assertGitSha,
  assertHash,
  assertPlainData,
  assertRelativePath,
  assertString,
  sha256Bytes,
  semanticHash,
  deepFreeze,
} from './contracts.js';
import { validateCanonicalNonlinearShellContactModel } from './canonical-model.js';
import { validateDeckProfile } from './deck-profile.js';
import { validateExecutionRequest } from './execution-request.js';
import { validateSolverProfile } from './solver-profile.js';
import { writeDeterministicSolverDeck } from './deck-writer.js';

const DEFAULT_OUTPUT_ALLOWLIST = Object.freeze([
  'model.inp',
  'model.dat',
  'model.frd',
  'model.sta',
  'model.cvg',
  'solver.stdout.txt',
  'solver.stderr.txt',
]);

export async function executeNonlinearShellContactRequest(
  canonicalModel,
  approvedSolverProfile,
  approvedDeckProfile,
  executionPolicy,
  executionRequest,
) {
  validateCanonicalNonlinearShellContactModel(canonicalModel);
  validateSolverProfile(approvedSolverProfile, { requireApproved: true });
  validateDeckProfile(approvedDeckProfile);
  validateExecutionRequest(executionRequest);
  validateExecutionPolicy(executionPolicy);

  if (executionRequest.canonicalModelHash !== canonicalModel.canonicalModelSemanticHash
      || executionRequest.solverProfileHash !== approvedSolverProfile.solverProfileSemanticHash
      || executionRequest.deckProfileHash !== approvedDeckProfile.deckProfileSemanticHash) {
    throw new TypeError('Execution request hash bindings do not match approved inputs.');
  }
  if (executionPolicy.observedContainerDigest !== approvedSolverProfile.containerDigest) {
    throw new TypeError('Wrong container digest.');
  }
  if (executionPolicy.networkIsolationEstablished !== true) {
    throw new TypeError('Network isolation could not be established.');
  }
  await verifyExecutableCustody(executionPolicy.executablePath, approvedSolverProfile.binarySha256);

  const deckArtifact = writeDeterministicSolverDeck(canonicalModel, approvedDeckProfile);
  const deckBytes = Buffer.from(deckArtifact.deckText, 'utf8');
  if (deckBytes.length > executionRequest.maximumInputBytes) {
    throw new TypeError('Deterministic input deck exceeds maximumInputBytes.');
  }

  const privateRoot = await mkdtemp(join(tmpdir(), 'lafea-nc00-'));
  await chmod(privateRoot, 0o700);
  let quarantineRequired = false;
  try {
    const workingDirectory = await realpath(privateRoot);
    const inputPath = join(workingDirectory, approvedDeckProfile.fileNames.input);
    await writeFile(inputPath, deckBytes, { mode: 0o600, flag: 'wx' });
    await verifyFileHash(inputPath, deckArtifact.deckSha256, 'Input deck changed after isolated write.');

    const startedAtEvidence = new Date().toISOString();
    const processResult = await runFixedProcess({
      executablePath: executionPolicy.executablePath,
      fixedArguments: executionPolicy.fixedArguments,
      cwd: workingDirectory,
      env: buildApprovedEnvironment(
        executionPolicy.approvedEnvironment,
        approvedSolverProfile.environmentAllowlist,
        executionPolicy.executablePath,
      ),
      timeoutMilliseconds: executionRequest.timeoutSeconds * 1000,
      maximumStreamBytes: executionPolicy.maximumStreamBytes,
    });
    const completedAtEvidence = new Date().toISOString();

    await writeFile(
      join(workingDirectory, approvedDeckProfile.fileNames.stdout),
      processResult.stdout,
      { mode: 0o600, flag: 'wx' },
    );
    await writeFile(
      join(workingDirectory, approvedDeckProfile.fileNames.stderr),
      processResult.stderr,
      { mode: 0o600, flag: 'wx' },
    );

    const retainedFiles = await inspectAndReadOutputs({
      workingDirectory,
      allowlistedFileNames: executionPolicy.allowlistedOutputFileNames,
      maximumOutputBytes: executionRequest.maximumOutputBytes,
      maximumOutputFiles: executionPolicy.maximumOutputFiles ?? 32,
    });
    requireOutputs(retainedFiles, executionPolicy.requiredOutputFileNames);
    const retainedInput = retainedFiles.get(approvedDeckProfile.fileNames.input);
    if (!retainedInput || sha256Bytes(retainedInput) !== deckArtifact.deckSha256) {
      throw new TypeError('Input deck was altered during external execution.');
    }

    const stdout = retainedFiles.get(approvedDeckProfile.fileNames.stdout);
    const stderr = retainedFiles.get(approvedDeckProfile.fileNames.stderr);
    const fileRows = [...retainedFiles.entries()].map(([relativePath, bytes]) => ({
      relativePath,
      role: classifyRole(relativePath, approvedDeckProfile),
      byteLength: bytes.length,
      sha256: sha256Bytes(bytes),
      mediaType: isTextFile(relativePath)
        ? 'text/plain; charset=utf-8'
        : 'application/octet-stream',
      required: executionPolicy.requiredOutputFileNames.includes(relativePath)
        || relativePath === approvedDeckProfile.fileNames.input
        || relativePath === approvedDeckProfile.fileNames.stdout
        || relativePath === approvedDeckProfile.fileNames.stderr,
    }));
    const rawManifest = createRawOutputManifest({
      requestId: executionRequest.requestId,
      exactHeadSha: executionPolicy.exactHeadSha,
      canonicalModelHash: canonicalModel.canonicalModelSemanticHash,
      solverProfileHash: approvedSolverProfile.solverProfileSemanticHash,
      deckProfileHash: approvedDeckProfile.deckProfileSemanticHash,
      deckSha256: deckArtifact.deckSha256,
      startedAtEvidence,
      completedAtEvidence,
      exitCode: processResult.exitCode,
      timeoutDisposition: processResult.timedOut ? 'TIMED_OUT' : 'COMPLETED_WITHIN_TIMEOUT',
      stdoutSha256: sha256Bytes(stdout),
      stderrSha256: sha256Bytes(stderr),
      files: fileRows,
    });
    const parsedResult = parseExternalSolverStructuralResult({
      canonicalModel,
      solverProfile: approvedSolverProfile,
      deckProfile: approvedDeckProfile,
      rawManifest,
      retainedFiles,
    });
    const reconstruction = reconstructNc00ExecutionBindings({
      canonicalModel,
      solverProfile: approvedSolverProfile,
      deckProfile: approvedDeckProfile,
      deckArtifact,
      rawManifest,
      parsedResult,
    });
    const executionDisposition = (
      !processResult.timedOut
      && processResult.exitCode === 0
      && parsedResult.solverCompletionDisposition === 'COMPLETE'
      && reconstruction.status === 'PASS'
    ) ? 'EXECUTED' : 'FAILED';

    const receiptPayload = {
      schema: 'nonlinear-shell-contact-execution-receipt/v1',
      requestId: executionRequest.requestId,
      exactHeadSha: executionPolicy.exactHeadSha,
      baseSha: executionPolicy.baseSha,
      canonicalModelHash: canonicalModel.canonicalModelSemanticHash,
      solverProfileHash: approvedSolverProfile.solverProfileSemanticHash,
      deckProfileHash: approvedDeckProfile.deckProfileSemanticHash,
      deckSha256: deckArtifact.deckSha256,
      rawOutputManifestHash: rawManifest.rawManifestSemanticHash,
      parsedResultHash: parsedResult.resultPayloadSemanticHash,
      stdoutHash: rawManifest.stdoutSha256,
      stderrHash: rawManifest.stderrSha256,
      executionDisposition,
      authorityState: executionDisposition === 'EXECUTED'
        ? 'CONTRACT_QUALIFIED'
        : 'UNREGISTERED',
    };
    const receipt = deepFreeze({
      ...receiptPayload,
      semanticHash: semanticHash(receiptPayload),
    });

    if (executionDisposition !== 'EXECUTED') quarantineRequired = true;
    return {
      deckArtifact,
      rawManifest,
      parsedResult,
      reconstruction,
      receipt,
      retainedFiles,
      executionDisposition,
    };
  } finally {
    if (quarantineRequired && executionPolicy.quarantineDirectory !== null) {
      await mkdir(executionPolicy.quarantineDirectory, { recursive: true });
      const target = join(
        executionPolicy.quarantineDirectory,
        `${basename(privateRoot)}-${Date.now()}`,
      );
      await rename(privateRoot, target);
    } else {
      await rm(privateRoot, { recursive: true, force: true });
    }
  }
}

export function validateOutputInventoryRows(rows, {
  allowlistedOutputFileNames,
  requiredOutputFileNames,
  maximumOutputBytes,
  maximumOutputFiles = 32,
}) {
  assertArray(rows, 'outputInventoryRows');
  if (!Number.isInteger(maximumOutputFiles) || maximumOutputFiles < 1) {
    throw new TypeError('maximumOutputFiles must be a positive integer.');
  }
  if (rows.length > maximumOutputFiles) {
    throw new TypeError('Solver output file count exceeded maximumOutputFiles.');
  }
  const allowed = new Set([...DEFAULT_OUTPUT_ALLOWLIST, ...allowlistedOutputFileNames]);
  let total = 0;
  const names = new Set();
  rows.forEach((row, index) => {
    assertExactKeys(row, ['name', 'byteLength', 'kind'], `outputInventoryRows[${index}]`);
    assertRelativePath(row.name, `outputInventoryRows[${index}].name`);
    if (row.name.includes('/')) throw new TypeError('Output inventory names must be base names.');
    if (!allowed.has(row.name)) throw new TypeError(`Unexpected output file ${row.name}.`);
    if (names.has(row.name)) throw new TypeError(`Duplicate output file ${row.name}.`);
    names.add(row.name);
    if (!Number.isInteger(row.byteLength) || row.byteLength < 0) {
      throw new TypeError('Output inventory byteLength must be a nonnegative integer.');
    }
    if (row.kind !== 'FILE') throw new TypeError(`Unexpected non-file output ${row.name}.`);
    total += row.byteLength;
    if (total > maximumOutputBytes) throw new TypeError('Solver outputs exceeded maximumOutputBytes.');
  });
  requiredOutputFileNames.forEach((name) => {
    if (!names.has(name)) throw new TypeError(`Missing required output ${name}.`);
  });
  return true;
}

export function validateExecutionPolicy(policy) {
  assertExactKeys(policy, [
    'executablePath',
    'fixedArguments',
    'approvedEnvironment',
    'allowlistedOutputFileNames',
    'requiredOutputFileNames',
    'maximumStreamBytes',
    'observedContainerDigest',
    'networkIsolationEstablished',
    'exactHeadSha',
    'baseSha',
    'quarantineDirectory',
  ], 'executionPolicy', ['maximumOutputFiles']);
  assertString(policy.executablePath, 'executionPolicy.executablePath');
  if (!policy.executablePath.startsWith('/')) {
    throw new TypeError('Internal executable path must be absolute.');
  }
  assertArray(policy.fixedArguments, 'executionPolicy.fixedArguments');
  policy.fixedArguments.forEach((argument, index) => {
    assertString(argument, `executionPolicy.fixedArguments[${index}]`, { allowEmpty: true });
    if (/[\0\r\n]/u.test(argument)) throw new TypeError('Fixed argument contains control characters.');
  });
  if (policy.fixedArguments.some((argument) => (
    argument.includes(';')
    || argument.includes('&&')
    || argument.includes('$(')
    || argument.includes('`')
  ))) {
    throw new TypeError('Fixed argument array contains a shell-command payload.');
  }
  assertPlainData(policy.approvedEnvironment, 'executionPolicy.approvedEnvironment');
  if (!policy.approvedEnvironment || typeof policy.approvedEnvironment !== 'object'
      || Array.isArray(policy.approvedEnvironment)) {
    throw new TypeError('approvedEnvironment must be a plain object.');
  }
  assertArray(policy.allowlistedOutputFileNames, 'executionPolicy.allowlistedOutputFileNames');
  assertArray(policy.requiredOutputFileNames, 'executionPolicy.requiredOutputFileNames');
  [...policy.allowlistedOutputFileNames, ...policy.requiredOutputFileNames].forEach((path) => {
    assertRelativePath(path, 'executionPolicy output path');
    if (path.includes('/')) throw new TypeError('NC-00 outputs must be fixed base names.');
  });
  policy.requiredOutputFileNames.forEach((path) => {
    if (!policy.allowlistedOutputFileNames.includes(path)) {
      throw new TypeError(`Required output ${path} is not allowlisted.`);
    }
  });
  if (!Number.isInteger(policy.maximumStreamBytes) || policy.maximumStreamBytes < 1) {
    throw new TypeError('maximumStreamBytes must be a positive integer.');
  }
  if (policy.maximumOutputFiles !== undefined
      && (!Number.isInteger(policy.maximumOutputFiles) || policy.maximumOutputFiles < 1)) {
    throw new TypeError('maximumOutputFiles must be a positive integer.');
  }
  assertHash(policy.observedContainerDigest, 'executionPolicy.observedContainerDigest');
  assertBoolean(policy.networkIsolationEstablished, 'executionPolicy.networkIsolationEstablished');
  assertGitSha(policy.exactHeadSha, 'executionPolicy.exactHeadSha');
  assertGitSha(policy.baseSha, 'executionPolicy.baseSha');
  if (policy.quarantineDirectory !== null) {
    assertString(policy.quarantineDirectory, 'executionPolicy.quarantineDirectory');
    if (!policy.quarantineDirectory.startsWith('/')) {
      throw new TypeError('quarantineDirectory must be absolute when supplied.');
    }
  }
  return true;
}

async function verifyExecutableCustody(executablePath, expectedHash) {
  const stats = await lstat(executablePath);
  if (stats.isSymbolicLink()) throw new TypeError('Solver executable must not be a symbolic link.');
  if (!stats.isFile()) throw new TypeError('Solver executable path is not a regular file.');
  const resolvedExecutable = await realpath(executablePath);
  if (resolve(resolvedExecutable) !== resolve(executablePath)) {
    throw new TypeError('Solver executable path contains a symbolic-link component.');
  }
  await verifyFileHash(executablePath, expectedHash, 'Wrong solver binary hash.');
}

async function verifyFileHash(path, expectedHash, message) {
  const bytes = await readFile(path);
  if (sha256Bytes(bytes) !== expectedHash) throw new TypeError(message);
}

async function runFixedProcess({
  executablePath,
  fixedArguments,
  cwd,
  env,
  timeoutMilliseconds,
  maximumStreamBytes,
}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executablePath, fixedArguments, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let settled = false;
    let timer = null;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      child.kill('SIGKILL');
      rejectPromise(error);
    };
    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maximumStreamBytes) {
        fail(new TypeError('Solver stdout exceeded the configured bound.'));
        return;
      }
      stdout.push(Buffer.from(chunk));
    });
    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > maximumStreamBytes) {
        fail(new TypeError('Solver stderr exceeded the configured bound.'));
        return;
      }
      stderr.push(Buffer.from(chunk));
    });
    child.on('error', fail);
    timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMilliseconds);
    child.on('close', (exitCode) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolvePromise({
        exitCode: Number.isInteger(exitCode) ? exitCode : -1,
        timedOut,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      });
    });
  });
}

function buildApprovedEnvironment(values, allowlist, executablePath) {
  const output = {};
  Object.entries(values).forEach(([name, value]) => {
    if (!allowlist.includes(name)) throw new TypeError(`Environment variable ${name} is not allowlisted.`);
    assertString(value, `approvedEnvironment.${name}`, { allowEmpty: true });
    output[name] = value;
  });
  output.PATH = dirname(executablePath);
  return output;
}

async function inspectAndReadOutputs({
  workingDirectory,
  allowlistedFileNames,
  maximumOutputBytes,
  maximumOutputFiles,
}) {
  const allowed = new Set([...DEFAULT_OUTPUT_ALLOWLIST, ...allowlistedFileNames]);
  const entries = await readdir(workingDirectory, { withFileTypes: true });
  if (entries.length > maximumOutputFiles) {
    throw new TypeError('Solver output file count exceeded maximumOutputFiles.');
  }
  const retainedFiles = new Map();
  let totalBytes = 0;
  for (const entry of entries) {
    if (!entry.isFile()) {
      if (entry.isSymbolicLink()) throw new TypeError('Symbolic-link output is prohibited.');
      throw new TypeError(`Unexpected non-file output ${entry.name}.`);
    }
    if (!allowed.has(entry.name)) throw new TypeError(`Unexpected output file ${entry.name}.`);
    const fullPath = join(workingDirectory, entry.name);
    const stats = await lstat(fullPath);
    if (stats.isSymbolicLink()) throw new TypeError('Symbolic-link escape is prohibited.');
    const resolvedPath = await realpath(fullPath);
    const rel = relative(workingDirectory, resolvedPath);
    if (rel.startsWith('..') || resolve(resolvedPath) !== resolve(workingDirectory, entry.name)) {
      throw new TypeError('Output path escaped the isolated directory.');
    }
    const bytes = await readFile(fullPath);
    totalBytes += bytes.length;
    if (totalBytes > maximumOutputBytes) throw new TypeError('Solver outputs exceeded maximumOutputBytes.');
    retainedFiles.set(entry.name, bytes);
  }
  return retainedFiles;
}

function requireOutputs(retainedFiles, requiredNames) {
  requiredNames.forEach((name) => {
    if (!retainedFiles.has(name)) throw new TypeError(`Missing required output ${name}.`);
  });
}

function classifyRole(path, deckProfile) {
  if (path === deckProfile.fileNames.input) return 'INPUT_DECK';
  if (path === deckProfile.fileNames.stdout || path === deckProfile.fileNames.stderr) return 'LOG';
  if (/\.sta$/iu.test(path)) return 'STATUS';
  if (/\.cvg$/iu.test(path)) return 'CONVERGENCE';
  if (/\.(?:frd|dat)$/iu.test(path)) return 'RAW_RESULT';
  return 'AUXILIARY';
}

function isTextFile(path) {
  return /\.(?:inp|txt|dat|sta|cvg)$/iu.test(path);
}
