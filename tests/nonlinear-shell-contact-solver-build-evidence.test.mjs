import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { sha256Bytes } from '../src/core/nonlinear-shell-contact/contracts.js';

const execFileAsync = promisify(execFile);
const commit = 'cff1bb12ec7d24ad9048a1f54ae243a18d1a0b54';
const repoRoot = new URL('..', import.meta.url).pathname;

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'lafea-build-evidence-'));
  for (const directory of ['source', 'binary', 'build', 'platform', 'libraries', 'thread', 'metadata']) {
    await mkdir(join(root, directory), { recursive: true });
  }
  const sourceBytes = Buffer.from('synthetic exact source archive');
  const licenseBytes = Buffer.from('synthetic GPL-2.0-or-later license');
  await writeFile(join(root, `source/CalculiX-${commit}.tar.gz`), sourceBytes);
  await writeFile(join(root, 'source/LICENSE'), licenseBytes);
  await writeFile(join(root, 'binary/ccx_2.22'), 'synthetic executable');
  await writeFile(join(root, 'build/build.log'), 'deterministic build log');
  await writeFile(join(root, 'platform/platform-probe.txt'), 'deterministic platform probe');
  await writeFile(join(root, 'thread/thread-probe.txt'), 'OMP_NUM_THREADS=1');
  await writeFile(join(root, 'libraries/libspooles.a'), 'spooles');
  await writeFile(join(root, 'libraries/libarpack.a'), 'arpack');
  await writeJson(join(root, 'metadata/build-input.json'), {
    compilerId: 'gcc+gfortran', compilerVersion: 'synthetic', sourceArchiveHash: sha256Bytes(sourceBytes),
    licenseTextHash: sha256Bytes(licenseBytes), canonicalBuildCommand: 'synthetic deterministic build',
    compilerFlags: ['-O2', '-fallow-argument-mismatch'],
  });
  await writeJson(join(root, 'metadata/platform-input.json'), {
    os: 'Synthetic Linux', architecture: 'x86_64', libc: 'synthetic libc', kernel: 'synthetic kernel',
  });
  await writeJson(join(root, 'metadata/libraries-input.json'), [
    { name: 'libarpack.a', version: 'synthetic', path: 'libraries/libarpack.a' },
    { name: 'libspooles.a', version: '2.2', path: 'libraries/libspooles.a' },
  ]);
  await writeJson(join(root, 'metadata/thread-input.json'), {
    environmentVariables: { OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1' },
  });
  return root;
}

test('controlled build evidence verifies seven classes and remains blocked only on container custody', async () => {
  const root = await fixture();
  const output = join(root, 'reports');
  await run(root, output);
  const report = JSON.parse(await readFile(join(output, 'solver-custody-build-report.json'), 'utf8'));
  assert.equal(report.status, 'SOLVER_CUSTODY_BLOCKED');
  assert.equal(report.verifiedEvidenceCount, 7);
  assert.deepEqual(report.missingEvidence, ['CONTAINER_RECORD']);
  assert.equal(report.authority.solverCustodyQualified, false);
  assert.equal(report.authority.solverBridgeQualified, false);
  assert.equal(report.authority.mergeAuthorized, false);
});

test('executable tampering is rejected by the generated inventory', async () => {
  const root = await fixture();
  const output = join(root, 'reports');
  await run(root, output);
  const inventory = JSON.parse(await readFile(join(output, 'solver-custody-build-inventory.json'), 'utf8'));
  await writeFile(join(root, 'binary/ccx_2.22'), 'tampered executable');
  const { evaluateSolverCustody } = await import('../src/core/nonlinear-shell-contact/solver-custody-evidence.js');
  const report = await evaluateSolverCustody({ inventory, rootDir: root });
  assert.equal(report.status, 'SOLVER_CUSTODY_BLOCKED');
  assert.ok(report.blockers.some((entry) => entry.startsWith('EVIDENCE_INVALID:EXECUTABLE_BINARY:hash mismatch')));
});

async function run(root, output) {
  await execFileAsync(process.execPath, ['scripts/lafea-nc-solver-build-evidence-check.mjs', `--root=${root}`, `--output-dir=${output}`], { cwd: repoRoot });
}
async function writeJson(path, value) { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
