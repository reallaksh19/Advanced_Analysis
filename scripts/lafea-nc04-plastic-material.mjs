import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeNc04 } from './nc04-material/benchmarks.mjs';
import { hash, semanticHash } from './nc04-material/evidence.mjs';

const solver = process.argv[2];
const outDir = process.argv[3];
const exactHeadSha = process.env.EXACT_HEAD_SHA;
if (!solver || !outDir || !/^[0-9a-f]{40}$/u.test(exactHeadSha || '')) {
  throw new Error('usage: solver outDir with EXACT_HEAD_SHA');
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePaths = [
  'scripts/nc04-material/config.mjs',
  'scripts/nc04-material/evidence.mjs',
  'scripts/nc04-material/engine.mjs',
  'scripts/nc04-material/benchmarks.mjs',
  'src/core/nonlinear-shell-contact/plastic-material-contract.js',
  'src/core/nonlinear-shell-contact/plastic-material-qualification-evaluator.js',
];
const implementationHash = semanticHash(await Promise.all(sourcePaths.map(async (path) => ({
  path,
  contentHash: hash(await readFile(resolve(root, path))),
}))));
await executeNc04({ solver, outDir, exactHeadSha, implementationHash });
