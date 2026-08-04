import {
  assertBoolean,
  assertEnum,
  assertExactKeys,
  assertGitSha,
  assertHash,
  assertId,
  clonePlain,
  deepFreeze,
  sealWithHash,
  verifySealedHash,
} from './contracts.js';

export const QUALIFICATION_STATES = Object.freeze({
  UNREGISTERED: 'UNREGISTERED',
  CONTRACT_QUALIFIED: 'CONTRACT_QUALIFIED',
  SOLVER_BRIDGE_QUALIFIED: 'SOLVER_BRIDGE_QUALIFIED',
  SHELL_FORMULATION_QUALIFIED: 'SHELL_FORMULATION_QUALIFIED',
  CONTACT_PROCEDURE_QUALIFIED: 'CONTACT_PROCEDURE_QUALIFIED',
  ELASTIC_DENTING_PROCEDURE_QUALIFIED: 'ELASTIC_DENTING_PROCEDURE_QUALIFIED',
  PLASTIC_MATERIAL_QUALIFIED: 'PLASTIC_MATERIAL_QUALIFIED',
  PLASTIC_DENTING_PROCEDURE_QUALIFIED: 'PLASTIC_DENTING_PROCEDURE_QUALIFIED',
  MODULE_QUALIFIED: 'MODULE_QUALIFIED',
  PRODUCTION_EXECUTION_AUTHORIZED: 'PRODUCTION_EXECUTION_AUTHORIZED',
});

export const NC00_ALLOWED_TRANSITIONS = Object.freeze({
  [QUALIFICATION_STATES.UNREGISTERED]: [QUALIFICATION_STATES.CONTRACT_QUALIFIED],
  [QUALIFICATION_STATES.CONTRACT_QUALIFIED]: [QUALIFICATION_STATES.SOLVER_BRIDGE_QUALIFIED],
  [QUALIFICATION_STATES.SOLVER_BRIDGE_QUALIFIED]: [],
});

export const AUTHORITY_FALSE_FIELDS = Object.freeze([
  'shellFormulationQualified',
  'contactProcedureQualified',
  'elasticDentingProcedureQualified',
  'plasticMaterialQualified',
  'plasticDentingProcedureQualified',
  'codeAssessmentQualified',
  'moduleQualified',
  'productionExecutionAuthorized',
]);

export function createNc00AuthorityRecord({ programmeId, exactHeadSha, baseSha }) {
  assertId(programmeId, 'programmeId');
  assertGitSha(exactHeadSha, 'exactHeadSha');
  assertGitSha(baseSha, 'baseSha');
  return sealWithHash({
    schema: 'nonlinear-shell-contact-authority/v1',
    programmeId,
    exactHeadSha,
    baseSha,
    authorityState: QUALIFICATION_STATES.UNREGISTERED,
    transitionHistory: [],
  }, 'semanticHash');
}

export function advanceNc00Authority(record, nextState, evidence) {
  validateNc00AuthorityRecord(record);
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new TypeError('Authority transition evidence must be a plain object.');
  }
  const allowed = NC00_ALLOWED_TRANSITIONS[record.authorityState] ?? [];
  if (!allowed.includes(nextState)) {
    throw new TypeError(`Illegal NC-00 transition ${record.authorityState} -> ${nextState}.`);
  }
  if (nextState === QUALIFICATION_STATES.CONTRACT_QUALIFIED) {
    requireEvidenceFlags(evidence, [
      'contractsPass',
      'negativeControlsPass',
      'independentReconstructionPass',
      'deterministicDeckPass',
    ]);
  }
  if (nextState === QUALIFICATION_STATES.SOLVER_BRIDGE_QUALIFIED) {
    requireEvidenceFlags(evidence, [
      'approvedSolverProfile',
      'licenseReviewed',
      'externalExecutionOccurred',
      'positiveFixturesPass',
      'negativeControlsPass',
      'independentReconstructionPass',
      'deterministicReplayPass',
      'exactHeadCustodyPass',
    ]);
  }
  const transitionPayload = {
    fromState: record.authorityState,
    toState: nextState,
    evidence: clonePlain(evidence),
    previousRecordSemanticHash: record.semanticHash,
  };
  const transition = sealWithHash(transitionPayload, 'semanticHash');
  const payload = clonePlain(record);
  delete payload.semanticHash;
  payload.authorityState = nextState;
  payload.transitionHistory = [...payload.transitionHistory, transition];
  return sealWithHash(payload, 'semanticHash');
}

export function validateNc00AuthorityRecord(record) {
  assertExactKeys(record, [
    'schema',
    'programmeId',
    'exactHeadSha',
    'baseSha',
    'authorityState',
    'transitionHistory',
    'semanticHash',
  ], 'authorityRecord');
  if (record.schema !== 'nonlinear-shell-contact-authority/v1') {
    throw new TypeError('Unknown NC-00 authority schema.');
  }
  assertId(record.programmeId, 'authorityRecord.programmeId');
  assertGitSha(record.exactHeadSha, 'authorityRecord.exactHeadSha');
  assertGitSha(record.baseSha, 'authorityRecord.baseSha');
  assertEnum(record.authorityState, Object.values(QUALIFICATION_STATES), 'authorityRecord.authorityState');
  if (!Array.isArray(record.transitionHistory)) {
    throw new TypeError('authorityRecord.transitionHistory must be an array.');
  }
  let expectedState = QUALIFICATION_STATES.UNREGISTERED;
  record.transitionHistory.forEach((transition, index) => {
    verifySealedHash(transition, 'semanticHash', `authorityRecord.transitionHistory[${index}]`);
    if (transition.fromState !== expectedState) {
      throw new TypeError(`Authority transition history is discontinuous at index ${index}.`);
    }
    const allowed = NC00_ALLOWED_TRANSITIONS[transition.fromState] ?? [];
    if (!allowed.includes(transition.toState)) {
      throw new TypeError(`Authority transition history contains an NC-00 forbidden transition.`);
    }
    expectedState = transition.toState;
  });
  if (record.authorityState !== expectedState) {
    throw new TypeError('Authority state does not match transition history.');
  }
  verifySealedHash(record, 'semanticHash', 'authorityRecord');
  return true;
}

export function createAuthorityTable({
  contractQualified,
  solverBridgeQualified,
  nc01Authorized,
}) {
  [contractQualified, solverBridgeQualified, nc01Authorized].forEach((value, index) => {
    assertBoolean(value, ['contractQualified', 'solverBridgeQualified', 'nc01Authorized'][index]);
  });
  if (solverBridgeQualified && !contractQualified) {
    throw new TypeError('Solver bridge qualification requires contract qualification.');
  }
  if (nc01Authorized !== solverBridgeQualified) {
    throw new TypeError('NC-01 authorization must exactly follow solver bridge qualification.');
  }
  return deepFreeze({
    contractQualified,
    solverBridgeQualified,
    nc01Authorized,
    shellFormulationQualified: false,
    contactProcedureQualified: false,
    elasticDentingProcedureQualified: false,
    plasticMaterialQualified: false,
    plasticDentingProcedureQualified: false,
    codeAssessmentQualified: false,
    moduleQualified: false,
    productionExecutionAuthorized: false,
  });
}

export function validateAuthorityTable(authority) {
  assertExactKeys(authority, [
    'contractQualified',
    'solverBridgeQualified',
    'nc01Authorized',
    ...AUTHORITY_FALSE_FIELDS,
  ], 'authority');
  Object.entries(authority).forEach(([key, value]) => assertBoolean(value, `authority.${key}`));
  AUTHORITY_FALSE_FIELDS.forEach((field) => {
    if (authority[field] !== false) throw new TypeError(`${field} is forbidden in NC-00.`);
  });
  createAuthorityTable(authority);
  return true;
}

function requireEvidenceFlags(evidence, fields) {
  fields.forEach((field) => {
    if (evidence[field] !== true) {
      throw new TypeError(`Authority transition requires ${field}=true.`);
    }
  });
  if (Object.hasOwn(evidence, 'authorityState')) {
    throw new TypeError('Callers cannot supply an authority state as evidence.');
  }
  if (Object.hasOwn(evidence, 'semanticHash')) {
    assertHash(evidence.semanticHash, 'evidence.semanticHash');
  }
}
