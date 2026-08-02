import {
  canonicalStringify,
  canonicalizeJson,
  semanticHash,
} from '../../core/shared-piping-model/canonical-json.js';
import {
  deepFreeze,
  isPlainRecord,
} from '../../core/shared-piping-model/immutable.js';
import {
  assertEngineeringEnrichmentCandidateProjection,
} from './candidate-projection.js';
import {
  assertEngineeringEnrichmentStructuralImpact,
} from './structural-impact.js';

export const ENRICHMENT_ENGINE_DESCRIPTOR_SCHEMA =
  'EngineeringEnrichmentEngineDescriptor.v1';
export const ENRICHMENT_BASELINE_REFERENCE_SCHEMA =
  'EngineeringEnrichmentBaselineReference.v1';
export const ENRICHMENT_SHADOW_REQUEST_SCHEMA =
  'EngineeringEnrichmentShadowCalculationRequest.v1';
export const ENRICHMENT_SHADOW_RESULT_SCHEMA =
  'EngineeringEnrichmentShadowCalculationResult.v1';
export const ENRICHMENT_NUMERICAL_IMPACT_SCHEMA =
  'EngineeringEnrichmentNumericalImpact.v1';

const VARIANTS = Object.freeze(['BASELINE', 'CANDIDATE']);
const FALSE_AUTHORITY_FIELDS = Object.freeze([
  'bindingCreated',
  'reviewSelectionCreated',
  'approvalGranted',
  'current',
  'sealEligible',
  'calculationEligible',
  'resultAcceptanceEligible',
]);

export function buildEnrichmentEngineDescriptor(input) {
  assertExactKeys(input, [
    'engineId',
    'engineVersion',
    'methodId',
    'loadCaseIds',
    'metricIds',
  ], 'Engine descriptor input');
  const material = {
    schema: ENRICHMENT_ENGINE_DESCRIPTOR_SCHEMA,
    engineId: requiredText(input.engineId, 'engineId'),
    engineVersion: requiredText(input.engineVersion, 'engineVersion'),
    methodId: requiredText(input.methodId, 'methodId'),
    loadCaseIds: sortedUniqueText(input.loadCaseIds, 'loadCaseIds'),
    metricIds: sortedUniqueText(input.metricIds, 'metricIds'),
  };
  return deepFreeze({
    ...material,
    descriptorHash: semanticHash(material),
  });
}

export function assertEnrichmentEngineDescriptor(value) {
  assertExactKeys(value, [
    'schema',
    'engineId',
    'engineVersion',
    'methodId',
    'loadCaseIds',
    'metricIds',
    'descriptorHash',
  ], 'Engine descriptor');
  if (value.schema !== ENRICHMENT_ENGINE_DESCRIPTOR_SCHEMA) {
    fail(`descriptor schema must be ${ENRICHMENT_ENGINE_DESCRIPTOR_SCHEMA}.`);
  }
  const rebuilt = buildEnrichmentEngineDescriptor({
    engineId: value.engineId,
    engineVersion: value.engineVersion,
    methodId: value.methodId,
    loadCaseIds: value.loadCaseIds,
    metricIds: value.metricIds,
  });
  if (canonicalStringify(rebuilt) !== canonicalStringify(value)) {
    fail('descriptor differs from canonical authority.', RangeError);
  }
  return value;
}

export function buildEnrichmentBaselineReference(input) {
  assertExactKeys(input, ['basisId', 'basisHash'], 'Baseline reference input');
  const material = {
    schema: ENRICHMENT_BASELINE_REFERENCE_SCHEMA,
    basisId: requiredText(input.basisId, 'basisId'),
    basisHash: requiredText(input.basisHash, 'basisHash'),
    selectionAuthority: 'CALLER_SUPPLIED_SHADOW_REFERENCE',
    governedSelectionApproved: false,
  };
  return deepFreeze({
    ...material,
    baselineReferenceHash: semanticHash(material),
  });
}

export function assertEnrichmentBaselineReference(value) {
  assertExactKeys(value, [
    'schema',
    'basisId',
    'basisHash',
    'selectionAuthority',
    'governedSelectionApproved',
    'baselineReferenceHash',
  ], 'Baseline reference');
  if (value.schema !== ENRICHMENT_BASELINE_REFERENCE_SCHEMA) {
    fail(`baseline schema must be ${ENRICHMENT_BASELINE_REFERENCE_SCHEMA}.`);
  }
  if (
    value.selectionAuthority !== 'CALLER_SUPPLIED_SHADOW_REFERENCE'
    || value.governedSelectionApproved !== false
  ) {
    fail('baseline selection must remain unapproved shadow evidence.', RangeError);
  }
  const rebuilt = buildEnrichmentBaselineReference({
    basisId: value.basisId,
    basisHash: value.basisHash,
  });
  if (canonicalStringify(rebuilt) !== canonicalStringify(value)) {
    fail('baseline reference differs from canonical authority.', RangeError);
  }
  return value;
}

export function buildEnrichmentShadowCalculationRequest(input) {
  assertExactKeys(input, [
    'descriptor',
    'variant',
    'candidateProjection',
    'structuralImpact',
    'baselineReference',
  ], 'Shadow calculation request input');
  const descriptor = assertEnrichmentEngineDescriptor(input.descriptor);
  const candidate = assertReadyCandidate(input.candidateProjection);
  const structuralImpact = assertPassingStructuralImpact(
    input.structuralImpact,
    candidate,
  );
  const baselineReference = assertEnrichmentBaselineReference(
    input.baselineReference,
  );
  const variant = requireVariant(input.variant);
  const candidateValueRows = variant === 'CANDIDATE'
    ? candidate.rows.map(candidateValueRow).sort(compareCandidateValueRows)
    : [];
  const material = {
    schema: ENRICHMENT_SHADOW_REQUEST_SCHEMA,
    descriptorHash: descriptor.descriptorHash,
    variant,
    sourceDatasetHash: candidate.sourceDatasetHash,
    sourceSharedModelHash: candidate.sourceSharedModelHash,
    sourceStructuralHash: candidate.sourceStructuralHash,
    structuralImpactHash: structuralImpact.impactHash,
    comparisonCandidateProjectionHash: candidate.projectionHash,
    appliedCandidateProjectionHash: variant === 'CANDIDATE'
      ? candidate.projectionHash
      : null,
    baselineReferenceHash: baselineReference.baselineReferenceHash,
    candidateValueRows,
    productionRouting: false,
    calculationAuthority: false,
  };
  return deepFreeze({
    ...material,
    requestHash: semanticHash(material),
  });
}

export function assertEnrichmentShadowCalculationRequest(value) {
  assertExactKeys(value, [
    'schema',
    'descriptorHash',
    'variant',
    'sourceDatasetHash',
    'sourceSharedModelHash',
    'sourceStructuralHash',
    'structuralImpactHash',
    'comparisonCandidateProjectionHash',
    'appliedCandidateProjectionHash',
    'baselineReferenceHash',
    'candidateValueRows',
    'productionRouting',
    'calculationAuthority',
    'requestHash',
  ], 'Shadow calculation request');
  if (value.schema !== ENRICHMENT_SHADOW_REQUEST_SCHEMA) {
    fail(`request schema must be ${ENRICHMENT_SHADOW_REQUEST_SCHEMA}.`);
  }
  const variant = requireVariant(value.variant);
  if (
    value.productionRouting !== false
    || value.calculationAuthority !== false
  ) {
    fail('shadow request must not create production calculation authority.', RangeError);
  }
  if (!Array.isArray(value.candidateValueRows)) {
    fail('candidateValueRows must be an array.');
  }
  const normalizedRows = value.candidateValueRows.map((row, index) => (
    normalizeCandidateValueRow(row, `candidateValueRows[${index}]`)
  )).sort(compareCandidateValueRows);
  assertUnique(
    normalizedRows.map((row) => `${row.targetId}\u0000${row.fieldId}`),
    'candidate target field',
  );
  if (variant === 'BASELINE') {
    if (value.appliedCandidateProjectionHash !== null || normalizedRows.length) {
      fail('baseline request must not apply candidate values.', RangeError);
    }
  } else if (
    value.appliedCandidateProjectionHash !== value.comparisonCandidateProjectionHash
    || normalizedRows.length === 0
  ) {
    fail('candidate request must apply the complete comparison candidate.', RangeError);
  }
  const material = requestMaterial(value, normalizedRows);
  if (value.requestHash !== semanticHash(material)) {
    fail('requestHash is invalid.', RangeError);
  }
  return value;
}

export function executeEnrichmentShadowCalculation(input) {
  assertExactKeys(input, ['descriptor', 'request', 'runEngine'], 'Shadow execution input');
  const descriptor = assertEnrichmentEngineDescriptor(input.descriptor);
  const request = assertEnrichmentShadowCalculationRequest(input.request);
  if (descriptor.descriptorHash !== request.descriptorHash) {
    fail('descriptor differs from request authority.', RangeError);
  }
  if (typeof input.runEngine !== 'function') {
    fail('runEngine must be an injected function.');
  }
  const output = input.runEngine(request);
  assertExactKeys(output, ['metrics', 'diagnostics', 'complete'], 'Injected engine output');
  const metrics = normalizeMetrics(output.metrics, descriptor);
  const diagnostics = normalizeDiagnostics(output.diagnostics);
  const complete = booleanValue(output.complete, 'complete');
  const material = {
    schema: ENRICHMENT_SHADOW_RESULT_SCHEMA,
    requestHash: request.requestHash,
    descriptorHash: descriptor.descriptorHash,
    variant: request.variant,
    sourceDatasetHash: request.sourceDatasetHash,
    sourceSharedModelHash: request.sourceSharedModelHash,
    sourceStructuralHash: request.sourceStructuralHash,
    structuralImpactHash: request.structuralImpactHash,
    comparisonCandidateProjectionHash:
      request.comparisonCandidateProjectionHash,
    appliedCandidateProjectionHash: request.appliedCandidateProjectionHash,
    baselineReferenceHash: request.baselineReferenceHash,
    metrics,
    diagnostics,
    complete,
    productionRouting: false,
    calculationAuthority: false,
  };
  return deepFreeze({
    ...material,
    resultHash: semanticHash(material),
  });
}

export function assertEnrichmentShadowCalculationResult(value) {
  assertExactKeys(value, [
    'schema',
    'requestHash',
    'descriptorHash',
    'variant',
    'sourceDatasetHash',
    'sourceSharedModelHash',
    'sourceStructuralHash',
    'structuralImpactHash',
    'comparisonCandidateProjectionHash',
    'appliedCandidateProjectionHash',
    'baselineReferenceHash',
    'metrics',
    'diagnostics',
    'complete',
    'productionRouting',
    'calculationAuthority',
    'resultHash',
  ], 'Shadow calculation result');
  if (value.schema !== ENRICHMENT_SHADOW_RESULT_SCHEMA) {
    fail(`result schema must be ${ENRICHMENT_SHADOW_RESULT_SCHEMA}.`);
  }
  const variant = requireVariant(value.variant);
  if (
    value.productionRouting !== false
    || value.calculationAuthority !== false
  ) {
    fail('shadow result must not create calculation authority.', RangeError);
  }
  if (variant === 'BASELINE' && value.appliedCandidateProjectionHash !== null) {
    fail('baseline result must not apply a candidate projection.', RangeError);
  }
  if (
    variant === 'CANDIDATE'
    && value.appliedCandidateProjectionHash
      !== value.comparisonCandidateProjectionHash
  ) {
    fail('candidate result projection identity is invalid.', RangeError);
  }
  booleanValue(value.complete, 'complete');
  const material = resultMaterial(value);
  if (value.resultHash !== semanticHash(material)) {
    fail('resultHash is invalid.', RangeError);
  }
  return value;
}

export function buildEnrichmentNumericalImpactReport(input) {
  assertExactKeys(input, [
    'candidateProjection',
    'structuralImpact',
    'baselineResult',
    'candidateResult',
  ], 'Numerical impact input');
  const candidate = assertReadyCandidate(input.candidateProjection);
  const structuralImpact = assertPassingStructuralImpact(
    input.structuralImpact,
    candidate,
  );
  const baseline = assertEnrichmentShadowCalculationResult(input.baselineResult);
  const candidateResult = assertEnrichmentShadowCalculationResult(
    input.candidateResult,
  );
  assertResultPairAuthority({
    candidate,
    structuralImpact,
    baseline,
    candidateResult,
  });
  const comparison = compareMetrics(baseline, candidateResult);
  const blockers = [
    ...(!baseline.complete ? [{ code: 'BASELINE_RESULT_INCOMPLETE' }] : []),
    ...(!candidateResult.complete ? [{ code: 'CANDIDATE_RESULT_INCOMPLETE' }] : []),
    ...comparison.blockers,
  ];
  const status = blockers.length
    ? 'BLOCKED'
    : 'RECORDED_SHADOW_RAW_DELTAS';
  const changedMetricCount = comparison.deltas.filter(
    (row) => row.delta !== 0,
  ).length;
  const material = {
    schema: ENRICHMENT_NUMERICAL_IMPACT_SCHEMA,
    sourceDatasetHash: candidate.sourceDatasetHash,
    sourceSharedModelHash: candidate.sourceSharedModelHash,
    sourceStructuralHash: candidate.sourceStructuralHash,
    candidateProjectionHash: candidate.projectionHash,
    structuralImpactHash: structuralImpact.impactHash,
    engineDescriptorHash: baseline.descriptorHash,
    baselineReferenceHash: baseline.baselineReferenceHash,
    baselineResultHash: baseline.resultHash,
    candidateResultHash: candidateResult.resultHash,
    deltas: comparison.deltas,
    blockers: canonicalizeJson(blockers),
    summary: deepFreeze({
      metricCount: comparison.deltas.length,
      changedMetricCount,
      unchangedMetricCount: comparison.deltas.length - changedMetricCount,
      status,
    }),
    status,
    thresholdEvaluation: deepFreeze({
      status: 'NOT_AUTHORIZED',
      policyHash: null,
    }),
    baselineSelectionAuthorized: false,
    bindingCreated: false,
    reviewSelectionCreated: false,
    approvalGranted: false,
    current: false,
    sealEligible: false,
    calculationEligible: false,
    resultAcceptanceEligible: false,
  };
  return deepFreeze({
    ...material,
    impactHash: semanticHash(material),
  });
}

export function assertEngineeringEnrichmentNumericalImpact(value) {
  assertExactKeys(value, [
    'schema',
    'sourceDatasetHash',
    'sourceSharedModelHash',
    'sourceStructuralHash',
    'candidateProjectionHash',
    'structuralImpactHash',
    'engineDescriptorHash',
    'baselineReferenceHash',
    'baselineResultHash',
    'candidateResultHash',
    'deltas',
    'blockers',
    'summary',
    'status',
    'thresholdEvaluation',
    'baselineSelectionAuthorized',
    ...FALSE_AUTHORITY_FIELDS,
    'impactHash',
  ], 'Engineering enrichment numerical impact');
  if (value.schema !== ENRICHMENT_NUMERICAL_IMPACT_SCHEMA) {
    fail(`impact schema must be ${ENRICHMENT_NUMERICAL_IMPACT_SCHEMA}.`);
  }
  if (!['RECORDED_SHADOW_RAW_DELTAS', 'BLOCKED'].includes(value.status)) {
    fail('numerical impact status is invalid.');
  }
  if (
    !isPlainRecord(value.thresholdEvaluation)
    || value.thresholdEvaluation.status !== 'NOT_AUTHORIZED'
    || value.thresholdEvaluation.policyHash !== null
  ) {
    fail('threshold evaluation must remain unauthorized.', RangeError);
  }
  if (value.baselineSelectionAuthorized !== false) {
    fail('baseline selection must remain unauthorized.', RangeError);
  }
  FALSE_AUTHORITY_FIELDS.forEach((field) => {
    if (value[field] !== false) {
      fail(`${field} must remain false.`, RangeError);
    }
  });
  if (!Array.isArray(value.deltas) || !Array.isArray(value.blockers)) {
    fail('deltas and blockers must be arrays.');
  }
  const material = impactMaterial(value);
  if (value.impactHash !== semanticHash(material)) {
    fail('impactHash is invalid.', RangeError);
  }
  return value;
}

function assertReadyCandidate(value) {
  const candidate = assertEngineeringEnrichmentCandidateProjection(value);
  if (
    candidate.summary?.status !== 'READY_FOR_STRUCTURAL_IMPACT'
    || !Array.isArray(candidate.rows)
    || candidate.rows.length === 0
    || candidate.rows.some((row) => (
      row.disposition !== 'SHADOW_CANDIDATE_VALUE'
    ))
  ) {
    fail('candidate projection is not complete shadow input for Step 3.', RangeError);
  }
  return candidate;
}

function assertPassingStructuralImpact(value, candidate) {
  const impact = assertEngineeringEnrichmentStructuralImpact(value);
  if (
    impact.status !== 'PASS_SHADOW_NO_STRUCTURAL_CHANGE'
    || impact.topologyChanged !== false
    || impact.candidateProjectionHash !== candidate.projectionHash
    || impact.sourceSharedModelHash !== candidate.sourceSharedModelHash
    || impact.sourceStructuralHash !== candidate.sourceStructuralHash
  ) {
    fail('structural impact does not authorize shadow Step 3 execution.', RangeError);
  }
  return impact;
}

function candidateValueRow(row) {
  return normalizeCandidateValueRow({
    proposalHash: row.proposalHash,
    targetId: row.targetId,
    fieldId: row.fieldId,
    value: row.proposedValue,
    unit: row.unit,
  }, `candidate row ${row.proposalId}`);
}

function normalizeCandidateValueRow(row, label) {
  assertExactKeys(row, [
    'proposalHash',
    'targetId',
    'fieldId',
    'value',
    'unit',
  ], label);
  return deepFreeze({
    proposalHash: requiredText(row.proposalHash, `${label}.proposalHash`),
    targetId: requiredText(row.targetId, `${label}.targetId`),
    fieldId: requiredText(row.fieldId, `${label}.fieldId`),
    value: finiteNumber(row.value, `${label}.value`),
    unit: requiredText(row.unit, `${label}.unit`),
  });
}

function requestMaterial(value, normalizedRows = value.candidateValueRows) {
  return {
    schema: value.schema,
    descriptorHash: value.descriptorHash,
    variant: value.variant,
    sourceDatasetHash: value.sourceDatasetHash,
    sourceSharedModelHash: value.sourceSharedModelHash,
    sourceStructuralHash: value.sourceStructuralHash,
    structuralImpactHash: value.structuralImpactHash,
    comparisonCandidateProjectionHash:
      value.comparisonCandidateProjectionHash,
    appliedCandidateProjectionHash: value.appliedCandidateProjectionHash,
    baselineReferenceHash: value.baselineReferenceHash,
    candidateValueRows: normalizedRows,
    productionRouting: value.productionRouting,
    calculationAuthority: value.calculationAuthority,
  };
}

function resultMaterial(value) {
  return {
    schema: value.schema,
    requestHash: value.requestHash,
    descriptorHash: value.descriptorHash,
    variant: value.variant,
    sourceDatasetHash: value.sourceDatasetHash,
    sourceSharedModelHash: value.sourceSharedModelHash,
    sourceStructuralHash: value.sourceStructuralHash,
    structuralImpactHash: value.structuralImpactHash,
    comparisonCandidateProjectionHash:
      value.comparisonCandidateProjectionHash,
    appliedCandidateProjectionHash: value.appliedCandidateProjectionHash,
    baselineReferenceHash: value.baselineReferenceHash,
    metrics: value.metrics,
    diagnostics: value.diagnostics,
    complete: value.complete,
    productionRouting: value.productionRouting,
    calculationAuthority: value.calculationAuthority,
  };
}

function impactMaterial(value) {
  return {
    schema: value.schema,
    sourceDatasetHash: value.sourceDatasetHash,
    sourceSharedModelHash: value.sourceSharedModelHash,
    sourceStructuralHash: value.sourceStructuralHash,
    candidateProjectionHash: value.candidateProjectionHash,
    structuralImpactHash: value.structuralImpactHash,
    engineDescriptorHash: value.engineDescriptorHash,
    baselineReferenceHash: value.baselineReferenceHash,
    baselineResultHash: value.baselineResultHash,
    candidateResultHash: value.candidateResultHash,
    deltas: value.deltas,
    blockers: value.blockers,
    summary: value.summary,
    status: value.status,
    thresholdEvaluation: value.thresholdEvaluation,
    baselineSelectionAuthorized: value.baselineSelectionAuthorized,
    bindingCreated: value.bindingCreated,
    reviewSelectionCreated: value.reviewSelectionCreated,
    approvalGranted: value.approvalGranted,
    current: value.current,
    sealEligible: value.sealEligible,
    calculationEligible: value.calculationEligible,
    resultAcceptanceEligible: value.resultAcceptanceEligible,
  };
}

function normalizeMetrics(value, descriptor) {
  if (!Array.isArray(value)) fail('metrics must be an array.');
  const allowedMetrics = new Set(descriptor.metricIds);
  const allowedCases = new Set(descriptor.loadCaseIds);
  const rows = value.map((row, index) => {
    assertExactKeys(row, [
      'metricId',
      'scopeId',
      'loadCaseId',
      'value',
      'unit',
    ], `metrics[${index}]`);
    const metricId = requiredText(row.metricId, `metrics[${index}].metricId`);
    const loadCaseId = requiredText(
      row.loadCaseId,
      `metrics[${index}].loadCaseId`,
    );
    if (!allowedMetrics.has(metricId)) {
      fail(`metrics[${index}] uses unregistered metricId ${metricId}.`, RangeError);
    }
    if (!allowedCases.has(loadCaseId)) {
      fail(`metrics[${index}] uses unregistered loadCaseId ${loadCaseId}.`, RangeError);
    }
    return deepFreeze({
      metricId,
      scopeId: requiredText(row.scopeId, `metrics[${index}].scopeId`),
      loadCaseId,
      value: finiteNumber(row.value, `metrics[${index}].value`),
      unit: requiredText(row.unit, `metrics[${index}].unit`),
    });
  }).sort(compareMetricRows);
  assertUnique(rows.map(metricKey), 'metric tuple');
  return deepFreeze(rows);
}

function normalizeDiagnostics(value) {
  if (!Array.isArray(value)) fail('diagnostics must be an array.');
  const rows = value.map((row, index) => {
    if (!isPlainRecord(row)) fail(`diagnostics[${index}] must be an object.`);
    return deepFreeze(canonicalizeJson(row));
  });
  rows.sort((left, right) => compareAscii(
    semanticHash(left),
    semanticHash(right),
  ) || compareAscii(canonicalStringify(left), canonicalStringify(right)));
  return deepFreeze(rows);
}

function assertResultPairAuthority({
  candidate,
  structuralImpact,
  baseline,
  candidateResult,
}) {
  if (baseline.variant !== 'BASELINE') {
    fail('baselineResult must use BASELINE variant.', RangeError);
  }
  if (candidateResult.variant !== 'CANDIDATE') {
    fail('candidateResult must use CANDIDATE variant.', RangeError);
  }
  const equalFields = [
    'descriptorHash',
    'sourceDatasetHash',
    'sourceSharedModelHash',
    'sourceStructuralHash',
    'structuralImpactHash',
    'comparisonCandidateProjectionHash',
    'baselineReferenceHash',
  ];
  equalFields.forEach((field) => {
    if (baseline[field] !== candidateResult[field]) {
      fail(`result pair differs at ${field}.`, RangeError);
    }
  });
  if (
    baseline.sourceDatasetHash !== candidate.sourceDatasetHash
    || baseline.sourceSharedModelHash !== candidate.sourceSharedModelHash
    || baseline.sourceStructuralHash !== candidate.sourceStructuralHash
    || baseline.structuralImpactHash !== structuralImpact.impactHash
    || baseline.comparisonCandidateProjectionHash !== candidate.projectionHash
  ) {
    fail('result pair differs from candidate or structural authority.', RangeError);
  }
  if (baseline.appliedCandidateProjectionHash !== null) {
    fail('baseline result applied candidate values.', RangeError);
  }
  if (candidateResult.appliedCandidateProjectionHash !== candidate.projectionHash) {
    fail('candidate result did not apply the candidate projection.', RangeError);
  }
}

function compareMetrics(baseline, candidate) {
  const baselineMap = new Map(baseline.metrics.map((row) => [metricKey(row), row]));
  const candidateMap = new Map(candidate.metrics.map((row) => [metricKey(row), row]));
  const keys = [...new Set([
    ...baselineMap.keys(),
    ...candidateMap.keys(),
  ])].sort(compareAscii);
  const blockers = [];
  const deltas = [];
  keys.forEach((key) => {
    const left = baselineMap.get(key);
    const right = candidateMap.get(key);
    if (!left || !right) {
      blockers.push({
        code: 'METRIC_SET_MISMATCH',
        metricKey: key,
        missingFrom: left ? 'CANDIDATE' : 'BASELINE',
      });
      return;
    }
    if (left.unit !== right.unit) {
      blockers.push({
        code: 'METRIC_UNIT_MISMATCH',
        metricKey: key,
        baselineUnit: left.unit,
        candidateUnit: right.unit,
      });
      return;
    }
    const delta = normalizedZero(right.value - left.value);
    deltas.push(deepFreeze({
      metricId: left.metricId,
      scopeId: left.scopeId,
      loadCaseId: left.loadCaseId,
      unit: left.unit,
      baselineValue: left.value,
      candidateValue: right.value,
      delta,
      absoluteDelta: Math.abs(delta),
      relativeDelta: left.value === 0
        ? null
        : normalizedZero(delta / Math.abs(left.value)),
    }));
  });
  deltas.sort(compareMetricRows);
  return {
    deltas: deepFreeze(deltas),
    blockers: canonicalizeJson(blockers),
  };
}

function compareCandidateValueRows(left, right) {
  return compareAscii(left.targetId, right.targetId)
    || compareAscii(left.fieldId, right.fieldId)
    || compareAscii(left.proposalHash, right.proposalHash);
}

function compareMetricRows(left, right) {
  return compareAscii(left.metricId, right.metricId)
    || compareAscii(left.scopeId, right.scopeId)
    || compareAscii(left.loadCaseId, right.loadCaseId);
}

function metricKey(row) {
  return `${row.metricId}\u0000${row.scopeId}\u0000${row.loadCaseId}`;
}

function sortedUniqueText(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${label} must be a non-empty array.`);
  }
  const rows = value.map((row, index) => requiredText(row, `${label}[${index}]`));
  const normalized = [...new Set(rows)].sort(compareAscii);
  if (normalized.length !== rows.length) {
    fail(`${label} must not contain duplicates.`, RangeError);
  }
  return deepFreeze(normalized);
}

function requireVariant(value) {
  const variant = String(value ?? '');
  if (!VARIANTS.includes(variant)) {
    fail(`unsupported variant ${variant || '<empty>'}.`, RangeError);
  }
  return variant;
}

function assertUnique(values, label) {
  const seen = new Set();
  values.forEach((value) => {
    if (seen.has(value)) fail(`duplicate ${label}: ${value}.`, RangeError);
    seen.add(value);
  });
}

function booleanValue(value, label) {
  if (typeof value !== 'boolean') fail(`${label} must be boolean.`);
  return value;
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) fail(`${label} must be finite.`, RangeError);
  return normalizedZero(number);
}

function normalizedZero(value) {
  return Object.is(value, -0) ? 0 : value;
}

function assertExactKeys(value, expected, label) {
  if (!isPlainRecord(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort(compareAscii);
  const wanted = [...expected].sort(compareAscii);
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} keys must be exactly: ${wanted.join(', ')}.`);
  }
}

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message, Constructor = TypeError) {
  throw new Constructor(`EngineeringEnrichmentNumericalImpact: ${message}`);
}
