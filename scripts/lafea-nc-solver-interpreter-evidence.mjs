import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

export const EXPECTED_BINARY_HASH = 'sha256:9a33d293706a66bee86f2f0ecf996a66758f904c20d61ad8c83ddc0f92ae4b7e';
export const EXPECTED_SOURCE_HASH = 'sha256:901908b655837fadc0a2753331bbaf81916ee1701b4c015254f1b09a15eec97f';
export const EXPECTED_LICENSE_HASH = 'sha256:8177f97513213526df2cf6184d8ff986c675afb514d4e68a404010521b880643';
export const EXPECTED_INTERPRETER_PATH = '/lib64/ld-linux-x86-64.so.2';
const SOURCE_COMMIT = 'cff1bb12ec7d24ad9048a1f54ae243a18d1a0b54';
const THREAD_ENV = Object.freeze({
  OMP_NUM_THREADS: '1',
  OPENBLAS_NUM_THREADS: '1',
  MKL_NUM_THREADS: '1',
});

export function parseElfInterpreter(readelfOutput) {
  assert.equal(typeof readelfOutput, 'string');
  const match = readelfOutput.match(/Requesting program interpreter:\s*([^\]]+)\]/);
  if (!match) throw new TypeError('ELF program interpreter is missing.');
  const value = match[1].trim();
  if (value !== EXPECTED_INTERPRETER_PATH) {
    throw new TypeError(`ELF program interpreter must equal ${EXPECTED_INTERPRETER_PATH}; received ${value}.`);
  }
  return value;
}

export function mergeLibraryInput(entries, interpreterEntry) {
  assert.ok(Array.isArray(entries));
  assert.equal(interpreterEntry.name, 'ld-linux-x86-64.so.2');
  assert.equal(interpreterEntry.path, 'libraries/ld-linux-x86-64.so.2');
  const filtered = entries.filter((entry) => entry.name !== interpreterEntry.name && entry.path !== interpreterEntry.path);
  const merged = [...filtered, interpreterEntry];
  merged.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  return merged;
}

export async function acquireInterpreterEvidence({ buildRoot, outputDir }) {
  const sourceRoot = resolve(buildRoot);
  const destination = resolve(outputDir);
  await verifyPriorBuild(sourceRoot);
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await cp(sourceRoot, destination, { recursive: true, dereference: false, preserveTimestamps: false });

  const binaryPath = join(destination, 'binary/ccx_2.22');
  const readelf = run('readelf', ['-l', binaryPath]).stdout;
  const interpreterPath = parseElfInterpreter(readelf);
  const resolvedInterpreter = await realpath(interpreterPath);
  const interpreterHash = await hashFile(resolvedInterpreter);
  const libcVersion = run('dpkg-query', ['-W', '-f=${Version}', 'libc6']).stdout.trim();
  assert.ok(libcVersion.length > 0);

  await mkdir(join(destination, 'libraries'), { recursive: true });
  const retainedInterpreter = join(destination, 'libraries/ld-linux-x86-64.so.2');
  await copyFile(resolvedInterpreter, retainedInterpreter);
  await chmod(retainedInterpreter, 0o755);
  assert.equal(await hashFile(retainedInterpreter), interpreterHash);

  const librariesInputPath = join(destination, 'metadata/libraries-input.json');
  const librariesInput = JSON.parse(await readFile(librariesInputPath, 'utf8'));
  const interpreterEntry = {
    name: 'ld-linux-x86-64.so.2',
    version: `libc6-${libcVersion}`,
    path: 'libraries/ld-linux-x86-64.so.2',
  };
  const merged = mergeLibraryInput(librariesInput, interpreterEntry);
  await writeFile(librariesInputPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

  const runtime = await executeRetainedRuntime(destination);
  await mkdir(join(destination, 'interpreter'), { recursive: true });
  const probe = [
    'schema=lafea-nc-solver-interpreter-probe/v1',
    `binaryHash=${EXPECTED_BINARY_HASH}`,
    `interpreterPath=${interpreterPath}`,
    `resolvedInterpreter=${resolvedInterpreter}`,
    `interpreterHash=${interpreterHash}`,
    `libc6Version=${libcVersion}`,
    `runtimeExitCode=${runtime.exitCode}`,
    `stdoutSha256=${sha256(Buffer.from(runtime.stdout, 'utf8'))}`,
    `stderrSha256=${sha256(Buffer.from(runtime.stderr, 'utf8'))}`,
    '--- stdout ---',
    runtime.stdout.trimEnd(),
    '--- stderr ---',
    runtime.stderr.trimEnd(),
    '',
  ].join('\n');
  await writeFile(join(destination, 'interpreter/interpreter-probe.txt'), probe, 'utf8');
  const provenance = {
    schema: 'lafea-nc-solver-interpreter-provenance/v1',
    binaryHash: EXPECTED_BINARY_HASH,
    interpreterPath,
    retainedPath: 'libraries/ld-linux-x86-64.so.2',
    interpreterHash,
    package: 'libc6',
    packageVersion: libcVersion,
    probePath: 'interpreter/interpreter-probe.txt',
    probeHash: sha256(Buffer.from(probe, 'utf8')),
    runtimeExitCode: runtime.exitCode,
    deterministicThreadEnvironment: THREAD_ENV,
  };
  await writeFile(join(destination, 'metadata/interpreter-provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
  return provenance;
}

async function verifyPriorBuild(root) {
  const report = JSON.parse(await readFile(join(root, 'reports-final/solver-custody-build-report.json'), 'utf8'));
  assert.equal(report.status, 'SOLVER_CUSTODY_BLOCKED');
  assert.equal(report.verifiedEvidenceCount, 7);
  assert.deepEqual(report.missingEvidence, ['CONTAINER_RECORD']);
  assert.equal(await hashFile(join(root, 'binary/ccx_2.22')), EXPECTED_BINARY_HASH);
  assert.equal(await hashFile(join(root, `source/CalculiX-${SOURCE_COMMIT}.tar.gz`)), EXPECTED_SOURCE_HASH);
  assert.equal(await hashFile(join(root, 'source/LICENSE')), EXPECTED_LICENSE_HASH);
}

async function executeRetainedRuntime(evidenceRoot) {
  const work = await mkdtemp(join(tmpdir(), 'lafea-nc-interpreter-'));
  try {
    const rootfs = join(work, 'rootfs');
    await mkdir(join(rootfs, 'opt/calculix'), { recursive: true });
    await mkdir(join(rootfs, 'lib/x86_64-linux-gnu'), { recursive: true });
    await mkdir(join(rootfs, 'lib64'), { recursive: true });
    const binaryTarget = join(rootfs, 'opt/calculix/ccx_2.22');
    await copyFile(join(evidenceRoot, 'binary/ccx_2.22'), binaryTarget);
    await chmod(binaryTarget, 0o755);
    const libraries = JSON.parse(await readFile(join(evidenceRoot, 'metadata/libraries-input.json'), 'utf8'));
    for (const entry of libraries) {
      const source = join(evidenceRoot, entry.path);
      if (entry.name === 'ld-linux-x86-64.so.2') {
        await copyFile(source, join(rootfs, 'lib64/ld-linux-x86-64.so.2'));
        await chmod(join(rootfs, 'lib64/ld-linux-x86-64.so.2'), 0o755);
      } else if (entry.name.endsWith('.so') || entry.name.includes('.so.')) {
        await copyFile(source, join(rootfs, 'lib/x86_64-linux-gnu', basename(entry.path)));
      }
    }
    const commandArgs = [
      'env', '-i',
      ...Object.entries(THREAD_ENV).map(([key, value]) => `${key}=${value}`),
      'LD_LIBRARY_PATH=/lib/x86_64-linux-gnu',
      'chroot', rootfs,
      '/opt/calculix/ccx_2.22',
    ];
    const command = process.getuid?.() === 0 ? commandArgs.shift() : 'sudo';
    const result = spawnSync(command, commandArgs, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    assert.equal(result.status, 201, `Retained runtime must exit 201: ${stdout}\n${stderr}`);
    assert.match(`${stdout}\n${stderr}`, /Usage: CalculiX\.exe -i jobname/);
    return { exitCode: result.status, stdout, stderr };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function hashFile(path) {
  return sha256(await readFile(path));
}
function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}): ${result.stdout || ''}\n${result.stderr || ''}`);
  }
  return result;
}

async function main() {
  const args = new Map(process.argv.slice(2).map((entry) => {
    const [key, ...rest] = entry.split('=');
    return [key, rest.join('=')];
  }));
  const buildRoot = args.get('--build-root');
  const outputDir = args.get('--output-dir');
  if (!buildRoot || !outputDir) throw new TypeError('--build-root and --output-dir are required.');
  console.log(JSON.stringify(await acquireInterpreterEvidence({ buildRoot, outputDir })));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
