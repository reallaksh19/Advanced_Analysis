import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { exactKeys, nonEmptyString } from '../shared-analysis-contract/validation.js';
import {
  requireLinearPipingInterfaceRecovery,
  requireLinearPipingInterfaceSet,
} from '../linear-piping-interface/index.js';
import {
  CALCULATION_QUALIFICATION_STATUSES,
  NOZZLE_ASSESSMENT_SCHEMA,
  NOZZLE_ASSESSMENT_STATUSES,
  NOZZLE_INTERACTION_RULE,
  compareAscii,
  failCodeApplication,
  requireHash,
  requireNozzleAllowableProfile,
} from './contracts.js';

export const NOZZLE_ASSESSMENT_INPUT_KEYS = Object.freeze([
  'interfaceSet',
  'interfaceRecovery',
  'allowableProfile',
]);
export const NOZZLE_ASSESSMENT_KEYS = Object.freeze([
  'schema',
  'profileId',
  'profileSemanticHash',
  'interfaceSetSemanticHash',
  'interfaceRecoverySemanticHash',
  'interfaceId',
  'loadCaseId',
  'reportingSignConvention',
  'units',
  'forceLocal',
  'momentAtReferenceLocal',
  'termRatios',
  'interactionRuleId',
  'interactionValue',
  'interactionLimit',
  'utilization',
  'governingTerm',
  'assessmentStatus',
  'qualificationStatus',
  'limitations',
  'semanticHash',
  'evidenceHash',
]);

const TERM_IDS = Object.freeze(['FX', 'FY', 'FZ', 'MX', 'MY', 'MZ']);

export function compileNozzleAllowableAssessment(input) {
  exactKeys(input, NOZZLE_ASSESSMENT_INPUT_KEYS, 'nozzleAssessmentInput');
  const interfaceSet = requireLinearPipingInterfaceSet(input.interfaceSet);
  const recovery = requireLinearPipingInterfaceRecovery(input.interfaceRecovery);
  const profile = requireNozzleAllowableProfile(input.allowableProfile);

  if (recovery.interfaceSetSemanticHash !== interfaceSet.semanticHash) {
    failCodeApplication(
      'Interface recovery does not belong to the supplied interface set.',
      'PIPING_NOZZLE_INTERFACE_PARENT_MISMATCH',
    );
  }
  const definition = interfaceSet.interfaces.find((row) => row.interfaceId === profile.interfaceId);
  const result = recovery.results.find((row) => row.interfaceId === profile.interfaceId);
  if (!definition || !result) {
    failCodeApplication(
      `Nozzle interface ${profile.interfaceId} is absent from the governed interface result.`,
      'PIPING_NOZZLE_INTERFACE_MISSING',
    );
  }
  if (definition.interfaceKind !== 'NOZZLE' || result.interfaceKind !== 'NOZZLE') {
    failCodeApplication(
      `Interface ${profile.interfaceId} is not a NOZZLE.`,
      'PIPING_NOZZLE_INTERFACE_KIND_INVALID',
    );
  }
  if (definition.allowableProfileHash !== profile.semanticHash) {
    failCodeApplication(
      'Nozzle allowable profile does not match the hash declared by the interface.',
      'PIPING_NOZZLE_ALLOWABLE_PROFILE_MISMATCH',
    );
  }
  if (recovery.units?.force !== 'N' || recovery.units?.moment !== 'N*m' || recovery.units?.length !== 'm') {
    failCodeApplication(
      'Nozzle assessment requires canonical linear-FEA units N, N*m and m.',
      'PIPING_NOZZLE_UNITS_INVALID',
      { units: recovery.units },
    );
  }

  const termRatios = buildTermRatios(result, profile);
  const interactionValue = TERM_IDS.reduce((sum, termId) => sum + termRatios[termId], 0);
  const interactionLimit = profile.interactionLimit.value;
  const normalizedInteraction = interactionValue / interactionLimit;
  const governing = Object.entries(termRatios)
    .map(([termId, value]) => ({ termId, value }))
    .sort((left, right) => right.value - left.value || compareAscii(left.termId, right.termId))[0];
  const utilization = Math.max(governing.value, normalizedInteraction);
  const assessmentStatus = utilization <= 1 ? 'PASS' : 'FAIL';

  const draft = {
    schema: NOZZLE_ASSESSMENT_SCHEMA,
    profileId: profile.profileId,
    profileSemanticHash: profile.semanticHash,
    interfaceSetSemanticHash: interfaceSet.semanticHash,
    interfaceRecoverySemanticHash: recovery.semanticHash,
    interfaceId: profile.interfaceId,
    loadCaseId: recovery.loadCaseId,
    reportingSignConvention: result.reportingSignConvention,
    units: recovery.units,
    forceLocal: result.forceLocal,
    momentAtReferenceLocal: result.momentAtReferenceLocal,
    termRatios,
    interactionRuleId: NOZZLE_INTERACTION_RULE,
    interactionValue,
    interactionLimit,
    utilization,
    governingTerm: governing,
    assessmentStatus,
    qualificationStatus: 'QUALIFIED_UNDER_CONFIGURED_PROFILE',
    limitations: [],
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = semanticHash(nozzleAssessmentSemanticProjection(draft));
  draft.evidenceHash = semanticHash({
    semanticHash: draft.semanticHash,
    sourceIdentity: profile.sourceIdentity,
    declaredAllowables: {
      force: profile.forceAllowables,
      moment: profile.momentAllowables,
      interactionLimit: profile.interactionLimit,
    },
  });
  return requireNozzleAllowableAssessment(draft);
}

function buildTermRatios(result, profile) {
  return deepFreeze({
    FX: Math.abs(result.forceLocal.x) / profile.forceAllowables.x.value,
    FY: Math.abs(result.forceLocal.y) / profile.forceAllowables.y.value,
    FZ: Math.abs(result.forceLocal.z) / profile.forceAllowables.z.value,
    MX: Math.abs(result.momentAtReferenceLocal.x) / profile.momentAllowables.x.value,
    MY: Math.abs(result.momentAtReferenceLocal.y) / profile.momentAllowables.y.value,
    MZ: Math.abs(result.momentAtReferenceLocal.z) / profile.momentAllowables.z.value,
  });
}

export function requireNozzleAllowableAssessment(record) {
  exactKeys(record, NOZZLE_ASSESSMENT_KEYS, 'nozzleAssessment');
  if (record.schema !== NOZZLE_ASSESSMENT_SCHEMA) {
    failCodeApplication('Nozzle assessment schema is invalid.', 'PIPING_NOZZLE_ASSESSMENT_INVALID');
  }
  nonEmptyString(record.profileId, 'nozzleAssessment.profileId');
  nonEmptyString(record.interfaceId, 'nozzleAssessment.interfaceId');
  nonEmptyString(record.loadCaseId, 'nozzleAssessment.loadCaseId');
  requireHash(record.profileSemanticHash, 'nozzleAssessment.profileSemanticHash');
  requireHash(record.interfaceSetSemanticHash, 'nozzleAssessment.interfaceSetSemanticHash');
  requireHash(record.interfaceRecoverySemanticHash, 'nozzleAssessment.interfaceRecoverySemanticHash');
  requireHash(record.semanticHash, 'nozzleAssessment.semanticHash');
  requireHash(record.evidenceHash, 'nozzleAssessment.evidenceHash');
  if (!NOZZLE_ASSESSMENT_STATUSES.includes(record.assessmentStatus)) {
    failCodeApplication('Nozzle assessment status is invalid.', 'PIPING_NOZZLE_ASSESSMENT_INVALID');
  }
  if (!CALCULATION_QUALIFICATION_STATUSES.includes(record.qualificationStatus)) {
    failCodeApplication('Nozzle qualification status is invalid.', 'PIPING_NOZZLE_ASSESSMENT_INVALID');
  }
  exactKeys(record.termRatios, TERM_IDS, 'nozzleAssessment.termRatios');
  for (const termId of TERM_IDS) {
    if (!Number.isFinite(record.termRatios[termId]) || record.termRatios[termId] < 0) {
      failCodeApplication('Nozzle term ratio is invalid.', 'PIPING_NOZZLE_ASSESSMENT_INVALID');
    }
  }
  if (!Number.isFinite(record.interactionValue)
    || !Number.isFinite(record.interactionLimit)
    || !Number.isFinite(record.utilization)
    || record.interactionLimit <= 0) {
    failCodeApplication('Nozzle interaction result is invalid.', 'PIPING_NOZZLE_ASSESSMENT_INVALID');
  }
  if (record.semanticHash !== semanticHash(nozzleAssessmentSemanticProjection(record))) {
    failCodeApplication('Nozzle assessment semantic hash is stale.', 'PIPING_NOZZLE_ASSESSMENT_HASH_MISMATCH');
  }
  return deepFreeze({ ...record });
}

export function nozzleAssessmentSemanticProjection(record) {
  const { semanticHash: _semanticHash, evidenceHash: _evidenceHash, ...projection } = record;
  return projection;
}
