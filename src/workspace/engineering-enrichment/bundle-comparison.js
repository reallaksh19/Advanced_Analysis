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
  assertEngineeringEnrichmentPortableBundle,
} from './portable-bundle-validation.js';

export const ENRICHMENT_PORTABLE_COMPARISON_SCHEMA =
  'EngineeringEnrichmentPortableBundleComparison.v1';

const FALSE_AUTHORITY_FIELDS = Object.freeze([
  'persistenceCreated',
  'reviewDecisionCreated',
  'approvalGranted',
  'current',
  'sealEligible',
  'calculationEligible',
  'resultAcceptanceEligible',
]);
const CHANGE_TYPES = Object.freeze(['ADDED', 'REMOVED', 'CHANGED']);

export function compareEnrichmentPortableBundles(input) {
  assertExactKeys(
    input,
    ['beforeBundle', 'afterBundle'],
    'Portable bundle comparison input',
  );
  const before = assertEngineeringEnrichmentPortableBundle(input.beforeBundle);
  const after = assertEngineeringEnrichmentPortableBundle(input.afterBundle);
  const identityChanges = compareIdentityHashes(
    before.artifactHashes,
    after.artifactHashes,
  );
  const candidateChanges = compareRecordSets({
    beforeRows: before.artifacts.candidateProjection.rows,
    afterRows: after.artifacts.candidateProjection.rows,
    keyOf: candidateKey,
  });
  const metricChanges = compareRecordSets({
    beforeRows: before.artifacts.numericalImpact.deltas,
    afterRows: after.artifacts.numericalImpact.deltas,
    keyOf: metricKey,
  });
  const evidenceChanges = compareNamedEvidence(before, after);
  const differenceCount = identityChanges.length
    + candidateChanges.length
    + metricChanges.length
    + evidenceChanges.length;
  const status = differenceCount === 0
    ? 'NO_EXACT_SHADOW_DIFFERENCES'
    : 'RECORDED_EXACT_SHADOW_DIFFERENCES';
  const material = {
    schema: ENRICHMENT_PORTABLE_COMPARISON_SCHEMA,
    beforeBundleHash: before.bundleHash,
    afterBundleHash: after.bundleHash,
    comparisonBasis: 'EXACT_CANONICAL_SHADOW_EVIDENCE',
    identityChanges,
    candidateChanges,
    metricChanges,
    evidenceChanges,
    summary: deepFreeze({
      identityChangeCount: identityChanges.length,
      candidateChangeCount: candidateChanges.length,
      metricChangeCount: metricChanges.length,
      evidenceChangeCount: evidenceChanges.length,
      differenceCount,
      status,
    }),
    status,
    comparisonJudgement: 'NOT_AUTHORIZED',
    numericalPolicy: deepFreeze({
      mode: 'EXACT_REPRESENTATION_ONLY',
      toleranceApplied: false,
      thresholdEvaluation: 'NOT_AUTHORIZED',
      precisionPolicyHash: null,
    }),
    persistenceCreated: false,
    reviewDecisionCreated: false,
    approvalGranted: false,
    current: false,
    sealEligible: false,
    calculationEligible: false,
    resultAcceptanceEligible: false,
  };
  return deepFreeze({
    ...material,
    comparisonHash: semanticHash(material),
  });
}

export function assertEngineeringEnrichmentPortableBundleComparison(value) {
  assertExactKeys(value, [
    'schema',
    'beforeBundleHash',
    'afterBundleHash',
    'comparisonBasis',
    'identityChanges',
    'candidateChanges',
    'metricChanges',
    'evidenceChanges',
    'summary',
    'status',
    'comparisonJudgement',
    'numericalPolicy',
    ...FALSE_AUTHORITY_FIELDS,
    'comparisonHash',
  ], 'Engineering enrichment portable bundle comparison');
  if (value.schema !== ENRICHMENT_PORTABLE_COMPARISON_SCHEMA) {
    fail(`schema must be ${ENRICHMENT_PORTABLE_COMPARISON_SCHEMA}.`);
  }
  if (value.comparisonBasis !== 'EXACT_CANONICAL_SHADOW_EVIDENCE') {
    fail('comparisonBasis is invalid.');
  }
  if (![
    'NO_EXACT_SHADOW_DIFFERENCES',
    'RECORDED_EXACT_SHADOW_DIFFERENCES',
  ].includes(value.status)) {
    fail('status is invalid.');
  }
  if (value.comparisonJudgement !== 'NOT_AUTHORIZED') {
    fail('comparison must not create an engineering judgement.', RangeError);
  }
  assertNumericalPolicy(value.numericalPolicy);
  FALSE_AUTHORITY_FIELDS.forEach((field) => {
    if (value[field] !== false) fail(`${field} must remain false.`, RangeError);
  });
  const identityChanges = validateNamedChanges(
    value.identityChanges,
    'identityChanges',
  );
  const candidateChanges = validateRecordChanges(
    value.candidateChanges,
    'candidateChanges',
  );
  const metricChanges = validateRecordChanges(
    value.metricChanges,
    'metricChanges',
  );
  const evidenceChanges = validateNamedChanges(
    value.evidenceChanges,
    'evidenceChanges',
  );
  assertSummary(value.summary, {
    identityChanges,
    candidateChanges,
    metricChanges,
    evidenceChanges,
    status: value.status,
  });
  const material = comparisonMaterial(value);
  if (value.comparisonHash !== semanticHash(material)) {
    fail('comparisonHash is invalid.', RangeError);
  }
  return value;
}

function compareIdentityHashes(before, after) {
  const fields = [...new Set([
    ...Object.keys(before),
    ...Object.keys(after),
  ])].sort(compareAscii);
  return deepFreeze(fields.flatMap((field) => {
    const beforeValue = before[field] ?? null;
    const afterValue = after[field] ?? null;
    return canonicalStringify(beforeValue) === canonicalStringify(afterValue)
      ? []
      : [namedChange(field, beforeValue, afterValue)];
  }));
}

function compareRecordSets({
  beforeRows,
  afterRows,
  keyOf,
}) {
  if (!Array.isArray(beforeRows) || !Array.isArray(afterRows)) {
    fail('record-set comparison inputs must be arrays.');
  }
  const beforeMap = indexRows(beforeRows, keyOf, 'before');
  const afterMap = indexRows(afterRows, keyOf, 'after');
  const keys = [...new Set([
    ...beforeMap.keys(),
    ...afterMap.keys(),
  ])].sort(compareAscii);
  return deepFreeze(keys.flatMap((key) => {
    const before = beforeMap.get(key) ?? null;
    const after = afterMap.get(key) ?? null;
    if (before !== null && after !== null
      && canonicalStringify(before) === canonicalStringify(after)) {
      return [];
    }
    return [recordChange(key, before, after)];
  }));
}

function compareNamedEvidence(before, after) {
  const fields = [
    ['reviewPacket.contextIdentities',
      before.artifacts.reviewPacket.contextIdentities,
      after.artifacts.reviewPacket.contextIdentities],
    ['reviewPacket.status',
      before.artifacts.reviewPacket.status,
      after.artifacts.reviewPacket.status],
    ['reviewPacket.blockers',
      before.artifacts.reviewPacket.blockers,
      after.artifacts.reviewPacket.blockers],
    ['numericalImpact.status',
      before.artifacts.numericalImpact.status,
      after.artifacts.numericalImpact.status],
    ['numericalImpact.blockers',
      before.artifacts.numericalImpact.blockers,
      after.artifacts.numericalImpact.blockers],
    ['baselineResult.complete',
      before.artifacts.baselineResult.complete,
      after.artifacts.baselineResult.complete],
    ['baselineResult.diagnostics',
      before.artifacts.baselineResult.diagnostics,
      after.artifacts.baselineResult.diagnostics],
    ['candidateResult.complete',
      before.artifacts.candidateResult.complete,
      after.artifacts.candidateResult.complete],
    ['candidateResult.diagnostics',
      before.artifacts.candidateResult.diagnostics,
      after.artifacts.candidateResult.diagnostics],
    ['stalenessReport.status',
      before.artifacts.stalenessReport?.status ?? null,
      after.artifacts.stalenessReport?.status ?? null],
    ['stalenessReport.differences',
      before.artifacts.stalenessReport?.differences ?? null,
      after.artifacts.stalenessReport?.differences ?? null],
    ['reproducibilityReceipt.status',
      before.artifacts.reproducibilityReceipt?.status ?? null,
      after.artifacts.reproducibilityReceipt?.status ?? null],
    ['reproducibilityReceipt.differences',
      before.artifacts.reproducibilityReceipt?.differences ?? null,
      after.artifacts.reproducibilityReceipt?.differences ?? null],
  ];
  return deepFreeze(fields.flatMap(([field, beforeValue, afterValue]) => (
    canonicalStringify(beforeValue) === canonicalStringify(afterValue)
      ? []
      : [namedChange(field, beforeValue, afterValue)]
  )));
}

function indexRows(rows, keyOf, label) {
  const result = new Map();
  rows.forEach((row, index) => {
    const key = requiredText(keyOf(row), `${label} row key at index ${index}`);
    if (result.has(key)) {
      fail(`duplicate ${label} row key: ${key}.`, RangeError);
    }
    result.set(key, canonicalValue(row));
  });
  return result;
}

function candidateKey(row) {
  return requiredText(row?.proposalId, 'candidate proposalId');
}

function metricKey(row) {
  return [
    requiredText(row?.metricId, 'metricId'),
    requiredText(row?.scopeId, 'scopeId'),
    requiredText(row?.loadCaseId, 'loadCaseId'),
  ].join('\u0000');
}

function namedChange(field, before, after) {
  return deepFreeze({
    field,
    before: canonicalValue(before),
    after: canonicalValue(after),
  });
}

function recordChange(key, before, after) {
  const changeType = before === null
    ? 'ADDED'
    : after === null
      ? 'REMOVED'
      : 'CHANGED';
  return deepFreeze({
    key,
    changeType,
    before: canonicalValue(before),
    after: canonicalValue(after),
  });
}

function validateNamedChanges(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  const fields = [];
  value.forEach((row, index) => {
    assertExactKeys(
      row,
      ['field', 'before', 'after'],
      `${label}[${index}]`,
    );
    const field = requiredText(row.field, `${label}[${index}].field`);
    if (canonicalStringify(row.before) === canonicalStringify(row.after)) {
      fail(`${label}[${index}] does not contain a change.`, RangeError);
    }
    fields.push(field);
  });
  assertSortedUnique(fields, label);
  return value;
}

function validateRecordChanges(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  const keys = [];
  value.forEach((row, index) => {
    assertExactKeys(
      row,
      ['key', 'changeType', 'before', 'after'],
      `${label}[${index}]`,
    );
    const key = requiredText(row.key, `${label}[${index}].key`);
    if (!CHANGE_TYPES.includes(row.changeType)) {
      fail(`${label}[${index}].changeType is invalid.`);
    }
    if (
      (row.changeType === 'ADDED' && (row.before !== null || row.after === null))
      || (row.changeType === 'REMOVED' && (row.before === null || row.after !== null))
      || (row.changeType === 'CHANGED' && (
        row.before === null
        || row.after === null
        || canonicalStringify(row.before) === canonicalStringify(row.after)
      ))
    ) {
      fail(`${label}[${index}] values disagree with changeType.`, RangeError);
    }
    keys.push(key);
  });
  assertSortedUnique(keys, label);
  return value;
}

function assertSummary(value, changes) {
  assertExactKeys(value, [
    'identityChangeCount',
    'candidateChangeCount',
    'metricChangeCount',
    'evidenceChangeCount',
    'differenceCount',
    'status',
  ], 'Comparison summary');
  const expected = {
    identityChangeCount: changes.identityChanges.length,
    candidateChangeCount: changes.candidateChanges.length,
    metricChangeCount: changes.metricChanges.length,
    evidenceChangeCount: changes.evidenceChanges.length,
  };
  const differenceCount = Object.values(expected).reduce(
    (total, count) => total + count,
    0,
  );
  Object.entries(expected).forEach(([field, count]) => {
    if (value[field] !== count) {
      fail(`summary.${field} is invalid.`, RangeError);
    }
  });
  if (value.differenceCount !== differenceCount) {
    fail('summary.differenceCount is invalid.', RangeError);
  }
  const expectedStatus = differenceCount === 0
    ? 'NO_EXACT_SHADOW_DIFFERENCES'
    : 'RECORDED_EXACT_SHADOW_DIFFERENCES';
  if (value.status !== expectedStatus || changes.status !== expectedStatus) {
    fail('summary status is invalid.', RangeError);
  }
}

function assertNumericalPolicy(value) {
  assertExactKeys(value, [
    'mode',
    'toleranceApplied',
    'thresholdEvaluation',
    'precisionPolicyHash',
  ], 'Numerical comparison policy');
  if (
    value.mode !== 'EXACT_REPRESENTATION_ONLY'
    || value.toleranceApplied !== false
    || value.thresholdEvaluation !== 'NOT_AUTHORIZED'
    || value.precisionPolicyHash !== null
  ) {
    fail('numerical comparison policy must remain exact and unauthorized.', RangeError);
  }
}

function comparisonMaterial(value) {
  return {
    schema: value.schema,
    beforeBundleHash: value.beforeBundleHash,
    afterBundleHash: value.afterBundleHash,
    comparisonBasis: value.comparisonBasis,
    identityChanges: value.identityChanges,
    candidateChanges: value.candidateChanges,
    metricChanges: value.metricChanges,
    evidenceChanges: value.evidenceChanges,
    summary: value.summary,
    status: value.status,
    comparisonJudgement: value.comparisonJudgement,
    numericalPolicy: value.numericalPolicy,
    persistenceCreated: value.persistenceCreated,
    reviewDecisionCreated: value.reviewDecisionCreated,
    approvalGranted: value.approvalGranted,
    current: value.current,
    sealEligible: value.sealEligible,
    calculationEligible: value.calculationEligible,
    resultAcceptanceEligible: value.resultAcceptanceEligible,
  };
}

function canonicalValue(value) {
  return value === null ? null : deepFreeze(canonicalizeJson(value));
}

function assertSortedUnique(values, label) {
  const sorted = [...values].sort(compareAscii);
  if (
    sorted.length !== new Set(sorted).size
    || sorted.some((value, index) => value !== values[index])
  ) {
    fail(`${label} must be sorted and unique.`, RangeError);
  }
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
  throw new Constructor(`EngineeringEnrichmentPortableBundleComparison: ${message}`);
}
