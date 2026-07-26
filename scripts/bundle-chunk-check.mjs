/**
 * Verify the production JavaScript bundle remains split below Vite's warning
 * boundary. Worker and application chunks are checked by actual emitted bytes.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'dist', 'assets');
const maximumBytes = 500 * 1024;
const chunks = fs.readdirSync(assets)
  .filter((name) => name.endsWith('.js'))
  .map((name) => ({
    name,
    bytes: fs.statSync(path.join(assets, name)).size,
  }))
  .sort((left, right) => right.bytes - left.bytes);

assert.ok(chunks.length > 1, 'Production output must contain multiple JavaScript chunks.');
for (const chunk of chunks) {
  assert.ok(
    chunk.bytes <= maximumBytes,
    `${chunk.name} is ${chunk.bytes} bytes; production chunks must be <= ${maximumBytes}.`,
  );
}

console.log(JSON.stringify({
  check: 'bundle-chunks',
  status: 'PASS',
  maximumBytes,
  largest: chunks[0],
  chunkCount: chunks.length,
}));
