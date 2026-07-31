#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowedPaths = new Set([
  'scripts/lafea-template-t3-analytical-compiler-check.mjs',
  'scripts/lafea-template-t3-source-guard.mjs',
  'src/core/lafea-application-templates/compile-template.js',
  'src/core/lafea-application-templates/t3-analytical.js',
  'src/core/lafea-application-templates/parameter-schemas/analytical.js',
  'src/core/lafea-application-templates/compilers/analytical/bindings.js',
  'src/core/lafea-application-templates/compilers/analytical/common.js',
  'src/core/lafea-application-templates/compilers/analytical/index.js',
  'src/core/lafea-application-templates/compilers/analytical/load-reference-transfer.js',
  'src/core/lafea-application-templates/compilers/analytical/pipe-section-combined.js',
]);
const sourceFiles = [...allowedPaths]
  .filter((file) => file.startsWith('src/'))
  .map((file) => path.join(root, file));

sourceFiles.forEach((file) => assert.equal(fs.existsSync(file), true, `${file} is missing.`));

const sourceText = sourceFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const forbidden = [
  ['calculateLocalAttachmentFoundation', 'Compiler must not execute LAFEA.1.'],
  ['calculateLocalAttachmentScreening', 'Compiler must not execute LAFEA.2.'],
  ['executeLafeaStage', 'Compiler must not execute a workbench stage.'],
  ['lafea-workbench', 'Compiler must not import workbench authority.'],
  ['lafea-stage-registry', 'Compiler must consume the T1 registry dependency only.'],
  ['presenter', 'Compiler must not produce presenter rows.'],
  ['Math.random', 'Semantic identity must not use randomness.'],
  ['Date.now', 'Semantic identity must not use timestamps.'],
  ['new Date', 'Semantic identity must not use timestamps.'],
  ['QUALIFIED', 'T3 must not qualify a template or compiler.'],
  ['meshConfig', 'Analytical T3 must not invent mesh configuration.'],
];
for (const [token, message] of forbidden) {
  assert.equal(sourceText.includes(token), false, `${message} Found ${token}.`);
}

assert.match(sourceText, /createCanonicalLocalAttachmentFoundationModel/u);
assert.match(sourceText, /createLocalAttachmentScreeningRequest/u);
assert.match(sourceText, /ENGINE_NOT_EXECUTED/u);
assert.match(sourceText, /meshRequestHash:\s*null/u);
assert.match(sourceText, /boundaryConditions:\s*\[\]/u);
assert.match(sourceText, /TEMPLATE_COMPILER_NOT_AVAILABLE/u);
assert.match(sourceText, /STALE_TEMPLATE_REGISTRY_PARENT/u);
assert.match(sourceText, /STAGE_SOURCE_VALIDATED_BY_LAFEA1_CANONICAL_MODEL_FACTORY/u);
assert.match(sourceText, /STAGE_SOURCE_VALIDATED_BY_LAFEA2_REQUEST_FACTORY/u);

const baseArgIndex = process.argv.indexOf('--base');
if (baseArgIndex >= 0) {
  const base = process.argv[baseArgIndex + 1];
  assert.ok(base, '--base requires a commit SHA or ref.');
  const changed = git(['diff', '--name-only', `${base}...HEAD`])
    .split('\n').filter(Boolean);
  const unexpected = changed.filter((file) => !allowedPaths.has(file));
  assert.deepEqual(unexpected, [], `Unexpected T3 files changed: ${unexpected.join(', ')}`);
  const missing = changed.filter((file) => !fs.existsSync(path.join(root, file)));
  assert.deepEqual(missing, [], `T3 must not delete files: ${missing.join(', ')}`);

  const forbiddenPrefixes = [
    'src/workspace/',
    'src/core/local-stress/',
    'src/core/local-attachment-screening/',
    'src/core/local-continuum/',
    'src/core/local-shell/',
    'src/core/local-trunnion-footprint/',
    'package.json',
    '.github/',
  ];
  changed.forEach((file) => {
    assert.equal(
      forbiddenPrefixes.some((prefix) => file === prefix || file.startsWith(prefix)),
      false,
      `T3 changed protected authority: ${file}`,
    );
  });
}

console.log(JSON.stringify({
  status: 'PASS',
  allowedFileCount: allowedPaths.size,
  compilerSourceFileCount: sourceFiles.length,
  directEngineExecution: false,
  workbenchIntegration: false,
  presenterIntegration: false,
  numericalCoreChange: false,
  executableTemplateCount: 0,
}, null, 2));

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}
