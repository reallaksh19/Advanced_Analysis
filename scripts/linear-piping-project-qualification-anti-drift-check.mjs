#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('src/core/linear-piping-project-qualification');
const files = fs.readdirSync(ROOT)
  .filter((name) => name.endsWith('.js'))
  .map((name) => path.join(ROOT, name));
const source = Object.fromEntries(
  files.map((file) => [path.basename(file), fs.readFileSync(file, 'utf8')]),
);
const combined = Object.values(source).join('\n');

const forbidden = [
  ['UI_OR_WORKSPACE_AUTHORITY', /from\s+['"][^'"]*(?:workspace|svg|three|canvas)[^'"]*['"]/u],
  ['SOLVER_OR_RECOVERY_AUTHORITY', /compileSolverExecution|compileResultRecovery|assembleGlobal|stiffnessMatrix/u],
  ['CODE_RECALCULATION', /compileCodeResult|calculatedStress\s*=|utilization\s*=/u],
  ['EXTERNAL_PROGRAM_EXECUTION', /child_process|spawn\(|execFile\(|shelljs/u],
  ['EMBEDDED_PROJECT_RESULT', /CAESAR\s*II\s*RESULT|AUTOPIPE\s*RESULT|COMMERCIAL_REFERENCE_VALUE/u],
  ['RANDOM_IDENTITY', /Math\.random|randomUUID/u],
  ['LOCALE_ORDERING', /localeCompare/u],
  ['HIDDEN_ENGINEERING_DEFAULT', /function\s+\w+\s*\([^)]*=\s*(?:-?\d|true|false)/u],
  ['RELEASE_LEDGER_MUTATION', /release-evidence\/lfea-piping-release-evidence\.json/u],
];

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/u).length;
  assert.ok(lines < 500, `${file} has ${lines} physical lines; limit is <500`);
  for (const [code, pattern] of forbidden) {
    assert.doesNotMatch(text, pattern, `${code}: ${file}`);
  }
}

const contracts = source['contracts.js'];
assert.match(contracts, /INDEPENDENT_ENGINEERING_REVIEW/u);
assert.match(contracts, /COMMERCIAL_PIPE_STRESS_PROGRAM/u);
assert.match(contracts, /ABSOLUTE_OR_RELATIVE_V1/u);
assert.match(contracts, /relativeScaleFloor/u);

const comparison = source['comparison.js'];
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

const externalContracts = source['external-evidence-contracts.js'];
assert.match(externalContracts, /linear-piping-performance-evidence\/v1/u);
assert.match(externalContracts, /linear-piping-rollback-evidence\/v1/u);
assert.match(externalContracts, /linear-piping-release-review-disposition\/v1/u);
assert.match(externalContracts, /ACCEPT_FOR_RELEASE_REVIEW/u);
assert.match(externalContracts, /PIPING_EXTERNAL_EVIDENCE_INELIGIBLE/u);
assert.match(externalContracts, /FICTIONAL/u);
assert.match(externalContracts, /SIMULATED/u);
assert.match(externalContracts, /FIXTURE/u);

const performance = source['performance-evidence.js'];
for (const stage of ['COMPILE', 'EXPORT', 'PRESENTATION', 'RECOVERY', 'SOLVE']) {
  assert.match(externalContracts, new RegExp(`'${stage}'`, 'u'));
}
assert.match(performance, /deterministicReplay/u);
assert.match(performance, /peakResidentBytes/u);
assert.match(performance, /PIPING_PERFORMANCE_STAGE_COVERAGE_INVALID/u);
assert.match(performance, /PIPING_PERFORMANCE_REPLAY_INVALID/u);

const rollback = source['rollback-evidence.js'];
assert.match(rollback, /commandHash !== semanticHash\(\{ commandText \}\)/u);
assert.match(rollback, /restoredApplicationPath/u);
assert.match(rollback, /preservedProjectData/u);
assert.match(rollback, /postRollbackChecks/u);
assert.doesNotMatch(rollback, /requireExternalText\(source\.commandText/u);

const projectAuthority = source['project-authority-index.js'];
assert.match(projectAuthority, /lfea-piping-phase6i-project-authority-index\/v1/u);
assert.match(projectAuthority, /WP2_INPUT_REQUIRED/u);
assert.match(projectAuthority, /WP2_APPROVAL_REQUIRED/u);
assert.match(projectAuthority, /WP2_COMPLETE/u);
assert.match(projectAuthority, /requireApprovedProjectAuthorityIndex/u);
assert.match(projectAuthority, /LFEA_WP2_SHADOW_SOURCE_PROHIBITED/u);
assert.match(projectAuthority, /617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54/u);
assert.match(projectAuthority, /release\/lfea-piping-phase6i-617f7c2/u);
assert.match(projectAuthority, /releaseQualified:\s*false/u);
assert.doesNotMatch(projectAuthority, /releaseQualified:\s*true/u);

const externalHandoff = source['external-evidence-handoff.js'];
assert.match(externalHandoff, /lfea-piping-phase6i-external-evidence-handoff\/v1/u);
assert.match(externalHandoff, /lfea-piping-phase6i-external-evidence-handoff-acceptance\/v1/u);
assert.match(externalHandoff, /HANDOFF_ACCEPTED_FOR_PHASE6H/u);
assert.match(externalHandoff, /WP2_COMPLETE/u);
assert.match(externalHandoff, /WP3_COMPLETE/u);
assert.match(externalHandoff, /CONFIRMED/u);
assert.match(externalHandoff, /EXTERNAL_EVIDENCE_HANDOFF_RECORD_COUNT = 7/u);
assert.match(externalHandoff, /requestContentHash/u);
assert.match(externalHandoff, /projectAuthorityIndexEvidenceHash/u);
assert.match(externalHandoff, /releaseQualified:\s*false/u);
assert.doesNotMatch(externalHandoff, /releaseQualified:\s*true/u);
assert.match(externalHandoff, /PHASE6I_FROZEN_CANDIDATE/u);
assert.match(externalHandoff, /PHASE6I_IMMUTABLE_REF/u);
assert.match(externalHandoff, /LFEA_WP3_HANDOFF_HASH_MISMATCH/u);
assert.match(externalHandoff, /LFEA_WP3_HANDOFF_ACCEPTANCE_HASH_MISMATCH/u);

const externalPackage = source['external-evidence-package.js'];
assert.match(externalPackage, /linear-piping-external-qualification-package-request\/v2/u);
assert.match(externalPackage, /linear-piping-external-qualification-package\/v2/u);
assert.match(externalPackage, /PIPING_EXTERNAL_PACKAGE_REQUEST_INVALID/u);
assert.match(externalPackage, /projectAuthorityIndex/u);
assert.match(externalPackage, /requireApprovedProjectAuthorityIndex/u);
assert.match(externalPackage, /ELIGIBLE_FOR_RELEASE_REVIEW/u);
assert.match(externalPackage, /requireCurrentLinearPipingPresentation/u);
assert.match(externalPackage, /INTERFACE_FORCE_LOCAL/u);
assert.match(externalPackage, /INTERFACE_MOMENT_REFERENCE_LOCAL/u);
assert.match(externalPackage, /NOZZLE_UTILIZATION/u);
assert.match(externalPackage, /B31_CALCULATED_STRESS/u);
assert.match(externalPackage, /B31_UTILIZATION/u);
assert.match(externalPackage, /PIPING_EXTERNAL_PACKAGE_AUTHORITY_NOT_INDEPENDENT/u);
assert.match(externalPackage, /PIPING_EXTERNAL_PACKAGE_PERFORMANCE_INVALID/u);
assert.match(externalPackage, /PIPING_EXTERNAL_PACKAGE_ROLLBACK_INVALID/u);
assert.match(externalPackage, /PIPING_EVIDENCE_ARTIFACT_REFERENCE_MISMATCH/u);
assert.doesNotMatch(externalPackage, /['"](?:VERIFIED|QUALIFIED)['"]/u);

const boundPackage = source['project-authority-bound-external-package.js'];
assert.match(boundPackage, /linear-piping-project-authority-bound-external-package-request\/v1/u);
assert.match(boundPackage, /linear-piping-project-authority-bound-external-package\/v1/u);
assert.match(boundPackage, /ELIGIBLE_FOR_PHASE6G_ASSEMBLY/u);
assert.match(boundPackage, /requireApprovedProjectAuthorityIndex/u);
assert.match(boundPackage, /requireLinearPipingExternalQualificationPackage/u);
assert.match(boundPackage, /PIPING_PROJECT_AUTHORITY_HEAD_MISMATCH/u);
assert.match(boundPackage, /PIPING_PROJECT_AUTHORITY_ARTIFACT_MISMATCH/u);
assert.match(boundPackage, /PIPING_PROJECT_AUTHORITY_ARTIFACT_PATH_DUPLICATE/u);
assert.match(boundPackage, /projectAuthorityBoundPackageSemanticProjection/u);
assert.match(boundPackage, /computeProjectAuthorityBoundPackageEvidenceHash/u);
assert.doesNotMatch(boundPackage, /['"](?:VERIFIED|QUALIFIED)['"]/u);

const fixture = fs.readFileSync('scripts/linear-piping-project-qualification-check.mjs', 'utf8');
assert.match(fixture, /FICTIONAL-QUALIFICATION-LAB-NOT-PROJECT-EVIDENCE/u);
assert.match(fixture, /FICTIONAL-COMMERCIAL-PIPE-STRESS-PROGRAM/u);
const externalFixture = fs.readFileSync(
  'scripts/linear-piping-external-evidence-package-check.mjs',
  'utf8',
);
assert.match(externalFixture, /\[SIMULATED\]\[INELIGIBLE_FOR_PROJECT_EVIDENCE\]/u);
assert.match(externalFixture, /linear-piping-external-qualification-package\/v2/u);
assert.match(externalFixture, /PIPING_EXTERNAL_EVIDENCE_INELIGIBLE/u);
assert.match(externalFixture, /projectAuthorityIndex/u);
assert.match(externalFixture, /LFEA_WP2_INDEX_NOT_APPROVED/u);

const releaseEvidence = JSON.parse(
  fs.readFileSync('release-evidence/lfea-piping-release-evidence.json', 'utf8'),
);
assert.equal(releaseEvidence.gates.G8_REAL_MODEL_RECONCILIATION, 'UNRESOLVED_GATE');
assert.equal(releaseEvidence.gates.G9_COMMERCIAL_CORROBORATION, 'UNRESOLVED_GATE');
assert.equal(releaseEvidence.gates.G10_RELEASE_ROLLBACK, 'UNRESOLVED_GATE');
assert.equal(releaseEvidence.artifacts.realModelReconciliation, null);
assert.equal(releaseEvidence.artifacts.commercialCorroboration, null);
assert.equal(releaseEvidence.artifacts.performanceEvidence, null);
assert.equal(releaseEvidence.artifacts.rollbackEvidence, null);
assert.equal(releaseEvidence.artifacts.signedDisposition, null);

const releasePolicy = fs.readFileSync(
  'scripts/lfea-piping-release-readiness-check.mjs',
  'utf8',
);
assert.match(releasePolicy, /linear-piping-project-qualification-check\.mjs/u);
assert.match(releasePolicy, /linear-piping-project-qualification-anti-drift-check\.mjs/u);
assert.match(releasePolicy, /parseReleaseInvocation\(process\.argv\.slice\(2\), process\.cwd\(\)\)/u);
assert.match(releasePolicy, /releaseMode: invocation\.releaseMode/u);
assert.match(releasePolicy, /expectedHead: invocation\.expectedHead/u);
assert.match(releasePolicy, /policyRunner: runPolicyChecks/u);

const releaseOrchestrator = fs.readFileSync(
  'scripts/lfea-piping-release-orchestrator.mjs',
  'utf8',
);
assert.match(releaseOrchestrator, /const releaseMode = args\.includes\('--release'\)/u);
assert.match(releaseOrchestrator, /if \(!releaseMode && options\.size > 0\)/u);
assert.match(releaseOrchestrator, /releaseMode: false/u);
assert.match(releaseOrchestrator, /if \(!releaseMode\) \{/u);
assert.match(releaseOrchestrator, /evidence\.programDisposition !== 'BLOCKED'/u);
assert.match(releaseOrchestrator, /await policyRunner\(\)/u);
assert.match(releaseOrchestrator, /mode: 'POLICY'/u);
assert.match(releaseOrchestrator, /validateReleaseCandidate\(evidence, expectedHead\)/u);
assert.match(releaseOrchestrator, /mode: 'RELEASE'/u);
assert.match(releaseOrchestrator, /status !== 'VERIFIED'/u);
assert.match(releaseOrchestrator, /LFEA_RELEASE_ARTIFACTS_MISSING/u);
assert.match(releaseOrchestrator, /evidence\.programDisposition !== 'QUALIFIED'/u);

const index = source['index.js'];
assert.match(index, /compileLinearPipingExternalQualificationPackage/u);
assert.match(index, /requireApprovedProjectAuthorityIndex/u);
assert.match(index, /compileProjectAuthorityBoundExternalPackage/u);
assert.match(index, /requireProjectAuthorityBoundExternalPackage/u);
assert.match(index, /sealPhase6iExternalEvidenceHandoff/u);
assert.match(index, /requirePhase6iExternalEvidenceHandoff/u);
assert.match(index, /compilePhase6iExternalEvidenceHandoffAcceptance/u);
assert.match(index, /requirePhase6iExternalEvidenceHandoffAcceptance/u);
assert.match(index, /sealPerformanceEvidence/u);
assert.match(index, /sealRollbackEvidence/u);
assert.match(index, /sealReleaseReviewDisposition/u);

const packageValue = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.equal(
  packageValue.scripts['check:lfea-piping-release-policy'],
  'node scripts/lfea-piping-release-readiness-check.mjs',
);
assert.match(packageValue.scripts.gate, /check:lfea-piping-release-policy/u);
assert.doesNotMatch(packageValue.scripts['check:lafea-core'], /project-qualification/u);

await import('./linear-piping-external-evidence-package-check.mjs');

console.log('Linear piping Phase 6A and Phase 6B qualification anti-drift check PASS');
