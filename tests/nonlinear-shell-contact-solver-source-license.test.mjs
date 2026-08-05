import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { sha256Bytes } from '../src/core/nonlinear-shell-contact/contracts.js';

const execFileAsync = promisify(execFile);

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'lafea-source-license-'));
  const archivePath = 'CalculiX-cff1bb12ec7d24ad9048a1f54ae243a18d1a0b54.tar.gz';
  const licensePath = 'LICENSE';
  const archiveBytes = Buffer.from('synthetic deterministic source archive');
  const licenseBytes = Buffer.from('GNU GENERAL PUBLIC LICENSE Version 2 synthetic test fixture');
  await writeFile(join(root, archivePath), archiveBytes);
  await writeFile(join(root, licensePath), licenseBytes);
  const provenance = {
    schema: 'calculix-source-license-provenance/v1',
    repository: 'https://github.com/Dhondtguido/CalculiX',
    commit: 'cff1bb12ec7d24ad9048a1f54ae243a18d1a0b54',
    tree: 'f53d7391769d610dcd1247cff8fb953072d11720',
    parent: '4bf1bda9e88de93608d2a6449cf024f77c2f7997',
    commitSubject: '"posted ccx_2.22"',
    archivePolicy: 'GIT_ARCHIVE_TAR_GZIP_N_9',
    archivePrefix: 'CalculiX-cff1bb12ec7d24ad9048a1f54ae243a18d1a0b54/',
    archivePath,
    archiveHash: sha256Bytes(archiveBytes),
    licensePath,
    licenseHash: sha256Bytes(licenseBytes),
    licenseGitBlob: 'd159169d1050894d3ea3b98e1c965c4058208fe1',
    licenseSpdxId: 'GPL-2.0-or-later',
    gitVersion: 'git version synthetic',
  };
  await writeFile(join(root, 'source-license-provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
  return { root, provenance };
}

async function run(root, output) {
  return execFileAsync(process.execPath, [
    'scripts/lafea-nc-solver-source-license-check.mjs',
    `--root=${root}`,
    `--output-dir=${output}`,
  ], { cwd: new URL('..', import.meta.url).pathname });
}

test('source and license acquisition verifies exactly two custody classes and remains blocked', async () => {
  const { root } = await createFixture();
  const output = join(root, 'report');
  await run(root, output);
  const report = JSON.parse(await readFile(join(output, 'solver-custody-report.json'), 'utf8'));
  assert.equal(report.status, 'SOLVER_CUSTODY_BLOCKED');
  assert.equal(report.verifiedEvidenceCount, 2);
  assert.deepEqual(report.verifiedEvidence.map((entry) => entry.id), ['LICENSE_RECORD', 'SOURCE_ARCHIVE']);
  assert.equal(report.missingEvidence.length, 6);
  assert.equal(report.authority.solverCustodyQualified, false);
  assert.equal(report.authority.solverBridgeQualified, false);
});

test('source archive tampering is rejected', async () => {
  const { root, provenance } = await createFixture();
  await writeFile(join(root, provenance.archivePath), 'tampered archive');
  await assert.rejects(run(root, join(root, 'report')), /Source archive hash mismatch/u);
});

test('license tampering is rejected', async () => {
  const { root, provenance } = await createFixture();
  await writeFile(join(root, provenance.licensePath), 'tampered license');
  await assert.rejects(run(root, join(root, 'report')), /License text hash mismatch/u);
});

test('upstream commit drift is rejected', async () => {
  const { root, provenance } = await createFixture();
  provenance.commit = '0123456789abcdef0123456789abcdef01234567';
  await writeFile(join(root, 'source-license-provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
  await assert.rejects(run(root, join(root, 'report')), /must equal cff1bb12/u);
});
