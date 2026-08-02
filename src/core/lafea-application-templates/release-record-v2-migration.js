import {
  createTemplateReleaseRecordV2,
} from './release-record-v2.js';

const V1_SCHEMA = 'lafea-template-release-record/v1';
const V1_KEYS = Object.freeze([
  'schema',
  'templateId',
  'templateSemanticHash',
  'parentRegistryHash',
  'exactHeadSha',
  'benchmarkManifestHash',
  'benchmarkQualificationStatus',
  'releaseStatus',
  'executable',
  'limitations',
  'diagnostics',
  'semanticHash',
]);
const CONTEXT_KEYS = Object.freeze([
  'recordId',
  'templateRevision',
  'bucketId',
  'parameterSchemaId',
  'parameterSchemaHash',
  'benchmarkManifestId',
  'templateClass',
  'targetStage',
  'compositionRoot',
  'lifecycleProfile',
  'unitProjection',
]);

/**
 * Migrates a legacy blocked record without manufacturing v2 evidence.
 *
 * The migration always lands at CATALOGUED/BLOCKED. Legacy compiler,
 * executable or qualification text is retained only as diagnostics. Higher
 * v2 states require new receipts through the ordinary transition path.
 */
export function migrateTemplateReleaseRecordV1ToV2(legacyRecord, context) {
  exactKeys(legacyRecord, V1_KEYS, 'Legacy release record');
  exactKeys(context, CONTEXT_KEYS, 'Release migration context');
  if (legacyRecord.schema !== V1_SCHEMA) {
    throw new TypeError('Legacy release record schema is invalid.');
  }
  if (!['ANALYTICAL', 'FEA'].includes(context.templateClass)) {
    throw new TypeError('templateClass must be ANALYTICAL or FEA.');
  }

  const analytical = context.templateClass === 'ANALYTICAL';
  const diagnostics = uniqueStrings([
    'MIGRATED_V1_NO_V2_EVIDENCE',
    `LEGACY_RELEASE_STATUS:${legacyRecord.releaseStatus}`,
    `LEGACY_BENCHMARK_STATUS:${legacyRecord.benchmarkQualificationStatus}`,
    ...(legacyRecord.executable ? ['LEGACY_EXECUTABLE_CLAIM_IGNORED'] : []),
    ...legacyRecord.limitations.map((entry) => `LEGACY_LIMITATION:${entry}`),
    ...legacyRecord.diagnostics.map((entry) => `LEGACY_DIAGNOSTIC:${entry}`),
  ]);

  return createTemplateReleaseRecordV2({
    recordId: context.recordId,
    candidateHeadSha: legacyRecord.exactHeadSha,
    template: {
      templateId: legacyRecord.templateId,
      templateRevision: context.templateRevision,
      templateSemanticHash: legacyRecord.templateSemanticHash,
      templateRegistryHash: legacyRecord.parentRegistryHash,
      bucketId: context.bucketId,
    },
    parameterSchema: {
      schemaId: context.parameterSchemaId,
      schemaHash: context.parameterSchemaHash,
    },
    parameterSet: requiredNulls(['parameterSetHash', 'validationResultHash']),
    compiler: {
      applicability: 'REQUIRED',
      bindingSchema: null,
      bindingHash: null,
      compilerVersion: null,
      geometryCompilerId: null,
      loadCompilerId: null,
      boundaryCompilerId: null,
      meshRequestCompilerId: null,
    },
    handoff: {
      applicability: 'REQUIRED',
      handoffSchema: null,
      compilationHash: null,
      handoffHash: null,
      entryStageId: null,
      stageSourceHash: null,
      handoffStatus: null,
    },
    targetStage: context.targetStage,
    compositionRoot: {
      ...context.compositionRoot,
      compatibilityReceiptHash: null,
    },
    lifecycleProfile: context.lifecycleProfile,
    sourceAuthority: {
      applicability: 'REQUIRED',
      requiredSchema: null,
      requiredRole: null,
      authorityHash: null,
      sourceHash: null,
      canonicalizationProfile: null,
      documentRevisionDigest: null,
      originRef: null,
    },
    unitProjection: context.unitProjection,
    meshAuthority: analytical
      ? notApplicableMesh()
      : requiredMesh(),
    recoveryAuthority: analytical
      ? notApplicableRecovery()
      : requiredRecovery(),
    benchmarkManifests: {
      bindingState: 'LEGACY_UNVERIFIED',
      manifestIds: [context.benchmarkManifestId],
      manifestHashes: [legacyRecord.benchmarkManifestHash],
      expectedResultHashes: [],
      benchmarkResultHashes: [],
      independentEvidenceBasisHashes: [],
    },
    productAdapter: analytical
      ? requiredProduct()
      : notApplicableProduct(),
    executionEvidence: {
      applicability: 'REQUIRED',
      requestHash: null,
      receiptHash: null,
      stageExecutionEvidenceHash: null,
      lifecycleProducerBatchHash: null,
      resultEvidenceHash: null,
      calculationAccepted: false,
      resultReady: false,
      assessmentReady: false,
      codeReady: false,
    },
    qualificationEvidence: {
      exactHeadArtifactHash: null,
      buildEvidenceHash: null,
      browserEvidenceHash: null,
      performanceEvidenceHash: null,
      accessibilityEvidenceHash: null,
      independentReviewHash: null,
      repositoryIntegrationEvidenceHash: null,
    },
    releaseState: {
      authorityState: 'CATALOGUED',
      validity: 'BLOCKED',
      releaseQualified: false,
      blockedReasons: [
        'V2_COMPILER_EVIDENCE_REQUIRED',
        'V2_HANDOFF_EVIDENCE_REQUIRED',
        'V2_COMPATIBILITY_RECEIPT_REQUIRED',
        'V2_EXECUTION_EVIDENCE_REQUIRED',
        'V2_QUALIFICATION_EVIDENCE_REQUIRED',
      ],
    },
    diagnostics,
  });
}

function requiredNulls(keys) {
  return Object.fromEntries([
    ['applicability', 'REQUIRED'],
    ...keys.map((key) => [key, null]),
  ]);
}

function requiredMesh() {
  return {
    applicability: 'REQUIRED',
    authoritySchema: null,
    authorityRole: null,
    authorityStatus: null,
    authorityHash: null,
    sourceHash: null,
    canonicalModelHash: null,
    analysisGeometryHash: null,
    meshProfileHash: null,
    meshHash: null,
    qualityEvidenceHash: null,
  };
}

function notApplicableMesh() {
  return { ...requiredMesh(), applicability: 'NOT_APPLICABLE' };
}

function requiredRecovery() {
  return {
    applicability: 'REQUIRED',
    recoveryProfileHash: null,
    recoveryEvidenceHash: null,
    convergenceProfileHash: null,
    convergenceEvidenceHash: null,
  };
}

function notApplicableRecovery() {
  return { ...requiredRecovery(), applicability: 'NOT_APPLICABLE' };
}

function requiredProduct() {
  return {
    applicability: 'REQUIRED',
    componentId: null,
    componentHash: null,
    productProfileHash: null,
    productEvidenceHash: null,
    productQualification: null,
  };
}

function notApplicableProduct() {
  return { ...requiredProduct(), applicability: 'NOT_APPLICABLE' };
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new TypeError(`${label} exact-key contract mismatch.`);
  }
}

function uniqueStrings(values) {
  return [...new Set(values)].sort();
}
