/**
 * Verify the production JavaScript bundle remains bounded and does not recreate
 * application chunks that break ESM evaluation order through cross-chunk
 * temporal-dead-zone cycles.
 *
 * 500 KiB remains the optimization target. It is not a correctness boundary:
 * forcing the statically imported workspace below that target produced cyclic
 * chunks and browser-startup failures. A 1 MiB hard ceiling prevents accidental
 * bundle collapse while allowing Rollup to preserve safe evaluation order.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'dist', 'assets');
const targetBytes = 500 * 1024;
const maximumBytes = 1024 * 1024;
const prohibitedForcedApplicationPrefixes = Object.freeze([
  'workspace-analysis-',
  'workspace-data-',
  'workspace-shell-',
  'workspace-enrichment-',
  'workspace-linear-piping-',
  'workspace-sketcher-',
  'workspace-topology-edit-core-',
  'workspace-topology-edit-ui-',
  'fea-workbenches-',
]);
const chunks = fs.readdirSync(assets)
  .filter((name) => name.endsWith('.js'))
  .map((name) => ({
    name,
    bytes: fs.statSync(path.join(assets, name)).size,
  }))
  .sort((left, right) => right.bytes - left.bytes);

assert.ok(chunks.length > 1, 'Production output must contain multiple JavaScript chunks.');
const prohibitedChunks = chunks
  .map((chunk) => chunk.name)
  .filter((name) => prohibitedForcedApplicationPrefixes.some((prefix) => name.startsWith(prefix)));
assert.deepEqual(
  prohibitedChunks,
  [],
  `Workspace source must remain under Rollup graph-aware ownership; prohibited forced chunks: ${prohibitedChunks.join(', ')}`,
);
for (const chunk of chunks) {
  assert.ok(
    chunk.bytes <= maximumBytes,
    `${chunk.name} is ${chunk.bytes} bytes; production chunks must be <= ${maximumBytes}.`,
  );
}

const aboveTarget = chunks.filter((chunk) => chunk.bytes > targetBytes);
console.log(JSON.stringify({
  check: 'bundle-chunks',
  status: 'PASS',
  targetBytes,
  maximumBytes,
  largest: chunks[0],
  chunkCount: chunks.length,
  aboveTarget,
  prohibitedForcedApplicationChunks: prohibitedChunks,
  workspaceOwnership: 'ROLLUP_GRAPH_AWARE',
}));
