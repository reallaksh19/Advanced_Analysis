import { freezeDeep } from './dataset-utils.js';

export const WORKSPACE_ANALYSIS_READINESS_SCHEMA = 'workspace-analysis-readiness/v1';

export const WORKSPACE_QUALIFICATION_STATUS = Object.freeze({
  READY: 'READY_FOR_REVIEWED_EXECUTION',
  INPUT_REQUIRED: 'INPUT_REQUIRED',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
});

export function createWorkspaceAnalysisReadiness({
  capability,
  context,
  inspection,
  applicability,
  evaluatedReadiness,
}) {
  assertInputs(capability, context, inspection);
  const manifest = capability.manifest;
  const applicable = applicability.applicable === true;
  const fieldAssessment = assessFields(inspection.fields);
  const missingKeys = uniqueStrings([
    ...(evaluatedReadiness.missing || []),
    ...fieldAssessment.missingInputs.map((item) => item.key),
  ]);
  const invalidKeys = uniqueStrings(fieldAssessment.invalidInputs.map((item) => item.key));
  const readyToReview = applicable;
  const readyToRun = applicable
    && evaluatedReadiness.enabled === true
    && missingKeys.length === 0
    && invalidKeys.length === 0;
  const qualificationStatus = !applicable
    ? WORKSPACE_QUALIFICATION_STATUS.NOT_APPLICABLE
    : readyToRun
      ? WORKSPACE_QUALIFICATION_STATUS.READY
      : WORKSPACE_QUALIFICATION_STATUS.INPUT_REQUIRED;

  return freezeDeep({
    schema: WORKSPACE_ANALYSIS_READINESS_SCHEMA,
    analysisType: capability.id,
    label: capability.label,
    description: capability.description,
    targetId: context.targetId,
    datasetId: context.dataset.datasetId,
    solverId: manifest.solverId,
    solverVersion: manifest.solverVersion,
    methodId: manifest.methodId,
    methodVersion: manifest.methodVersion,
    engineeringLevel: capability.engineeringLevel,
    codeBasis: manifest.codeBasis,
    applicable,
    applicabilityReason: applicable ? '' : applicability.reason,
    qualificationStatus,
    requiredInputs: fieldAssessment.requiredInputs,
    resolvedInputs: fieldAssessment.resolvedInputs,
    missingInputs: missingKeys.map((key) => missingInput(key, inspection.fields)),
    invalidInputs: fieldAssessment.invalidInputs,
    assumptions: manifest.assumptions,
    limitations: manifest.limitations,
    diagnostics: buildDiagnostics({
      applicable,
      applicabilityReason: applicability.reason,
      evaluatedReason: evaluatedReadiness.reason,
      missingKeys,
      invalidInputs: fieldAssessment.invalidInputs,
    }),
    readyToReview,
    readyToRun,
  });
}

export function validateWorkspaceAnalysisReadiness(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return { ok: false, errors: ['Readiness is not an object.'] };
  if (value.schema !== WORKSPACE_ANALYSIS_READINESS_SCHEMA) errors.push(`schema must be ${WORKSPACE_ANALYSIS_READINESS_SCHEMA}.`);
  for (const key of ['analysisType', 'targetId', 'datasetId', 'solverId', 'solverVersion', 'methodId', 'methodVersion', 'engineeringLevel']) {
    if (typeof value[key] !== 'string' || value[key].trim() === '') errors.push(`${key} must be a non-empty string.`);
  }
  for (const key of ['codeBasis', 'requiredInputs', 'resolvedInputs', 'missingInputs', 'invalidInputs', 'assumptions', 'limitations', 'diagnostics']) {
    if (!Array.isArray(value[key])) errors.push(`${key} must be an array.`);
  }
  if (typeof value.applicable !== 'boolean') errors.push('applicable must be boolean.');
  if (typeof value.readyToReview !== 'boolean') errors.push('readyToReview must be boolean.');
  if (typeof value.readyToRun !== 'boolean') errors.push('readyToRun must be boolean.');
  if (!Object.values(WORKSPACE_QUALIFICATION_STATUS).includes(value.qualificationStatus)) {
    errors.push('qualificationStatus is invalid.');
  }
  if (value.readyToRun && (!value.applicable || value.missingInputs.length || value.invalidInputs.length)) {
    errors.push('readyToRun conflicts with applicability or input evidence.');
  }
  return { ok: errors.length === 0, errors };
}

function assessFields(fields) {
  const requiredInputs = [];
  const resolvedInputs = [];
  const missingInputs = [];
  const invalidInputs = [];
  fields.forEach((field) => {
    const evidence = inputEvidence(field);
    if (field.required) requiredInputs.push(evidence);
    if (field.required && isMissing(field)) missingInputs.push(evidence);
    else if (!isMissing(field)) resolvedInputs.push(evidence);
    const message = validationMessage(field);
    if (message) invalidInputs.push({ ...evidence, message });
  });
  return { requiredInputs, resolvedInputs, missingInputs, invalidInputs };
}

function inputEvidence(field) {
  return {
    key: field.key,
    label: field.label,
    value: field.value,
    unit: field.unit,
    source: field.source,
    sourcePath: field.sourcePath,
    editable: field.editable,
  };
}

function missingInput(key, fields) {
  const field = fields.find((item) => item.key === key);
  return field ? inputEvidence(field) : {
    key,
    label: key,
    value: null,
    unit: '',
    source: 'missing',
    sourcePath: '',
    editable: false,
  };
}

function isMissing(field) {
  return field.value === null || field.value === '' || field.source === 'missing';
}

function validationMessage(field) {
  if (isMissing(field) || field.kind !== 'number') return '';
  const value = Number(field.value);
  if (!Number.isFinite(value)) return `${field.label} must be finite.`;
  if (field.validation === 'positive' && value <= 0) return `${field.label} must be greater than zero.`;
  if (field.validation === 'non-negative' && value < 0) return `${field.label} must be zero or greater.`;
  return '';
}

function buildDiagnostics({ applicable, applicabilityReason, evaluatedReason, missingKeys, invalidInputs }) {
  const diagnostics = [];
  if (!applicable) diagnostics.push(diagnostic('error', 'CAPABILITY_NOT_APPLICABLE', applicabilityReason));
  if (applicable && missingKeys.length) {
    diagnostics.push(diagnostic('warning', 'ANALYSIS_INPUT_REQUIRED', evaluatedReason || `Missing inputs: ${missingKeys.join(', ')}.`));
  }
  invalidInputs.forEach((item) => diagnostics.push(diagnostic('error', 'ANALYSIS_INPUT_INVALID', item.message, { fieldKey: item.key })));
  return diagnostics;
}

function diagnostic(severity, code, message, data = {}) {
  return { severity, code, message: String(message || code), data };
}

function normalizeApplicability(value) {
  if (value === true) return { applicable: true, reason: '' };
  if (value === false || value == null) return { applicable: false, reason: 'Capability is not applicable to this selection.' };
  return { applicable: value.applicable === true, reason: String(value.reason || '') };
}

export function evaluateApplicability(capability, context) {
  return normalizeApplicability(capability.applicability ? capability.applicability(context) : true);
}

function uniqueStrings(values) {
  return [...new Set(values.map(String).filter(Boolean))];
}

function assertInputs(capability, context, inspection) {
  if (!capability?.manifest) throw new TypeError('Workspace readiness requires a capability manifest.');
  if (!context?.dataset?.datasetId || !context?.targetId) throw new TypeError('Workspace readiness requires an analysis context.');
  if (!inspection || !Array.isArray(inspection.fields)) throw new TypeError('Workspace readiness requires input inspection fields.');
}
