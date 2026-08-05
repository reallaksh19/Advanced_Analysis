import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productionRoots = [
  path.join(repoRoot, 'src/core/empirical-piping-mechanics'),
  path.join(repoRoot, 'src/core/empirical-support-frame-screen'),
];
const forbiddenPatterns = [
  /from\s+['"][^'"]*linear-fea/i,
  /from\s+['"][^'"]*centerline-beam-fea/i,
  /from\s+['"][^'"]*element-fea/i,
  /from\s+['"][^'"]*fea-benchmarks/i,
  /from\s+['"][^'"]*benchmarks\//i,
  /import\s*\([^)]*(linear-fea|centerline-beam-fea|element-fea|fea-benchmarks|benchmarks\/)/i,
];
const checked = [];
for (const root of productionRoots) {
  assert.ok(fs.existsSync(root), `Production root missing: ${path.relative(repoRoot, root)}`);
  for (const file of walk(root)) {
    if (!/\.(?:js|mjs)$/.test(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    for (const pattern of forbiddenPatterns) {
      assert.ok(!pattern.test(source), `Forbidden dependency ${pattern} in ${path.relative(repoRoot, file)}`);
    }
    checked.push(path.relative(repoRoot, file));
  }
}
assert.ok(checked.length >= 10, 'Expected standalone empirical production modules to be present.');
console.log(`✅ Empirical piping source-boundary check passed (${checked.length} production files, zero forbidden imports).`);

function* walk(root) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) yield* walk(absolute);
    else yield absolute;
  }
}
