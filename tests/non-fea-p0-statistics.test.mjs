import assert from 'node:assert/strict';
import test from 'node:test';
import { NON_FEA_STAGE_IDS } from '../scripts/non-fea-baseline/contracts.mjs';
import { summarizeNonFeaStages } from '../scripts/non-fea-baseline/statistics.mjs';

function run(fixturePath, sampleKind, sampleIndex, durationMs) {
  return {
    fixturePath,
    sampleKind,
    sampleIndex,
    records: [
      { stageId: 'JSON_PARSE', status: 'PASS', durationMs },
      { stageId: 'NORMALIZATION', status: 'PASS', durationMs: durationMs * 2 },
      { stageId: 'RENDER_MODEL', status: 'BLOCKED', durationMs: null },
    ],
  };
}

test('P0 statistics remain separated by fixture and sample kind', () => {
  const rows = summarizeNonFeaStages([
    run('fixture-a.json', 'COLD', 0, 10),
    run('fixture-a.json', 'WARM', 1, 4),
    run('fixture-a.json', 'WARM', 2, 6),
    run('fixture-b.json', 'COLD', 0, 20),
  ]);
  assert.equal(rows.length, NON_FEA_STAGE_IDS.length * 3);

  const warmParse = rows.find((row) => row.fixturePath === 'fixture-a.json'
    && row.sampleKind === 'WARM' && row.stageId === 'JSON_PARSE');
  assert.deepEqual(warmParse, {
    fixturePath: 'fixture-a.json',
    sampleKind: 'WARM',
    stageId: 'JSON_PARSE',
    sampleCount: 2,
    medianMs: 4,
    p95Ms: 6,
    maxMs: 6,
  });

  const blocked = rows.find((row) => row.fixturePath === 'fixture-b.json'
    && row.sampleKind === 'COLD' && row.stageId === 'RENDER_MODEL');
  assert.deepEqual(blocked, {
    fixturePath: 'fixture-b.json',
    sampleKind: 'COLD',
    stageId: 'RENDER_MODEL',
    sampleCount: 0,
    medianMs: null,
    p95Ms: null,
    maxMs: null,
  });
});

test('P0 statistics do not create synthetic groups without runs', () => {
  assert.deepEqual(summarizeNonFeaStages([]), []);
});
