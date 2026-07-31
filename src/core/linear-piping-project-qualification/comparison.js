import { exactKeys, nonEmptyString } from '../shared-analysis-contract/validation.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { requireCurrentLinearPipingPresentation } from '../linear-piping-presentation/index.js';
import {
  AUTHORITY_KINDS,
  COMPARISON_RULE_ID,
  OBSERVATION_KEYS,
  QUALIFICATION_KINDS,
  QUALIFICATION_REQUEST_SCHEMA,
  QUALIFICATION_RESULT_SCHEMA,
  SELECTOR_KINDS,
  VECTOR_COMPONENTS,
  canonicalAbsoluteTolerance,
  canonicalAuthority,
  canonicalReferenceValue,
  canonicalRelativeTolerance,
  compareAscii,
  failQualification,
  requireArray,
  requireHash,
  requireQualificationProfile,
} from './contracts.js';

export const QUALIFICATION_INPUT_KEYS = Object.freeze([
  'schema',
  'qualificationId',
  'qualificationKind',
  'applicationResult',
  'presentation',
  'authority',
  'observations',
  'profile',
]);
export const QUALIFICATION_RESULT_KEYS = Object.freeze([
  'schema',
  'qualificationId',
  'qualificationKind',
  'applicationResultSemanticHash',
  'applicationResultEvidenceHash',
  'presentationSemanticHash',
  'presentationEvidenceHash',
  'authority',
  'profileId',
  'profileSemanticHash',
  'comparisons',
  'status',
  'semanticHash',
  'evidenceHash',
]);
export const COMPARISON_KEYS = Object.freeze([
  'comparisonId',
  'selector',
  'referenceValue',
  'applicationValue',
  'absoluteTolerance',
  'relativeTolerance',
  'absoluteDifference',
  'relativeDifference',
  'status',
]);

const VECTOR_SELECTOR_KEYS = Object.freeze(['kind', 'interfaceId', 'loadCaseId', 'component']);
const NOZZLE_SELECTOR_KEYS = Object.freeze(['kind', 'interfaceId', 'loadCaseId']);
const B31_SELECTOR_KEYS = Object.freeze(['kind', 'checkId']);
const RESULT_STATUSES = Object.freeze(['PASS', 'FAIL']);

export function compileLinearPipingQualificationComparison(input) {
  exactKeys(input, QUALIFICATION_INPUT_KEYS, 'qualificationComparisonInput');
  if (input.schema !== QUALIFICATION_REQUEST_SCHEMA) {
    failQualification('Qualification request schema is invalid.', 'PIPING_QUALIFICATION_REQUEST_INVALID');
  }
  const qualificationId = nonEmptyString(input.qualificationId, 'qualificationComparisonInput.qualificationId');
  if (!QUALIFICATION_KINDS.includes(input.qualificationKind)) {
    failQualification('Qualification kind is unsupported.', 'PIPING_QUALIFICATION_KIND_INVALID');
  }
  const presentation = requireCurrentLinearPipingPresentation(input.presentation, input.applicationResult);
  const authority = canonicalAuthority(input.authority, input.qualificationKind);
  const profile = requireQualificationProfile(input.profile);
  const comparisons = requireArray(input.observations, 'qualificationComparisonInput.observations')
    .map((observation, index) => compileObservation(
      observation,
      index,
      presentation,
      profile,
    ))
    .sort((left, right) => compareAscii(left.comparisonId, right.comparisonId));
  if (comparisons.length === 0) {
    failQualification('Qualification comparison requires at least one observation.', 'PIPING_QUALIFICATION_EMPTY');
  }
  requireUnique(comparisons.map((row) => row.comparisonId));

  const draft = {
    schema: QUALIFICATION_RESULT_SCHEMA,
    qualificationId,
    qualificationKind: input.qualificationKind,
    applicationResultSemanticHash: input.applicationResult.semanticHash,
    applicationResultEvidenceHash: input.applicationResult.evidenceHash,
    presentationSemanticHash: presentation.semanticHash,
    presentationEvidenceHash: presentation.evidenceHash,
    authority,
    profileId: profile.profileId,
    profileSemanticHash: profile.semanticHash,
    comparisons,
    status: comparisons.every((row) => row.status === 'PASS') ? 'PASS' : 'FAIL',
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = semanticHash(qualificationSemanticProjection(draft));
  draft.evidenceHash = computeQualificationEvidenceHash(draft);
  return requireLinearPipingQualificationComparison(draft);
}

function compileObservation(source, index, presentation, profile) {
  const field = `qualificationComparisonInput.observations[${index}]`;
  exactKeys(source, OBSERVATION_KEYS, field);
  const comparisonId = nonEmptyString(source.comparisonId, `${field}.comparisonId`);
  const selector = canonicalSelector(source.selector, `${field}.selector`);
  const referenceValue = canonicalReferenceValue(source.referenceValue, `${field}.referenceValue`);
  const absoluteTolerance = canonicalAbsoluteTolerance(
    source.absoluteTolerance,
    `${field}.absoluteTolerance`,
  );
  const relativeTolerance = canonicalRelativeTolerance(
    source.relativeTolerance,
    `${field}.relativeTolerance`,
  );
  const applicationValue = resolveApplicationValue(selector, presentation);
  if (referenceValue.unit !== applicationValue.unit
    || absoluteTolerance.unit !== applicationValue.unit) {
    failQualification(
      `${field} units do not match the selected application quantity.`,
      'PIPING_QUALIFICATION_UNIT_MISMATCH',
      {
        referenceUnit: referenceValue.unit,
        toleranceUnit: absoluteTolerance.unit,
        applicationUnit: applicationValue.unit,
      },
    );
  }
  const absoluteDifference = Math.abs(applicationValue.value - referenceValue.value);
  const relativeScale = Math.max(
    Math.abs(applicationValue.value),
    Math.abs(referenceValue.value),
    profile.relativeScaleFloor.value,
  );
  const relativeDifference = absoluteDifference / relativeScale;
  const status = absoluteDifference <= absoluteTolerance.value
    || relativeDifference <= relativeTolerance.value
    ? 'PASS'
    : 'FAIL';
  return deepFreeze({
    comparisonId,
    selector,
    referenceValue,
    applicationValue,
    absoluteTolerance,
    relativeTolerance,
    absoluteDifference,
    relativeDifference,
    status,
  });
}

function canonicalSelector(source, field) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    failQualification(`${field} must be a record.`, 'PIPING_QUALIFICATION_SELECTOR_INVALID');
  }
  if (!SELECTOR_KINDS.includes(source.kind)) {
    failQualification(`${field}.kind is unsupported.`, 'PIPING_QUALIFICATION_SELECTOR_INVALID');
  }
  if (source.kind === 'INTERFACE_FORCE_LOCAL'
    || source.kind === 'INTERFACE_MOMENT_REFERENCE_LOCAL') {
    exactKeys(source, VECTOR_SELECTOR_KEYS, field);
    if (!VECTOR_COMPONENTS.includes(source.component)) {
      failQualification(`${field}.component is unsupported.`, 'PIPING_QUALIFICATION_SELECTOR_INVALID');
    }
    return deepFreeze({
      kind: source.kind,
      interfaceId: nonEmptyString(source.interfaceId, `${field}.interfaceId`),
      loadCaseId: nonEmptyString(source.loadCaseId, `${field}.loadCaseId`),
      component: source.component,
    });
  }
  if (source.kind === 'NOZZLE_UTILIZATION') {
    exactKeys(source, NOZZLE_SELECTOR_KEYS, field);
    return deepFreeze({
      kind: source.kind,
      interfaceId: nonEmptyString(source.interfaceId, `${field}.interfaceId`),
      loadCaseId: nonEmptyString(source.loadCaseId, `${field}.loadCaseId`),
    });
  }
  exactKeys(source, B31_SELECTOR_KEYS, field);
  return deepFreeze({
    kind: source.kind,
    checkId: nonEmptyString(source.checkId, `${field}.checkId`),
  });
}

function resolveApplicationValue(selector, presentation) {
  if (selector.kind === 'INTERFACE_FORCE_LOCAL'
    || selector.kind === 'INTERFACE_MOMENT_REFERENCE_LOCAL') {
    const row = presentation.interfaceRows.find((entry) => (
      entry.interfaceId === selector.interfaceId && entry.loadCaseId === selector.loadCaseId
    ));
    if (!row) {
      failQualification('Selected interface result is absent.', 'PIPING_QUALIFICATION_APPLICATION_VALUE_MISSING');
    }
    const key = selector.component.toLowerCase();
    return deepFreeze({
      value: selector.kind === 'INTERFACE_FORCE_LOCAL'
        ? row.forceLocal[key]
        : row.momentAtReferenceLocal[key],
      unit: selector.kind === 'INTERFACE_FORCE_LOCAL' ? row.units.force : row.units.moment,
      sourceSemanticHash: row.resultSemanticHash,
    });
  }
  if (selector.kind === 'NOZZLE_UTILIZATION') {
    const row = presentation.nozzleRows.find((entry) => (
      entry.interfaceId === selector.interfaceId && entry.loadCaseId === selector.loadCaseId
    ));
    if (!row) {
      failQualification('Selected nozzle assessment is absent.', 'PIPING_QUALIFICATION_APPLICATION_VALUE_MISSING');
    }
    return deepFreeze({ value: row.utilization, unit: '1', sourceSemanticHash: row.semanticHash });
  }
  const row = presentation.codeRows.find((entry) => entry.checkId === selector.checkId);
  if (!row) {
    failQualification('Selected B31 result is absent.', 'PIPING_QUALIFICATION_APPLICATION_VALUE_MISSING');
  }
  return deepFreeze({
    value: selector.kind === 'B31_CALCULATED_STRESS' ? row.calculatedStress : row.utilization,
    unit: selector.kind === 'B31_CALCULATED_STRESS' ? 'Pa' : '1',
    sourceSemanticHash: row.semanticHash,
  });
}

function requireUnique(values) {
  if (new Set(values).size !== values.length) {
    failQualification('Qualification comparison IDs must be unique.', 'PIPING_QUALIFICATION_ID_DUPLICATE');
  }
}

export function requireLinearPipingQualificationComparison(record) {
  exactKeys(record, QUALIFICATION_RESULT_KEYS, 'qualificationComparison');
  if (record.schema !== QUALIFICATION_RESULT_SCHEMA
    || !QUALIFICATION_KINDS.includes(record.qualificationKind)) {
    failQualification('Qualification comparison record is invalid.', 'PIPING_QUALIFICATION_RESULT_INVALID');
  }
  nonEmptyString(record.qualificationId, 'qualificationComparison.qualificationId');
  requireHash(record.applicationResultSemanticHash, 'qualificationComparison.applicationResultSemanticHash');
  requireHash(record.applicationResultEvidenceHash, 'qualificationComparison.applicationResultEvidenceHash');
  requireHash(record.presentationSemanticHash, 'qualificationComparison.presentationSemanticHash');
  requireHash(record.presentationEvidenceHash, 'qualificationComparison.presentationEvidenceHash');
  canonicalAuthority(record.authority, record.qualificationKind);
  nonEmptyString(record.profileId, 'qualificationComparison.profileId');
  requireHash(record.profileSemanticHash, 'qualificationComparison.profileSemanticHash');
  requireHash(record.semanticHash, 'qualificationComparison.semanticHash');
  requireHash(record.evidenceHash, 'qualificationComparison.evidenceHash');
  const comparisons = requireArray(record.comparisons, 'qualificationComparison.comparisons');
  for (const [index, row] of comparisons.entries()) {
    exactKeys(row, COMPARISON_KEYS, `qualificationComparison.comparisons[${index}]`);
    if (!RESULT_STATUSES.includes(row.status)) {
      failQualification('Comparison row status is invalid.', 'PIPING_QUALIFICATION_RESULT_INVALID');
    }
    requireHash(row.applicationValue.sourceSemanticHash, `qualificationComparison.comparisons[${index}].applicationValue.sourceSemanticHash`);
  }
  if (!RESULT_STATUSES.includes(record.status)
    || record.status !== (comparisons.every((row) => row.status === 'PASS') ? 'PASS' : 'FAIL')) {
    failQualification('Qualification aggregate status is invalid.', 'PIPING_QUALIFICATION_RESULT_INVALID');
  }
  if (record.semanticHash !== semanticHash(qualificationSemanticProjection(record))) {
    failQualification('Qualification semantic hash is stale.', 'PIPING_QUALIFICATION_HASH_MISMATCH');
  }
  if (record.evidenceHash !== computeQualificationEvidenceHash(record)) {
    failQualification('Qualification evidence hash is stale.', 'PIPING_QUALIFICATION_HASH_MISMATCH');
  }
  return deepFreeze({ ...record });
}

export function qualificationSemanticProjection(record) {
  const { semanticHash: _semanticHash, evidenceHash: _evidenceHash, ...projection } = record;
  return projection;
}

export function computeQualificationEvidenceHash(record) {
  return semanticHash({
    semanticHash: record.semanticHash,
    authority: record.authority,
    profileSemanticHash: record.profileSemanticHash,
    comparisonSources: record.comparisons.map((row) => ({
      comparisonId: row.comparisonId,
      applicationSourceSemanticHash: row.applicationValue.sourceSemanticHash,
      toleranceSources: [row.absoluteTolerance.source, row.relativeTolerance.source],
    })),
  });
}
