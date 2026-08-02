import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  EXPECTED_FIXTURE_HASHES,
  FIXTURE_MANIFESTS,
  buildQualificationFixture,
  fixtureSummary,
} from './enriched-staged-json-fixtures.mjs';
import { assertDeepFrozen, semanticHash } from './enriched-staged-json-qualification-helpers.mjs';

const summaries = {};
for (const name of Object.keys(FIXTURE_MANIFESTS)) {
  const first = buildQualificationFixture(name);
  const second = buildQualificationFixture(name);
  assert.equal(first.semanticHash, second.semanticHash);
  assert.equal(first.semanticHash, EXPECTED_FIXTURE_HASHES[name]);
  assert.equal(semanticHash(first), semanticHash(second));
  assertDeepFrozen(first);
  const summary = fixtureSummary(first);
  assert.equal(summary.branchCount, FIXTURE_MANIFESTS[name].branchCount);
  assert.equal(summary.componentCount, FIXTURE_MANIFESTS[name].branchCount * FIXTURE_MANIFESTS[name].componentsPerBranch);
  summaries[name] = summary;
}

for (const timezone of ['UTC', 'Asia/Muscat', 'America/New_York']) {
  const child = spawnSync(process.execPath, ['scripts/enriched-staged-json-hash-worker.mjs', 'singleRoot'], {
    cwd: process.cwd(),
    env: { ...process.env, TZ: timezone },
    encoding: 'utf8',
  });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.fixture.fixtureSemanticHash, summaries.singleRoot.fixtureSemanticHash);
}

console.log(JSON.stringify({ status: 'PASS', check: 'fixtures', summaries }));
