import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_CORE = path.join(ROOT, 'src', 'core');
const CONTRACT_DIR = path.join(SRC_CORE, 'linear-fea-contract');
const PACKAGE_JSON = path.join(ROOT, 'package.json');

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
      } else if (character === quote) {
        state = 'code';
      }
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

function countMatches(source, expression) {
  return [...source.matchAll(expression)].length;
}

function scriptsObjectSource(packageSource) {
  const marker = /"scripts"\s*:/g.exec(packageSource);
  assert(marker, 'package.json must contain scripts.');
  let index = marker.index + marker[0].length;
  while (/\s/u.test(packageSource[index])) index += 1;
  assert.equal(packageSource[index], '{', 'scripts must be an object.');

  const start = index;
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (; index < packageSource.length; index += 1) {
    const character = packageSource[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"') quote = character;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return packageSource.slice(start + 1, index);
    }
  }

  assert.fail('scripts object is not closed.');
}

function topLevelObjectKeys(objectSource) {
  const keys = [];
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let index = 0; index < objectSource.length; index += 1) {
    const character = objectSource[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }

    if (character === '"' && depth === 0) {
      let end = index + 1;
      let value = '';
      let stringEscaped = false;
      for (; end < objectSource.length; end += 1) {
        const current = objectSource[end];
        if (stringEscaped) {
          value += current;
          stringEscaped = false;
        } else if (current === '\\') stringEscaped = true;
        else if (current === '"') break;
        else value += current;
      }
      let cursor = end + 1;
      while (/\s/u.test(objectSource[cursor])) cursor += 1;
      if (objectSource[cursor] === ':') keys.push(value);
      index = end;
      continue;
    }

    if (character === '{' || character === '[') depth += 1;
    else if (character === '}' || character === ']') depth -= 1;
  }

  return keys;
}

function importSpecifiers(source) {
  const expression = /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/gu;
  return [...source.matchAll(expression)].map((match) => match[1]);
}

function isForbiddenContractImport(specifier) {
  const normalized = specifier.toLowerCase();
  return normalized.includes('workspace')
    || /(^|\/)ui(\/|$)/u.test(normalized)
    || normalized.includes('element-fea')
    || normalized.includes('solver')
    || normalized.includes('stress')
    || normalized.includes('sif')
    || normalized.includes('code-evaluation')
    || normalized.includes('code-eval')
    || normalized.includes('piping-code')
    || normalized.includes('nonlinear');
}

assert.equal((await stat(CONTRACT_DIR)).isDirectory(), true);

const productionFiles = await filesBelow(SRC_CORE, (file) => /\.(?:js|mjs)$/u.test(file));
const productionSources = await Promise.all(productionFiles.map(async (file) => ({
  file,
  source: stripComments(await readFile(file, 'utf8')),
})));
const governedProductionSources = productionSources.filter(({ file }) => {
  const relative = path.relative(SRC_CORE, file);
  const [packageName] = relative.split(path.sep);
  return packageName === 'centerline-beam-fea'
    || packageName.startsWith('linear-fea-');
});

for (const identifier of [
  'DOF_ORDER',
  'ELEMENT_END_ORDER',
  'ELEMENT_DOF_ORDER',
  'LINEAR_FEA_UNITS',
  'END_ACTION_CONVENTION',
]) {
  const declarations = governedProductionSources.filter(({ source }) =>
    new RegExp(`export\\s+const\\s+${identifier}\\b`, 'u').test(source));
  assert.equal(
    declarations.length,
    1,
    `${identifier} must have exactly one production declaration; found ${declarations.map(({ file }) => path.relative(ROOT, file)).join(', ')}`,
  );
}

const declarationScopeDirectories = (await readdir(SRC_CORE, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('linear-fea-'))
  .map((entry) => path.join(SRC_CORE, entry.name));
declarationScopeDirectories.push(path.join(SRC_CORE, 'centerline-beam-fea'));

const declarationScopeFiles = (await Promise.all(
  declarationScopeDirectories.map((directory) =>
    filesBelow(directory, (file) => /\.(?:js|mjs)$/u.test(file))),
)).flat();
const declarationScopeSources = await Promise.all(declarationScopeFiles.map(async (file) => ({
  file,
  source: stripComments(await readFile(file, 'utf8')),
})));

const sixDofLiteral = /\[\s*['"]UX['"]\s*,\s*['"]UY['"]\s*,\s*['"]UZ['"]\s*,\s*['"]RX['"]\s*,\s*['"]RY['"]\s*,\s*['"]RZ['"]\s*,?\s*\]/gu;
const twelveDofLiteral = /\[\s*['"]I:UX['"]\s*,\s*['"]I:UY['"]\s*,\s*['"]I:UZ['"]\s*,\s*['"]I:RX['"]\s*,\s*['"]I:RY['"]\s*,\s*['"]I:RZ['"]\s*,\s*['"]J:UX['"]\s*,\s*['"]J:UY['"]\s*,\s*['"]J:UZ['"]\s*,\s*['"]J:RX['"]\s*,\s*['"]J:RY['"]\s*,\s*['"]J:RZ['"]\s*,?\s*\]/gu;

assert.equal(
  declarationScopeSources.reduce((sum, { source }) => sum + countMatches(source, sixDofLiteral), 0),
  1,
  'The exact six-DOF literal must be declared once in the guarded source scope.',
);
assert.equal(
  declarationScopeSources.reduce((sum, { source }) => sum + countMatches(source, twelveDofLiteral), 0),
  1,
  'The exact 12-entry element layout literal must be declared once in the guarded source scope.',
);

const identifierSource = stripComments(await readFile(
  path.join(CONTRACT_DIR, 'identifiers.js'),
  'utf8',
));
assert.equal(/\.localeCompare\s*\(/u.test(identifierSource), false, 'Canonical ordering must not use localeCompare().');
assert.equal(/\bIntl\s*\.\s*Collator\b/u.test(identifierSource), false, 'Canonical ordering must not use Intl.Collator.');
assert(identifierSource.includes('charCodeAt'), 'Canonical ASCII ordering must compare code units directly.');

const packageSource = await readFile(PACKAGE_JSON, 'utf8');
const scriptKeys = topLevelObjectKeys(scriptsObjectSource(packageSource));
assert.equal(new Set(scriptKeys).size, scriptKeys.length, 'package.json contains duplicate script keys.');
const packageRecord = JSON.parse(packageSource);

assert.equal(
  packageRecord.scripts['check:lfea-b2.0'],
  'node scripts/lfea-b2.0-conventions-check.mjs && node scripts/lfea-b2.0-source-guard.mjs',
  'check:lfea-b2.0 must run the qualification check and source guard.',
);

const lfeaCore = packageRecord.scripts['check:lfea-core'] ?? '';
assert(
  lfeaCore.startsWith('npm run check:lfea-b2.0 && '),
  'check:lfea-b2.0 must be first in check:lfea-core.',
);

const gate = packageRecord.scripts.gate ?? '';
assert(
  gate.includes('npm run check:lfea-core'),
  'check:lfea-core must be reachable from npm run gate.',
);

const contractFiles = await filesBelow(CONTRACT_DIR, (file) => /\.(?:js|mjs)$/u.test(file));
for (const file of contractFiles) {
  const source = stripComments(await readFile(file, 'utf8'));
  for (const specifier of importSpecifiers(source)) {
    assert.equal(
      isForbiddenContractImport(specifier),
      false,
      `${path.relative(ROOT, file)} imports prohibited package ${specifier}.`,
    );
  }
}

console.log('PASS B20-G01 Single production owner for convention declarations');
console.log('PASS B20-G02 No duplicate six-DOF or 12-DOF literals');
console.log('PASS B20-G03 Canonical ordering is locale-independent');
console.log('PASS B20-G04 B-2.0 check is first in check:lfea-core');
console.log('PASS B20-G05 check:lfea-core is reachable from npm run gate');
console.log('PASS B20-G06 package.json script keys are unique');
console.log('PASS B20-G07 Linear FEA contract imports respect package boundaries');
console.log('LFEA B-2.0 source guard passed.');
