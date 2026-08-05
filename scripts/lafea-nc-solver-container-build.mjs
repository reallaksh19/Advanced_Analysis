import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export const CONTAINER_IMAGE = 'local/lafea-nc-calculix-ccx:2.22-cff1bb12';
export const CONTAINER_PLATFORM = 'linux/amd64';
export const OCI_ARCHIVE_RELATIVE_PATH = 'container/calculix-ccx-2.22.oci.tar';
export const EXPECTED_BINARY_HASH = 'sha256:9a33d293706a66bee86f2f0ecf996a66758f904c20d61ad8c83ddc0f92ae4b7e';
export const EXPECTED_LICENSE_HASH = 'sha256:8177f97513213526df2cf6184d8ff986c675afb514d4e68a404010521b880643';
export const EXPECTED_SOURCE_HASH = 'sha256:901908b655837fadc0a2753331bbaf81916ee1701b4c015254f1b09a15eec97f';
export const EXPECTED_PRIOR_INVENTORY_HASH = 'sha256:747e3012e6ae5359246dc6ad4399c66ed1bf504bb2a81e0e1cca5407b89d5c50';
export const EXPECTED_PRIOR_REPORT_HASH = 'sha256:d47aa301103399b999a971e15328ac7152a6c47e8106803aa26975abf38b0120';
const SOURCE_COMMIT = 'cff1bb12ec7d24ad9048a1f54ae243a18d1a0b54';
const FIXED_TIME = '1970-01-01T00:00:00Z';
const FIXED_TAR_TIME = '@0';
const THREAD_ENV = Object.freeze([
  'OMP_NUM_THREADS=1',
  'OPENBLAS_NUM_THREADS=1',
  'MKL_NUM_THREADS=1',
]);

export const EXPECTED_INTERPRETER_HASH = 'sha256:1cd555ac46b7887edeaf3c42aac5408c8135e52f6b37870da2cf82d5fe14e829';
export const EXPECTED_INTERPRETER_PROBE_HASH = 'sha256:b691c15f7284361c87ac69c367499aa32f4a093d640c5dde2b509054c591f1ef';
export const EXPECTED_LINKED_LIBRARIES_AGGREGATE = 'sha256:0f333f2640075aa85769aee392f91b4391adbfe0c2ede84ed890873a1ab237a8';

export async function buildContainerEvidence({ evidenceRoot, outputDir }) {
  const sourceRoot = resolve(evidenceRoot);
  const destination = resolve(outputDir);
  await verifyPriorEvidence(sourceRoot);
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await cp(sourceRoot, destination, { recursive: true, dereference: false, preserveTimestamps: false });

  const workRoot = await mkdtemp(join(tmpdir(), 'lafea-nc-oci-build-'));
  try {
    const rootfs = join(workRoot, 'rootfs');
    const layout = join(workRoot, 'oci-layout');
    await assembleRootfs(destination, rootfs);
    const runtimeProbe = await executeRuntimeProbe(rootfs);
    await mkdir(join(destination, 'container'), { recursive: true });
    await mkdir(join(destination, 'metadata'), { recursive: true });
    await writeFile(join(destination, 'container/runtime-probe.txt'), runtimeProbe.text, 'utf8');

    const layerTar = join(workRoot, 'rootfs-layer.tar');
    const layerGzip = `${layerTar}.gz`;
    run('tar', [
      '--sort=name',
      `--mtime=${FIXED_TAR_TIME}`,
      '--owner=0',
      '--group=0',
      '--numeric-owner',
      '--format=gnu',
      '-C', rootfs,
      '-cf', layerTar,
      '.',
    ]);
    runShell(`gzip -n -9 -c ${shellQuote(layerTar)} > ${shellQuote(layerGzip)}`);
    const diffId = await hashFile(layerTar);
    const layerDigest = await hashFile(layerGzip);
    const layerSize = (await stat(layerGzip)).size;

    await mkdir(join(layout, 'blobs/sha256'), { recursive: true });
    const config = {
      created: FIXED_TIME,
      architecture: 'amd64',
      os: 'linux',
      config: {
        Env: [...THREAD_ENV, 'LD_LIBRARY_PATH=/lib/x86_64-linux-gnu'],
        Entrypoint: ['/opt/calculix/ccx_2.22'],
        Labels: {
          'org.opencontainers.image.title': 'LAFEA-NC CalculiX CrunchiX',
          'org.opencontainers.image.version': '2.22',
          'org.opencontainers.image.revision': SOURCE_COMMIT,
          'org.opencontainers.image.source': 'https://github.com/Dhondtguido/CalculiX',
          'org.opencontainers.image.licenses': 'GPL-2.0-or-later',
          'org.opencontainers.image.created': FIXED_TIME,
          'lafea.nc.solver.binary.sha256': EXPECTED_BINARY_HASH,
          'lafea.nc.solver.source.sha256': EXPECTED_SOURCE_HASH,
          'lafea.nc.solver.interpreter.sha256': EXPECTED_INTERPRETER_HASH,
          'lafea.nc.solver.prior-inventory.semantic-sha256': EXPECTED_PRIOR_INVENTORY_HASH,
        },
      },
      rootfs: { type: 'layers', diff_ids: [diffId] },
      history: [{
        created: FIXED_TIME,
        created_by: 'LAFEA-NC deterministic OCI assembly from sealed interpreter-custody evidence',
        comment: 'No mutable base image; exact binary, libraries, dynamic loader, source archive and license are carried in one governed layer.',
      }],
    };
    const configBytes = Buffer.from(JSON.stringify(config), 'utf8');
    const configDigest = sha256(configBytes);
    await writeBlob(layout, configDigest, configBytes);

    const manifest = {
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      config: {
        mediaType: 'application/vnd.oci.image.config.v1+json',
        digest: configDigest,
        size: configBytes.length,
      },
      layers: [{
        mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
        digest: layerDigest,
        size: layerSize,
      }],
      annotations: {
        'org.opencontainers.image.ref.name': CONTAINER_IMAGE,
        'org.opencontainers.image.revision': SOURCE_COMMIT,
      },
    };
    const manifestBytes = Buffer.from(JSON.stringify(manifest), 'utf8');
    const manifestDigest = sha256(manifestBytes);
    await writeBlob(layout, manifestDigest, manifestBytes);
    await copyFile(layerGzip, blobPath(layout, layerDigest));
    await writeFile(join(layout, 'oci-layout'), JSON.stringify({ imageLayoutVersion: '1.0.0' }), 'utf8');
    await writeFile(join(layout, 'index.json'), JSON.stringify({
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.index.v1+json',
      manifests: [{
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        digest: manifestDigest,
        size: manifestBytes.length,
        platform: { architecture: 'amd64', os: 'linux' },
        annotations: { 'org.opencontainers.image.ref.name': CONTAINER_IMAGE },
      }],
    }), 'utf8');

    const archivePath = join(destination, OCI_ARCHIVE_RELATIVE_PATH);
    run('tar', [
      '--sort=name',
      `--mtime=${FIXED_TAR_TIME}`,
      '--owner=0',
      '--group=0',
      '--numeric-owner',
      '--format=gnu',
      '-C', layout,
      '-cf', archivePath,
      '.',
    ]);
    const archiveHash = await hashFile(archivePath);
    const loaderPath = join(rootfs, 'lib64/ld-linux-x86-64.so.2');
    const loaderHash = await hashFile(loaderPath);
    const libraries = JSON.parse(await readFile(join(destination, 'records/linked-libraries-record.json'), 'utf8')).libraries;
    const provenance = {
      schema: 'lafea-nc-solver-container-provenance/v1',
      image: CONTAINER_IMAGE,
      platform: CONTAINER_PLATFORM,
      sourceCommit: SOURCE_COMMIT,
      sourceArchiveHash: EXPECTED_SOURCE_HASH,
      executableHash: EXPECTED_BINARY_HASH,
      licenseTextHash: EXPECTED_LICENSE_HASH,
      imageDigest: manifestDigest,
      configDigest,
      layerDigest,
      layerDiffId: diffId,
      ociArchivePath: OCI_ARCHIVE_RELATIVE_PATH,
      ociArchiveHash: archiveHash,
      dynamicLoader: { path: '/lib64/ld-linux-x86-64.so.2', sha256: loaderHash },
      libraries: libraries.map(({ name, version, binaryHash }) => ({ name, version, binaryHash })),
      interpreterEvidence: {
        provenancePath: 'opt/calculix/evidence/metadata/interpreter-provenance.json',
        provenanceHash: await hashFile(join(rootfs, 'opt/calculix/evidence/metadata/interpreter-provenance.json')),
        probePath: 'opt/calculix/evidence/interpreter/interpreter-probe.txt',
        probeHash: EXPECTED_INTERPRETER_PROBE_HASH,
      },
      priorCustody: {
        inventoryPath: 'opt/calculix/evidence/reports/solver-custody-prior-inventory.json',
        inventoryFileHash: await hashFile(join(rootfs, 'opt/calculix/evidence/reports/solver-custody-prior-inventory.json')),
        inventorySemanticHash: EXPECTED_PRIOR_INVENTORY_HASH,
        reportPath: 'opt/calculix/evidence/reports/solver-custody-prior-report.json',
        reportFileHash: await hashFile(join(rootfs, 'opt/calculix/evidence/reports/solver-custody-prior-report.json')),
        reportSemanticHash: EXPECTED_PRIOR_REPORT_HASH,
      },
      runtimeProbe: {
        path: 'container/runtime-probe.txt',
        sha256: sha256(Buffer.from(runtimeProbe.text, 'utf8')),
        exitCode: runtimeProbe.exitCode,
        expectedUsage: 'Usage: CalculiX.exe -i jobname',
      },
      immutable: true,
    };
    await writeFile(join(destination, 'metadata/container-provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
    return provenance;
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
}

async function verifyPriorEvidence(root) {
  const report = JSON.parse(await readFile(join(root, 'reports-interpreter/solver-custody-build-report.json'), 'utf8'));
  const inventory = JSON.parse(await readFile(join(root, 'reports-interpreter/solver-custody-build-inventory.json'), 'utf8'));
  assert.equal(report.status, 'SOLVER_CUSTODY_BLOCKED');
  assert.equal(report.verifiedEvidenceCount, 7);
  assert.deepEqual(report.missingEvidence, ['CONTAINER_RECORD']);
  assert.equal(report.reportSemanticHash, EXPECTED_PRIOR_REPORT_HASH);
  assert.equal(inventory.inventoryHash, EXPECTED_PRIOR_INVENTORY_HASH);
  assert.equal(await hashFile(join(root, 'binary/ccx_2.22')), EXPECTED_BINARY_HASH);
  assert.equal(await hashFile(join(root, `source/CalculiX-${SOURCE_COMMIT}.tar.gz`)), EXPECTED_SOURCE_HASH);
  assert.equal(await hashFile(join(root, 'source/LICENSE')), EXPECTED_LICENSE_HASH);
  const interpreter = JSON.parse(await readFile(join(root, 'metadata/interpreter-provenance.json'), 'utf8'));
  assert.equal(interpreter.interpreterHash, EXPECTED_INTERPRETER_HASH);
  assert.equal(interpreter.probeHash, EXPECTED_INTERPRETER_PROBE_HASH);
  assert.equal(interpreter.runtimeExitCode, 201);
  assert.equal(await hashFile(join(root, interpreter.retainedPath)), EXPECTED_INTERPRETER_HASH);
  assert.equal(await hashFile(join(root, interpreter.probePath)), EXPECTED_INTERPRETER_PROBE_HASH);
  const linked = JSON.parse(await readFile(join(root, 'records/linked-libraries-record.json'), 'utf8'));
  assert.equal(linked.aggregateHash, EXPECTED_LINKED_LIBRARIES_AGGREGATE);
}

async function assembleRootfs(evidenceRoot, rootfs) {
  await mkdir(join(rootfs, 'opt/calculix/evidence/libraries'), { recursive: true });
  await mkdir(join(rootfs, 'opt/calculix/evidence/records'), { recursive: true });
  await mkdir(join(rootfs, 'opt/calculix/evidence/metadata'), { recursive: true });
  await mkdir(join(rootfs, 'opt/calculix/evidence/interpreter'), { recursive: true });
  await mkdir(join(rootfs, 'opt/calculix/evidence/reports'), { recursive: true });
  await mkdir(join(rootfs, 'lib/x86_64-linux-gnu'), { recursive: true });
  await mkdir(join(rootfs, 'lib64'), { recursive: true });
  await mkdir(join(rootfs, 'usr/share/licenses/calculix'), { recursive: true });
  await mkdir(join(rootfs, 'usr/src/calculix'), { recursive: true });

  const executable = join(evidenceRoot, 'binary/ccx_2.22');
  const executableTarget = join(rootfs, 'opt/calculix/ccx_2.22');
  await copyFile(executable, executableTarget);
  await chmod(executableTarget, 0o755);
  await copyFile(join(evidenceRoot, 'source/LICENSE'), join(rootfs, 'usr/share/licenses/calculix/LICENSE'));
  await copyFile(
    join(evidenceRoot, `source/CalculiX-${SOURCE_COMMIT}.tar.gz`),
    join(rootfs, `usr/src/calculix/CalculiX-${SOURCE_COMMIT}.tar.gz`),
  );

  const recordNames = [
    'build-record.json',
    'license-record.json',
    'linked-libraries-record.json',
    'platform-record.json',
    'thread-policy-record.json',
  ];
  for (const name of recordNames) {
    await copyFile(join(evidenceRoot, 'records', name), join(rootfs, 'opt/calculix/evidence/records', name));
  }
  await copyFile(
    join(evidenceRoot, 'metadata/interpreter-provenance.json'),
    join(rootfs, 'opt/calculix/evidence/metadata/interpreter-provenance.json'),
  );
  await copyFile(
    join(evidenceRoot, 'interpreter/interpreter-probe.txt'),
    join(rootfs, 'opt/calculix/evidence/interpreter/interpreter-probe.txt'),
  );
  await copyFile(
    join(evidenceRoot, 'reports-interpreter/solver-custody-build-inventory.json'),
    join(rootfs, 'opt/calculix/evidence/reports/solver-custody-prior-inventory.json'),
  );
  await copyFile(
    join(evidenceRoot, 'reports-interpreter/solver-custody-build-report.json'),
    join(rootfs, 'opt/calculix/evidence/reports/solver-custody-prior-report.json'),
  );

  const linked = JSON.parse(await readFile(join(evidenceRoot, 'records/linked-libraries-record.json'), 'utf8'));
  for (const library of linked.libraries) {
    const source = join(evidenceRoot, library.path);
    assert.equal(await hashFile(source), library.binaryHash, `Linked library drift: ${library.name}`);
    const name = basename(library.path);
    await copyFile(source, join(rootfs, 'opt/calculix/evidence/libraries', name));
    if (name === 'ld-linux-x86-64.so.2') {
      await copyFile(source, join(rootfs, 'lib64/ld-linux-x86-64.so.2'));
      await chmod(join(rootfs, 'lib64/ld-linux-x86-64.so.2'), 0o755);
    } else if (name.endsWith('.so') || name.includes('.so.')) {
      await copyFile(source, join(rootfs, 'lib/x86_64-linux-gnu', name));
    }
  }
}

async function executeRuntimeProbe(rootfs) {
  const chroot = '/usr/sbin/chroot';
  const chrootArgs = [rootfs, '/opt/calculix/ccx_2.22'];
  const command = process.getuid?.() === 0 ? chroot : '/usr/bin/sudo';
  const args = process.getuid?.() === 0 ? chrootArgs : [chroot, ...chrootArgs];
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    env: {
      PATH: '/usr/sbin:/usr/bin:/sbin:/bin',
      OMP_NUM_THREADS: '1',
      OPENBLAS_NUM_THREADS: '1',
      MKL_NUM_THREADS: '1',
      LD_LIBRARY_PATH: '/lib/x86_64-linux-gnu',
    },
  });
  const exitCode = result.status;
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const combined = `${stdout}\n${stderr}`;
  assert.equal(exitCode, 201, `OCI rootfs runtime probe must exit 201, received ${exitCode}: ${combined}`);
  assert.match(combined, /Usage: CalculiX\.exe -i jobname/);
  const text = [
    'schema=lafea-nc-solver-container-runtime-probe/v1',
    `exitCode=${exitCode}`,
    ...THREAD_ENV,
    'LD_LIBRARY_PATH=/lib/x86_64-linux-gnu',
    `stdoutSha256=${sha256(Buffer.from(stdout, 'utf8'))}`,
    `stderrSha256=${sha256(Buffer.from(stderr, 'utf8'))}`,
    '--- stdout ---',
    stdout.trimEnd(),
    '--- stderr ---',
    stderr.trimEnd(),
    '',
  ].join('\n');
  return { exitCode, stdout, stderr, text };
}

async function writeBlob(layout, digest, bytes) {
  await writeFile(blobPath(layout, digest), bytes);
}
function blobPath(layout, digest) {
  assert.match(digest, /^sha256:[0-9a-f]{64}$/);
  return join(layout, 'blobs/sha256', digest.slice(7));
}
async function hashFile(path) {
  return sha256(await readFile(path));
}
function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}):\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
}
function runShell(command) {
  const result = spawnSync('/bin/bash', ['-lc', command], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Shell command failed (${result.status}): ${command}\n${result.stderr || ''}`);
}
function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

async function main() {
  const args = new Map(process.argv.slice(2).map((entry) => {
    const [key, ...rest] = entry.split('=');
    return [key, rest.join('=')];
  }));
  const evidenceRoot = args.get('--evidence-root');
  const outputDir = args.get('--output-dir');
  if (!evidenceRoot || !outputDir) throw new TypeError('--evidence-root and --output-dir are required.');
  const provenance = await buildContainerEvidence({ evidenceRoot, outputDir });
  console.log(JSON.stringify(provenance));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
