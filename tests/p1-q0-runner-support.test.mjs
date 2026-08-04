import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveP1ScopeBase } from '../scripts/p1/p1-runner-support.mjs';

const HEAD = '1'.repeat(40);
const MAIN_BASE = '2'.repeat(40);
const OTHER = '3'.repeat(40);

test('P1 scope base is current-main merge base and is verified as an ancestor', async () => {
  const calls = [];
  const result = await resolveP1ScopeBase({
    exactHeadSha: HEAD,
    gitRunner: async (args) => {
      calls.push(args);
      return args[1] === '--is-ancestor' ? '' : MAIN_BASE;
    },
  });
  assert.equal(result, MAIN_BASE);
  assert.deepEqual(calls, [
    ['merge-base', HEAD, 'origin/main'],
    ['merge-base', '--is-ancestor', MAIN_BASE, HEAD],
  ]);
});

test('P1 scope base rejects an override that could hide branch changes', async () => {
  await assert.rejects(() => resolveP1ScopeBase({
    explicitBase: OTHER,
    exactHeadSha: HEAD,
    gitRunner: async () => MAIN_BASE,
  }), (error) => error.code === 'P1_SCOPE_BASE_OVERRIDE_MISMATCH');
});

test('P1 scope base uses explicit custody only after ancestor verification', async () => {
  const calls = [];
  const result = await resolveP1ScopeBase({
    explicitBase: OTHER,
    exactHeadSha: HEAD,
    gitRunner: async (args) => {
      calls.push(args);
      if (args[1] === '--is-ancestor') return '';
      throw new Error('missing ref');
    },
  });
  assert.equal(result, OTHER);
  assert.deepEqual(calls, [
    ['merge-base', HEAD, 'origin/main'],
    ['merge-base', HEAD, 'main'],
    ['merge-base', '--is-ancestor', OTHER, HEAD],
  ]);
});

test('P1 scope base blocks when neither current-main nor explicit custody resolves', async () => {
  await assert.rejects(() => resolveP1ScopeBase({
    exactHeadSha: HEAD,
    gitRunner: async () => { throw new Error('missing ref'); },
  }), (error) => error.code === 'P1_SCOPE_BASE_UNRESOLVED');
});

test('P1 scope base rejects explicit custody that is not an ancestor', async () => {
  await assert.rejects(() => resolveP1ScopeBase({
    explicitBase: OTHER,
    exactHeadSha: HEAD,
    gitRunner: async (args) => {
      if (args[1] === '--is-ancestor') throw new Error('not ancestor');
      throw new Error('missing ref');
    },
  }), (error) => error.code === 'P1_SCOPE_BASE_NOT_ANCESTOR');
});
