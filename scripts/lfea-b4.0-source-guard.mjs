#!/usr/bin/env node

/**
 * LFEA B-4.0 source guard.
 *
 * Reads the B31.3 code-engine package as text and refuses the shapes a
 * review cannot reliably catch by running it: a real ASME numeric value
 * embedded in source, a numeric policy written as a literal, a second hash
 * implementation, a locale-dependent comparator, a re-derived stiffness or
 * resultant, a nested `Object.freeze` that would block the final `deepFreeze`
 * from recursing, a self-referential hash projection, and a flexibility
 * factor computed here rather than consumed from B-3.2.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packageFiles = [
  'src/core/linear-fea-b31-code-engine/code-engine-contract.js',
  'src/core/linear-fea-b31-code-engine/allowable-resolution.js',
  'src/core/linear-fea-b31-code-engine/stress-terms.js',
  'src/core/linear-fea-b31-code-engine/categories.js',
  'src/core/linear-fea-b31-code-engine/code-engine.js',
  'src/core/linear-fea-b31-code-engine/index.js',
];
const source = Object.fromEntries(packageFiles.map((path) => [path, readFileSync(resolve(root, path), 'utf8')]));
const combined = Object.entries(source).map(([path, text]) => `\n/* ${path} */\n${text}`).join('\n');

function reject(pattern, message) {
  assert.equal(pattern.test(combined), false, message);
}

/* Executable text only: comments may and must explain the maths. */
const executable = combined.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:])\/\/.*$/gmu, '$1');

function rejectCode(pattern, message) {
  assert.equal(pattern.test(executable), false, message);
}

for (const path of packageFiles) assert.ok(source[path].length > 0, `missing required source file ${path}`);

/* Determinism must not depend on host locale, iteration order or chance. */
reject(/\.localeCompare\s*\(/u, 'localeCompare() is prohibited');
reject(/\bIntl\./u, 'Intl collation is prohibited');
reject(/Math\.random|Date\.now|new\s+Date\s*\(/u, 'nondeterministic sources are prohibited');
rejectCode(/for\s*\(\s*\w+\s+\w+\s+in\s+/u, 'for-in iteration over object keys is order-fragile and prohibited');

/* The semantic hash has one implementation; this package reuses it. */
reject(/\b(?:hashBytes|hashUtf8|TextEncoder)\b/u, 'a second hash implementation is prohibited');
for (const path of [
  'src/core/linear-fea-b31-code-engine/code-engine-contract.js',
  'src/core/linear-fea-b31-code-engine/code-engine.js',
]) {
  assert.match(
    source[path],
    /from\s*'\.\.\/shared-piping-model\/canonical-json\.js'/u,
    `${path} must reuse the repository canonical-JSON hash authority`,
  );
}

/* Upstream authorities are consumed through their own validators, never
 * re-derived: B-3.1 frame elements, B-2.3 section resolutions and B-2.2
 * material resolutions are all re-accepted, not trusted or rebuilt. */
assert.match(source['src/core/linear-fea-b31-code-engine/code-engine.js'], /requireFrameElement/u, 'the B-3.1 frame element must arrive through its own validator');
assert.match(source['src/core/linear-fea-b31-code-engine/code-engine.js'], /requirePipeSectionResolution/u, 'the B-2.3 section resolution must arrive through its own validator');
assert.match(source['src/core/linear-fea-b31-code-engine/code-engine.js'], /requireMaterialResolutionResult/u, 'the B-2.2 material resolution must arrive through its own validator');
assert.match(source['src/core/linear-fea-b31-code-engine/code-engine.js'], /requireFactorApplicability/u, 'B-3.2 applicability/override machinery must be reused directly, not reimplemented');

/* This package computes no stiffness, no B-3.2 flexibility factor and no
 * B31J factor value: every index/SIF/allowable/coefficient is caller-declared
 * and this package only ever reads `.value` off an already-validated declared
 * entry — it never derives one from geometry. */
rejectCode(
  /\b(?:localStiffness|globalStiffness|effectiveLocalStiffness|effectiveGlobalStiffness|K_local|flexibilityFactor)\b/u,
  'stiffness/flexibility quantities belong to B-3.1/B-3.2; the code engine must never touch them',
);
rejectCode(
  /\bassertSingleFlexibilityOwnership\b/u,
  'flexibility ownership is asserted by whichever package assembles/solves; the code engine only ever reads recovered resultants and never re-touches stiffness',
);

/* No real ASME table value may be embedded: every allowable/factor arrives
 * through requireDeclaredValue with a source, never a bare numeric literal
 * standing in for a table entry. Weld-joint/duration-factor/coefficient
 * fields in particular must never carry an inline default. */
rejectCode(/\?\?\s*-?\d|\|\|\s*-?\d(?!\d*\s*\))/u, 'a numeric fallback default is prohibited');
for (const field of ['weldJointFactor', 'liberalAllowableUpliftFactor', 'allowableStress', 'durationFactor']) {
  assert.match(
    combined,
    new RegExp(`requireDeclaredValue\\([^)]*'${field}'`, 'u'),
    `${field} must arrive declared with a source via requireDeclaredValue`,
  );
}
/* The three displacement-range coefficients and the four directional
 * indices/SIFs are each validated through a loop over their own frozen key
 * list (`DISPLACEMENT_RANGE_COEFFICIENT_KEYS`, `DIRECTIONAL_FACTOR_KEYS`)
 * rather than one requireDeclaredValue call per literal field name — still
 * every value, every field, via requireDeclaredValue, never a literal. */
assert.match(
  combined,
  /requireDeclaredValue\(dataset\.displacementRangeCoefficients,\s*key/u,
  'displacementRangeCoefficients entries must arrive declared with a source via requireDeclaredValue',
);
assert.match(
  combined,
  /requireDeclaredValue\(record,\s*key/u,
  'directional index/SIF entries must arrive declared with a source via requireDeclaredValue',
);
for (const keys of ['DISPLACEMENT_RANGE_COEFFICIENT_KEYS', 'DIRECTIONAL_FACTOR_KEYS']) {
  assert.match(combined, new RegExp(`for \\(const key of ${keys}\\)`, 'u'), `${keys} must be validated by iterating its own frozen key list`);
}

/* Every draft object this package builds is a plain object/array literal
 * until the single top-level deepFreeze call in requireCodeProfile /
 * requireEditionDataset / requireStressFactorSet / requireCodeResult. A
 * nested Object.freeze on a sub-object before that seal would silently leave
 * that sub-object's own children unfrozen forever (the historical B-3.4
 * defect this convention guards against repository-wide). This applies to the
 * builder modules only — `code-engine-contract.js` legitimately
 * `Object.freeze`s its own static key-list constants, exactly as every other
 * LFEA `*-contract.js` module does. */
for (const path of [
  'src/core/linear-fea-b31-code-engine/allowable-resolution.js',
  'src/core/linear-fea-b31-code-engine/stress-terms.js',
  'src/core/linear-fea-b31-code-engine/categories.js',
  'src/core/linear-fea-b31-code-engine/code-engine.js',
]) {
  const fileExecutable = source[path].replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:])\/\/.*$/gmu, '$1');
  assert.equal(/Object\.freeze\s*\(/u.test(fileExecutable), false, `${path} must not call Object.freeze itself; only the single top-level deepFreeze call may freeze this package's own draft objects`);
}

/* The code-result/profile/dataset/factor-set hashes must not be
 * self-referential. */
assert.match(
  source['src/core/linear-fea-b31-code-engine/code-engine.js'],
  /key === 'semanticHash' \|\| key === 'evidenceHash'/u,
  'codeResultSemanticProjection must exclude semanticHash/evidenceHash from its own hash input',
);
assert.match(
  source['src/core/linear-fea-b31-code-engine/code-engine-contract.js'],
  /if \(key === 'semanticHash'\) continue;/u,
  'profile/dataset/factor-set semantic projections must exclude semanticHash from their own hash input',
);

/* Extrapolation is never implemented: every temperature resolution path must
 * refuse a temperature outside the declared table range. */
assert.match(
  source['src/core/linear-fea-b31-code-engine/allowable-resolution.js'],
  /CODE_ENGINE_ALLOWABLE_TEMPERATURE_EXTRAPOLATION_PROHIBITED/u,
  'temperature extrapolation must remain a dedicated, unconditional refusal',
);

/* SUSTAINED/OCCASIONAL and DISPLACEMENT_STRESS_RANGE must draw their indices
 * from distinct declared factor-set groups (section 15.5: never cross-apply
 * displacement SIFs to sustained stress or vice versa). */
assert.match(source['src/core/linear-fea-b31-code-engine/code-engine.js'], /factorSet\.sustainedIndices/u, 'SUSTAINED must read sustainedIndices');
assert.match(source['src/core/linear-fea-b31-code-engine/code-engine.js'], /factorSet\.occasionalIndices/u, 'OCCASIONAL must read occasionalIndices');
assert.match(source['src/core/linear-fea-b31-code-engine/code-engine.js'], /factorSet\.displacementSifs/u, 'DISPLACEMENT_STRESS_RANGE must read displacementSifs');

/* Mechanism/failure reporting names a dedicated code, never a generic error. */
for (const code of [
  'CODE_ENGINE_SCOPE_NOT_IMPLEMENTED',
  'CODE_ENGINE_OPERATING_NOT_A_COMPLIANCE_CATEGORY',
  'CODE_ENGINE_USER_PROJECT_CHECK_NOT_A_COMPLIANCE_CATEGORY',
  'CODE_ENGINE_EXPANSION_RANGE_ENVELOPE_NOT_IMPLEMENTED',
  'CODE_ENGINE_OCCASIONAL_FACTOR_NOT_DECLARED',
  'CODE_ENGINE_DISPLACEMENT_RANGE_COLD_TEMPERATURE_REQUIRED',
  'CODE_ENGINE_TEMPERATURE_NOT_EXACT_MATCH',
  'CODE_ENGINE_ALLOWABLE_TEMPERATURE_EXTRAPOLATION_PROHIBITED',
  'CODE_ENGINE_COMPONENT_MISMATCH',
  'CODE_ENGINE_MATERIAL_MISMATCH',
  'CODE_ENGINE_SECTION_MISMATCH',
  'CODE_ENGINE_HASH_MISMATCH',
  'CODE_ENGINE_USER_OVERRIDE_INCOMPLETE',
]) {
  assert.match(combined, new RegExp(code, 'u'), `${code} must remain a code-engine rejection`);
}
assert.doesNotMatch(
  combined,
  /(?:continue|return)\s*;?\s*\/\/\s*(?:skip|ignore)/iu,
  'an input must never be skipped silently',
);

/* Section 10.7 status vocabulary must be exact; no generic compliance badge. */
assert.match(combined, /'QUALIFIED UNDER CONFIGURED PROFILE'/u, 'the exact section 10.7 QUALIFIED status wording must be present');
reject(/\bcompliant\s*[:=]\s*(?:true|false)\b/iu, 'a generic boolean compliance badge is prohibited; only the section 10.7 status vocabulary may be used');

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
assert.equal(
  packageJson.scripts['check:lfea-b4.0'],
  'node scripts/lfea-b4.0-code-engine-check.mjs && node scripts/lfea-b4.0-reviewer-check.mjs && node scripts/lfea-b4.0-source-guard.mjs',
  'check:lfea-b4.0 registration is missing',
);
assert.match(
  packageJson.scripts['check:lfea-core'],
  /npm run check:lfea-b3\.4 && npm run check:lfea-b4\.0/u,
  'check:lfea-b4.0 must run inside check:lfea-core, directly after check:lfea-b3.4',
);
for (const script of [
  'check:lfea-b2.0', 'check:lfea-b2.1', 'check:lfea-b2.2', 'check:lfea-b2.3', 'check:lfea-b2.4', 'check:lfea-b2.5',
  'check:lfea-b3.0', 'check:lfea-b3.1', 'check:lfea-b3.2', 'check:lfea-b3.3', 'check:lfea-b3.4',
]) {
  assert.ok(packageJson.scripts[script], `${script} must be preserved`);
}

console.log('LFEA B-4.0 source guard PASS');
