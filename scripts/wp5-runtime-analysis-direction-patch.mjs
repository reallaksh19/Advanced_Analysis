import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('./empirical-restraint-network-check.mjs', import.meta.url);
let source = readFileSync(path, 'utf8');
const before = `const branchResult = execute(buildBranchFixture(branchProfile));
assert.equal(branchResult.status, 'BLOCKED');`;
const after = `const branchFixture = buildBranchFixture(branchProfile);
const branchResult = execute(branchFixture);
console.log('WP5_BRANCH_DIAGNOSTIC', JSON.stringify({
  status: branchResult.status,
  blockers: branchResult.loadCases.map((row) => ({
    loadCaseId: row.loadCaseId,
    blockers: row.blockers,
  })),
  connections: branchFixture.topologyGraph.connections,
  unresolvedPorts: branchFixture.topologyGraph.unresolvedPorts,
}, null, 2));
assert.equal(branchResult.status, 'BLOCKED');`;
const first = source.indexOf(before);
assert.notEqual(first, -1, 'WP5 branch diagnostic patch target not found.');
assert.equal(source.indexOf(before, first + 1), -1, 'WP5 branch diagnostic target is not unique.');
source = `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
assert.match(source, /WP5_BRANCH_DIAGNOSTIC/);
writeFileSync(path, source);
console.log('wp5-branch-blocker-diagnostic-patch: APPLIED');
