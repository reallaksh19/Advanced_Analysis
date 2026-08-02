import {
  canonicalStringify,
  canonicalizeJson,
  semanticHash,
} from '../../core/shared-piping-model/canonical-json.js';
import { isPlainRecord } from '../../core/shared-piping-model/immutable.js';
import {
  ENRICHMENT_BASELINE_REFERENCE_SCHEMA,
  ENRICHMENT_ENGINE_DESCRIPTOR_SCHEMA,
  ENRICHMENT_NUMERICAL_IMPACT_SCHEMA,
  ENRICHMENT_SHADOW_REQUEST_SCHEMA,
  ENRICHMENT_SHADOW_RESULT_SCHEMA,
  assertEngineeringEnrichmentNumericalImpact as assertImpactBase,
  assertEnrichmentBaselineReference,
  assertEnrichmentEngineDescriptor,
  assertEnrichmentShadowCalculationRequest as assertRequestBase,
  assertEnrichmentShadowCalculationResult as assertResultBase,
  buildEnrichmentBaselineReference,
  buildEnrichmentEngineDescriptor,
  buildEnrichmentNumericalImpactReport as buildImpactBase,
  buildEnrichmentShadowCalculationRequest,
  executeEnrichmentShadowCalculation as executeBase,
} from './numerical-impact.js';

export {
  ENRICHMENT_BASELINE_REFERENCE_SCHEMA,
  ENRICHMENT_ENGINE_DESCRIPTOR_SCHEMA,
  ENRICHMENT_NUMERICAL_IMPACT_SCHEMA,
  ENRICHMENT_SHADOW_REQUEST_SCHEMA,
  ENRICHMENT_SHADOW_RESULT_SCHEMA,
  assertEnrichmentBaselineReference,
  assertEnrichmentEngineDescriptor,
  buildEnrichmentBaselineReference,
  buildEnrichmentEngineDescriptor,
  buildEnrichmentShadowCalculationRequest,
};

const METRIC_KEYS = Object.freeze([
  'metricId', 'scopeId', 'loadCaseId', 'value', 'unit',
]);
const DELTA_KEYS = Object.freeze([
  'metricId', 'scopeId', 'loadCaseId', 'unit', 'baselineValue',
  'candidateValue', 'delta', 'absoluteDelta', 'relativeDelta',
]);
const IDENTITY_FIELDS = Object.freeze([
  'descriptorHash', 'variant', 'sourceDatasetHash', 'sourceSharedModelHash',
  'sourceStructuralHash', 'structuralImpactHash',
  'comparisonCandidateProjectionHash', 'appliedCandidateProjectionHash',
  'baselineReferenceHash',
]);

export function executeEnrichmentShadowCalculation(input) {
  return assertEnrichmentShadowCalculationResult(executeBase(input));
}

export function assertEnrichmentShadowCalculationRequest(value) {
  const request = assertRequestBase(value);
  const rows = normalizeCandidateRows(request.candidateValueRows);
  if (canonicalStringify(rows) !== canonicalStringify(request.candidateValueRows)) {
    fail('candidateValueRows are not canonical.', RangeError);
  }
  return request;
}

export function assertEnrichmentShadowCalculationResult(value) {
  const result = assertResultBase(value);
  const metrics = validateMetrics(result.metrics);
  if (canonicalStringify(metrics) !== canonicalStringify(result.metrics)) {
    fail('metrics are not canonical.', RangeError);
  }
  const diagnostics = canonicalRecords(result.diagnostics, 'diagnostics');
  if (canonicalStringify(diagnostics) !== canonicalStringify(result.diagnostics)) {
    fail('diagnostics are not canonical.', RangeError);
  }
  return result;
}

export function assertEnrichmentShadowCalculationResultAuthority(input) {
  exact(input, ['descriptor', 'request', 'result'], 'result authority input');
  const descriptor = assertEnrichmentEngineDescriptor(input.descriptor);
  const request = assertEnrichmentShadowCalculationRequest(input.request);
  const result = assertEnrichmentShadowCalculationResult(input.result);
  if (descriptor.descriptorHash !== request.descriptorHash
    || request.requestHash !== result.requestHash) {
    fail('descriptor/request/result identity mismatch.', RangeError);
  }
  IDENTITY_FIELDS.forEach((field) => {
    if (request[field] !== result[field]) {
      fail(`request/result differs at ${field}.`, RangeError);
    }
  });
  const allowedMetrics = new Set(descriptor.metricIds);
  const allowedCases = new Set(descriptor.loadCaseIds);
  result.metrics.forEach((metric, index) => {
    if (!allowedMetrics.has(metric.metricId)) {
      fail(`metrics[${index}] uses unregistered metricId ${metric.metricId}.`, RangeError);
    }
    if (!allowedCases.has(metric.loadCaseId)) {
      fail(`metrics[${index}] uses unregistered loadCaseId ${metric.loadCaseId}.`, RangeError);
    }
  });
  return result;
}

export function buildEnrichmentNumericalImpactReport(input) {
  return assertEngineeringEnrichmentNumericalImpact(buildImpactBase(input));
}

export function assertEngineeringEnrichmentNumericalImpact(value) {
  const impact = assertImpactBase(value);
  const deltas = validateDeltas(impact.deltas);
  if (canonicalStringify(deltas) !== canonicalStringify(impact.deltas)) {
    fail('deltas are not canonical.', RangeError);
  }
  const blockers = recordArray(impact.blockers, 'blockers');
  const changedMetricCount = deltas.filter((row) => row.delta !== 0).length;
  const expectedStatus = blockers.length ? 'BLOCKED' : 'RECORDED_SHADOW_RAW_DELTAS';
  const expectedSummary = {
    metricCount: deltas.length,
    changedMetricCount,
    unchangedMetricCount: deltas.length - changedMetricCount,
    status: expectedStatus,
  };
  if (impact.status !== expectedStatus
    || canonicalStringify(impact.summary) !== canonicalStringify(expectedSummary)) {
    fail('numerical impact status or summary is invalid.', RangeError);
  }
  return impact;
}

export function assertEngineeringEnrichmentNumericalImpactAuthority(input) {
  exact(input, [
    'candidateProjection', 'structuralImpact', 'baselineResult', 'candidateResult',
    'numericalImpact',
  ], 'numerical impact authority input');
  const impact = assertEngineeringEnrichmentNumericalImpact(input.numericalImpact);
  const rebuilt = buildImpactBase({
    candidateProjection: input.candidateProjection,
    structuralImpact: input.structuralImpact,
    baselineResult: input.baselineResult,
    candidateResult: input.candidateResult,
  });
  if (canonicalStringify(rebuilt) !== canonicalStringify(impact)) {
    fail('numerical impact differs from rebuilt result authority.', RangeError);
  }
  return impact;
}

function validateMetrics(value) {
  if (!Array.isArray(value)) fail('metrics must be an array.');
  const rows = value.map((row, index) => {
    exact(row, METRIC_KEYS, `metrics[${index}]`);
    return {
      metricId: text(row.metricId, `metrics[${index}].metricId`),
      scopeId: text(row.scopeId, `metrics[${index}].scopeId`),
      loadCaseId: text(row.loadCaseId, `metrics[${index}].loadCaseId`),
      value: finite(row.value, `metrics[${index}].value`),
      unit: text(row.unit, `metrics[${index}].unit`),
    };
  }).sort(compareMetric);
  unique(rows.map(metricKey), 'metric tuple');
  return rows;
}

function validateDeltas(value) {
  if (!Array.isArray(value)) fail('deltas must be an array.');
  const rows = value.map((row, index) => {
    exact(row, DELTA_KEYS, `deltas[${index}]`);
    const baselineValue = finite(row.baselineValue, `deltas[${index}].baselineValue`);
    const candidateValue = finite(row.candidateValue, `deltas[${index}].candidateValue`);
    const delta = normalizedZero(candidateValue - baselineValue);
    if (row.delta !== delta || row.absoluteDelta !== Math.abs(delta)) {
      fail(`deltas[${index}] arithmetic is invalid.`, RangeError);
    }
    const relativeDelta = baselineValue === 0
      ? null
      : normalizedZero(delta / Math.abs(baselineValue));
    if (row.relativeDelta !== relativeDelta) {
      fail(`deltas[${index}].relativeDelta is invalid.`, RangeError);
    }
    return {
      metricId: text(row.metricId, `deltas[${index}].metricId`),
      scopeId: text(row.scopeId, `deltas[${index}].scopeId`),
      loadCaseId: text(row.loadCaseId, `deltas[${index}].loadCaseId`),
      unit: text(row.unit, `deltas[${index}].unit`),
      baselineValue,
      candidateValue,
      delta,
      absoluteDelta: Math.abs(delta),
      relativeDelta,
    };
  }).sort(compareMetric);
  unique(rows.map(metricKey), 'delta metric tuple');
  return rows;
}

function normalizeCandidateRows(value) {
  if (!Array.isArray(value)) fail('candidateValueRows must be an array.');
  const rows = value.map((row, index) => {
    exact(row, ['proposalHash', 'targetId', 'fieldId', 'value', 'unit'],
      `candidateValueRows[${index}]`);
    return {
      proposalHash: text(row.proposalHash, `candidateValueRows[${index}].proposalHash`),
      targetId: text(row.targetId, `candidateValueRows[${index}].targetId`),
      fieldId: text(row.fieldId, `candidateValueRows[${index}].fieldId`),
      value: finite(row.value, `candidateValueRows[${index}].value`),
      unit: text(row.unit, `candidateValueRows[${index}].unit`),
    };
  }).sort((left, right) => ascii(left.targetId, right.targetId)
    || ascii(left.fieldId, right.fieldId)
    || ascii(left.proposalHash, right.proposalHash));
  unique(rows.map((row) => `${row.targetId}\u0000${row.fieldId}`),
    'candidate target field');
  return rows;
}

function recordArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  return value.map((row, index) => {
    if (!isPlainRecord(row)) fail(`${label}[${index}] must be an object.`);
    return canonicalizeJson(row);
  });
}
function canonicalRecords(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  const rows = value.map((row, index) => {
    if (!isPlainRecord(row)) fail(`${label}[${index}] must be an object.`);
    return canonicalizeJson(row);
  });
  rows.sort((left, right) => ascii(semanticHash(left), semanticHash(right))
    || ascii(canonicalStringify(left), canonicalStringify(right)));
  return rows;
}
function compareMetric(left, right) {
  return ascii(left.metricId, right.metricId)
    || ascii(left.scopeId, right.scopeId)
    || ascii(left.loadCaseId, right.loadCaseId);
}
function metricKey(row) {
  return `${row.metricId}\u0000${row.scopeId}\u0000${row.loadCaseId}`;
}
function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${label} must be a finite number.`, RangeError);
  }
  return normalizedZero(value);
}
function normalizedZero(value) { return Object.is(value, -0) ? 0 : value; }
function unique(values, label) {
  if (new Set(values).size !== values.length) fail(`duplicate ${label}.`, RangeError);
}
function exact(value, keys, label) {
  if (!isPlainRecord(value)
    || !same(Object.keys(value).sort(ascii), [...keys].sort(ascii))) {
    fail(`${label} keys are invalid.`);
  }
}
function text(value, label) {
  const result = String(value ?? '').trim();
  if (!result) fail(`${label} is required.`);
  return result;
}
function same(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(message, Constructor = TypeError) {
  throw new Constructor(`EngineeringEnrichmentNumericalImpactValidation: ${message}`);
}
