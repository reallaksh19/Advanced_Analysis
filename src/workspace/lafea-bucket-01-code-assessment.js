import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_CODE_BASIS_INPUT_SCHEMA,
  createLafeaBucket01CodeBasis,
} from './lafea-bucket-01-code-basis.js';

export const LAFEA_BUCKET_01_CODE_ASSESSMENT_INPUT_SCHEMA =
  'lafea-bucket-01-code-assessment-input/v1';
export const LAFEA_BUCKET_01_CODE_ASSESSMENT_PACKAGE_SCHEMA =
  'lafea-bucket-01-code-assessment-package/v1';
export const LAFEA_BUCKET_01_CODE_ASSESSMENT_REVISION =
  'B01-CODE-ASSESSMENT.2';

const INPUT_KEYS = Object.freeze([
  'schema', 'assessmentId', 'exactHeadSha', 'codeBasisPackage',
  'productionLugStressEvidence',
]);
const SUPPORTED_METHOD = 'FIXED_LOCATION_RICHARDSON_GCI_UPPER_BOUND';
const SUPPORTED_LOAD_CASE = 'LC1';

export function evaluateLafeaBucket01CodeAssessment(inputValue) {
  exactKeys(inputValue, INPUT_KEYS, 'code-assessment input');
  if (inputValue.schema !== LAFEA_BUCKET_01_CODE_ASSESSMENT_INPUT_SCHEMA) {
    throw assessmentError('LAFEA_B01_CODE_ASSESSMENT_INPUT_SCHEMA_INVALID');
  }
  const exactHeadSha = gitSha(inputValue.exactHeadSha, 'exactHeadSha');
  const codeBasis = rebuildCodeBasis(inputValue.codeBasisPackage);
  if (codeBasis.exactHeadSha !== exactHeadSha) {
    throw assessmentError('LAFEA_B01_CODE_ASSESSMENT_CODE_BASIS_HEAD_MISMATCH');
  }
  const stressEvidence = validateStressEvidence(
    inputValue.productionLugStressEvidence,
    exactHeadSha,
  );
  if (codeBasis.stressClassification.method !== SUPPORTED_METHOD) {
    throw assessmentError('LAFEA_B01_CODE_ASSESSMENT_METHOD_UNSUPPORTED');
  }
  if (codeBasis.stressClassification.stressQuantity !== 'VON_MISES'
    && codeBasis.stressClassification.stressQuantity !== 'PRINCIPAL_MAXIMUM') {
    throw assessmentError('LAFEA_B01_CODE_ASSESSMENT_QUANTITY_UNSUPPORTED');
  }
  const terms = codeBasis.loadCombination.terms;
  if (terms.length !== 1 || terms[0].loadCaseId !== SUPPORTED_LOAD_CASE) {
    throw assessmentError('LAFEA_B01_CODE_ASSESSMENT_LOAD_COMBINATION_UNSUPPORTED');
  }
  const factor = terms[0].factor;
  if (factor === 0) {
    throw assessmentError('LAFEA_B01_CODE_ASSESSMENT_ZERO_LOAD_FACTOR');
  }
  const locations = indexLocations(stressEvidence);
  const locationAssessments = codeBasis.stressClassification.locationIds.map(
    (locationId) => assessLocation({
      locationId,
      location: requireLocation(locations, locationId),
      expectedQuantity: codeBasis.stressClassification.stressQuantity,
      factor,
      allowable: codeBasis.allowable.value,
    }),
  );
  const controlling = [...locationAssessments].sort(
    (left, right) => right.utilization - left.utilization
      || left.locationId.localeCompare(right.locationId),
  )[0];
  const accepted = locationAssessments.every((row) => row.accepted);
  const reasons = accepted
    ? []
    : locationAssessments
      .filter((row) => !row.accepted)
      .map((row) => `ALLOWABLE_EXCEEDED:${row.locationId}`);
  const semanticBase = {
    schema: LAFEA_BUCKET_01_CODE_ASSESSMENT_PACKAGE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_CODE_ASSESSMENT_REVISION,
    assessmentId: text(inputValue.assessmentId, 'assessmentId'),
    exactHeadSha,
    benchmarkId: codeBasis.benchmarkId,
    target: codeBasis.target,
    codeBasisSemanticHash: codeBasis.semanticHash,
    codeBasisEvidenceHash: codeBasis.evidenceHash,
    productionLugStressEvidenceHash: stressEvidence.evidenceHash,
    allowable: codeBasis.allowable,
    stressClassification: codeBasis.stressClassification,
    loadCombination: codeBasis.loadCombination,
    supportedAssessmentMethod: SUPPORTED_METHOD,
    locationAssessments,
    controllingLocationId: controlling.locationId,
    maximumUtilization: controlling.utilization,
    accepted,
    reasons,
    status: accepted ? 'CODE_ASSESSMENT_PASS' : 'CODE_ASSESSMENT_BLOCKED',
    authority: {
      externallyApprovedCodeBasisConsumed: true,
      retainedFixedLocationStressConsumed: true,
      movingMaximumUsed: false,
      displayStressUsed: false,
      codeAssessmentPerformed: true,
      codeVerified: accepted,
      integrationVerified: false,
      reportAuthority: false,
      releaseQualified: false,
      bucketQualified: false,
    },
  };
  const semanticHash = canonicalLafeaSha256(semanticBase);
  return deepFreeze({
    ...semanticBase,
    semanticHash,
    evidenceHash: canonicalLafeaSha256({
      schema: 'lafea-bucket-01-code-assessment-evidence/v1',
      semanticHash,
      codeBasisEvidenceHash: codeBasis.evidenceHash,
      productionLugStressEvidenceHash: stressEvidence.evidenceHash,
    }),
  });
}

export function validateLafeaBucket01CodeAssessment(value) {
  try {
    if (!value
      || value.schema !== LAFEA_BUCKET_01_CODE_ASSESSMENT_PACKAGE_SCHEMA
      || value.producerRevision !== LAFEA_BUCKET_01_CODE_ASSESSMENT_REVISION
      || !['CODE_ASSESSMENT_PASS', 'CODE_ASSESSMENT_BLOCKED'].includes(value.status)
      || value.authority?.codeAssessmentPerformed !== true
      || value.authority?.bucketQualified !== false) {
      throw assessmentError('LAFEA_B01_CODE_ASSESSMENT_PACKAGE_INVALID');
    }
    const expectedHash = canonicalLafeaSha256(withoutHashes(value));
    if (expectedHash !== value.semanticHash) {
      throw assessmentError('LAFEA_B01_CODE_ASSESSMENT_SEMANTIC_HASH_MISMATCH');
    }
    const expectedEvidenceHash = canonicalLafeaSha256({
      schema: 'lafea-bucket-01-code-assessment-evidence/v1',
      semanticHash: value.semanticHash,
      codeBasisEvidenceHash: value.codeBasisEvidenceHash,
      productionLugStressEvidenceHash: value.productionLugStressEvidenceHash,
    });
    if (expectedEvidenceHash !== value.evidenceHash) {
      throw assessmentError('LAFEA_B01_CODE_ASSESSMENT_EVIDENCE_HASH_MISMATCH');
    }
    if (!isDeepFrozen(value)) {
      throw assessmentError('LAFEA_B01_CODE_ASSESSMENT_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_B01_CODE_ASSESSMENT_INVALID'],
    });
  }
}

function rebuildCodeBasis(value) {
  if (!value || value.schema !== 'lafea-bucket-01-code-basis-package/v1'
    || value.status !== 'CODE_BASIS_FROZEN') {
    throw assessmentError('LAFEA_B01_CODE_ASSESSMENT_CODE_BASIS_INVALID');
  }
  const rebuilt = createLafeaBucket01CodeBasis({
    schema: LAFEA_BUCKET_01_CODE_BASIS_INPUT_SCHEMA,
    basisId: value.basisId,
    exactHeadSha: value.exactHeadSha,
    benchmarkId: value.benchmarkId,
    target: value.target,
    probeSpecHash: value.probeSpecHash,
    governingCode: value.governingCode,
    allowable: value.allowable,
    stressClassification: value.stressClassification,
    loadCombination: value.loadCombination,
    authority: value.authority,
  });
  if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
    throw assessmentError('LAFEA_B01_CODE_ASSESSMENT_CODE_BASIS_REBUILD_MISMATCH');
  }
  return rebuilt;
}

function validateStressEvidence(value, exactHeadSha) {
  if (!value
    || value.schema !== 'lafea-bucket-01-production-lug-fixed-probe-evidence/v1'
    || value.status !== 'PASS'
    || value.exactHeadSha !== exactHeadSha
    || value.authority?.retainedIntegrationPointTensorAuthority !== true
    || value.authority?.movingMaximumUsed !== false
    || value.authority?.nodalProjectionUsed !== false
    || value.authority?.crossElementAveragingUsed !== false) {
    throw assessmentError('LAFEA_B01_CODE_ASSESSMENT_STRESS_EVIDENCE_INVALID');
  }
  const base = { ...value };
  delete base.evidenceHash;
  if (canonicalLafeaSha256(base) !== value.evidenceHash) {
    throw assessmentError('LAFEA_B01_CODE_ASSESSMENT_STRESS_EVIDENCE_HASH_MISMATCH');
  }
  return value;
}

function indexLocations(evidence) {
  const rows = [
    ...evidence.standaloneProbeReceipts,
    ...evidence.pathReceipts.flatMap((path) => path.stationReceipts),
  ];
  const index = new Map();
  for (const row of rows) {
    const locationId = text(row.probeId, 'probeId');
    if (index.has(locationId)) {
      throw assessmentError('LAFEA_B01_CODE_ASSESSMENT_LOCATION_DUPLICATED');
    }
    index.set(locationId, row);
  }
  return index;
}

function requireLocation(index, locationId) {
  const row = index.get(locationId);
  if (!row) throw assessmentError('LAFEA_B01_CODE_ASSESSMENT_LOCATION_MISSING');
  return row;
}

function assessLocation({ locationId, location, expectedQuantity, factor, allowable }) {
  if (location.status !== 'PASS'
    || location.component !== expectedQuantity
    || location.units !== 'MPa'
    || !Array.isArray(location.observations)
    || location.observations.length !== 3
    || location.observations.some((row) => !Number.isFinite(row))
    || location.convergence?.status !== 'PASS'
    || !Number.isFinite(location.convergence.richardsonExtrapolation)
    || !Number.isFinite(location.convergence.fineGridGci)
    || location.convergence.fineGridGci < 0) {
    throw assessmentError('LAFEA_B01_CODE_ASSESSMENT_LOCATION_EVIDENCE_INVALID');
  }
  const fineGridStress = Math.abs(location.observations[2]);
  const richardsonStress = Math.abs(location.convergence.richardsonExtrapolation);
  const stressEnvelopeReference = Math.max(fineGridStress, richardsonStress);
  const numericalUncertainty = fineGridStress * location.convergence.fineGridGci;
  const boundedStress = stressEnvelopeReference + numericalUncertainty;
  const combinedDemand = Math.abs(factor) * boundedStress;
  const utilization = combinedDemand / allowable;
  return deepFreeze({
    locationId,
    component: location.component,
    units: location.units,
    loadCaseId: SUPPORTED_LOAD_CASE,
    loadFactor: factor,
    fineGridStress,
    richardsonStress,
    stressEnvelopeReference,
    fineGridGci: location.convergence.fineGridGci,
    numericalUncertainty,
    boundedStress,
    combinedDemand,
    allowable,
    utilization,
    accepted: utilization <= 1,
    convergenceSemanticHash: location.convergence.semanticHash,
    locationDefinitionHash: location.locationDefinitionHash,
  });
}

function withoutHashes(value) {
  const copy = { ...value };
  delete copy.semanticHash;
  delete copy.evidenceHash;
  return copy;
}
function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw assessmentError('LAFEA_B01_CODE_ASSESSMENT_RECORD_INVALID', label);
  }
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw assessmentError('LAFEA_B01_CODE_ASSESSMENT_EXACT_KEYS_INVALID', label);
  }
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw assessmentError('LAFEA_B01_CODE_ASSESSMENT_TEXT_REQUIRED', label);
  }
  return value.trim();
}
function gitSha(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw assessmentError('LAFEA_B01_CODE_ASSESSMENT_GIT_SHA_REQUIRED', label);
  }
  return value;
}
function assessmentError(code, message = code) { const error = new TypeError(message); error.code = code; return error; }
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}
