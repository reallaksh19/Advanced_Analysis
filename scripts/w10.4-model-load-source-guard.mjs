import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sourceDir = path.join(root, 'src/core/model-loads');
const files = fs.readdirSync(sourceDir).filter((name) => name.endsWith('.js')).sort();
const forbiddenImports = [/from ['"]react/, /from ['"]zustand/, /from ['"]three/, /calc-workspace/, /support-restraint/, /\/solvers\//, /\/reporting\//, /src\/workspace/];
const forbiddenRuntime = ['Date.now', 'Math.random', 'new Date(', 'performance.now('];
const forbiddenContractFields = [/\bopeKgPerM\b/, /\bhydKgPerM\b/, /\breaction[A-Z_a-z0-9]*\s*:/, /\bchainage[A-Z_a-z0-9]*\s*:/, /\brouteId\s*:/];

assert(files.length >= 10, 'Expected W10.4 core modules.');
for (const name of files) {
  const relative = `src/core/model-loads/${name}`;
  const content = fs.readFileSync(path.join(sourceDir, name), 'utf8');
  const lines = content.split(/\r?\n/);
  assert(lines.length < 300, `${relative} exceeds 300 lines.`);
  assert(!/export\s+default\b/.test(content), `${relative} uses a default export.`);
  for (const pattern of forbiddenImports) assert(!pattern.test(content.toLowerCase()), `${relative} contains forbidden import ${pattern}.`);
  for (const token of forbiddenRuntime) assert(!content.includes(token), `${relative} contains non-deterministic runtime ${token}.`);
  for (const pattern of forbiddenContractFields) assert(!pattern.test(content), `${relative} contains forbidden route/reaction/case-specific contract field.`);
  checkFunctionLengths(relative, lines);
}

const gravityFiles = files.filter((name) => fs.readFileSync(path.join(sourceDir, name), 'utf8').includes('9.80665'));
assert.deepEqual(gravityFiles, ['gravity-profile.js'], 'Standard gravity must be declared only by the gravity profile.');
const resolver = fs.readFileSync(path.join(sourceDir, 'component-mass-resolver.js'), 'utf8');
assert(resolver.includes('DOUBLE_COUNT_CONFLICT'));
assert(resolver.includes('directMass !== null'));
assert(resolver.includes('LUMPED_LINEAR_MASS_CONFLICT'), 'Lumped components can bypass lumped load treatment.');
const projection = fs.readFileSync(path.join(sourceDir, 'load-source-projection.js'), 'utf8');
assert(projection.includes('GEOMETRY_LENGTH_CONFLICT'), 'Declared and geometric lengths are not consistency checked.');
assert.match(projection, /sourceLengthM\s*=\s*distanceM\(start, end\)/, 'Distributed length is not owned by referenced geometry.');
const primitive = fs.readFileSync(path.join(sourceDir, 'primitive-builder.js'), 'utf8');
assert(primitive.includes('globalVector: null'));
assert(primitive.includes('MASS_TO_WEIGHT_FORCE_V1') || primitive.includes('massToWeightForce'));
console.log('W10.4 model-load source guards passed.');

function checkFunctionLengths(relative, lines) {
  const starts = [];
  lines.forEach((line, index) => {
    if (/^(export\s+)?function\s+\w+|^\s*function\s+\w+/.test(line)) starts.push(index);
  });
  starts.forEach((start, index) => {
    const end = starts[index + 1] ?? lines.length;
    assert(end - start <= 45, `${relative} function near line ${start + 1} exceeds practical 40-line guard.`);
  });
}
