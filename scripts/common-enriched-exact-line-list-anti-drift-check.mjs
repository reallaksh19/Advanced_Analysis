import assert from 'node:assert/strict';
import fs from 'node:fs';

const path = new URL('../src/core/common-enriched-properties/line-list-resolution.js', import.meta.url);
const source = fs.readFileSync(path, 'utf8');

const forbidden = [
  ['branch-name parsing', /branchName|tokenAtPosition|deriveLineKeyFromBranchName/u],
  ['regular-expression matching', /new\s+RegExp|\.match\s*\(|\.search\s*\(/u],
  ['containment matching', /containment|containsCandidate|firstContained/u],
  ['fuzzy matching', /fuzzy|levenshtein|similarityScore/ui],
  ['service consensus', /serviceConsensus|SERVICE_CONSENSUS/u],
  ['browser persistence', /localStorage|sessionStorage/u],
  ['hidden clock', /Date\.now\s*\(|new\s+Date\s*\(/u],
  ['random identity', /Math\.random\s*\(|randomUUID/u],
  ['consumer import', /first-cut-load|linear-fea|lafea|solver|workspace\//u],
];

for (const [label, pattern] of forbidden) {
  assert.equal(pattern.test(source), false, `anti-drift: ${label} is forbidden`);
}

for (const marker of [
  'bucket.length === 0',
  'bucket.length === 1',
  'bucket.length > 1',
  'BLOCKED_AMBIGUOUS',
  'EXACT_LINE_KEY_MULTIPLE_ROWS',
  'LINE_LIST_EXACT_ROW_AMBIGUOUS',
  'COMMON_ENRICHED_LINE_LIST_RECORD_INVALID',
]) {
  assert.ok(source.includes(marker), `anti-drift: required marker missing: ${marker}`);
}

assert.equal(source.includes('index.set(lineKey, record)'), false, 'a line key must not overwrite an earlier row');
assert.ok(source.includes('bucket.push(record)'), 'duplicate rows must be preserved in buckets');

console.log('PASS common enriched exact line-list anti-drift checks');
