#!/usr/bin/env node

/** LFEA B-4.2 source guard: pressure derivation stays deterministic and narrow. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const paths = {
  derivation: 'src/core/linear-piping-code-application/pressure-stress-derivation.js',
  application: 'src/core/linear-piping-code-application/b31-application.js',
};
const source = Object.fromEntries(
  Object.entries(paths).map(([key, path]) => [key, readFileSync(resolve(root, path), 'utf8')]),
);
const combined = Object.entries(source)
  .map(([key, text]) => `\n/* ${paths[key]} */\n${text}`)
  .join('\n');

function reject(pattern, message) {
  assert.equal(pattern.test(combined), false, message);
}

Object.entries(paths).forEach(([key, path]) => {
  assert.ok(source[key].length > 0, `missing required source file ${path}`);
});

reject(/Math\.random|Date\.now|new\s+Date\s*\(/u, 'nondeterministic sources are prohibited');
reject(/\.localeCompare\s*\(|\bIntl\./u, 'locale-dependent ordering is prohibited');
reject(/\b(?:hashBytes|hashUtf8|TextEncoder)\b|Math\.imul/u, 'a second hash implementation is prohibited');

/* B-2.3 owns section geometry; this package may read dimensions, not rebuild properties. */
reject(/Math\.PI[\s\S]*outerDiameter|wallThickness\s*\*/u, 'section-property re-derivation is prohibited');
assert.match(source.derivation, /requirePipeSectionResolution/u);
assert.match(source.derivation, /section\.dimensions/u);
assert.match(source.derivation, /outerDiameter/u);
assert.match(source.derivation, /wallThickness/u);
assert.match(source.derivation, /primitive\.pressure\s*\*\s*outerDiameter/u);
assert.match(source.derivation, /4\s*\*\s*wallThickness/u);

reject(
  /(?:continue|return)\s*;?\s*\/\/\s*(?:skip|ignore)/iu,
  'a pressure authorization must never be skipped silently',
);
reject(
  /delete\s+[^;\n]*(?:pressureStiffening|axialThrust|bourdon)|void\s+[^;\n]*(?:pressureStiffening|axialThrust|bourdon)/iu,
  'an authorized pressure effect must not be discarded',
);
for (const effect of ['pressureStiffening', 'axialThrust', 'bourdon']) {
  assert.match(
    source.derivation,
    new RegExp(`(?:['\"]${effect}['\"]|\\b${effect}\\s*:)`, 'u'),
    `${effect} must remain an explicitly inspected effect`,
  );
}
for (const code of [
  'PIPING_B31_PRESSURE_STRESS_CONFLICT',
  'PIPING_B31_PRESSURE_EFFECT_NOT_IMPLEMENTED',
  'PIPING_B31_PRESSURE_BASIS_NOT_DERIVABLE',
]) {
  assert.match(source.derivation, new RegExp(code, 'u'), `${code} must remain an explicit refusal`);
}
assert.match(source.derivation, /limitations/u, 'unsupported effects must produce structured limitation evidence');
assert.match(source.application, /resolvePressureStressContribution/u);
assert.match(source.application, /pressureStressContribution,/u);

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
assert.equal(
  packageJson.scripts['check:lfea-b4.2'],
  'node scripts/lfea-b4.2-pressure-stress-derivation-check.mjs && node scripts/lfea-b4.2-source-guard.mjs',
  'check:lfea-b4.2 registration is missing',
);
const linearCore = packageJson.scripts['check:lfea-linear-core'];
const b41Index = linearCore.indexOf('npm run check:lfea-b4.1');
const b42Index = linearCore.indexOf('npm run check:lfea-b4.2');
const consumerIndex = linearCore.indexOf('npm run check:linear-piping-analysis-consumer');
assert.ok(b41Index >= 0, 'check:lfea-linear-core must retain check:lfea-b4.1');
assert.ok(b42Index > b41Index, 'check:lfea-b4.2 must run after check:lfea-b4.1');
assert.ok(
  consumerIndex > b42Index,
  'check:lfea-b4.2 must run before check:linear-piping-analysis-consumer',
);

console.log('LFEA B-4.2 source guard PASS');
