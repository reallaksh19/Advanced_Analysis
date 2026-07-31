import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const baseIndex = process.argv.indexOf('--base');
if (baseIndex < 0 || !process.argv[baseIndex + 1]) {
  throw new Error('Usage: node scripts/lafea-template-t4-source-guard.mjs --base <BASE_SHA>');
}
const base = process.argv[baseIndex + 1];
const allowed = new Set([
  'scripts/lafea-template-t4-continuum-compiler-check.mjs',
  'scripts/lafea-template-t4-source-guard.mjs',
  'src/core/lafea-application-templates/compile-continuum-template.js',
  'src/core/lafea-application-templates/compilers/continuum/bindings.js',
  'src/core/lafea-application-templates/compilers/continuum/common.js',
  'src/core/lafea-application-templates/compilers/continuum/index.js',
  'src/core/lafea-application-templates/compilers/continuum/source-intake.js',
  'src/core/lafea-application-templates/parameter-schemas/continuum.js',
  'src/core/lafea-application-templates/t4-continuum.js',
]);

const rows = git(['diff', '--name-status', `${base}...HEAD`])
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [status, ...pathParts] = line.split('\t');
    return { status, path: pathParts.at(-1) };
  });
assert.equal(rows.length, allowed.size, `Expected ${allowed.size} T4 files, received ${rows.length}.`);
rows.forEach(({ status, path }) => {
  assert.equal(status, 'A', `T4 must be additive; ${path} has status ${status}.`);
  assert.equal(allowed.has(path), true, `T4 path is outside the authorized perimeter: ${path}.`);
});
allowed.forEach((path) => assert.equal(rows.some((row) => row.path === path), true, `Missing ${path}.`));

const compilerPaths = [...allowed].filter((path) => path.startsWith('src/'));
const compilerSource = compilerPaths.map((path) => readFileSync(path, 'utf8')).join('\n');
const forbiddenPatterns = [
  /calculateLocalContinuum\s*\(/u,
  /executeLafeaStage\s*\(/u,
  /Math\.random/u,
  /Date\.now/u,
  /new Date\s*\(/u,
  /from ['"][^'"]*workspace\//u,
  /lafea-stage-registry\.js/u,
  /document\./u,
  /window\./u,
  /meshConfig/u,
  /releaseStatus\s*:\s*['"]QUALIFIED['"]/u,
  /executable\s*:\s*true/u,
];
forbiddenPatterns.forEach((pattern) => {
  assert.equal(pattern.test(compilerSource), false, `Forbidden T4 source pattern: ${pattern}.`);
});

for (const required of [
  'CALLER_SUPPLIED_ANALYSIS_MESH',
  'TEMPLATE_COMPILER_GENERATED_MESH=false',
  'MESH_QUALIFICATION_NOT_CLAIMED',
  'ENGINE_NOT_EXECUTED',
  'T3_ELEMENT_NOT_AUTHORIZED_FOR_T4_TEMPLATE_COMPILERS',
  'AXISYMMETRIC_CONTINUUM_AUTHORITY_PENDING_QUALIFICATION',
]) {
  assert.equal(compilerSource.includes(required), true, `Missing fail-closed marker ${required}.`);
}

assert.equal(
  compilerSource.includes("'C2D-FLANGE-HUB'"),
  true,
  'The blocked axisymmetric flange-hub route must be explicit.',
);
assert.equal(
  compilerSource.includes('createCanonicalLocalContinuumModel'),
  true,
  'T4 must validate the caller-supplied source through the LAFEA.3 canonical factory.',
);

console.log(JSON.stringify({
  status: 'PASS',
  base,
  additiveFiles: rows.length,
  modifiedExistingFiles: 0,
  engineExecutionPaths: 0,
  templateMeshGenerationPaths: 0,
  executableTemplates: 0,
}, null, 2));

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}
