#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_DIR = path.join(ROOT, 'src', 'core', 'linear-fea-section');
const SRC_CORE = path.join(ROOT, 'src', 'core');
const PROPERTIES_FILE = path.join(PACKAGE_DIR, 'pipe-section-properties.js');

const EXPECTED_FILES = [
  'pipe-section-contract.js',
  'pipe-section-properties.js',
  'pipe-section-validation.js',
  'pipe-section-canonicalization.js',
  'index.js',
];

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
  const pattern = /(?:\bfrom\s+|\bimport\s*\(\s*)['"]([^'"]+)['"]/gu;
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function assertAbsent(source, pattern, message) {
  assert.equal(pattern.test(source), false, message);
}

const actualFiles = (await readdir(PACKAGE_DIR, { withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort();
assert.deepEqual(actualFiles, [...EXPECTED_FILES].sort(), 'linear-fea-section must contain only the governed source files.');

const productionFiles = await filesBelow(PACKAGE_DIR, (file) => file.endsWith('.js'));
const productionRows = await Promise.all(productionFiles.map(async (file) => ({
  file,
  source: stripComments(await readFile(file, 'utf8')),
})));
const productionSource = productionRows.map(({ source }) => source).join('\n');

for (const { label, pattern } of [
  { label: 'NPS lookup', pattern: /\b(?:NPS|nominalPipeSize)\b/u },
  { label: 'schedule lookup', pattern: /\b(?:scheduleLookup|pipeSchedule|resolveSchedule)\b/u },
  { label: 'catalogue lookup', pattern: /\b(?:catalogueLookup|catalogLookup|resolveCatalogue)\b/u },
  { label: 'material density', pattern: /\b(?:massDensity|materialDensity|densityWeighted)\b/u },
  { label: 'material modulus', pattern: /\b(?:elasticModulus|shearModulus|youngsModulus)\b/u },
  { label: 'mass calculation', pattern: /\b(?:calculateMass|massPerLength|sectionMass)\b/u },
  { label: 'weight calculation', pattern: /\b(?:calculateWeight|weightPerLength|sectionWeight)\b/u },
  { label: 'local-axis construction', pattern: /\b(?:resolveFrameLocalAxes|localAxis|localAxes)\b/u },
  { label: 'stiffness matrix construction', pattern: /\b(?:stiffnessMatrix|elementStiffness|assembleStiffness)\b/u },
  { label: 'load construction', pattern: /\b(?:constructLoad|loadVector|elementLoad)\b/u },
  { label: 'solver behavior', pattern: /\b(?:solveLinearSystem|globalSolver|solverState)\b/u },
]) {
  assertAbsent(productionSource, pattern, `Production source contains prohibited ${label}.`);
}

for (const { file, source } of productionRows) {
  for (const specifier of importSpecifiers(source)) {
    const normalized = specifier.toLowerCase();
    const prohibited = normalized.includes('workspace')
      || /(^|\/)ui(\/|$)/u.test(normalized)
      || normalized.includes('solver')
      || normalized.includes('material')
      || normalized.includes('centerline-beam-fea')
      || normalized.includes('local-axis')
      || normalized.includes('model-schema')
      || normalized.includes('model-validation')
      || normalized.includes('package.json');
    assert.equal(
      prohibited,
      false,
      `${path.relative(ROOT, file)} imports prohibited package ${specifier}.`,
    );
  }
}

assertAbsent(productionSource, /\.localeCompare\s*\(/u, 'Locale-sensitive ordering is prohibited.');
assertAbsent(productionSource, /\bIntl\s*\.\s*Collator\b/u, 'Intl.Collator is prohibited.');
assertAbsent(productionSource, /\b(?:FNV|FNV_PRIME|hashBytes|hashUtf8|TextEncoder)\b/u, 'Private hash implementation is prohibited.');
assertAbsent(productionSource, /\bBigInt\b|0xcbf29ce4|0x100000001b3/u, 'Private hash constants are prohibited.');
assertAbsent(productionSource, /\bJSON\s*\.\s*stringify\s*\(/u, 'Hashing must use repository canonical JSON authority.');
assertAbsent(productionSource, /\.(?:sort|reverse|splice|copyWithin|fill)\s*\(/u, 'Caller-array mutation or implicit reordering is prohibited.');
assertAbsent(productionSource, /\b(?:Number\.EPSILON|Number\.MIN_VALUE|tolerance|wallRatio|minimumWall)\b/u, 'Hidden geometric tolerances are prohibited.');
assertAbsent(productionSource, /wallThickness\s*\/\s*outerDiameter/u, 'A minimum wall-ratio policy is prohibited.');
assertAbsent(productionSource, /\bMath\s*\.\s*(?:min|max)\s*\(/u, 'Wall-thickness clamping is prohibited.');
assertAbsent(productionSource, /\*\*\s*4/u, 'Fourth-power evaluation is prohibited in production source.');
assertAbsent(productionSource, /Math\s*\.\s*pow\s*\([^,]+,\s*4\s*\)/u, 'Fourth-power evaluation is prohibited in production source.');
assertAbsent(
  productionSource,
  /outerDiameterSquared\s*\*\s*outerDiameterSquared\s*-\s*innerDiameterSquared\s*\*\s*innerDiameterSquared/u,
  'Direct fourth-power subtraction is prohibited.',
);
assertAbsent(
  productionSource,
  /Math\.PI\s*\*\s*outerDiameter\s*\*\s*outerDiameter\s*\/\s*4/u,
  'Solid-section area fallback is prohibited.',
);
assertAbsent(productionSource, /Object\.is\s*\([^)]*,\s*-0\s*\)/u, 'Negative-zero normalization must use repository authority.');

const propertiesSource = stripComments(await readFile(PROPERTIES_FILE, 'utf8'));
assert.match(
  propertiesSource,
  /const\s+diameterRemainder\s*=\s*outerDiameter\s*-\s*wallThickness\s*;/u,
  'The stable Do - t factor is required.',
);
assert.match(
  propertiesSource,
  /const\s+area\s*=\s*Math\.PI\s*\*\s*wallThickness\s*\*\s*diameterRemainder\s*;/u,
  'The stable area identity A = pi t (Do - t) is required.',
);
assert.match(
  propertiesSource,
  /const\s+secondMoment\s*=\s*\(Math\.PI\s*\/\s*16\)[\s\S]*?\*\s*wallThickness[\s\S]*?\*\s*diameterRemainder[\s\S]*?\*\s*\(outerDiameterSquared\s*\+\s*innerDiameterSquared\)\s*;/u,
  'The stable factored annulus inertia identity is required.',
);
assert.match(
  propertiesSource,
  /const\s+polarMoment\s*=\s*2\s*\*\s*secondMoment\s*;/u,
  'The polar moment must be J = 2I.',
);
assert.match(propertiesSource, /PIPE_SECTION_SOLID_NOT_SUPPORTED/u, 'Exact solid-section rejection is required.');
assert.match(propertiesSource, /PIPE_SECTION_GEOMETRY_NOT_RESOLVABLE/u, 'Unrepresentable annulus rejection is required.');

const canonicalizationSource = stripComments(await readFile(
  path.join(PACKAGE_DIR, 'pipe-section-canonicalization.js'),
  'utf8',
));
assert.match(
  canonicalizationSource,
  /from\s+['"]\.\.\/shared-piping-model\/canonical-json\.js['"]/u,
  'Repository canonical JSON and UTF-8 semantic hash authority must be imported.',
);
assert.match(canonicalizationSource, /semanticHash\(/u, 'Repository semanticHash authority must be called.');
assert.match(canonicalizationSource, /canonicalizeJson\(/u, 'Repository numerical normalization authority must be called.');
assert.match(
  canonicalizationSource,
  /schema:\s*profile\.schema/u,
  'The profile semantic projection must bind profile.schema.',
);
assert.doesNotMatch(
  canonicalizationSource,
  /schema:\s*profile\.scheme/u,
  'The stale profile.scheme typo is prohibited.',
);

const allCoreFiles = await filesBelow(SRC_CORE, (file) => file.endsWith('.js'));
const outsideOccurrences = [];
for (const file of allCoreFiles) {
  if (file.startsWith(`${PACKAGE_DIR}${path.sep}`)) continue;
  const source = stripComments(await readFile(file, 'utf8'));
  if (source.includes('PIPE_CIRCULAR_ANNULUS_V1')) outsideOccurrences.push(path.relative(ROOT, file));
}
assert.deepEqual(
  outsideOccurrences,
  [],
  `Circular-annulus compiler ownership is duplicated outside linear-fea-section: ${outsideOccurrences.join(', ')}`,
);

console.log('PASS B23-G01 Governed source layout is exact');
console.log('PASS B23-G02 Mechanical scope boundaries are clean');
console.log('PASS B23-G03 Stable factored annulus formulas are executable authority');
console.log('PASS B23-G04 Direct fourth-power subtraction and solid fallback are absent');
console.log('PASS B23-G05 No hidden tolerance, clamping, or caller-array mutation');
console.log('PASS B23-G06 Repository canonical JSON and UTF-8 hash authority is reused');
console.log('PASS B23-G07 No duplicate circular-annulus compiler ownership');
console.log('PASS B23-G08 Profile schema is bound into profile semantic identity');
console.log('LFEA B-2.3 pipe-section source guard passed.');
