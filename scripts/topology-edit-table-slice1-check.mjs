import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const TABLE_PREFIX = 'src/workspace/topology-edit/table/';
const TEST_PREFIX = 'tests/topology-edit-table-';
const SELF = 'scripts/topology-edit-table-slice1-check.mjs';
const MAX_PHYSICAL_LINES_EXCLUSIVE = 300;
const FORBIDDEN_TABLE_SOURCE = [
  'WorkspaceState',
  'workspace-state.js',
  'EventBus',
  'event-bus.js',
  'commitTopologyEditWorkspace',
  'applyCanonicalTopologyToWorkspaceEntities',
  'loadDataset(',
  'swapDataset(',
];

const headPaths = git(['ls-tree', '-r', '--name-only', 'HEAD'])
  .split(/\r?\n/u)
  .filter(Boolean);
const scoped = headPaths.filter((path) => (
  path.startsWith(TABLE_PREFIX) || path.startsWith(TEST_PREFIX) || path === SELF
));
assert.ok(scoped.includes(SELF), 'Slice 1 exact-HEAD guard must inspect itself.');
assert.ok(scoped.some((path) => path.startsWith(TABLE_PREFIX)), 'No table Slice 1 modules found at HEAD.');
assert.ok(scoped.some((path) => path.startsWith(TEST_PREFIX)), 'No table Slice 1 tests found at HEAD.');

for (const path of scoped) {
  const content = git(['show', `HEAD:${path}`]);
  const lineCount = physicalLineCount(content);
  assert.ok(
    lineCount < MAX_PHYSICAL_LINES_EXCLUSIVE,
    `${path} has ${lineCount} physical lines; modules must remain <${MAX_PHYSICAL_LINES_EXCLUSIVE}.`,
  );
  if (path.startsWith(TABLE_PREFIX)) {
    for (const token of FORBIDDEN_TABLE_SOURCE) {
      assert.ok(!content.includes(token), `${path} contains forbidden production mutation authority token ${token}.`);
    }
  }
}

console.log(`topology-edit-table Slice 1 exact-HEAD guard passed for ${scoped.length} files.`);

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}
function physicalLineCount(content) {
  if (!content) return 0;
  const normalized = content.endsWith('\n') ? content.slice(0, -1) : content;
  return normalized ? normalized.split(/\r?\n/u).length : 0;
}
