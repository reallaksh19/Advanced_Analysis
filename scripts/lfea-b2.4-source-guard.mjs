#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE = path.join(ROOT, 'src', 'core');
const PACKAGE = path.join(CORE, 'centerline-beam-fea');
const IMPLEMENTATION_NAMES = new Set([
  'local-axis-contract.js',
  'local-axis-validation.js',
  'local-axes.js',
]);

async function filesBelow(directory, predicate = () => true) {
  const output = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return output;
    throw error;
  }
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesBelow(absolute, predicate));
    else if (entry.isFile() && predicate(absolute)) output.push(absolute);
  }
  return output;
}

function stripComments(source) {
  let output = '';
  let state = 'code';
  let quote = '';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (state === 'line-comment') {
      if (character === '\n') {
        output += '\n';
        state = 'code';
      } else output += ' ';
      continue;
    }
    if (state === 'block-comment') {
      if (character === '*' && next === '/') {
        output += '  ';
        index += 1;
        state = 'code';
      } else output += character === '\n' ? '\n' : ' ';
      continue;
    }
    if (state === 'string') {
      output += character;
      if (character === '\\') {
        output += next ?? '';
        index += 1;
      } else if (character === quote) state = 'code';
      continue;
    }
    if (character === '/' && next === '/') {
      output += '  ';
      index += 1;
      state = 'line-comment';
    } else if (character === '/' && next === '*') {
      output += '  ';
      index += 1;
      state = 'block-comment';
    } else if (character === '"' || character === "'" || character === '`') {
      output += character;
      quote = character;
      state = 'string';
    } else output += character;
  }
  return output;
}

function importSpecifiers(source) {
  const expression = /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/gu;
  return [...source.matchAll(expression)].map((match) => match[1]);
}

const implementationFiles = (await filesBelow(PACKAGE, (file) => IMPLEMENTATION_NAMES.has(path.basename(file)))).sort();
assert.equal(implementationFiles.length, IMPLEMENTATION_NAMES.size, 'All three authoritative implementation files must exist.');
const implementationSources = await Promise.all(implementationFiles.map(async (file) => ({
  file,
  source: stripComments(await readFile(file, 'utf8')),
})));
const combined = implementationSources.map(({ source }) => source).join('\n');

for (const expression of [
  /\bcamera\b/iu,
  /\bviewport\b/iu,
  /\bscreen\b/iu,
  /\bcanvas\b/iu,
  /\brenderer\b/iu,
  /\brandom\b/iu,
  /\bMath\s*\.\s*random\b/u,
  /\bDate\s*\.\s*now\b/u,
  /\bperformance\s*\.\s*now\b/u,
  /\.localeCompare\s*\(/u,
]) {
  assert.equal(expression.test(combined), false, `Authoritative implementation contains prohibited source ${expression}.`);
}

for (const { file, source } of implementationSources) {
  for (const specifier of importSpecifiers(source)) {
    const normalized = specifier.toLowerCase();
    assert.equal(normalized.includes('workspace'), false, `${path.relative(ROOT, file)} imports workspace state.`);
    assert.equal(normalized.includes('model-'), false, `${path.relative(ROOT, file)} imports model-schema state.`);
    assert.equal(normalized.includes('solver'), false, `${path.relative(ROOT, file)} imports a solver package.`);
    assert.equal(normalized.includes('stiffness'), false, `${path.relative(ROOT, file)} imports stiffness code.`);
    assert.equal(normalized.includes('load'), false, `${path.relative(ROOT, file)} imports load code.`);
  }
}

const resolverSource = implementationSources.find(({ file }) => path.basename(file) === 'local-axes.js').source;
const validationSource = implementationSources.find(({ file }) => path.basename(file) === 'local-axis-validation.js').source;
const contractSource = implementationSources.find(({ file }) => path.basename(file) === 'local-axis-contract.js').source;

assert.match(
  contractSource,
  /from\s+['"]\.\.\/shared-piping-model\/canonical-json\.js['"]/u,
  'B-2.4 must use the repository canonical JSON and semantic hash authority.',
);
assert.doesNotMatch(
  contractSource,
  /0xcbf29ce|0x100000001b3|BigInt\s*\(/u,
  'B-2.4 must not reimplement FNV hashing.',
);

assert.match(resolverSource, /parallelResidual\s*<=\s*governedProfile\.parallelTolerance/u, 'Parallel boundary must use <= explicitly.');
assert.doesNotMatch(resolverSource, /parallelResidual\s*<\s*governedProfile\.parallelTolerance/u, 'Strict < is prohibited at the parallel boundary.');
assert.match(resolverSource, /for\s*\(let\s+index\s*=\s*0;\s*index\s*<\s*profile\.fallbackCandidates\.length/u, 'Fallback candidates must be evaluated in declared array order.');
assert.doesNotMatch(resolverSource, /fallbackCandidates\s*\.\s*sort\s*\(/u, 'Caller fallback arrays must not be sorted.');
assert.doesNotMatch(resolverSource, /Object\s*\.\s*(?:keys|entries|values)\s*\(\s*profile\.fallbackCandidates/u, 'Fallback ordering must not use object enumeration.');
assert.match(resolverSource, /alignment\s*<\s*selected\.alignment/u, 'Fallback selection must minimize absolute alignment.');
assert.match(resolverSource, /alignment\s*===\s*selected\.alignment/u, 'Exact fallback ties must be detected.');
assert.match(resolverSource, /cross\s*\(\s*localX\s*,\s*localY\s*\)/u, 'Local z must use localX cross localY.');
assert.doesNotMatch(resolverSource, /cross\s*\(\s*localY\s*,\s*localX\s*\)/u, 'Reversed local-y cross local-x construction is prohibited.');
assert.match(resolverSource, /cross\s*\(\s*localZ\s*,\s*localX\s*\)/u, 'Local y correction must use localZ cross localX.');
assert.doesNotMatch(resolverSource, /(?:1e-|Number\.EPSILON).*reference/u, 'Hardcoded perturbation repair is prohibited.');
assert.match(resolverSource, /inputReference:\s*\{[\s\S]*vector:\s*cleanVector\(suppliedReference\)/u, 'Rejected source reference evidence must be retained.');

for (const tolerance of [
  'unitVectorTolerance',
  'orthogonalityTolerance',
  'handednessTolerance',
  'determinantTolerance',
]) {
  assert.match(contractSource, new RegExp(`${tolerance}: 1e-12`, 'u'), `${tolerance} must be versioned at 1e-12.`);
  assert.match(validationSource, new RegExp(`${tolerance}`, 'u'), `${tolerance} must be retained and verified.`);
}
assert.match(validationSource, /normResidualX\s*>\s*profile\.unitVectorTolerance/u, 'Unit-vector qualification must be inclusive.');
assert.match(validationSource, /orthogonalityXY\s*>\s*profile\.orthogonalityTolerance/u, 'Orthogonality qualification must be inclusive.');
assert.match(validationSource, /handednessResidual\s*>\s*profile\.handednessTolerance/u, 'Handedness qualification must be inclusive.');
assert.match(validationSource, /determinantResidual\s*>\s*profile\.determinantTolerance/u, 'Determinant qualification must be inclusive.');
assert.match(validationSource, /determinant\s*<=\s*0/u, 'Positive determinant must be enforced.');

const governedDirectories = (await readdir(CORE, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && (entry.name === 'centerline-beam-fea' || entry.name.startsWith('linear-fea-')))
  .map((entry) => path.join(CORE, entry.name));
const governedFiles = (await Promise.all(governedDirectories.map((directory) =>
  filesBelow(directory, (file) => /\.(?:js|mjs)$/u.test(file))))).flat();
for (const file of governedFiles) {
  if (IMPLEMENTATION_NAMES.has(path.basename(file)) && path.dirname(file) === PACKAGE) continue;
  const source = stripComments(await readFile(file, 'utf8'));
  for (const marker of [
    /\bresolveFrameLocalAxes\b/u,
    /frame-local-axis-profile\/v1/u,
    /FRAME_AXIS_REFERENCE_VECTOR_V1/u,
    /\bparallelResidual\b/u,
  ]) {
    assert.equal(marker.test(source), false, `Duplicate local-axis implementation marker in ${path.relative(ROOT, file)}.`);
  }
}

const indexSource = stripComments(await readFile(path.join(PACKAGE, 'index.js'), 'utf8'));
for (const exported of ['./local-axis-contract.js', './local-axis-validation.js', './local-axes.js']) {
  assert.ok(indexSource.includes(`export * from '${exported}';`), `centerline-beam-fea/index.js must export ${exported}.`);
}

const packageJson = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
assert.equal(
  packageJson.scripts['check:lfea-b2.4'],
  'node scripts/lfea-b2.4-local-axes-check.mjs && node scripts/lfea-b2.4-reviewer-check.mjs && node scripts/lfea-b2.4-source-guard.mjs',
  'check:lfea-b2.4 must run analytical, reviewer, and source-guard checks.',
);
assert.match(
  packageJson.scripts['check:lfea-linear-core'],
  /^npm run check:lfea-b2\.0 && npm run check:lfea-b2\.1 && npm run check:lfea-b2\.4 && /u,
  'B-2.4 must be reached from check:lfea-linear-core after B-2.1.',
);

console.log('PASS B24-G01 No presentation, clock, locale, or nondeterministic source inputs');
console.log('PASS B24-G02 Package imports remain pure numerical geometry');
console.log('PASS B24-G03 Repository semantic-hash authority retained');
console.log('PASS B24-G04 Explicit inclusive parallel boundary');
console.log('PASS B24-G05 Declared-order minimum-alignment fallback selection');
console.log('PASS B24-G06 Governed right-handed cross-product construction');
console.log('PASS B24-G07 Source reference evidence retained');
console.log('PASS B24-G08 Exact versioned verification tolerances retained and inclusive');
console.log('PASS B24-G09 No duplicate local-axis implementation in guarded packages');
console.log('PASS B24-G10 Existing package exports preserved and extended');
console.log('PASS B24-G11 Package gate registration retained');
console.log('LFEA B-2.4 source guard passed.');
