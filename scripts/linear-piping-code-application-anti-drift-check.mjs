#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('src/core/linear-piping-code-application');
const files = fs.readdirSync(ROOT)
  .filter((name) => name.endsWith('.js'))
  .map((name) => path.join(ROOT, name));

const forbidden = [
  ['UI_OR_WORKSPACE_AUTHORITY', /from\s+['"][^'"]*(?:workspace|svg|three|canvas)[^'"]*['"]/u],
  ['SOLVER_REIMPLEMENTATION', /assembleGlobal|stiffnessMatrix|factorize|solveCholesky|solveLdlt/u],
  ['RECOVERY_REIMPLEMENTATION', /recoverElementEndAction|compileResultRecovery|qLocal\s*=/u],
  ['EMPIRICAL_NOZZLE_LOAD', /tributary|percentageOfWeight|reactionFactor|estimatedNozzleLoad/u],
  ['EMBEDDED_ALLOWABLE_TABLE', /ALLOWABLE_TABLE|API_610_ALLOWABLES|API_617_ALLOWABLES|NEMA_SM23_ALLOWABLES/u],
  ['OPERATING_COMPLIANCE', /category:\s*['"]OPERATING['"]/u],
  ['SYNTHETIC_PARENT_HASH', /fnv1a64:0000000000000000/u],
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
assert.match(contracts, /NOZZLE_INTERACTION_RULE/u);
assert.match(contracts, /sourceIdentity/u);
assert.match(contracts, /canonicalDeclaredPositive/u);
assert.doesNotMatch(contracts, /API_610|API_617|NEMA_SM23/u);

const nozzle = fs.readFileSync(path.join(ROOT, 'nozzle-assessment.js'), 'utf8');
assert.match(nozzle, /requireLinearPipingInterfaceRecovery/u);
assert.match(nozzle, /momentAtReferenceLocal/u);
assert.match(nozzle, /allowableProfileHash/u);
assert.match(nozzle, /QUALIFIED_UNDER_CONFIGURED_PROFILE/u);
assert.match(nozzle, /computeNozzleAssessmentEvidenceHash/u);
assert.doesNotMatch(nozzle, /compileSolverExecution|compileResultRecovery/u);

const b31 = fs.readFileSync(path.join(ROOT, 'b31-application.js'), 'utf8');
assert.match(b31, /requireResultRecovery/u);
assert.match(b31, /compileCodeResult/u);
assert.match(b31, /toPoint\.local\[field\]\s*-\s*fromPoint\.local\[field\]/u);
assert.match(b31, /DISPLACEMENT_STRESS_RANGE requires an explicit ordered case pair/u);
assert.match(b31, /recoveryEvidenceHash/u);
assert.match(b31, /computeB31ApplicationEvidenceHash/u);
assert.doesNotMatch(
  b31.match(/export const B31_CHECK_KEYS[\s\S]*?\]\);/u)?.[0] ?? '',
  /localAction/u,
  'B31 check schema must not accept caller-injected localAction.',
);

const b31Public = fs.readFileSync(path.join(ROOT, 'public-api.js'), 'utf8');
assert.match(b31Public, /codeResult\.status\s*===\s*['"]BLOCKED['"]/u);
assert.match(b31Public, /PIPING_B31_CODE_RESULT_BLOCKED/u);

const application = fs.readFileSync(path.join(ROOT, 'application-result.js'), 'utf8');
assert.match(application, /validateLinearPipingAnalysisResult/u);
assert.match(application, /requireLinearPipingInterfaceRecovery/u);
assert.match(application, /requireNozzleAllowableAssessment/u);
assert.match(application, /requireLinearPipingB31Application/u);
assert.match(application, /NOZZLE_ALLOWABLE_NOT_CONFIGURED/u);
assert.match(application, /analysisEvidenceHashes/u);
assert.match(application, /interfaceRecoveryEvidenceHashes/u);
assert.match(application, /nozzleAssessmentEvidenceHashes/u);
assert.match(application, /b31ApplicationEvidenceHash/u);
assert.match(application, /computeApplicationResultEvidenceHash/u);

const applicationPublic = fs.readFileSync(path.join(ROOT, 'application-public-api.js'), 'utf8');
assert.match(applicationPublic, /requireLinearPipingB31Application/u);
assert.match(applicationPublic, /sealBaseApplicationResult/u);

const packageValue = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.equal(
  packageValue.scripts['check:lfea-code-application'],
  'node scripts/linear-piping-code-application-check.mjs && node scripts/linear-piping-code-application-anti-drift-check.mjs',
);
assert.match(packageValue.scripts['check:lfea-linear-core'], /check:lfea-code-application/u);
assert.match(packageValue.scripts.gate, /check:lfea-linear-core/u);

console.log('Linear piping Phase 4 code application anti-drift check PASS');
