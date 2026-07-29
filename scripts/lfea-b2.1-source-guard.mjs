import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packageFiles = [
  'src/core/linear-fea-contract/model-schema.js',
  'src/core/linear-fea-contract/model-validation.js',
  'src/core/linear-fea-contract/model-canonicalization.js',
  'src/core/linear-fea-contract/model-hashes.js',
  'src/core/linear-fea-contract/model-diagnostics.js',
  'src/core/linear-fea-contract/index.js',
];
const source = Object.fromEntries(packageFiles.map((path) => [path, readFileSync(resolve(root, path), 'utf8')]));
const combined = Object.entries(source).map(([path, text]) => `\n/* ${path} */\n${text}`).join('\n');

function reject(pattern, message) {
  assert.equal(pattern.test(combined), false, message);
}

for (const path of packageFiles) assert.ok(source[path].length > 0, `missing required source file ${path}`);

reject(/\.localeCompare\s*\(/u, 'localeCompare() is prohibited');
reject(/export\s+const\s+(?:LINEAR_FEA_UNITS|DOF_ORDER|ELEMENT_DOF_ORDER|ELEMENT_END_ORDER|LOCAL_RESULT_ORDER)\b/u, 'B-2.0 units or orders were redeclared');
assert.match(source['src/core/linear-fea-contract/model-schema.js'], /import\s*\{\s*DOF_ORDER\s*\}\s*from\s*['"]\.\/conventions\.js['"]/u);
assert.match(source['src/core/linear-fea-contract/model-validation.js'], /requireLinearFeaUnits/u);
assert.match(source['src/core/linear-fea-contract/model-validation.js'], /requireLinearFeaConventions/u);

reject(/(?:catalog(?:ue)?|materialDatabase)\s*\.(?:find|lookup|get|query)/iu, 'material catalogue lookup is prohibited');
reject(/interpolat(?:e|ion)\s*\(/iu, 'material interpolation is prohibited');
reject(/Math\.PI|outerDiameter|innerDiameter|wallThickness|scheduleLookup/iu, 'pipe-section formulas are prohibited');
reject(/(?:construct|create|generate|derive|repair|normalize|negate|reorder)LocalAxes\s*\(/iu, 'local-axis construction or repair is prohibited');
reject(/(?:assemble|construct|build)(?:Element|Global)?Stiffness(?:Matrix)?\s*\(/iu, 'stiffness matrix construction is prohibited');
reject(/\b(?:gravityVector|nodalForces?|distributedLoads?|elementTemperatures?|loadCombinations?|prescribedMovementValue|prescribedDisplacementValue)\b/u, 'physical load-case fields are prohibited');
reject(/\b(?:stress|sif|allowables?|utilization)\b/iu, 'stress/code-result fields are prohibited');
reject(/from\s*['"][^'"]*(?:src\/workspace|\/workspace\/|src\/core\/element-fea|\/element-fea\/|solver|stress|nonlinear)[^'"]*['"]/iu, 'prohibited package import detected');

const schema = source['src/core/linear-fea-contract/model-schema.js'];
assert.match(schema, /SUPPORTED_CONSTRAINT_BEHAVIORS[\s\S]*'FIXED'[\s\S]*'LINEAR_SPRING'[\s\S]*'PRESCRIBED_SLOT'/u);
for (const behavior of ['GAP', 'FRICTION', 'ONE_WAY', 'LIFT_OFF', 'CONTACT', 'NONLINEAR_SPRING', 'UNKNOWN']) {
  assert.doesNotMatch(
    schema.match(/SUPPORTED_CONSTRAINT_BEHAVIORS[\s\S]*?\]\);/u)?.[0] ?? '',
    new RegExp(`'${behavior}'`, 'u'),
    `${behavior} must not be supported`,
  );
}

const validation = source['src/core/linear-fea-contract/model-validation.js'];
assert.match(validation, /validateAxes/u);
assert.match(validation, /NONUNIT_AXIS/u);
assert.match(validation, /NONORTHOGONAL_AXES/u);
assert.match(validation, /LEFT_HANDED_AXES/u);
assert.match(validation, /requireSourceIdentity/u, 'source ancestry must not use kernel ID grammar');
assert.doesNotMatch(validation, /\.localAxes\s*=|localAxes\.[xyz]\s*=/u, 'validator must not alter supplied axes');

const canonicalization = source['src/core/linear-fea-contract/model-canonicalization.js'];
assert.match(canonicalization, /copyArray/u);
assert.match(canonicalization, /sourceNodeIds:[\s\S]*compareDeterministicStrings/u);
assert.match(canonicalization, /sourceComponentIds:[\s\S]*compareDeterministicStrings/u);
assert.doesNotMatch(canonicalization, /\b(?:nodes|materialStates|sectionStates|elements|constraints|limitations|diagnostics|sourceEvidence)\.sort\s*\(/u, 'caller-owned arrays must not be sorted directly');

const hashes = source['src/core/linear-fea-contract/model-hashes.js'];
assert.match(hashes, /canonicalizeProjectionRecords\(elementProjections\)/u);
assert.match(hashes, /canonicalizeProjectionRecords\(constraintProjections\)/u);

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
assert.equal(
  packageJson.scripts['check:lfea-b2.1'],
  'node scripts/lfea-b2.1-model-contract-check.mjs && node scripts/lfea-b2.1-reviewer-check.mjs && node scripts/lfea-b2.1-source-guard.mjs',
  'check:lfea-b2.1 registration is missing',
);
assert.match(packageJson.scripts['check:lfea-core'], /^npm run check:lfea-b2\.0 && npm run check:lfea-b2\.1 && /u);
assert.ok(packageJson.scripts['check:lfea-b2.0'], 'B-2.0 check must be preserved');

console.log('LFEA B-2.1 source guard PASS');
