const RESTRAINT_CARRIER_TYPES = new Set(['ANCI', 'ATTA']);

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizedKinds(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .map((value) => text(value).toUpperCase().replace(/\s+/g, ''))
    .filter(Boolean))];
}

export function decideMissingStagedRestRestraint({
  componentType = '',
  hasExistingRestraint = false,
  ledgerSupportTypes = [],
  stagedSupportTypes = [],
  jsonRestraintsEnabled = true,
} = {}) {
  const normalizedComponentType = text(componentType).toUpperCase();
  const supportTypes = normalizedKinds([...normalizedKinds(ledgerSupportTypes), ...normalizedKinds(stagedSupportTypes)]);
  if (!jsonRestraintsEnabled) return { apply: false, reason: 'json-restraints-disabled', componentType: normalizedComponentType, supportTypes };
  if (!RESTRAINT_CARRIER_TYPES.has(normalizedComponentType)) return { apply: false, reason: 'unsupported-component-type', componentType: normalizedComponentType, supportTypes };
  if (hasExistingRestraint) return { apply: false, reason: 'existing-restraint-preserved', componentType: normalizedComponentType, supportTypes };
  if (!supportTypes.includes('REST')) return { apply: false, reason: 'rest-not-derived', componentType: normalizedComponentType, supportTypes };
  return { apply: true, reason: 'missing-restraint-with-staged-rest', componentType: normalizedComponentType, supportTypes };
}
