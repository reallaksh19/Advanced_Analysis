import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';

export const BUCKET_B_SCHEMA = 'bucket-b-benchmark-registry/v2';
export const BUCKET_B_ENGINEERING_LEVEL = 'LINEAR_2D_CONTINUUM';
export const SHARED_GATE_RECEIPT_SCHEMA = 'bucket-b-shared-gate-qualification-receipt/v2';

export const FORMULATION_PROFILES = Object.freeze({
  PLANE_STRESS: 'PLANE_STRESS',
  PLANE_STRAIN: 'PLANE_STRAIN',
  AXISYMMETRIC: 'AXISYMMETRIC',
});
export const ELEMENT_PROFILES = Object.freeze({
  T6_PROBE_STABLE_V2: 'T6_PROBE_STABLE_V2',
  Q8_FULL_3X3: 'Q8_FULL_3X3',
  AXI_Q8_FULL_3X3: 'AXI_Q8_FULL_3X3',
});
export const QUALIFICATION_STATES = Object.freeze({
  EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES: 'EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES',
  FORMULATION_QUALIFIED: 'FORMULATION_QUALIFIED',
  APPLICATION_PROCEDURE_QUALIFIED: 'APPLICATION_PROCEDURE_QUALIFIED',
  NUMERICAL_OUTPUT_QUALIFIED: 'NUMERICAL_OUTPUT_QUALIFIED',
  CODE_ASSESSMENT_QUALIFIED: 'CODE_ASSESSMENT_QUALIFIED',
  MODULE_QUALIFIED: 'MODULE_QUALIFIED',
  BLOCKED_PENDING_AXISYMMETRIC_REGISTRATION: 'BLOCKED_PENDING_AXISYMMETRIC_REGISTRATION',
});
export const REQUIRED_BINDING_FIELDS = Object.freeze([
  'exactHeadSha', 'geometryHash', 'meshProfileHash', 'meshHashesByLevel',
  'canonicalModelHashesByLevel', 'solverPolicyHash', 'loadIntegrationProfileHash',
  'recoveryProfileHash', 'pathDefinitionHash', 'referenceAuthorityHash',
  'observedEvidenceHashes', 'stdoutHash', 'stderrHash',
]);
export const SHARED_PREREQUISITES = Object.freeze([
  'BKT-B-SH-Q8-PS-PATCH-001', 'BKT-B-SH-Q8-PE-PATCH-001',
  'BKT-B-SH-Q8-DISTORTED-PATCH-001', 'BKT-B-SH-Q8-CURVED-LOAD-001',
  'BKT-B-SH-Q8-MESH-QUALITY-001', 'BKT-B-SH-Q8-RECOVERY-001',
  'BKT-B-SH-SCL-001', 'BKT-B-SH-INTERFACE-001',
]);

const MODULE_ROWS = [
  ['C2D-LUG-PINHOLE', 'LUG', FORMULATION_PROFILES.PLANE_STRESS],
  ['C2D-CLAMP-EAR', 'CLAMP', FORMULATION_PROFILES.PLANE_STRESS],
  ['C2D-BRACKET-GUSSET', 'BRACKET', FORMULATION_PROFILES.PLANE_STRESS],
  ['C2D-PIPE-PAD-SECTION', 'PIPEPAD', FORMULATION_PROFILES.PLANE_STRAIN],
  ['C2D-NOZZLE-REPAD-SECTION', 'NOZREP', FORMULATION_PROFILES.PLANE_STRAIN],
  ['C2D-FLANGE-HUB', 'FLANGE', FORMULATION_PROFILES.AXISYMMETRIC],
];
export const MODULE_REGISTRY = Object.freeze(Object.fromEntries(MODULE_ROWS.map(([moduleId, token, formulationProfile]) => {
  const axisymmetric = formulationProfile === FORMULATION_PROFILES.AXISYMMETRIC;
  return [moduleId, deepFreeze({
    moduleId, token, formulationProfile,
    elementProfile: axisymmetric ? ELEMENT_PROFILES.AXI_Q8_FULL_3X3 : ELEMENT_PROFILES.Q8_FULL_3X3,
    meshFamilyId: `BKT-B-${token}-Q8-MESH-FAMILY-V1`,
    recoveryProfileId: axisymmetric ? 'AXI_Q8_GAUSS_POINT_STRESS_RECOVERY_V1' : 'Q8_GAUSS_POINT_IN_PLANE_STRESS_RECOVERY_V1',
    loadIntegrationProfileId: axisymmetric ? 'AXI_Q8_FULL_CIRCUMFERENCE_LOAD_INTEGRATION_V1' : 'Q8_QUADRATIC_EDGE_GAUSS_3_LOAD_INTEGRATION_V1',
    requiredRecords: ['MESH', 'CORE', 'OUT'].map((kind) => `BKT-B-${token}-${kind}-001`),
    initialState: axisymmetric ? QUALIFICATION_STATES.BLOCKED_PENDING_AXISYMMETRIC_REGISTRATION : QUALIFICATION_STATES.EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES,
    prerequisites: axisymmetric ? [...SHARED_PREREQUISITES, 'AXI-Q8-REG-001-A', 'AXI-Q8-REG-001-B', 'AXI-Q8-REG-001-C'] : [...SHARED_PREREQUISITES],
  })];
})));

export function createBenchmarkRecord(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Benchmark record input must be an object.');
  if (Object.prototype.hasOwnProperty.call(input, 'state')) throw new TypeError('Benchmark record state is authority-controlled and cannot be supplied by the caller.');
  const { moduleId, recordKind, bindings = {} } = input;
  const module = requireModule(moduleId);
  if (!['MESH', 'CORE', 'OUT'].includes(recordKind)) throw new TypeError(`Unsupported record kind: ${recordKind}`);
  const payload = {
    schema: BUCKET_B_SCHEMA,
    recordId: `BKT-B-${module.token}-${recordKind}-001`,
    moduleId, recordKind,
    engineeringLevel: BUCKET_B_ENGINEERING_LEVEL,
    formulationProfile: module.formulationProfile,
    elementProfile: module.elementProfile,
    meshFamilyId: module.meshFamilyId,
    recoveryProfileId: module.recoveryProfileId,
    loadIntegrationProfileId: module.loadIntegrationProfileId,
    state: module.initialState,
    bindings: clone(bindings),
    transitionHistory: [],
  };
  return sealRecord(payload);
}

export function validateBenchmarkRecord(record, { allowIncompleteBindings = false } = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError('Benchmark record must be an object.');
  const module = requireModule(record.moduleId);
  const expectedId = `BKT-B-${module.token}-${record.recordKind}-001`;
  if (record.schema !== BUCKET_B_SCHEMA || record.recordId !== expectedId) throw new TypeError('Benchmark record schema or identity mismatch.');
  if (record.engineeringLevel !== BUCKET_B_ENGINEERING_LEVEL) throw new TypeError('Engineering level does not match Bucket B authority.');
  if (record.formulationProfile !== module.formulationProfile) throw new TypeError('Formulation profile does not match module authority.');
  if (record.elementProfile !== module.elementProfile) throw new TypeError('Element profile does not match module authority.');
  if (record.meshFamilyId !== module.meshFamilyId || record.recoveryProfileId !== module.recoveryProfileId || record.loadIntegrationProfileId !== module.loadIntegrationProfileId) throw new TypeError('Registered profile identity mismatch.');
  verifyRecordHash(record);
  validateTransitionHistory(record.transitionHistory ?? []);
  if (record.moduleId === 'C2D-FLANGE-HUB' && record.state !== QUALIFICATION_STATES.BLOCKED_PENDING_AXISYMMETRIC_REGISTRATION && !isHash(record.bindings?.axisymmetricRegistrationApprovalHash)) {
    throw new TypeError('C2D-FLANGE-HUB must remain blocked until an axisymmetric registration approval hash is bound.');
  }
  validateBindings(record.bindings ?? {}, allowIncompleteBindings);
  return true;
}

export function advanceQualificationState(record, nextState, evidence = {}) {
  validateBenchmarkRecord(record, { allowIncompleteBindings: true });
  const allowed = allowedNextStates(record.state, evidence);
  if (!allowed.includes(nextState)) throw new TypeError(`Illegal qualification transition: ${record.state} -> ${nextState}`);
  if (record.state === QUALIFICATION_STATES.EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES) validateSharedGateReceipt(evidence.sharedGateQualificationReceipt, record.bindings?.exactHeadSha);
  if (record.state === QUALIFICATION_STATES.BLOCKED_PENDING_AXISYMMETRIC_REGISTRATION && !isHash(evidence.axisymmetricRegistrationApprovalHash)) throw new TypeError('Axisymmetric registration approval hash is required.');
  if (nextState === QUALIFICATION_STATES.MODULE_QUALIFIED) {
    const required = [QUALIFICATION_STATES.FORMULATION_QUALIFIED, QUALIFICATION_STATES.APPLICATION_PROCEDURE_QUALIFIED, QUALIFICATION_STATES.NUMERICAL_OUTPUT_QUALIFIED];
    const achieved = new Set((record.transitionHistory ?? []).map((row) => row.toState));
    required.forEach((state) => { if (!achieved.has(state) && record.state !== state) throw new TypeError(`MODULE_QUALIFIED requires achieved state ${state}.`); });
    if (evidence.codeAssessmentRequired === true && record.state !== QUALIFICATION_STATES.CODE_ASSESSMENT_QUALIFIED) throw new TypeError('Required code assessment has not been qualified.');
  }
  const transitionPayload = { fromState: record.state, toState: nextState, evidence: clone(evidence), previousRecordSemanticHash: record.semanticHash };
  const transition = deepFreeze({ ...transitionPayload, semanticHash: semanticHash(transitionPayload) });
  const payload = clone(record);
  delete payload.semanticHash;
  payload.state = nextState;
  payload.transitionHistory = [...record.transitionHistory, transition];
  if (evidence.axisymmetricRegistrationApprovalHash) payload.bindings.axisymmetricRegistrationApprovalHash = evidence.axisymmetricRegistrationApprovalHash;
  if (evidence.sharedGateQualificationReceipt?.semanticHash) payload.bindings.sharedGateQualificationReceiptHash = evidence.sharedGateQualificationReceipt.semanticHash;
  return sealRecord(payload);
}

function allowedNextStates(state, evidence) {
  if (state === QUALIFICATION_STATES.EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES || state === QUALIFICATION_STATES.BLOCKED_PENDING_AXISYMMETRIC_REGISTRATION) return [QUALIFICATION_STATES.FORMULATION_QUALIFIED];
  if (state === QUALIFICATION_STATES.FORMULATION_QUALIFIED) return [QUALIFICATION_STATES.APPLICATION_PROCEDURE_QUALIFIED];
  if (state === QUALIFICATION_STATES.APPLICATION_PROCEDURE_QUALIFIED) return [QUALIFICATION_STATES.NUMERICAL_OUTPUT_QUALIFIED];
  if (state === QUALIFICATION_STATES.NUMERICAL_OUTPUT_QUALIFIED) return evidence.codeAssessmentRequired === true ? [QUALIFICATION_STATES.CODE_ASSESSMENT_QUALIFIED] : [QUALIFICATION_STATES.MODULE_QUALIFIED, QUALIFICATION_STATES.CODE_ASSESSMENT_QUALIFIED];
  if (state === QUALIFICATION_STATES.CODE_ASSESSMENT_QUALIFIED) return [QUALIFICATION_STATES.MODULE_QUALIFIED];
  return [];
}
function validateBindings(bindings, allowIncomplete) {
  if (bindings.semanticHash !== undefined) throw new TypeError('bindings.semanticHash is forbidden; record semanticHash is computed internally.');
  if (bindings.exactHeadSha !== undefined && !isGitSha(bindings.exactHeadSha)) throw new TypeError('exactHeadSha must be a 40-character Git SHA.');
  for (const [key, value] of Object.entries(bindings)) {
    if (key === 'exactHeadSha') continue;
    if (key.endsWith('HashesByLevel') || key === 'observedEvidenceHashes') {
      if (!Array.isArray(value) || value.length === 0 || !value.every(isHash)) throw new TypeError(`${key} must be a nonempty array of governed hashes.`);
    } else if (key.endsWith('Hash') && !isHash(value)) throw new TypeError(`${key} must be a governed hash.`);
  }
  if (!allowIncomplete) {
    const missing = REQUIRED_BINDING_FIELDS.filter((field) => bindings[field] === undefined);
    if (missing.length) throw new TypeError(`Missing mandatory benchmark bindings: ${missing.join(', ')}`);
  }
}
function validateTransitionHistory(history) {
  if (!Array.isArray(history)) throw new TypeError('transitionHistory must be an array.');
  history.forEach((row, index) => {
    if (!row || semanticHash(withoutHash(row)) !== row.semanticHash) throw new TypeError(`Invalid transition semantic hash at index ${index}.`);
    if (index > 0 && row.previousRecordSemanticHash !== undefined && !isHash(row.previousRecordSemanticHash)) throw new TypeError(`Invalid previous record hash at transition ${index}.`);
  });
}
function validateSharedGateReceipt(receipt, expectedHeadSha) {
  if (!receipt || receipt.schema !== SHARED_GATE_RECEIPT_SCHEMA || receipt.status !== 'SHARED_Q8_GATES_QUALIFIED' || receipt.bb06Authorized !== true) throw new TypeError('A qualified Bucket B shared-gate v2 receipt is required.');
  if (expectedHeadSha && receipt.exactHeadSha !== expectedHeadSha) throw new TypeError('Shared-gate receipt exact head does not match the application record exact head.');
  if (semanticHash(withoutHash(receipt)) !== receipt.semanticHash) throw new TypeError('Shared-gate receipt semantic hash mismatch.');
  if (receipt.independentCheckerEvidence?.status !== 'PASS') throw new TypeError('Independent checker evidence must pass.');
}
function verifyRecordHash(record) { if (semanticHash(withoutHash(record)) !== record.semanticHash) throw new TypeError('Benchmark record semantic hash mismatch.'); }
function sealRecord(payload) { const clean = clone(payload); delete clean.semanticHash; return deepFreeze({ ...clean, semanticHash: semanticHash(clean) }); }
function withoutHash(value) { const copy = clone(value); delete copy.semanticHash; return copy; }
function requireModule(moduleId) { const module = MODULE_REGISTRY[moduleId]; if (!module) throw new TypeError(`Unknown Bucket B module: ${moduleId}`); return module; }
function isGitSha(value) { return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value); }
function isHash(value) { return typeof value === 'string' && /^(?:sha256:[0-9a-f]{64}|fnv1a64:[0-9a-f]{16})$/i.test(value); }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
