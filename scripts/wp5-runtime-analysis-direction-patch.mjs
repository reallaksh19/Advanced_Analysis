import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('./empirical-restraint-network-check.mjs', import.meta.url);
let source = readFileSync(path, 'utf8');
const before = "const LOAD_CASE_ID = 'THERMAL-Z';";
const after = "const LOAD_CASE_ID = 'EXP-THERMAL-ON-HOT-SUPPORT-SET';";
const first = source.indexOf(before);
assert.notEqual(first, -1, 'WP5 load-case patch target not found.');
assert.equal(source.indexOf(before, first + 1), -1, 'WP5 load-case patch target is not unique.');
source = `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
assert.doesNotMatch(source, /const LOAD_CASE_ID = 'THERMAL-Z'/);
assert.match(source, /const LOAD_CASE_ID = 'EXP-THERMAL-ON-HOT-SUPPORT-SET'/);
writeFileSync(path, source);
console.log('wp5-governed-load-case-patch: APPLIED');
