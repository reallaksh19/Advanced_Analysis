import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  EXPECTED_MANIFEST_SHA256,
  verifySourceManifest,
} from '../scripts/topology-edit-source-drift-check.mjs';
import {
  EXPECTED_NATIVE_COMMANDS,
} from '../scripts/topology-edit-api-drift-check.mjs';

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(
  ROOT,
  'src/vendor/topology-edit/source-manifest.json',
);

test('intentional source blob hash mutation fails the source-authority gate', async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'topology-edit-source-drift-'),
  );

  try {
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
    manifest.files[0].gitBlobSha = '0'.repeat(40);

    const mutatedPath = path.join(directory, 'source-manifest.json');
    await writeFile(mutatedPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await assert.rejects(
      verifySourceManifest({
        manifestPath: mutatedPath,
        expectedManifestSha256: EXPECTED_MANIFEST_SHA256,
        repositoryRoot: ROOT,
      }),
      /authority changed without a reviewed lock update/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('intentional command-vocabulary mutation differs from the locked authority', () => {
  const mutated = [...EXPECTED_NATIVE_COMMANDS];
  mutated[0] = 'MOVE_POINT';

  assert.notDeepEqual(mutated, EXPECTED_NATIVE_COMMANDS);
  assert.throws(
    () => assert.deepEqual(mutated, EXPECTED_NATIVE_COMMANDS),
    /Expected values to be strictly deep-equal/,
  );
});
