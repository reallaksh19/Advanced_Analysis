#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECKS = Object.freeze([
  { scope: 'NB-T0', path: 'scripts/lafea-nonbucket-scope-guard.mjs' },
  { scope: 'NB-T1', path: 'scripts/lafea-nonbucket-lifecycle-profiles-check.mjs' },
  { scope: 'NB-T2', path: 'scripts/lafea-nb-t2-source-producer-check.mjs' },
  { scope: 'NB-T3', path: 'scripts/lafea-nb-t3-composition-root-check.mjs' },
  { scope: 'NB-T4A', path: 'scripts/lafea-nb-t4a-analysis-mesh-evidence-check.mjs' },
  { scope: 'NB-T4B', path: 'scripts/lafea-nb-t4b-recovery-render-check.mjs' },
  { scope: 'NB-T6B', path: 'scripts/lafea-nb-t6b-lug-pinhole-mesh-ladder-check.mjs' },
  { scope: 'NB-T6C', path: 'scripts/lafea-nb-t6c-physical-problem-batch-check.mjs' },
  { scope: 'NB-T6D-LOAD', path: 'scripts/lafea-nb-t6d-load-driven-qualification-check.mjs' },
  { scope: 'NB-T6D-RENDER', path: 'scripts/lafea-nb-t6d-b7d-recovery-render-bridge-check.mjs' },
  { scope: 'NB-T6E', path: 'scripts/lafea-nb-t6e-evidence-handoff-review-check.mjs' },
  { scope: 'NB-T6E', path: 'scripts/lafea-nb-t6e-workbench-display-handoff-check.mjs' },
  { scope: 'NB-T6F', path: 'scripts/lafea-nb-t6f-read-only-review-session-check.mjs' },
  { scope: 'NB-T6G', path: 'scripts/lafea-nb-t6g-read-only-review-panel-check.mjs' },
  { scope: 'PR-NB1-A', path: 'scripts/lafea-nb1-analytical-verticals-check.mjs' },
  { scope: 'U1', path: 'scripts/lafea-u1-stage-registry-check.mjs' },
  { scope: 'U1', path: 'scripts/lafea-u1b-registry-consumer-check.mjs' },
  { scope: 'U2', path: 'scripts/lafea-u2a-input-command-check.mjs' },
  { scope: 'U2', path: 'scripts/lafea-u2b-editor-store-check.mjs' },
  { scope: 'U3', path: 'scripts/lafea-u3a-lifecycle-check.mjs' },
  { scope: 'U3', path: 'scripts/lafea-u3a-public-surface-check.mjs' },
  { scope: 'U3', path: 'scripts/lafea-u3b-live-lifecycle-check.mjs' },
  { scope: 'U4', path: 'scripts/lafea-u4a-source-engineering-scene-check.mjs' },
  { scope: 'U4', path: 'scripts/lafea-u4a-public-surface-check.mjs' },
  { scope: 'U4', path: 'scripts/lafea-u4b-live-source-viewport-check.mjs' },
  { scope: 'U4', path: 'scripts/lafea-u4c-render-packet-v2-check.mjs' },
  { scope: 'U4', path: 'scripts/lafea-u4c-render-packet-v2-topology-guard.mjs' },
  { scope: 'U4', path: 'scripts/lafea-u4d-render-evidence-intake-check.mjs' },
  { scope: 'U4', path: 'scripts/lafea-u4e-v2-renderer-adapter-check.mjs' },
  { scope: 'U4', path: 'scripts/lafea-u4e-result-viewport-guard.mjs' },
  { scope: 'U4', path: 'scripts/lafea-u4e-renderer-state-guard.mjs' },
  { scope: 'U4', path: 'scripts/lafea-u4f-hybrid-result-model-check.mjs' },
  { scope: 'U4', path: 'scripts/lafea-u4f-hybrid-result-viewport-check.mjs' },
  { scope: 'U4', path: 'scripts/lafea-u4f-public-facade-check.mjs' },
  { scope: 'U4', path: 'scripts/lafea-u4g-live-workbench-viewport-check.mjs' },
  { scope: 'U4', path: 'scripts/lafea-u4g-controller-render-evidence-check.mjs' },
  { scope: 'U4', path: 'scripts/lafea-u4g-source-guard.mjs' },
  { scope: 'U4', path: 'scripts/lafea-u4h-browser-source-guard.mjs' },
  { scope: 'U4', path: 'scripts/lafea-u4i-primitive-picker-check.mjs' },
  { scope: 'U4', path: 'scripts/lafea-u4i-result-selection-check.mjs' },
  { scope: 'U4', path: 'scripts/lafea-u4i-source-guard.mjs' },
  { scope: 'U4', path: 'scripts/lafea-u4j-diagnostic-field-check.mjs' },
  { scope: 'U4', path: 'scripts/lafea-u4j-source-guard.mjs' },
  { scope: 'WORKBENCH', path: 'scripts/lafea-canvas-contract-check.mjs' },
  { scope: 'U0_WORKBENCH', path: 'scripts/lafea-workbench-check.mjs' },
].map(Object.freeze));

const FORBIDDEN_CHECK_PATHS = Object.freeze([
  /lafea-template-/u,
  /sequential-sketcher/u,
  /first-cut/u,
  /accessory-panel/u,
  /(?:^|\/)lfea-/u,
]);
const failures = [];
const packageAudit = auditPackageScriptKeys();
if (packageAudit.duplicateKeys.length) failures.push({
  scope: 'PACKAGE', check: 'package-script-key-uniqueness',
  code: 'DUPLICATE_PACKAGE_SCRIPT_KEYS', details: packageAudit.duplicateKeys,
});

for (const row of CHECKS) {
  if (FORBIDDEN_CHECK_PATHS.some((pattern) => pattern.test(row.path))) {
    failures.push({ scope: row.scope, check: row.path, code: 'NON_BUCKET_SCOPE_CONTAMINATION' });
    continue;
  }
  const absolutePath = path.join(ROOT, row.path);
  if (!fs.existsSync(absolutePath)) {
    failures.push({ scope: row.scope, check: row.path, code: 'CHECK_SCRIPT_MISSING' });
    continue;
  }
  const result = spawnSync(process.execPath, [absolutePath], {
    cwd: ROOT, encoding: 'utf8', stdio: 'inherit',
  });
  if (result.error) failures.push({
    scope: row.scope, check: row.path, code: 'CHECK_SPAWN_FAILED',
    message: result.error.message,
  });
  else if (result.status !== 0) failures.push({
    scope: row.scope, check: row.path, code: 'CHECK_FAILED', status: result.status,
  });
}

const report = Object.freeze({
  schema: 'lafea-nonbucket-stack-report/v13',
  check: 'lafea-nonbucket-stack-certification',
  status: failures.length ? 'FAIL' : 'PASS',
  exactHead: gitHead(),
  executedChecks: CHECKS,
  packageScriptKeyCount: packageAudit.keyCount,
  duplicatePackageScriptKeys: packageAudit.duplicateKeys,
  failures,
  scopeBoundary: Object.freeze({
    nonBucketLafea: true,
    agent2TemplateBucket: false,
    lfeaPiping: false,
    sequentialSketcher: false,
    firstCut: false,
    accessoryPanels: false,
  }),
  sourceAuthorityIntegrated: true,
  currentCoreProducerAdaptersIntegrated: true,
  registryV2Implemented: true,
  compositionRootIntegrated: true,
  analyticalProductEvidenceIntegrated: true,
  analysisMeshEvidenceIntegrated: true,
  recoveryRenderEvidenceIntegrated: true,
  productionMeshGenerationIntegrated: true,
  productionMeshGeometryClass: 'CONCENTRIC_ANNULAR_LUG_PINHOLE',
  physicalProblemProjectionIntegrated: true,
  controlledPilotBatchSurfaceIntegrated: true,
  stageDocumentGenerationIntegrated: true,
  loadDrivenSelectedPilotQualificationIntegrated: true,
  loadDrivenFreeDofSolveIntegrated: true,
  loadDrivenReactionEquilibriumIntegrated: true,
  b7dFineRecoveryRenderBridgeIntegrated: true,
  b7dExistingExecutionRecoveryLineageRetained: true,
  b7dNewEngineeringRecoveryComputed: false,
  b7dLifecycleArtifactsRegisteredByBridge: false,
  selectedPilotReviewHandoffIntegrated: true,
  portableAuditHandoffIntegrated: true,
  existingRenderBridgeConsumedByReviewHandoff: true,
  newDisplayProjectionProducedByReviewHandoff: false,
  reviewHandoffDisplayValuesIncluded: true,
  reviewHandoffDisplayValuesAuthoritative: false,
  selectedPilotQualificationChangedByReviewHandoff: false,
  b7dLiveWorkbenchDisplayHandoffIntegrated: true,
  b7dWorkbenchRenderEvidenceIntakeRequired: true,
  b7dWorkbenchTypedArraysExposedByReceipt: false,
  b7dWorkbenchEngineeringEvidenceChanged: false,
  publicContinuumFacadeRepaired: true,
  selectedPilotReadOnlyReviewSessionIntegrated: true,
  portableAuditAndLiveDisplayParentsBound: true,
  reviewSessionPacketBuffersIncluded: false,
  reviewSessionDisplayValuesAuthoritative: false,
  reviewSessionEngineeringEvidenceChanged: false,
  selectedPilotReadOnlyReviewPanelIntegrated: true,
  reviewPanelCurrentViewportRequired: true,
  reviewPanelCurrentLifecycleRequired: true,
  reviewPanelControllerMutated: false,
  reviewPanelTypedArraysExposedByReceipt: false,
  reviewPanelDisplayValuesAuthoritative: false,
  arbitraryOuterProfileMeshingIntegrated: false,
  arbitraryHoleTopologyMeshingIntegrated: false,
  displayTessellationAcceptedAsMeshEvidence: false,
  displayValuesAuthoritative: false,
  crossElementSmoothing: false,
  shellNodalExtrapolation: false,
  finiteFoundationMethods: 6,
  screeningProductStates: ['PASS', 'ESCALATE', 'BLOCKED'],
  releaseStateBinding: 'RELEASE_NOT_QUALIFIED',
  numericalAuthorityChanged: false,
  lifecycleSemanticsChanged: true,
  shellAuthorityChanged: false,
  codeAuthorityPromoted: false,
  reportAuthorityPromoted: false,
  generalT7dAuthorized: false,
  releaseQualified: false,
  lafea6Enabled: false,
});
console.log(JSON.stringify(report));
if (failures.length) process.exit(1);

function gitHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function auditPackageScriptKeys() {
  const text = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
  const markerIndex = text.indexOf('"scripts"');
  if (markerIndex < 0) throw new Error('package.json has no scripts object.');
  const objectStart = text.indexOf('{', markerIndex + 9);
  const objectEnd = matchingBrace(text, objectStart);
  const counts = new Map();
  for (const match of text.slice(objectStart + 1, objectEnd)
    .matchAll(/^\s*"([^"]+)"\s*:/gmu)) {
    counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  }
  return {
    keyCount: [...counts.values()].reduce((sum, count) => sum + count, 0),
    duplicateKeys: [...counts.entries()].filter(([, count]) => count > 1)
      .map(([key, count]) => Object.freeze({ key, count }))
      .sort((left, right) => left.key.localeCompare(right.key)),
  };
}

function matchingBrace(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) return index;
  }
  throw new Error('package.json scripts object is not closed.');
}
