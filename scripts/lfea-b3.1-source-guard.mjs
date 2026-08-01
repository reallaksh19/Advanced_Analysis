#!/usr/bin/env node

/**
 * LFEA B-3.1 source guard.
 *
 * Reads the frame-element package as text and refuses the shapes a review
 * cannot reliably catch by running it: a numeric policy written as a literal,
 * a second hash implementation, a locale-dependent comparator, an upstream
 * authority re-derived instead of consumed through its validator, assembly or
 * code-evaluation concerns leaking into the element, and a geometry-based
 * formulation switch.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packageFiles = [
  'src/core/linear-fea-frame-element/frame-element-contract.js',
  'src/core/linear-fea-frame-element/frame-element-stiffness.js',
  'src/core/linear-fea-frame-element/frame-element-loads.js',
  'src/core/linear-fea-frame-element/frame-element.js',
  'src/core/linear-fea-frame-element/index.js',
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

/* Executable text only: comments may and must explain the formulation. */
const executable = combined.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:])\/\/.*$/gmu, '$1');

function rejectCode(pattern, message) {
  assert.equal(pattern.test(executable), false, message);
}

for (const path of packageFiles) assert.ok(source[path].length > 0, `missing required source file ${path}`);

/* Determinism must not depend on the host locale or on chance. */
reject(/\.localeCompare\s*\(/u, 'localeCompare() is prohibited');
reject(/\bIntl\./u, 'Intl collation is prohibited');
reject(/Math\.random|Date\.now|new\s+Date\s*\(/u, 'nondeterministic sources are prohibited');

/* The semantic hash has one implementation; this package reuses it. */
reject(/\b(?:hashBytes|hashUtf8|TextEncoder)\b|Math\.imul/u, 'a second hash implementation is prohibited');
for (const path of [
  'src/core/linear-fea-frame-element/frame-element-contract.js',
  'src/core/linear-fea-frame-element/frame-element.js',
]) {
  assert.match(
    source[path],
    /from\s*'\.\.\/shared-piping-model\/canonical-json\.js'/u,
    `${path} must reuse the repository canonical-JSON hash authority`,
  );
}

/* Upstream authorities are consumed through their own validators, never re-derived. */
const compile = source['src/core/linear-fea-frame-element/frame-element.js'];
assert.match(compile, /requireMaterialResolutionResult/u, 'the B-2.2 material state arrives through its own validator');
assert.match(compile, /requirePipeSectionResolution/u, 'the B-2.3 section state arrives through its own validator');
assert.match(compile, /verifyFrameLocalAxes/u, 'the B-2.4 basis arrives through its own validator');
assert.match(compile, /requireLoadPrimitive/u, 'B-3.0 primitives arrive through their own validator');
assert.match(
  source['src/core/linear-fea-frame-element/frame-element-contract.js'],
  /PROHIBITED_PROFILE_SOURCE_TOKENS/u,
  'the prohibited-source token list has one owner and is reused, not restated',
);
rejectCode(
  /\b(?:outerDiameter|wallThickness|innerDiameter)\b/u,
  'section geometry must not be read here; the compiled A, Iy, Iz, J states are the section authority',
);
rejectCode(
  /\b(?:crossProduct|referenceVector|fallbackCandidates)\b|axes\s*=\s*\{/u,
  'the local basis is cited from B-2.4, never re-derived',
);

/* No assembly, solver or code-evaluation concern may enter the element. */
rejectCode(
  /\b(?:dofMap|globalIndex|globalDofIdentity|assemble|triplet|cholesky|ldlt|factoriz\w*|solveLinear|reaction)\b/iu,
  'assembly and solver concerns belong to B-3.3',
);
rejectCode(
  /\b(?:sifFactor|allowables?|utilization|stressIndex|codeStress|b31)\b/iu,
  'code-evaluation concerns belong to B-4.0',
);
rejectCode(
  /\b(?:bendArc|flexibilityFactor|reducer|branchJunction)\b/iu,
  'component mechanics belong to B-3.2',
);
reject(
  /from\s*['"][^'"]*(?:\/solvers\/|\/element-fea\/|\/workspace)[^'"]*['"]/iu,
  'prohibited package import detected',
);

/* The formulation is declared, never switched on geometry. */
rejectCode(/\bslenderness\b|length\s*[<>]=?\s*\d/iu, 'a geometry-based formulation switch is prohibited');
assert.match(combined, /FRAME_ELEMENT_SHEAR_DECLARATION_MISMATCH/u);

/* Every numeric policy arrives declared; none is written into the source. */
assert.match(
  source['src/core/linear-fea-frame-element/frame-element-contract.js'],
  /requireDeclaredValue\(profile,\s*'shearCorrectionFactor[YZ]'/u,
  'shear correction factors must arrive declared with a source',
);
assert.match(
  source['src/core/linear-fea-frame-element/frame-element-contract.js'],
  /requireDeclaredValue\(profile,\s*'releaseSingularityTolerance'/u,
  'the condensation pivot boundary must arrive declared with a source',
);
rejectCode(
  /(?:Tolerance|Factor|Limit|kappa[YZ]?)\s*[:=]\s*-?\d/u,
  'a tolerance, factor or limit literal is prohibited; every numeric policy must be declared',
);
rejectCode(/\b0\.5[36]\d*\b|\b0\.8[59]\d*\b/u, 'a shear-correction constant literal is prohibited');
rejectCode(/\?\?\s*-?\d|\|\|\s*-?\d(?!\d*\s*\))/u, 'a numeric fallback default is prohibited');
rejectCode(/export\s+const\s+\w*FRAME_ELEMENT_PROFILE\s*=\s*\{/u, 'a built-in formulation profile is prohibited');

/* The frozen conventions are cited, not restated. */
assert.match(compile, /TRANSFORMATION_CONVENTION_ID/u, 'the transformation identity must be cited from B-2.0');
assert.match(compile, /THERMAL_STRAIN_CONVENTION_ID/u, 'the thermal sign convention must be cited from B-2.0');
assert.match(compile, /elementDofIndex/u, 'the DOF layout must come from the frozen B-2.0 order');
assert.match(
  source['src/core/linear-fea-frame-element/frame-element-stiffness.js'],
  /transpose\(T\) K_local T|K_global = transpose/u,
  'the transformation direction must remain documented against the frozen identity',
);

/* Fail closed: each gap has its own machine-readable rejection. */
for (const code of [
  'FRAME_ELEMENT_RELEASE_CONFLICT',
  'FRAME_ELEMENT_RELEASE_MECHANISM',
  'FRAME_ELEMENT_RELEASE_SINGULAR',
  'FRAME_ELEMENT_SPRING_STIFFNESS_INVALID',
  'FRAME_ELEMENT_PRIMITIVE_UNSUPPORTED',
  'FRAME_ELEMENT_PRIMITIVE_ELEMENT_MISMATCH',
  'FRAME_ELEMENT_MATERIAL_STATE_MISMATCH',
  'FRAME_ELEMENT_THERMAL_PROFILE_MISMATCH',
  'FRAME_ELEMENT_THERMAL_ALPHA_INTEGRATION_NOT_IMPLEMENTED',
  'FRAME_ELEMENT_PROFILE_SOURCE_NOT_TRACEABLE',
  'FRAME_ELEMENT_SHEAR_DECLARATION_MISMATCH',
  'FRAME_ELEMENT_OFFSET_INVALID',
  'FRAME_ELEMENT_HASH_MISMATCH',
]) {
  assert.match(combined, new RegExp(code, 'u'), `${code} must remain a frame-element rejection`);
}
assert.match(
  combined,
  /FRAME_ELEMENT_LIMITATION_STRAIGHT_BEAM_APPROXIMATION/u,
  'the straight-beam approximation must remain disclosed',
);
assert.match(
  combined,
  /FRAME_ELEMENT_LIMITATION_UNIFORM_TEMPERATURE_APPROXIMATION/u,
  'the uniform-temperature approximation must remain disclosed',
);
assert.doesNotMatch(
  combined,
  /(?:continue|return)\s*;?\s*\/\/\s*(?:skip|ignore)/iu,
  'an input must never be skipped silently',
);
assert.doesNotMatch(
  source['src/core/linear-fea-frame-element/frame-element-stiffness.js'],
  /symmetriz\w*\(/iu,
  'the stiffness matrix is never symmetrised after the fact; symmetry is a property of the formulation',
);

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
assert.equal(
  packageJson.scripts['check:lfea-b3.1'],
  'node scripts/lfea-b3.1-frame-element-check.mjs && node scripts/lfea-b3.1-reviewer-check.mjs && node scripts/lfea-b3.1-source-guard.mjs',
  'check:lfea-b3.1 registration is missing',
);
assert.match(
  packageJson.scripts['check:lfea-linear-core'],
  /npm run check:lfea-b3\.0 && npm run check:lfea-b3\.1/u,
  'check:lfea-b3.1 must run inside check:lfea-linear-core, directly after check:lfea-b3.0',
);
assert.match(
  packageJson.scripts.gate,
  /npm run check:lfea-linear-core/u,
  'gate must retain the current linear-core aggregate',
);
for (const script of [
  'check:lfea-b2.0',
  'check:lfea-b2.1',
  'check:lfea-b2.2',
  'check:lfea-b2.3',
  'check:lfea-b2.4',
  'check:lfea-b2.5',
  'check:lfea-b3.0',
]) {
  assert.ok(packageJson.scripts[script], `${script} must be preserved`);
}

console.log('LFEA B-3.1 source guard PASS');
