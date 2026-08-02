import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/core/common-enriched-properties/target-inventory.js', import.meta.url), 'utf8');
const forbidden = [
  ['deriveLineKeyFromBranchName', 'branch-name resolver import'],
  ['branchNameRegex', 'regex line-key fallback'],
  ['includes(lineKey)', 'containment line-key resolution'],
  ['serviceConsensus', 'service-consensus inference'],
  ['localStorage', 'browser persistence'],
  ['Date.now', 'hidden clock'],
  ['Math.random', 'random identity'],
  ["from '../../workspace", 'workspace dependency'],
  ["from '../first-cut", 'empirical consumer dependency'],
  ["from '../linear-fea", 'LFEA dependency'],
];
for (const [token, label] of forbidden) {
  assert.equal(source.includes(token), false, `forbidden ${label}: ${token}`);
}
assert.match(source, /const lineBuckets = new Map\(\)/u);
assert.match(source, /const bucket = lineBuckets\.get\(lineKey\) \|\| \[\]/u);
assert.match(source, /bucket\.push\(target\)/u);
assert.match(source, /status: 'BLOCKED_MISSING'/u);
assert.match(source, /MODEL_LINE_ID_MISSING/u);
assert.match(source, /sharedModel\.semanticHash is stale/u);
console.log('PASS common enriched exact target inventory anti-drift checks');
