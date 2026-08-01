#!/usr/bin/env node

/**
 * LFEA B-3.3 source guard.
 *
 * Reads the solver package as text and refuses the shapes a review cannot
 * reliably catch by running it: a numeric policy written as a literal, a
 * second hash implementation, a locale-dependent comparator, a re-derived
 * element/component/material/section mechanic, code-evaluation concerns
 * leaking into the solver, and an honesty gap between the declared backend
 * identity and what this package actually implements.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packageFiles = [
  'src/core/linear-fea-solver/solver-contract.js',
  'src/core/linear-fea-solver/dof-map.js',
  'src/core/linear-fea-solver/element-contributions.js',
  'src/core/linear-fea-solver/assembly.js',
  'src/core/linear-fea-solver/factorization.js',
  'src/core/linear-fea-solver/linear-algebra.js',
  'src/core/linear-fea-solver/mechanism-diagnostics.js',
  'src/core/linear-fea-solver/qualification.js',
  'src/core/linear-fea-solver/reuse-cache.js',
  'src/core/linear-fea-solver/scaling.js',
  'src/core/linear-fea-solver/solve.js',
  'src/core/linear-fea-solver/index.js',
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

/* Executable text only: comments may and must explain the maths. */
const executable = combined.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:])\/\/.*$/gmu, '$1');

function rejectCode(pattern, message) {
  assert.equal(pattern.test(executable), false, message);
}

for (const path of packageFiles) assert.ok(source[path].length > 0, `missing required source file ${path}`);

/* Determinism must not depend on the host locale, iteration order or chance. */
reject(/\.localeCompare\s*\(/u, 'localeCompare() is prohibited');
reject(/\bIntl\./u, 'Intl collation is prohibited');
reject(/Math\.random|Date\.now|new\s+Date\s*\(/u, 'nondeterministic sources are prohibited');
rejectCode(/for\s*\(\s*\w+\s+\w+\s+in\s+/u, 'for-in iteration over object keys is order-fragile and prohibited');

/* The semantic hash has one implementation; this package reuses it. */
reject(/\b(?:hashBytes|hashUtf8|TextEncoder)\b/u, 'a second hash implementation is prohibited');
for (const path of [
  'src/core/linear-fea-solver/solver-contract.js',
  'src/core/linear-fea-solver/dof-map.js',
  'src/core/linear-fea-solver/assembly.js',
  'src/core/linear-fea-solver/solve.js',
]) {
  assert.match(
    source[path],
    /from\s*'\.\.\/shared-piping-model\/canonical-json\.js'/u,
    `${path} must reuse the repository canonical-JSON hash authority`,
  );
}

/* Upstream authorities are consumed through their own validators, never re-derived. */
assert.match(
  source['src/core/linear-fea-solver/element-contributions.js'],
  /requireFrameElement/u,
  'B-3.1 elements must arrive through their own validator',
);
assert.match(
  source['src/core/linear-fea-solver/element-contributions.js'],
  /requirePipingComponent/u,
  'B-3.2 components must arrive through their own validator',
);
assert.match(
  source['src/core/linear-fea-solver/solve.js'],
  /requireMechanicalModelCompilation/u,
  'the B-2.5 compilation must arrive through its own validator',
);
assert.match(
  source['src/core/linear-fea-solver/solve.js'],
  /requirePhysicalLoadCase/u,
  'the B-3.0 load case must arrive through its own validator',
);
rejectCode(
  /\b(?:EA|GJ|kappaY|kappaZ|phiXY|phiXZ)\b/u,
  'stiffness terms must not be re-derived here; only sealed B-3.1/B-3.2 matrices are consumed',
);
rejectCode(
  /\b(?:elasticModulus|shearModulus|secondMomentY|secondMomentZ|polarMoment)\s*[*/]/u,
  'material/section mechanics must not be recomputed in the solver',
);

/* No code-evaluation concern may enter the solver. */
rejectCode(
  /\b(?:sifFactor|allowables?|utilization|stressIndex|codeStress|b31)\b/iu,
  'code-evaluation concerns belong to B-4.0',
);
rejectCode(
  /\b(?:bendArc|reducer|branchJunction|valveBody)\b/iu,
  'component mechanics belong to B-3.2, not the solver',
);

/* Every numeric gate/policy arrives declared; none is written into the source. */
assert.match(
  source['src/core/linear-fea-solver/solver-contract.js'],
  /PROHIBITED_PROFILE_SOURCE_TOKENS/u,
  'a hidden-default source guard must exist for the solver profile',
);
for (const field of [
  'normalizedResidualLimit',
  'normalizedResidualWarnLimit',
  'equilibriumRelativeLimit',
  'equilibriumAbsoluteForceFloor',
  'equilibriumAbsoluteMomentFloor',
  'energyBalanceLimit',
  'nearZeroPivotTolerance',
  'conditionWarning',
  'conditionBlock',
]) {
  assert.match(
    source['src/core/linear-fea-solver/solver-contract.js'],
    new RegExp(`requireDeclaredValue\\(profile,\\s*'${field}'`, 'u'),
    `${field} must arrive declared with a source`,
  );
}
rejectCode(
  /(?:Limit|Tolerance|Floor|Warning|Block)\s*[:=]\s*1e-?\d|(?:Limit|Tolerance|Floor|Warning|Block)\s*[:=]\s*\d{3,}/u,
  'a numeric gate literal is prohibited outside the fixtures; every threshold must be declared',
);
rejectCode(/\?\?\s*-?\d|\|\|\s*-?\d(?!\d*\s*\))/u, 'a numeric fallback default is prohibited');
rejectCode(/export\s+const\s+\w*SOLVER_PROFILE\s*=\s*\{/u, 'a built-in ready-made solver profile is prohibited');

/* The backend identity is named honestly: it may not claim to be the
 * illustrative production sparse-solver string from section 13 while
 * shipping a dense direct factorization. */
assert.match(
  source['src/core/linear-fea-solver/solver-contract.js'],
  /DENSE_DIRECT_BACKEND_ID\s*=\s*'FEA_DENSE_DIRECT_CHOLESKY_LDLT_V1'/u,
  'the dense-direct backend must be named for what it is',
);
reject(/SPARSE_CHOLESKY_LDLT_V1(?!['"]?\s*[,;)\n]?\s*(?:\/\/|\/\*|$))/u, 'placeholder — always true, kept for symmetry');
rejectCode(
  /backend\s*:\s*['"]SPARSE_CHOLESKY_LDLT_V1['"]/u,
  'the backend identity must never claim the illustrative production-sparse-solver string',
);

/* Reuse is keyed only by stiffnessStateHash and the constrained partition. */
assert.match(
  source['src/core/linear-fea-solver/solve.js'],
  /`\$\{acceptedCompilation\.stiffnessStateHash\}:\$\{assembly\.partitionHash\}`/u,
  'factorization reuse must be keyed by stiffnessStateHash and partitionHash exactly, not a load-case identity',
);
rejectCode(
  /partitionKey\s*=.*(?:loadCase|physicalLoadCaseHash|evidenceHash)/u,
  'factorization reuse must never be keyed by load-case or evidence identity',
);

/* Mechanism/failure reporting names the node/DOF and connected component,
 * never a generic solver error. */
for (const code of [
  'SOLVER_MECHANISM_FLOATING_COMPONENT',
  'SOLVER_NEAR_ZERO_PIVOT',
  'SOLVER_SYSTEM_INDEFINITE',
  'SOLVER_FREE_PARTITION_EMPTY',
  'SOLVER_LOAD_CASE_MODEL_MISMATCH',
  'SOLVER_ELEMENT_CONTRIBUTION_MISSING',
  'SOLVER_ELEMENT_CONTRIBUTION_UNKNOWN_ELEMENT',
  'SOLVER_ELEMENT_CONTRIBUTION_DUPLICATE',
  'SOLVER_ASSEMBLY_ASYMMETRIC',
  'SOLVER_PROFILE_SOURCE_NOT_TRACEABLE',
  'SOLVER_HASH_MISMATCH',
]) {
  assert.match(combined, new RegExp(code, 'u'), `${code} must remain a solver rejection`);
}
assert.doesNotMatch(
  combined,
  /(?:continue|return)\s*;?\s*\/\/\s*(?:skip|ignore)/iu,
  'an input must never be skipped silently',
);
assert.doesNotMatch(
  source['src/core/linear-fea-solver/assembly.js'],
  /symmetriz\w*\(/iu,
  'the assembled stiffness is never symmetrised after the fact; symmetry is a property of correct assembly',
);

/* The execution hash must not be self-referential: executionHash is derived
 * from semanticHash and must never feed back into the projection that
 * computes semanticHash. */
assert.match(
  source['src/core/linear-fea-solver/solve.js'],
  /key === 'semanticHash' \|\| key === 'evidenceHash' \|\| key === 'executionHash'/u,
  'executionSemanticProjection must exclude executionHash from its own hash input',
);
assert.match(
  source['src/core/linear-fea-solver/solve.js'],
  /key === 'factorization'/u,
  'executionSemanticProjection must isolate runtime factorization reuse evidence',
);
assert.match(
  source['src/core/linear-fea-solver/solve.js'],
  /factorizationReused:\s*record\.factorization\.reused/u,
  'execution evidence must retain the runtime factorization reuse flag',
);

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
assert.equal(
  packageJson.scripts['check:lfea-b3.3'],
  'node scripts/lfea-b3.3-solver-check.mjs && node scripts/lfea-b3.3-reviewer-check.mjs && node scripts/lfea-b3.3-source-guard.mjs',
  'check:lfea-b3.3 registration is missing',
);
assert.match(
  packageJson.scripts['check:lfea-linear-core'],
  /npm run check:lfea-b3\.1 && npm run check:lfea-b3\.2 && npm run check:lfea-b3\.3/u,
  'check:lfea-b3.3 must run inside check:lfea-linear-core, directly after check:lfea-b3.2',
);
for (const script of [
  'check:lfea-b2.0',
  'check:lfea-b2.1',
  'check:lfea-b2.2',
  'check:lfea-b2.3',
  'check:lfea-b2.4',
  'check:lfea-b2.5',
  'check:lfea-b3.0',
  'check:lfea-b3.1',
  'check:lfea-b3.2',
]) {
  assert.ok(packageJson.scripts[script], `${script} must be preserved`);
}

console.log('LFEA B-3.3 source guard PASS');
