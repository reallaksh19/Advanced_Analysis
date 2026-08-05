import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import {
  evaluateSolverCustody,
  EXPECTED_SOLVER_IDENTITY,
  sealSolverCustodyInventory,
  validateSolverCustodyInventory,
} from '../src/core/nonlinear-shell-contact/solver-custody-evidence.js';
import {
  CONTAINER_IMAGE,
  CONTAINER_PLATFORM,
  EXPECTED_BINARY_HASH,
  EXPECTED_INTERPRETER_HASH,
  EXPECTED_LICENSE_HASH,
  EXPECTED_SOURCE_HASH,
  OCI_ARCHIVE_RELATIVE_PATH,
} from './lafea-nc-solver-container-build.mjs';

const OCI_INDEX_MEDIA = 'application/vnd.oci.image.index.v1+json';
const OCI_MANIFEST_MEDIA = 'application/vnd.oci.image.manifest.v1+json';
const OCI_CONFIG_MEDIA = 'application/vnd.oci.image.config.v1+json';
const OCI_LAYER_MEDIA = 'application/vnd.oci.image.layer.v1.tar+gzip';
const EXPECTED_ENV = Object.freeze([
  'OMP_NUM_THREADS=1',
  'OPENBLAS_NUM_THREADS=1',
  'MKL_NUM_THREADS=1',
  'LD_LIBRARY_PATH=/lib/x86_64-linux-gnu',
]);

export async function inspectOciArchive({
  archivePath,
  provenance,
  expectedBinaryHash,
  expectedInterpreterHash,
  expectedLicenseHash,
  expectedSourceHash,
  expectedLibraries,
}) {
  const archive = resolve(archivePath);
  assert.equal(await hashFile(archive), provenance.ociArchiveHash, 'OCI archive hash drift.');
  assert.equal(provenance.ociArchivePath, OCI_ARCHIVE_RELATIVE_PATH);
  assert.equal(provenance.image, CONTAINER_IMAGE);
  assert.equal(provenance.platform, CONTAINER_PLATFORM);
  assert.equal(provenance.immutable, true);

  const work = await mkdtemp(join(tmpdir(), 'lafea-nc-oci-inspect-'));
  try {
    await safeExtractTar(archive, work);
    const layout = JSON.parse(await readFile(join(work, 'oci-layout'), 'utf8'));
    assert.deepEqual(layout, { imageLayoutVersion: '1.0.0' });
    const index = JSON.parse(await readFile(join(work, 'index.json'), 'utf8'));
    assert.equal(index.schemaVersion, 2);
    assert.equal(index.mediaType, OCI_INDEX_MEDIA);
    assert.equal(index.manifests.length, 1);
    const descriptor = index.manifests[0];
    assert.equal(descriptor.mediaType, OCI_MANIFEST_MEDIA);
    assert.equal(descriptor.digest, provenance.imageDigest);
    assert.equal(descriptor.platform.os, 'linux');
    assert.equal(descriptor.platform.architecture, 'amd64');
    assert.equal(descriptor.annotations['org.opencontainers.image.ref.name'], CONTAINER_IMAGE);

    const manifestBytes = await readDescriptorBlob(work, descriptor, 'manifest');
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    assert.equal(manifest.schemaVersion, 2);
    assert.equal(manifest.mediaType, OCI_MANIFEST_MEDIA);
    assert.equal(manifest.config.mediaType, OCI_CONFIG_MEDIA);
    assert.equal(manifest.config.digest, provenance.configDigest);
    assert.equal(manifest.layers.length, 1);
    assert.equal(manifest.layers[0].mediaType, OCI_LAYER_MEDIA);
    assert.equal(manifest.layers[0].digest, provenance.layerDigest);
    assert.equal(manifest.annotations['org.opencontainers.image.ref.name'], CONTAINER_IMAGE);

    const configBytes = await readDescriptorBlob(work, manifest.config, 'config');
    const config = JSON.parse(configBytes.toString('utf8'));
    assert.equal(config.os, 'linux');
    assert.equal(config.architecture, 'amd64');
    assert.deepEqual(config.config.Entrypoint, ['/opt/calculix/ccx_2.22']);
    assert.deepEqual(config.config.Env, EXPECTED_ENV);
    assert.equal(config.config.Labels['lafea.nc.solver.binary.sha256'], expectedBinaryHash);
    assert.equal(config.config.Labels['lafea.nc.solver.source.sha256'], expectedSourceHash);
    assert.equal(config.config.Labels['lafea.nc.solver.interpreter.sha256'], expectedInterpreterHash);
    assert.deepEqual(config.rootfs, { type: 'layers', diff_ids: [provenance.layerDiffId] });

    const layerBytes = await readDescriptorBlob(work, manifest.layers[0], 'layer');
    const compressedLayer = join(work, 'layer.tar.gz');
    const uncompressedLayer = join(work, 'layer.tar');
    await writeFile(compressedLayer, layerBytes);
    runShell(`gzip -dc ${shellQuote(compressedLayer)} > ${shellQuote(uncompressedLayer)}`);
    assert.equal(await hashFile(uncompressedLayer), provenance.layerDiffId, 'OCI layer diff ID drift.');
    const rootfs = join(work, 'rootfs');
    await mkdir(rootfs, { recursive: true });
    await safeExtractTar(uncompressedLayer, rootfs);

    assert.equal(await hashFile(join(rootfs, 'opt/calculix/ccx_2.22')), expectedBinaryHash);
    assert.equal(await hashFile(join(rootfs, 'usr/share/licenses/calculix/LICENSE')), expectedLicenseHash);
    assert.equal(
      await hashFile(join(rootfs, `usr/src/calculix/CalculiX-${EXPECTED_SOLVER_IDENTITY.sourceCommit}.tar.gz`)),
      expectedSourceHash,
    );
    assert.equal(
      await hashFile(join(rootfs, provenance.dynamicLoader.path.replace(/^\//, ''))),
      provenance.dynamicLoader.sha256,
    );
    assert.equal(provenance.dynamicLoader.sha256, expectedInterpreterHash);
    assert.equal(
      await hashFile(join(rootfs, provenance.interpreterEvidence.provenancePath)),
      provenance.interpreterEvidence.provenanceHash,
      'OCI interpreter provenance drift.',
    );
    assert.equal(
      await hashFile(join(rootfs, provenance.interpreterEvidence.probePath)),
      provenance.interpreterEvidence.probeHash,
      'OCI interpreter probe drift.',
    );
    assert.equal(
      await hashFile(join(rootfs, provenance.priorCustody.inventoryPath)),
      provenance.priorCustody.inventoryFileHash,
      'OCI prior inventory drift.',
    );
    assert.equal(
      await hashFile(join(rootfs, provenance.priorCustody.reportPath)),
      provenance.priorCustody.reportFileHash,
      'OCI prior report drift.',
    );

    for (const library of expectedLibraries) {
      const evidenceCopy = join(rootfs, 'opt/calculix/evidence/libraries', library.name);
      assert.equal(await hashFile(evidenceCopy), library.binaryHash, `OCI evidence library drift: ${library.name}`);
      if (library.name === 'ld-linux-x86-64.so.2') {
        assert.equal(
          await hashFile(join(rootfs, 'lib64/ld-linux-x86-64.so.2')),
          library.binaryHash,
          'OCI retained dynamic loader drift.',
        );
      } else if (library.name.endsWith('.so') || library.name.includes('.so.')) {
        assert.equal(
          await hashFile(join(rootfs, 'lib/x86_64-linux-gnu', library.name)),
          library.binaryHash,
          `OCI runtime library drift: ${library.name}`,
        );
      }
    }
    return {
      archiveHash: provenance.ociArchiveHash,
      imageDigest: provenance.imageDigest,
      configDigest: provenance.configDigest,
      layerDigest: provenance.layerDigest,
      layerDiffId: provenance.layerDiffId,
    };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function main() {
  const args = new Map(process.argv.slice(2).map((entry) => {
    const [key, ...rest] = entry.split('=');
    return [key, rest.join('=')];
  }));
  const rootDir = resolve(requiredArg(args, '--root'));
  const outputDir = resolve(args.get('--output-dir') || join(rootDir, 'reports-container'));
  const priorInventory = await readJson(join(rootDir, 'reports-interpreter/solver-custody-build-inventory.json'));
  const priorReport = await readJson(join(rootDir, 'reports-interpreter/solver-custody-build-report.json'));
  assert.equal(priorReport.status, 'SOLVER_CUSTODY_BLOCKED');
  assert.equal(priorReport.verifiedEvidenceCount, 7);
  assert.deepEqual(priorReport.missingEvidence, ['CONTAINER_RECORD']);
  assert.equal(priorReport.authority.solverCustodyQualified, false);
  assert.equal(priorInventory.qualificationRequested, true);

  const provenance = await readJson(join(rootDir, 'metadata/container-provenance.json'));
  const linkedLibrariesRecord = await readJson(join(rootDir, 'records/linked-libraries-record.json'));
  assert.equal(provenance.executableHash, EXPECTED_BINARY_HASH);
  assert.equal(provenance.licenseTextHash, EXPECTED_LICENSE_HASH);
  assert.equal(provenance.sourceArchiveHash, EXPECTED_SOURCE_HASH);
  assert.equal(provenance.runtimeProbe.exitCode, 201);
  assert.equal(
    await hashFile(join(rootDir, provenance.runtimeProbe.path)),
    provenance.runtimeProbe.sha256,
    'Container runtime probe hash drift.',
  );
  const runtimeProbe = await readFile(join(rootDir, provenance.runtimeProbe.path), 'utf8');
  assert.match(runtimeProbe, /exitCode=201/);
  assert.match(runtimeProbe, /Usage: CalculiX\.exe -i jobname/);

  await inspectOciArchive({
    archivePath: join(rootDir, OCI_ARCHIVE_RELATIVE_PATH),
    provenance,
    expectedBinaryHash: EXPECTED_BINARY_HASH,
    expectedInterpreterHash: EXPECTED_INTERPRETER_HASH,
    expectedLicenseHash: EXPECTED_LICENSE_HASH,
    expectedSourceHash: EXPECTED_SOURCE_HASH,
    expectedLibraries: linkedLibrariesRecord.libraries,
  });

  const containerRecord = {
    image: CONTAINER_IMAGE,
    digest: provenance.imageDigest,
    platform: CONTAINER_PLATFORM,
    ociArchivePath: OCI_ARCHIVE_RELATIVE_PATH,
    ociArchiveHash: provenance.ociArchiveHash,
    immutable: true,
  };
  await writeJson(join(rootDir, 'records/container-record.json'), containerRecord);
  const containerRecordHash = await hashFile(join(rootDir, 'records/container-record.json'));
  const evidence = priorInventory.evidence.map((entry) => entry.id === 'CONTAINER_RECORD'
    ? {
        id: 'CONTAINER_RECORD',
        status: 'PRESENT',
        path: 'records/container-record.json',
        sha256: containerRecordHash,
        mediaType: 'application/json',
        note: 'Byte-identical immutable OCI image evidence with exact manifest, config, layer, runtime and payload custody.',
      }
    : entry);
  const inventory = sealSolverCustodyInventory({
    schema: priorInventory.schema,
    solver: priorInventory.solver,
    evidence,
    qualificationRequested: true,
  });
  validateSolverCustodyInventory(inventory);
  const report = await evaluateSolverCustody({ inventory, rootDir });
  const replay = await evaluateSolverCustody({ inventory, rootDir });
  assert.deepEqual(replay, report, 'Qualified solver custody must replay deterministically.');
  assert.equal(report.status, 'SOLVER_CUSTODY_QUALIFIED');
  assert.equal(report.requiredEvidenceCount, 8);
  assert.equal(report.verifiedEvidenceCount, 8);
  assert.deepEqual(report.missingEvidence, []);
  assert.deepEqual(report.blockers, []);
  assert.equal(report.authority.solverCustodyQualified, true);
  assert.equal(report.authority.solverBridgeQualified, false);
  assert.equal(report.authority.shellFormulationQualified, false);
  assert.equal(report.authority.productionExecutionAuthorized, false);
  assert.equal(report.authority.mergeAuthorized, false);

  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'solver-custody-qualified-inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
  await writeFile(join(outputDir, 'solver-custody-qualified-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report));
}

async function readDescriptorBlob(layoutRoot, descriptor, label) {
  assert.match(descriptor.digest, /^sha256:[0-9a-f]{64}$/, `${label} descriptor digest`);
  assert.ok(Number.isInteger(descriptor.size) && descriptor.size > 0, `${label} descriptor size`);
  const bytes = await readFile(join(layoutRoot, 'blobs/sha256', descriptor.digest.slice(7)));
  assert.equal(bytes.length, descriptor.size, `${label} descriptor size drift.`);
  assert.equal(sha256(bytes), descriptor.digest, `${label} descriptor digest drift.`);
  return bytes;
}
async function safeExtractTar(archive, destination) {
  const listing = run('tar', ['-tf', archive]).stdout.split(/\r?\n/).filter(Boolean);
  for (const entry of listing) {
    const normalized = normalize(entry.replace(/^\.\//, ''));
    assert.ok(!normalized.startsWith('..') && !normalized.startsWith('/'), `Unsafe tar entry: ${entry}`);
  }
  run('tar', ['-xf', archive, '-C', destination]);
}
function requiredArg(args, name) {
  const value = args.get(name);
  if (!value) throw new TypeError(`${name} is required.`);
  return value;
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
  assert.ok(bytes.length > 0, `${path} must not be empty.`);
  return sha256(bytes);
}
function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}):\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
  return result;
}
function runShell(command) {
  const result = spawnSync('/bin/bash', ['-lc', command], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Shell command failed (${result.status}): ${command}\n${result.stderr || ''}`);
}
function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
