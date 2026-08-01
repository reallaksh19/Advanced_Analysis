#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import {
  LAFEA_APPLICATION_TEMPLATE_REGISTRY,
} from '../src/core/lafea-application-templates/template-registry.js';
import {
  LAFEA_T3_ANALYTICAL_COMPILER_BINDINGS,
} from '../src/core/lafea-application-templates/compilers/analytical/bindings.js';
import {
  LAFEA_T4_CONTINUUM_COMPILER_BINDINGS,
} from '../src/core/lafea-application-templates/compilers/continuum/bindings.js';
import {
  LAFEA_STAGE_REGISTRY,
  LAFEA_STAGE_REGISTRY_SCHEMA,
} from '../src/workspace/lafea-stage-registry.js';
import {
  LAFEA_STAGE_COMPOSITION_SCHEMA,
  requireLafeaStageComposition,
} from '../src/workspace/lafea-stage-composition-root.js';
import {
  LAFEA_LIFECYCLE_PROFILE_SCHEMA,
  requireLafeaLifecycleProfileForStage,
} from '../src/workspace/lafea-lifecycle-profiles.js';
import {
  LAFEA_SOURCE_AUTHORITY_SCHEMA,
  LAFEA_SOURCE_AUTHORITY_ROLE,
} from '../src/workspace/lafea-source-authority.js';

const LAST_RETAINED_BUCKET_PASS =
  '24e2b1c7b7279dedc287432cb5165befbc95dcb6';
const exactHead = git(['rev-parse', 'HEAD']);
const expectedHead = process.env.EXPECTED_HEAD_SHA || exactHead;
const candidateBase = process.env.PR_BASE_SHA || git(['rev-parse', `${exactHead}^`]);

assert.equal(exactHead, expectedHead, 'B0 checkout is not the expected exact head.');
assert.equal(
  gitStatus(['cat-file', '-e', `${LAST_RETAINED_BUCKET_PASS}^{commit}`]),
  0,
  'The retained Bucket PASS commit is not available in the exact-head checkout.',
);
assert.equal(
  gitStatus(['merge-base', '--is-ancestor', candidateBase, exactHead]),
  0,
  'The frozen candidate base is not in exact-head ancestry.',
);

const mergeBase = git(['merge-base', LAST_RETAINED_BUCKET_PASS, exactHead]);
const [retainedOnly, candidateOnly] = git([
  'rev-list', '--left-right', '--count',
  `${LAST_RETAINED_BUCKET_PASS}...${exactHead}`,
]).split(/\s+/u).map(Number);
const retainedPassInCandidateAncestry = gitStatus([
  'merge-base', '--is-ancestor', LAST_RETAINED_BUCKET_PASS, exactHead,
]) === 0;
const trackedTreeClean = git([
  'status', '--porcelain=v1', '--untracked-files=no',
]) === '';

assert.equal(trackedTreeClean, true, 'B0 requires no tracked worktree changes.');
assert.equal(LAFEA_STAGE_REGISTRY_SCHEMA, 'lafea-stage-registry/v2');
assert.equal(LAFEA_STAGE_COMPOSITION_SCHEMA, 'lafea-stage-composition/v2');
assert.equal(LAFEA_LIFECYCLE_PROFILE_SCHEMA, 'lafea-lifecycle-profile/v1');
assert.equal(LAFEA_SOURCE_AUTHORITY_SCHEMA, 'lafea-source-authority/v1');
assert.equal(LAFEA_SOURCE_AUTHORITY_ROLE, 'NORMALIZED_STAGE_ENGINEERING_SOURCE');
assert.equal(LAFEA_APPLICATION_TEMPLATE_REGISTRY.length, 27);
assert.equal(new Set(LAFEA_APPLICATION_TEMPLATE_REGISTRY
  .map((row) => row.templateId)).size, 27);

const bindings = new Map([
  ...LAFEA_T3_ANALYTICAL_COMPILER_BINDINGS,
  ...LAFEA_T4_CONTINUUM_COMPILER_BINDINGS,
].map((row) => [row.templateId, row]));

assert.equal(LAFEA_T3_ANALYTICAL_COMPILER_BINDINGS.length, 2);
assert.equal(LAFEA_T4_CONTINUUM_COMPILER_BINDINGS.length, 5);
assert.equal(bindings.size, 7);
assert.equal([...bindings.values()].every((row) => row.status === 'DRAFT'), true);

const compatibility = LAFEA_APPLICATION_TEMPLATE_REGISTRY.map((template) => {
  const stage = LAFEA_STAGE_REGISTRY.find((row) => row.stageId === template.entryStageId);
  assert.ok(stage, `Missing current stage ${template.entryStageId}.`);
  const composition = requireLafeaStageComposition(template.entryStageId);
  const lifecycle = requireLafeaLifecycleProfileForStage(template.entryStageId);
  const binding = bindings.get(template.templateId) ?? null;
  const reasons = [];

  if (template.requiredEnginePackage !== stage.enginePackage) {
    reasons.push('ENGINE_PACKAGE_MISMATCH');
  }
  if (template.requiredStageAuthority !== stage.authority) {
    reasons.push('STAGE_AUTHORITY_MISMATCH');
  }
  if (template.requiredInputContractRole !== stage.inputContractRole) {
    reasons.push('INPUT_CONTRACT_ROLE_MISMATCH');
  }
  if (template.requiredResultContractRole !== stage.resultContractRole) {
    reasons.push('RESULT_CONTRACT_ROLE_MISMATCH');
  }
  if (composition.lifecycleProfileId !== lifecycle.profileId) {
    reasons.push('LIFECYCLE_PROFILE_MISMATCH');
  }
  if (composition.releaseStateBinding !== 'RELEASE_NOT_QUALIFIED') {
    reasons.push('RELEASE_STATE_BINDING_PROMOTED');
  }

  const productAdapterId = composition.registryEntry.composition.componentIds.productAdapter;
  const productExpected = ['LAFEA.1', 'LAFEA.2'].includes(template.entryStageId);
  if (productExpected !== (productAdapterId !== null)) {
    reasons.push('PRODUCT_ADAPTER_APPLICABILITY_MISMATCH');
  }

  if (binding) {
    if (binding.templateId !== template.templateId) {
      reasons.push('COMPILER_TEMPLATE_MISMATCH');
    }
    if (binding.entryStageId !== template.entryStageId) {
      reasons.push('COMPILER_STAGE_MISMATCH');
    }
    if (binding.requiredEnginePackage !== template.requiredEnginePackage) {
      reasons.push('COMPILER_ENGINE_PACKAGE_MISMATCH');
    }
    if (binding.requiredInputContractRole !== template.requiredInputContractRole) {
      reasons.push('COMPILER_INPUT_ROLE_MISMATCH');
    }
  }

  return Object.freeze({
    templateId: template.templateId,
    bucketId: template.bucketId,
    templateReleaseStatus: template.releaseStatus,
    entryStageId: template.entryStageId,
    stageEngineState: stage.engineState,
    compositionRootId: composition.compositionRootId,
    lifecycleProfileId: lifecycle.profileId,
    sourceSchema: LAFEA_SOURCE_AUTHORITY_SCHEMA,
    sourceContractRole: stage.inputContractRole,
    productAdapterId,
    compilerBindingStatus: binding?.status ?? null,
    authorityState: binding ? 'COMPILED_READY_CAPABILITY' : 'CATALOGUED',
    compatibilityStatus: reasons.length ? 'BLOCKED' : 'CURRENT',
    reasons: Object.freeze(reasons.sort()),
  });
});

const executableTemplateCount = LAFEA_APPLICATION_TEMPLATE_REGISTRY
  .filter((row) => ['CONDITIONAL', 'QUALIFIED'].includes(row.releaseStatus)).length;
const releaseQualifiedCount = LAFEA_APPLICATION_TEMPLATE_REGISTRY
  .filter((row) => row.releaseStatus === 'QUALIFIED').length;
const compilerCompatibilityFailures = compatibility
  .filter((row) => row.compilerBindingStatus !== null && row.reasons.length > 0);
const targetCompatibleCount = compatibility
  .filter((row) => row.compatibilityStatus === 'CURRENT').length;
const targetBlockedCount = compatibility.length - targetCompatibleCount;

assert.equal(executableTemplateCount, 0);
assert.equal(releaseQualifiedCount, 0);
assert.deepEqual(compilerCompatibilityFailures, []);
assert.equal(requireLafeaStageComposition('LAFEA.1').productSupported, true);
assert.equal(requireLafeaStageComposition('LAFEA.2').productSupported, true);
assert.equal(requireLafeaStageComposition('LAFEA.6').executionSupported, false);

const report = Object.freeze({
  schema: 'lafea-template-b0-current-main-requalification/v1',
  workPackage: 'B0_CURRENT_MAIN_REQUALIFICATION',
  status: 'PASS',
  exactHead,
  expectedHead,
  candidateBase,
  baseInCandidateAncestry: true,
  lastRetainedBucketPass: LAST_RETAINED_BUCKET_PASS,
  retainedPassInCandidateAncestry,
  retainedPassMergeBase: mergeBase,
  retainedPassDivergence: Object.freeze({ retainedOnly, candidateOnly }),
  trackedTreeClean,
  counts: Object.freeze({
    catalogued: LAFEA_APPLICATION_TEMPLATE_REGISTRY.length,
    compilerBoundCapabilities: bindings.size,
    targetCompatible: targetCompatibleCount,
    targetBlocked: targetBlockedCount,
    engineExecutable: executableTemplateCount,
    lifecycleReady: 0,
    resultReady: 0,
    releaseQualified: releaseQualifiedCount,
  }),
  authority: Object.freeze({
    historicalPassCurrentCertification: false,
    parameterValidationOnly: true,
    compilerHandoffOnly: true,
    t7cImportForEditingOnly: true,
    sourceAuthorityIssuedByTemplateLayer: false,
    engineExecutionAuthorized: false,
    lifecycleRegistrationAuthorized: false,
    resultBindingAuthorized: false,
    releasePromotionAuthorized: false,
    t7dAuthorized: false,
  }),
  currentTargetSchemas: Object.freeze({
    stageRegistry: LAFEA_STAGE_REGISTRY_SCHEMA,
    compositionRoot: LAFEA_STAGE_COMPOSITION_SCHEMA,
    lifecycleProfile: LAFEA_LIFECYCLE_PROFILE_SCHEMA,
    sourceAuthority: LAFEA_SOURCE_AUTHORITY_SCHEMA,
  }),
  compatibility: Object.freeze(compatibility),
  disposition: 'B0_CURRENT_MAIN_FOUNDATION_REQUALIFIED_NO_EXECUTION_AUTHORITY',
});

const outputPath = process.env.LAFEA_B0_REPORT_PATH;
if (outputPath) {
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report));

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function gitStatus(args) {
  try {
    execFileSync('git', args, { encoding: 'utf8', stdio: 'pipe' });
    return 0;
  } catch (error) {
    return error.status ?? 1;
  }
}
