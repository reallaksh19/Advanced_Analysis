import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const writerUrl = new URL(
  '../scripts/topology-edit-write-track-c-evidence.mjs',
  import.meta.url,
);
const prerequisiteUrl = new URL(
  './fixtures/topology-edit/1885s/prerequisite-manifest.json',
  import.meta.url,
);
const workflowUrl = new URL(
  '../.github/workflows/topology-edit-track-c.yml',
  import.meta.url,
);

test('Track C evidence binds corrected Track B lineage and remains release-blocked', async () => {
  const writer = await readFile(writerUrl, 'utf8');
  const prerequisiteManifest = JSON.parse(
    await readFile(prerequisiteUrl, 'utf8'),
  );
  const wave3 = prerequisiteManifest.prerequisites
    .find((row) => row.waveId === 'WAVE_3');

  assert.equal(
    prerequisiteManifest.prerequisites
      .every((row) => row.status === 'PASS_MERGED'),
    true,
  );
  assert.deepEqual(wave3.pullRequests, [267, 271, 272, 277]);
  assert.equal(
    wave3.mergeCommit,
    '2d4fc3596a5bc0057740945c769c71be1efec296',
  );
  assert.match(writer, /TRACK_B_PREREQUISITE_PATH/);
  assert.match(
    writer,
    /PASS_FOUNDATION_TRACK_B_MERGED_EXECUTION_BLOCKED/,
  );
  assert.match(writer, /releaseQualified: false/);
  assert.match(
    writer,
    /Pre-step infrastructure failures with no executable steps or logs are not release evidence/,
  );
  assert.doesNotMatch(
    writer,
    /Final release qualification waits for Waves 1 through 4/,
  );
});

test('Track C workflow reacts to prerequisite and evidence regression changes', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  assert.match(
    workflow,
    /tests\/fixtures\/topology-edit\/1885s\/prerequisite-manifest\.json/,
  );
  assert.match(
    workflow,
    /tests\/topology-edit-track-c-evidence\.test\.mjs/,
  );
});
