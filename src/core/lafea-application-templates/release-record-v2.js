import {
  LAFEA_TEMPLATE_RELEASE_HASH_PROFILE,
  templateReleaseSha256,
} from './release-record-v2-hash.js';

export const LAFEA_TEMPLATE_RELEASE_RECORD_V2_SCHEMA = 'lafea-template-release-record/v2';
export const LAFEA_TEMPLATE_AUTHORITY_STATES = Object.freeze([
  'CATALOGUED',
  'PARAMETER_VALID',
  'COMPILED_READY',
  'IMPORTED_FOR_EDITING',
  'ENGINE_EXECUTABLE',
  'LIFECYCLE_READY',
  'RESULT_READY',
  'RELEASE_QUALIFIED',
]);
export const LAFEA_TEMPLATE_RECORD_VALIDITIES = Object.freeze([
  'CURRENT',
  'STALE',
  'BLOCKED',
  'FAILED',
]);
export const LAFEA_TEMPLATE_APPLICABILITY = Object.freeze([
  'REQUIRED',
  'NOT_APPLICABLE',
]);
export const LAFEA_TEMPLATE_CHANGE_KINDS = Object.freeze([
  'PARAMETER_VALUE',
  'PARAMETER_SCHEMA',
  'COMPILER',
  'UNIT_PROJECTION',
  'TARGET_STAGE',
  'COMPOSITION_ROOT',
  'LIFECYCLE_PROFILE',
  'PRODUCT_ADAPTER',
  'SOURCE',
  'MESH',
  'RECOVERY',
  'BENCHMARK_IMPLEMENTATION',
  'BENCHMARK_EXPECTED_VALUE',
  'CANDIDATE_HEAD',
]);

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const ENGINEERING_HASH_PATTERN = /^(?:sha256:[0-9a-f]{64}|fnv1a64:[0-9a-f]{16})$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const TEMPLATE_ID_PATTERN = /^(ALG|C2D|SHL|REC)-[A-Z0-9]+(?:-[A-Z0-9]+)*$/u;
const STAGE_ID_PATTERN = /^LAFEA\.[1-6]$/u;

const TOP_LEVEL_KEYS = Object.freeze([
  'schema', 'recordId', 'candidateHeadSha', 'template', 'parameterSchema',
  'parameterSet', 'compiler', 'handoff', 'targetStage', 'compositionRoot',
  'lifecycleProfile', 'sourceAuthority', 'unitProjection', 'meshAuthority',
  'recoveryAuthority', 'benchmarkManifests', 'productAdapter',
  'executionEvidence', 'qualificationEvidence', 'releaseState', 'diagnostics',
  'hashProfile', 'semanticHash', 'evidenceHash',
]);
const CREATE_KEYS = Object.freeze(TOP_LEVEL_KEYS.filter((key) =>
  !['schema', 'hashProfile', 'semanticHash', 'evidenceHash'].includes(key)));

const NESTED_KEYS = Object.freeze({
  template: ['templateId', 'templateRevision', 'templateSemanticHash', 'templateRegistryHash', 'bucketId'],
  parameterSchema: ['schemaId', 'schemaHash'],
  parameterSet: ['applicability', 'parameterSetHash', 'validationResultHash'],
  compiler: ['applicability', 'bindingSchema', 'bindingHash', 'compilerVersion', 'geometryCompilerId', 'loadCompilerId', 'boundaryCompilerId', 'meshRequestCompilerId'],
  handoff: ['applicability', 'handoffSchema', 'compilationHash', 'handoffHash', 'entryStageId', 'stageSourceHash', 'handoffStatus'],
  targetStage: ['registrySchema', 'stageId', 'stageEntryHash', 'engineState', 'enginePackage', 'stageAuthority', 'inputContractRole', 'resultContractRole'],
  compositionRoot: ['compositionSchema', 'compositionRootId', 'compositionRootHash', 'componentIdsHash', 'releaseStateBinding', 'compatibilityReceiptHash'],
  lifecycleProfile: ['profileSchema', 'profileId', 'profileHash', 'artifactKindsHash', 'resultRequiredKindsHash', 'assessmentRequiredKindsHash', 'meshApplicable', 'recoveryApplicable', 'convergenceApplicable', 'codeAssessmentApplicable'],
  sourceAuthority: ['applicability', 'requiredSchema', 'requiredRole', 'authorityHash', 'sourceHash', 'canonicalizationProfile', 'documentRevisionDigest', 'originRef'],
  unitProjection: ['sourceUnitContractHash', 'handoffUnitContractHash', 'targetUnitContractHash', 'projectionProfileHash'],
  meshAuthority: ['applicability', 'authoritySchema', 'authorityRole', 'authorityStatus', 'authorityHash', 'sourceHash', 'canonicalModelHash', 'analysisGeometryHash', 'meshProfileHash', 'meshHash', 'qualityEvidenceHash'],
  recoveryAuthority: ['applicability', 'recoveryProfileHash', 'recoveryEvidenceHash', 'convergenceProfileHash', 'convergenceEvidenceHash'],
  benchmarkManifests: ['bindingState', 'manifestIds', 'manifestHashes', 'expectedResultHashes', 'benchmarkResultHashes', 'independentEvidenceBasisHashes'],
  productAdapter: ['applicability', 'componentId', 'componentHash', 'productProfileHash', 'productEvidenceHash', 'productQualification'],
  executionEvidence: ['applicability', 'requestHash', 'receiptHash', 'stageExecutionEvidenceHash', 'lifecycleProducerBatchHash', 'resultEvidenceHash', 'calculationAccepted', 'resultReady', 'assessmentReady', 'codeReady'],
  qualificationEvidence: ['exactHeadArtifactHash', 'buildEvidenceHash', 'browserEvidenceHash', 'performanceEvidenceHash', 'accessibilityEvidenceHash', 'independentReviewHash', 'repositoryIntegrationEvidenceHash'],
  releaseState: ['authorityState', 'validity', 'releaseQualified', 'blockedReasons'],
});

const STATE_INDEX = new Map(LAFEA_TEMPLATE_AUTHORITY_STATES.map((state, index) => [state, index]));
const INVALIDATION = Object.freeze({
  PARAMETER_VALUE: ['PARAMETER_VALID', ['compiler', 'handoff', 'sourceAuthority', 'meshAuthority', 'recoveryAuthority', 'executionEvidence', 'qualificationEvidence']],
  PARAMETER_SCHEMA: ['CATALOGUED', ['parameterSet', 'compiler', 'handoff', 'sourceAuthority', 'meshAuthority', 'recoveryAuthority', 'executionEvidence', 'qualificationEvidence']],
  COMPILER: ['PARAMETER_VALID', ['compiler', 'handoff', 'sourceAuthority', 'meshAuthority', 'recoveryAuthority', 'executionEvidence', 'qualificationEvidence']],
  UNIT_PROJECTION: ['PARAMETER_VALID', ['unitProjection', 'compiler', 'handoff', 'sourceAuthority', 'meshAuthority', 'recoveryAuthority', 'executionEvidence', 'qualificationEvidence']],
  TARGET_STAGE: ['PARAMETER_VALID', ['targetStage', 'compositionRoot', 'lifecycleProfile', 'handoff', 'sourceAuthority', 'meshAuthority', 'recoveryAuthority', 'executionEvidence', 'qualificationEvidence']],
  COMPOSITION_ROOT: ['PARAMETER_VALID', ['compositionRoot', 'handoff', 'sourceAuthority', 'meshAuthority', 'recoveryAuthority', 'executionEvidence', 'qualificationEvidence']],
  LIFECYCLE_PROFILE: ['IMPORTED_FOR_EDITING', ['lifecycleProfile', 'sourceAuthority', 'meshAuthority', 'recoveryAuthority', 'executionEvidence', 'qualificationEvidence']],
  PRODUCT_ADAPTER: ['LIFECYCLE_READY', ['productAdapter', 'executionEvidence', 'qualificationEvidence']],
  SOURCE: ['IMPORTED_FOR_EDITING', ['sourceAuthority', 'meshAuthority', 'recoveryAuthority', 'executionEvidence', 'qualificationEvidence']],
  MESH: ['LIFECYCLE_READY', ['meshAuthority', 'recoveryAuthority', 'executionEvidence', 'qualificationEvidence']],
  RECOVERY: ['LIFECYCLE_READY', ['recoveryAuthority', 'executionEvidence', 'qualificationEvidence']],
  BENCHMARK_IMPLEMENTATION: ['RESULT_READY', ['benchmarkManifests', 'qualificationEvidence']],
  BENCHMARK_EXPECTED_VALUE: ['RESULT_READY', ['benchmarkManifests', 'qualificationEvidence']],
  CANDIDATE_HEAD: ['RESULT_READY', ['qualificationEvidence']],
});

export function createTemplateReleaseRecordV2(input) {
  exactKeys(input, CREATE_KEYS, 'Release record v2 input');
  const record = normalizeRecord({
    schema: LAFEA_TEMPLATE_RELEASE_RECORD_V2_SCHEMA,
    ...input,
    hashProfile: LAFEA_TEMPLATE_RELEASE_HASH_PROFILE,
    semanticHash: null,
    evidenceHash: null,
  });
  enforceState(record);
  const semanticHash = templateReleaseSha256(semanticBasis(record));
  const evidenceHash = templateReleaseSha256(evidenceBasis(record, semanticHash));
  return deepFreeze({ ...record, semanticHash, evidenceHash });
}

export function validateTemplateReleaseRecordV2(value) {
  const errors = [];
  try {
    exactKeys(value, TOP_LEVEL_KEYS, 'Release record v2');
    if (value.schema !== LAFEA_TEMPLATE_RELEASE_RECORD_V2_SCHEMA) throw new TypeError('Release record v2 schema is invalid.');
    if (value.hashProfile !== LAFEA_TEMPLATE_RELEASE_HASH_PROFILE) throw new TypeError('Release record v2 hash profile is invalid.');
    const normalized = normalizeRecord(value);
    enforceState(normalized);
    const expectedSemantic = templateReleaseSha256(semanticBasis(normalized));
    if (value.semanticHash !== expectedSemantic) throw new TypeError('Release record v2 semantic hash is invalid.');
    const expectedEvidence = templateReleaseSha256(evidenceBasis(normalized, expectedSemantic));
    if (value.evidenceHash !== expectedEvidence) throw new TypeError('Release record v2 evidence hash is invalid.');
    if (!isDeepFrozen(value)) throw new TypeError('Release record v2 must be deeply frozen.');
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function assertTemplateReleaseTransition(fromState, toState) {
  state(fromState, 'fromState');
  state(toState, 'toState');
  if (STATE_INDEX.get(toState) !== STATE_INDEX.get(fromState) + 1) {
    throw new TypeError(`Forbidden release-state transition: ${fromState} -> ${toState}.`);
  }
  return true;
}

export function classifyTemplateReleaseInvalidation(changeKind) {
  if (!LAFEA_TEMPLATE_CHANGE_KINDS.includes(changeKind)) {
    throw new TypeError(`Unknown release invalidation kind: ${changeKind}.`);
  }
  const [earliestSurvivingState, invalidatedAuthorities] = INVALIDATION[changeKind];
  return deepFreeze({
    changeKind,
    earliestSurvivingState,
    invalidatedAuthorities: [...invalidatedAuthorities],
    qualificationRevoked: true,
  });
}

export function semanticTemplateReleaseBasis(record) {
  return deepFreeze(semanticBasis(normalizeRecord(record)));
}

function normalizeRecord(value) {
  exactKeys(value, TOP_LEVEL_KEYS, 'Release record v2');
  Object.entries(NESTED_KEYS).forEach(([field, keys]) => exactKeys(value[field], keys, field));
  const normalized = {
    schema: value.schema,
    recordId: text(value.recordId, 'recordId'),
    candidateHeadSha: commit(value.candidateHeadSha),
    template: templateRecord(value.template),
    parameterSchema: parameterSchema(value.parameterSchema),
    parameterSet: applicabilityRecord(value.parameterSet, ['parameterSetHash', 'validationResultHash'], 'parameterSet'),
    compiler: compilerRecord(value.compiler),
    handoff: handoffRecord(value.handoff),
    targetStage: targetStageRecord(value.targetStage),
    compositionRoot: compositionRecord(value.compositionRoot),
    lifecycleProfile: lifecycleRecord(value.lifecycleProfile),
    sourceAuthority: sourceAuthorityRecord(value.sourceAuthority),
    unitProjection: unitProjectionRecord(value.unitProjection),
    meshAuthority: meshAuthorityRecord(value.meshAuthority),
    recoveryAuthority: recoveryAuthorityRecord(value.recoveryAuthority),
    benchmarkManifests: benchmarkRecord(value.benchmarkManifests),
    productAdapter: productRecord(value.productAdapter),
    executionEvidence: executionRecord(value.executionEvidence),
    qualificationEvidence: qualificationRecord(value.qualificationEvidence),
    releaseState: releaseStateRecord(value.releaseState),
    diagnostics: strings(value.diagnostics, 'diagnostics'),
    hashProfile: value.hashProfile,
    semanticHash: nullableOwnHash(value.semanticHash, 'semanticHash'),
    evidenceHash: nullableOwnHash(value.evidenceHash, 'evidenceHash'),
  };
  assertApplicabilityNulls(normalized);
  return normalized;
}

function semanticBasis(record) {
  return {
    schema: record.schema,
    recordId: record.recordId,
    template: record.template,
    parameterSchema: record.parameterSchema,
    parameterSet: record.parameterSet,
    compiler: record.compiler,
    handoff: record.handoff,
    targetStage: record.targetStage,
    compositionRoot: record.compositionRoot,
    lifecycleProfile: record.lifecycleProfile,
    sourceAuthority: record.sourceAuthority,
    unitProjection: record.unitProjection,
    meshAuthority: record.meshAuthority,
    recoveryAuthority: record.recoveryAuthority,
    benchmarkManifests: record.benchmarkManifests,
    productAdapter: record.productAdapter,
    executionEvidence: record.executionEvidence,
    releaseState: record.releaseState,
  };
}

function evidenceBasis(record, semanticHash) {
  return {
    schema: 'lafea-template-release-evidence-hash/v1',
    candidateHeadSha: record.candidateHeadSha,
    semanticHash,
    qualificationEvidence: record.qualificationEvidence,
    diagnostics: record.diagnostics,
  };
}

function enforceState(record) {
  const { authorityState, validity, releaseQualified, blockedReasons } = record.releaseState;
  const atLeast = (candidate) => STATE_INDEX.get(authorityState) >= STATE_INDEX.get(candidate);
  if (authorityState !== 'RELEASE_QUALIFIED' && releaseQualified) {
    throw new TypeError('Only RELEASE_QUALIFIED may set releaseQualified=true.');
  }
  if (authorityState === 'RELEASE_QUALIFIED') {
    if (!releaseQualified || validity !== 'CURRENT' || blockedReasons.length) {
      throw new TypeError('RELEASE_QUALIFIED requires CURRENT validity, no blockers and releaseQualified=true.');
    }
    requireAllQualificationEvidence(record.qualificationEvidence);
    if (!record.benchmarkManifests.benchmarkResultHashes.length
      || !record.benchmarkManifests.independentEvidenceBasisHashes.length) {
      throw new TypeError('RELEASE_QUALIFIED requires independent benchmark results.');
    }
  }
  if (atLeast('PARAMETER_VALID')) requireHash(record.parameterSet.validationResultHash, 'parameterSet.validationResultHash');
  if (atLeast('COMPILED_READY')) {
    requireHash(record.compiler.bindingHash, 'compiler.bindingHash');
    requireHash(record.handoff.compilationHash, 'handoff.compilationHash');
    requireHash(record.handoff.handoffHash, 'handoff.handoffHash');
  }
  if (atLeast('ENGINE_EXECUTABLE')) {
    requireHash(record.compositionRoot.compatibilityReceiptHash, 'compositionRoot.compatibilityReceiptHash');
    if (validity !== 'CURRENT') throw new TypeError('ENGINE_EXECUTABLE or later requires CURRENT validity.');
    if (record.productAdapter.applicability === 'REQUIRED') {
      text(record.productAdapter.componentId, 'productAdapter.componentId');
      requireHash(record.productAdapter.componentHash, 'productAdapter.componentHash');
      requireHash(record.productAdapter.productProfileHash, 'productAdapter.productProfileHash');
    }
  }
  if (atLeast('LIFECYCLE_READY')) {
    requireHash(record.sourceAuthority.authorityHash, 'sourceAuthority.authorityHash');
    requireHash(record.sourceAuthority.sourceHash, 'sourceAuthority.sourceHash');
    requireHash(record.executionEvidence.requestHash, 'executionEvidence.requestHash');
    requireHash(record.executionEvidence.receiptHash, 'executionEvidence.receiptHash');
    requireHash(record.executionEvidence.lifecycleProducerBatchHash, 'executionEvidence.lifecycleProducerBatchHash');
    if (record.meshAuthority.applicability === 'REQUIRED') {
      ['authorityHash', 'sourceHash', 'canonicalModelHash', 'analysisGeometryHash', 'meshProfileHash', 'meshHash', 'qualityEvidenceHash']
        .forEach((key) => requireHash(record.meshAuthority[key], `meshAuthority.${key}`));
    }
  }
  if (atLeast('RESULT_READY')) {
    requireHash(record.executionEvidence.resultEvidenceHash, 'executionEvidence.resultEvidenceHash');
    if (!record.executionEvidence.resultReady) throw new TypeError('RESULT_READY or later requires resultReady=true.');
    if (record.productAdapter.applicability === 'REQUIRED') {
      requireHash(record.productAdapter.productEvidenceHash, 'productAdapter.productEvidenceHash');
    }
    if (record.recoveryAuthority.applicability === 'REQUIRED') {
      requireHash(record.recoveryAuthority.recoveryEvidenceHash, 'recoveryAuthority.recoveryEvidenceHash');
    }
  }
  if (authorityState === 'RELEASE_QUALIFIED') {
    if (record.lifecycleProfile.convergenceApplicable) {
      requireHash(record.recoveryAuthority.convergenceEvidenceHash, 'recoveryAuthority.convergenceEvidenceHash');
    }
    if (record.lifecycleProfile.codeAssessmentApplicable && !record.executionEvidence.codeReady) {
      throw new TypeError('RELEASE_QUALIFIED requires codeReady=true when code assessment is applicable.');
    }
  }
}

function assertApplicabilityNulls(record) {
  const rules = [
    ['parameterSet', ['parameterSetHash', 'validationResultHash']],
    ['compiler', ['bindingSchema', 'bindingHash', 'compilerVersion', 'geometryCompilerId', 'loadCompilerId', 'boundaryCompilerId', 'meshRequestCompilerId']],
    ['handoff', ['handoffSchema', 'compilationHash', 'handoffHash', 'entryStageId', 'stageSourceHash', 'handoffStatus']],
    ['sourceAuthority', ['requiredSchema', 'requiredRole', 'authorityHash', 'sourceHash', 'canonicalizationProfile', 'documentRevisionDigest', 'originRef']],
    ['meshAuthority', ['authoritySchema', 'authorityRole', 'authorityStatus', 'authorityHash', 'sourceHash', 'canonicalModelHash', 'analysisGeometryHash', 'meshProfileHash', 'meshHash', 'qualityEvidenceHash']],
    ['recoveryAuthority', ['recoveryProfileHash', 'recoveryEvidenceHash', 'convergenceProfileHash', 'convergenceEvidenceHash']],
    ['productAdapter', ['componentId', 'componentHash', 'productProfileHash', 'productEvidenceHash', 'productQualification']],
    ['executionEvidence', ['requestHash', 'receiptHash', 'stageExecutionEvidenceHash', 'lifecycleProducerBatchHash', 'resultEvidenceHash']],
  ];
  rules.forEach(([field, keys]) => {
    if (record[field].applicability === 'NOT_APPLICABLE') {
      keys.forEach((key) => {
        if (record[field][key] !== null) throw new TypeError(`${field}.${key} must be null when NOT_APPLICABLE.`);
      });
      if (field === 'executionEvidence' && [
        record[field].calculationAccepted,
        record[field].resultReady,
        record[field].assessmentReady,
        record[field].codeReady,
      ].some(Boolean)) throw new TypeError('NOT_APPLICABLE executionEvidence flags must be false.');
    }
  });
}

function templateRecord(value) {
  return {
    templateId: templateId(value.templateId),
    templateRevision: positiveInteger(value.templateRevision, 'template.templateRevision'),
    templateSemanticHash: engineeringHash(value.templateSemanticHash, 'template.templateSemanticHash'),
    templateRegistryHash: engineeringHash(value.templateRegistryHash, 'template.templateRegistryHash'),
    bucketId: text(value.bucketId, 'template.bucketId'),
  };
}
function parameterSchema(value) {
  return { schemaId: text(value.schemaId, 'parameterSchema.schemaId'), schemaHash: engineeringHash(value.schemaHash, 'parameterSchema.schemaHash') };
}
function applicabilityRecord(value, hashKeys, field) {
  const result = { applicability: applicability(value.applicability, `${field}.applicability`) };
  hashKeys.forEach((key) => { result[key] = nullableHash(value[key], `${field}.${key}`); });
  return result;
}
function compilerRecord(value) {
  return {
    applicability: applicability(value.applicability, 'compiler.applicability'),
    bindingSchema: nullableText(value.bindingSchema, 'compiler.bindingSchema'),
    bindingHash: nullableHash(value.bindingHash, 'compiler.bindingHash'),
    compilerVersion: nullableText(value.compilerVersion, 'compiler.compilerVersion'),
    geometryCompilerId: nullableText(value.geometryCompilerId, 'compiler.geometryCompilerId'),
    loadCompilerId: nullableText(value.loadCompilerId, 'compiler.loadCompilerId'),
    boundaryCompilerId: nullableText(value.boundaryCompilerId, 'compiler.boundaryCompilerId'),
    meshRequestCompilerId: nullableText(value.meshRequestCompilerId, 'compiler.meshRequestCompilerId'),
  };
}
function handoffRecord(value) {
  return {
    applicability: applicability(value.applicability, 'handoff.applicability'),
    handoffSchema: nullableText(value.handoffSchema, 'handoff.handoffSchema'),
    compilationHash: nullableHash(value.compilationHash, 'handoff.compilationHash'),
    handoffHash: nullableHash(value.handoffHash, 'handoff.handoffHash'),
    entryStageId: nullableStage(value.entryStageId, 'handoff.entryStageId'),
    stageSourceHash: nullableHash(value.stageSourceHash, 'handoff.stageSourceHash'),
    handoffStatus: nullableText(value.handoffStatus, 'handoff.handoffStatus'),
  };
}
function targetStageRecord(value) {
  return {
    registrySchema: text(value.registrySchema, 'targetStage.registrySchema'),
    stageId: stageId(value.stageId, 'targetStage.stageId'),
    stageEntryHash: engineeringHash(value.stageEntryHash, 'targetStage.stageEntryHash'),
    engineState: text(value.engineState, 'targetStage.engineState'),
    enginePackage: nullableText(value.enginePackage, 'targetStage.enginePackage'),
    stageAuthority: text(value.stageAuthority, 'targetStage.stageAuthority'),
    inputContractRole: text(value.inputContractRole, 'targetStage.inputContractRole'),
    resultContractRole: nullableText(value.resultContractRole, 'targetStage.resultContractRole'),
  };
}
function compositionRecord(value) {
  return {
    compositionSchema: text(value.compositionSchema, 'compositionRoot.compositionSchema'),
    compositionRootId: text(value.compositionRootId, 'compositionRoot.compositionRootId'),
    compositionRootHash: engineeringHash(value.compositionRootHash, 'compositionRoot.compositionRootHash'),
    componentIdsHash: engineeringHash(value.componentIdsHash, 'compositionRoot.componentIdsHash'),
    releaseStateBinding: text(value.releaseStateBinding, 'compositionRoot.releaseStateBinding'),
    compatibilityReceiptHash: nullableHash(value.compatibilityReceiptHash, 'compositionRoot.compatibilityReceiptHash'),
  };
}
function lifecycleRecord(value) {
  return {
    profileSchema: text(value.profileSchema, 'lifecycleProfile.profileSchema'),
    profileId: text(value.profileId, 'lifecycleProfile.profileId'),
    profileHash: engineeringHash(value.profileHash, 'lifecycleProfile.profileHash'),
    artifactKindsHash: engineeringHash(value.artifactKindsHash, 'lifecycleProfile.artifactKindsHash'),
    resultRequiredKindsHash: engineeringHash(value.resultRequiredKindsHash, 'lifecycleProfile.resultRequiredKindsHash'),
    assessmentRequiredKindsHash: engineeringHash(value.assessmentRequiredKindsHash, 'lifecycleProfile.assessmentRequiredKindsHash'),
    meshApplicable: boolean(value.meshApplicable, 'lifecycleProfile.meshApplicable'),
    recoveryApplicable: boolean(value.recoveryApplicable, 'lifecycleProfile.recoveryApplicable'),
    convergenceApplicable: boolean(value.convergenceApplicable, 'lifecycleProfile.convergenceApplicable'),
    codeAssessmentApplicable: boolean(value.codeAssessmentApplicable, 'lifecycleProfile.codeAssessmentApplicable'),
  };
}
function sourceAuthorityRecord(value) {
  return {
    applicability: applicability(value.applicability, 'sourceAuthority.applicability'),
    requiredSchema: nullableText(value.requiredSchema, 'sourceAuthority.requiredSchema'),
    requiredRole: nullableText(value.requiredRole, 'sourceAuthority.requiredRole'),
    authorityHash: nullableHash(value.authorityHash, 'sourceAuthority.authorityHash'),
    sourceHash: nullableHash(value.sourceHash, 'sourceAuthority.sourceHash'),
    canonicalizationProfile: nullableText(value.canonicalizationProfile, 'sourceAuthority.canonicalizationProfile'),
    documentRevisionDigest: nullableText(value.documentRevisionDigest, 'sourceAuthority.documentRevisionDigest'),
    originRef: nullableText(value.originRef, 'sourceAuthority.originRef'),
  };
}
function unitProjectionRecord(value) {
  return {
    sourceUnitContractHash: engineeringHash(value.sourceUnitContractHash, 'unitProjection.sourceUnitContractHash'),
    handoffUnitContractHash: engineeringHash(value.handoffUnitContractHash, 'unitProjection.handoffUnitContractHash'),
    targetUnitContractHash: engineeringHash(value.targetUnitContractHash, 'unitProjection.targetUnitContractHash'),
    projectionProfileHash: engineeringHash(value.projectionProfileHash, 'unitProjection.projectionProfileHash'),
  };
}
function meshAuthorityRecord(value) {
  const result = { applicability: applicability(value.applicability, 'meshAuthority.applicability') };
  ['authoritySchema', 'authorityRole', 'authorityStatus'].forEach((key) => { result[key] = nullableText(value[key], `meshAuthority.${key}`); });
  ['authorityHash', 'sourceHash', 'canonicalModelHash', 'analysisGeometryHash', 'meshProfileHash', 'meshHash', 'qualityEvidenceHash'].forEach((key) => { result[key] = nullableHash(value[key], `meshAuthority.${key}`); });
  return result;
}
function recoveryAuthorityRecord(value) {
  return {
    applicability: applicability(value.applicability, 'recoveryAuthority.applicability'),
    recoveryProfileHash: nullableHash(value.recoveryProfileHash, 'recoveryAuthority.recoveryProfileHash'),
    recoveryEvidenceHash: nullableHash(value.recoveryEvidenceHash, 'recoveryAuthority.recoveryEvidenceHash'),
    convergenceProfileHash: nullableHash(value.convergenceProfileHash, 'recoveryAuthority.convergenceProfileHash'),
    convergenceEvidenceHash: nullableHash(value.convergenceEvidenceHash, 'recoveryAuthority.convergenceEvidenceHash'),
  };
}
function benchmarkRecord(value) {
  return {
    bindingState: text(value.bindingState, 'benchmarkManifests.bindingState'),
    manifestIds: strings(value.manifestIds, 'benchmarkManifests.manifestIds'),
    manifestHashes: hashes(value.manifestHashes, 'benchmarkManifests.manifestHashes'),
    expectedResultHashes: hashes(value.expectedResultHashes, 'benchmarkManifests.expectedResultHashes'),
    benchmarkResultHashes: hashes(value.benchmarkResultHashes, 'benchmarkManifests.benchmarkResultHashes'),
    independentEvidenceBasisHashes: hashes(value.independentEvidenceBasisHashes, 'benchmarkManifests.independentEvidenceBasisHashes'),
  };
}
function productRecord(value) {
  return {
    applicability: applicability(value.applicability, 'productAdapter.applicability'),
    componentId: nullableText(value.componentId, 'productAdapter.componentId'),
    componentHash: nullableHash(value.componentHash, 'productAdapter.componentHash'),
    productProfileHash: nullableHash(value.productProfileHash, 'productAdapter.productProfileHash'),
    productEvidenceHash: nullableHash(value.productEvidenceHash, 'productAdapter.productEvidenceHash'),
    productQualification: nullableText(value.productQualification, 'productAdapter.productQualification'),
  };
}
function executionRecord(value) {
  return {
    applicability: applicability(value.applicability, 'executionEvidence.applicability'),
    requestHash: nullableHash(value.requestHash, 'executionEvidence.requestHash'),
    receiptHash: nullableHash(value.receiptHash, 'executionEvidence.receiptHash'),
    stageExecutionEvidenceHash: nullableHash(value.stageExecutionEvidenceHash, 'executionEvidence.stageExecutionEvidenceHash'),
    lifecycleProducerBatchHash: nullableHash(value.lifecycleProducerBatchHash, 'executionEvidence.lifecycleProducerBatchHash'),
    resultEvidenceHash: nullableHash(value.resultEvidenceHash, 'executionEvidence.resultEvidenceHash'),
    calculationAccepted: boolean(value.calculationAccepted, 'executionEvidence.calculationAccepted'),
    resultReady: boolean(value.resultReady, 'executionEvidence.resultReady'),
    assessmentReady: boolean(value.assessmentReady, 'executionEvidence.assessmentReady'),
    codeReady: boolean(value.codeReady, 'executionEvidence.codeReady'),
  };
}
function qualificationRecord(value) {
  const result = {};
  NESTED_KEYS.qualificationEvidence.forEach((key) => { result[key] = nullableHash(value[key], `qualificationEvidence.${key}`); });
  return result;
}
function releaseStateRecord(value) {
  return {
    authorityState: state(value.authorityState, 'releaseState.authorityState'),
    validity: oneOf(value.validity, LAFEA_TEMPLATE_RECORD_VALIDITIES, 'releaseState.validity'),
    releaseQualified: boolean(value.releaseQualified, 'releaseState.releaseQualified'),
    blockedReasons: strings(value.blockedReasons, 'releaseState.blockedReasons'),
  };
}
function requireAllQualificationEvidence(value) {
  NESTED_KEYS.qualificationEvidence.forEach((key) => requireHash(value[key], `qualificationEvidence.${key}`));
}
function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`${label} must be a plain object.`);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) throw new TypeError(`${label} exact-key contract mismatch.`);
}
function engineeringHash(value, field) {
  if (typeof value !== 'string' || !ENGINEERING_HASH_PATTERN.test(value)) throw new TypeError(`${field} must be an engineering hash.`);
  return value;
}
function nullableHash(value, field) { return value === null ? null : engineeringHash(value, field); }
function requireHash(value, field) { if (value === null) throw new TypeError(`${field} is required at this authority state.`); return engineeringHash(value, field); }
function nullableOwnHash(value, field) { if (value === null) return null; if (!SHA256_PATTERN.test(value)) throw new TypeError(`${field} must be a SHA-256 hash.`); return value; }
function hashes(value, field) { return strings(value, field).map((entry) => engineeringHash(entry, field)); }
function text(value, field) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} must be non-empty text.`); return value; }
function nullableText(value, field) { return value === null ? null : text(value, field); }
function templateId(value) { if (typeof value !== 'string' || !TEMPLATE_ID_PATTERN.test(value)) throw new TypeError('template.templateId is invalid.'); return value; }
function stageId(value, field) { if (typeof value !== 'string' || !STAGE_ID_PATTERN.test(value)) throw new TypeError(`${field} is invalid.`); return value; }
function nullableStage(value, field) { return value === null ? null : stageId(value, field); }
function commit(value) { if (typeof value !== 'string' || !COMMIT_PATTERN.test(value)) throw new TypeError('candidateHeadSha must be a 40-character commit SHA.'); return value; }
function applicability(value, field) { return oneOf(value, LAFEA_TEMPLATE_APPLICABILITY, field); }
function state(value, field) { return oneOf(value, LAFEA_TEMPLATE_AUTHORITY_STATES, field); }
function oneOf(value, allowed, field) { if (!allowed.includes(value)) throw new TypeError(`${field} is invalid.`); return value; }
function boolean(value, field) { if (typeof value !== 'boolean') throw new TypeError(`${field} must be boolean.`); return value; }
function positiveInteger(value, field) { if (!Number.isInteger(value) || value < 1) throw new TypeError(`${field} must be a positive integer.`); return value; }
function strings(value, field) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry)) throw new TypeError(`${field} must contain non-empty strings.`);
  const sorted = [...value].sort();
  if (new Set(sorted).size !== sorted.length) throw new TypeError(`${field} values must be unique.`);
  return sorted;
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}
