/**
 * Lifecycle-bound analytical product evidence for LAFEA.1 and LAFEA.2.
 *
 * This producer consumes retained current-core results. It does not rerun a
 * numerical kernel, synthesize target geometry, assess code or qualify release.
 */
import {
  createLafeaArtifactRecord,
  registerLafeaArtifact,
} from './lafea-lifecycle.js';
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import { requireLafeaStageComposition } from './lafea-stage-composition-root.js';

export const LAFEA_ANALYTICAL_PRODUCT_BATCH_SCHEMA =
  'lafea-analytical-product-batch/v1';
export const LAFEA_ANALYTICAL_PRODUCT_PRODUCER_REVISION = 'PR-NB1-A.1';

export function createLafeaAnalyticalProductBatch(options) {
  const stageId = options?.stageId;
  if (!['LAFEA.1', 'LAFEA.2'].includes(stageId)) {
    throw productError('LAFEA_ANALYTICAL_PRODUCT_STAGE_UNSUPPORTED');
  }
  const lifecycle = requireLifecycle(options?.lifecycle, stageId);
  const execution = requireExecution(options?.execution, stageId);
  const composition = requireLafeaStageComposition(stageId);
  if (!composition.productSupported || !composition.createProductEvidence) {
    throw productError('LAFEA_ANALYTICAL_PRODUCT_COMPONENT_MISSING');
  }
  const parents = currentParents(lifecycle);
  const componentId = composition.registryEntry.composition.componentIds.productAdapter;
  const productProfileHash = canonicalLafeaSha256({
    schema: 'lafea-analytical-product-profile/v1',
    stageId,
    componentId,
    producerRevision: LAFEA_ANALYTICAL_PRODUCT_PRODUCER_REVISION,
    releaseStateBinding: composition.releaseStateBinding,
  });
  const productInput = stageId === 'LAFEA.1'
    ? foundationInput(options?.productInput, parents)
    : screeningInput(options?.productInput, execution.result);
  const product = composition.createProductEvidence(productInput);
  const artifactKind = stageId === 'LAFEA.1'
    ? 'FOUNDATION_DISTRIBUTION'
    : 'SCREENING_ASSESSMENT';
  const artifactHash = canonicalLafeaSha256({
    schema: 'lafea-analytical-product-evidence/v1',
    stageId,
    artifactKind,
    parents,
    productProfileHash,
    product,
  });
  const qualification = productQualification(stageId, product);
  const record = createLafeaArtifactRecord({
    stageId,
    kind: artifactKind,
    status: 'CURRENT',
    artifactHash,
    parentHashes: { ...parents, productProfileHash },
    qualification,
    producerRef: producerReference(stageId, componentId),
    diagnostics: productDiagnostics(stageId, product),
  });
  return deepFreeze({
    schema: LAFEA_ANALYTICAL_PRODUCT_BATCH_SCHEMA,
    stageId,
    profileId: lifecycle.profileId,
    sourceHash: lifecycle.source.sourceHash,
    productProfileHash,
    product,
    record,
    registrationId: registrationId(record),
    codeAssessmentProduced: false,
    releaseQualified: false,
  });
}

export function registerLafeaAnalyticalProductBatch(lifecycleValue, batchValue) {
  const batch = validateBatch(batchValue);
  if (lifecycleValue?.stageId !== batch.stageId
    || lifecycleValue?.profileId !== batch.profileId
    || lifecycleValue?.source?.sourceHash !== batch.sourceHash) {
    throw productError('LAFEA_ANALYTICAL_PRODUCT_LIFECYCLE_MISMATCH');
  }
  return registerLafeaArtifact(
    lifecycleValue,
    batch.record,
    batch.registrationId,
  );
}

function foundationInput(value, parents) {
  const source = cloneRecord(value, 'productInput');
  const foundation = cloneRecord(source.foundation, 'productInput.foundation');
  foundation.sourceAncestry = {
    stageId: 'LAFEA.1',
    sourceHash: parents.sourceHash,
    canonicalModelHash: parents.canonicalModelHash,
    executionHash: parents.executionHash,
    resultEvidenceHash: parents.resultEvidenceHash,
  };
  return {
    foundation,
    handoffs: Array.isArray(source.handoffs) ? source.handoffs : [],
  };
}

function screeningInput(value, result) {
  const source = cloneRecord(value, 'productInput');
  return {
    ...source,
    screeningResult: result,
    handoffs: Array.isArray(source.handoffs) ? source.handoffs : [],
  };
}

function currentParents(lifecycle) {
  const canonical = currentArtifact(lifecycle, 'CANONICAL_MODEL');
  const execution = currentArtifact(lifecycle, 'EXECUTION');
  const result = currentArtifact(lifecycle, 'RESULT_EVIDENCE');
  return {
    sourceHash: lifecycle.source.sourceHash,
    canonicalModelHash: canonical.artifactHash,
    executionHash: execution.artifactHash,
    resultEvidenceHash: result.artifactHash,
  };
}

function currentArtifact(lifecycle, kind) {
  const artifact = lifecycle.artifacts?.[kind];
  if (!artifact || artifact.status !== 'CURRENT' || artifact.qualification !== 'PASS') {
    throw productError(`LAFEA_ANALYTICAL_PRODUCT_${kind}_NOT_CURRENT`);
  }
  return artifact;
}

function requireLifecycle(value, stageId) {
  if (!value || value.stageId !== stageId || !value.source?.sourceHash) {
    throw productError('LAFEA_ANALYTICAL_PRODUCT_LIFECYCLE_INVALID');
  }
  return value;
}

function requireExecution(value, stageId) {
  if (!value || value.stageId !== stageId || value.status !== 'QUALIFIED'
    || !value.result) {
    throw productError('LAFEA_ANALYTICAL_PRODUCT_EXECUTION_NOT_ACCEPTED');
  }
  return value;
}

function productQualification(stageId, product) {
  if (stageId === 'LAFEA.1') {
    return product.evidence?.qualification?.state === 'ACCEPTED' ? 'PASS' : 'FAIL';
  }
  return product.evidence?.state === 'BLOCKED' ? 'FAIL' : 'PASS';
}

function productDiagnostics(stageId, product) {
  if (stageId === 'LAFEA.1') return product.evidence?.diagnostics ?? [];
  if (product.evidence?.state !== 'BLOCKED') return [];
  return product.evidence.decisions
    .filter((row) => row.state === 'BLOCKED')
    .map((row) => ({
      code: row.rationaleCodes.join('+'),
      path: `${row.screeningCaseId}/${row.evaluationLocationId}`,
      message: 'Screening applicability is blocked.',
    }));
}

function producerReference(stageId, componentId) {
  return `${LAFEA_ANALYTICAL_PRODUCT_PRODUCER_REVISION}/${stageId}/${componentId}`;
}

function registrationId(record) {
  return `NB1-${record.stageId.replace('.', '-')}-${record.kind}-${record.artifactHash.slice(7, 23).toUpperCase()}`;
}

function validateBatch(value) {
  if (!value || value.schema !== LAFEA_ANALYTICAL_PRODUCT_BATCH_SCHEMA
    || !value.record || typeof value.registrationId !== 'string') {
    throw productError('LAFEA_ANALYTICAL_PRODUCT_BATCH_INVALID');
  }
  return value;
}

function cloneRecord(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const error = productError('LAFEA_ANALYTICAL_PRODUCT_INPUT_INVALID');
    error.path = path;
    throw error;
  }
  return structuredClone(value);
}

function productError(code) {
  const error = new TypeError(code);
  error.code = code;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
