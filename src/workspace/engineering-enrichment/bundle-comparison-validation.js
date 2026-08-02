import {
  canonicalStringify,
  semanticHash,
} from '../../core/shared-piping-model/canonical-json.js';
import {
  deepFreeze,
} from '../../core/shared-piping-model/immutable.js';
import {
  ENRICHMENT_PORTABLE_COMPARISON_SCHEMA,
  assertEngineeringEnrichmentPortableBundleComparison as assertComparisonBase,
  compareEnrichmentPortableBundles as compareBundlesBase,
} from './bundle-comparison.js';

export { ENRICHMENT_PORTABLE_COMPARISON_SCHEMA };

export function compareEnrichmentPortableBundles(input) {
  const comparison = compareBundlesBase(input);
  const evidenceChanges = deepFreeze(
    [...comparison.evidenceChanges].sort(compareEvidenceRows),
  );
  const { comparisonHash: ignored, ...baseMaterial } = comparison;
  const material = {
    ...baseMaterial,
    evidenceChanges,
  };
  return deepFreeze({
    ...material,
    comparisonHash: semanticHash(material),
  });
}

export function assertEngineeringEnrichmentPortableBundleComparison(value) {
  assertEvidenceOrder(value?.evidenceChanges);
  return assertComparisonBase(value);
}

function assertEvidenceOrder(value) {
  if (!Array.isArray(value)) {
    fail('evidenceChanges must be an array.');
  }
  const fields = value.map((row, index) => {
    const field = String(row?.field ?? '').trim();
    if (!field) fail(`evidenceChanges[${index}].field is required.`);
    return field;
  });
  const sorted = [...fields].sort(compareAscii);
  if (
    sorted.length !== new Set(sorted).size
    || sorted.some((field, index) => field !== fields[index])
  ) {
    fail('evidenceChanges must be sorted and unique.', RangeError);
  }
  if (canonicalStringify(value) !== canonicalStringify(
    [...value].sort(compareEvidenceRows),
  )) {
    fail('evidenceChanges differ from canonical order.', RangeError);
  }
}

function compareEvidenceRows(left, right) {
  return compareAscii(String(left.field), String(right.field));
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message, Constructor = TypeError) {
  throw new Constructor(
    `EngineeringEnrichmentPortableBundleComparisonValidation: ${message}`,
  );
}
