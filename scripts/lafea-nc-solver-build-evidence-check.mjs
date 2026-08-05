import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  evaluateSolverCustody,
  EXPECTED_SOLVER_IDENTITY,
  REQUIRED_SOLVER_CUSTODY_EVIDENCE,
  sealSolverCustodyInventory,
  SOLVER_CUSTODY_EVIDENCE_SCHEMA,
  validateSolverCustodyInventory,
} from '../src/core/nonlinear-shell-contact/solver-custody-evidence.js';
import { semanticHash, sha256Bytes } from '../src/core/nonlinear-shell-contact/contracts.js';

const args = new Map(process.argv.slice(2).map((entry) => {
  const [key, ...rest] = entry.split('=');
  return [key, rest.join('=')];
}));
const rootDir = resolve(requiredArg('--root'));
const outputDir = resolve(args.get('--output-dir') || resolve(rootDir, 'reports'));

const metadata = await readJson(resolve(rootDir, 'metadata/build-input.json'));
const platformInput = await readJson(resolve(rootDir, 'metadata/platform-input.json'));
const librariesInput = await readJson(resolve(rootDir, 'metadata/libraries-input.json'));
const threadInput = await readJson(resolve(rootDir, 'metadata/thread-input.json'));

const sourceArchivePath = `source/CalculiX-${EXPECTED_SOLVER_IDENTITY.sourceCommit}.tar.gz`;
const sourceArchiveHash = await hashFile(sourceArchivePath);
assert.equal(sourceArchiveHash, metadata.sourceArchiveHash, 'Source archive hash must match retained upstream evidence.');
const executableHash = await hashFile('binary/ccx_2.22');
const buildLogHash = await hashFile('build/build.log');
const platformProbeHash = await hashFile('platform/platform-probe.txt');
const threadProbeHash = await hashFile('thread/thread-probe.txt');
const licenseTextHash = await hashFile('source/LICENSE');
assert.equal(licenseTextHash, metadata.licenseTextHash, 'License hash must match retained upstream evidence.');

const buildRecord = {
  sourceCommit: EXPECTED_SOLVER_IDENTITY.sourceCommit,
  compilerId: metadata.compilerId,
  compilerVersion: metadata.compilerVersion,
  compilerFlags: metadata.compilerFlags,
  buildCommandHash: sha256Bytes(Buffer.from(metadata.canonicalBuildCommand, 'utf8')),
  buildLogPath: 'build/build.log',
  buildLogHash,
};
const platformRecord = {
  os: platformInput.os,
  architecture: platformInput.architecture,
  libc: platformInput.libc,
  kernel: platformInput.kernel,
  platformFingerprintHash: semanticHash(platformInput),
  probePath: 'platform/platform-probe.txt',
  probeHash: platformProbeHash,
};
const libraries = [];
for (const entry of librariesInput) {
  libraries.push({ name: entry.name, version: entry.version, path: entry.path, binaryHash: await hashFile(entry.path) });
}
libraries.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
const linkedLibrariesRecord = { libraries, aggregateHash: semanticHash(libraries) };
const threadPolicyRecord = {
  threadCount: 1,
  environmentVariables: threadInput.environmentVariables,
  deterministic: true,
  probePath: 'thread/thread-probe.txt',
  probeHash: threadProbeHash,
};
const licenseRecord = {
  spdxId: 'GPL-2.0-or-later',
  licenseTextPath: 'source/LICENSE',
  licenseTextHash,
  sourcePath: 'upstream/CalculiX/LICENSE',
};

await writeJson('records/build-record.json', buildRecord);
await writeJson('records/platform-record.json', platformRecord);
await writeJson('records/linked-libraries-record.json', linkedLibrariesRecord);
await writeJson('records/thread-policy-record.json', threadPolicyRecord);
await writeJson('records/license-record.json', licenseRecord);

const records = new Map([
  ['BUILD_RECORD', ['records/build-record.json', 'application/json']],
  ['PLATFORM_RECORD', ['records/platform-record.json', 'application/json']],
  ['LINKED_LIBRARIES_RECORD', ['records/linked-libraries-record.json', 'application/json']],
  ['THREAD_POLICY_RECORD', ['records/thread-policy-record.json', 'application/json']],
  ['LICENSE_RECORD', ['records/license-record.json', 'application/json']],
]);
const evidence = [];
for (const id of REQUIRED_SOLVER_CUSTODY_EVIDENCE) {
  if (id === 'SOURCE_ARCHIVE') {
    evidence.push(present(id, sourceArchivePath, sourceArchiveHash, 'application/gzip', 'Exact deterministic source archive from the source-and-license evidence run.'));
  } else if (id === 'EXECUTABLE_BINARY') {
    evidence.push(present(id, 'binary/ccx_2.22', executableHash, 'application/octet-stream', 'Byte-identical executable produced by two independent controlled builds.'));
  } else if (id === 'CONTAINER_RECORD') {
    evidence.push(missing(id, 'Immutable OCI image evidence is deferred to a separate bounded work package.'));
  } else {
    const [path, mediaType] = records.get(id);
    evidence.push(present(id, path, await hashFile(path), mediaType, `Controlled ${id.toLowerCase().replaceAll('_', ' ')} evidence.`));
  }
}
const inventory = sealSolverCustodyInventory({
  schema: SOLVER_CUSTODY_EVIDENCE_SCHEMA,
  solver: EXPECTED_SOLVER_IDENTITY,
  evidence,
  qualificationRequested: true,
});
validateSolverCustodyInventory(inventory);
const report = await evaluateSolverCustody({ inventory, rootDir });
const replay = await evaluateSolverCustody({ inventory, rootDir });
assert.deepEqual(replay, report, 'Build custody evaluation must replay deterministically.');
assert.equal(report.status, 'SOLVER_CUSTODY_BLOCKED');
assert.equal(report.verifiedEvidenceCount, 7);
assert.deepEqual(report.missingEvidence, ['CONTAINER_RECORD']);
assert.equal(report.authority.solverCustodyQualified, false);
assert.equal(report.authority.solverBridgeQualified, false);
assert.equal(report.authority.productionExecutionAuthorized, false);
assert.equal(report.authority.mergeAuthorized, false);

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, 'solver-custody-build-inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
await writeFile(resolve(outputDir, 'solver-custody-build-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));

function requiredArg(name) {
  const value = args.get(name);
  if (!value) throw new TypeError(`${name} is required.`);
  return value;
}
function present(id, path, sha256, mediaType, note) {
  return { id, status: 'PRESENT', path, sha256, mediaType, note };
}
function missing(id, note) {
  return { id, status: 'MISSING', path: null, sha256: null, mediaType: null, note };
}
async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function hashFile(relativePath) {
  const bytes = await readFile(resolve(rootDir, relativePath));
  assert.ok(bytes.length > 0, `${relativePath} must not be empty.`);
  return sha256Bytes(bytes);
}
async function writeJson(relativePath, value) {
  const path = resolve(rootDir, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
