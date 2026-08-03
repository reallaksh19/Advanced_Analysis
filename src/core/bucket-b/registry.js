export const BUCKET_B_SCHEMA = 'bucket-b-benchmark-registry/v1';
export const BUCKET_B_ENGINEERING_LEVEL = 'LINEAR_2D_CONTINUUM';

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
  SPECIFICATION_READY: 'SPECIFICATION_READY',
  EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES: 'EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES',
  FORMULATION_QUALIFIED: 'FORMULATION_QUALIFIED',
  APPLICATION_PROCEDURE_QUALIFIED: 'APPLICATION_PROCEDURE_QUALIFIED',
  NUMERICAL_OUTPUT_QUALIFIED: 'NUMERICAL_OUTPUT_QUALIFIED',
  CODE_ASSESSMENT_QUALIFIED: 'CODE_ASSESSMENT_QUALIFIED',
  MODULE_QUALIFIED: 'MODULE_QUALIFIED',
  BLOCKED_PENDING_AXISYMMETRIC_REGISTRATION: 'BLOCKED_PENDING_AXISYMMETRIC_REGISTRATION',
});

export const REQUIRED_BINDING_FIELDS = Object.freeze([
  'exactHeadSha',
  'geometryHash',
  'meshProfileHash',
  'meshHashesByLevel',
  'canonicalModelHashesByLevel',
  'solverPolicyHash',
  'loadIntegrationProfileHash',
  'recoveryProfileHash',
  'pathDefinitionHash',
  'referenceAuthorityHash',
  'observedEvidenceHashes',
  'stdoutHash',
  'stderrHash',
  'semanticHash',
]);

export const SHARED_PREREQUISITES = Object.freeze([
  'BKT-B-SH-Q8-PS-PATCH-001',
  'BKT-B-SH-Q8-PE-PATCH-001',
  'BKT-B-SH-Q8-DISTORTED-PATCH-001',
  'BKT-B-SH-Q8-CURVED-LOAD-001',
  'BKT-B-SH-Q8-MESH-QUALITY-001',
  'BKT-B-SH-Q8-RECOVERY-001',
  'BKT-B-SH-SCL-001',
  'BKT-B-SH-INTERFACE-001',
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
  return [moduleId, Object.freeze({
    moduleId,
    token,
    formulationProfile,
    elementProfile: axisymmetric ? ELEMENT_PROFILES.AXI_Q8_FULL_3X3 : ELEMENT_PROFILES.Q8_FULL_3X3,
    meshFamilyId: `BKT-B-${token}-Q8-MESH-FAMILY-V1`,
    recoveryProfileId: axisymmetric
      ? 'AXI_Q8_GAUSS_POINT_STRESS_RECOVERY_V1'
      : 'Q8_GAUSS_POINT_IN_PLANE_STRESS_RECOVERY_V1',
    loadIntegrationProfileId: axisymmetric
      ? 'AXI_Q8_FULL_CIRCUMFERENCE_LOAD_INTEGRATION_V1'
      : 'Q8_QUADRATIC_EDGE_GAUSS_3_LOAD_INTEGRATION_V1',
    requiredRecords: Object.freeze(['MESH', 'CORE', 'OUT'].map((kind) => `BKT-B-${token}-${kind}-001`)),
    initialState: axisymmetric
      ? QUALIFICATION_STATES.BLOCKED_PENDING_AXISYMMETRIC_REGISTRATION
      : QUALIFICATION_STATES.EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES,
    prerequisites: Object.freeze(axisymmetric
      ? [...SHARED_PREREQUISITES, 'AXI-Q8-REG-001-A', 'AXI-Q8-REG-001-B', 'AXI-Q8-REG-001-C']
      : [...SHARED_PREREQUISITES]),
  })];
})));

const STATE_ORDER = Object.freeze([
  QUALIFICATION_STATES.SPECIFICATION_READY,
  QUALIFICATION_STATES.EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES,
  QUALIFICATION_STATES.FORMULATION_QUALIFIED,
  QUALIFICATION_STATES.APPLICATION_PROCEDURE_QUALIFIED,
  QUALIFICATION_STATES.NUMERICAL_OUTPUT_QUALIFIED,
  QUALIFICATION_STATES.CODE_ASSESSMENT_QUALIFIED,
  QUALIFICATION_STATES.MODULE_QUALIFIED,
]);

export function createBenchmarkRecord({ moduleId, recordKind, bindings = {}, state } = {}) {
  const module = MODULE_REGISTRY[moduleId];
  if (!module) throw new TypeError(`Unknown Bucket B module: ${moduleId}`);
  if (!['MESH', 'CORE', 'OUT'].includes(recordKind)) throw new TypeError(`Unsupported record kind: ${recordKind}`);
  const recordId = `BKT-B-${module.token}-${recordKind}-001`;
  const record = {
    schema: BUCKET_B_SCHEMA,
    recordId,
    moduleId,
    recordKind,
    engineeringLevel: BUCKET_B_ENGINEERING_LEVEL,
    formulationProfile: module.formulationProfile,
    elementProfile: module.elementProfile,
    meshFamilyId: module.meshFamilyId,
    recoveryProfileId: module.recoveryProfileId,
    loadIntegrationProfileId: module.loadIntegrationProfileId,
    state: state ?? module.initialState,
    bindings: { ...bindings },
  };
  validateBenchmarkRecord(record, { allowIncompleteBindings: true });
  return deepFreeze(record);
}

export function validateBenchmarkRecord(record, { allowIncompleteBindings = false } = {}) {
  const module = MODULE_REGISTRY[record?.moduleId];
  if (!module) throw new TypeError('Benchmark record must reference a registered module.');
  if (record.formulationProfile !== module.formulationProfile) throw new TypeError('Formulation profile does not match module authority.');
  if (record.elementProfile !== module.elementProfile) throw new TypeError('Element profile does not match module authority.');
  if (record.moduleId === 'C2D-FLANGE-HUB' && !record.bindings?.axisymmetricRegistrationApprovalHash
    && record.state !== QUALIFICATION_STATES.BLOCKED_PENDING_AXISYMMETRIC_REGISTRATION) {
    throw new TypeError('C2D-FLANGE-HUB must remain blocked until axisymmetric registration approval is bound.');
  }
  if (!allowIncompleteBindings) {
    const missing = REQUIRED_BINDING_FIELDS.filter((field) => !isBound(record.bindings?.[field]));
    if (missing.length) throw new TypeError(`Missing mandatory benchmark bindings: ${missing.join(', ')}`);
  }
  if (record.bindings?.exactHeadSha && !/^[0-9a-f]{40}$/i.test(record.bindings.exactHeadSha)) {
    throw new TypeError('exactHeadSha must be a 40-character Git SHA.');
  }
  return true;
}

export function advanceQualificationState(record, nextState, evidence = {}) {
  validateBenchmarkRecord(record, { allowIncompleteBindings: true });
  if (record.moduleId === 'C2D-FLANGE-HUB' && !evidence.axisymmetricRegistrationApprovalHash) {
    throw new TypeError('Axisymmetric registration approval is required before advancing C2D-FLANGE-HUB.');
  }
  const currentIndex = STATE_ORDER.indexOf(record.state);
  const nextIndex = STATE_ORDER.indexOf(nextState);
  const axisymmetricRegistrationTransition = record.state === QUALIFICATION_STATES.BLOCKED_PENDING_AXISYMMETRIC_REGISTRATION
    && nextState === QUALIFICATION_STATES.FORMULATION_QUALIFIED
    && Boolean(evidence.axisymmetricRegistrationApprovalHash);
  if (!axisymmetricRegistrationTransition && (nextIndex < 0 || currentIndex < 0 || nextIndex !== currentIndex + 1)) {
    throw new TypeError(`Illegal qualification transition: ${record.state} -> ${nextState}`);
  }
  if (nextState === QUALIFICATION_STATES.MODULE_QUALIFIED) {
    const required = [
      QUALIFICATION_STATES.FORMULATION_QUALIFIED,
      QUALIFICATION_STATES.APPLICATION_PROCEDURE_QUALIFIED,
      QUALIFICATION_STATES.NUMERICAL_OUTPUT_QUALIFIED,
    ];
    const achieved = new Set(evidence.achievedStates ?? []);
    const missing = required.filter((stateName) => !achieved.has(stateName));
    if (missing.length) throw new TypeError(`MODULE_QUALIFIED requires achieved evidence for: ${missing.join(', ')}`);
  }
  return deepFreeze({ ...record, state: nextState, transitionEvidence: { ...evidence } });
}

function isBound(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return typeof value === 'string' ? value.length > 0 : value !== null && value !== undefined;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
