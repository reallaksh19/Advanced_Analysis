import fs from 'fs';
import path from 'path';

let success = true;

console.log('\n--- U7 Browser QA Static Checks ---\n');

const requiredE2EFiles = [
  'e2e/smoke.spec.js',
  'e2e/u7-workflow-smoke.spec.js',
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
  'e2e/w10.8-workspace-consumers.spec.js',
  'e2e/w10.9-load-calc-consumer.spec.js',
  'e2e/w10.10-three-d-calc-consumer.spec.js',
];

for (const file of requiredE2EFiles) {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) console.log(`✅ ${file} exists`);
  else {
    console.error(`❌ ${file} NOT found`);
    success = false;
  }
}

console.log();
const playwrightConfigPath = path.join(process.cwd(), 'playwright.config.js');
if (fs.existsSync(playwrightConfigPath)) {
  const configContent = fs.readFileSync(playwrightConfigPath, 'utf8');
  if (configContent.includes('screenshot') || configContent.includes('on-failure')) {
    console.log('✅ playwright.config.js contains artifact configuration');
  } else {
    console.log('⚠️ playwright.config.js does not explicitly mention screenshot/video/trace artifacts');
  }
} else {
  console.error('❌ playwright.config.js NOT found');
  success = false;
}

console.log();
const qaCheckPath = path.join(process.cwd(), 'scripts/qa-check.mjs');
if (fs.existsSync(qaCheckPath)) {
  const qaCheckContent = fs.readFileSync(qaCheckPath, 'utf8');
  if (qaCheckContent.includes('Date.now') || qaCheckContent.includes('performance.now')) {
    console.log('✅ scripts/qa-check.mjs contains timestamp guard');
  } else {
    console.log('⚠️ scripts/qa-check.mjs does not yet contain timestamp guard checks');
  }
} else {
  console.error('❌ scripts/qa-check.mjs NOT found');
  success = false;
}

checkSpecContracts('e2e/u7-workflow-smoke.spec.js', [
  'test.describe',
  'data-panel="tree"',
  'data-panel="viewport"',
  'data-panel="properties"',
  'data-role="dataset-file"',
  "EventBus.publish('viewport:entitySelected'",
  'data-entity-id="SUP-201"',
  'data-analysis-type="support-load"',
  'Run reviewed analysis · support-load',
  'support-load completed · CALCULATED',
]);

checkSpecContracts('e2e/phase3-viewport-renderer.spec.js', [
  '__WORKSPACE_VIEWPORT_BACKEND__',
  'data-viewport-backend',
  'data-renderable-count',
  'data-skipped-count',
  'Fit View',
  'Reset View',
  'retained 2 rendered',
  'AnalysisWorkspace.destroy()',
]);

checkSpecContracts('e2e/phase4-viewport-picking.spec.js', [
  'viewport:selectionRequested',
  'aria-current',
  'PIPE-PICK-SEGMENT',
  'SUP-PICK-POINT',
  'direct selected notification',
  'empty-space click retains',
  'AnalysisWorkspace.destroy()',
]);

checkSpecContracts('e2e/phase5-analysis-capabilities.spec.js', [
  'support-load',
  'pipe-screening',
  'UNREVIEWED_ANALYSIS_SESSION',
  'summary.sourcePipeId',
  'summary.sourceEntityCount',
  'No analysis has been run for this selection.',
  'AnalysisWorkspace.destroy()',
]);

checkSpecContracts('e2e/phase6-analysis-sessions.spec.js', [
  'analysis-session-1',
  'Ready for reviewed execution',
  'pipeOdMm',
  'must be greater than zero',
  'connectedLineSegments',
  'getAnalysisSession',
  'AnalysisWorkspace.destroy()',
]);

checkSpecContracts('e2e/phase7-analysis-ledger.spec.js', [
  'analysis-ledger-entry-1',
  'analysis-ledger-entry-2',
  'analysis-comparison-summary',
  'Export JSON',
  'Export CSV',
  'Export Markdown',
  'getAnalysisLedger',
  'analysis:ledgerChanged',
]);

checkSpecContracts('e2e/phase8-engineering-geometry.spec.js', [
  'PIPE-8',
  'ELBOW-8',
  'TEE-8',
  'REDUCER-8',
  'FLANGE-8',
  'VALVE-8',
  'SUPPORT-8',
  'data-resolved-count',
  'data-fallback-count',
  'data-component-kinds',
  'AnalysisWorkspace.destroy()',
]);

checkSpecContracts('e2e/phase9-analysis-readiness.spec.js', [
  'workspace-support-load-screening',
  'ACCESS_TEMP_WALL_WEIGHTED_V1',
  'READY_FOR_REVIEWED_EXECUTION',
  'INPUT_REQUIRED',
  'NOT_APPLICABLE',
  'data-readiness-analysis-type',
  'UNREVIEWED_ANALYSIS_SESSION',
  'getAnalysisSession',
]);

checkSpecContracts('e2e/w10.1-shared-model-export.spec.js', [
  'shared-piping-model/v1',
  'Export Shared Model',
  'getSharedModel',
  'sharedModel:exportRequested',
  '__sharedModelUrlAudit',
  'clear-dataset',
  'AnalysisWorkspace.destroy()',
]);

checkSpecContracts('e2e/w10.2-topology-workspace.spec.js', [
  'piping-port-topology-graph/v1',
  'Rebuild Exact Topology',
  'Rebuild With Tolerance',
  'Export Topology Graph',
  'getTopologyGraph',
  'getTopologyAudit',
  '__topologyUrlAudit',
  'AnalysisWorkspace.destroy()',
]);

checkSpecContracts('e2e/w10.3-support-restraint-workspace.spec.js', [
  'support-restraint-export/v1',
  'Rebuild With Projection',
  'Export Support/Restraint Model',
  'getSupportAttachmentModel',
  'getRestraintCapabilityModel',
  'supportRestraint:exportRequested',
  '__supportRestraintUrlAudit',
  'AnalysisWorkspace.destroy()',
]);

checkSpecContracts('e2e/w10.4-model-load-workspace.spec.js', [
  'model-load-export/v1',
  'Rebuild Model Loads',
  'Export Load Case/Primitive Model',
  'getLoadCaseSet',
  'getLoadPrimitiveSet',
  'modelLoad:exportRequested',
  '__modelLoadUrlAudit',
  'AnalysisWorkspace.destroy()',
]);

checkSpecContracts('e2e/w10.5-support-load-screening-workspace.spec.js', [
  'tributary-support-load-screening/v1',
  'Rebuild Vertical Load Paths',
  'Run Tributary Screening',
  'Export Support Load Screening',
  'getVerticalLoadPathModel',
  'getSupportLoadScreening',
  'supportLoadScreening:exportRequested',
  '__w105UrlAudit',
  'AnalysisWorkspace.destroy()',
]);

checkSpecContracts('e2e/w10.6-vertical-beam-workspace.spec.js', [
  'vertical-beam-solution/v1',
  'Rebuild Vertical Beam Model',
  'Solve Vertical Stiffness',
  'Export Vertical Beam Solution',
  'getFlexuralPropertyProjection',
  'getVerticalBeamModel',
  'verticalBeam:exportRequested',
  '__w106UrlAudit',
  'AnalysisWorkspace.destroy()',
]);

checkSpecContracts('e2e/w10.7-model-calculation-workspace.spec.js', [
  'model-calculation-package/v1',
  'model-calculation-ledger/v1',
  'Create Calculation Package',
  'Select Archived Package',
  'Export Package JSON',
  'Export Report CSV',
  'Export Report Markdown',
  'getModelCalculationLedger',
  'getActiveModelCalculationPackage',
  'getActiveModelCalculationReport',
  '__w107UrlAudit',
  'AnalysisWorkspace.destroy()',
]);

checkSpecContracts('e2e/w10.8-workspace-consumers.spec.js', [
  'getApplicationViewState',
  'getWorkspaceConsumerContext',
  'getWorkspaceConsumerReadiness',
  'aria-disabled',
  'AnalysisWorkspace.destroy()',
]);

checkSpecContracts('e2e/w10.9-load-calc-consumer.spec.js', [
  'load-calculation-review-model/v1',
  'application-view-state/v2',
  'getLoadCalculationReviewModel',
  'modelLoad:rebuildRequested',
  'supportLoadScreening:runRequested',
  'Topology-local tributary screening',
  'AnalysisWorkspace.destroy()',
]);

checkSpecContracts('e2e/w10.10-three-d-calc-consumer.spec.js', [
  'three-d-calculation-review-model/v1',
  'application-view-state/v3',
  'getThreeDCalculationReviewModel',
  'sharedModel:exportRequested',
  'topology:rebuildExactRequested',
  'supportRestraint:rebuildEvidenceRequested',
  'verticalBeam:solveRequested',
  'Not a second 3D viewport',
  'AnalysisWorkspace.destroy()',
]);

console.log();
if (!success) process.exit(1);
console.log('✅ All U7 browser QA static checks passed.\n');

function checkSpecContracts(relativePath, requiredContracts) {
  console.log();
  const fullPath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ ${relativePath} NOT found`);
    success = false;
    return;
  }
  const specContent = fs.readFileSync(fullPath, 'utf8');
  const missingContracts = requiredContracts.filter((contract) => !specContent.includes(contract));
  if (missingContracts.length === 0) {
    console.log(`✅ ${relativePath} contains required workspace contracts`);
  } else {
    console.error(`❌ ${relativePath} is missing: ${missingContracts.join(', ')}`);
    success = false;
  }
}
