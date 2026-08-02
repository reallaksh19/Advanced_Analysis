/**
 * B4 controlled execution controller for the two selected analytical pilots.
 *
 * This is the only template-owned orchestration route. It consumes B1/B2/B3
 * authority, invokes the retained public stage route, and registers existing
 * source, lifecycle and product evidence. It does not expose a UI callback,
 * authorize general T7D, assess code or qualify release.
 */
import {
  createTemplateExecutionReceipt,
  validateTemplateExecutionRequest,
} from '../core/lafea-application-templates/analytical-execution-contract.js';
import {
  validateTemplateReleaseRecordV2,
} from '../core/lafea-application-templates/release-record-v2.js';
import {
  evaluateTemplateTargetCompatibility,
  validateTemplateTargetCompatibilityReceipt,
} from '../core/lafea-application-templates/target-compatibility.js';
import {
  createLafeaAnalyticalProductBatch,
  registerLafeaAnalyticalProductBatch,
} from './lafea-analytical-product-producers.js';
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import { lafeaDocumentDigest } from './lafea-edit-command.js';
import {
  createLafeaLifecycle,
  lafeaLifecycleReadiness,
} from './lafea-lifecycle.js';
import {
  createLafeaLifecycleProducerBatch,
  registerLafeaLifecycleProducerBatch,
} from './lafea-lifecycle-producers.js';
import { issueLafeaSourceAuthority } from './lafea-source-authority.js';
import {
  createCurrentLafeaTargetAuthoritySnapshot,
} from './lafea-target-compatibility-authority.js';
import { executeLafeaStage } from './lafea-workbench-model.js';

export const LAFEA_TEMPLATE_EXECUTION_CONTROLLER_RESULT_SCHEMA =
  'lafea-template-execution-controller-result/v1';
export const LAFEA_TEMPLATE_EXECUTION_CONTROLLER_REVISION = 'B4.1';

const INPUT_KEYS = Object.freeze([
  'request',
  'releaseRecord',
  'compatibilityReceipt',
  'document',
  'productInput',
]);

/** Execute one exact B3-authorized analytical pilot through current authority. */
export function executeControlledLafeaAnalyticalPilot(options) {
  exactKeys(options, INPUT_KEYS, 'Controlled analytical pilot options');
  requirePlainRecord(options.document, 'document');
  requirePlainRecord(options.productInput, 'productInput');
  requireValid(
    validateTemplateExecutionRequest(options.request),
    'LAFEA_TEMPLATE_EXECUTION_REQUEST_INVALID',
  );
  requireValid(
    validateTemplateReleaseRecordV2(options.releaseRecord),
    'LAFEA_TEMPLATE_RELEASE_RECORD_INVALID',
  );
  requireValid(
    validateTemplateTargetCompatibilityReceipt(options.compatibilityReceipt),
    'LAFEA_TEMPLATE_COMPATIBILITY_RECEIPT_INVALID',
  );

  const context = createContext(options);
  try {
    assertExecutionAuthority(context);
    assertCurrentCompatibility(context);
    assertDocumentRevision(context);
    runRetainedStageRoute(context);
    issueExactSourceAuthority(context);
    createAndRegisterLifecycleEvidence(context);
    createAndRegisterProductEvidence(context);
    return controllerResult(context, acceptedOrBlocked(context));
  } catch (error) {
    context.diagnostics.push(errorCode(error, 'LAFEA_TEMPLATE_PILOT_BLOCKED'));
    return controllerResult(context, 'BLOCKED');
  }
}

function createContext(options) {
  const request = options.request;
  const releaseRecord = options.releaseRecord;
  const snapshot = createCurrentLafeaTargetAuthoritySnapshot(request.targetStageId);
  const currentCompatibilityReceipt = evaluateTemplateTargetCompatibility(
    releaseRecord,
    snapshot,
  );
  return {
    request,
    releaseRecord,
    providedCompatibilityReceipt: options.compatibilityReceipt,
    currentCompatibilityReceipt,
    snapshot,
    document: structuredClone(options.document),
    productInput: structuredClone(options.productInput),
    sourceAuthority: null,
    execution: null,
    lifecycleProducerBatch: null,
    productBatch: null,
    lifecycle: null,
    readiness: null,
    diagnostics: [],
  };
}

function assertExecutionAuthority(context) {
  const { request, releaseRecord, providedCompatibilityReceipt } = context;
  if (releaseRecord.releaseState.authorityState !== 'ENGINE_EXECUTABLE'
    || releaseRecord.releaseState.validity !== 'CURRENT'
    || releaseRecord.releaseState.releaseQualified) {
    throw controllerError('LAFEA_TEMPLATE_RELEASE_NOT_ENGINE_EXECUTABLE');
  }
  const checks = [
    [request.releaseRecordHash, releaseRecord.semanticHash,
      'LAFEA_TEMPLATE_RELEASE_RECORD_HASH_MISMATCH'],
    [request.parameterSetHash, releaseRecord.parameterSet.parameterSetHash,
      'LAFEA_TEMPLATE_PARAMETER_SET_HASH_MISMATCH'],
    [request.compilationHash, releaseRecord.handoff.compilationHash,
      'LAFEA_TEMPLATE_COMPILATION_HASH_MISMATCH'],
    [request.handoffHash, releaseRecord.handoff.handoffHash,
      'LAFEA_TEMPLATE_HANDOFF_HASH_MISMATCH'],
    [request.compatibilityReceiptHash, providedCompatibilityReceipt.semanticHash,
      'LAFEA_TEMPLATE_REQUEST_COMPATIBILITY_HASH_MISMATCH'],
    [releaseRecord.compositionRoot.compatibilityReceiptHash,
      providedCompatibilityReceipt.semanticHash,
      'LAFEA_TEMPLATE_RELEASE_COMPATIBILITY_HASH_MISMATCH'],
  ];
  for (const [actual, expected, code] of checks) {
    if (actual !== expected) throw controllerError(code);
  }
  if (providedCompatibilityReceipt.status !== 'CURRENT') {
    throw controllerError('LAFEA_TEMPLATE_PROVIDED_COMPATIBILITY_NOT_CURRENT');
  }
  assertArrayEqual(
    request.expectedBenchmarkManifestIds,
    releaseRecord.benchmarkManifests.manifestIds,
    'LAFEA_TEMPLATE_BENCHMARK_BINDING_MISMATCH',
  );
}

function assertCurrentCompatibility(context) {
  const { request, releaseRecord, currentCompatibilityReceipt, snapshot } = context;
  if (currentCompatibilityReceipt.status !== 'CURRENT') {
    throw controllerError(
      `LAFEA_TEMPLATE_TARGET_${currentCompatibilityReceipt.status}`,
    );
  }
  if (currentCompatibilityReceipt.semanticHash
    !== context.providedCompatibilityReceipt.semanticHash) {
    throw controllerError('LAFEA_TEMPLATE_TARGET_COMPATIBILITY_CHANGED');
  }
  const checks = [
    [request.targetStageId, snapshot.targetStage.stageId,
      'LAFEA_TEMPLATE_TARGET_STAGE_CHANGED'],
    [request.targetCompositionRootId, snapshot.compositionRoot.compositionRootId,
      'LAFEA_TEMPLATE_COMPOSITION_ROOT_CHANGED'],
    [request.targetLifecycleProfileId, snapshot.lifecycleProfile.profileId,
      'LAFEA_TEMPLATE_LIFECYCLE_PROFILE_CHANGED'],
    [request.expectedProductAdapterId, snapshot.productAdapter.componentId,
      'LAFEA_TEMPLATE_PRODUCT_ADAPTER_CHANGED'],
    [releaseRecord.targetStage.stageId, request.targetStageId,
      'LAFEA_TEMPLATE_RELEASE_TARGET_STAGE_MISMATCH'],
  ];
  for (const [actual, expected, code] of checks) {
    if (actual !== expected) throw controllerError(code);
  }
  assertArrayEqual(
    request.expectedBenchmarkManifestIds,
    snapshot.benchmarkBindings.manifestIds,
    'LAFEA_TEMPLATE_CURRENT_BENCHMARK_BINDING_CHANGED',
  );
}

function assertDocumentRevision(context) {
  const digest = lafeaDocumentDigest(context.document);
  if (digest !== context.request.importedDocumentRevisionDigest
    || digest !== context.request.sourceAuthorityRequest
      .expectedDocumentRevisionDigest) {
    throw controllerError('LAFEA_TEMPLATE_IMPORTED_DOCUMENT_REVISION_STALE');
  }
}

function runRetainedStageRoute(context) {
  const execution = executeLafeaStage(
    context.request.targetStageId,
    context.document,
  );
  context.execution = execution;
  if (execution.status !== 'QUALIFIED') {
    for (const row of execution.diagnostics ?? []) {
      context.diagnostics.push(
        typeof row?.code === 'string' ? row.code : 'LAFEA_STAGE_CALCULATION_REJECTED',
      );
    }
    throw controllerError('LAFEA_TEMPLATE_CALCULATION_NOT_ACCEPTED');
  }
  const normalizedDigest = lafeaDocumentDigest(execution.source);
  if (normalizedDigest !== context.request.importedDocumentRevisionDigest) {
    throw controllerError('LAFEA_TEMPLATE_NORMALIZED_SOURCE_REVISION_CHANGED');
  }
}

function issueExactSourceAuthority(context) {
  const authority = issueLafeaSourceAuthority(
    context.request.targetStageId,
    context.execution.source,
    context.request.sourceAuthorityRequest.originRef,
  );
  if (authority.documentRevisionDigest
    !== context.request.importedDocumentRevisionDigest) {
    throw controllerError('LAFEA_TEMPLATE_SOURCE_AUTHORITY_REVISION_MISMATCH');
  }
  context.sourceAuthority = authority;
}

function createAndRegisterLifecycleEvidence(context) {
  let lifecycle = createLafeaLifecycle(
    context.request.targetStageId,
    context.sourceAuthority.sourceHash,
  );
  const batch = createLafeaLifecycleProducerBatch({
    stageId: context.request.targetStageId,
    sourceAuthority: context.sourceAuthority,
    execution: context.execution,
  });
  lifecycle = registerLafeaLifecycleProducerBatch(lifecycle, batch);
  context.lifecycleProducerBatch = batch;
  context.lifecycle = lifecycle;
  context.readiness = lafeaLifecycleReadiness(lifecycle);
  if (!context.readiness.resultReady) {
    throw controllerError('LAFEA_TEMPLATE_RESULT_EVIDENCE_NOT_READY');
  }
}

function createAndRegisterProductEvidence(context) {
  const batch = createLafeaAnalyticalProductBatch({
    stageId: context.request.targetStageId,
    lifecycle: context.lifecycle,
    execution: context.execution,
    productInput: context.productInput,
  });
  context.lifecycle = registerLafeaAnalyticalProductBatch(
    context.lifecycle,
    batch,
  );
  context.productBatch = batch;
  context.readiness = lafeaLifecycleReadiness(context.lifecycle);
}

function acceptedOrBlocked(context) {
  const productPass = context.productBatch?.record?.qualification === 'PASS';
  const assessmentExpected = context.request.targetStageId === 'LAFEA.2';
  const assessmentReady = context.readiness?.assessmentReady === true;
  if (!productPass) {
    context.diagnostics.push('LAFEA_TEMPLATE_PRODUCT_EVIDENCE_NOT_QUALIFIED');
    return 'BLOCKED';
  }
  if (context.readiness?.resultReady !== true) {
    context.diagnostics.push('LAFEA_TEMPLATE_RESULT_NOT_READY');
    return 'BLOCKED';
  }
  if (assessmentExpected !== assessmentReady) {
    context.diagnostics.push('LAFEA_TEMPLATE_ASSESSMENT_READINESS_MISMATCH');
    return 'BLOCKED';
  }
  return 'ACCEPTED';
}

function controllerResult(context, status) {
  const accepted = status === 'ACCEPTED';
  const stageId = context.request.targetStageId;
  const resultEvidence = context.lifecycleProducerBatch?.records?.find(
    (record) => record.kind === 'RESULT_EVIDENCE',
  );
  const receipt = createTemplateExecutionReceipt({
    receiptId: receiptId(context),
    requestHash: context.request.semanticHash,
    templateId: context.request.templateId,
    targetStageId: stageId,
    targetCompositionRootHash: context.snapshot.compositionRoot.compositionRootHash,
    targetLifecycleProfileHash: context.snapshot.lifecycleProfile.profileHash,
    compatibilityReceiptHash: context.currentCompatibilityReceipt.semanticHash,
    sourceAuthorityHash: context.sourceAuthority
      ? canonicalLafeaSha256(context.sourceAuthority) : null,
    exactSourceHash: context.sourceAuthority?.sourceHash ?? null,
    importedDocumentRevisionDigest: context.request.importedDocumentRevisionDigest,
    stageExecutionEvidenceHash: context.execution
      ? canonicalLafeaSha256(context.execution) : null,
    lifecycleProducerBatchHash: context.lifecycleProducerBatch
      ? canonicalLafeaSha256(context.lifecycleProducerBatch) : null,
    lifecycleStateHash: context.lifecycle
      ? canonicalLafeaSha256(context.lifecycle) : null,
    resultEvidenceHash: resultEvidence?.artifactHash ?? null,
    productEvidenceHash: context.productBatch?.record?.artifactHash ?? null,
    benchmarkManifestIds: [...context.request.expectedBenchmarkManifestIds],
    calculationAccepted: context.execution?.status === 'QUALIFIED',
    resultReady: context.readiness?.resultReady === true,
    assessmentApplicability: stageId === 'LAFEA.2'
      ? 'APPLICABLE' : 'NOT_APPLICABLE',
    assessmentReady: context.readiness?.assessmentReady === true,
    codeReady: false,
    status,
    releaseQualified: false,
    diagnostics: [...new Set(context.diagnostics)].sort(),
  });
  return deepFreeze({
    schema: LAFEA_TEMPLATE_EXECUTION_CONTROLLER_RESULT_SCHEMA,
    controllerRevision: LAFEA_TEMPLATE_EXECUTION_CONTROLLER_REVISION,
    status,
    accepted,
    request: context.request,
    currentCompatibilityReceipt: context.currentCompatibilityReceipt,
    sourceAuthority: context.sourceAuthority,
    execution: context.execution,
    lifecycleProducerBatch: context.lifecycleProducerBatch,
    productBatch: context.productBatch,
    lifecycle: context.lifecycle,
    readiness: context.readiness,
    receipt,
  });
}

function receiptId(context) {
  const digest = canonicalLafeaSha256({
    requestHash: context.request.semanticHash,
    compatibilityHash: context.currentCompatibilityReceipt.semanticHash,
    sourceHash: context.sourceAuthority?.sourceHash ?? null,
    executionHash: context.execution
      ? canonicalLafeaSha256(context.execution) : null,
  });
  return `B4-${context.request.targetStageId.replace('.', '-')}-${digest.slice(7, 31).toUpperCase()}`;
}

function requireValid(validation, code) {
  if (!validation.ok) throw controllerError(code, validation.errors.join(' '));
}

function assertArrayEqual(left, right, code) {
  if (JSON.stringify(left) !== JSON.stringify(right)) throw controllerError(code);
}

function exactKeys(value, expected, label) {
  requirePlainRecord(value, label);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new TypeError(`${label} exact-key contract mismatch.`);
  }
}

function requirePlainRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
}

function controllerError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

function errorCode(error, fallback) {
  return typeof error?.code === 'string' ? error.code : fallback;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
