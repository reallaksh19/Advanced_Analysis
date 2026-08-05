import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  PROVISIONAL_CALCULIX_2_22_PROFILE,
  QUALIFICATION_STATES,
  advanceNc00Authority,
  createNc00AuthorityRecord,
  createSolverProfile,
  semanticHash,
} from '../src/core/nonlinear-shell-contact/index.js';

const EXPECTED = Object.freeze({
  sourceCommit: 'cff1bb12ec7d24ad9048a1f54ae243a18d1a0b54',
  sourceArchiveHash: 'sha256:901908b655837fadc0a2753331bbaf81916ee1701b4c015254f1b09a15eec97f',
  binaryHash: 'sha256:9a33d293706a66bee86f2f0ecf996a66758f904c20d61ad8c83ddc0f92ae4b7e',
  image: 'local/lafea-nc-calculix-ccx:2.22-cff1bb12',
  imageDigest: 'sha256:e6a82117027ef72afbecd597b81ebd83e5b40bdcfc63a70422b799aeb79270fb',
  linkedLibraryAggregate: 'sha256:0f333f2640075aa85769aee392f91b4391adbfe0c2ede84ed890873a1ab237a8',
  qualifiedInventoryHash: 'sha256:3055a9587b2481d05d7691e81eeba35fd30d0a37de16761f0b587c6af0eba5ab',
  qualifiedReportHash: 'sha256:768335de3f424803ebd4b1afe72cece375ff2cdcaf3e76d3be04c2f030648f54',
});
const STABLE_RAW_FILES = Object.freeze([
  'model.inp',
  'model.dat',
  'model.frd',
  'model.sta',
  'model.cvg',
  'model.12d',
  'solver.stderr.txt',
]);

async function main() {
  const args = new Map(process.argv.slice(2).map((entry) => {
    const [key, ...rest] = entry.split('=');
    return [key, rest.join('=')];
  }));
  const custodyRoot = resolve(required(args, '--custody-root'));
  const exactHeadSha = requiredSha(args, '--head-sha');
  const baseSha = requiredSha(args, '--base-sha');
  const outputRoot = resolve(required(args, '--output-root'));
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  const custody = await verifyQualifiedCustody(custodyRoot);
  const isolation = await verifyNetworkIsolation();
  const runtime = await prepareExactRuntime(custodyRoot, outputRoot);
  const solverProfile = createSolverProfile({
    ...PROVISIONAL_CALCULIX_2_22_PROFILE,
    sourceArchiveSha256: EXPECTED.sourceArchiveHash,
    binarySha256: EXPECTED.binaryHash,
    containerImage: EXPECTED.image,
    containerDigest: EXPECTED.imageDigest,
    operatingSystem: custody.platform.os,
    architecture: custody.platform.architecture,
    compilerName: custody.build.compilerId,
    compilerVersion: custody.build.compilerVersion,
    linkedLibraryManifestHash: custody.linkedRecordFileHash,
    licenseId: custody.license.spdxId,
    licenseReviewStatus: 'REVIEWED',
  });
  const profilePath = join(outputRoot, 'approved-solver-profile.json');
  const solverProfileInput = { ...solverProfile };
  delete solverProfileInput.solverProfileSemanticHash;
  await writeJson(profilePath, solverProfileInput);
  await writeJson(join(outputRoot, 'approved-solver-profile-receipt.json'), solverProfile);

  const policy = {
    executablePath: runtime.executablePath,
    fixedArguments: ['-i', 'model'],
    approvedEnvironment: {
      OMP_NUM_THREADS: '1',
      OPENBLAS_NUM_THREADS: '1',
      TZ: 'UTC',
      LANG: 'C',
      LC_ALL: 'C',
    },
    allowlistedOutputFileNames: [
      'model.inp',
      'model.dat',
      'model.frd',
      'model.sta',
      'model.cvg',
      'model.12d',
      'solver.stdout.txt',
      'solver.stderr.txt',
    ],
    requiredOutputFileNames: ['model.frd', 'model.sta', 'model.cvg'],
    maximumStreamBytes: 50_000_000,
    maximumOutputFiles: 16,
    observedContainerDigest: EXPECTED.imageDigest,
    networkIsolationEstablished: isolation.established,
    exactHeadSha,
    baseSha,
    quarantineDirectory: null,
  };
  const policyPath = join(outputRoot, 'execution-policy.json');
  await writeJson(policyPath, policy);

  const runA = await executeNc00Replay({
    label: 'run-a', outputRoot, exactHeadSha, baseSha, profilePath, policyPath,
  });
  const runB = await executeNc00Replay({
    label: 'run-b', outputRoot, exactHeadSha, baseSha, profilePath, policyPath,
  });
  assertQualifiedReport(runA.report);
  assertQualifiedReport(runB.report);
  assert.equal(runA.report.semanticHash, runB.report.semanticHash, 'NC-00 report replay hash drift.');
  const deterministicExecution = await compareExternalExecutionArtifacts(runA.root, runB.root);
  assert.equal(deterministicExecution.status, 'PASS');

  let authorityRecord = createNc00AuthorityRecord({
    programmeId: 'LAFEA-NC',
    exactHeadSha,
    baseSha,
  });
  authorityRecord = advanceNc00Authority(
    authorityRecord,
    QUALIFICATION_STATES.CONTRACT_QUALIFIED,
    {
      contractsPass: true,
      negativeControlsPass: true,
      independentReconstructionPass: true,
      deterministicDeckPass: true,
      nc00ReportHash: runA.report.semanticHash,
    },
  );
  authorityRecord = advanceNc00Authority(
    authorityRecord,
    QUALIFICATION_STATES.SOLVER_BRIDGE_QUALIFIED,
    {
      approvedSolverProfile: true,
      licenseReviewed: true,
      externalExecutionOccurred: true,
      positiveFixturesPass: true,
      negativeControlsPass: true,
      independentReconstructionPass: true,
      deterministicReplayPass: true,
      exactHeadCustodyPass: true,
      solverCustodyInventoryHash: EXPECTED.qualifiedInventoryHash,
      solverCustodyReportHash: EXPECTED.qualifiedReportHash,
      nc00ReportHash: runA.report.semanticHash,
      deterministicExecutionHash: deterministicExecution.semanticHash,
    },
  );
  assert.equal(authorityRecord.authorityState, QUALIFICATION_STATES.SOLVER_BRIDGE_QUALIFIED);
  await writeJson(join(outputRoot, 'solver-bridge-authority.json'), authorityRecord);
  await writeJson(join(outputRoot, 'deterministic-execution-comparison.json'), deterministicExecution);
  await writeJson(join(outputRoot, 'runtime-custody.json'), runtime);
  await writeJson(join(outputRoot, 'network-isolation.json'), isolation);

  const summary = {
    schema: 'lafea-nc-solver-bridge-evidence/v1',
    status: 'SOLVER_BRIDGE_QUALIFIED',
    exactHeadSha,
    baseSha,
    solverProfileHash: solverProfile.solverProfileSemanticHash,
    nc00ReportHash: runA.report.semanticHash,
    authorityRecordHash: authorityRecord.semanticHash,
    deterministicExecutionHash: deterministicExecution.semanticHash,
    custodyInventoryHash: EXPECTED.qualifiedInventoryHash,
    custodyReportHash: EXPECTED.qualifiedReportHash,
    externalFixtureCount: deterministicExecution.fixtureCount,
    networkIsolationEstablished: isolation.established,
    authority: {
      solverCustodyQualified: true,
      solverBridgeQualified: true,
      nc01Authorized: true,
      shellFormulationQualified: false,
      contactProcedureQualified: false,
      codeAssessmentQualified: false,
      moduleQualified: false,
      productionExecutionAuthorized: false,
      mergeAuthorized: false,
    },
  };
  await writeJson(join(outputRoot, 'solver-bridge-summary.json'), summary);
  console.log(JSON.stringify(summary));
}

async function verifyQualifiedCustody(root) {
  const report = await readJson(join(root, 'reports-container/solver-custody-qualified-report.json'));
  const inventory = await readJson(join(root, 'reports-container/solver-custody-qualified-inventory.json'));
  const container = await readJson(join(root, 'records/container-record.json'));
  const linked = await readJson(join(root, 'records/linked-libraries-record.json'));
  const build = await readJson(join(root, 'records/build-record.json'));
  const platform = await readJson(join(root, 'records/platform-record.json'));
  const license = await readJson(join(root, 'records/license-record.json'));
  assert.equal(report.status, 'SOLVER_CUSTODY_QUALIFIED');
  assert.equal(report.verifiedEvidenceCount, 8);
  assert.equal(report.inventoryHash, EXPECTED.qualifiedInventoryHash);
  assert.equal(report.reportSemanticHash, EXPECTED.qualifiedReportHash);
  assert.equal(inventory.inventoryHash, EXPECTED.qualifiedInventoryHash);
  assert.equal(container.image, EXPECTED.image);
  assert.equal(container.digest, EXPECTED.imageDigest);
  assert.equal(container.immutable, true);
  assert.equal(linked.aggregateHash, EXPECTED.linkedLibraryAggregate);
  assert.equal(await hashFile(join(root, 'binary/ccx_2.22')), EXPECTED.binaryHash);
  assert.equal(await hashFile(join(root, `source/CalculiX-${EXPECTED.sourceCommit}.tar.gz`)), EXPECTED.sourceArchiveHash);
  return {
    report,
    inventory,
    container,
    linked,
    build,
    platform,
    license,
    linkedRecordFileHash: await hashFile(join(root, 'records/linked-libraries-record.json')),
  };
}

async function verifyNetworkIsolation() {
  const devices = (await readFile('/proc/net/dev', 'utf8'))
    .split(/\r?\n/)
    .slice(2)
    .map((line) => line.split(':')[0]?.trim())
    .filter(Boolean);
  assert.deepEqual(devices, ['lo'], `Network namespace contains non-loopback devices: ${devices.join(', ')}`);
  const route = await readFile('/proc/net/route', 'utf8');
  const nonHeaderRoutes = route.split(/\r?\n/).slice(1).filter((line) => line.trim());
  assert.equal(nonHeaderRoutes.length, 0, 'Network namespace contains a routable interface.');
  return {
    schema: 'lafea-nc-network-isolation/v1',
    established: true,
    interfaces: devices,
    nonHeaderRouteCount: 0,
  };
}

async function prepareExactRuntime(custodyRoot, outputRoot) {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'lafea-nc00-bridge-runtime-'));
  const executablePath = join(runtimeRoot, 'ccx_2.22');
  await copyFile(join(custodyRoot, 'binary/ccx_2.22'), executablePath);
  await chmod(executablePath, 0o755);
  assert.equal(await hashFile(executablePath), EXPECTED.binaryHash);
  const linked = await readJson(join(custodyRoot, 'records/linked-libraries-record.json'));
  const ldd = run('ldd', [executablePath]).stdout;
  const resolved = new Map();
  for (const line of ldd.split(/\r?\n/)) {
    const mapped = line.match(/^\s*([^\s]+)\s+=>\s+(\/[^\s]+)\s+/u);
    if (mapped) resolved.set(mapped[1], mapped[2]);
    const loader = line.match(/^\s*(\/lib64\/ld-linux-x86-64\.so\.2)\s+/u);
    if (loader) resolved.set('ld-linux-x86-64.so.2', loader[1]);
  }
  const dynamicRows = [];
  for (const library of linked.libraries) {
    if (library.name.endsWith('.a')) continue;
    const hostPath = resolved.get(library.name);
    assert.ok(hostPath, `Host runtime did not resolve ${library.name}.`);
    const resolvedPath = await realpath(hostPath);
    const observedHash = await hashFile(resolvedPath);
    assert.equal(observedHash, library.binaryHash, `Host runtime hash drift for ${library.name}.`);
    dynamicRows.push({
      name: library.name,
      retainedHash: library.binaryHash,
      hostPath,
      resolvedPath,
      observedHash,
    });
  }
  const result = {
    schema: 'lafea-nc-solver-bridge-runtime-custody/v1',
    executablePath,
    executableHash: EXPECTED.binaryHash,
    containerImage: EXPECTED.image,
    containerDigest: EXPECTED.imageDigest,
    dynamicLibraries: dynamicRows,
    linkedLibraryAggregateHash: linked.aggregateHash,
  };
  await writeJson(join(outputRoot, 'runtime-custody-preflight.json'), result);
  return result;
}

async function executeNc00Replay({ label, outputRoot, exactHeadSha, baseSha, profilePath, policyPath }) {
  const root = join(outputRoot, label);
  await mkdir(root, { recursive: true });
  const stdoutPath = join(root, 'controller.stdout.txt');
  const stderrPath = join(root, 'controller.stderr.txt');
  const result = spawnSync(process.execPath, ['scripts/lafea-nc00-check.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    env: {
      ...process.env,
      NC00_EXACT_HEAD_SHA: exactHeadSha,
      NC00_BASE_SHA: baseSha,
      NC00_BRANCH: 'agent/lafea-nc-solver-bridge-evidence',
      NC00_ARTIFACT_DIR: root,
      LAFEA_NC00_APPROVED_SOLVER_PROFILE_JSON: profilePath,
      LAFEA_NC00_EXECUTION_POLICY_JSON: policyPath,
    },
  });
  await writeFile(stdoutPath, result.stdout || '', 'utf8');
  await writeFile(stderrPath, result.stderr || '', 'utf8');
  assert.equal(result.status, 0, `NC-00 ${label} failed (${result.status}):\n${result.stdout || ''}\n${result.stderr || ''}`);
  return { root, report: await readJson(join(root, 'nc00-report.json')) };
}

function assertQualifiedReport(report) {
  assert.equal(report.status, 'NC00_SOLVER_BRIDGE_QUALIFIED');
  assert.equal(report.authority.contractQualified, true);
  assert.equal(report.authority.solverBridgeQualified, true);
  assert.equal(report.authority.nc01Authorized, true);
  assert.equal(report.authority.shellFormulationQualified, false);
  assert.equal(report.authority.productionExecutionAuthorized, false);
  assert.ok(report.fixtureResults.every((row) => row.status === 'PASS'));
  assert.ok(report.negativeControlResults.every((row) => row.status === 'PASS'));
  assert.equal(report.independentCheckerResults.status, 'PASS');
  assert.equal(report.deterministicReplayResults.status, 'PASS');
}

async function compareExternalExecutionArtifacts(rootA, rootB) {
  const fixtures = (await readdir(rootA, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('NC00-'))
    .map((entry) => entry.name)
    .filter((name) => name !== 'NC00-F4' && name !== 'NC00-F5')
    .sort();
  const rows = [];
  for (const fixtureId of fixtures) {
    const rawA = join(rootA, fixtureId, 'raw');
    const rawB = join(rootB, fixtureId, 'raw');
    const rawStatsA = await stat(rawA).catch(() => null);
    const rawStatsB = await stat(rawB).catch(() => null);
    assert.ok(rawStatsA?.isDirectory() && rawStatsB?.isDirectory(), `Missing external raw evidence for ${fixtureId}.`);
    const stableFiles = [];
    for (const fileName of STABLE_RAW_FILES) {
      const pathA = join(rawA, fileName);
      const pathB = join(rawB, fileName);
      const [existsA, existsB] = await Promise.all([
        stat(pathA).then(() => true).catch(() => false),
        stat(pathB).then(() => true).catch(() => false),
      ]);
      assert.equal(existsA, existsB, `${fixtureId}:${fileName} presence drift.`);
      if (!existsA) continue;
      const [hashA, hashB] = await Promise.all([hashFile(pathA), hashFile(pathB)]);
      assert.equal(hashA, hashB, `${fixtureId}:${fileName} byte drift.`);
      stableFiles.push({ fileName, sha256: hashA });
    }
    const stdoutA = normalizeSolverStdout(await readFile(join(rawA, 'solver.stdout.txt'), 'utf8'));
    const stdoutB = normalizeSolverStdout(await readFile(join(rawB, 'solver.stdout.txt'), 'utf8'));
    assert.equal(stdoutA, stdoutB, `${fixtureId}: normalized stdout drift.`);
    rows.push({
      fixtureId,
      stableFiles,
      normalizedStdoutHash: sha256(Buffer.from(stdoutA, 'utf8')),
    });
  }
  assert.ok(fixtures.length >= 7, `Expected at least seven governed external fixtures; received ${fixtures.length}.`);
  const payload = { status: 'PASS', fixtureCount: fixtures.length, fixtures: rows };
  return { ...payload, semanticHash: semanticHash(payload) };
}

function normalizeSolverStdout(value) {
  return value
    .replace(/^Total CalculiX Time:\s+[^\r\n]+$/gmu, 'Total CalculiX Time: <NORMALIZED>')
    .replace(/^\s*$/gmu, '')
    .trim();
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr || result.stdout}`);
  return result;
}
async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
async function hashFile(path) {
  const bytes = await readFile(path);
  assert.ok(bytes.length > 0 || basename(path) === 'model.dat' || basename(path) === 'solver.stderr.txt');
  return sha256(bytes);
}
function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
function required(args, name) {
  const value = args.get(name);
  if (!value) throw new TypeError(`${name} is required.`);
  return value;
}
function requiredSha(args, name) {
  const value = required(args, name);
  if (!/^[0-9a-f]{40}$/u.test(value)) throw new TypeError(`${name} must be an exact Git SHA.`);
  return value;
}

await main();
