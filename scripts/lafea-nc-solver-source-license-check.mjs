import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  evaluateSolverCustody,
  EXPECTED_SOLVER_IDENTITY,
  REQUIRED_SOLVER_CUSTODY_EVIDENCE,
  sealSolverCustodyInventory,
  SOLVER_CUSTODY_EVIDENCE_SCHEMA,
  validateSolverCustodyInventory,
} from '../src/core/nonlinear-shell-contact/solver-custody-evidence.js';
import {
  assertExactKeys,
  assertGitSha,
  assertHash,
  assertPlainData,
  assertRelativePath,
  assertString,
  sha256Bytes,
} from '../src/core/nonlinear-shell-contact/contracts.js';

const EXPECTED = Object.freeze({
  repository: 'https://github.com/Dhondtguido/CalculiX',
  commit: 'cff1bb12ec7d24ad9048a1f54ae243a18d1a0b54',
  tree: 'f53d7391769d610dcd1247cff8fb953072d11720',
  parent: '4bf1bda9e88de93608d2a6449cf024f77c2f7997',
  commitSubject: '"posted ccx_2.22"',
  licenseGitBlob: 'd159169d1050894d3ea3b98e1c965c4058208fe1',
  licenseSpdxId: 'GPL-2.0-or-later',
  archivePolicy: 'GIT_ARCHIVE_TAR_GZIP_N_9',
});

const args = new Map(process.argv.slice(2).map((entry) => {
  const [key, ...rest] = entry.split('=');
  return [key, rest.join('=')];
}));
const rootDir = resolve(args.get('--root') || 'artifacts/lafea-nc-solver-source-license/work');
const provenancePath = resolve(rootDir, args.get('--provenance') || 'source-license-provenance.json');
const outputDir = resolve(args.get('--output-dir') || 'artifacts/lafea-nc-solver-source-license/report');

const provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
validateProvenance(provenance);
const archiveBytes = await readFile(resolve(rootDir, provenance.archivePath));
const licenseBytes = await readFile(resolve(rootDir, provenance.licensePath));
assert.ok(archiveBytes.length > 0, 'Source archive must not be empty.');
assert.ok(licenseBytes.length > 0, 'License text must not be empty.');
assert.equal(sha256Bytes(archiveBytes), provenance.archiveHash, 'Source archive hash mismatch.');
assert.equal(sha256Bytes(licenseBytes), provenance.licenseHash, 'License text hash mismatch.');

const licenseRecord = {
  spdxId: provenance.licenseSpdxId,
  licenseTextPath: provenance.licensePath,
  licenseTextHash: provenance.licenseHash,
  sourcePath: 'upstream/CalculiX/LICENSE',
};
const licenseRecordPath = 'license-record.json';
const licenseRecordBytes = Buffer.from(`${JSON.stringify(licenseRecord, null, 2)}\n`, 'utf8');
await writeFile(resolve(rootDir, licenseRecordPath), licenseRecordBytes);

const evidence = REQUIRED_SOLVER_CUSTODY_EVIDENCE.map((id) => {
  if (id === 'SOURCE_ARCHIVE') {
    return {
      id,
      status: 'PRESENT',
      path: provenance.archivePath,
      sha256: provenance.archiveHash,
      mediaType: 'application/gzip',
      note: 'Deterministic git archive generated from the exact upstream CalculiX 2.22 commit and retained in the workflow artifact.',
    };
  }
  if (id === 'LICENSE_RECORD') {
    return {
      id,
      status: 'PRESENT',
      path: licenseRecordPath,
      sha256: sha256Bytes(licenseRecordBytes),
      mediaType: 'application/json',
      note: 'Exact upstream LICENSE blob retained with SPDX identity and byte hash.',
    };
  }
  return {
    id,
    status: 'MISSING',
    path: null,
    sha256: null,
    mediaType: null,
    note: `Evidence class ${id} is not supplied by the source-and-license acquisition work package.`,
  };
});
const inventory = sealSolverCustodyInventory({
  schema: SOLVER_CUSTODY_EVIDENCE_SCHEMA,
  solver: EXPECTED_SOLVER_IDENTITY,
  evidence,
  qualificationRequested: true,
});
validateSolverCustodyInventory(inventory);
const report = await evaluateSolverCustody({ inventory, rootDir });
const replay = await evaluateSolverCustody({ inventory, rootDir });
assert.deepEqual(replay, report, 'Source/license custody evaluation must replay deterministically.');
assert.equal(report.status, 'SOLVER_CUSTODY_BLOCKED');
assert.equal(report.verifiedEvidenceCount, 2);
assert.deepEqual(
  report.missingEvidence,
  REQUIRED_SOLVER_CUSTODY_EVIDENCE.filter((id) => !['SOURCE_ARCHIVE', 'LICENSE_RECORD'].includes(id)).sort(),
);
assert.equal(report.authority.solverCustodyQualified, false);
assert.equal(report.authority.solverBridgeQualified, false);
assert.equal(report.authority.productionExecutionAuthorized, false);
assert.equal(report.authority.mergeAuthorized, false);

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, 'source-license-provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
await writeFile(resolve(outputDir, 'solver-custody-inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`);
await writeFile(resolve(outputDir, 'solver-custody-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));

function validateProvenance(value) {
  assertPlainData(value, '$sourceLicenseProvenance');
  assertExactKeys(value, [
    'schema',
    'repository',
    'commit',
    'tree',
    'parent',
    'commitSubject',
    'archivePolicy',
    'archivePrefix',
    'archivePath',
    'archiveHash',
    'licensePath',
    'licenseHash',
    'licenseGitBlob',
    'licenseSpdxId',
    'gitVersion',
  ], '$sourceLicenseProvenance');
  assert.equal(value.schema, 'calculix-source-license-provenance/v1');
  assertString(value.repository, '$sourceLicenseProvenance.repository');
  assertGitSha(value.commit, '$sourceLicenseProvenance.commit');
  assertGitSha(value.tree, '$sourceLicenseProvenance.tree');
  assertGitSha(value.parent, '$sourceLicenseProvenance.parent');
  assertString(value.commitSubject, '$sourceLicenseProvenance.commitSubject');
  assertString(value.archivePolicy, '$sourceLicenseProvenance.archivePolicy');
  assertString(value.archivePrefix, '$sourceLicenseProvenance.archivePrefix');
  assertRelativePath(value.archivePath, '$sourceLicenseProvenance.archivePath');
  assertHash(value.archiveHash, '$sourceLicenseProvenance.archiveHash');
  assertRelativePath(value.licensePath, '$sourceLicenseProvenance.licensePath');
  assertHash(value.licenseHash, '$sourceLicenseProvenance.licenseHash');
  assertGitSha(value.licenseGitBlob, '$sourceLicenseProvenance.licenseGitBlob');
  assertString(value.licenseSpdxId, '$sourceLicenseProvenance.licenseSpdxId');
  assertString(value.gitVersion, '$sourceLicenseProvenance.gitVersion');
  for (const [field, expected] of Object.entries(EXPECTED)) {
    assert.equal(value[field], expected, `$sourceLicenseProvenance.${field} must equal ${expected}.`);
  }
  assert.equal(value.archivePrefix, `CalculiX-${EXPECTED.commit}/`);
}
