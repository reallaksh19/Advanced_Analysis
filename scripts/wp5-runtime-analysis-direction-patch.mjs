import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('./empirical-restraint-network-check.mjs', import.meta.url);
let source = readFileSync(path, 'utf8');

source = replaceOnce(
  source,
  `  if (branchCenter) sourceReference.explicitConnectionId = 'WP5-BRANCH-JUNCTION';
  return {`,
  `  if (branchCenter) sourceReference.explicitConnectionId = 'WP5-BRANCH-JUNCTION';
  if (branchCenter && componentKey === 'ARM-Z') sourceReference.multiConnection = true;
  return {`,
);

source = replaceOnce(
  source,
  `const branchFixture = buildBranchFixture(branchProfile);
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
assert.equal(branchResult.status, 'BLOCKED');`,
  `const branchResult = execute(buildBranchFixture(branchProfile));
assert.equal(branchResult.status, 'BLOCKED');`,
);

assert.match(source, /sourceReference\.multiConnection = true/);
assert.doesNotMatch(source, /WP5_BRANCH_DIAGNOSTIC/);
writeFileSync(path, source);
console.log('wp5-branch-junction-evidence-patch: APPLIED');

function replaceOnce(value, before, after) {
  const first = value.indexOf(before);
  assert.notEqual(first, -1, `Patch target not found: ${before.slice(0, 80)}`);
  assert.equal(value.indexOf(before, first + 1), -1, 'Patch target is not unique.');
  return `${value.slice(0, first)}${after}${value.slice(first + before.length)}`;
}
