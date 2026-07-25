#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const checks = {
  governanceRecords: [
    'AUDIT_CURRENT_BASELINE.md',
    'RELEASE_CANDIDATE_REGISTER.md',
    'FINAL_PENDING_REGISTER.md',
    'docs/analysis-workspace/PHASE_1_ARCHITECTURE.md',
    'docs/analysis-workspace/PHASE_2_DATASET_ADAPTER.md',
    'docs/analysis-workspace/PHASE_3_READONLY_VIEWPORT.md',
    'docs/analysis-workspace/PHASE_4_VIEWPORT_PICKING.md',
    'docs/analysis-workspace/PHASE_5_CONTEXTUAL_ANALYSIS.md',
    'docs/analysis-workspace/PHASE_6_ANALYSIS_SESSIONS.md',
    'docs/analysis-workspace/PHASE_7_ANALYSIS_LEDGER.md',
    'docs/analysis-workspace/PHASE_8_RESOLVED_ENGINEERING_GEOMETRY.md',
    'docs/analysis-workspace/PHASE_9_ANALYSIS_READINESS.md',
    'docs/shared-piping-model/W10.1_SHARED_PIPING_MODEL.md',
    'docs/piping-topology/W10.2_SHARED_COMPONENT_PORT_TOPOLOGY.md',
    'docs/support-restraints/W10.3_SUPPORT_ATTACHMENT_RESTRAINT_CAPABILITY.md',
    'docs/model-loads/W10.4_REUSABLE_MODEL_LOADS.md',
    'docs/support-load-screening/W10.5_TOPOLOGY_LOCAL_TRIBUTARY_SCREENING.md',
    'docs/vertical-beam-solver/W10.6_EXPLICIT_EI_VERTICAL_BEAM_SOLVER.md',
    'docs/model-calculation-package/W10.7_MODEL_CALCULATION_PACKAGE.md',
  ],
  certificationScripts: [
    'scripts/u3-engineering-data-check.mjs',
    'scripts/u3-engineering-data-behavior-test.mjs',
    'scripts/u4-sketcher-topology-check.mjs',
    'scripts/u4-sketcher-topology-behavior-test.mjs',
    'scripts/u5-solver-certification-check.mjs',
    'scripts/u5-solver-certification-behavior-test.mjs',
    'scripts/u6-active-reporting-check.mjs',
    'scripts/u6-active-reporting-behavior-test.mjs',
    'scripts/u7-browser-qa-check.mjs',
    'scripts/phase1-workspace-contract-check.mjs',
    'scripts/phase2-workspace-contract-check.mjs',
    'scripts/phase3-viewport-contract-check.mjs',
    'scripts/phase4-viewport-picking-contract-check.mjs',
    'scripts/phase5-analysis-capability-contract-check.mjs',
    'scripts/phase6-analysis-session-contract-check.mjs',
    'scripts/phase7-analysis-ledger-contract-check.mjs',
    'scripts/phase8-engineering-geometry-contract-check.mjs',
    'scripts/phase9-analysis-readiness-contract-check.mjs',
    'scripts/w10.1-shared-piping-model-contract-check.mjs',
    'scripts/w10.1-shared-model-source-guard.mjs',
    'scripts/w10.2-topology-contract-check.mjs',
    'scripts/w10.2-topology-property-check.mjs',
    'scripts/w10.2-topology-source-guard.mjs',
    'scripts/w10.3-support-attachment-contract-check.mjs',
    'scripts/w10.3-restraint-capability-contract-check.mjs',
    'scripts/w10.3-support-restraint-property-check.mjs',
    'scripts/w10.3-support-restraint-source-guard.mjs',
    'scripts/w10.4-shared-load-evidence-check.mjs',
    'scripts/w10.4-model-load-contract-check.mjs',
    'scripts/w10.4-model-load-property-check.mjs',
    'scripts/w10.4-model-load-source-guard.mjs',
    'scripts/w10.5-support-load-screening-contract-check.mjs',
    'scripts/w10.5-support-load-screening-property-check.mjs',
    'scripts/w10.5-support-load-screening-source-guard.mjs',
    'scripts/w10.6-flexural-property-contract-check.mjs',
    'scripts/w10.6-vertical-beam-contract-check.mjs',
    'scripts/w10.6-engineering-benchmark-check.mjs',
    'scripts/w10.6-vertical-beam-property-check.mjs',
    'scripts/w10.6-vertical-beam-source-guard.mjs',
    'scripts/w10.7-model-calculation-contract-check.mjs',
    'scripts/w10.7-model-calculation-property-check.mjs',
    'scripts/w10.7-model-calculation-source-guard.mjs',
    'scripts/release-candidate-check.mjs',
  ],
  sourceContracts: [
    'src/core/engineering-data/resolveEngineeringData.js',
    'src/sketcher/topology/validateSketchTopology.js',
    'src/sketcher/topology/classifyTeeMainBranch.js',
    'src/core/solvers/certification/solverResultContract.js',
    'src/reporting/publishActiveReportContext.js',
    'src/reporting/buildReportPayload.js',
    'src/workspace/event-bus.js',
    'src/workspace/event-topics.js',
    'src/workspace/dataset-adapter.js',
    'src/workspace/dataset-controller.js',
    'src/workspace/workspace-state.js',
    'src/workspace/geometry-evidence.js',
    'src/workspace/engineering-component-classifier.js',
    'src/workspace/engineering-dimension-resolver.js',
    'src/workspace/engineering-geometry-math.js',
    'src/workspace/resolved-engineering-geometry.js',
    'src/workspace/viewport-render-model.js',
    'src/workspace/viewport-hit-test.js',
    'src/workspace/viewport-renderer.js',
    'src/workspace/canvas2d-viewport-backend.js',
    'src/workspace/three-engineering-primitives.js',
    'src/workspace/three-viewport-backend.js',
    'src/workspace/analysis-capability-registry.js',
    'src/workspace/analysis-capabilities.js',
    'src/workspace/analysis-context.js',
    'src/workspace/analysis-coordinator.js',
    'src/workspace/analysis-input-evidence.js',
    'src/workspace/analysis-readiness.js',
    'src/workspace/analysis-readiness-view.js',
    'src/workspace/analysis-session-context.js',
    'src/workspace/analysis-session-store.js',
    'src/workspace/analysis-session-controller.js',
    'src/workspace/analysis-session-view.js',
    'src/workspace/analysis-ledger-store.js',
    'src/workspace/analysis-ledger-controller.js',
    'src/workspace/analysis-ledger-comparison.js',
    'src/workspace/analysis-ledger-view.js',
    'src/workspace/analysis-report.js',
    'src/workspace/analysis-report-export.js',
    'src/workspace/support-load-capability.js',
    'src/workspace/pipe-screening-capability.js',
    'src/workspace/properties-view.js',
    'src/workspace/staged-model-index.js',
    'src/workspace/calculation-workspace-bridge.js',
    'src/workspace/shared-model-controller.js',
    'src/workspace/shared-model-export.js',
    'src/workspace/shared-model-panel.js',
    'src/workspace/shared-model-view.js',
    'src/core/shared-piping-model/index.js',
    'src/core/shared-piping-model/source-package-snapshot.js',
    'src/core/shared-piping-model/shared-piping-model.js',
    'src/core/shared-piping-model/property-specs.js',
    'src/core/shared-piping-model/adapters/workspace-dataset-to-shared.js',
    'src/core/piping-topology/index.js',
    'src/core/piping-topology/connection-profile.js',
    'src/core/piping-topology/port-projection.js',
    'src/core/piping-topology/spatial-hash.js',
    'src/core/piping-topology/topology-graph.js',
    'src/core/piping-topology/topology-audit.js',
    'src/workspace/topology-controller.js',
    'src/workspace/topology-store.js',
    'src/workspace/topology-export.js',
    'src/workspace/topology-panel.js',
    'src/workspace/topology-view.js',
    'src/core/support-restraints/index.js',
    'src/core/support-restraints/attachment-profile.js',
    'src/core/support-restraints/support-projection.js',
    'src/core/support-restraints/attachment-model.js',
    'src/core/support-restraints/attachment-audit.js',
    'src/core/support-restraints/target-spatial-index.js',
    'src/core/support-restraints/restraint-profile.js',
    'src/core/support-restraints/restraint-model.js',
    'src/core/support-restraints/restraint-audit.js',
    'src/workspace/support-restraint-controller.js',
    'src/workspace/support-restraint-store.js',
    'src/workspace/support-restraint-export.js',
    'src/workspace/support-restraint-panel.js',
    'src/workspace/support-restraint-view.js',
    'src/core/model-loads/index.js',
    'src/core/model-loads/gravity-profile.js',
    'src/core/model-loads/load-case-set.js',
    'src/core/model-loads/load-source-projection.js',
    'src/core/model-loads/composition-profile.js',
    'src/core/model-loads/primitive-builder.js',
    'src/core/model-loads/readiness-audit.js',
    'src/workspace/model-load-controller.js',
    'src/workspace/model-load-store.js',
    'src/workspace/model-load-export.js',
    'src/workspace/model-load-panel.js',
    'src/workspace/model-load-view.js',
    'src/core/support-load-screening/index.js',
    'src/core/support-load-screening/profile.js',
    'src/core/support-load-screening/path-model.js',
    'src/core/support-load-screening/support-stations.js',
    'src/core/support-load-screening/primitive-projection.js',
    'src/core/support-load-screening/formulas.js',
    'src/core/support-load-screening/screening-engine.js',
    'src/core/support-load-screening/screening-audit.js',
    'src/workspace/support-load-screening-controller.js',
    'src/workspace/support-load-screening-store.js',
    'src/workspace/support-load-screening-export.js',
    'src/workspace/support-load-screening-panel.js',
    'src/workspace/support-load-screening-view.js',
    'src/core/vertical-beam-solver/index.js',
    'src/core/vertical-beam-solver/constants.js',
    'src/core/vertical-beam-solver/diagnostics.js',
    'src/core/vertical-beam-solver/numeric.js',
    'src/core/vertical-beam-solver/geometry.js',
    'src/core/vertical-beam-solver/profile.js',
    'src/core/vertical-beam-solver/flexural-properties.js',
    'src/core/vertical-beam-solver/load-projection.js',
    'src/core/vertical-beam-solver/beam-model.js',
    'src/core/vertical-beam-solver/element-formulas.js',
    'src/core/vertical-beam-solver/assembly.js',
    'src/core/vertical-beam-solver/linear-solver.js',
    'src/core/vertical-beam-solver/equilibrium.js',
    'src/core/vertical-beam-solver/solution.js',
    'src/core/vertical-beam-solver/audit.js',
    'src/core/vertical-beam-solver/foundation.js',
    'src/workspace/vertical-beam-controller.js',
    'src/workspace/vertical-beam-events.js',
    'src/workspace/vertical-beam-export.js',
    'src/workspace/vertical-beam-panel.js',
    'src/workspace/vertical-beam-store.js',
    'src/workspace/vertical-beam-view.js',
    'src/core/model-calculation-package/index.js',
    'src/core/model-calculation-package/constants.js',
    'src/core/model-calculation-package/snapshot-validation.js',
    'src/core/model-calculation-package/snapshot-normalization.js',
    'src/core/model-calculation-package/method-evidence.js',
    'src/core/model-calculation-package/qualification-summary.js',
    'src/core/model-calculation-package/package.js',
    'src/core/model-calculation-package/ledger.js',
    'src/core/model-calculation-package/report.js',
    'src/core/model-calculation-package/export-artifact.js',
    'src/workspace/model-calculation-controller.js',
    'src/workspace/model-calculation-events.js',
    'src/workspace/model-calculation-export.js',
    'src/workspace/model-calculation-panel.js',
    'src/workspace/model-calculation-store.js',
    'src/workspace/model-calculation-view.js',
    'src/workspace/bootstrap.js',
  ],
  browserEvidence: [
    'e2e/phase1-analysis-workspace.spec.js',
    'e2e/phase2-workspace-dataset.spec.js',
    'e2e/phase3-viewport-renderer.spec.js',
    'e2e/phase4-viewport-picking.spec.js',
    'e2e/phase5-analysis-capabilities.spec.js',
    'e2e/phase6-analysis-sessions.spec.js',
    'e2e/phase7-analysis-ledger.spec.js',
    'e2e/phase8-engineering-geometry.spec.js',
    'e2e/phase9-analysis-readiness.spec.js',
    'e2e/w10.1-shared-model-export.spec.js',
    'e2e/w10.2-topology-workspace.spec.js',
    'e2e/w10.3-support-restraint-workspace.spec.js',
    'e2e/w10.4-model-load-workspace.spec.js',
    'e2e/w10.5-support-load-screening-workspace.spec.js',
    'e2e/w10.6-vertical-beam-workspace.spec.js',
    'e2e/w10.7-model-calculation-workspace.spec.js',
    'e2e/smoke.spec.js',
    'e2e/u7-workflow-smoke.spec.js',
  ],
};

const legacyDocumentNames = [
  'PHASE_U3_ENGINEERING_DATA_UNIFICATION.md',
  'PHASE_U4_SKETCHER_TOPOLOGY_FITTINGS.md',
  'PHASE_U5_SOLVER_CERTIFICATION_CONTRACT.md',
  'PHASE_U6_ACTIVE_CALCULATION_REPORTING.md',
  'PHASE_U7_BROWSER_QA_DETERMINISTIC_CI.md',
];

let passCount = 0;
let failCount = 0;

function check(category, files) {
  console.log(`\n## ${category}`);
  for (const file of files) {
    const fullPath = path.join(rootDir, file);
    const exists = fs.existsSync(fullPath);
    console.log(`${exists ? 'PASS' : 'FAIL'}: ${file}`);
    if (exists) passCount++;
    else failCount++;
  }
}

function warnForLegacyDocuments() {
  console.log('\n## Superseded Legacy Document Names');
  for (const file of legacyDocumentNames) {
    const exists = fs.existsSync(path.join(rootDir, file));
    console.log(`${exists ? 'PASS' : 'WARNING'}: ${file}`);
  }
  console.log('Executable phase checks and current governance records are the release source of truth.');
}

console.log('# Release Candidate Certification Check\n');
check('Governance Records', checks.governanceRecords);
check('Certification Scripts', checks.certificationScripts);
check('Source Contracts', checks.sourceContracts);
check('Browser Evidence', checks.browserEvidence);
warnForLegacyDocuments();

console.log('\n## Optional Files (Warnings Only)');
const optionalSettingsResolver = 'src/core/settings/resolveEngineeringSettings.js';
console.log(`${fs.existsSync(path.join(rootDir, optionalSettingsResolver)) ? 'PASS' : 'WARNING'}: Engineering Settings Resolver (${optionalSettingsResolver})`);

console.log('\n## Summary');
const total = passCount + failCount;
console.log(`Total required checks: ${total}`);
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);

if (failCount > 0) {
  console.error('\n❌ Release candidate check FAILED');
  process.exit(1);
}
console.log('\n✅ Release candidate check PASSED');
