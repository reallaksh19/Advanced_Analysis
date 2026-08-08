import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';

export const CONTACT_FRICTION_EXECUTION_SCHEMA = 'fea-contact-friction-execution/v1';
export const CONTACT_FRICTION_POLICY_SCHEMA = 'fea-contact-friction-policy/v1';
export const CONTACT_FRICTION_STATE = Object.freeze({
  OPEN: 'OPEN',
  STICK: 'STICK',
  SLIP: 'SLIP',
});
export const CONTACT_FRICTION_CLASSIFICATION = Object.freeze({
  PHYSICAL_CONTACT: 'NONLINEAR_PHYSICAL_CONTACT',
  PHYSICAL_FRICTION: 'NONLINEAR_PHYSICAL_FRICTION',
  DERIVED: 'LINEAR_DERIVED_FROM_NONLINEAR_BASES',
});

export const DEFAULT_CONTACT_FRICTION_POLICY = Object.freeze({
  schema: CONTACT_FRICTION_POLICY_SCHEMA,
  forceTolerance: 1e-2,
  penetrationTolerance: 1e-9,
  directionCosineTolerance: 1e-8,
  maximumIterations: 64,
  maximumLineSearchSteps: 18,
  maximumExactStateCandidates: 81,
});

const TRANSLATION_DOFS = Object.freeze(['UX', 'UY', 'UZ']);
const STATE_VALUES = new Set(Object.values(CONTACT_FRICTION_STATE));

function fail(message, code = 'CONTACT_FRICTION_INVALID', details = {}) {
  const error = new TypeError(message);
  error.code = code;
  Object.assign(error, details);
  throw error;
}

function finite(value, field) {
  if (!Number.isFinite(value)) fail(`${field} must be finite.`);
  return Object.is(value, -0) ? 0 : value;
}

function nonNegative(value, field) {
  const accepted = finite(value, field);
  if (accepted < 0) fail(`${field} must be non-negative.`);
  return accepted;
}

function positive(value, field) {
  const accepted = finite(value, field);
  if (!(accepted > 0)) fail(`${field} must be positive.`);
  return accepted;
}

function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) fail(`${field} must be a positive integer.`);
  return value;
}

function identity(value, field) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${field} must be a non-empty string.`);
  return value;
}

function dof(value, field) {
  if (!TRANSLATION_DOFS.includes(value)) fail(`${field} must be UX, UY, or UZ.`);
  return value;
}

function normalizeTangentDofs(values, normalDof, field) {
  if (!Array.isArray(values) || values.length !== 2) fail(`${field} must contain exactly two translational DOFs.`);
  const accepted = values.map((value, index) => dof(value, `${field}[${index}]`));
  if (new Set(accepted).size !== 2 || accepted.includes(normalDof)) {
    fail(`${field} must contain the two distinct translational DOFs tangent to normalDof.`);
  }
  return Object.freeze([...accepted]);
}

export function requireContactFrictionDeclaration(value, field = 'contact') {
  if (!isPlainRecord(value)) fail(`${field} must be a plain record.`);
  const declarationId = identity(value.declarationId, `${field}.declarationId`);
  const nodeId = identity(value.nodeId, `${field}.nodeId`);
  const normalDof = dof(value.normalDof, `${field}.normalDof`);
  const normalSense = finite(value.normalSense, `${field}.normalSense`);
  if (normalSense !== 1 && normalSense !== -1) fail(`${field}.normalSense must be +1 or -1.`);
  const tangentDofs = normalizeTangentDofs(value.tangentDofs, normalDof, `${field}.tangentDofs`);
  const gap = nonNegative(value.gap ?? 0, `${field}.gap`);
  const frictionCoefficient = nonNegative(value.frictionCoefficient ?? 0, `${field}.frictionCoefficient`);
  const frictionStiffness = frictionCoefficient === 0
    ? nonNegative(value.frictionStiffness ?? 0, `${field}.frictionStiffness`)
    : positive(value.frictionStiffness, `${field}.frictionStiffness`);
  const initialState = value.initialState ?? CONTACT_FRICTION_STATE.STICK;
  if (!STATE_VALUES.has(initialState)) fail(`${field}.initialState is unsupported.`);
  if (frictionCoefficient === 0 && initialState === CONTACT_FRICTION_STATE.SLIP) {
    fail(`${field}.initialState cannot be SLIP when frictionCoefficient is zero.`);
  }
  return deepFreeze({
    declarationId,
    nodeId,
    normalDof,
    normalSense,
    tangentDofs,
    gap,
    frictionCoefficient,
    frictionStiffness,
    initialState,
  });
}

export function normalizeContactFrictionDeclarations(values) {
  if (!Array.isArray(values)) fail('contacts must be an array.');
  const normalized = values.map((value, index) => requireContactFrictionDeclaration(value, `contacts[${index}]`));
  normalized.sort((a, b) => a.declarationId < b.declarationId ? -1 : a.declarationId > b.declarationId ? 1 : 0);
  const seen = new Set();
  for (const row of normalized) {
    if (seen.has(row.declarationId)) fail(`Duplicate declarationId ${row.declarationId}.`, 'CONTACT_FRICTION_DECLARATION_DUPLICATE');
    seen.add(row.declarationId);
  }
  return deepFreeze(normalized);
}

export function resolveContactFrictionPolicy(value, contactCount) {
  const source = value ?? DEFAULT_CONTACT_FRICTION_POLICY;
  if (!isPlainRecord(source)) fail('policy must be a plain record.');
  if (source.schema !== undefined && source.schema !== CONTACT_FRICTION_POLICY_SCHEMA) {
    fail(`policy.schema must be ${CONTACT_FRICTION_POLICY_SCHEMA}.`);
  }
  const forceTolerance = nonNegative(source.forceTolerance ?? DEFAULT_CONTACT_FRICTION_POLICY.forceTolerance, 'policy.forceTolerance');
  const penetrationTolerance = nonNegative(source.penetrationTolerance ?? DEFAULT_CONTACT_FRICTION_POLICY.penetrationTolerance, 'policy.penetrationTolerance');
  const directionCosineTolerance = nonNegative(source.directionCosineTolerance ?? DEFAULT_CONTACT_FRICTION_POLICY.directionCosineTolerance, 'policy.directionCosineTolerance');
  const maximumIterations = positiveInteger(
    source.maximumIterations ?? Math.max(DEFAULT_CONTACT_FRICTION_POLICY.maximumIterations, 4 * Math.max(1, contactCount)),
    'policy.maximumIterations',
  );
  const maximumLineSearchSteps = positiveInteger(
    source.maximumLineSearchSteps ?? DEFAULT_CONTACT_FRICTION_POLICY.maximumLineSearchSteps,
    'policy.maximumLineSearchSteps',
  );
  const maximumExactStateCandidates = positiveInteger(
    source.maximumExactStateCandidates ?? DEFAULT_CONTACT_FRICTION_POLICY.maximumExactStateCandidates,
    'policy.maximumExactStateCandidates',
  );
  return deepFreeze({
    schema: CONTACT_FRICTION_POLICY_SCHEMA,
    forceTolerance,
    penetrationTolerance,
    directionCosineTolerance,
    maximumIterations,
    maximumLineSearchSteps,
    maximumExactStateCandidates,
  });
}

export function contactFrictionExecutionSemanticProjection(record) {
  return {
    schema: record.schema,
    classification: record.classification,
    policy: record.policy,
    contacts: record.contacts,
    selectedState: record.selectedState,
    history: record.history,
    qualification: record.qualification,
    finalExecutionHash: record.finalExecutionHash,
    constitutiveResidualInfinityNorm: record.constitutiveResidualInfinityNorm,
  };
}

export function computeContactFrictionExecutionSemanticHash(record) {
  return semanticHash(contactFrictionExecutionSemanticProjection(record));
}

function requireQualification(value) {
  if (!isPlainRecord(value)) fail('execution.qualification must be a plain record.');
  if (value.schema !== 'fea-contact-friction-uniqueness-proof/v1') fail('execution.qualification schema is unsupported.');
  if (value.method !== 'EXACT_DISCRETE_STATE_ENUMERATION_V1') fail('execution.qualification method is unsupported.');
  if (value.uniqueAdmissibleStateProven !== true || value.admissibleCandidateCount !== 1) {
    fail('execution requires exactly one proven admissible state.', 'CONTACT_FRICTION_UNIQUENESS_NOT_PROVEN');
  }
  positiveInteger(value.candidateStateCount, 'execution.qualification.candidateStateCount');
  positiveInteger(value.evaluatedCandidateCount, 'execution.qualification.evaluatedCandidateCount');
  identity(value.selectedStateSignature, 'execution.qualification.selectedStateSignature');
  return value;
}

export function sealContactFrictionExecution(record) {
  if (!isPlainRecord(record)) fail('contact-friction execution must be a plain record.');
  if (record.schema !== CONTACT_FRICTION_EXECUTION_SCHEMA) fail(`execution.schema must be ${CONTACT_FRICTION_EXECUTION_SCHEMA}.`);
  if (![CONTACT_FRICTION_CLASSIFICATION.PHYSICAL_CONTACT, CONTACT_FRICTION_CLASSIFICATION.PHYSICAL_FRICTION].includes(record.classification)) {
    fail('execution.classification must be a nonlinear physical-case classification.');
  }
  if (!Array.isArray(record.history) || record.history.length < 1) fail('execution.history must contain at least one iteration.');
  if (!Array.isArray(record.selectedState)) fail('execution.selectedState must be an array.');
  requireQualification(record.qualification);
  const finalExecutionHash = identity(record.finalExecutionHash, 'execution.finalExecutionHash');
  if (!record.finalExecution || record.finalExecution.semanticHash !== finalExecutionHash) {
    fail('execution.finalExecution must match finalExecutionHash.');
  }
  finite(record.constitutiveResidualInfinityNorm, 'execution.constitutiveResidualInfinityNorm');
  const semanticHashValue = computeContactFrictionExecutionSemanticHash(record);
  if (record.semanticHash !== undefined && record.semanticHash !== semanticHashValue) {
    fail('execution.semanticHash is stale.', 'CONTACT_FRICTION_HASH_MISMATCH');
  }
  return deepFreeze({ ...record, semanticHash: semanticHashValue });
}

export function failContactFriction(message, code, details = {}) {
  fail(message, code, details);
}
