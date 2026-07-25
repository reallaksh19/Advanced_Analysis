/**
 * Functionality: creates the shared diagnostic records used by enrichment,
 * weight evaluation, support distribution, and LOADMARKER export.
 * Parameters: explicit diagnostic facts. Outputs: immutable plain records.
 * Fallback: absent optional context remains empty; no engineering value is
 * synthesized by this module.
 */

export const ENGINEERING_DIAGNOSTIC_SCHEMA = 'engineering-diagnostic/v1';

export const ENGINEERING_STATUS = Object.freeze({
  okSource: 'OK_SOURCE',
  okDerived: 'OK_DERIVED_WITH_TRACE',
  sourceZero: 'OK_SOURCE_ZERO',
  notApplicable: 'NOT_APPLICABLE',
  missingSource: 'MISSING_REQUIRED_SOURCE',
  missingMaster: 'MISSING_MASTER_ROW',
  missingComponentWeight: 'MISSING_COMPONENT_WEIGHT',
  missingFluidDensity: 'MISSING_FLUID_DENSITY',
  missingInsulationDensity: 'MISSING_INSULATION_DENSITY',
  missingSupportCapability: 'MISSING_SUPPORT_CAPABILITY',
  blocked: 'BLOCKED',
  partial: 'PARTIAL',
  unsupported: 'UNSUPPORTED_LOAD',
  review: 'ENGINEERING_REVIEW_REQUIRED',
});

export function createEngineeringDiagnostic(input) {
  const severity = text(input?.severity) || 'BLOCKED';
  const field = text(input?.field);
  return Object.freeze({
    schema: ENGINEERING_DIAGNOSTIC_SCHEMA,
    id: text(input?.id) || diagnosticId(input, field),
    severity,
    category: text(input?.category) || 'CALCULATION_BLOCKED',
    field,
    message: text(input?.message) || `${field || 'Calculation'} is blocked.`,
    requiredFor: stringArray(input?.requiredFor),
    sourceExpected: text(input?.sourceExpected),
    fallbackUsed: input?.fallbackUsed === true,
    calculationAction: text(input?.calculationAction) || (severity === 'BLOCKED' ? 'BLOCK' : 'REVIEW'),
    ui: Object.freeze({
      badge: text(input?.ui?.badge) || badgeFor(field),
      icon: text(input?.ui?.icon) || (severity === 'BLOCKED' ? 'X' : '!'),
      color: text(input?.ui?.color) || (severity === 'BLOCKED' ? 'RED' : 'AMBER'),
      layer: text(input?.ui?.layer) || 'engineering-data-health',
    }),
    context: freezePlain(input?.context),
  });
}

export function diagnosticSummary(diagnostics) {
  const rows = Array.isArray(diagnostics) ? diagnostics : [];
  return Object.freeze({
    total: rows.length,
    blocked: rows.filter((row) => row?.severity === 'BLOCKED').length,
    partial: rows.filter((row) => row?.severity === 'PARTIAL').length,
    review: rows.filter((row) => row?.severity === 'ENGINEERING_REVIEW_REQUIRED').length,
  });
}

function diagnosticId(input, field) {
  const owner = text(input?.context?.elementId || input?.context?.supportId || 'workflow');
  return `diag-${safeKey(owner)}-${safeKey(field || input?.category || 'blocked')}`;
}

function badgeFor(field) {
  const key = text(field).toLowerCase();
  if (key.includes('wall')) return 'WT?';
  if (key.includes('componentweight')) return 'CW?';
  if (key.includes('hyd')) return 'HYDρ?';
  if (key.includes('insulation')) return 'INS?';
  if (key.includes('chainage')) return 'CH?';
  if (key.includes('geometry')) return 'POS?';
  return 'DATA?';
}

function stringArray(value) {
  return Object.freeze((Array.isArray(value) ? value : []).map(text).filter(Boolean));
}

function freezePlain(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.freeze({ ...source });
}

function safeKey(value) {
  return text(value).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
}

function text(value) {
  return String(value ?? '').trim();
}
