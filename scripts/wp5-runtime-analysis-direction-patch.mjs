import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('./empirical-restraint-network-check.mjs', import.meta.url);
let source = readFileSync(path, 'utf8');
const before = "const rigidBySite = bySupportSite(rigidCase.supportResults);\nconst leftExpected = EA * 1e-5 * 100;";
const after = `const rigidBySite = bySupportSite(rigidCase.supportResults);
console.log('WP5_RIGID_DIAGNOSTIC', JSON.stringify({
  supportResults: rigidCase.supportResults.map((row) => ({
    supportSiteId: row.supportSiteId,
    reactionComponentN: row.reactionComponentN,
    displacementM: row.displacementM,
    trialFreeMovementM: row.trialFreeMovementM,
  })),
  memberActions: rigidCase.memberActions,
}, null, 2));
const leftExpected = EA * 1e-5 * 100;`;
const first = source.indexOf(before);
assert.notEqual(first, -1, 'WP5 diagnostic patch target not found.');
assert.equal(source.indexOf(before, first + 1), -1, 'WP5 diagnostic patch target is not unique.');
source = `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
assert.match(source, /WP5_RIGID_DIAGNOSTIC/);
writeFileSync(path, source);
console.log('wp5-closed-form-diagnostic-patch: APPLIED');
