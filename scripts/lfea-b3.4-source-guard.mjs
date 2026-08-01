#!/usr/bin/env node

/**
 * LFEA B-3.4 source guard.
 *
 * Reads the result-recovery package as text and refuses the shapes a review
 * cannot reliably catch by running it: a numeric policy written as a
 * literal, a second hash implementation, a locale-dependent comparator,
 * a re-derived element/component mechanic, a nested `Object.freeze` that
 * would block the final `deepFreeze` from recursing, a self-referential hash
 * projection, and B31.3 code-evaluation concerns leaking into recovery.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packageFiles = [
  'src/core/linear-fea-result-recovery/recovery-contract.js',
  'src/core/linear-fea-result-recovery/element-end-actions.js',
  'src/core/linear-fea-result-recovery/force-field.js',
  'src/core/linear-fea-result-recovery/code-points.js',
  'src/core/linear-fea-result-recovery/envelope.js',
  'src/core/linear-fea-result-recovery/recovery.js',
  'src/core/linear-fea-result-recovery/index.js',
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
  'src/core/linear-fea-result-recovery/recovery-contract.js',
  'src/core/linear-fea-result-recovery/recovery.js',
  'src/core/linear-fea-result-recovery/envelope.js',
]) {
  assert.match(
    source[path],
    /from\s*'\.\.\/shared-piping-model\/canonical-json\.js'/u,
    `${path} must reuse the repository canonical-JSON hash authority`,
  );
}

/* Upstream authorities are consumed through their own validators, never
 * re-derived: the compilation, execution, load case, frame elements and
 * piping components are all re-accepted, not trusted or rebuilt. */
assert.match(source['src/core/linear-fea-result-recovery/recovery.js'], /requireMechanicalModelCompilation/u, 'the B-2.5 compilation must arrive through its own validator');
assert.match(source['src/core/linear-fea-result-recovery/recovery.js'], /requireSolverExecution/u, 'the B-3.3 execution must arrive through its own validator');
assert.match(source['src/core/linear-fea-result-recovery/recovery.js'], /requirePhysicalLoadCase/u, 'the B-3.0 load case must arrive through its own validator');
assert.match(source['src/core/linear-fea-result-recovery/recovery.js'], /requireFrameElement/u, 'B-3.1 elements must arrive through their own validator');
assert.match(source['src/core/linear-fea-result-recovery/recovery.js'], /requirePipingComponent/u, 'B-3.2 components must arrive through their own validator');
rejectCode(
  /\b(?:elasticModulus|shearModulus|secondMomentY|secondMomentZ|polarMoment)\s*[*/]/u,
  'material/section mechanics must not be recomputed in recovery; only sealed B-3.1/B-3.2 matrices and vectors are consumed',
);
rejectCode(
  /\bfrom\s*'\.\.\/linear-fea-frame-element\/frame-element-stiffness\.js'/u,
  'recovery must consume B-3.1 through its public package export, never a private internal module path',
);

/* No B31.3 code-evaluation concern may enter recovery (B-3.4 is recovery
 * only; B-4.0 owns categories, allowables, SIFs and utilization). */
rejectCode(
  /\b(?:sifFactor|allowables?|utilization|stressIndex|codeStress|b31|sustained|occasional)\b/iu,
  'code-evaluation concerns belong to B-4.0, not result recovery',
);

/* Every numeric gate/policy arrives declared; none is written into the source. */
assert.match(
  source['src/core/linear-fea-result-recovery/recovery-contract.js'],
  /PROHIBITED_PROFILE_SOURCE_TOKENS/u,
  'a hidden-default source guard must exist for the recovery profile',
);
for (const field of ['elementForceStationsPerSpan', 'codePointConsistencyTolerance']) {
  assert.match(
    source['src/core/linear-fea-result-recovery/recovery-contract.js'],
    new RegExp(`requireDeclaredValue\\(profile,\\s*'${field}'`, 'u'),
    `${field} must arrive declared with a source`,
  );
}
rejectCode(
  /(?:Tolerance|StationsPerSpan)\s*[:=]\s*\d+(?!\s*[,)])/u,
  'a numeric gate literal is prohibited outside the fixtures; every threshold must be declared',
);
rejectCode(/\?\?\s*-?\d|\|\|\s*-?\d(?!\d*\s*\))/u, 'a numeric fallback default is prohibited');

/* Every draft object is a plain literal until the single top-level
 * deepFreeze call: a nested Object.freeze on a sub-object this package
 * builds up (elementActions, forceFields, componentResultants, envelope
 * code points, ...) would block deepFreeze's `Object.isFrozen` shortcut from
 * ever recursing into that sub-object's own children, leaving them silently
 * mutable (the exact defect a prior LFEA package shipped with). This applies
 * to the builder modules only — `recovery-contract.js` legitimately
 * `Object.freeze`s its own static key-list constants, exactly as every other
 * LFEA `*-contract.js` module does. */
for (const path of [
  'src/core/linear-fea-result-recovery/element-end-actions.js',
  'src/core/linear-fea-result-recovery/force-field.js',
  'src/core/linear-fea-result-recovery/code-points.js',
  'src/core/linear-fea-result-recovery/envelope.js',
  'src/core/linear-fea-result-recovery/recovery.js',
]) {
  const fileExecutable = source[path].replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:])\/\/.*$/gmu, '$1');
  assert.equal(/Object\.freeze\s*\(/u.test(fileExecutable), false, `${path} must not call Object.freeze itself; only the single top-level deepFreeze call may freeze this package's own draft objects`);
}

/* The recovery/envelope hash must not be self-referential: recoveryHash and
 * envelopeHash are derived from semanticHash and must never feed back into
 * the projection that computes semanticHash. */
assert.match(
  source['src/core/linear-fea-result-recovery/recovery.js'],
  /key === 'semanticHash' \|\| key === 'evidenceHash' \|\| key === 'recoveryHash'/u,
  'recoverySemanticProjection must exclude recoveryHash from its own hash input',
);
assert.match(
  source['src/core/linear-fea-result-recovery/envelope.js'],
  /key === 'semanticHash' \|\| key === 'evidenceHash' \|\| key === 'envelopeHash'/u,
  'envelopeSemanticProjection must exclude envelopeHash from its own hash input',
);

/* The code-point consistency check must be a nodal-equilibrium balance
 * (primary + other - external == 0), never a raw equality between the two
 * candidates' actions — the second historical defect this package guards
 * against by name. */
assert.match(
  source['src/core/linear-fea-result-recovery/code-points.js'],
  /primaryGlobal\[field\]\s*\+\s*otherGlobal\[field\]\s*-\s*externalLoad\[field\]/u,
  'the code-point consistency check must compare a nodal-equilibrium sum, not a raw difference between the two candidates',
);
rejectCode(
  /left\[field\]\s*-\s*right\[field\]/u,
  'a raw equality comparison between two candidate end actions at a shared joint is the exact sign bug this package was built to catch',
);

/* Mechanism/failure reporting names a dedicated code, never a generic error. */
for (const code of [
  'RECOVERY_EXECUTION_BLOCKED',
  'RECOVERY_EXECUTION_MODEL_MISMATCH',
  'RECOVERY_EXECUTION_LOAD_CASE_MISMATCH',
  'RECOVERY_ELEMENT_MISSING',
  'RECOVERY_ELEMENT_DUPLICATE',
  'RECOVERY_CODE_STATION_NOT_LOCATABLE',
  'RECOVERY_CODE_POINT_INCONSISTENT',
  'RECOVERY_ENVELOPE_MODEL_MISMATCH',
  'RECOVERY_ENVELOPE_CODE_POINT_MISSING',
  'RECOVERY_ENVELOPE_CODE_POINT_MISMATCH',
  'RECOVERY_HASH_MISMATCH',
  'RECOVERY_PROFILE_SOURCE_NOT_TRACEABLE',
]) {
  assert.match(combined, new RegExp(code, 'u'), `${code} must remain a recovery rejection`);
}
assert.doesNotMatch(
  combined,
  /(?:continue|return)\s*;?\s*\/\/\s*(?:skip|ignore)/iu,
  'an input must never be skipped silently',
);

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
assert.equal(
  packageJson.scripts['check:lfea-b3.4'],
  'node scripts/lfea-b3.4-recovery-check.mjs && node scripts/lfea-b3.4-reviewer-check.mjs && node scripts/lfea-b3.4-source-guard.mjs',
  'check:lfea-b3.4 registration is missing',
);
assert.match(
  packageJson.scripts['check:lfea-linear-core'],
  /npm run check:lfea-b3\.3 && npm run check:lfea-b3\.4/u,
  'check:lfea-b3.4 must run inside check:lfea-linear-core, directly after check:lfea-b3.3',
);
for (const script of [
  'check:lfea-b2.0', 'check:lfea-b2.1', 'check:lfea-b2.2', 'check:lfea-b2.3', 'check:lfea-b2.4', 'check:lfea-b2.5',
  'check:lfea-b3.0', 'check:lfea-b3.1', 'check:lfea-b3.2', 'check:lfea-b3.3',
]) {
  assert.ok(packageJson.scripts[script], `${script} must be preserved`);
}

console.log('LFEA B-3.4 source guard PASS');
