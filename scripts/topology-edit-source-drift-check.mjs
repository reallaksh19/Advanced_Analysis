import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const EXPECTED_SOURCE_REPOSITORY = 'reallaksh19/XML_Compare_Utilities';
export const EXPECTED_SOURCE_COMMIT = 'c20bb037566d52ba5b789712594b754a5fb94651';
export const EXPECTED_TARGET_REPOSITORY = 'reallaksh19/Advanced_Analysis';
export const EXPECTED_MANIFEST_SHA256 = '0a87324db3d92ac4cc0466cc44acb6131f76d889978ab07c40f007ab4899433d';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_MANIFEST_PATH = path.join(
  REPOSITORY_ROOT,
  'src/vendor/topology-edit/source-manifest.json',
);
const ALLOWED_TREATMENTS = new Set([
  'AS_IS',
  'WRAPPED',
  'FORKED',
  'REFERENCE_ONLY',
]);

export function gitBlobSha(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return crypto
    .createHash('sha1')
    .update(Buffer.from(`blob ${buffer.length}\0`))
    .update(buffer)
    .digest('hex');
}

export function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function assertHex(value, length, label) {
  assert.match(
    value,
    new RegExp(`^[a-f0-9]{${length}}$`),
    `${label} must be a lowercase ${length}-character hexadecimal digest`,
  );
}

function validateWaiver(waiver, now = new Date()) {
  assert.match(waiver.id, /^TED-DRIFT-\d{3}$/);
  assert.ok(waiver.reason, `${waiver.id} is missing reason`);
  assert.ok(waiver.behavioralDelta, `${waiver.id} is missing behavioralDelta`);
  assert.ok(waiver.approvedBy, `${waiver.id} is missing approvedBy`);
  assert.ok(Array.isArray(waiver.tests) && waiver.tests.length > 0);
  assert.ok(new Date(waiver.expiresAt) > now, `${waiver.id} is expired`);
}

export async function verifySourceManifest({
  manifestPath = DEFAULT_MANIFEST_PATH,
  expectedManifestSha256 = EXPECTED_MANIFEST_SHA256,
  repositoryRoot = REPOSITORY_ROOT,
} = {}) {
  const bytes = await readFile(manifestPath);
  const actualManifestSha256 = sha256(bytes);
  assert.equal(
    actualManifestSha256,
    expectedManifestSha256,
    'Topology Edit source-manifest authority changed without a reviewed lock update',
  );

  const manifest = JSON.parse(bytes.toString('utf8'));
  assert.equal(manifest.schema, 'VendoredTopologyEditSource.v2');
  assert.equal(manifest.sourceRepository, EXPECTED_SOURCE_REPOSITORY);
  assert.equal(manifest.sourceCommit, EXPECTED_SOURCE_COMMIT);
  assert.equal(manifest.targetRepository, EXPECTED_TARGET_REPOSITORY);
  assertHex(manifest.sourceCommit, 40, 'sourceCommit');
  assertHex(manifest.baselineTargetCommit, 40, 'baselineTargetCommit');
  assert.deepEqual(
    [...manifest.allowedTreatments].sort(),
    [...ALLOWED_TREATMENTS].sort(),
    'Source-manifest treatment vocabulary drifted',
  );

  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0);
  const sourcePaths = new Set();
  for (const entry of manifest.files) {
    assert.ok(entry.sourcePath, 'Manifest entry is missing sourcePath');
    assert.ok(!sourcePaths.has(entry.sourcePath), `Duplicate sourcePath: ${entry.sourcePath}`);
    sourcePaths.add(entry.sourcePath);
    assert.ok(
      ALLOWED_TREATMENTS.has(entry.treatment),
      `Unsupported treatment ${entry.treatment} for ${entry.sourcePath}`,
    );
    assertHex(entry.gitBlobSha, 40, `${entry.sourcePath} gitBlobSha`);
    assert.ok(
      Array.isArray(entry.semanticContracts) && entry.semanticContracts.length > 0,
      `${entry.sourcePath} must name at least one semantic contract`,
    );
    if (entry.snapshotPath) {
      const snapshotBytes = await readFile(path.resolve(repositoryRoot, entry.snapshotPath));
      assert.equal(
        gitBlobSha(snapshotBytes),
        entry.gitBlobSha,
        `Source snapshot drift: ${entry.snapshotPath}`,
      );
    }
    if (entry.treatment === 'AS_IS') {
      assert.ok(
        entry.snapshotPath,
        `AS_IS entry ${entry.sourcePath} requires an exact local snapshotPath`,
      );
    }
  }

  assert.ok(Array.isArray(manifest.behaviorAuthorities));
  const behaviorIds = new Set();
  for (const authority of manifest.behaviorAuthorities) {
    assert.ok(authority.id, 'Behavior authority is missing id');
    assert.ok(!behaviorIds.has(authority.id), `Duplicate behavior authority: ${authority.id}`);
    behaviorIds.add(authority.id);
    assert.ok(ALLOWED_TREATMENTS.has(authority.treatment));
    assert.ok(
      Array.isArray(authority.targetPaths) && authority.targetPaths.length > 0,
      `${authority.id} has no targetPaths`,
    );
    assert.ok(authority.contractAuthority, `${authority.id} has no contractAuthority`);
  }

  for (const waiver of manifest.waivers ?? []) validateWaiver(waiver);
  return Object.freeze({
    sourceRepository: manifest.sourceRepository,
    sourceCommit: manifest.sourceCommit,
    baselineTargetCommit: manifest.baselineTargetCommit,
    manifestSha256: actualManifestSha256,
    sourceFileCount: manifest.files.length,
    behaviorAuthorityCount: manifest.behaviorAuthorities.length,
  });
}

async function main() {
  const evidence = await verifySourceManifest();
  console.log(JSON.stringify(evidence, null, 2));
  console.log('TOPOLOGY EDIT SOURCE AUTHORITY DRIFT CHECK PASSED');
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`TOPOLOGY EDIT SOURCE AUTHORITY DRIFT CHECK FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
