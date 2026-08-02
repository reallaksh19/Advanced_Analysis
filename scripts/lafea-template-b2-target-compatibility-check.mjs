#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createTemplateReleaseRecordV2,
} from '../src/core/lafea-application-templates/release-record-v2.js';
import {
  createTemplateTargetAuthoritySnapshot,
  evaluateTemplateTargetCompatibility,
  validateTemplateTargetAuthoritySnapshot,
  validateTemplateTargetCompatibilityReceipt,
} from '../src/core/lafea-application-templates/target-compatibility.js';
import {
  createCurrentLafeaTargetAuthoritySnapshot,
} from '../src/workspace/lafea-target-compatibility-authority.js';

const FNV = 'fnv1a64:0123456789abcdef';
const SHA = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const HEAD = 'd623d07541f0af6e8d2abc320f9fd4faee6fccb4';
let negativeCount = 0;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const coreSource = fs.readFileSync(
  path.join(ROOT, 'src/core/lafea-application-templates/target-compatibility.js'),
  'utf8',
);
const adapterSource = fs.readFileSync(
  path.join(ROOT, 'src/workspace/lafea-target-compatibility-authority.js'),
  'utf8',
);
assert.doesNotMatch(coreSource, /from ['"][^'"]*workspace[^'"]*['"]/u);
for (const source of [coreSource, adapterSource]) {
  assert.doesNotMatch(source, /\bexecuteLafeaStage\s*\(/u);
  assert.doesNotMatch(source, /\bissueLafeaSourceAuthority\s*\(/u);
  assert.doesNotMatch(source, /\bcreateLafeaLifecycleProducerBatch\s*\(/u);
  assert.doesNotMatch(source, /\bregisterLafeaLifecycle\w*\s*\(/u);
  assert.doesNotMatch(source, /\bcreateLafeaAnalyticalProductBatch\s*\(/u);
  assert.doesNotMatch(source, /\bcalculateLocal(?:Attachment|Continuum|Shell)\w*\s*\(/u);
}

const snapshots = Object.fromEntries(
  ['LAFEA.1', 'LAFEA.2', 'LAFEA.3', 'LAFEA.6'].map((stageId) => {
    const snapshot = createCurrentLafeaTargetAuthoritySnapshot(stageId);
    assert.equal(validateTemplateTargetAuthoritySnapshot(snapshot).ok, true);
    return [stageId, snapshot];
  }),
);

const analyticalOne = releaseFor(snapshots['LAFEA.1'], 'ALG-LOAD-REFERENCE-TRANSFER');
const analyticalTwo = releaseFor(snapshots['LAFEA.2'], 'ALG-PIPE-SECTION-COMBINED');
const continuum = releaseFor(snapshots['LAFEA.3'], 'C2D-LUG-PINHOLE');

for (const [record, snapshot] of [
  [analyticalOne, snapshots['LAFEA.1']],
  [analyticalTwo, snapshots['LAFEA.2']],
  [continuum, snapshots['LAFEA.3']],
]) {
  const receipt = evaluateTemplateTargetCompatibility(record, snapshot);
  assert.equal(receipt.status, 'CURRENT');
  assert.deepEqual(receipt.reasons, []);
  assert.equal(validateTemplateTargetCompatibilityReceipt(receipt).ok, true);
  assert.equal(receipt.semanticHash.startsWith('sha256:'), true);
}

const unsupported = evaluateTemplateTargetCompatibility(
  releaseFor(snapshots['LAFEA.6'], 'ALG-WELD-GROUP-CIRCULAR'),
  snapshots['LAFEA.6'],
);
assert.equal(unsupported.status, 'BLOCKED');
assert.equal(unsupported.reasons.includes(
  'TARGET_STAGE_ROUTE_NOT_QUALIFIED:LAFEA.6',
), true);

stale('composition root', analyticalOne, snapshots['LAFEA.1'], (input) => {
  input.compositionRoot.compositionRootHash = SHA;
}, 'COMPOSITION_ROOT_HASH_CHANGED');
stale('lifecycle profile', analyticalOne, snapshots['LAFEA.1'], (input) => {
  input.lifecycleProfile.profileHash = SHA;
}, 'LIFECYCLE_PROFILE_HASH_CHANGED');
stale('source schema', analyticalOne, snapshots['LAFEA.1'], (input) => {
  input.sourceContract.sourceAuthoritySchema = 'lafea-source-authority/v2';
}, 'SOURCE_AUTHORITY_SCHEMA_CHANGED');
stale('unit target', analyticalOne, snapshots['LAFEA.1'], (input) => {
  input.unitProjection.targetUnitContractHash = SHA;
}, 'TARGET_UNIT_CONTRACT_CHANGED');
stale('product component', analyticalOne, snapshots['LAFEA.1'], (input) => {
  input.productAdapter.componentHash = SHA;
}, 'PRODUCT_ADAPTER_COMPONENT_CHANGED');
stale('benchmark binding', analyticalOne, snapshots['LAFEA.1'], (input) => {
  input.benchmarkBindings.manifestHashes[0] = SHA;
}, 'BENCHMARK_BINDING_HASHES_CHANGED');

const handoffMismatchInput = releaseInputFor(snapshots['LAFEA.1'], 'ALG-LOAD-REFERENCE-TRANSFER');
handoffMismatchInput.handoff.entryStageId = 'LAFEA.2';
const handoffMismatch = evaluateTemplateTargetCompatibility(
  createTemplateReleaseRecordV2(handoffMismatchInput),
  snapshots['LAFEA.1'],
);
assert.equal(handoffMismatch.status, 'STALE');
assert.equal(handoffMismatch.reasons.includes('HANDOFF_TARGET_STAGE_CHANGED'), true);

const missingSource = releaseInputFor(
  snapshots['LAFEA.1'],
  'ALG-LOAD-REFERENCE-TRANSFER',
);
missingSource.sourceAuthority.requiredSchema = null;
missingSource.sourceAuthority.requiredRole = null;
missingSource.sourceAuthority.canonicalizationProfile = null;
const missingSourceReceipt = evaluateTemplateTargetCompatibility(
  createTemplateReleaseRecordV2(missingSource), snapshots['LAFEA.1'],
);
assert.equal(missingSourceReceipt.status, 'BLOCKED');
assert.equal(missingSourceReceipt.reasons.includes(
  'SOURCE_AUTHORITY_REQUIREMENT_NOT_BOUND',
), true);

const missingProduct = releaseInputFor(
  snapshots['LAFEA.1'],
  'ALG-LOAD-REFERENCE-TRANSFER',
);
missingProduct.productAdapter.componentId = null;
missingProduct.productAdapter.componentHash = null;
missingProduct.productAdapter.productProfileHash = null;
const missingProductReceipt = evaluateTemplateTargetCompatibility(
  createTemplateReleaseRecordV2(missingProduct), snapshots['LAFEA.1'],
);
assert.equal(missingProductReceipt.status, 'BLOCKED');
assert.equal(missingProductReceipt.reasons.includes(
  'PRODUCT_ADAPTER_REQUIREMENT_NOT_BOUND',
), true);

const cataloguedInput = releaseInputFor(
  snapshots['LAFEA.1'],
  'ALG-LOAD-REFERENCE-TRANSFER',
);
cataloguedInput.compiler.bindingSchema = null;
cataloguedInput.compiler.bindingHash = null;
cataloguedInput.compiler.compilerVersion = null;
cataloguedInput.compiler.geometryCompilerId = null;
cataloguedInput.compiler.loadCompilerId = null;
cataloguedInput.compiler.boundaryCompilerId = null;
cataloguedInput.handoff.handoffSchema = null;
cataloguedInput.handoff.compilationHash = null;
cataloguedInput.handoff.handoffHash = null;
cataloguedInput.handoff.entryStageId = null;
cataloguedInput.handoff.stageSourceHash = null;
cataloguedInput.handoff.handoffStatus = null;
cataloguedInput.releaseState.authorityState = 'CATALOGUED';
const cataloguedReceipt = evaluateTemplateTargetCompatibility(
  createTemplateReleaseRecordV2(cataloguedInput), snapshots['LAFEA.1'],
);
assert.equal(cataloguedReceipt.status, 'BLOCKED');
assert.equal(cataloguedReceipt.reasons.includes(
  'RELEASE_RECORD_NOT_COMPILED_READY',
), true);

negative('snapshot extra key', () => {
  createTemplateTargetAuthoritySnapshot({
    ...snapshotInput(snapshots['LAFEA.1']),
    extra: true,
  });
});
negative('snapshot product evidence on N/A', () => {
  const input = snapshotInput(snapshots['LAFEA.3']);
  input.productAdapter.componentHash = SHA;
  createTemplateTargetAuthoritySnapshot(input);
});
negative('snapshot mesh authority on N/A', () => {
  const input = snapshotInput(snapshots['LAFEA.1']);
  input.meshRequirement.authoritySchema = 'unexpected';
  createTemplateTargetAuthoritySnapshot(input);
});
negative('snapshot benchmark cardinality', () => {
  const input = snapshotInput(snapshots['LAFEA.1']);
  input.benchmarkBindings.manifestHashes = [];
  createTemplateTargetAuthoritySnapshot(input);
});
negative('tampered snapshot hash', () => {
  validateSnapshotOrThrow({ ...snapshots['LAFEA.1'], semanticHash: SHA });
});
negative('tampered receipt hash', () => {
  const receipt = evaluateTemplateTargetCompatibility(
    analyticalOne, snapshots['LAFEA.1'],
  );
  validateReceiptOrThrow({ ...receipt, semanticHash: SHA });
});
negative('mutable snapshot', () => {
  const value = structuredClone(snapshots['LAFEA.1']);
  validateSnapshotOrThrow(value);
});
negative('mutable receipt', () => {
  const value = structuredClone(evaluateTemplateTargetCompatibility(
    analyticalOne, snapshots['LAFEA.1'],
  ));
  validateReceiptOrThrow(value);
});

console.log(JSON.stringify({
  schema: 'lafea-template-b2-target-compatibility-check/v1',
  status: 'PASS',
  currentStages: ['LAFEA.1', 'LAFEA.2', 'LAFEA.3'],
  unsupportedStage: unsupported.targetStage.stageId,
  staleCaseCount: 7,
  negativeTestCount: negativeCount,
  authority: {
    sourceIssuance: false,
    engineExecution: false,
    lifecycleRegistration: false,
    resultBinding: false,
    productEvidenceCreation: false,
    releasePromotion: false,
    t7dAuthorized: false,
  },
}));

function releaseFor(snapshot, templateId) {
  return createTemplateReleaseRecordV2(releaseInputFor(snapshot, templateId));
}

function releaseInputFor(snapshot, templateId) {
  const product = snapshot.productAdapter.applicability === 'REQUIRED'
    ? {
        applicability: 'REQUIRED',
        componentId: snapshot.productAdapter.componentId,
        componentHash: snapshot.productAdapter.componentHash,
        productProfileHash: snapshot.productAdapter.productProfileHash,
        productEvidenceHash: null,
        productQualification: null,
      }
    : {
        applicability: 'NOT_APPLICABLE', componentId: null,
        componentHash: null, productProfileHash: null,
        productEvidenceHash: null, productQualification: null,
      };
  const mesh = snapshot.meshRequirement.applicability === 'REQUIRED'
    ? {
        applicability: 'REQUIRED',
        authoritySchema: snapshot.meshRequirement.authoritySchema,
        authorityRole: snapshot.meshRequirement.authorityRole,
        authorityStatus: snapshot.meshRequirement.requiredStatus,
        authorityHash: null, sourceHash: null, canonicalModelHash: null,
        analysisGeometryHash: null, meshProfileHash: null, meshHash: null,
        qualityEvidenceHash: null,
      }
    : {
        applicability: 'NOT_APPLICABLE', authoritySchema: null,
        authorityRole: null, authorityStatus: null, authorityHash: null,
        sourceHash: null, canonicalModelHash: null, analysisGeometryHash: null,
        meshProfileHash: null, meshHash: null, qualityEvidenceHash: null,
      };
  const recovery = snapshot.lifecycleProfile.recoveryApplicable
    ? {
        applicability: 'REQUIRED', recoveryProfileHash: null,
        recoveryEvidenceHash: null, convergenceProfileHash: null,
        convergenceEvidenceHash: null,
      }
    : {
        applicability: 'NOT_APPLICABLE', recoveryProfileHash: null,
        recoveryEvidenceHash: null, convergenceProfileHash: null,
        convergenceEvidenceHash: null,
      };
  return {
    recordId: `LAFEA.RELEASE.${templateId}/V2`,
    candidateHeadSha: HEAD,
    template: {
      templateId, templateRevision: 1, templateSemanticHash: FNV,
      templateRegistryHash: FNV, bucketId: 'B2_TEST_BUCKET',
    },
    parameterSchema: { schemaId: `${templateId}.PARAMETERS/V1`, schemaHash: FNV },
    parameterSet: {
      applicability: 'REQUIRED', parameterSetHash: FNV,
      validationResultHash: FNV,
    },
    compiler: {
      applicability: 'REQUIRED', bindingSchema: 'lafea-template-compiler-binding/v1',
      bindingHash: FNV, compilerVersion: '1', geometryCompilerId: 'GEOMETRY',
      loadCompilerId: 'LOAD', boundaryCompilerId: 'BOUNDARY',
      meshRequestCompilerId: snapshot.meshRequirement.applicability === 'REQUIRED'
        ? 'MESH_REQUEST' : null,
    },
    handoff: {
      applicability: 'REQUIRED', handoffSchema: 'lafea-template-handoff/v1',
      compilationHash: FNV, handoffHash: FNV,
      entryStageId: snapshot.targetStage.stageId, stageSourceHash: FNV,
      handoffStatus: 'READY',
    },
    targetStage: {
      registrySchema: snapshot.targetStage.registrySchema,
      stageId: snapshot.targetStage.stageId,
      stageEntryHash: snapshot.targetStage.registryEntryHash,
      engineState: snapshot.targetStage.engineState,
      enginePackage: snapshot.targetStage.enginePackage,
      stageAuthority: snapshot.targetStage.stageAuthority,
      inputContractRole: snapshot.targetStage.inputContractRole,
      resultContractRole: snapshot.targetStage.resultContractRole,
    },
    compositionRoot: {
      compositionSchema: snapshot.compositionRoot.compositionSchema,
      compositionRootId: snapshot.compositionRoot.compositionRootId,
      compositionRootHash: snapshot.compositionRoot.compositionRootHash,
      componentIdsHash: snapshot.compositionRoot.componentIdsHash,
      releaseStateBinding: snapshot.compositionRoot.releaseStateBinding,
      compatibilityReceiptHash: null,
    },
    lifecycleProfile: { ...snapshot.lifecycleProfile },
    sourceAuthority: {
      applicability: 'REQUIRED',
      requiredSchema: snapshot.sourceContract.sourceAuthoritySchema,
      requiredRole: snapshot.sourceContract.sourceAuthorityRole,
      authorityHash: null, sourceHash: null,
      canonicalizationProfile: snapshot.sourceContract.canonicalizationProfile,
      documentRevisionDigest: null, originRef: null,
    },
    unitProjection: {
      sourceUnitContractHash: FNV, handoffUnitContractHash: FNV,
      targetUnitContractHash: snapshot.unitProjection.targetUnitContractHash,
      projectionProfileHash: FNV,
    },
    meshAuthority: mesh,
    recoveryAuthority: recovery,
    benchmarkManifests: {
      bindingState: snapshot.benchmarkBindings.bindingState,
      manifestIds: [...snapshot.benchmarkBindings.manifestIds],
      manifestHashes: [...snapshot.benchmarkBindings.manifestHashes],
      expectedResultHashes: [], benchmarkResultHashes: [],
      independentEvidenceBasisHashes: [],
    },
    productAdapter: product,
    executionEvidence: {
      applicability: 'REQUIRED', requestHash: null, receiptHash: null,
      stageExecutionEvidenceHash: null, lifecycleProducerBatchHash: null,
      resultEvidenceHash: null, calculationAccepted: false, resultReady: false,
      assessmentReady: false, codeReady: false,
    },
    qualificationEvidence: {
      exactHeadArtifactHash: null, buildEvidenceHash: null,
      browserEvidenceHash: null, performanceEvidenceHash: null,
      accessibilityEvidenceHash: null, independentReviewHash: null,
      repositoryIntegrationEvidenceHash: null,
    },
    releaseState: {
      authorityState: 'COMPILED_READY', validity: 'BLOCKED',
      releaseQualified: false, blockedReasons: ['COMPATIBILITY_RECEIPT_REQUIRED'],
    },
    diagnostics: [],
  };
}

function stale(label, record, snapshot, mutate, expectedReason) {
  const input = snapshotInput(snapshot);
  mutate(input);
  const changed = createTemplateTargetAuthoritySnapshot(input);
  const receipt = evaluateTemplateTargetCompatibility(record, changed);
  assert.equal(receipt.status, 'STALE', label);
  assert.equal(receipt.reasons.includes(expectedReason), true, label);
}

function snapshotInput(snapshot) {
  const input = structuredClone(snapshot);
  delete input.schema;
  delete input.semanticHash;
  return input;
}

function validateSnapshotOrThrow(value) {
  const result = validateTemplateTargetAuthoritySnapshot(value);
  if (!result.ok) throw new Error(result.errors.join(' '));
}

function validateReceiptOrThrow(value) {
  const result = validateTemplateTargetCompatibilityReceipt(value);
  if (!result.ok) throw new Error(result.errors.join(' '));
}

function negative(label, callback) {
  assert.throws(callback, undefined, label);
  negativeCount += 1;
}
