import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const MODULES = [
  '../src/workspace/topology-edit/professional/topology-edit-change-scope.js',
  '../src/workspace/topology-edit/professional/topology-edit-operation-plan.js',
  '../src/workspace/topology-edit/professional/topology-edit-route-operation-helpers.js',
  '../src/workspace/topology-edit/professional/topology-edit-route-operations.js',
  '../src/workspace/topology-edit/professional/topology-edit-slope-operation.js',
  '../src/workspace/topology-edit/professional/topology-edit-spec-catalog.js',
];

const PROHIBITED = [
  /\b(?:document|window|localStorage|sessionStorage)\b/u,
  /\b(?:THREE|WebGL|renderer)\b/u,
  /WorkspaceState/u,
  /(?:Date\.now|new Date|Math\.random|crypto\.randomUUID)/u,
  /(?:mesh\.name|nearestObject|closestObject|nearest|closest)/u,
  /(?:topology-edit-persistence|topology-edit-export|topology-edit-commit-service)/u,
  /(?:commitPreparedTopologyEditExport|loadDataset|saveDraft|reloadDraft)/u,
  /export\s+default/u,
];

test('professional engineering contracts remain pure, contained, and below 300 lines', async () => {
  for (const relativePath of MODULES) {
    const url = new URL(relativePath, import.meta.url);
    const source = await readFile(url, 'utf8');
    for (const pattern of PROHIBITED) {
      assert.doesNotMatch(source, pattern, `${relativePath} contains prohibited authority: ${pattern}`);
    }
    const physicalLines = source.split(/\r?\n/u).length;
    assert.ok(physicalLines <= 300, `${relativePath} has ${physicalLines} lines; limit is 300.`);
    assert.match(source, /export\s+(?:const|function|\{)/u);
  }
});
