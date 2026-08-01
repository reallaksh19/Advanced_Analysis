#!/usr/bin/env node

/**
 * LFEA B-3.2 source guard.
 *
 * Reads the piping-component package as text and refuses the shapes a review
 * cannot reliably catch by running it: a numeric policy written as a literal,
 * a second hash implementation, element mechanics re-derived instead of
 * compiled by B-3.1, a parallel bend-geometry model, a B31J factor computed
 * here rather than consumed, assembly or code-evaluation concerns leaking in,
 * and a component silently skipping an input it cannot represent.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packageFiles = [
  'src/core/linear-fea-piping-components/piping-component-contract.js',
  'src/core/linear-fea-piping-components/component-elements.js',
  'src/core/linear-fea-piping-components/bend-component.js',
  'src/core/linear-fea-piping-components/branch-component.js',
  'src/core/linear-fea-piping-components/inline-component.js',
  'src/core/linear-fea-piping-components/piping-component.js',
  'src/core/linear-fea-piping-components/index.js',
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
assert.ok(
  readFileSync(resolve(root, 'src/core/linear-fea-piping-components/README.md'), 'utf8').length > 0,
  'the package README is part of the deliverable',
);

/* Determinism must not depend on the host locale or on chance. */
reject(/\.localeCompare\s*\(/u, 'localeCompare() is prohibited');
reject(/\bIntl\./u, 'Intl collation is prohibited');
reject(/Math\.random|Date\.now|new\s+Date\s*\(/u, 'nondeterministic sources are prohibited');

/* The semantic hash has one implementation; this package reuses it. */
reject(/\b(?:hashBytes|hashUtf8|TextEncoder)\b|Math\.imul/u, 'a second hash implementation is prohibited');
for (const path of [
  'src/core/linear-fea-piping-components/piping-component-contract.js',
  'src/core/linear-fea-piping-components/piping-component.js',
]) {
  assert.match(
    source[path],
    /from\s*'\.\.\/shared-piping-model\/canonical-json\.js'/u,
    `${path} must reuse the repository canonical-JSON hash authority`,
  );
}

/* Element mechanics are compiled by B-3.1, never re-derived here. */
const elements = source['src/core/linear-fea-piping-components/component-elements.js'];
assert.match(elements, /compileFrameElement/u, 'component spans must be compiled by the B-3.1 element');
assert.match(elements, /frameLocalStiffness/u, 'corrected stiffness must come from the B-3.1 kernel');
assert.match(elements, /transformStiffnessToGlobal/u, 'the frozen transformation identity must be reused');
assert.match(
  elements,
  /resolveFrameLocalAxesForSpanChain/u,
  'the local basis must come from the B-2.4 authority, never constructed here',
);
rejectCode(
  /\blocalX\b|\bcloneReference\b|\bselectFallback\b|axes\s*=\s*\{/u,
  'the local basis is cited from B-2.4, never re-derived',
);
rejectCode(
  /\b(?:zeroMatrix12|setSymmetric|shearFlexibility|phiXY|phiXZ)\b/u,
  'the element stiffness kernel belongs to B-3.1 and must not be restated here',
);
rejectCode(
  /12\s*\*\s*\w*[eE]lasticModulus|elasticModulus\s*\*\s*\w*[sS]econdMoment\w*\s*\)\s*\/\s*\(\s*\(\s*1/u,
  'a frame stiffness term must not be written out in this package',
);

/* The bend arc has one geometry model; this package consumes it. */
const bend = source['src/core/linear-fea-piping-components/bend-component.js'];
assert.match(bend, /discretiseBend/u, 'arc discretisation must reuse the existing bend-geometry authority');
assert.match(bend, /resolveBendArcCentre/u, 'the arc centre must come from the existing bend-arc adapter');
assert.match(bend, /checkDeclaredRadius/u, 'the declared radius must be cross-checked by the existing adapter');
rejectCode(
  /Math\.acos\s*\(|rotateAboutAxis|arcPoints\s*=/u,
  'a parallel arc-geometry model is prohibited; the existing bend geometry is consumed',
);

/* No assembly, solver or code-evaluation concern may enter the component layer. */
rejectCode(
  /\b(?:dofMap|globalIndex|globalDofIdentity|assemble|triplet|cholesky|ldlt|factoriz\w*|solveLinear|reaction)\b/iu,
  'assembly and solver concerns belong to B-3.3',
);
rejectCode(
  /\b(?:allowable\w*|utilization|stressIndex|sifFactor|calculatedStress|codeCombination)\b/iu,
  'code-evaluation concerns belong to B-4.0',
);
reject(
  /from\s*['"][^'"]*(?:\/solvers\/|\/element-fea\/|\/workspace)[^'"]*['"]/iu,
  'prohibited package import detected',
);

/* Component factors are consumed, never computed from a table. */
rejectCode(
  /\b(?:factorTable|sifTable|b31jTable|lookupFactor|computeFlexibilityFactor|interpolateFactor)\b/iu,
  'B31J factors are supplied through a declared factor set; this package must not derive them',
);
assert.match(
  source['src/core/linear-fea-piping-components/piping-component-contract.js'],
  /requireDeclaredValue\(factorSet,\s*'flexibilityFactor'/u,
  'the flexibility factor must arrive declared with a source',
);

/* Every numeric policy arrives declared; none is written into the source. */
for (const field of [
  'bendMaxAngleDegrees',
  'bendMinimumElements',
  'bendMinimumElementsBetweenStations',
  'bendRadiusRelativeTolerance',
  'bendConvergenceRefinementFactor',
  'convergenceRelativeTolerance',
  'flexibilityDoubleCountTolerance',
  'runCollinearityTolerance',
  'rigidBodyStiffnessMultiplier',
]) {
  assert.match(
    source['src/core/linear-fea-piping-components/piping-component-contract.js'],
    new RegExp(`declared\\('${field}'`, 'u'),
    `${field} must be resolved through the declared-value authority`,
  );
}
rejectCode(
  /(?:Tolerance|Factor|Limit|Multiplier|MaxAngle|Degrees|Elements)\s*[:=]\s*-?\d/u,
  'a tolerance, factor, angle or element-count literal is prohibited; every numeric policy must be declared',
);
rejectCode(/\?\?\s*-?\d|\|\|\s*-?\d(?!\d*\s*\))/u, 'a numeric fallback default is prohibited');
rejectCode(
  /export\s+const\s+\w*(?:PIPING_COMPONENT_PROFILE|FACTOR_SET)\s*=\s*\{/u,
  'a built-in component profile or factor set is prohibited',
);
/* Degrees are a unit conversion, not a policy, and there is exactly one of them. */
assert.equal(
  (combined.match(/Math\.PI\s*\/\s*180/gu) ?? []).length,
  1,
  'the degree-to-radian conversion has one definition',
);

/* Fail closed: each gap has its own machine-readable rejection. */
for (const code of [
  'PIPING_COMPONENT_BEND_FLEXIBILITY_DOUBLE_COUNT',
  'PIPING_COMPONENT_BEND_FLEXIBILITY_OMITTED',
  'PIPING_COMPONENT_BRANCH_FLEXIBILITY_DOUBLE_COUNT',
  'PIPING_COMPONENT_BRANCH_FLEXIBILITY_OMITTED',
  'PIPING_COMPONENT_B31J_APPLICABILITY_EXCEEDED',
  'PIPING_COMPONENT_USER_FACTOR_REQUIRED',
  'PIPING_COMPONENT_USER_OVERRIDE_INCOMPLETE',
  'PIPING_COMPONENT_OUTSIDE_APPLICABILITY_RULE_NOT_IMPLEMENTED',
  'PIPING_COMPONENT_DIRECTIONAL_FLEXIBILITY_NOT_IMPLEMENTED',
  'PIPING_COMPONENT_PRESSURE_STIFFENING_RULE_MISMATCH',
  'PIPING_COMPONENT_BEND_ARC_DEGENERATE',
  'PIPING_COMPONENT_BEND_RADIUS_CONFLICT',
  'PIPING_COMPONENT_BRANCH_CLASSIFICATION_AMBIGUOUS',
  'PIPING_COMPONENT_BRANCH_RUN_NOT_IDENTIFIED',
  'PIPING_COMPONENT_BRANCH_LEG_COUNT_INVALID',
  'PIPING_COMPONENT_FLEXIBILITY_OWNERSHIP_CONFLICT',
  'PIPING_COMPONENT_FLEXIBILITY_OWNERSHIP_FOREIGN',
  'PIPING_COMPONENT_REDUCER_TAPERED_NOT_IMPLEMENTED',
  'PIPING_COMPONENT_REDUCER_STATIONS_INVALID',
  'PIPING_COMPONENT_ZERO_LENGTH_WEIGHT_LUMP_NOT_SELECTED',
  'PIPING_COMPONENT_CENTRE_OF_GRAVITY_OUTSIDE_BODY',
  'PIPING_COMPONENT_RIGID_LINK_DEGENERATE',
  'PIPING_COMPONENT_RIGID_RELATION_CODE_STRESS_PROHIBITED',
  'PIPING_COMPONENT_CENTERLINE_RELOCATION_PROHIBITED',
  'PIPING_COMPONENT_SUPPORT_OFFSET_DEGENERATE',
  'PIPING_COMPONENT_ACCEPTANCE_STATE_INCONSISTENT',
  'PIPING_COMPONENT_HASH_MISMATCH',
]) {
  assert.match(combined, new RegExp(code, 'u'), `${code} must remain a piping-component rejection`);
}

/* The section 11 disclosures and the section 10.4 ownership claim must survive. */
for (const marker of [
  'PIPING_COMPONENT_APPROXIMATION_SEGMENTED_BEND',
  'PIPING_COMPONENT_APPROXIMATION_RIGID_VALVE_FLANGE',
  'PIPING_COMPONENT_APPROXIMATION_REDUCER_SECTION',
  'PIPING_COMPONENT_APPROXIMATION_SUPPORT_OFFSET_RIGID',
  'BEND_FLEXIBILITY_SINGLE_APPLICATION_V1',
  'BRANCH_FLEXIBILITY_SINGLE_APPLICATION_V1',
  'PIPE_BEND_CORRECTED_FRAME_V1',
  'DIRECTION_VECTOR_TOPOLOGY_V1',
  'assertSingleFlexibilityOwnership',
]) {
  assert.match(combined, new RegExp(marker, 'u'), `${marker} must remain part of the component contract`);
}
assert.doesNotMatch(
  combined,
  /(?:continue|return)\s*;?\s*\/\/\s*(?:skip|ignore)/iu,
  'an input must never be skipped silently',
);
/* Branch classification reads directions; nominal diameter is retained as evidence only. */
const classifier = /export function classifyBranchLegs\([\s\S]*?\n\}\n/u.exec(
  source['src/core/linear-fea-piping-components/branch-component.js'],
);
assert.ok(classifier, 'classifyBranchLegs must remain the named classification authority');
assert.doesNotMatch(
  classifier[0],
  /nominalDiameter|\bdiameter\b|\bbore\b|\bsection\b/iu,
  'the branch classifier must read direction vectors and topology only',
);
assert.match(
  source['src/core/linear-fea-piping-components/branch-component.js'],
  /diameterConsulted: false/u,
  'the classification evidence must state that diameter was not consulted',
);

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
assert.equal(
  packageJson.scripts['check:lfea-b3.2'],
  'node scripts/lfea-b3.2-piping-component-check.mjs && node scripts/lfea-b3.2-reviewer-check.mjs && node scripts/lfea-b3.2-source-guard.mjs',
  'check:lfea-b3.2 registration is missing',
);
assert.match(
  packageJson.scripts['check:lfea-linear-core'],
  /npm run check:lfea-b3\.1 && npm run check:lfea-b3\.2/u,
  'check:lfea-b3.2 must run inside check:lfea-linear-core, directly after check:lfea-b3.1',
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
  'check:lfea-b3.1',
]) {
  assert.ok(packageJson.scripts[script], `${script} must be preserved`);
}

console.log('LFEA B-3.2 source guard PASS');
