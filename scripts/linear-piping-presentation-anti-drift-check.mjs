#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const CORE = path.resolve('src/core/linear-piping-presentation');
const WORKSPACE_VIEW = path.resolve('src/workspace/linear-piping-results-view.js');
const coreFiles = fs.readdirSync(CORE)
  .filter((name) => name.endsWith('.js'))
  .map((name) => path.join(CORE, name));

const coreForbidden = [
  ['SOLVER_AUTHORITY', /compileSolverExecution|assembleGlobal|stiffnessMatrix|solveCholesky|solveLdlt/u],
  ['RECOVERY_AUTHORITY', /compileResultRecovery|recoverElementEndAction|sourceReactionDofs\s*=/u],
  ['INTERFACE_MECHANICS', /cross\(|dot\(|momentAtReferenceLocal\s*=|forceLocal\s*=/u],
  ['CODE_CALCULATION', /compileCodeResult|calculatedStress\s*=|utilization\s*=/u],
  ['EMPIRICAL_RESULT', /tributary|percentageOfWeight|reactionFactor|estimatedReaction/u],
  ['RANDOM_IDENTITY', /Math\.random|randomUUID/u],
  ['LOCALE_ORDERING', /localeCompare/u],
  ['HIDDEN_ENGINEERING_DEFAULT', /function\s+\w+\s*\([^)]*=\s*(?:-?\d|true|false)/u],
];

for (const file of coreFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.split(/\r?\n/u).length;
  assert.ok(lines < 450, `${file} has ${lines} physical lines; limit is <450`);
  for (const [code, pattern] of coreForbidden) {
    assert.doesNotMatch(source, pattern, `${code}: ${file}`);
  }
}

const contracts = fs.readFileSync(path.join(CORE, 'contracts.js'), 'utf8');
assert.match(contracts, /requireCurrentLinearPipingPresentation/u);
assert.match(contracts, /requireLinearPipingQualifiedApplicationResult/u);
assert.match(contracts, /ANALYSIS_ROW_KEYS/u);
assert.match(contracts, /INTERFACE_ROW_KEYS/u);
assert.match(contracts, /NOZZLE_ROW_KEYS/u);
assert.match(contracts, /CODE_ROW_KEYS/u);

const presentation = fs.readFileSync(path.join(CORE, 'presentation.js'), 'utf8');
assert.match(presentation, /validateLinearPipingAnalysisResult/u);
assert.match(presentation, /requireLinearPipingInterfaceRecovery/u);
assert.match(presentation, /requireNozzleAllowableAssessment/u);
assert.match(presentation, /requireLinearPipingB31Application/u);
assert.doesNotMatch(presentation, /export const (?:ANALYSIS|INTERFACE|NOZZLE|CODE)_ROW_KEYS/u);

const exportSource = fs.readFileSync(path.join(CORE, 'export.js'), 'utf8');
assert.match(exportSource, /requireCurrentLinearPipingPresentation\(presentation, applicationResult\)/u);
assert.match(exportSource, /PIPING_PRESENTATION_ENGINEERING_EXPORT_BLOCKED/u);
assert.match(exportSource, /canonicalPrettyStringify/u);
assert.match(exportSource, /recovery_evidence_hash/u);
assert.match(exportSource, /assessment_evidence_hash/u);
assert.match(exportSource, /code_result_evidence_hash/u);

const workspace = fs.readFileSync(WORKSPACE_VIEW, 'utf8');
assert.match(workspace, /requireCurrentLinearPipingPresentation/u);
assert.match(workspace, /textContent/u);
assert.doesNotMatch(workspace, /innerHTML|insertAdjacentHTML|outerHTML/u);
assert.doesNotMatch(
  workspace,
  /compileSolverExecution|compileResultRecovery|recoverLinearPiping|compileCodeResult|cross\(|dot\(|utilization\s*=|calculatedStress\s*=/u,
);
assert.doesNotMatch(workspace, /linear-fea-solver|linear-fea-result-recovery|linear-fea-b31-code-engine|linear-piping-interface/u);

const packageValue = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.equal(
  packageValue.scripts['check:lfea-presentation-export'],
  'node scripts/linear-piping-presentation-export-check.mjs && node scripts/linear-piping-presentation-anti-drift-check.mjs',
);
assert.match(packageValue.scripts['check:lfea-core'], /check:lfea-presentation-export/u);
assert.match(packageValue.scripts.gate, /check:lfea-core/u);

console.log('Linear piping Phase 5 presentation anti-drift check PASS');
