#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('src/core/linear-piping-project-qualification');
const files = fs.readdirSync(ROOT)
  .filter((name) => name.endsWith('.js'))
  .map((name) => path.join(ROOT, name));

const forbidden = [
  ['UI_OR_WORKSPACE_AUTHORITY', /from\s+['"][^'"]*(?:workspace|svg|three|canvas)[^'"]*['"]/u],
  ['SOLVER_OR_RECOVERY_AUTHORITY', /compileSolverExecution|compileResultRecovery|assembleGlobal|stiffnessMatrix/u],
  ['CODE_RECALCULATION', /compileCodeResult|calculatedStress\s*=|utilization\s*=/u],
  ['EXTERNAL_PROGRAM_EXECUTION', /child_process|spawn\(|execFile\(|shelljs/u],
  ['EMBEDDED_PROJECT_RESULT', /CAESAR\s*II\s*RESULT|AUTOPIPE\s*RESULT|COMMERCIAL_REFERENCE_VALUE/u],
  ['RANDOM_IDENTITY', /Math\.random|randomUUID/u],
  ['LOCALE_ORDERING', /localeCompare/u],
  ['HIDDEN_ENGINEERING_DEFAULT', /function\s+\w+\s*\([^)]*=\s*(?:-?\d|true|false)/u],
];

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.split(/\r?\n/u).length;
  assert.ok(lines < 500, `${file} has ${lines} physical lines; limit is <500`);
  for (const [code, pattern] of forbidden) {
    assert.doesNotMatch(source, pattern, `${code}: ${file}`);
  }
}

const contracts = fs.readFileSync(path.join(ROOT, 'contracts.js'), 'utf8');
assert.match(contracts, /INDEPENDENT_ENGINEERING_REVIEW/u);
assert.match(contracts, /COMMERCIAL_PIPE_STRESS_PROGRAM/u);
assert.match(contracts, /ABSOLUTE_OR_RELATIVE_V1/u);
assert.match(contracts, /relativeScaleFloor/u);

const comparison = fs.readFileSync(path.join(ROOT, 'comparison.js'), 'utf8');
assert.match(comparison, /requireCurrentLinearPipingPresentation/u);
assert.match(comparison, /resolveApplicationValue/u);
assert.match(comparison, /presentation\.interfaceRows/u);
assert.match(comparison, /presentation\.nozzleRows/u);
assert.match(comparison, /presentation\.codeRows/u);
assert.doesNotMatch(
  comparison.match(/export const QUALIFICATION_INPUT_KEYS[\s\S]*?\]\);/u)?.[0] ?? '',
  /applicationValue/u,
  'Qualification request must not accept a caller-injected application value.',
);
assert.doesNotMatch(
  comparison.match(/export const COMPARISON_KEYS[\s\S]*?\]\);/u)?.[0] ?? '',
  /commercialProgramResult|projectExpectedOutput/u,
);

const fixture = fs.readFileSync('scripts/linear-piping-project-qualification-check.mjs', 'utf8');
assert.match(fixture, /FICTIONAL-QUALIFICATION-LAB-NOT-PROJECT-EVIDENCE/u);
assert.match(fixture, /FICTIONAL-COMMERCIAL-PIPE-STRESS-PROGRAM/u);

const releaseEvidence = JSON.parse(fs.readFileSync('release-evidence/lfea-piping-release-evidence.json', 'utf8'));
assert.equal(releaseEvidence.gates.G8_REAL_MODEL_RECONCILIATION, 'UNRESOLVED_GATE');
assert.equal(releaseEvidence.gates.G9_COMMERCIAL_CORROBORATION, 'UNRESOLVED_GATE');
assert.equal(releaseEvidence.artifacts.realModelReconciliation, null);
assert.equal(releaseEvidence.artifacts.commercialCorroboration, null);

const releasePolicy = fs.readFileSync('scripts/lfea-piping-release-readiness-check.mjs', 'utf8');
assert.match(releasePolicy, /linear-piping-project-qualification-check\.mjs/u);
assert.match(releasePolicy, /linear-piping-project-qualification-anti-drift-check\.mjs/u);
assert.match(releasePolicy, /SIMULATED_FIXTURES_ONLY/u);

const packageValue = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.equal(
  packageValue.scripts['check:lfea-piping-release-policy'],
  'node scripts/lfea-piping-release-readiness-check.mjs',
);
assert.match(packageValue.scripts.gate, /check:lfea-piping-release-policy/u);
assert.doesNotMatch(packageValue.scripts['check:lfea-core'], /project-qualification/u);

console.log('Linear piping Phase 6A qualification anti-drift check PASS');
