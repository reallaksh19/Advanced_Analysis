import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  'src/workspace/viewport-interaction/topology-edit-interaction-values.js',
  'src/workspace/viewport-interaction/topology-edit-drag-constraint.js',
  'src/workspace/viewport-interaction/topology-edit-transform-intent.js',
  'src/workspace/viewport-interaction/topology-edit-numeric-entry.js',
  'src/workspace/viewport-interaction/topology-edit-snap-candidates.js',
  'src/workspace/viewport-interaction/topology-edit-snap-resolver.js',
  'src/workspace/viewport-interaction/topology-edit-interaction-preview.js',
  'src/workspace/viewport-interaction/topology-edit-gizmo-model.js',
];

const PROHIBITED = [
  /Date\.now/,
  /new Date/,
  /Math\.random/,
  /crypto\.randomUUID/,
  /mesh\.name/,
  /nearestObject/,
  /closestObject/,
  /WorkspaceState/,
  /topology-edit-persistence/,
  /topology-edit-export/,
  /topology-edit-commit-service/,
  /commitPreparedTopologyEditExport/,
  /export default/,
  /document\./,
  /window\./,
  /localStorage/,
  /sessionStorage/,
];

test('professional interaction foundation stays pure and bounded', async () => {
  const sources = await Promise.all(
    FILES.map((file) => readFile(path.join(ROOT, file), 'utf8')),
  );
  for (const [index, source] of sources.entries()) {
    for (const pattern of PROHIBITED) {
      assert.equal(
        pattern.test(source),
        false,
        `${FILES[index]} contains prohibited ${pattern}`,
      );
    }
    assert.ok(
      source.split(/\r?\n/).length <= 300,
      `${FILES[index]} exceeds 300 physical lines`,
    );
  }
});
