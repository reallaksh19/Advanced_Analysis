import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';

const options = parseArguments(process.argv.slice(2));
const fixturePath = path.resolve(options.fixture);
const fixtureName = path.relative(process.cwd(), fixturePath) || path.basename(fixturePath);
const sourceBytes = await readFile(fixturePath);
const sourceText = sourceBytes.toString('utf8');
const sourceSha256 = sha256(sourceBytes);

const parseStartedAt = performance.now();
const rawPackage = JSON.parse(sourceText);
const parseMs = performance.now() - parseStartedAt;

const normalizeStartedAt = performance.now();
const dataset = normalizeWorkspaceDataset(rawPackage, fixtureName, { sourceBytes, sourceSha256 });
const normalizeMs = performance.now() - normalizeStartedAt;
const normalizedSha256 = sha256(JSON.stringify(dataset));

console.log(JSON.stringify({
  fixture: fixtureName,
  parseMs: roundMilliseconds(parseMs),
  normalizeMs: roundMilliseconds(normalizeMs),
  entityCount: dataset.entities.length,
  normalizedSha256,
}));

if (options.maxNormalizeMs !== null && normalizeMs > options.maxNormalizeMs) {
  throw new Error(
    `Workspace normalization exceeded ${options.maxNormalizeMs} ms: ${roundMilliseconds(normalizeMs)} ms.`,
  );
}

function parseArguments(args) {
  let fixture = '';
  let maxNormalizeMs = null;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--fixture') fixture = args[index += 1] || '';
    else if (argument === '--max-normalize-ms') maxNormalizeMs = Number(args[index += 1]);
    else throw new TypeError(`Unsupported argument: ${argument}.`);
  }
  if (!fixture) throw new TypeError('Usage: node scripts/benchmark-workspace-normalization.mjs --fixture <path> [--max-normalize-ms <ms>]');
  if (maxNormalizeMs !== null && (!Number.isFinite(maxNormalizeMs) || maxNormalizeMs <= 0)) {
    throw new TypeError('--max-normalize-ms must be a positive finite number.');
  }
  return { fixture, maxNormalizeMs };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function roundMilliseconds(value) {
  return Number(value.toFixed(3));
}
