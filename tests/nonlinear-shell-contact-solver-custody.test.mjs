import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  evaluateSolverCustody,
  EXPECTED_SOLVER_IDENTITY,
  REQUIRED_SOLVER_CUSTODY_EVIDENCE,
  SOLVER_CUSTODY_EVIDENCE_SCHEMA,
  sealSolverCustodyInventory,
  validateSolverCustodyInventory,
} from '../src/core/nonlinear-shell-contact/solver-custody-evidence.js';
import { semanticHash, sha256Bytes } from '../src/core/nonlinear-shell-contact/contracts.js';

const repositoryInventoryPath = new URL(
  '../evidence/nonlinear-shell-contact/solver-custody/inventory.json',
  import.meta.url,
);

async function createCompleteFixture() {
  const root = await mkdtemp(join(tmpdir(), 'lafea-solver-custody-'));
  const evidenceDir = join(root, 'custody');
  await mkdir(evidenceDir, { recursive: true });
  const writeBytes = async (name, bytes) => {
    const path = `custody/${name}`;
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), buffer);
    return { path, sha256: sha256Bytes(buffer) };
  };
  const writeRecord = async (name, record) => {
    const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, 'utf8');
    return writeBytes(name, bytes);
  };

  const source = await writeBytes('CalculiX-2.22.tar.gz', 'synthetic-source-archive');
  const executable = await writeBytes('ccx_2.22', 'synthetic-ccx-binary');
  const oci = await writeBytes('calculix-2.22.oci.tar', 'synthetic-oci-archive');
  const buildLog = await writeBytes('build.log', 'compiler and linker transcript');
  const platformProbe = await writeBytes('platform.txt', 'linux x86_64 glibc kernel');
  const libA = await writeBytes('lib/libblas.so', 'synthetic-blas');
  const libB = await writeBytes('lib/liblapack.so', 'synthetic-lapack');
  const threadProbe = await writeBytes('thread-policy.txt', 'OMP_NUM_THREADS=1\nOPENBLAS_NUM_THREADS=1\n');
  const licenseText = await writeBytes('COPYING', 'synthetic license text');

  const container = await writeRecord('container-record.json', {
    image: 'registry.example.invalid/calculix:2.22',
    digest: sha256Bytes('synthetic-oci-manifest'),
    platform: 'linux/amd64',
    ociArchivePath: oci.path,
    ociArchiveHash: oci.sha256,
    immutable: true,
  });
  const build = await writeRecord('build-record.json', {
    sourceCommit: EXPECTED_SOLVER_IDENTITY.sourceCommit,
    compilerId: 'gcc',
    compilerVersion: 'synthetic-1.0',
    compilerFlags: ['-O2', '-fno-fast-math'],
    buildCommandHash: sha256Bytes('make ccx'),
    buildLogPath: buildLog.path,
    buildLogHash: buildLog.sha256,
  });
  const platform = await writeRecord('platform-record.json', {
    os: 'linux',
    architecture: 'x86_64',
    libc: 'glibc-synthetic',
    kernel: 'synthetic-kernel',
    platformFingerprintHash: sha256Bytes('synthetic-platform-fingerprint'),
    probePath: platformProbe.path,
    probeHash: platformProbe.sha256,
  });
  const libraries = [
    { name: 'blas', version: 'synthetic', path: libA.path, binaryHash: libA.sha256 },
    { name: 'lapack', version: 'synthetic', path: libB.path, binaryHash: libB.sha256 },
  ];
  const linkedLibraries = await writeRecord('linked-libraries-record.json', {
    libraries,
    aggregateHash: semanticHash(libraries),
  });
  const threadPolicy = await writeRecord('thread-policy-record.json', {
    threadCount: 1,
    environmentVariables: { OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1' },
    deterministic: true,
    probePath: threadProbe.path,
    probeHash: threadProbe.sha256,
  });
  const license = await writeRecord('license-record.json', {
    spdxId: 'LicenseRef-Synthetic-Test-Only',
    licenseTextPath: licenseText.path,
    licenseTextHash: licenseText.sha256,
    sourcePath: 'upstream/COPYING',
  });

  const entries = new Map([
    ['SOURCE_ARCHIVE', { ...source, mediaType: 'application/gzip' }],
    ['EXECUTABLE_BINARY', { ...executable, mediaType: 'application/octet-stream' }],
    ['CONTAINER_RECORD', { ...container, mediaType: 'application/json' }],
    ['BUILD_RECORD', { ...build, mediaType: 'application/json' }],
    ['PLATFORM_RECORD', { ...platform, mediaType: 'application/json' }],
    ['LINKED_LIBRARIES_RECORD', { ...linkedLibraries, mediaType: 'application/json' }],
    ['THREAD_POLICY_RECORD', { ...threadPolicy, mediaType: 'application/json' }],
    ['LICENSE_RECORD', { ...license, mediaType: 'application/json' }],
  ]);
  const inventory = sealSolverCustodyInventory({
    schema: SOLVER_CUSTODY_EVIDENCE_SCHEMA,
    solver: EXPECTED_SOLVER_IDENTITY,
    evidence: REQUIRED_SOLVER_CUSTODY_EVIDENCE.map((id) => ({
      id,
      status: 'PRESENT',
      ...entries.get(id),
      note: 'Synthetic test evidence; not programme evidence.',
    })),
    qualificationRequested: true,
  });
  return { root, inventory };
}

test('repository inventory is deterministic and fails closed on all eight missing classes', async () => {
  const inventory = JSON.parse(await readFile(repositoryInventoryPath, 'utf8'));
  validateSolverCustodyInventory(inventory);
  const root = new URL('..', import.meta.url).pathname;
  const first = await evaluateSolverCustody({ inventory, rootDir: root });
  const second = await evaluateSolverCustody({ inventory, rootDir: root });
  assert.deepEqual(second, first);
  assert.equal(first.status, 'SOLVER_CUSTODY_BLOCKED');
  assert.deepEqual(first.missingEvidence, [...REQUIRED_SOLVER_CUSTODY_EVIDENCE].sort());
  assert.equal(first.verifiedEvidenceCount, 0);
  assert.equal(first.authority.solverCustodyQualified, false);
  assert.equal(first.authority.solverBridgeQualified, false);
});

test('complete file-backed fixture exercises the custody-qualified path without solver-bridge authority', async () => {
  const { root, inventory } = await createCompleteFixture();
  const report = await evaluateSolverCustody({ inventory, rootDir: root });
  assert.equal(report.status, 'SOLVER_CUSTODY_QUALIFIED');
  assert.equal(report.verifiedEvidenceCount, 8);
  assert.deepEqual(report.missingEvidence, []);
  assert.deepEqual(report.blockers, []);
  assert.equal(report.authority.solverCustodyQualified, true);
  assert.equal(report.authority.solverBridgeQualified, false);
  assert.equal(report.authority.productionExecutionAuthorized, false);
});

test('tampered evidence is blocked by byte hash verification', async () => {
  const { root, inventory } = await createCompleteFixture();
  await writeFile(join(root, inventory.evidence[0].path), 'tampered');
  const report = await evaluateSolverCustody({ inventory, rootDir: root });
  assert.equal(report.status, 'SOLVER_CUSTODY_BLOCKED');
  assert.ok(report.blockers.some((entry) => entry.startsWith('EVIDENCE_INVALID:SOURCE_ARCHIVE:hash mismatch')));
});

test('placeholder hashes are rejected by the inventory contract', async () => {
  const { inventory } = await createCompleteFixture();
  const changed = JSON.parse(JSON.stringify(inventory));
  changed.evidence[0].sha256 = `sha256:${'0'.repeat(64)}`;
  delete changed.inventoryHash;
  const resealed = sealSolverCustodyInventory(changed);
  assert.throws(() => validateSolverCustodyInventory(resealed), /placeholder/u);
});

test('solver identity drift is rejected before filesystem access', async () => {
  const { inventory } = await createCompleteFixture();
  const changed = JSON.parse(JSON.stringify(inventory));
  changed.solver.solverVersion = '2.23';
  delete changed.inventoryHash;
  const resealed = sealSolverCustodyInventory(changed);
  assert.throws(() => validateSolverCustodyInventory(resealed), /must equal 2.22/u);
});

test('nested linked-library bytes are independently verified', async () => {
  const { root, inventory } = await createCompleteFixture();
  const recordEntry = inventory.evidence.find((entry) => entry.id === 'LINKED_LIBRARIES_RECORD');
  const record = JSON.parse(await readFile(join(root, recordEntry.path), 'utf8'));
  await writeFile(join(root, record.libraries[0].path), 'tampered-library');
  const report = await evaluateSolverCustody({ inventory, rootDir: root });
  assert.equal(report.status, 'SOLVER_CUSTODY_BLOCKED');
  assert.ok(report.blockers.some((entry) => entry.startsWith('EVIDENCE_INVALID:LINKED_LIBRARIES_RECORD:')));
});
