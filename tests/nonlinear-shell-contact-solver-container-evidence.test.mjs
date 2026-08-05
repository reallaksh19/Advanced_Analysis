import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inspectOciArchive } from '../scripts/lafea-nc-solver-container-evidence-check.mjs';
import {
  CONTAINER_IMAGE,
  CONTAINER_PLATFORM,
  OCI_ARCHIVE_RELATIVE_PATH,
} from '../scripts/lafea-nc-solver-container-build.mjs';

const SOURCE_COMMIT = 'cff1bb12ec7d24ad9048a1f54ae243a18d1a0b54';
const ENV = [
  'OMP_NUM_THREADS=1',
  'OPENBLAS_NUM_THREADS=1',
  'MKL_NUM_THREADS=1',
  'LD_LIBRARY_PATH=/lib/x86_64-linux-gnu',
];

test('OCI container evidence validates the complete descriptor graph and governed payloads', async () => {
  const fixture = await createFixture();
  try {
    const result = await inspectOciArchive(fixture.input);
    assert.equal(result.imageDigest, fixture.provenance.imageDigest);
    assert.equal(result.archiveHash, fixture.provenance.ociArchiveHash);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('OCI container evidence rejects a manifest descriptor digest that does not resolve', async () => {
  const fixture = await createFixture({ tamperIndexDigest: true });
  try {
    await assert.rejects(() => inspectOciArchive(fixture.input));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('OCI container evidence rejects executable payload drift', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(() => inspectOciArchive({
      ...fixture.input,
      expectedBinaryHash: sha256(Buffer.from('different executable\n')),
    }));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

async function createFixture({ tamperIndexDigest = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'lafea-nc-container-test-'));
  const layout = join(root, 'layout');
  const rootfs = join(root, 'rootfs');
  await mkdir(join(layout, 'blobs/sha256'), { recursive: true });
  await mkdir(join(rootfs, 'opt/calculix/evidence/libraries'), { recursive: true });
  await mkdir(join(rootfs, 'opt/calculix/evidence/metadata'), { recursive: true });
  await mkdir(join(rootfs, 'opt/calculix/evidence/interpreter'), { recursive: true });
  await mkdir(join(rootfs, 'opt/calculix/evidence/reports'), { recursive: true });
  await mkdir(join(rootfs, 'lib/x86_64-linux-gnu'), { recursive: true });
  await mkdir(join(rootfs, 'lib64'), { recursive: true });
  await mkdir(join(rootfs, 'usr/share/licenses/calculix'), { recursive: true });
  await mkdir(join(rootfs, 'usr/src/calculix'), { recursive: true });

  const binary = Buffer.from('synthetic ccx 2.22 executable\n');
  const license = Buffer.from('synthetic GPL-2.0-or-later license\n');
  const source = Buffer.from('synthetic source archive\n');
  const sharedLibrary = Buffer.from('synthetic shared library\n');
  const staticLibrary = Buffer.from('synthetic static library\n');
  const loader = Buffer.from('synthetic dynamic loader\n');
  const interpreterProvenance = Buffer.from('synthetic interpreter provenance\n');
  const interpreterProbe = Buffer.from('synthetic interpreter probe\n');
  const priorInventory = Buffer.from('synthetic prior inventory\n');
  const priorReport = Buffer.from('synthetic prior report\n');
  await writeFile(join(rootfs, 'opt/calculix/ccx_2.22'), binary);
  await writeFile(join(rootfs, 'usr/share/licenses/calculix/LICENSE'), license);
  await writeFile(join(rootfs, `usr/src/calculix/CalculiX-${SOURCE_COMMIT}.tar.gz`), source);
  await writeFile(join(rootfs, 'opt/calculix/evidence/libraries/libfixture.so.1'), sharedLibrary);
  await writeFile(join(rootfs, 'lib/x86_64-linux-gnu/libfixture.so.1'), sharedLibrary);
  await writeFile(join(rootfs, 'opt/calculix/evidence/libraries/libfixture.a'), staticLibrary);
  await writeFile(join(rootfs, 'lib64/ld-linux-x86-64.so.2'), loader);
  await writeFile(join(rootfs, 'opt/calculix/evidence/metadata/interpreter-provenance.json'), interpreterProvenance);
  await writeFile(join(rootfs, 'opt/calculix/evidence/interpreter/interpreter-probe.txt'), interpreterProbe);
  await writeFile(join(rootfs, 'opt/calculix/evidence/reports/solver-custody-prior-inventory.json'), priorInventory);
  await writeFile(join(rootfs, 'opt/calculix/evidence/reports/solver-custody-prior-report.json'), priorReport);

  const layerTar = join(root, 'layer.tar');
  const layerGzip = join(root, 'layer.tar.gz');
  run('tar', ['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '--format=gnu', '-C', rootfs, '-cf', layerTar, '.']);
  runShell(`gzip -n -9 -c ${quote(layerTar)} > ${quote(layerGzip)}`);
  const layerDigest = await hashFile(layerGzip);
  const layerDiffId = await hashFile(layerTar);
  const layerSize = (await stat(layerGzip)).size;
  await writeFile(blobPath(layout, layerDigest), await readFile(layerGzip));

  const config = {
    created: '1970-01-01T00:00:00Z',
    architecture: 'amd64',
    os: 'linux',
    config: {
      Env: ENV,
      Entrypoint: ['/opt/calculix/ccx_2.22'],
      Labels: {
        'lafea.nc.solver.binary.sha256': sha256(binary),
        'lafea.nc.solver.source.sha256': sha256(source),
        'lafea.nc.solver.interpreter.sha256': sha256(loader),
      },
    },
    rootfs: { type: 'layers', diff_ids: [layerDiffId] },
  };
  const configBytes = Buffer.from(JSON.stringify(config));
  const configDigest = sha256(configBytes);
  await writeFile(blobPath(layout, configDigest), configBytes);

  const manifest = {
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config: { mediaType: 'application/vnd.oci.image.config.v1+json', digest: configDigest, size: configBytes.length },
    layers: [{ mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip', digest: layerDigest, size: layerSize }],
    annotations: { 'org.opencontainers.image.ref.name': CONTAINER_IMAGE },
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const imageDigest = sha256(manifestBytes);
  await writeFile(blobPath(layout, imageDigest), manifestBytes);
  await writeFile(join(layout, 'oci-layout'), JSON.stringify({ imageLayoutVersion: '1.0.0' }));
  await writeFile(join(layout, 'index.json'), JSON.stringify({
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.index.v1+json',
    manifests: [{
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      digest: tamperIndexDigest ? `sha256:${'0'.repeat(64)}` : imageDigest,
      size: manifestBytes.length,
      platform: { architecture: 'amd64', os: 'linux' },
      annotations: { 'org.opencontainers.image.ref.name': CONTAINER_IMAGE },
    }],
  }));
  const archivePath = join(root, 'fixture.oci.tar');
  run('tar', ['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '--format=gnu', '-C', layout, '-cf', archivePath, '.']);
  const provenance = {
    image: CONTAINER_IMAGE,
    platform: CONTAINER_PLATFORM,
    immutable: true,
    ociArchivePath: OCI_ARCHIVE_RELATIVE_PATH,
    ociArchiveHash: await hashFile(archivePath),
    imageDigest,
    configDigest,
    layerDigest,
    layerDiffId,
    dynamicLoader: { path: '/lib64/ld-linux-x86-64.so.2', sha256: sha256(loader) },
    interpreterEvidence: {
      provenancePath: 'opt/calculix/evidence/metadata/interpreter-provenance.json',
      provenanceHash: sha256(interpreterProvenance),
      probePath: 'opt/calculix/evidence/interpreter/interpreter-probe.txt',
      probeHash: sha256(interpreterProbe),
    },
    priorCustody: {
      inventoryPath: 'opt/calculix/evidence/reports/solver-custody-prior-inventory.json',
      inventoryFileHash: sha256(priorInventory),
      reportPath: 'opt/calculix/evidence/reports/solver-custody-prior-report.json',
      reportFileHash: sha256(priorReport),
    },
  };
  const libraries = [
    { name: 'libfixture.so.1', binaryHash: sha256(sharedLibrary) },
    { name: 'libfixture.a', binaryHash: sha256(staticLibrary) },
  ];
  return {
    root,
    provenance,
    input: {
      archivePath,
      provenance,
      expectedBinaryHash: sha256(binary),
      expectedInterpreterHash: sha256(loader),
      expectedLicenseHash: sha256(license),
      expectedSourceHash: sha256(source),
      expectedLibraries: libraries,
    },
  };
}

function blobPath(layout, digest) {
  return join(layout, 'blobs/sha256', digest.slice(7));
}
async function hashFile(path) {
  return sha256(await readFile(path));
}
function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, `${command}: ${result.stderr || result.stdout}`);
}
function runShell(command) {
  const result = spawnSync('/bin/bash', ['-lc', command], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
