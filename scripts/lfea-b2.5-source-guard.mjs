#!/usr/bin/env node

/**
 * LFEA B-2.5 source guard.
 *
 * Reads the mechanical-model compiler as text and refuses the shapes a review
 * cannot reliably catch by running the package: a numeric tolerance written as
 * a literal, a re-implemented semantic hash, a locale-dependent comparator, a
 * silently repaired axis or constraint, and any leak of solver, load-case or
 * code-evaluation concerns into the compiler.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packageFiles = [
  'src/core/linear-fea-model-compiler/model-compiler-contract.js',
  'src/core/linear-fea-model-compiler/model-compiler-intake.js',
  'src/core/linear-fea-model-compiler/model-compiler.js',
  'src/core/linear-fea-model-compiler/index.js',
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

for (const path of packageFiles) assert.ok(source[path].length > 0, `missing required source file ${path}`);

/* Determinism must not depend on the host locale or on object iteration luck. */
reject(/\.localeCompare\s*\(/u, 'localeCompare() is prohibited');
reject(/\bIntl\./u, 'Intl collation is prohibited');
reject(/Math\.random|Date\.now|new\s+Date\s*\(/u, 'nondeterministic sources are prohibited');

/* The semantic hash has one implementation; this package reuses it. */
reject(/\b(?:hashBytes|hashUtf8|TextEncoder)\b|Math\.imul/u, 'a second hash implementation is prohibited');
for (const path of [
  'src/core/linear-fea-model-compiler/model-compiler-contract.js',
  'src/core/linear-fea-model-compiler/model-compiler.js',
]) {
  assert.match(
    source[path],
    /from\s*'\.\.\/shared-piping-model\/canonical-json\.js'/u,
    `${path} must reuse the repository canonical-JSON hash authority`,
  );
}
assert.match(
  source['src/core/linear-fea-model-compiler/model-compiler.js'],
  /sealLinearFeaModel/u,
  'the model must be sealed by the B-2.1 contract, not by a local validator',
);

/* Upstream authorities are consumed through their own validators. */
assert.match(source['src/core/linear-fea-model-compiler/model-compiler-intake.js'], /requireMaterialResolutionResult/u);
assert.match(source['src/core/linear-fea-model-compiler/model-compiler-intake.js'], /requirePipeSectionResolution/u);
assert.match(source['src/core/linear-fea-model-compiler/model-compiler-intake.js'], /requireFrameLocalAxisProfile/u);

/* No mechanics may be recomputed, invented or repaired here. */
reject(/Math\.PI|outerDiameter|innerDiameter|wallThickness|scheduleLookup/iu, 'section formulas are prohibited');
reject(/interpolat(?:e|ion)\s*\(/iu, 'material interpolation is prohibited');
reject(/(?:construct|create|generate|derive|repair|normalize|negate|reorder)LocalAxes\s*\(/iu, 'local-axis construction or repair is prohibited');
reject(/(?:assemble|construct|build)(?:Element|Global)?Stiffness(?:Matrix)?\s*\(/iu, 'stiffness matrix construction is prohibited');
reject(/\b(?:gravityVector|nodalForces?|distributedLoads?|elementTemperatures?|loadCombinations?|prescribedDisplacementValue)\b/u, 'physical load-case fields are prohibited');
reject(/\b(?:sif|allowables?|utilization)\b/iu, 'code-result fields are prohibited');
reject(/from\s*['"][^'"]*(?:src\/workspace|\/workspace\/|src\/core\/element-fea|\/element-fea\/|solver|nonlinear)[^'"]*['"]/iu, 'prohibited package import detected');

/* Every numeric policy arrives declared; none is written into the source. */
const contract = source['src/core/linear-fea-model-compiler/model-compiler-contract.js'];
assert.match(contract, /requireDeclaredValue/u, 'declared-value resolution is mandatory');
assert.match(contract, /PROHIBITED_PROFILE_SOURCE_TOKENS/u);
assert.match(contract, /MODEL_COMPILER_PROFILE_SOURCE_NOT_TRACEABLE/u);
for (const token of ['DEFAULT', 'FALLBACK', 'HARDCODED', 'UNKNOWN']) {
  assert.match(
    contract.match(/PROHIBITED_PROFILE_SOURCE_TOKENS[\s\S]*?\]\);/u)?.[0] ?? '',
    new RegExp(`'${token}'`, 'u'),
    `${token} must be refused as a profile source`,
  );
}
reject(
  /(?:minimumElementLength|spanDirectionTolerance|Tolerance|Limit)\s*[:=]\s*-?\d/u,
  'a tolerance or limit literal is prohibited; every numeric policy must be declared',
);
reject(/\?\?\s*-?\d|\|\|\s*-?\d(?!\d*\s*\))/u, 'a numeric fallback default is prohibited');

/* Fail closed: each binding gap has its own machine-readable rejection. */
const compiler = source['src/core/linear-fea-model-compiler/model-compiler.js'];
for (const code of [
  'MODEL_COMPILER_MATERIAL_BINDING_MISSING',
  'MODEL_COMPILER_SECTION_BINDING_MISSING',
  'MODEL_COMPILER_AXIS_BINDING_MISSING',
  'MODEL_COMPILER_AXIS_ELEMENT_MISMATCH',
  'MODEL_COMPILER_ELEMENT_BELOW_MINIMUM_LENGTH',
  'MODEL_COMPILER_CONSTRAINT_CONFLICT',
  'MODEL_COMPILER_END_RELEASE_NOT_REPRESENTABLE',
  'MODEL_COMPILER_RIGID_LINK_NOT_REPRESENTABLE',
  'MODEL_COMPILER_LIMITATION_CONFLICT',
  'MODEL_COMPILER_IDENTITY_CHAIN_BROKEN',
]) {
  assert.match(compiler, new RegExp(code, 'u'), `${code} must remain a compiler rejection`);
}
const intake = source['src/core/linear-fea-model-compiler/model-compiler-intake.js'];
for (const code of [
  'MODEL_COMPILER_ZERO_LENGTH_LINK_PROHIBITED',
  'MODEL_COMPILER_UNIT_NOT_CANONICAL',
  'MODEL_COMPILER_SPAN_BINDING_MISSING',
  'MODEL_COMPILER_SPAN_BINDING_AMBIGUOUS',
  'MODEL_COMPILER_NODE_BINDING_MISSING',
  'MODEL_COMPILER_NODE_BINDING_AMBIGUOUS',
]) {
  assert.match(intake, new RegExp(code, 'u'), `${code} must remain an intake rejection`);
}
assert.doesNotMatch(
  compiler,
  /\.localAxes\s*\.\s*[xyz]\s*=|axes\.[xyz]\s*=/u,
  'the compiler must not alter supplied axes',
);
assert.doesNotMatch(
  compiler,
  /(?:continue|return)\s*;?\s*\/\/\s*(?:skip|ignore)/iu,
  'a declaration must never be skipped silently',
);

/* No exported ready-made profile: a project must author and export its own. */
reject(/export\s+const\s+\w*COMPILER_PROFILE\s*=/u, 'a built-in compiler profile is prohibited');

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
assert.equal(
  packageJson.scripts['check:lfea-b2.5'],
  'node scripts/lfea-b2.5-model-compiler-check.mjs && node scripts/lfea-b2.5-reviewer-check.mjs && node scripts/lfea-b2.5-source-guard.mjs',
  'check:lfea-b2.5 registration is missing',
);
assert.match(
  packageJson.scripts['check:lfea-linear-core'] ?? '',
  /npm run check:lfea-b2\.5/u,
  'check:lfea-b2.5 must run inside check:lfea-linear-core',
);
for (const script of ['check:lfea-b2.0', 'check:lfea-b2.1', 'check:lfea-b2.2', 'check:lfea-b2.3', 'check:lfea-b2.4']) {
  assert.ok(packageJson.scripts[script], `${script} must be preserved`);
}

console.log('LFEA B-2.5 source guard PASS');
