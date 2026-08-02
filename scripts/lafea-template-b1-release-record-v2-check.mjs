#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAFEA_TEMPLATE_AUTHORITY_STATES,
  assertTemplateReleaseTransition,
  classifyTemplateReleaseInvalidation,
  createTemplateReleaseRecordV2,
  validateTemplateReleaseRecordV2,
} from '../src/core/lafea-application-templates/release-record-v2.js';
import { migrateTemplateReleaseRecordV1ToV2 } from '../src/core/lafea-application-templates/release-record-v2-migration.js';

const FNV = 'fnv1a64:0123456789abcdef';
const SHA = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const HEAD = '8c8f0f5937afc53d546ee3d554bda2b4b7ccafd8';
negative.count = 0;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMPLEMENTATION_FILES = [
  'src/core/lafea-application-templates/release-record-v2-hash.js',
  'src/core/lafea-application-templates/release-record-v2.js',
  'src/core/lafea-application-templates/release-record-v2-migration.js',
];
for (const relativePath of IMPLEMENTATION_FILES) {
  const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  assert.doesNotMatch(source, /from ['"][^'"]*workspace[^'"]*['"]/u);
  assert.doesNotMatch(source, /\bexecuteLafeaStage\s*\(/u);
  assert.doesNotMatch(source, /\bissueLafeaSourceAuthority\s*\(/u);
  assert.doesNotMatch(source, /\bregisterLafeaLifecycle\w*\s*\(/u);
  assert.doesNotMatch(source, /\bcalculateLocal(?:Attachment|Continuum|Shell)\w*\s*\(/u);
}

const catalogued = createTemplateReleaseRecordV2(baseInput());
assert.equal(validateTemplateReleaseRecordV2(catalogued).ok, true);
assert.equal(catalogued.releaseState.authorityState, 'CATALOGUED');
assert.equal(catalogued.releaseState.releaseQualified, false);
assert.equal(Object.isFrozen(catalogued.template), true);
assert.match(catalogued.semanticHash, /^sha256:[0-9a-f]{64}$/u);
assert.match(catalogued.evidenceHash, /^sha256:[0-9a-f]{64}$/u);

const states = [catalogued];
states.push(next(states.at(-1), 'PARAMETER_VALID', (input) => {
  input.parameterSet.parameterSetHash = FNV;
  input.parameterSet.validationResultHash = FNV;
}));
states.push(next(states.at(-1), 'COMPILED_READY', (input) => {
  Object.assign(input.compiler, {
    bindingSchema: 'lafea-template-compiler-binding/v1',
    bindingHash: FNV,
    compilerVersion: '1',
    geometryCompilerId: 'GEOM-1',
    loadCompilerId: 'LOAD-1',
    boundaryCompilerId: 'BOUNDARY-1',
  });
  Object.assign(input.handoff, {
    handoffSchema: 'lafea-template-handoff/v1',
    compilationHash: FNV,
    handoffHash: FNV,
    entryStageId: 'LAFEA.1',
    stageSourceHash: FNV,
    handoffStatus: 'READY',
  });
}));
states.push(next(states.at(-1), 'IMPORTED_FOR_EDITING', (input) => {
  input.handoff.handoffStatus = 'IMPORTED_FOR_EDITING';
}));
states.push(next(states.at(-1), 'ENGINE_EXECUTABLE', (input) => {
  input.compositionRoot.compatibilityReceiptHash = SHA;
  Object.assign(input.productAdapter, {
    componentId: 'LAFEA.COMPONENT.PRODUCT.ATTACHMENT_FOUNDATION/V1',
    componentHash: SHA,
    productProfileHash: SHA,
  });
  input.releaseState.validity = 'CURRENT';
}));
states.push(next(states.at(-1), 'LIFECYCLE_READY', (input) => {
  Object.assign(input.sourceAuthority, {
    requiredSchema: 'lafea-source-authority/v1',
    requiredRole: 'STAGE_SOURCE_AUTHORITY',
    authorityHash: SHA,
    sourceHash: SHA,
    canonicalizationProfile: 'LAFEA_CANONICAL_JSON_SHA256_V1',
    documentRevisionDigest: FNV,
    originRef: 'test',
  });
  Object.assign(input.executionEvidence, {
    requestHash: SHA,
    receiptHash: SHA,
    stageExecutionEvidenceHash: SHA,
    lifecycleProducerBatchHash: SHA,
    calculationAccepted: true,
  });
}));
states.push(next(states.at(-1), 'RESULT_READY', (input) => {
  input.executionEvidence.resultEvidenceHash = SHA;
  input.executionEvidence.resultReady = true;
  input.productAdapter.productEvidenceHash = SHA;
  input.productAdapter.productQualification = 'PASS';
}));
states.push(next(states.at(-1), 'RELEASE_QUALIFIED', (input) => {
  input.benchmarkManifests.benchmarkResultHashes = [SHA];
  input.benchmarkManifests.independentEvidenceBasisHashes = [SHA];
  Object.keys(input.qualificationEvidence).forEach((key) => {
    input.qualificationEvidence[key] = SHA;
  });
  input.releaseState.validity = 'CURRENT';
  input.releaseState.releaseQualified = true;
  input.releaseState.blockedReasons = [];
}));
assert.deepEqual(states.map((row) => row.releaseState.authorityState), LAFEA_TEMPLATE_AUTHORITY_STATES);
states.forEach((row) => assert.equal(validateTemplateReleaseRecordV2(row).ok, true));

for (let index = 0; index < LAFEA_TEMPLATE_AUTHORITY_STATES.length - 1; index += 1) {
  assert.equal(assertTemplateReleaseTransition(
    LAFEA_TEMPLATE_AUTHORITY_STATES[index],
    LAFEA_TEMPLATE_AUTHORITY_STATES[index + 1],
  ), true);
}
assert.throws(() => assertTemplateReleaseTransition('CATALOGUED', 'COMPILED_READY'), /Forbidden/u);
assert.throws(() => assertTemplateReleaseTransition('RESULT_READY', 'RESULT_READY'), /Forbidden/u);
assert.throws(() => assertTemplateReleaseTransition('RESULT_READY', 'LIFECYCLE_READY'), /Forbidden/u);

const parameterInvalidation = classifyTemplateReleaseInvalidation('PARAMETER_VALUE');
assert.equal(parameterInvalidation.earliestSurvivingState, 'PARAMETER_VALID');
assert.equal(parameterInvalidation.qualificationRevoked, true);
assert.equal(classifyTemplateReleaseInvalidation('MESH').earliestSurvivingState, 'LIFECYCLE_READY');
assert.equal(classifyTemplateReleaseInvalidation('BENCHMARK_EXPECTED_VALUE').earliestSurvivingState, 'RESULT_READY');
assert.throws(() => classifyTemplateReleaseInvalidation('UNKNOWN'), /Unknown/u);

const changedEvidence = baseInput();
changedEvidence.candidateHeadSha = '1111111111111111111111111111111111111111';
changedEvidence.qualificationEvidence.buildEvidenceHash = SHA;
const evidenceVariant = createTemplateReleaseRecordV2(changedEvidence);
assert.equal(evidenceVariant.semanticHash, catalogued.semanticHash);
assert.notEqual(evidenceVariant.evidenceHash, catalogued.evidenceHash);

const feaResult = createTemplateReleaseRecordV2(feaResultReadyInput());
assert.equal(feaResult.releaseState.authorityState, 'RESULT_READY');
assert.equal(validateTemplateReleaseRecordV2(feaResult).ok, true);

negative('unknown top-level key', () => createTemplateReleaseRecordV2({ ...baseInput(), extra: true }));
negative('missing top-level key', () => {
  const input = baseInput();
  delete input.template;
  createTemplateReleaseRecordV2(input);
});
negative('not-applicable mesh evidence', () => {
  const input = baseInput();
  input.meshAuthority.meshHash = SHA;
  createTemplateReleaseRecordV2(input);
});
negative('early release qualification', () => {
  const input = baseInput();
  input.releaseState.releaseQualified = true;
  createTemplateReleaseRecordV2(input);
});
negative('compiled without binding', () => {
  const input = baseInput();
  input.parameterSet.parameterSetHash = FNV;
  input.parameterSet.validationResultHash = FNV;
  input.releaseState.authorityState = 'COMPILED_READY';
  createTemplateReleaseRecordV2(input);
});
negative('engine executable without compatibility', () => {
  const input = toInput(states[3]);
  input.releaseState.authorityState = 'ENGINE_EXECUTABLE';
  input.releaseState.validity = 'CURRENT';
  createTemplateReleaseRecordV2(input);
});
negative('lifecycle without source authority', () => {
  const input = toInput(states[4]);
  input.releaseState.authorityState = 'LIFECYCLE_READY';
  createTemplateReleaseRecordV2(input);
});
negative('result without resultReady', () => {
  const input = toInput(states[5]);
  input.releaseState.authorityState = 'RESULT_READY';
  input.executionEvidence.resultEvidenceHash = SHA;
  input.productAdapter.productEvidenceHash = SHA;
  createTemplateReleaseRecordV2(input);
});
negative('release with blockers', () => {
  const input = toInput(states[6]);
  input.releaseState.authorityState = 'RELEASE_QUALIFIED';
  input.releaseState.releaseQualified = true;
  createTemplateReleaseRecordV2(input);
});
negative('duplicate benchmark ids', () => {
  const input = baseInput();
  input.benchmarkManifests.manifestIds = ['A', 'A'];
  createTemplateReleaseRecordV2(input);
});
negative('tampered semantic hash', () => validateOrThrow({ ...catalogued, semanticHash: SHA }));
negative('tampered evidence hash', () => validateOrThrow({ ...catalogued, evidenceHash: SHA }));
negative('FEA result without recovery', () => {
  const input = feaResultReadyInput();
  input.recoveryAuthority.recoveryEvidenceHash = null;
  createTemplateReleaseRecordV2(input);
});
negative('release without independent benchmark', () => {
  const input = toInput(states[6]);
  Object.keys(input.qualificationEvidence).forEach((key) => { input.qualificationEvidence[key] = SHA; });
  input.releaseState.authorityState = 'RELEASE_QUALIFIED';
  input.releaseState.releaseQualified = true;
  input.releaseState.blockedReasons = [];
  createTemplateReleaseRecordV2(input);
});

const migrated = migrateTemplateReleaseRecordV1ToV2(legacyRecord(), migrationContext());
assert.equal(migrated.releaseState.authorityState, 'CATALOGUED');
assert.equal(migrated.releaseState.validity, 'BLOCKED');
assert.equal(migrated.releaseState.releaseQualified, false);
assert.equal(migrated.executionEvidence.calculationAccepted, false);
assert.equal(migrated.diagnostics.includes('LEGACY_EXECUTABLE_CLAIM_IGNORED'), true);
assert.equal(validateTemplateReleaseRecordV2(migrated).ok, true);

console.log(JSON.stringify({
  schema: 'lafea-template-b1-release-record-v2-check/v1',
  status: 'PASS',
  authorityStates: LAFEA_TEMPLATE_AUTHORITY_STATES,
  positiveStateCount: states.length,
  negativeTestCount: negative.count,
  migrationState: migrated.releaseState.authorityState,
  authority: {
    engineExecution: false,
    sourceIssuance: false,
    lifecycleRegistration: false,
    resultBinding: false,
    releasePromotion: false,
    t7dAuthorized: false,
  },
}));

function next(record, authorityState, mutate) {
  const input = toInput(record);
  mutate(input);
  input.releaseState.authorityState = authorityState;
  return createTemplateReleaseRecordV2(input);
}

function toInput(record) {
  const copy = structuredClone(record);
  delete copy.schema;
  delete copy.hashProfile;
  delete copy.semanticHash;
  delete copy.evidenceHash;
  return copy;
}

function baseInput() {
  return {
    recordId: 'LAFEA.RELEASE.ALG-LOAD-REFERENCE-TRANSFER/V2',
    candidateHeadSha: HEAD,
    template: {
      templateId: 'ALG-LOAD-REFERENCE-TRANSFER',
      templateRevision: 1,
      templateSemanticHash: FNV,
      templateRegistryHash: FNV,
      bucketId: 'ANALYTICAL_ENGINEERING',
    },
    parameterSchema: { schemaId: 'ALG-LOAD-REFERENCE-TRANSFER.PARAMETERS/V1', schemaHash: FNV },
    parameterSet: { applicability: 'REQUIRED', parameterSetHash: null, validationResultHash: null },
    compiler: {
      applicability: 'REQUIRED', bindingSchema: null, bindingHash: null,
      compilerVersion: null, geometryCompilerId: null, loadCompilerId: null,
      boundaryCompilerId: null, meshRequestCompilerId: null,
    },
    handoff: {
      applicability: 'REQUIRED', handoffSchema: null, compilationHash: null,
      handoffHash: null, entryStageId: null, stageSourceHash: null, handoffStatus: null,
    },
    targetStage: {
      registrySchema: 'lafea-stage-registry/v2', stageId: 'LAFEA.1', stageEntryHash: FNV,
      engineState: 'QUALIFIED_ROUTE_REGISTERED', enginePackage: 'local-attachment-foundation',
      stageAuthority: 'ATTACHMENT_FOUNDATION', inputContractRole: 'ATTACHMENT_INPUT',
      resultContractRole: 'ATTACHMENT_RESULT',
    },
    compositionRoot: {
      compositionSchema: 'lafea-stage-composition/v2',
      compositionRootId: 'LAFEA.COMPOSITION.ATTACHMENT_FOUNDATION/V1',
      compositionRootHash: SHA, componentIdsHash: SHA,
      releaseStateBinding: 'RELEASE_NOT_QUALIFIED', compatibilityReceiptHash: null,
    },
    lifecycleProfile: {
      profileSchema: 'lafea-lifecycle-profile/v1', profileId: 'ANALYTICAL_FOUNDATION_V1',
      profileHash: SHA, artifactKindsHash: SHA, resultRequiredKindsHash: SHA,
      assessmentRequiredKindsHash: SHA, meshApplicable: false, recoveryApplicable: false,
      convergenceApplicable: false, codeAssessmentApplicable: false,
    },
    sourceAuthority: {
      applicability: 'REQUIRED', requiredSchema: null, requiredRole: null,
      authorityHash: null, sourceHash: null, canonicalizationProfile: null,
      documentRevisionDigest: null, originRef: null,
    },
    unitProjection: {
      sourceUnitContractHash: FNV, handoffUnitContractHash: FNV,
      targetUnitContractHash: FNV, projectionProfileHash: FNV,
    },
    meshAuthority: {
      applicability: 'NOT_APPLICABLE', authoritySchema: null, authorityRole: null,
      authorityStatus: null, authorityHash: null, sourceHash: null,
      canonicalModelHash: null, analysisGeometryHash: null, meshProfileHash: null,
      meshHash: null, qualityEvidenceHash: null,
    },
    recoveryAuthority: {
      applicability: 'NOT_APPLICABLE', recoveryProfileHash: null,
      recoveryEvidenceHash: null, convergenceProfileHash: null,
      convergenceEvidenceHash: null,
    },
    benchmarkManifests: {
      bindingState: 'CURRENT', manifestIds: ['ALG-LOAD-REFERENCE-TRANSFER.BENCHMARKS/V1'],
      manifestHashes: [FNV], expectedResultHashes: [FNV],
      benchmarkResultHashes: [], independentEvidenceBasisHashes: [],
    },
    productAdapter: {
      applicability: 'REQUIRED', componentId: null, componentHash: null,
      productProfileHash: null, productEvidenceHash: null, productQualification: null,
    },
    executionEvidence: {
      applicability: 'REQUIRED', requestHash: null, receiptHash: null,
      stageExecutionEvidenceHash: null, lifecycleProducerBatchHash: null,
      resultEvidenceHash: null, calculationAccepted: false, resultReady: false,
      assessmentReady: false, codeReady: false,
    },
    qualificationEvidence: {
      exactHeadArtifactHash: null, buildEvidenceHash: null, browserEvidenceHash: null,
      performanceEvidenceHash: null, accessibilityEvidenceHash: null,
      independentReviewHash: null, repositoryIntegrationEvidenceHash: null,
    },
    releaseState: {
      authorityState: 'CATALOGUED', validity: 'BLOCKED', releaseQualified: false,
      blockedReasons: ['V2_EVIDENCE_NOT_AVAILABLE'],
    },
    diagnostics: [],
  };
}

function feaResultReadyInput() {
  const input = toInput(states[6]);
  input.recordId = 'LAFEA.RELEASE.C2D-LUG-PINHOLE/V2';
  input.template = {
    templateId: 'C2D-LUG-PINHOLE', templateRevision: 1,
    templateSemanticHash: FNV, templateRegistryHash: FNV,
    bucketId: 'CONTINUUM_2D_FEA',
  };
  input.targetStage.stageId = 'LAFEA.3';
  input.meshAuthority = {
    applicability: 'REQUIRED', authoritySchema: 'lafea-analysis-mesh-authority/v1',
    authorityRole: 'STAGE_AUTHORIZED_ANALYSIS_MESH',
    authorityStatus: 'ACCEPTED_BY_STAGE_CONTRACT', authorityHash: SHA,
    sourceHash: SHA, canonicalModelHash: SHA, analysisGeometryHash: SHA,
    meshProfileHash: SHA, meshHash: SHA, qualityEvidenceHash: SHA,
  };
  input.recoveryAuthority = {
    applicability: 'REQUIRED', recoveryProfileHash: SHA,
    recoveryEvidenceHash: SHA, convergenceProfileHash: SHA,
    convergenceEvidenceHash: null,
  };
  input.productAdapter = {
    applicability: 'NOT_APPLICABLE', componentId: null, componentHash: null,
    productProfileHash: null, productEvidenceHash: null, productQualification: null,
  };
  input.lifecycleProfile.meshApplicable = true;
  input.lifecycleProfile.recoveryApplicable = true;
  input.lifecycleProfile.convergenceApplicable = true;
  input.releaseState.authorityState = 'RESULT_READY';
  input.releaseState.releaseQualified = false;
  input.releaseState.blockedReasons = ['CONVERGENCE_REQUIRED'];
  return input;
}

function legacyRecord() {
  return {
    schema: 'lafea-template-release-record/v1',
    templateId: 'ALG-LOAD-REFERENCE-TRANSFER',
    templateSemanticHash: FNV,
    parentRegistryHash: FNV,
    exactHeadSha: HEAD,
    benchmarkManifestHash: FNV,
    benchmarkQualificationStatus: 'QUALIFIED',
    releaseStatus: 'QUALIFIED',
    executable: true,
    limitations: ['legacy limitation'],
    diagnostics: ['legacy diagnostic'],
    semanticHash: FNV,
  };
}

function migrationContext() {
  const input = baseInput();
  return {
    recordId: input.recordId,
    templateRevision: input.template.templateRevision,
    bucketId: input.template.bucketId,
    parameterSchemaId: input.parameterSchema.schemaId,
    parameterSchemaHash: input.parameterSchema.schemaHash,
    benchmarkManifestId: input.benchmarkManifests.manifestIds[0],
    templateClass: 'ANALYTICAL',
    targetStage: input.targetStage,
    compositionRoot: {
      compositionSchema: input.compositionRoot.compositionSchema,
      compositionRootId: input.compositionRoot.compositionRootId,
      compositionRootHash: input.compositionRoot.compositionRootHash,
      componentIdsHash: input.compositionRoot.componentIdsHash,
      releaseStateBinding: input.compositionRoot.releaseStateBinding,
    },
    lifecycleProfile: input.lifecycleProfile,
    unitProjection: input.unitProjection,
  };
}

function validateOrThrow(value) {
  const validation = validateTemplateReleaseRecordV2(value);
  if (!validation.ok) throw new Error(validation.errors.join(' '));
}

function negative(label, callback) {
  assert.throws(callback, undefined, label);
  negative.count += 1;
}
