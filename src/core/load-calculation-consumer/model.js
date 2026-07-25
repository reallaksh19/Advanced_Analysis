import {
  canonicalStringify,
  deepFreeze,
  semanticHash,
} from '../shared-piping-model/index.js';
import {
  validateLoadCaseSet,
  validateModelLoadPrimitiveSet,
  validateModelLoadReadinessAudit,
} from '../model-loads/index.js';
import {
  validateSupportLoadScreeningAudit,
  validateTributarySupportLoadScreening,
  validateVerticalLoadPathModel,
} from '../support-load-screening/index.js';
import { validateWorkspaceConsumerContext } from '../workspace-consumers/index.js';
import {
  LOAD_CALCULATION_LIMITATIONS,
  LOAD_CALCULATION_REVIEW_MODEL_SCHEMA,
  REVIEW_DIAGNOSTIC_CODES,
} from './constants.js';
import {
  projectComponentOutcomes,
  projectLoadCases,
  projectPrimitives,
  projectScreeningSummary,
} from './projection.js';

export function createLoadCalculationReviewModel(context) {
  assertContext(context);
  const required = requiredEvidence(context);
  const optional = optionalScreeningEvidence(context, required);
  const sourceReferences = references(required, optional.evidence);
  const loadCases = projectLoadCases(required.loadCaseSet, required.readinessAudit);
  const componentOutcomes = projectComponentOutcomes(required.primitiveSet);
  const primitives = projectPrimitives(required.primitiveSet);
  const screeningSummary = optional.evidence
    ? projectScreeningSummary(optional.evidence.pathModel, optional.evidence.screening, optional.evidence.audit)
    : deepFreeze([]);
  const assumptions = profileEvidence(required.primitiveSet);
  const diagnostics = deepFreeze([...optional.diagnostics].sort(diagnosticOrder));
  const summary = summaryEvidence(required, optional.evidence, componentOutcomes.length);
  const identity = {
    schema: LOAD_CALCULATION_REVIEW_MODEL_SCHEMA,
    datasetId: context.datasetId,
    contextSemanticHash: context.semanticHash,
    sourceReferences,
    loadCases,
    componentOutcomes,
    primitives,
    screeningSummary,
    assumptions,
    limitations: LOAD_CALCULATION_LIMITATIONS,
    diagnostics,
    summary,
  };
  const reviewModelId = `load-calculation-review-model:${semanticHash(identity).split(':')[1]}`;
  const semanticHashValue = semanticHash({ ...identity, reviewModelId });
  return deepFreeze({
    ...identity,
    reviewModelId,
    sourceContext: context,
    semanticHash: semanticHashValue,
  });
}

export function validateLoadCalculationReviewModel(value) {
  const errors = [];
  if (value?.schema !== LOAD_CALCULATION_REVIEW_MODEL_SCHEMA) errors.push('Invalid load-calculation review-model schema.');
  if (!value?.sourceContext) errors.push('Load-calculation review model source context is required.');
  if (!errors.length) {
    try {
      const expected = createLoadCalculationReviewModel(value.sourceContext);
      if (value.sourceContext !== expected.sourceContext) errors.push('Load-calculation source context reference mismatch.');
      if (canonicalStringify(contractPayload(value)) !== canonicalStringify(contractPayload(expected))) {
        errors.push('Load-calculation review model does not match exact source evidence.');
      }
    } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function assertContext(context) {
  const validation = validateWorkspaceConsumerContext(context);
  if (!validation.ok) throw new TypeError(`Invalid workspace consumer context: ${validation.errors.join(' ')}`);
}

function requiredEvidence(context) {
  const source = context.contracts;
  const required = {
    sharedModel: source.sharedModel,
    loadCaseSet: source.loadCaseSet,
    primitiveSet: source.loadPrimitiveSet,
    readinessAudit: source.modelLoadReadinessAudit,
  };
  if (Object.values(required).some((value) => !value)) throw new TypeError('Complete W10.4 model-load evidence is required.');
  validateRequired(required, context.datasetId);
  return required;
}

function validateRequired(evidence, datasetId) {
  assertValid('load-case set', validateLoadCaseSet(evidence.loadCaseSet));
  assertValid('model-load primitive set', validateModelLoadPrimitiveSet(evidence.primitiveSet));
  assertValid('model-load readiness audit', validateModelLoadReadinessAudit(evidence.readinessAudit));
  if (evidence.primitiveSet.datasetId !== datasetId || evidence.readinessAudit.datasetId !== datasetId) throw new TypeError('W10.4 evidence dataset mismatch.');
  if (evidence.primitiveSet.loadCaseSetSemanticHash !== evidence.loadCaseSet.semanticHash) throw new TypeError('Primitive set does not match load cases.');
  if (evidence.readinessAudit.loadCaseSetSemanticHash !== evidence.loadCaseSet.semanticHash) throw new TypeError('Readiness audit does not match load cases.');
  if (evidence.readinessAudit.primitiveSetSemanticHash !== evidence.primitiveSet.semanticHash) throw new TypeError('Readiness audit does not match primitive set.');
  const caseIds = evidence.loadCaseSet.loadCases.map((row) => row.loadCaseId).sort();
  const auditIds = evidence.readinessAudit.cases.map((row) => row.loadCaseId).sort();
  if (canonicalStringify(caseIds) !== canonicalStringify(auditIds)) throw new TypeError('Readiness audit cases do not match load cases.');
}

function optionalScreeningEvidence(context, required) {
  const values = {
    pathModel: context.contracts.verticalLoadPathModel,
    screening: context.contracts.supportLoadScreening,
    audit: context.contracts.supportLoadScreeningAudit,
  };
  const present = Object.values(values).filter(Boolean).length;
  if (!present) return { evidence: null, diagnostics: [] };
  if (present !== 3) return excluded(REVIEW_DIAGNOSTIC_CODES.OPTIONAL_SCREENING_INCOMPLETE, 'Optional W10.5 evidence is incomplete and was excluded.');
  try {
    validateOptional(values, required, context.datasetId);
    return { evidence: values, diagnostics: [] };
  } catch (error) {
    return excluded(REVIEW_DIAGNOSTIC_CODES.OPTIONAL_SCREENING_INVALID, error instanceof Error ? error.message : String(error));
  }
}

function validateOptional(evidence, required, datasetId) {
  assertValid('vertical-load-path model', validateVerticalLoadPathModel(evidence.pathModel));
  assertValid('tributary screening', validateTributarySupportLoadScreening(evidence.screening));
  assertValid('support-load screening audit', validateSupportLoadScreeningAudit(evidence.audit));
  if ([evidence.pathModel, evidence.screening, evidence.audit].some((row) => row.datasetId !== datasetId)) throw new TypeError('W10.5 evidence dataset mismatch.');
  if (evidence.pathModel.sharedModelSemanticHash !== required.sharedModel.semanticHash) throw new TypeError('Vertical paths do not match the shared model.');
  if (evidence.screening.pathModelSemanticHash !== evidence.pathModel.semanticHash) throw new TypeError('Screening does not match vertical paths.');
  if (evidence.screening.loadCaseSetSemanticHash !== required.loadCaseSet.semanticHash) throw new TypeError('Screening does not match load cases.');
  if (evidence.screening.primitiveSetSemanticHash !== required.primitiveSet.semanticHash) throw new TypeError('Screening does not match load primitives.');
  if (evidence.screening.readinessAuditSemanticHash !== required.readinessAudit.semanticHash) throw new TypeError('Screening does not match readiness evidence.');
  if (evidence.audit.screeningSemanticHash !== evidence.screening.semanticHash) throw new TypeError('Screening audit does not match screening evidence.');
}

function references(required, optional) {
  return deepFreeze({
    sharedModelSemanticHash: required.sharedModel.semanticHash,
    loadCaseSetSemanticHash: required.loadCaseSet.semanticHash,
    loadPrimitiveSetSemanticHash: required.primitiveSet.semanticHash,
    modelLoadReadinessAuditSemanticHash: required.readinessAudit.semanticHash,
    verticalLoadPathModelSemanticHash: optional?.pathModel.semanticHash || null,
    supportLoadScreeningSemanticHash: optional?.screening.semanticHash || null,
    supportLoadScreeningAuditSemanticHash: optional?.audit.semanticHash || null,
  });
}

function profileEvidence(primitiveSet) {
  return deepFreeze([
    profileRow('GRAVITY_PROFILE', primitiveSet.gravityProfile),
    profileRow('LOAD_COMPOSITION_PROFILE', primitiveSet.compositionProfile),
  ]);
}
function profileRow(evidenceType, profile) {
  return deepFreeze({ evidenceType, schema: profile.schema, profileId: profile.profileId, profileVersion: profile.profileVersion, semanticHash: profile.semanticHash });
}
function summaryEvidence(required, optional, componentOutcomeCount) {
  return deepFreeze({
    loadCaseCount: required.readinessAudit.summary.caseCount,
    readyLoadCaseCount: required.readinessAudit.summary.readyCaseCount,
    blockedLoadCaseCount: required.readinessAudit.summary.blockedCaseCount,
    componentOutcomeCount,
    primitiveCount: required.primitiveSet.summary.primitiveCount,
    distributedPrimitiveCount: required.primitiveSet.summary.distributedPrimitiveCount,
    pointPrimitiveCount: required.primitiveSet.summary.pointPrimitiveCount,
    explicitMomentCount: required.primitiveSet.summary.explicitMomentCount,
    screeningIncluded: Boolean(optional),
    screeningPathCaseCount: optional?.screening.summary.pathCaseCount || 0,
  });
}
function excluded(code, message) { return { evidence: null, diagnostics: [deepFreeze({ code, severity: 'WARNING', scope: 'OPTIONAL_W10.5', message })] }; }
function assertValid(label, validation) { if (!validation.ok) throw new TypeError(`Invalid ${label}: ${validation.errors.join(' ')}`); }
function diagnosticOrder(a, b) { return `${a.scope}|${a.code}|${a.message}`.localeCompare(`${b.scope}|${b.code}|${b.message}`); }
function contractPayload(value) {
  if (!value || typeof value !== 'object') return value;
  const { sourceContext: _sourceContext, ...payload } = value;
  return payload;
}
