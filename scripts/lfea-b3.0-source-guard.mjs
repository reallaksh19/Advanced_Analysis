#!/usr/bin/env node

/**
 * LFEA B-3.0 source guard.
 *
 * Reads the physical load-case package as text and refuses the shapes a review
 * cannot reliably catch by running it: a numeric policy written as a literal, a
 * re-implemented semantic hash, a locale-dependent comparator, a load quietly
 * converted into an equivalent nodal vector or a thermal strain, the stiffness
 * state folded into the load-case content hash, and any leak of solver or
 * code-evaluation concerns into this layer.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packageFiles = [
  'src/core/linear-fea-load-case/load-case-contract.js',
  'src/core/linear-fea-load-case/load-case-model-reference.js',
  'src/core/linear-fea-load-case/load-primitives.js',
  'src/core/linear-fea-load-case/physical-load-case.js',
  'src/core/linear-fea-load-case/load-case-combination.js',
  'src/core/linear-fea-load-case/index.js',
];
const source = Object.fromEntries(
  packageFiles.map((path) => [path, readFileSync(resolve(root, path), 'utf8')]),
);
const combined = Object.entries(source)
  .map(([path, text]) => `\n/* ${path} */\n${text}`)
  .join('\n');

function reject(pattern, message) {
  assert.equal(pattern.test(combined), false, message);
}

/**
 * Executable text only. The mechanics and literal refusals below are about what
 * the package computes, not about what its documentation is allowed to explain:
 * a comment naming `alpha * deltaT` to say the arithmetic belongs elsewhere is
 * exactly the disclosure this package is required to carry.
 */
const executable = combined.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:])\/\/.*$/gmu, '$1');

function rejectCode(pattern, message) {
  assert.equal(pattern.test(executable), false, message);
}

for (const path of packageFiles) assert.ok(source[path].length > 0, `missing required source file ${path}`);

/* Determinism must not depend on the host locale or on object iteration luck. */
reject(/\.localeCompare\s*\(/u, 'localeCompare() is prohibited');
reject(/\bIntl\./u, 'Intl collation is prohibited');
reject(/Math\.random|Date\.now|new\s+Date\s*\(/u, 'nondeterministic sources are prohibited');

/* The semantic hash has one implementation; this package reuses it. */
reject(/\b(?:hashBytes|hashUtf8|TextEncoder)\b|Math\.imul/u, 'a second hash implementation is prohibited');
for (const path of [
  'src/core/linear-fea-load-case/load-case-contract.js',
  'src/core/linear-fea-load-case/load-primitives.js',
  'src/core/linear-fea-load-case/physical-load-case.js',
  'src/core/linear-fea-load-case/load-case-combination.js',
]) {
  assert.match(
    source[path],
    /from\s*'\.\.\/shared-piping-model\/canonical-json\.js'/u,
    `${path} must reuse the repository canonical-JSON hash authority`,
  );
}

/* Upstream authorities are consumed through their own validators, never copied. */
assert.match(
  source['src/core/linear-fea-load-case/load-case-model-reference.js'],
  /requireMechanicalModelCompilation/u,
  'the mechanical model must be accepted through the B-2.5 validator',
);
assert.match(
  source['src/core/linear-fea-load-case/load-case-contract.js'],
  /import\s*\{\s*PROHIBITED_PROFILE_SOURCE_TOKENS\s*\}\s*from\s*'\.\.\/linear-fea-model-compiler\/index\.js'/u,
  'the prohibited-source token list has one owner and is reused, not restated',
);
assert.match(
  source['src/core/linear-fea-load-case/load-primitives.js'],
  /from\s*'\.\.\/shared-analysis-contract\/vector3\.js'/u,
  'vector algebra and basis qualification are reused from the shared contract',
);
assert.match(
  source['src/core/linear-fea-load-case/load-primitives.js'],
  /from\s*'\.\.\/attachment-load-contract\/constants\.js'/u,
  'the force/moment resultant component shape is reused, not reinvented',
);

/* No mechanics may be formed here: this layer declares loads, it does not apply them. */
rejectCode(/\bMath\.PI\b/u, 'geometry formulas are prohibited');
rejectCode(
  /\b(?:equivalentNodalVector|consistentLoadVector|equivalentLoad|loadVector|thermalStrain|initialStrain|shapeFunction|stiffnessMatrix|assembleGlobal|elementMatrix)\b/iu,
  'element formulation and equivalent-load construction belong to B-3.1/B-3.2',
);
rejectCode(/\balpha\s*\*|\bexpansionCoefficient\s*\*/iu, 'thermal strain arithmetic is prohibited in the load-case layer');
rejectCode(
  /\b(?:cholesky|ldlt|factorize|sparseAssembly|globalStiffness|solveLinearSystem|computeReactions)\b/iu,
  'solver concerns are prohibited',
);
rejectCode(/\b(?:sif|allowables?|utilization|codeStressResult|stressIndex)\b/iu, 'code-evaluation fields are prohibited');
reject(
  /from\s*['"][^'"]*(?:src\/workspace|\/workspace\/|src\/core\/element-fea|\/element-fea\/|solver|nonlinear)[^'"]*['"]/iu,
  'prohibited package import detected',
);

/* Every numeric policy arrives declared; none is written into the source. */
const contract = source['src/core/linear-fea-load-case/load-case-contract.js'];
assert.match(contract, /requireDeclaredValue/u, 'declared-value resolution is mandatory');
assert.match(contract, /LOAD_CASE_PROFILE_SOURCE_NOT_TRACEABLE/u);
assert.match(
  source['src/core/linear-fea-load-case/load-primitives.js'],
  /requireDeclaredValue\(input,\s*'coefficient'/u,
  'a wind or seismic coefficient must arrive declared with its source',
);
rejectCode(
  /(?:gravitationalAcceleration|directionUnitTolerance|accelerationMagnitude|Tolerance|Limit)\s*[:=]\s*-?\d/u,
  'a gravity, tolerance or limit literal is prohibited; every numeric policy must be declared',
);
rejectCode(/\b9\.8\d*\b|\b32\.17\d*\b/u, 'a standard-gravity literal is prohibited');
rejectCode(/\?\?\s*-?\d|\|\|\s*-?\d(?!\d*\s*\))/u, 'a numeric fallback default is prohibited');
rejectCode(/export\s+const\s+\w*LOAD_CASE_PROFILE\s*=\s*\{/u, 'a built-in load-case profile is prohibited');

/* The load-case content hash must not absorb the model it is declared against. */
const loadCaseSource = source['src/core/linear-fea-load-case/physical-load-case.js'];
const contentProjection = loadCaseSource.match(
  /export function physicalLoadCaseContentProjection\(record\)\s*\{[\s\S]*?\n\}/u,
)?.[0] ?? '';
assert.ok(contentProjection.length > 0, 'physicalLoadCaseContentProjection must exist');
for (const forbidden of ['modelReference', 'stiffnessStateHash', 'mechanicalModelSemanticHash', 'presentation', 'diagnostics']) {
  assert.equal(
    contentProjection.includes(forbidden),
    false,
    `physicalLoadCaseContentProjection must not read ${forbidden}; the load-case hash is a pure function of load-case content`,
  );
}
assert.match(
  loadCaseSource,
  /computePhysicalLoadCaseHash/u,
  'the load-case content hash must remain a named, reviewable projection',
);

/* Fail closed: each gap has its own machine-readable rejection. */
for (const code of [
  'LOAD_CASE_NODE_UNKNOWN',
  'LOAD_CASE_ELEMENT_UNKNOWN',
  'LOAD_CASE_MATERIAL_STATE_UNKNOWN',
  'LOAD_CASE_PRESCRIBED_SLOT_UNKNOWN',
  'LOAD_CASE_PRESCRIBED_SLOT_MISMATCH',
  'LOAD_CASE_DIRECTION_NOT_UNIT',
  'LOAD_CASE_UNIT_MISMATCH',
  'LOAD_CASE_SIGN_CONVENTION_NOT_REPRESENTABLE',
  'LOAD_CASE_DISTRIBUTED_VARIATION_MISMATCH',
  'LOAD_CASE_THERMAL_PROFILE_MISMATCH',
  'LOAD_CASE_PRESSURE_EFFECT_NOT_DECLARED',
  'LOAD_CASE_GRAVITY_MASS_SOURCES_NOT_DECLARED',
]) {
  assert.match(combined, new RegExp(code, 'u'), `${code} must remain a load-case rejection`);
}
for (const code of [
  'LOAD_CASE_CODE_CATEGORY_NOT_A_SOLVER_CASE',
  'LOAD_CASE_THERMAL_ALPHA_INTEGRATION_NOT_IMPLEMENTED',
  'LOAD_CASE_LIMITATION_STIFFNESS_RELEVANT_PROHIBITED',
  'LOAD_CASE_COMBINATION_STIFFNESS_STATE_MISMATCH',
  'LOAD_CASE_LIMITATION_CONFLICT',
]) {
  assert.match(combined, new RegExp(code, 'u'), `${code} is a load-bearing refusal and must remain`);
}
assert.match(
  source['src/core/linear-fea-load-case/load-primitives.js'],
  /LOAD_CASE_LIMITATION_UNIFORM_TEMPERATURE_APPROXIMATION/u,
  'the uniform-temperature approximation must remain disclosed',
);
assert.doesNotMatch(
  combined,
  /(?:continue|return)\s*;?\s*\/\/\s*(?:skip|ignore)/iu,
  'a primitive must never be skipped silently',
);
assert.doesNotMatch(
  source['src/core/linear-fea-load-case/load-primitives.js'],
  /normaliz\w*\(\s*(?:direction|vector|basis)/iu,
  'a declared direction or basis is refused, never renormalised',
);

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
assert.equal(
  packageJson.scripts['check:lfea-b3.0'],
  'node scripts/lfea-b3.0-load-case-check.mjs && node scripts/lfea-b3.0-reviewer-check.mjs && node scripts/lfea-b3.0-source-guard.mjs',
  'check:lfea-b3.0 registration is missing',
);
assert.match(
  packageJson.scripts['check:lfea-core'],
  /npm run check:lfea-b3\.0/u,
  'check:lfea-b3.0 must run inside check:lfea-core',
);
for (const script of [
  'check:lfea-b2.0',
  'check:lfea-b2.1',
  'check:lfea-b2.2',
  'check:lfea-b2.3',
  'check:lfea-b2.4',
  'check:lfea-b2.5',
]) {
  assert.ok(packageJson.scripts[script], `${script} must be preserved`);
}

console.log('LFEA B-3.0 source guard PASS');
